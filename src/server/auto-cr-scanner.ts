import { createKanbanClineLogger } from "../cline-sdk/cline-runtime-logger";
import type { RuntimeAntcodePullRequest, RuntimeAutoCrSource, RuntimeBoardCard, RuntimeBoardData } from "../core/api-contract";
import { addTaskToColumn } from "../core/task-board-mutations";
import type { RuntimeConfigState } from "../config/runtime-config";
import { getAgentDefaultLabel } from "../config/runtime-agent-config";
import {
	listWorkspaceIndexEntries,
	loadWorkspaceState,
	mutateWorkspaceState,
} from "../state/workspace-state";

const LOGGER = createKanbanClineLogger({ component: "auto-cr-scanner" });

const DEFAULT_SCAN_INTERVAL_MS = 45 * 60 * 1000;

export interface AutoCrScannerDependencies {
	getWorkspacePath: (workspaceId: string) => string | null;
	loadScopedRuntimeConfig: (scope: { workspaceId: string; workspacePath: string }) => Promise<RuntimeConfigState>;
	listPullRequests: (input: {
		antcodeToken: string;
		projectName: string;
		apiBaseUrl: string;
	}) => Promise<RuntimeAntcodePullRequest[]>;
	resolveProjectContext: (
		workspaceScope: { workspaceId: string; workspacePath: string },
	) => Promise<{ ok: true; context: { antcodeToken: string; projectName: string; apiBaseUrl: string } } | { ok: false; error: string }>;
	startTask: (workspaceId: string, workspacePath: string, taskId: string, card: RuntimeBoardCard) => Promise<boolean>;
	broadcastWorkspaceStateUpdated: (workspaceId: string, workspacePath: string) => Promise<void>;
	getScanIntervalMs: () => Promise<number>;
}

export interface AutoCrScanner {
	start: () => void;
	stop: () => void;
}

const ACTIVE_COLUMN_IDS = new Set(["in_progress", "review"]);

function hasActiveTaskForPr(
	board: RuntimeBoardData,
	prUrl: string,
	agentInstanceId: string,
): boolean {
	for (const column of board.columns) {
		if (!ACTIVE_COLUMN_IDS.has(column.id)) continue;
		for (const card of column.cards) {
			if (card.autoCrSource) {
				if (card.autoCrSource.prUrl === prUrl && card.autoCrSource.agentInstanceId === agentInstanceId) {
					return true;
				}
			}
			if (card.agentInstanceId === agentInstanceId && card.prompt === `评审下PR：${prUrl}`) {
				return true;
			}
		}
	}
	return false;
}

export function createAutoCrScanner(deps: AutoCrScannerDependencies): AutoCrScanner {
	let timerId: NodeJS.Timeout | null = null;
	let isRunning = false;
	let stopped = false;

	const scheduleNext = async () => {
		if (stopped) return;
		let intervalMs: number;
		try {
			intervalMs = await deps.getScanIntervalMs();
		} catch {
			intervalMs = DEFAULT_SCAN_INTERVAL_MS;
		}
		if (stopped) return;
		timerId = setTimeout(() => void runScan(), intervalMs);
		timerId.unref();
	};

	const runScan = async () => {
		if (isRunning || stopped) return;
		isRunning = true;
		try {
			LOGGER.log("Starting auto CR scan");
			const workspaceEntries = await listWorkspaceIndexEntries();

			for (const { workspaceId, repoPath } of workspaceEntries) {
				try {
					const workspacePath = repoPath;

					const runtimeConfig = await deps.loadScopedRuntimeConfig({ workspaceId, workspacePath });
					if (!runtimeConfig.autoCrEnabled || runtimeConfig.autoCrAgentInstanceIds.length === 0) {
						continue;
					}

					const resolved = await deps.resolveProjectContext({ workspaceId, workspacePath });
					if (!resolved.ok) {
						LOGGER.log("Could not resolve project context", { workspaceId, error: resolved.error });
						continue;
					}

					const { antcodeToken, projectName, apiBaseUrl } = resolved.context;

					let pullRequests: RuntimeAntcodePullRequest[];
					try {
						pullRequests = await deps.listPullRequests({ antcodeToken, projectName, apiBaseUrl });
					} catch (error) {
						LOGGER.log("Failed to fetch pull requests", { workspaceId, error });
						continue;
					}

					const matchingPrs = pullRequests.filter(
						(pr) => pr.state === "opened" && pr.labels.includes("PendingAGIReview"),
					);

					if (matchingPrs.length === 0) continue;

					const state = await loadWorkspaceState(repoPath);
					const selectedAgentInstances = runtimeConfig.autoCrAgentInstanceIds;
					const configuredAgentMap = new Map(
						runtimeConfig.configuredAgents.map((agent) => [agent.id, agent]),
					);

					let stateChanged = false;

					for (const pr of matchingPrs) {
						for (const agentInstanceId of selectedAgentInstances) {
							const agent = configuredAgentMap.get(agentInstanceId);
							if (!agent) {
								LOGGER.log("Agent instance not found, skipping", { agentInstanceId });
								continue;
							}

							if (hasActiveTaskForPr(state.board, pr.webUrl, agentInstanceId)) {
								continue;
							}

							const autoCrSource: RuntimeAutoCrSource = {
								projectName,
								prIid: pr.iid,
								prUrl: pr.webUrl,
								agentInstanceId,
							};

							const agentLabel = agent.alias ?? getAgentDefaultLabel(agent.type);
							const title = `[Auto CR][${agentLabel}] Review PR !${pr.iid} ${pr.title}`;
							const prompt = `评审下PR：${pr.webUrl}`;

							try {
								const result = await mutateWorkspaceState(repoPath, (currentState) => {
									if (hasActiveTaskForPr(currentState.board, pr.webUrl, agentInstanceId)) {
										return { board: currentState.board, value: null, save: false };
									}

									const createResult = addTaskToColumn(
										currentState.board,
										"in_progress",
										{
											title,
											prompt,
											startInPlanMode: false,
											baseRef: pr.targetBranch || "main",
											workspaceMode: "project_root",
											agentId: agent.type,
											agentInstanceId: agent.id,
											autoCrSource,
										},
										() => crypto.randomUUID(),
									);

									return {
										board: createResult.board,
										value: createResult.task,
									};
								});

								if (!result.value) continue;

								stateChanged = true;

								const createdTask = result.value;
								const started = await deps.startTask(workspaceId, workspacePath, createdTask.id, createdTask);

								if (!started) {
									LOGGER.log("Failed to start auto CR task, removing", { taskId: createdTask.id });
									await mutateWorkspaceState(repoPath, (currentState) => {
										const columns = currentState.board.columns.map((column) => ({
											...column,
											cards: column.cards.filter((card) => card.id !== createdTask.id),
										}));
										return { board: { ...currentState.board, columns }, value: null };
									});
								} else {
									LOGGER.log("Started auto CR task", {
										taskId: createdTask.id,
										pr: pr.iid,
										agent: agentInstanceId,
									});
								}
							} catch (error) {
								LOGGER.log("Error creating auto CR task", {
									pr: pr.iid,
									agent: agentInstanceId,
									error,
								});
							}
						}
					}

					if (stateChanged) {
						await deps.broadcastWorkspaceStateUpdated(workspaceId, repoPath);
					}
				} catch (error) {
					LOGGER.log("Error scanning workspace for auto CR", { workspaceId, error });
				}
			}

			LOGGER.log("Auto CR scan completed");
		} finally {
			isRunning = false;
			void scheduleNext();
		}
	};

	return {
		start: () => {
			if (timerId !== null) return;
			stopped = false;
			LOGGER.log("Starting auto CR scanner");
			void runScan();
		},
		stop: () => {
			stopped = true;
			if (timerId !== null) {
				clearTimeout(timerId);
				timerId = null;
			}
		},
	};
}
