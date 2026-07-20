/**
 * Config resolution (CAP-7): defaults + zod-validated overrides.
 * @see openspec/changes/add-test-report-skill/design.md §1 (config.ts) and proposal CAP-7.
 */
import { z } from "zod";

export const OutputFormatSchema = z.enum(["markdown", "html", "json"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const CoverageModeSchema = z.enum(["auto", "on", "off"]);
export type CoverageMode = z.infer<typeof CoverageModeSchema>;

export const ConfigSchema = z.object({
	testCommand: z.string().optional(),
	resultFile: z.string().optional(),
	outputFormat: OutputFormatSchema.default("markdown"),
	outputPath: z.string().default("reports/"),
	coverage: CoverageModeSchema.default("auto"),
	/** Pass-rate threshold in 0..1; when set and pass rate < threshold → 不达标. */
	failThreshold: z.number().min(0).max(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
	outputFormat: "markdown",
	outputPath: "reports/",
	coverage: "auto",
};

/**
 * Resolve a config from optional user overrides. Defaults win when an override is
 * absent; override wins when present. Invalid values fall back to defaults rather
 * than throwing (NFR2 robustness).
 */
export function resolveConfig(overrides?: Partial<Config>): Config {
	const merged: Record<string, unknown> = { ...DEFAULT_CONFIG, ...(overrides ?? {}) };
	const parsed = ConfigSchema.safeParse(merged);
	if (parsed.success) {
		return parsed.data;
	}
	// Fall back to defaults for any field that failed validation.
	return { ...DEFAULT_CONFIG, ...(overrides ?? {}) } as Config;
}
