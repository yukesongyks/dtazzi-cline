/**
 * Normalized data model for the test-report skill.
 *
 * All parsers reduce their framework-specific shape into one {@link TestRunResult}.
 * This is the single contract the reporter depends on, which is what makes the plugin
 * model safe (NFR5) and idempotency achievable (NFR4). Every field is optional-aware
 * for NFR2 degradation: missing numeric/optional fields never crash the reporter; they
 * render as "未获取" (S5).
 *
 * @see openspec/changes/add-test-report-skill/design.md §2
 */
import { z } from "zod";

/** Per-test-case normalized record. */
export const TestCaseSchema = z.object({
	name: z.string(),
	/** Owning file; rendered "未获取" when absent. */
	file: z.string().optional(),
	status: z.enum(["passed", "failed", "skipped", "todo"]),
	durationMs: z.number().nonnegative().optional(),
	errorMessage: z.string().optional(),
	/** Pre-truncated, pre-redacted stack frames. */
	stackLines: z.array(z.string()).default([]),
});

/** Per-file coverage row. All metrics are percentages 0-100 (optional). */
export const CoverageRowSchema = z.object({
	file: z.string(),
	statements: z.number().optional(),
	branches: z.number().optional(),
	functions: z.number().optional(),
	lines: z.number().optional(),
});

/** Coverage block. `obtained=false` → render "未获取". */
export const CoverageSchema = z.object({
	overall: CoverageRowSchema.partial().optional(),
	byFile: z.array(CoverageRowSchema).default([]),
	belowThreshold: z.array(z.string()).default([]),
	obtained: z.boolean(),
});

/** Normalized test run result — the single reporter contract. */
export const TestRunResultSchema = z.object({
	framework: z.string(),
	frameworkVersion: z.string().optional(),
	command: z.string().optional(),
	/** Sanitized environment summary only (e.g. "Node 22, Linux x64"); never raw env. */
	env: z.string().optional(),
	totals: z.object({
		total: z.number().int(),
		passed: z.number().int(),
		failed: z.number().int(),
		skipped: z.number().int(),
		durationMs: z.number().nonnegative().optional(),
	}),
	cases: z.array(TestCaseSchema),
	coverage: CoverageSchema.optional(),
	/** Source files referenced by failures (for appendix). */
	sourceFiles: z.array(z.string()).default([]),
	/** Original result artifact paths (for appendix). */
	sourceArtifactPaths: z.array(z.string()).default([]),
});

export type TestCase = z.infer<typeof TestCaseSchema>;
export type CoverageRow = z.infer<typeof CoverageRowSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type TestRunResult = z.infer<typeof TestRunResultSchema>;

/**
 * Best-effort safe parse: fills defaults for missing optional/empty fields so a
 * *parseable* file never crashes the reporter (NFR2). Hard corruption (unparseable
 * JSON/XML) is handled earlier by parsers throwing {@link ParseError} (AC4).
 */
export function safeParseResult(data: unknown): TestRunResult {
	const parsed = TestRunResultSchema.safeParse(data);
	if (parsed.success) {
		return parsed.data;
	}
	// Degradation: coerce to a minimal valid shape so the reporter keeps working.
	const anyData = (data ?? {}) as Record<string, unknown>;
	const totals =
		(anyData.totals as Record<string, unknown> | undefined) ?? {};
	return {
		framework: typeof anyData.framework === "string" ? anyData.framework : "未获取",
		frameworkVersion:
			typeof anyData.frameworkVersion === "string"
				? anyData.frameworkVersion
				: undefined,
		command:
			typeof anyData.command === "string" ? anyData.command : undefined,
		env: typeof anyData.env === "string" ? anyData.env : undefined,
		totals: {
			total: toInt(totals.total) ?? 0,
			passed: toInt(totals.passed) ?? 0,
			failed: toInt(totals.failed) ?? 0,
			skipped: toInt(totals.skipped) ?? 0,
			durationMs: toNonNeg(totals.durationMs),
		},
		cases: Array.isArray(anyData.cases) ? (anyData.cases as TestCase[]) : [],
		coverage: anyData.coverage as Coverage | undefined,
		sourceFiles: Array.isArray(anyData.sourceFiles)
			? (anyData.sourceFiles as string[])
			: [],
		sourceArtifactPaths: Array.isArray(anyData.sourceArtifactPaths)
			? (anyData.sourceArtifactPaths as string[])
			: [],
	};
}

function toInt(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) {
		return Math.trunc(v);
	}
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		if (Number.isFinite(n)) return Math.trunc(n);
	}
	return undefined;
}

function toNonNeg(v: unknown): number | undefined {
	const n = toInt(v);
	return n !== undefined && n >= 0 ? n : undefined;
}
