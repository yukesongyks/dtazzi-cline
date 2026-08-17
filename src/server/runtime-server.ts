import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";

import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { handleClineMcpOauthCallback } from "../cline-sdk/cline-mcp-runtime-service";
import { createClineProviderService } from "../cline-sdk/cline-provider-service";
import { createKanbanClineLogger } from "../cline-sdk/cline-runtime-logger";
import {
	type ClineTaskSessionService,
	createInMemoryClineTaskSessionService,
} from "../cline-sdk/cline-task-session-service";
import { createClineWatcherRegistry } from "../cline-sdk/cline-watcher-registry";
import type {
	RuntimeBoardCard,
	RuntimeCommandRunResponse,
	RuntimeRunUpdateResponse,
	RuntimeUpdateStatusResponse,
	RuntimeWorkspaceStateResponse,
} from "../core/api-contract";
import { isHomeAgentSessionId } from "../core/home-agent-session";
import {
	buildKanbanRuntimeUrl,
	getKanbanRuntimeHost,
	getKanbanRuntimeOrigin,
	getKanbanRuntimePort,
	getKanbanRuntimeTls,
	isKanbanRemoteHost,
} from "../core/runtime-endpoint";
import { resolveTaskTitle } from "../core/task-title.js";
import {
	checkRateLimit,
	clearRateLimit,
	disablePasscode,
	extractBearerToken,
	extractSessionTokenFromCookie,
	generateInternalToken,
	generatePasscode,
	getInternalToken,
	isPasscodeEnabled,
	issueSession,
	recordFailedAttempt,
	setCustomPasscode,
	validateInternalToken,
	validatePasscode,
	validateSession,
} from "../security/passcode-manager";
import { loadWorkspaceContextById } from "../state/workspace-state";
import { resolveAgentCommand } from "../terminal/agent-registry";
import type { TerminalSessionManager } from "../terminal/session-manager";
import { createTerminalWebSocketBridge } from "../terminal/ws-server";
import { type RuntimeTrpcContext, type RuntimeTrpcWorkspaceScope, runtimeAppRouter } from "../trpc/app-router";
import { createHooksApi } from "../trpc/hooks-api";
import { createProjectsApi } from "../trpc/projects-api";
import { createRuntimeApi } from "../trpc/runtime-api";
import { createWorkspaceApi } from "../trpc/workspace-api";
import { resolveTaskCwd } from "../workspace/task-worktree";
import { getWebUiDir, normalizeRequestPath, readAsset } from "./assets";
import { handleHttpRequest, handleSocketUpgrade } from "./middleware";
import type { RuntimeStateHub } from "./runtime-state-hub";
import { createScheduledTaskExecutor } from "./scheduled-task-executor";
import { createAutoCrScanner } from "./auto-cr-scanner";
import { listAntcodePullRequests, resolveAntcodeProjectContext } from "../trpc/runtime-api";
import { loadGlobalRuntimeConfig } from "../config/runtime-config";
import type { WorkspaceRegistry } from "./workspace-registry";

interface DisposeTrackedWorkspaceResult {
	terminalManager: TerminalSessionManager | null;
	workspacePath: string | null;
}

export interface CreateRuntimeServerDependencies {
	workspaceRegistry: WorkspaceRegistry;
	runtimeStateHub: RuntimeStateHub;
	warn: (message: string) => void;
	ensureTerminalManagerForWorkspace: (workspaceId: string, repoPath: string) => Promise<TerminalSessionManager>;
	resolveInteractiveShellCommand: () => { binary: string; args: string[] };
	runCommand: (command: string, cwd: string) => Promise<RuntimeCommandRunResponse>;
	resolveProjectInputPath: (inputPath: string, basePath: string) => string;
	assertPathIsDirectory: (targetPath: string) => Promise<void>;
	hasGitRepository: (path: string) => boolean;
	disposeWorkspace: (
		workspaceId: string,
		options?: {
			stopTerminalSessions?: boolean;
		},
	) => DisposeTrackedWorkspaceResult;
	collectProjectWorktreeTaskIdsForRemoval: (board: RuntimeWorkspaceStateResponse["board"]) => Set<string>;
	pickDirectoryPathFromSystemDialog: () => string | null;
	getUpdateStatus: () => RuntimeUpdateStatusResponse;
	runUpdateNow: () => Promise<RuntimeRunUpdateResponse>;
}

export interface RuntimeServer {
	url: string;
	close: () => Promise<void>;
}

function readWorkspaceIdFromRequest(request: IncomingMessage, requestUrl: URL): string | null {
	const headerValue = request.headers["x-kanban-workspace-id"];
	const headerWorkspaceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
	if (typeof headerWorkspaceId === "string") {
		const normalized = headerWorkspaceId.trim();
		if (normalized) {
			return normalized;
		}
	}
	const queryWorkspaceId = requestUrl.searchParams.get("workspaceId");
	if (typeof queryWorkspaceId === "string") {
		const normalized = queryWorkspaceId.trim();
		if (normalized) {
			return normalized;
		}
	}
	return null;
}

export async function createRuntimeServer(deps: CreateRuntimeServerDependencies): Promise<RuntimeServer> {
	const LOGGER = createKanbanClineLogger({ component: "runtime-server" });
	const webUiDir = getWebUiDir();

	try {
		await readFile(join(webUiDir, "index.html"));
	} catch {
		throw new Error("Could not find web UI assets. Run `npm run build` to generate and package the web UI.");
	}

	const resolveWorkspaceScopeFromRequest = async (
		request: IncomingMessage,
		requestUrl: URL,
	): Promise<{
		requestedWorkspaceId: string | null;
		workspaceScope: RuntimeTrpcWorkspaceScope | null;
	}> => {
		const requestedWorkspaceId = readWorkspaceIdFromRequest(request, requestUrl);
		if (!requestedWorkspaceId) {
			return {
				requestedWorkspaceId: null,
				workspaceScope: null,
			};
		}
		const requestedWorkspaceContext = await loadWorkspaceContextById(requestedWorkspaceId);
		if (!requestedWorkspaceContext) {
			return {
				requestedWorkspaceId,
				workspaceScope: null,
			};
		}
		return {
			requestedWorkspaceId,
			workspaceScope: {
				workspaceId: requestedWorkspaceContext.workspaceId,
				workspacePath: requestedWorkspaceContext.repoPath,
			},
		};
	};

	const getScopedTerminalManager = async (scope: RuntimeTrpcWorkspaceScope): Promise<TerminalSessionManager> =>
		await deps.ensureTerminalManagerForWorkspace(scope.workspaceId, scope.workspacePath);
	const clineTaskSessionServiceByWorkspaceId = new Map<string, ClineTaskSessionService>();
	const clineWatcherRegistry = createClineWatcherRegistry();
	const getScopedClineTaskSessionService = async (
		scope: RuntimeTrpcWorkspaceScope,
	): Promise<ClineTaskSessionService> => {
		let service = clineTaskSessionServiceByWorkspaceId.get(scope.workspaceId);
		if (!service) {
			service = createInMemoryClineTaskSessionService({
				watcherRegistry: clineWatcherRegistry,
			});
			clineTaskSessionServiceByWorkspaceId.set(scope.workspaceId, service);
			deps.runtimeStateHub.trackClineTaskSessionService(scope.workspaceId, scope.workspacePath, service);
		}
		return service;
	};
	const disposeClineTaskSessionServiceAsync = async (workspaceId: string): Promise<void> => {
		const service = clineTaskSessionServiceByWorkspaceId.get(workspaceId);
		if (!service) {
			return;
		}
		clineTaskSessionServiceByWorkspaceId.delete(workspaceId);
		await service.dispose();
	};
	const disposeClineTaskSessionService = (workspaceId: string): void => {
		void disposeClineTaskSessionServiceAsync(workspaceId);
	};
	const prepareForStateReset = async (): Promise<void> => {
		const workspaceIds = new Set<string>();
		for (const { workspaceId } of deps.workspaceRegistry.listManagedWorkspaces()) {
			workspaceIds.add(workspaceId);
		}
		for (const workspaceId of clineTaskSessionServiceByWorkspaceId.keys()) {
			workspaceIds.add(workspaceId);
		}
		const activeWorkspaceId = deps.workspaceRegistry.getActiveWorkspaceId();
		if (activeWorkspaceId) {
			workspaceIds.add(activeWorkspaceId);
		}
		await Promise.all(
			Array.from(workspaceIds).map(async (workspaceId) => {
				await disposeClineTaskSessionServiceAsync(workspaceId);
				deps.disposeWorkspace(workspaceId, {
					stopTerminalSessions: true,
				});
			}),
		);
		deps.workspaceRegistry.clearActiveWorkspace();
	};

	const createTrpcContext = async (req: IncomingMessage): Promise<RuntimeTrpcContext> => {
		const requestUrl = new URL(req.url ?? "/", "http://localhost");
		const scope = await resolveWorkspaceScopeFromRequest(req, requestUrl);
		return {
			requestedWorkspaceId: scope.requestedWorkspaceId,
			workspaceScope: scope.workspaceScope,
			runtimeApi: createRuntimeApi({
				getActiveWorkspaceId: deps.workspaceRegistry.getActiveWorkspaceId,
				getActiveRuntimeConfig: deps.workspaceRegistry.getActiveRuntimeConfig,
				loadScopedRuntimeConfig: deps.workspaceRegistry.loadScopedRuntimeConfig,
				setActiveRuntimeConfig: deps.workspaceRegistry.setActiveRuntimeConfig,
				getScopedTerminalManager,
				getScopedClineTaskSessionService,
				resolveInteractiveShellCommand: deps.resolveInteractiveShellCommand,
				runCommand: deps.runCommand,
				broadcastClineMcpAuthStatusesUpdated: deps.runtimeStateHub.broadcastClineMcpAuthStatusesUpdated,
				broadcastTaskChatCleared: deps.runtimeStateHub.broadcastTaskChatCleared,
				bumpClineSessionContextVersion: deps.runtimeStateHub.bumpClineSessionContextVersion,
				prepareForStateReset,
				getUpdateStatus: deps.getUpdateStatus,
				runUpdateNow: deps.runUpdateNow,
			}),
			workspaceApi: createWorkspaceApi({
				ensureTerminalManagerForWorkspace: deps.ensureTerminalManagerForWorkspace,
				getScopedClineTaskSessionService,
				broadcastRuntimeWorkspaceStateUpdated: deps.runtimeStateHub.broadcastRuntimeWorkspaceStateUpdated,
				broadcastRuntimeProjectsUpdated: deps.runtimeStateHub.broadcastRuntimeProjectsUpdated,
				buildWorkspaceStateSnapshot: deps.workspaceRegistry.buildWorkspaceStateSnapshot,
			}),
			projectsApi: createProjectsApi({
				getActiveWorkspacePath: deps.workspaceRegistry.getActiveWorkspacePath,
				getActiveWorkspaceId: deps.workspaceRegistry.getActiveWorkspaceId,
				rememberWorkspace: deps.workspaceRegistry.rememberWorkspace,
				setActiveWorkspace: deps.workspaceRegistry.setActiveWorkspace,
				clearActiveWorkspace: deps.workspaceRegistry.clearActiveWorkspace,
				resolveProjectInputPath: deps.resolveProjectInputPath,
				assertPathIsDirectory: deps.assertPathIsDirectory,
				hasGitRepository: deps.hasGitRepository,
				summarizeProjectTaskCounts: deps.workspaceRegistry.summarizeProjectTaskCounts,
				createProjectSummary: deps.workspaceRegistry.createProjectSummary,
				broadcastRuntimeProjectsUpdated: deps.runtimeStateHub.broadcastRuntimeProjectsUpdated,
				getTerminalManagerForWorkspace: deps.workspaceRegistry.getTerminalManagerForWorkspace,
				disposeWorkspace: (workspaceId, options) => {
					disposeClineTaskSessionService(workspaceId);
					return deps.disposeWorkspace(workspaceId, options);
				},
				collectProjectWorktreeTaskIdsForRemoval: deps.collectProjectWorktreeTaskIdsForRemoval,
				warn: deps.warn,
				buildProjectsPayload: deps.workspaceRegistry.buildProjectsPayload,
				pickDirectoryPathFromSystemDialog: deps.pickDirectoryPathFromSystemDialog,
				serverCwd: process.cwd(),
			}),
			hooksApi: createHooksApi({
				getWorkspacePathById: deps.workspaceRegistry.getWorkspacePathById,
				ensureTerminalManagerForWorkspace: deps.ensureTerminalManagerForWorkspace,
				broadcastRuntimeWorkspaceStateUpdated: deps.runtimeStateHub.broadcastRuntimeWorkspaceStateUpdated,
				broadcastTaskReadyForReview: deps.runtimeStateHub.broadcastTaskReadyForReview,
			}),
		};
	};

	const trpcHttpHandler = createHTTPHandler({
		basePath: "/api/trpc/",
		router: runtimeAppRouter,
		createContext: async ({ req }) => await createTrpcContext(req),
	});

	const isRemoteMode = isKanbanRemoteHost();

	const readRequestBody = (req: IncomingMessage, maxBytes = 4096): Promise<string> =>
		new Promise((resolve, reject) => {
			let body = "";
			let size = 0;
			req.on("data", (chunk: Buffer) => {
				size += chunk.length;
				if (size > maxBytes) {
					reject(new Error("Request body too large"));
					return;
				}
				body += chunk.toString("utf8");
			});
			req.on("end", () => resolve(body));
			req.on("error", reject);
		});

	const getRemoteIp = (req: IncomingMessage): string => req.socket.remoteAddress ?? "unknown";

	const tlsConfig = getKanbanRuntimeTls();
	const requestHandler = async (req: IncomingMessage, res: import("node:http").ServerResponse) => {
		try {
			if (handleHttpRequest(req, res).end) {
				return;
			}

			const requestUrl = new URL(req.url ?? "/", "http://localhost");
			const pathname = normalizeRequestPath(requestUrl.pathname);

			// ── Passcode gate (remote mode only) ──────────────────────────────
			const passcodeActive = isRemoteMode && isPasscodeEnabled();
			if (pathname === "/api/passcode/status") {
				if (passcodeActive) {
					const token = extractSessionTokenFromCookie(req.headers.cookie);
					const authenticated = token !== null && validateSession(token);
					res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
					res.end(JSON.stringify({ required: true, authenticated }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
					res.end(JSON.stringify({ required: false, authenticated: true }));
				}
				return;
			}
			// Passcode config API - enable/disable passcode from Settings
			if (pathname === "/api/passcode/config") {
				if (req.method === "GET") {
					// Return current passcode status (not the actual passcode)
					const enabled = isPasscodeEnabled();
					res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
					res.end(JSON.stringify({ enabled }));
					return;
				}
				if (req.method === "POST") {
					let body: string;
					try {
						body = await readRequestBody(req);
					} catch {
						res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
						res.end(JSON.stringify({ error: "Invalid request body." }));
						return;
					}
					let parsed: unknown;
					try {
						parsed = JSON.parse(body);
					} catch {
						res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
						res.end(JSON.stringify({ error: "Invalid JSON." }));
						return;
					}
					const enable =
						parsed !== null &&
						typeof parsed === "object" &&
						typeof (parsed as Record<string, unknown>).enable === "boolean"
							? ((parsed as Record<string, unknown>).enable as boolean)
							: false;
					const regenerate =
						parsed !== null &&
						typeof parsed === "object" &&
						typeof (parsed as Record<string, unknown>).regenerate === "boolean"
							? ((parsed as Record<string, unknown>).regenerate as boolean)
							: false;
					// Custom passcode from user input
					const customPasscode =
						parsed !== null &&
						typeof parsed === "object" &&
						typeof (parsed as Record<string, unknown>).passcode === "string"
							? ((parsed as Record<string, unknown>).passcode as string)
							: null;

					let passcode: string | null = null;
					if (enable) {
						if (customPasscode && customPasscode.length > 0) {
							// Use custom passcode provided by user
							passcode = setCustomPasscode(customPasscode);
						} else if (regenerate || !isPasscodeEnabled()) {
							// Generate new passcode
							passcode = generatePasscode();
						} else {
							// Keep existing passcode, just return current (don't expose it)
							passcode = null;
						}
						generateInternalToken();
					} else {
						disablePasscode();
					}

					res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
					res.end(JSON.stringify({ ok: true, passcode }));
					return;
				}
				res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({ error: "Method not allowed" }));
				return;
			}
			if (passcodeActive && req.method === "POST" && pathname === "/api/passcode/verify") {
				const ip = getRemoteIp(req);
				const rateLimit = checkRateLimit(ip);
				if (!rateLimit.allowed) {
					const retryAfterSec = rateLimit.lockedUntilMs
						? Math.ceil((rateLimit.lockedUntilMs - Date.now()) / 1000)
						: 30;
					res.writeHead(429, {
						"Content-Type": "application/json; charset=utf-8",
						"Cache-Control": "no-store",
						"Retry-After": String(retryAfterSec),
					});
					res.end(JSON.stringify({ error: "Too many attempts. Please wait before trying again." }));
					return;
				}
				let body: string;
				try {
					body = await readRequestBody(req);
				} catch {
					res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ error: "Invalid request body." }));
					return;
				}
				let parsed: unknown;
				try {
					parsed = JSON.parse(body);
				} catch {
					res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ error: "Invalid JSON." }));
					return;
				}
				const submitted =
					parsed !== null &&
					typeof parsed === "object" &&
					"passcode" in parsed &&
					typeof (parsed as Record<string, unknown>).passcode === "string"
						? ((parsed as Record<string, unknown>).passcode as string)
						: "";
				if (!validatePasscode(submitted)) {
					recordFailedAttempt(ip);
					res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
					res.end(JSON.stringify({ error: "Invalid passcode." }));
					return;
				}
				clearRateLimit(ip);
				const token = issueSession();
				const cookieFlags = [
					`kanban_session=${token}`,
					"HttpOnly",
					"SameSite=Strict",
					"Path=/",
					`Max-Age=${24 * 60 * 60}`,
					...(tlsConfig !== null ? ["Secure"] : []),
				].join("; ");
				res.writeHead(200, {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
					"Set-Cookie": cookieFlags,
				});
				res.end(JSON.stringify({ ok: true }));
				return;
			}
			if (passcodeActive) {
				// Check session cookie (browser flow) first, then internal bearer token (CLI flow).
				const sessionToken = extractSessionTokenFromCookie(req.headers.cookie);
				const sessionAuth = sessionToken !== null && validateSession(sessionToken);
				const bearerToken = extractBearerToken(req.headers.authorization);
				const internalAuth = bearerToken !== null && validateInternalToken(bearerToken);
				const authenticated = sessionAuth || internalAuth;
				if (!authenticated) {
					// Static assets (JS, CSS, images, fonts, icons, manifest) are served
					// freely even when unauthenticated. They contain no user data and are
					// required for the React app to boot and render the passcode gate.
					// Only API routes are hard-blocked; index.html is served normally so
					// PasscodeGateProvider in React can intercept before any API calls.
					if (pathname.startsWith("/api/")) {
						res.writeHead(401, {
							"Content-Type": "application/json; charset=utf-8",
							"Cache-Control": "no-store",
						});
						res.end(JSON.stringify({ error: "Authentication required." }));
						return;
					}
					// Fall through — let the normal asset/index.html serving below handle it.
					// PasscodeGateProvider in main.tsx will render the gate before any
					// authenticated API calls are made.
				}
			}
			// ── End passcode gate ──────────────────────────────────────────────

			const oauthCallbackResponse = await handleClineMcpOauthCallback(requestUrl);
			if (oauthCallbackResponse) {
				res.writeHead(oauthCallbackResponse.statusCode, {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(oauthCallbackResponse.body);
				return;
			}
			if (pathname.startsWith("/api/trpc")) {
				await trpcHttpHandler(req, res);
				return;
			}
			if (pathname.startsWith("/api/")) {
				res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
				res.end('{"error":"Not found"}');
				return;
			}

			const asset = await readAsset(webUiDir, pathname);
			res.writeHead(200, {
				"Content-Type": asset.contentType,
				"Cache-Control": "no-store",
			});
			res.end(asset.content);
		} catch {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("Not Found");
		}
	};
	const server = tlsConfig
		? createHttpsServer({ key: tlsConfig.key, cert: tlsConfig.cert }, requestHandler)
		: createServer(requestHandler);
	server.on("upgrade", (request, socket, head) => {
		if (handleSocketUpgrade(request, socket).end) {
			return;
		}

		let requestUrl: URL;
		try {
			requestUrl = new URL(request.url ?? "/", getKanbanRuntimeOrigin());
		} catch {
			socket.destroy();
			return;
		}
		if (normalizeRequestPath(requestUrl.pathname) !== "/api/runtime/ws") {
			return;
		}
		// ── Passcode gate for WebSocket upgrades (remote mode only) ──────────
		const passcodeActive = isRemoteMode && isPasscodeEnabled();
		if (passcodeActive) {
			const sessionToken = extractSessionTokenFromCookie(request.headers.cookie);
			const sessionAuth = sessionToken !== null && validateSession(sessionToken);
			const bearerToken = extractBearerToken(request.headers.authorization);
			const internalAuth = bearerToken !== null && validateInternalToken(bearerToken);
			if (!sessionAuth && !internalAuth) {
				socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
				socket.destroy();
				return;
			}
		}
		// ── End passcode gate ─────────────────────────────────────────────────
		(request as IncomingMessage & { __kanbanUpgradeHandled?: boolean }).__kanbanUpgradeHandled = true;
		const requestedWorkspaceId = requestUrl.searchParams.get("workspaceId")?.trim() || null;
		deps.runtimeStateHub.handleUpgrade(request, socket, head, { requestedWorkspaceId });
	});
	const terminalWebSocketBridge = createTerminalWebSocketBridge({
		server,
		resolveTerminalManager: (workspaceId) => deps.workspaceRegistry.getTerminalManagerForWorkspace(workspaceId),
		isTerminalIoWebSocketPath: (pathname) => normalizeRequestPath(pathname) === "/api/terminal/io",
		isTerminalControlWebSocketPath: (pathname) => normalizeRequestPath(pathname) === "/api/terminal/control",
		validateUpgradeSession:
			isRemoteMode && isPasscodeEnabled()
				? (cookieHeader) => {
						const token = extractSessionTokenFromCookie(cookieHeader);
						return token !== null && validateSession(token);
					}
				: undefined,
	});
	server.on("upgrade", (request, socket) => {
		const handled = (request as IncomingMessage & { __kanbanUpgradeHandled?: boolean }).__kanbanUpgradeHandled;
		if (handled) {
			return;
		}
		socket.destroy();
	});

	await new Promise<void>((resolveListen, rejectListen) => {
		server.once("error", rejectListen);
		server.listen(getKanbanRuntimePort(), getKanbanRuntimeHost(), () => {
			server.off("error", rejectListen);
			resolveListen();
		});
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to start local server.");
	}
	const activeWorkspaceId = deps.workspaceRegistry.getActiveWorkspaceId();
	const url = activeWorkspaceId
		? buildKanbanRuntimeUrl(`/${encodeURIComponent(activeWorkspaceId)}`)
		: getKanbanRuntimeOrigin();

	const clineProviderService = createClineProviderService();

	const startTask = async (workspaceId: string, workspacePath: string, taskId: string, card: RuntimeBoardCard): Promise<boolean> => {
		try {
			const terminalManager = await deps.ensureTerminalManagerForWorkspace(workspaceId, workspacePath);
			const clineTaskSessionService = await getScopedClineTaskSessionService({
				workspaceId,
				workspacePath,
			});

			const runtimeConfig = await deps.workspaceRegistry.loadScopedRuntimeConfig({
				workspaceId,
				workspacePath,
			});

			const effectiveAgentId = card.agentId ?? runtimeConfig.selectedAgentId;
			const useClinePath = effectiveAgentId === "cline";

			const taskCwd = isHomeAgentSessionId(taskId) || card.workspaceMode === "project_root"
				? workspacePath
				: await resolveTaskCwd({
						cwd: workspacePath,
						taskId,
						baseRef: card.baseRef,
						ensure: true,
					});

			if (useClinePath) {
				const clineLaunchConfig = await clineProviderService.resolveLaunchConfig({
					providerIdOverride: card.clineSettings?.providerId ?? undefined,
					modelIdOverride: card.clineSettings?.modelId ?? undefined,
					reasoningEffortOverride: card.clineSettings?.reasoningEffort ?? null,
				});

				await clineTaskSessionService.startTaskSession({
					taskId,
					cwd: taskCwd,
					prompt: card.prompt,
					taskTitle: resolveTaskTitle(card.title, card.prompt) || undefined,
					images: card.images,
					resumeFromTrash: false,
					providerId: clineLaunchConfig.providerId,
					modelId: clineLaunchConfig.modelId,
					mode: "act",
					startInPlanMode: card.startInPlanMode,
					apiKey: clineLaunchConfig.apiKey,
					baseUrl: clineLaunchConfig.baseUrl,
					reasoningEffort: clineLaunchConfig.reasoningEffort,
				});
				return true;
			}

			const resolved = resolveAgentCommand(runtimeConfig, card.agentInstanceId ?? undefined);
			if (!resolved) {
				LOGGER.log("No runnable agent command for workspace", { workspaceId });
				return false;
			}

			await terminalManager.startTaskSession({
				taskId,
				agentId: resolved.agentId,
				binary: resolved.binary,
				args: resolved.args,
				autonomousModeEnabled: runtimeConfig.agentAutonomousModeEnabled,
				cwd: taskCwd,
				prompt: card.prompt,
				images: card.images,
				startInPlanMode: card.startInPlanMode,
				resumeFromTrash: false,
				workspaceId,
			});
			return true;
		} catch (error) {
			LOGGER.log("Failed to start task", { taskId, error });
			return false;
		}
	};

	const scheduledTaskExecutor = createScheduledTaskExecutor({
		getWorkspacePath: deps.workspaceRegistry.getWorkspacePathById,
		broadcastWorkspaceStateUpdated: deps.runtimeStateHub.broadcastRuntimeWorkspaceStateUpdated,
		startTask,
	});
	scheduledTaskExecutor.start();

	const autoCrScanner = createAutoCrScanner({
		getWorkspacePath: deps.workspaceRegistry.getWorkspacePathById,
		loadScopedRuntimeConfig: deps.workspaceRegistry.loadScopedRuntimeConfig,
		listPullRequests: listAntcodePullRequests,
		resolveProjectContext: (scope) =>
			resolveAntcodeProjectContext(scope, deps.workspaceRegistry.loadScopedRuntimeConfig),
		startTask,
		broadcastWorkspaceStateUpdated: deps.runtimeStateHub.broadcastRuntimeWorkspaceStateUpdated,
		getScanIntervalMs: async () => {
			const config = await loadGlobalRuntimeConfig();
			return config.autoCrScanIntervalMinutes * 60 * 1000;
		},
	});
	autoCrScanner.start();

	return {
		url,
		close: async () => {
			scheduledTaskExecutor.stop();
			autoCrScanner.stop();
			await Promise.all(
				Array.from(clineTaskSessionServiceByWorkspaceId.values()).map(async (service) => {
					await service.dispose();
				}),
			);
			clineTaskSessionServiceByWorkspaceId.clear();
			await clineWatcherRegistry.close();
			await deps.runtimeStateHub.close();
			await terminalWebSocketBridge.close();
			await new Promise<void>((resolveClose, rejectClose) => {
				server.close((error) => {
					if (error) {
						rejectClose(error);
						return;
					}
					resolveClose();
				});
			});
		},
	};
}
