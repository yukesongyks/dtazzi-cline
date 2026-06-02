import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareAgentLaunch } from "../../../src/terminal/agent-session-adapters";

const originalHome = process.env.HOME;
const originalAppData = process.env.APPDATA;
const originalLocalAppData = process.env.LOCALAPPDATA;
let tempHome: string | null = null;
const originalArgv = [...process.argv];
const originalExecArgv = [...process.execArgv];
const originalExecPath = process.execPath;

function setupTempHome(): string {
	tempHome = mkdtempSync(join(tmpdir(), "kanban-agent-adapters-"));
	process.env.HOME = tempHome;
	return tempHome;
}

function setKanbanProcessContext(): void {
	process.argv = ["node", "/Users/example/repo/dist/cli.js"];
	process.execArgv = [];
	Object.defineProperty(process, "execPath", {
		configurable: true,
		value: "/usr/local/bin/node",
	});
}

function getCodexConfigOverrideValues(args: string[], key: string): string[] {
	const values: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "-c" || arg === "--config") {
			const next = args[index + 1];
			if (typeof next === "string" && next.startsWith(`${key}=`)) {
				values.push(next.slice(key.length + 1));
			}
			index += 1;
			continue;
		}
		if (arg.startsWith(`-c${key}=`)) {
			values.push(arg.slice(key.length + 3));
			continue;
		}
		if (arg.startsWith(`--config=${key}=`)) {
			values.push(arg.slice(key.length + 10));
		}
	}
	return values;
}

afterEach(() => {
	if (originalHome === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = originalHome;
	}
	if (tempHome) {
		rmSync(tempHome, { recursive: true, force: true });
		tempHome = null;
	}
	if (originalAppData === undefined) {
		delete process.env.APPDATA;
	} else {
		process.env.APPDATA = originalAppData;
	}
	if (originalLocalAppData === undefined) {
		delete process.env.LOCALAPPDATA;
	} else {
		process.env.LOCALAPPDATA = originalLocalAppData;
	}
	process.argv = [...originalArgv];
	process.execArgv = [...originalExecArgv];
	Object.defineProperty(process, "execPath", {
		configurable: true,
		value: originalExecPath,
	});
});

describe("prepareAgentLaunch hook strategies", () => {
	it("configures Codex hooks without legacy notify", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");

		const launchCommand = [launch.binary ?? "", ...launch.args].join(" ");
		expect(launchCommand).toContain("codex");
		expect(launchCommand).toContain("codex-hook");
		expect(launchCommand).toContain("hooks.UserPromptSubmit");
		expect(launchCommand).toContain("hooks.Stop");
		expect(launchCommand).toContain("hooks.PermissionRequest");
		expect(getCodexConfigOverrideValues(launch.args, "features.hooks")).toEqual(["true"]);
		expect(getCodexConfigOverrideValues(launch.args, "features.codex_hooks")).toEqual([]);
		const hookTrustState = getCodexConfigOverrideValues(launch.args, "hooks.state");
		expect(hookTrustState).toHaveLength(1);
		expect(hookTrustState[0]).toContain('"/<session-flags>/config.toml:user_prompt_submit:0:0"');
		expect(hookTrustState[0]).toContain('"/<session-flags>/config.toml:stop:0:0"');
		expect(hookTrustState[0]).toContain('"/<session-flags>/config.toml:permission_request:0:0"');
		expect(hookTrustState[0]).toContain('"/<session-flags>/config.toml:pre_tool_use:0:0"');
		expect(hookTrustState[0]).toContain('"/<session-flags>/config.toml:post_tool_use:0:0"');
		expect(hookTrustState[0]).toContain('trusted_hash="sha256:');
		expect(launchCommand).toContain("timeout=5");
		expect(launchCommand).not.toContain("codex-wrapper");
		expect(launchCommand).not.toContain("notify=");

		const wrapperPath = join(homedir(), ".cline", "kanban", "hooks", "codex", "codex-wrapper.mjs");
		expect(existsSync(wrapperPath)).toBe(false);
	});

	it("appends Kanban sidebar instructions for home Claude sessions", async () => {
		setupTempHome();
		setKanbanProcessContext();
		const launch = await prepareAgentLaunch({
			taskId: "__home_agent__:workspace-1:claude",
			agentId: "claude",
			binary: "claude",
			args: [],
			cwd: "/tmp",
			prompt: "",
		});

		const appendPromptIndex = launch.args.indexOf("--append-system-prompt");
		expect(appendPromptIndex).toBeGreaterThanOrEqual(0);
		expect(launch.args[appendPromptIndex + 1]).toContain("Kanban sidebar agent");
		expect(launch.args[appendPromptIndex + 1]).toContain(
			"'/usr/local/bin/node' '/Users/example/repo/dist/cli.js' task create",
		);
	});

	it("appends Kanban sidebar instructions for home Codex sessions", async () => {
		setupTempHome();
		setKanbanProcessContext();
		const launch = await prepareAgentLaunch({
			taskId: "__home_agent__:workspace-1:codex",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
		});

		const developerInstructions = getCodexConfigOverrideValues(launch.args, "developer_instructions");
		expect(developerInstructions).toHaveLength(1);
		expect(developerInstructions[0]).toContain("Kanban sidebar agent");
		expect(developerInstructions[0]).toContain("'/usr/local/bin/node' '/Users/example/repo/dist/cli.js' task create");
		expect(getCodexConfigOverrideValues(launch.args, "check_for_update_on_startup")).toEqual(["false"]);
	});

	it("disables Codex startup update checks for Kanban-launched sessions", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-codex-updates",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
		});

		expect(getCodexConfigOverrideValues(launch.args, "check_for_update_on_startup")).toEqual(["false"]);
	});

	it("preserves an explicit Codex update-check override", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-codex-custom-update-check",
			agentId: "codex",
			binary: "codex",
			args: ["-c", "check_for_update_on_startup=true"],
			cwd: "/tmp",
			prompt: "",
		});

		expect(getCodexConfigOverrideValues(launch.args, "check_for_update_on_startup")).toEqual(["true"]);
	});

	it("writes Claude settings with explicit permission hook", async () => {
		setupTempHome();
		await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "claude",
			binary: "claude",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		const settingsPath = join(homedir(), ".cline", "kanban", "hooks", "claude", "settings.json");
		const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
			hooks?: Record<string, unknown>;
		};
		expect(settings.hooks?.PermissionRequest).toBeDefined();
		expect(settings.hooks?.PreToolUse).toBeDefined();
		expect(settings.hooks?.PostToolUse).toBeDefined();
		expect(settings.hooks?.PostToolUseFailure).toBeDefined();
	});

	it("writes AntCC settings with Kanban hooks under hooks/antcc", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-antcc-1",
			agentId: "antcc",
			binary: "cfuse",
			args: ["--cc"],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-antcc-1");
		const settingsPath = join(homedir(), ".cline", "kanban", "hooks", "antcc", "settings.json");
		const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
			hooks?: {
				Stop?: Array<{ hooks?: Array<{ command?: string }> }>;
			};
		};
		expect(settings.hooks?.Stop?.[0]?.hooks?.[0]?.command).toMatch(/--source['\s]+antcc/);
		expect(launch.args).toContain("--settings");
		expect(launch.args).toContain(settingsPath);
	});

	it("writes Gemini settings with AfterTool mapped to to_in_progress", async () => {
		setupTempHome();
		await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "gemini",
			binary: "gemini",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		const settingsPath = join(homedir(), ".cline", "kanban", "hooks", "gemini", "settings.json");
		const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
			hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
		};
		const afterToolCommand = settings.hooks?.AfterTool?.[0]?.hooks?.[0]?.command;
		expect(afterToolCommand).toContain("hooks");
		expect(afterToolCommand).toContain("gemini-hook");
		const hookScriptPath = join(homedir(), ".cline", "kanban", "hooks", "gemini", "gemini-hook.mjs");
		expect(existsSync(hookScriptPath)).toBe(false);
	});

	it("writes OpenCode plugin with root-session filtering and permission hooks", async () => {
		setupTempHome();
		await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "opencode",
			binary: "opencode",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		const pluginPath = join(homedir(), ".cline", "kanban", "hooks", "opencode", "kanban.js");
		const plugin = readFileSync(pluginPath, "utf8");
		expect(plugin).toContain("parentID");
		expect(plugin).toContain('"permission.ask"');
		expect(plugin).toContain('"tool.execute.before"');
		expect(plugin).toContain('"tool.execute.after"');
		expect(plugin).toContain("session.status");
		expect(plugin).toContain("message.part.updated");
		expect(plugin).toContain("last_assistant_message");
		expect(plugin).toContain("--metadata-base64");
		expect(plugin).toContain('if (kind === "review")');
		expect(plugin).toContain('currentState = "idle"');
	});

	it("loads OpenCode preferred model from LOCALAPPDATA state and auth paths", async () => {
		const homePath = setupTempHome();
		const localAppDataPath = join(homePath, "AppData", "Local");
		process.env.LOCALAPPDATA = localAppDataPath;

		const statePath = join(localAppDataPath, "opencode", "state");
		mkdirSync(statePath, { recursive: true });
		writeFileSync(
			join(statePath, "model.json"),
			JSON.stringify(
				{
					recent: [
						{ providerID: "anthropic", modelID: "claude-3-7-sonnet" },
						{ providerID: "openai", modelID: "gpt-4o" },
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const authPath = join(localAppDataPath, "opencode");
		mkdirSync(authPath, { recursive: true });
		writeFileSync(
			join(authPath, "auth.json"),
			JSON.stringify(
				{
					openai: { key: "sk-test" },
				},
				null,
				2,
			),
			"utf8",
		);

		const launch = await prepareAgentLaunch({
			taskId: "task-opencode-model",
			agentId: "opencode",
			binary: "opencode",
			args: [],
			cwd: "/tmp",
			prompt: "",
		});

		const modelIndex = launch.args.indexOf("--model");
		expect(modelIndex).toBeGreaterThan(-1);
		expect(launch.args[modelIndex + 1]).toBe("openai/gpt-4o");
	});

	it("writes Droid settings with hook transitions and runtime autonomy mode", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "droid",
			binary: "droid",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");

		const settingsArgIndex = launch.args.indexOf("--settings");
		expect(settingsArgIndex).toBeGreaterThanOrEqual(0);
		const settingsPath = launch.args[settingsArgIndex + 1];
		expect(settingsPath).toBeDefined();

		const settings = JSON.parse(readFileSync(settingsPath ?? "", "utf8")) as {
			autonomyMode?: string;
			hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
		};
		expect(settings.autonomyMode).toBe("auto-high");
		expect(settings.hooks?.Stop?.[0]?.hooks?.[0]?.command).toContain("to_review");
		expect(settings.hooks?.Notification?.[0]?.hooks?.[0]?.command).toContain("activity");
		expect(settings.hooks?.Notification?.[1]?.hooks?.[0]?.command).toContain("to_review");
		expect(settings.hooks?.PreToolUse?.[0]?.matcher).toBe("*");
		expect(settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toContain("activity");
		const preToolInProgressHook = settings.hooks?.PreToolUse?.find(
			(hook) => hook.matcher === "Read|Grep|Glob|FetchUrl|WebSearch|Execute|Task|Edit|Create",
		);
		expect(preToolInProgressHook?.hooks?.[0]?.command).toContain("to_in_progress");
		const preToolReviewHook = settings.hooks?.PreToolUse?.find((hook) => hook.matcher === "AskUser");
		expect(preToolReviewHook?.hooks?.[0]?.command).toContain("to_review");
		expect(settings.hooks?.PostToolUse?.[0]?.matcher).toBe("*");
		expect(settings.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command).toContain("activity");
		const postToolInProgressHook = settings.hooks?.PostToolUse?.find((hook) => hook.matcher === "AskUser");
		expect(postToolInProgressHook?.hooks?.[0]?.command).toContain("to_in_progress");
		expect(settings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toContain("to_in_progress");
	});

	it("writes Kiro agent hooks and uses a Kanban-managed soft planning prompt", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-kiro-1",
			agentId: "kiro",
			binary: "kiro-cli",
			args: ["chat"],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "Investigate deployment drift",
			startInPlanMode: true,
			workspaceId: "workspace-1",
		});

		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-kiro-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");
		expect(launch.args).toContain("--agent");
		expect(launch.args[launch.args.indexOf("--agent") + 1]).toBe("kanban");
		expect(launch.args).toContain("--trust-all-tools");
		const initialPrompt = launch.args.at(-1) ?? "";
		expect(initialPrompt).toContain("Do not modify files");
		expect(initialPrompt).toContain("Task:\nInvestigate deployment drift");

		const configPath = join(homedir(), ".kiro", "agents", "kanban.json");
		const config = JSON.parse(readFileSync(configPath, "utf8")) as {
			tools?: string[];
			hooks?: Record<string, Array<{ command?: string }>>;
		};
		expect(config.tools).toEqual(["*"]);
		expect(config.hooks?.agentSpawn?.[0]?.command).toContain("to_in_progress");
		expect(config.hooks?.userPromptSubmit?.[0]?.command).toContain("to_in_progress");
		expect(config.hooks?.preToolUse?.[0]?.command).toContain("activity");
		expect(config.hooks?.preToolUse?.[1]?.command).toContain("to_in_progress");
		expect(config.hooks?.postToolUse?.[0]?.command).toContain("activity");
		expect(config.hooks?.stop?.[0]?.command).toContain("to_review");
		expect(config.hooks?.stop?.[0]?.command).toContain("Waiting for review");
	});

	it("writes Kimi hooks config and applies --afk, --continue, --plan flags", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-kimi-1",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "Refactor the auth module",
			startInPlanMode: true,
			resumeFromTrash: true,
			workspaceId: "workspace-1",
		});

		expect(launch.args).toContain("--afk");
		expect(launch.args).toContain("--continue");
		expect(launch.args).toContain("--plan");
		expect(launch.args).not.toContain("--prompt");
		expect(launch.args).not.toContain("Refactor the auth module");
		expect(launch.deferredStartupInput).toBe("\u001b[200~Refactor the auth module\u001b[201~\r");
		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-kimi-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");

		const configPath = join(homedir(), ".cline", "kanban", "hooks", "kimi", "config.toml");
		const configContent = readFileSync(configPath, "utf8");
		expect(configContent).toContain('event = "Stop"');
		expect(configContent).toContain('event = "PreToolUse"');
		expect(configContent).toContain('event = "PostToolUse"');
		expect(configContent).toContain('event = "Notification"');
		expect(configContent).toContain('event = "SessionStart"');
		expect(configContent).toContain("to_review");
		expect(configContent).toContain("activity");
		expect(configContent).toContain("to_in_progress");

		const configFileIndex = launch.args.indexOf("--config-file");
		expect(configFileIndex).toBeGreaterThanOrEqual(0);
		expect(launch.args[configFileIndex + 1]).toBe(configPath);
	});

	it("merges Kimi hooks with user config when --config-file is used", async () => {
		const homePath = setupTempHome();
		const kimiDir = join(homePath, ".kimi");
		mkdirSync(kimiDir, { recursive: true });
		writeFileSync(
			join(kimiDir, "config.toml"),
			'model = "kimi-k2"\n\nhooks = [\n\t{ event = "Stop", command = "user-hook" },\n]\n\n[settings]\nverbose = true\n',
			"utf8",
		);

		await prepareAgentLaunch({
			taskId: "task-kimi-merge",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-2",
		});

		const configPath = join(homedir(), ".cline", "kanban", "hooks", "kimi", "config.toml");
		const configContent = readFileSync(configPath, "utf8");
		expect(configContent).toContain('model = "kimi-k2"');
		expect(configContent).toContain("verbose = true");
		expect(configContent).toContain('event = "Stop"');
		expect(configContent).toContain("Kanban-managed hooks");
		expect(configContent).toContain("user-hook");
		expect(configContent.match(/^hooks\s*=/gmu)).toHaveLength(1);
	});

	it("writes Kimi Code hooks directly into ~/.kimi-code/config.toml and uses --yolo (no --config-file)", async () => {
		const homePath = setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-kimi-code-1",
			agentId: "kimi-code",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "Refactor",
			startInPlanMode: true,
			resumeFromTrash: true,
			workspaceId: "workspace-1",
		});

		// kimi-code rejects --afk; --yolo is the autonomous flag, --config-file is dropped.
		expect(launch.args).toContain("--yolo");
		expect(launch.args).not.toContain("--afk");
		expect(launch.args).toContain("--continue");
		expect(launch.args).toContain("--plan");
		expect(launch.args).not.toContain("--config-file");

		// Hooks land in the kimi-code user config (default load path), not a hook-dir mirror.
		const userConfigPath = join(homePath, ".kimi-code", "config.toml");
		const hookDirMirror = join(homePath, ".cline", "kanban", "hooks", "kimi-code", "config.toml");
		expect(existsSync(userConfigPath)).toBe(true);
		expect(existsSync(hookDirMirror)).toBe(false);

		const writtenConfig = readFileSync(userConfigPath, "utf8");
		expect(writtenConfig).toContain('event = "Stop"');
		expect(writtenConfig).toContain('event = "PreToolUse"');
		expect(writtenConfig).toContain("to_review");
	});

	it("inserts kimi-code hooks at top-level scope when user config ends with a [section]", async () => {
		const homePath = setupTempHome();
		const kimiCodeDir = join(homePath, ".kimi-code");
		mkdirSync(kimiCodeDir, { recursive: true });
		// Real-world layout: kimi-code seeds config with section headers at the bottom,
		// no pre-existing top-level `hooks = [...]`. Naively appending would nest the
		// hooks array inside the last section per TOML grammar.
		writeFileSync(
			join(kimiCodeDir, "config.toml"),
			[
				'default_model = "kimi-code/kimi-for-coding"',
				"",
				'[models."kimi-code/kimi-for-coding"]',
				'provider = "managed:kimi-code"',
				'model = "kimi-for-coding"',
				"",
			].join("\n"),
			"utf8",
		);

		await prepareAgentLaunch({
			taskId: "task-kimi-code-scope",
			agentId: "kimi-code",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
			startInPlanMode: false,
			resumeFromTrash: false,
			workspaceId: "ws-scope",
		});

		const written = readFileSync(join(kimiCodeDir, "config.toml"), "utf8");
		// hooks block must precede the [models."..."] header so it stays at root.
		const hooksIdx = written.indexOf("hooks = [");
		const modelsHeaderIdx = written.indexOf('[models."kimi-code/kimi-for-coding"]');
		expect(hooksIdx).toBeGreaterThanOrEqual(0);
		expect(modelsHeaderIdx).toBeGreaterThan(hooksIdx);
		// Pre-existing key/value above the section must be preserved.
		expect(written).toContain('default_model = "kimi-code/kimi-for-coding"');
	});

	it("preserves [models.X] section across re-runs when stripping previous managed kimi-code hooks", async () => {
		const homePath = setupTempHome();
		const kimiCodeDir = join(homePath, ".kimi-code");
		mkdirSync(kimiCodeDir, { recursive: true });
		writeFileSync(
			join(kimiCodeDir, "config.toml"),
			[
				'default_model = "kimi-code/kimi-for-coding"',
				"",
				'[models."kimi-code/kimi-for-coding"]',
				'provider = "managed:kimi-code"',
				'model = "kimi-for-coding"',
				"max_context_size = 262144",
				"",
			].join("\n"),
			"utf8",
		);

		// First run writes managed hooks above [models.X].
		await prepareAgentLaunch({
			taskId: "task-kimi-code-rerun-1",
			agentId: "kimi-code",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
			startInPlanMode: false,
			resumeFromTrash: false,
			workspaceId: "ws-rerun",
		});

		// Second run must strip the previous managed block AND preserve [models.X].
		await prepareAgentLaunch({
			taskId: "task-kimi-code-rerun-2",
			agentId: "kimi-code",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
			startInPlanMode: false,
			resumeFromTrash: false,
			workspaceId: "ws-rerun",
		});

		const finalConfig = readFileSync(join(kimiCodeDir, "config.toml"), "utf8");
		// [models.X] survives the strip/re-write cycle.
		expect(finalConfig).toContain('[models."kimi-code/kimi-for-coding"]');
		expect(finalConfig).toContain("max_context_size = 262144");
		// Only one managed-hooks block remains (no duplication).
		const markerCount = finalConfig.split("# Kanban-managed hooks for Kimi Code CLI").length - 1;
		expect(markerCount).toBe(1);
	});

	it("does not pollute kimi hooks dir when both kimi and kimi-code are launched in same env", async () => {
		const homePath = setupTempHome();
		// Seed user configs for both runtimes
		const kimiDir = join(homePath, ".kimi");
		const kimiCodeDir = join(homePath, ".kimi-code");
		mkdirSync(kimiDir, { recursive: true });
		mkdirSync(kimiCodeDir, { recursive: true });
		writeFileSync(join(kimiDir, "config.toml"), 'model = "k1"\n', "utf8");
		writeFileSync(join(kimiCodeDir, "config.toml"), 'model = "k2"\n', "utf8");

		await prepareAgentLaunch({
			taskId: "task-kimi",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "p1",
			startInPlanMode: false,
			resumeFromTrash: false,
			workspaceId: "ws",
		});
		await prepareAgentLaunch({
			taskId: "task-kimi-code",
			agentId: "kimi-code",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "p2",
			startInPlanMode: false,
			resumeFromTrash: false,
			workspaceId: "ws",
		});

		// kimi-cli still uses the hook-dir mirror.
		const kimiHookMirror = readFileSync(join(homePath, ".cline", "kanban", "hooks", "kimi", "config.toml"), "utf8");
		// kimi-code writes directly back into the user config.
		const kimiCodeUserConfig = readFileSync(join(homePath, ".kimi-code", "config.toml"), "utf8");
		expect(kimiHookMirror).toContain('model = "k1"');
		expect(kimiCodeUserConfig).toContain('model = "k2"');
		expect(kimiHookMirror).not.toContain('model = "k2"');
		expect(kimiCodeUserConfig).not.toContain('model = "k1"');

		// kimi-code must NOT have written to the hook-dir mirror at all.
		expect(existsSync(join(homePath, ".cline", "kanban", "hooks", "kimi-code", "config.toml"))).toBe(false);

		// kimi-cli's user config is left intact (mirror is a separate file).
		expect(readFileSync(join(homePath, ".kimi", "config.toml"), "utf8")).toBe('model = "k1"\n');
	});

	it("strips previous Kanban hooks when merging Kimi config", async () => {
		const homePath = setupTempHome();
		const kimiDir = join(homePath, ".kimi");
		mkdirSync(kimiDir, { recursive: true });
		writeFileSync(
			join(kimiDir, "config.toml"),
			'model = "kimi-k2"\n\n# Kanban-managed hooks for Kimi Code CLI\n[[hooks]]\nevent = "Stop"\ncommand = "old-command"\n',
			"utf8",
		);

		await prepareAgentLaunch({
			taskId: "task-kimi-restrip",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-3",
		});

		const configPath = join(homedir(), ".cline", "kanban", "hooks", "kimi", "config.toml");
		const configContent = readFileSync(configPath, "utf8");
		expect(configContent).toContain('model = "kimi-k2"');
		expect(configContent).not.toContain("old-command");
		expect(configContent).toContain("to_review");
	});

	it("strips previous inline Kanban hooks while preserving user Kimi hooks", async () => {
		const homePath = setupTempHome();
		const kimiDir = join(homePath, ".kimi");
		mkdirSync(kimiDir, { recursive: true });
		writeFileSync(
			join(kimiDir, "config.toml"),
			'hooks = [\n\t{ event = "Stop", command = "user-hook" },\n\t# Kanban-managed hooks for Kimi Code CLI\n\t{ event = "Stop", command = "old-command" },\n]\n',
			"utf8",
		);

		await prepareAgentLaunch({
			taskId: "task-kimi-inline-restrip",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-4",
		});

		const configPath = join(homedir(), ".cline", "kanban", "hooks", "kimi", "config.toml");
		const configContent = readFileSync(configPath, "utf8");
		expect(configContent).toContain("user-hook");
		expect(configContent).not.toContain("old-command");
		expect(configContent).toContain("to_review");
		expect(configContent.match(/^hooks\s*=/gmu)).toHaveLength(1);
	});

	it("materializes task images for CLI prompts", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-images",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "Inspect the attached design",
			images: [
				{
					id: "img-1",
					data: Buffer.from("hello").toString("base64"),
					mimeType: "image/png",
					name: "diagram.png",
				},
			],
		});

		const initialPrompt = launch.args.at(-1) ?? "";
		expect(initialPrompt).toContain("Attached reference images:");
		expect(initialPrompt).toContain("Task:\nInspect the attached design");

		const imagePathMatch = initialPrompt.match(/1\. (.+?) \(diagram\.png\)/);
		expect(imagePathMatch?.[1]).toBeDefined();
		const imagePath = imagePathMatch?.[1] ?? "";
		expect(existsSync(imagePath)).toBe(true);
		expect(readFileSync(imagePath).toString("utf8")).toBe("hello");
	});

	it("defers Codex plan-mode startup input until startup UI is ready", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-plan",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "Audit the deployment pipeline",
			startInPlanMode: true,
		});

		expect(launch.args).not.toContain("Audit the deployment pipeline");
		expect(launch.deferredStartupInput).toContain("\u001b[200~");
		expect(launch.deferredStartupInput).toContain("/plan Audit the deployment pipeline");
		expect(launch.deferredStartupInput?.endsWith("\r")).toBe(true);
	});

	it("defers a bare /plan command when Codex plan mode has no prompt text", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-plan-empty",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
			startInPlanMode: true,
		});

		expect(launch.deferredStartupInput).toContain("/plan");
		expect(launch.deferredStartupInput).not.toContain("/plan ");
		expect(launch.deferredStartupInput?.endsWith("\r")).toBe(true);
	});

	it("writes Cline hook scripts and injects --hooks-dir", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "cline",
			binary: "cline",
			args: [],
			cwd: "/tmp",
			prompt: "",
			workspaceId: "workspace-1",
		});

		const hooksDir = join(homedir(), ".cline", "kanban", "hooks", "cline");
		const notificationHookPath =
			process.platform === "win32" ? join(hooksDir, "Notification.ps1") : join(hooksDir, "Notification");
		const taskCompleteHookPath =
			process.platform === "win32" ? join(hooksDir, "TaskComplete.ps1") : join(hooksDir, "TaskComplete");
		const userPromptSubmitHookPath =
			process.platform === "win32" ? join(hooksDir, "UserPromptSubmit.ps1") : join(hooksDir, "UserPromptSubmit");
		const preToolUseHookPath =
			process.platform === "win32" ? join(hooksDir, "PreToolUse.ps1") : join(hooksDir, "PreToolUse");
		const postToolUseHookPath =
			process.platform === "win32" ? join(hooksDir, "PostToolUse.ps1") : join(hooksDir, "PostToolUse");

		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");

		const hooksDirArgIndex = launch.args.indexOf("--hooks-dir");
		expect(hooksDirArgIndex).toBeGreaterThanOrEqual(0);
		expect(launch.args[hooksDirArgIndex + 1]).toBe(hooksDir);

		expect(existsSync(notificationHookPath)).toBe(true);
		expect(existsSync(taskCompleteHookPath)).toBe(true);
		expect(existsSync(userPromptSubmitHookPath)).toBe(true);
		expect(existsSync(preToolUseHookPath)).toBe(true);
		expect(existsSync(postToolUseHookPath)).toBe(true);

		const notificationScript = readFileSync(notificationHookPath, "utf8");
		expect(notificationScript).toContain("hooks");
		expect(notificationScript).toContain("to_review");
		expect(notificationScript).toContain("user_attention");
		expect(notificationScript).toContain("completion_result");
		expect(notificationScript).toContain('{"cancel":false}');

		const taskCompleteScript = readFileSync(taskCompleteHookPath, "utf8");
		expect(taskCompleteScript).toContain("hooks");
		expect(taskCompleteScript).toContain("to_review");
		expect(taskCompleteScript).toContain('{"cancel":false}');

		const userPromptSubmitScript = readFileSync(userPromptSubmitHookPath, "utf8");
		expect(userPromptSubmitScript).toContain("hooks");
		expect(userPromptSubmitScript).toContain("to_in_progress");
		expect(userPromptSubmitScript).toContain('{"cancel":false}');

		const preToolUseScript = readFileSync(preToolUseHookPath, "utf8");
		expect(preToolUseScript).toContain("hooks");
		expect(preToolUseScript).toContain("activity");
		expect(preToolUseScript).toContain("to_in_progress");
		expect(preToolUseScript).toContain("to_review");
		expect(preToolUseScript).toContain("ask_followup_question");
		expect(preToolUseScript).toContain("plan_mode_respond");

		const postToolUseScript = readFileSync(postToolUseHookPath, "utf8");
		expect(postToolUseScript).toContain("hooks");
		expect(postToolUseScript).toContain("activity");
		expect(postToolUseScript).toContain("to_in_progress");
		expect(postToolUseScript).toContain("ask_followup_question");
		expect(postToolUseScript).toContain("plan_mode_respond");
	});

	it("adds resume flags for each agent", async () => {
		setupTempHome();

		const codexLaunch = await prepareAgentLaunch({
			taskId: "task-codex",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(codexLaunch.args).toEqual(expect.arrayContaining(["resume", "--last"]));

		const claudeLaunch = await prepareAgentLaunch({
			taskId: "task-claude",
			agentId: "claude",
			binary: "claude",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(claudeLaunch.args).toContain("--continue");

		const geminiLaunch = await prepareAgentLaunch({
			taskId: "task-gemini",
			agentId: "gemini",
			binary: "gemini",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(geminiLaunch.args).toEqual(expect.arrayContaining(["--resume", "latest"]));

		const opencodeLaunch = await prepareAgentLaunch({
			taskId: "task-opencode",
			agentId: "opencode",
			binary: "opencode",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(opencodeLaunch.args).toContain("--continue");

		const droidLaunch = await prepareAgentLaunch({
			taskId: "task-droid",
			agentId: "droid",
			binary: "droid",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(droidLaunch.args).toContain("--resume");

		const kiroLaunch = await prepareAgentLaunch({
			taskId: "task-kiro",
			agentId: "kiro",
			binary: "kiro-cli",
			args: ["chat"],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(kiroLaunch.args).toContain("--resume");

		const clineLaunch = await prepareAgentLaunch({
			taskId: "task-cline",
			agentId: "cline",
			binary: "cline",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(clineLaunch.args).toContain("--continue");

		const kimiLaunch = await prepareAgentLaunch({
			taskId: "task-kimi",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
		});
		expect(kimiLaunch.args).toContain("--continue");
	});

	it("places Codex hook config before the resume subcommand", async () => {
		setupTempHome();
		const launch = await prepareAgentLaunch({
			taskId: "task-codex-resume-hooks",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp",
			prompt: "",
			resumeFromTrash: true,
			workspaceId: "workspace-1",
		});

		const resumeIndex = launch.args.indexOf("resume");
		expect(resumeIndex).toBeGreaterThan(0);
		for (const key of [
			"features.hooks",
			"hooks.state",
			"hooks.UserPromptSubmit",
			"hooks.Stop",
			"hooks.PermissionRequest",
			"hooks.PreToolUse",
			"hooks.PostToolUse",
		]) {
			const configIndex = launch.args.findIndex((arg) => arg.startsWith(`${key}=`));
			expect(configIndex).toBeGreaterThan(-1);
			expect(configIndex).toBeLessThan(resumeIndex);
		}
	});

	it("applies autonomous mode flags in adapters for non-droid CLIs", async () => {
		setupTempHome();

		const claudeLaunch = await prepareAgentLaunch({
			taskId: "task-claude-auto",
			agentId: "claude",
			binary: "claude",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(claudeLaunch.args).toContain("--dangerously-skip-permissions");

		const codexLaunch = await prepareAgentLaunch({
			taskId: "task-codex-auto",
			agentId: "codex",
			binary: "codex",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(codexLaunch.args).toContain("--dangerously-bypass-approvals-and-sandbox");

		const geminiLaunch = await prepareAgentLaunch({
			taskId: "task-gemini-auto",
			agentId: "gemini",
			binary: "gemini",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(geminiLaunch.args).toContain("--yolo");

		const kiroLaunch = await prepareAgentLaunch({
			taskId: "task-kiro-auto",
			agentId: "kiro",
			binary: "kiro-cli",
			args: ["chat"],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(kiroLaunch.args).toContain("--trust-all-tools");

		const clineLaunch = await prepareAgentLaunch({
			taskId: "task-cline-auto",
			agentId: "cline",
			binary: "cline",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(clineLaunch.args).toContain("--auto-approve-all");

		const kimiLaunch = await prepareAgentLaunch({
			taskId: "task-kimi-auto",
			agentId: "kimi",
			binary: "kimi",
			args: [],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(kimiLaunch.args).toContain("--afk");

		const antccLaunch = await prepareAgentLaunch({
			taskId: "task-antcc-auto",
			agentId: "antcc",
			binary: "cfuse",
			args: ["--cc"],
			autonomousModeEnabled: true,
			cwd: "/tmp",
			prompt: "",
		});
		expect(antccLaunch.args).toContain("--cc");
		expect(antccLaunch.args).toContain("--dangerously-skip-permissions");
	});

	it("preserves explicit autonomous args when autonomous mode is disabled", async () => {
		setupTempHome();

		const claudeLaunch = await prepareAgentLaunch({
			taskId: "task-claude-no-auto",
			agentId: "claude",
			binary: "claude",
			args: ["--dangerously-skip-permissions"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(claudeLaunch.args).toContain("--dangerously-skip-permissions");

		const codexLaunch = await prepareAgentLaunch({
			taskId: "task-codex-no-auto",
			agentId: "codex",
			binary: "codex",
			args: ["--dangerously-bypass-approvals-and-sandbox"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(codexLaunch.args).toContain("--dangerously-bypass-approvals-and-sandbox");

		const geminiLaunch = await prepareAgentLaunch({
			taskId: "task-gemini-no-auto",
			agentId: "gemini",
			binary: "gemini",
			args: ["--yolo"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(geminiLaunch.args).toContain("--yolo");

		const clineLaunch = await prepareAgentLaunch({
			taskId: "task-cline-no-auto",
			agentId: "cline",
			binary: "cline",
			args: ["--auto-approve-all"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(clineLaunch.args).toContain("--auto-approve-all");

		const kiroLaunch = await prepareAgentLaunch({
			taskId: "task-kiro-no-auto",
			agentId: "kiro",
			binary: "kiro-cli",
			args: ["chat", "--trust-all-tools"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(kiroLaunch.args).toContain("--trust-all-tools");

		const kimiAfkLaunch = await prepareAgentLaunch({
			taskId: "task-kimi-no-auto-afk",
			agentId: "kimi",
			binary: "kimi",
			args: ["--afk"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(kimiAfkLaunch.args).toContain("--afk");
		expect(kimiAfkLaunch.args.filter((a) => a === "--afk")).toHaveLength(1);

		const kimiYoloLaunch = await prepareAgentLaunch({
			taskId: "task-kimi-no-auto-yolo",
			agentId: "kimi",
			binary: "kimi",
			args: ["--yolo"],
			autonomousModeEnabled: false,
			cwd: "/tmp",
			prompt: "",
		});
		expect(kimiYoloLaunch.args).toContain("--yolo");
		expect(kimiYoloLaunch.args).not.toContain("--afk");
	});
});
