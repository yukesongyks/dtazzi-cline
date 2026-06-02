import { randomUUID } from "node:crypto";

import { getRuntimeAgentCatalogEntry, getRuntimeLaunchSupportedAgentCatalog } from "../core/agent-catalog";
import type { RuntimeAgentId, RuntimeConfigurableAgentType, RuntimeConfiguredAgent } from "../core/api-contract";

export const DEFAULT_SELECTED_AGENT_INSTANCE_ID = "cline";
export const CONFIGURABLE_AGENT_TYPES: readonly RuntimeConfigurableAgentType[] = [
	"cline",
	"claude",
	"codex",
	"kimi",
	"kimi-code",
	"cfuse",
];

export function isConfigurableAgentType(value: unknown): value is RuntimeConfigurableAgentType {
	return (
		value === "cline" ||
		value === "claude" ||
		value === "codex" ||
		value === "kimi" ||
		value === "kimi-code" ||
		value === "cfuse"
	);
}

export function createDefaultConfiguredAgents(): RuntimeConfiguredAgent[] {
	const supportedTypes = new Set(getRuntimeLaunchSupportedAgentCatalog().map((entry) => entry.id));
	return CONFIGURABLE_AGENT_TYPES.flatMap((type) => {
		if (!supportedTypes.has(type)) {
			return [];
		}
		const entry = getRuntimeAgentCatalogEntry(type);
		if (!entry) {
			return [];
		}
		return [
			{
				id: type,
				type,
				alias: null,
				command: [entry.binary, ...entry.baseArgs].join(" ").trim(),
			},
		];
	});
}

export function createAgentInstanceId(type: RuntimeConfigurableAgentType): string {
	return `${type}-${randomUUID().slice(0, 8)}`;
}

export function normalizeConfiguredAgents(value: unknown): RuntimeConfiguredAgent[] {
	if (!Array.isArray(value)) {
		return createDefaultConfiguredAgents();
	}

	const seen = new Set<string>();
	const normalized: RuntimeConfiguredAgent[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") {
			continue;
		}

		const candidate = item as {
			id?: unknown;
			type?: unknown;
			alias?: unknown;
			command?: unknown;
		};
		const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
		const command = typeof candidate.command === "string" ? candidate.command.trim() : "";
		if (!id || seen.has(id) || !isConfigurableAgentType(candidate.type) || !command) {
			continue;
		}

		seen.add(id);
		const alias =
			typeof candidate.alias === "string" && candidate.alias.trim().length > 0 ? candidate.alias.trim() : null;
		normalized.push({
			id,
			type: candidate.type,
			alias,
			command,
		});
	}

	return normalized.length > 0 ? normalized : createDefaultConfiguredAgents();
}

export function normalizeSelectedAgentInstanceId(
	value: unknown,
	agents: readonly RuntimeConfiguredAgent[],
	legacySelectedAgentId: RuntimeAgentId,
): string {
	const normalizedValue = typeof value === "string" ? value.trim() : "";
	if (normalizedValue && agents.some((agent) => agent.id === normalizedValue)) {
		return normalizedValue;
	}

	return (
		agents.find((agent) => agent.type === legacySelectedAgentId)?.id ??
		agents.find((agent) => agent.id === DEFAULT_SELECTED_AGENT_INSTANCE_ID)?.id ??
		agents[0]?.id ??
		DEFAULT_SELECTED_AGENT_INSTANCE_ID
	);
}

export function getAgentTypeForInstance(
	agents: readonly RuntimeConfiguredAgent[],
	instanceId: string,
): RuntimeConfigurableAgentType {
	return agents.find((agent) => agent.id === instanceId)?.type ?? agents[0]?.type ?? "cline";
}

export function getAgentDefaultLabel(type: RuntimeConfigurableAgentType): string {
	return getRuntimeAgentCatalogEntry(type)?.label ?? type;
}
