import { beforeEach, describe, expect, it, vi } from "vitest";

const commandDiscoveryMocks = vi.hoisted(() => ({
	isBinaryAvailableOnPath: vi.fn(),
}));

vi.mock("../../../src/terminal/command-discovery.js", () => ({
	isBinaryAvailableOnPath: commandDiscoveryMocks.isBinaryAvailableOnPath,
}));

import { createDefaultConfiguredAgents } from "../../../src/config/runtime-agent-config";
import type { RuntimeConfigState } from "../../../src/config/runtime-config";
import {
	buildRuntimeConfigResponse,
	detectInstalledCommands,
	resolveAgentCommand,
} from "../../../src/terminal/agent-registry";

function createRuntimeConfigState(overrides: Partial<RuntimeConfigState> = {}): RuntimeConfigState {
	return {
		globalConfigPath: "/tmp/global-config.json",
		projectConfigPath: "/tmp/project-config.json",
		selectedAgentId: "claude",
		selectedAgentInstanceId: "claude",
		configuredAgents: [
			{
				id: "claude",
				type: "claude",
				alias: null,
				command: "claude",
			},
			{
				id: "codex",
				type: "codex",
				alias: null,
				command: "codex",
			},
			{
				id: "cline",
				type: "cline",
				alias: null,
				command: "cline",
			},
			{
				id: "kimi",
				type: "kimi",
				alias: null,
				command: "kimi",
			},
		],
		selectedShortcutLabel: null,
		agentAutonomousModeEnabled: true,
		readyForReviewNotificationsEnabled: true,
		shortcuts: [],
		commitPromptTemplate: "commit",
		openPrPromptTemplate: "pr",
		commitPromptTemplateDefault: "commit",
		openPrPromptTemplateDefault: "pr",
		antcodeToken: null,
		autoCrEnabled: false,
		autoCrAgentInstanceIds: [],
		autoCrScanIntervalMinutes: 45,
		...overrides,
	};
}

function createClineProviderSettings() {
	return {
		providerId: null,
		modelId: null,
		baseUrl: null,
		apiKeyConfigured: false,
		oauthProvider: null,
		oauthAccessTokenConfigured: false,
		oauthRefreshTokenConfigured: false,
		oauthAccountId: null,
		oauthExpiresAt: null,
	};
}

beforeEach(() => {
	commandDiscoveryMocks.isBinaryAvailableOnPath.mockReset();
	commandDiscoveryMocks.isBinaryAvailableOnPath.mockReturnValue(false);
	delete process.env.KANBAN_DEBUG_MODE;
	delete process.env.DEBUG_MODE;
	delete process.env.debug_mode;
});

describe("agent-registry", () => {
	it("detects installed commands from the inherited PATH", () => {
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation((binary: string) => binary === "claude");

		const detected = detectInstalledCommands();

		expect(detected).toEqual(["claude"]);
		expect(commandDiscoveryMocks.isBinaryAvailableOnPath).toHaveBeenCalledTimes(11);
	});

	it("treats shell-only agents as unavailable", () => {
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation((binary: string) => binary === "npx");

		const resolved = resolveAgentCommand(createRuntimeConfigState({ selectedAgentId: "claude" }));

		expect(resolved).toBeNull();
	});

	it("requires the configured cline binary to exist on PATH", () => {
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockReturnValue(false);

		const resolved = resolveAgentCommand(
			createRuntimeConfigState({
				selectedAgentId: "cline",
				selectedAgentInstanceId: "cline",
				configuredAgents: [
					{
						id: "cline",
						type: "cline",
						alias: "Broken Cline",
						command: "missing-cline --auto-approve-all",
					},
				],
			}),
		);

		expect(resolved).toBeNull();
	});
});

describe("buildRuntimeConfigResponse", () => {
	it("builds agent definitions from configured instances with aliases", () => {
		const response = buildRuntimeConfigResponse(
			createRuntimeConfigState({
				selectedAgentId: "claude",
				selectedAgentInstanceId: "claude-kimi",
				configuredAgents: [
					{
						id: "claude-kimi",
						type: "claude",
						alias: "Claude Code KIMI",
						command: 'ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1" claude --model kimi-k2.6',
					},
				],
			}),
			createClineProviderSettings(),
		);

		expect(response.selectedAgentInstanceId).toBe("claude-kimi");
		expect(response.agents[0]).toMatchObject({
			id: "claude-kimi",
			type: "claude",
			label: "Claude Code KIMI",
			defaultLabel: "Claude Code",
			alias: "Claude Code KIMI",
			command: 'ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1" claude --model kimi-k2.6',
			configured: true,
		});
	});

	it("resolves a configured agent command into env, binary, and args", () => {
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation((binary: string) => binary === "claude");

		const resolved = resolveAgentCommand(
			createRuntimeConfigState({
				selectedAgentId: "claude",
				selectedAgentInstanceId: "claude-theta",
				configuredAgents: [
					{
						id: "claude-theta",
						type: "claude",
						alias: "Claude Code Theta",
						command:
							'ANTHROPIC_BASE_URL="https://antchat.alipay.com/api/anthropic" claude --dangerously-skip-permissions --model GLM-5',
					},
				],
			}),
		);

		expect(resolved).toMatchObject({
			agentInstanceId: "claude-theta",
			agentId: "claude",
			label: "Claude Code Theta",
			binary: "claude",
			args: ["--dangerously-skip-permissions", "--model", "GLM-5"],
			env: {
				ANTHROPIC_BASE_URL: "https://antchat.alipay.com/api/anthropic",
			},
		});
	});

	it("marks configured instances with invalid commands as unavailable", () => {
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation((binary: string) => binary === "claude");

		const response = buildRuntimeConfigResponse(
			createRuntimeConfigState({
				selectedAgentId: "claude",
				selectedAgentInstanceId: "claude-broken",
				configuredAgents: [
					{
						id: "claude-broken",
						type: "claude",
						alias: "Broken Claude",
						command: 'ANTHROPIC_BASE_URL="https://example.com"',
					},
				],
			}),
			createClineProviderSettings(),
		);

		expect(response.agents[0]).toMatchObject({
			id: "claude-broken",
			installed: false,
		});
		expect(response.effectiveCommand).toBeNull();
	});

	it("keeps curated agent default args independent of autonomous mode", () => {
		const config = createRuntimeConfigState({
			agentAutonomousModeEnabled: true,
			configuredAgents: [
				{ id: "claude", type: "claude", alias: null, command: "claude" },
				{ id: "codex", type: "codex", alias: null, command: "codex" },
				{ id: "cline", type: "cline", alias: null, command: "cline" },
				{ id: "kimi", type: "kimi", alias: null, command: "kimi" },
				{ id: "kimi-code", type: "kimi-code", alias: null, command: "kimi" },
			],
		});
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation((binary: string) => binary === "cline");

		const response = buildRuntimeConfigResponse(config, createClineProviderSettings());

		expect(response.agentAutonomousModeEnabled).toBe(true);
		expect(response.agents.map((agent) => agent.id)).toEqual(["claude", "codex", "cline", "kimi", "kimi-code"]);
		expect(response.agents.find((agent) => agent.id === "claude")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "codex")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "cline")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "kimi")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "kimi-code")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "cline")?.installed).toBe(true);
	});

	it("omits autonomous flags from curated agent commands when disabled", () => {
		const config = createRuntimeConfigState({
			agentAutonomousModeEnabled: false,
			configuredAgents: [
				{ id: "claude", type: "claude", alias: null, command: "claude" },
				{ id: "codex", type: "codex", alias: null, command: "codex" },
				{ id: "cline", type: "cline", alias: null, command: "cline" },
				{ id: "kimi", type: "kimi", alias: null, command: "kimi" },
				{ id: "kimi-code", type: "kimi-code", alias: null, command: "kimi" },
			],
		});
		commandDiscoveryMocks.isBinaryAvailableOnPath.mockImplementation(
			(binary: string) => binary === "claude" || binary === "cline",
		);

		const response = buildRuntimeConfigResponse(config, createClineProviderSettings());

		expect(response.agentAutonomousModeEnabled).toBe(false);
		expect(response.agents.map((agent) => agent.id)).toEqual(["claude", "codex", "cline", "kimi", "kimi-code"]);
		expect(response.agents.find((agent) => agent.id === "claude")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "codex")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "cline")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "kimi")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "kimi-code")?.defaultArgs).toEqual([]);
		expect(response.agents.find((agent) => agent.id === "cline")?.installed).toBe(true);
		expect(response.agents.find((agent) => agent.id === "claude")?.command).toBe("claude");
		expect(response.agents.find((agent) => agent.id === "codex")?.command).toBe("codex");
		expect(response.agents.find((agent) => agent.id === "cline")?.command).toBe("cline");
	});

	it("registers a default kimi-code configured agent instance", () => {
		const defaults = createDefaultConfiguredAgents();
		const kimiCode = defaults.find((agent) => agent.type === "kimi-code");
		expect(kimiCode).toBeDefined();
		expect(kimiCode?.id).toBe("kimi-code");
		expect(kimiCode?.command).toBe("kimi");
	});

	it("sets debug mode from runtime environment variables", () => {
		process.env.KANBAN_DEBUG_MODE = "true";
		const response = buildRuntimeConfigResponse(createRuntimeConfigState(), createClineProviderSettings());
		expect(response.debugModeEnabled).toBe(true);
	});

	it("supports debug_mode fallback env name", () => {
		process.env.debug_mode = "1";
		const response = buildRuntimeConfigResponse(createRuntimeConfigState(), createClineProviderSettings());
		expect(response.debugModeEnabled).toBe(true);
	});
});
