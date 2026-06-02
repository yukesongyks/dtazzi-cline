import { describe, expect, it } from "vitest";

import {
	CONFIGURABLE_AGENT_TYPES,
	createDefaultConfiguredAgents,
	isConfigurableAgentType,
	normalizeConfiguredAgents,
} from "../../../src/config/runtime-agent-config";

describe("runtime-agent-config kimi-code support", () => {
	it("includes kimi-code in CONFIGURABLE_AGENT_TYPES", () => {
		expect(CONFIGURABLE_AGENT_TYPES).toContain("kimi-code");
		expect(CONFIGURABLE_AGENT_TYPES).toHaveLength(5);
	});

	it("recognises kimi-code via isConfigurableAgentType", () => {
		expect(isConfigurableAgentType("kimi-code")).toBe(true);
		expect(isConfigurableAgentType("kimi-cli")).toBe(false);
		expect(isConfigurableAgentType("kimi")).toBe(true);
	});

	it("creates a default kimi-code instance", () => {
		const defaults = createDefaultConfiguredAgents();
		const kimiCode = defaults.find((agent) => agent.type === "kimi-code");
		expect(kimiCode).toBeDefined();
		expect(kimiCode?.id).toBe("kimi-code");
		expect(kimiCode?.command).toBe("kimi");
	});

	it("normalises a user-defined kimi-code instance", () => {
		const result = normalizeConfiguredAgents([
			{ id: "my-kimi-code", type: "kimi-code", alias: "Local Kimi Code", command: "/opt/bin/kimi" },
		]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "my-kimi-code",
			type: "kimi-code",
			alias: "Local Kimi Code",
			command: "/opt/bin/kimi",
		});
	});
});
