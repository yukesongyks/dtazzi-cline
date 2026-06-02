import type { RuntimeConfigState } from "../config/runtime-config";
import { getRuntimeLaunchSupportedAgentCatalog, RUNTIME_AGENT_CATALOG } from "../core/agent-catalog";
import { parseConfiguredAgentCommand } from "../core/agent-command";
import type {
	RuntimeAgentDefinition,
	RuntimeAgentId,
	RuntimeClineProviderSettings,
	RuntimeConfigResponse,
	RuntimeConfiguredAgent,
} from "../core/api-contract";
import { getAgentDefaultLabel } from "../config/runtime-agent-config";
import { isBinaryAvailableOnPath } from "./command-discovery";
import { spawn } from "node:child_process";

export interface ResolvedAgentCommand {
	agentInstanceId: string;
	agentId: RuntimeAgentId;
	label: string;
	command: string;
	binary: string;
	args: string[];
	env: Record<string, string>;
}

export interface AgentInstallCheckResult {
	installed: boolean;
	resolvedBinary: string;
	version?: string;
}

function getDefaultArgs(agentId: RuntimeAgentId): string[] {
	const entry = RUNTIME_AGENT_CATALOG.find((candidate) => candidate.id === agentId);
	if (!entry) {
		return [];
	}
	return [...entry.baseArgs];
}

function quoteForDisplay(part: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(part)) {
		return part;
	}
	return JSON.stringify(part);
}

function joinCommand(binary: string, args: string[]): string {
	if (args.length === 0) {
		return binary;
	}
	return [binary, ...args.map(quoteForDisplay)].join(" ");
}

function parseBooleanEnvValue(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isRuntimeDebugModeEnabled(): boolean {
	const debugModeValue = process.env.KANBAN_DEBUG_MODE ?? process.env.DEBUG_MODE ?? process.env.debug_mode;
	return parseBooleanEnvValue(debugModeValue);
}

function tryGetVersion(binary: string, timeoutMs = 5000): Promise<string | undefined> {
	return new Promise((resolve) => {
		try {
			const proc = spawn(binary, ["--version"], {
				timeout: timeoutMs,
				stdio: ["ignore", "pipe", "ignore"],
			});
			let stdout = "";
			proc.stdout?.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			proc.on("close", (code) => {
				if (code === 0 && stdout.trim()) {
					resolve(stdout.trim().split("\n")[0]);
				} else {
					resolve(undefined);
				}
			});
			proc.on("error", () => {
				resolve(undefined);
			});
		} catch {
			resolve(undefined);
		}
	});
}

export async function detectAgentInstallation(command: string): Promise<AgentInstallCheckResult> {
	const parsedCommand = parseConfiguredAgentCommand(command);
	if (!parsedCommand.ok) {
		return {
			installed: false,
			resolvedBinary: command,
		};
	}

	const { binary } = parsedCommand.value;
	const isAbsolutePath = binary.includes("/") || binary.includes("\\");

	if (isAbsolutePath) {
		const exists = isBinaryAvailableOnPath(binary);
		const version = exists ? await tryGetVersion(binary) : undefined;
		return {
			installed: exists,
			resolvedBinary: binary,
			version,
		};
	}

	const exists = isBinaryAvailableOnPath(binary);
	const version = exists ? await tryGetVersion(binary) : undefined;
	return {
		installed: exists,
		resolvedBinary: binary,
		version,
	};
}

export function detectInstalledCommands(): string[] {
	const candidates = [...RUNTIME_AGENT_CATALOG.map((entry) => entry.binary), "npx"];
	const detected: string[] = [];

	for (const candidate of candidates) {
		if (isBinaryAvailableOnPath(candidate)) {
			detected.push(candidate);
		}
	}

	return detected;
}

function getCuratedDefinitions(runtimeConfig: RuntimeConfigState, detected: string[]): RuntimeAgentDefinition[] {
	const detectedSet = new Set(detected);
	return runtimeConfig.configuredAgents.map((agent) => {
		const defaultArgs = getDefaultArgs(agent.type);
		const parsedCommand = parseConfiguredAgentCommand(agent.command);
		const binary = parsedCommand.ok ? parsedCommand.value.binary : agent.type;
		const defaultLabel = getAgentDefaultLabel(agent.type);
		const isInstalled = parsedCommand.ok ? detectedSet.has(binary) : false;

		return {
			id: agent.id,
			type: agent.type,
			label: agent.alias ?? defaultLabel,
			defaultLabel,
			alias: agent.alias,
			binary,
			command: agent.command,
			defaultArgs,
			installed: isInstalled,
			configured: runtimeConfig.selectedAgentInstanceId === agent.id,
			builtin: true,
		};
	});
}

export function resolveAgentCommand(
	runtimeConfig: RuntimeConfigState,
	overrideInstanceId?: string,
): ResolvedAgentCommand | null {
	const instanceId = overrideInstanceId ?? runtimeConfig.selectedAgentInstanceId;
	const selected = runtimeConfig.configuredAgents.find((agent) => agent.id === instanceId);
	if (!selected) {
		return null;
	}
	const parsedCommand = parseConfiguredAgentCommand(selected.command);
	if (!parsedCommand.ok) {
		return null;
	}
	if (isBinaryAvailableOnPath(parsedCommand.value.binary)) {
		return {
			agentInstanceId: selected.id,
			agentId: selected.type,
			label: selected.alias ?? getAgentDefaultLabel(selected.type),
			command: selected.command,
			binary: parsedCommand.value.binary,
			args: parsedCommand.value.args,
			env: parsedCommand.value.env,
		};
	}
	return null;
}

export function buildRuntimeConfigResponse(
	runtimeConfig: RuntimeConfigState,
	clineProviderSettings: RuntimeClineProviderSettings,
): RuntimeConfigResponse {
	const detectedCommands = detectInstalledCommands();
	const agents = getCuratedDefinitions(runtimeConfig, detectedCommands);
	const resolved = resolveAgentCommand(runtimeConfig);
	const effectiveCommand = resolved ? joinCommand(resolved.binary, resolved.args) : null;

	return {
		selectedAgentId: runtimeConfig.selectedAgentId,
		selectedAgentInstanceId: runtimeConfig.selectedAgentInstanceId,
		selectedShortcutLabel: runtimeConfig.selectedShortcutLabel,
		agentAutonomousModeEnabled: runtimeConfig.agentAutonomousModeEnabled,
		debugModeEnabled: isRuntimeDebugModeEnabled(),
		effectiveCommand,
		globalConfigPath: runtimeConfig.globalConfigPath,
		projectConfigPath: runtimeConfig.projectConfigPath,
		readyForReviewNotificationsEnabled: runtimeConfig.readyForReviewNotificationsEnabled,
		detectedCommands,
		agents,
		configuredAgents: runtimeConfig.configuredAgents,
		shortcuts: runtimeConfig.shortcuts,
		clineProviderSettings,
		commitPromptTemplate: runtimeConfig.commitPromptTemplate,
		openPrPromptTemplate: runtimeConfig.openPrPromptTemplate,
		commitPromptTemplateDefault: runtimeConfig.commitPromptTemplateDefault,
		openPrPromptTemplateDefault: runtimeConfig.openPrPromptTemplateDefault,
		antcodeToken: runtimeConfig.antcodeToken,
		autoCrEnabled: runtimeConfig.autoCrEnabled,
		autoCrAgentInstanceIds: runtimeConfig.autoCrAgentInstanceIds,
		autoCrScanIntervalMinutes: runtimeConfig.autoCrScanIntervalMinutes,
	};
}
