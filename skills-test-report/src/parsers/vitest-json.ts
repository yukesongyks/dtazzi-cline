/**
 * Vitest JSON reporter parser (CAP-3).
 *
 * Vitest's `--reporter=json` emits `{ numTotalTests, numPassedTests, numFailedTests,
 * numPendingTests, testResults: [{ name, assertionResults: [{ name, status, duration,
 * errors, location }] }] }`. Mapped to {@link TestRunResult}. Hard corruption throws
 * {@link ParseError} (AC4).
 *
 * @see openspec/changes/add-test-report-skill/design.md §3
 */
import type { TestCase, TestRunResult } from "../models";
import { safeParseResult } from "../models";
import { ParseError, type ParserInput, type TestResultParser } from "./registry";

const PARSER_ID = "vitest-json";

interface VitestRoot {
	numTotalTests?: number;
	numPassedTests?: number;
	numFailedTests?: number;
	numPendingTests?: number;
	numTodoTests?: number;
	startTime?: number;
	duration?: number;
	testResults?: VitestFile[];
}

interface VitestFile {
	name?: string;
	assertionResults?: VitestAssertion[];
}

interface VitestAssertion {
	fullName?: string;
	name?: string;
	status?: string;
	duration?: { seconds?: number; ms?: number; nanoseconds?: number };
	errors?: VitestError[];
	location?: { file?: string };
}

interface VitestError {
	name?: string;
	message?: string;
	stack?: string;
}

export class VitestJsonParser implements TestResultParser {
	readonly id = PARSER_ID;
	readonly displayName = "Vitest JSON";

	canDetect(input: ParserInput): boolean {
		if (input.frameworkHint === PARSER_ID) return true;
		const text = input.rawText.trimStart();
		if (!text.startsWith("{")) return false;
		// Disambiguate from Jest: prefer vitest-specific field names.
		try {
			const obj = JSON.parse(input.rawText) as Record<string, unknown>;
			if ("numTodoTests" in obj) return true;
			const tr = (obj.testResults ?? []) as Array<Record<string, unknown>>;
			if (tr.length > 0 && tr[0]?.assertionResults !== undefined) {
				const ar = (tr[0].assertionResults ?? []) as Array<Record<string, unknown>>;
				if (ar.length > 0 && "duration" in ar[0] && typeof ar[0].duration === "object") {
					return true;
				}
			}
			return false;
		} catch {
			return false;
		}
	}

	async parse(input: ParserInput): Promise<TestRunResult> {
		let root: VitestRoot;
		try {
			root = JSON.parse(input.rawText) as VitestRoot;
		} catch (e) {
			throw new ParseError(
				PARSER_ID,
				`无法解析 Vitest JSON: ${(e as Error).message}`,
				input.filePath,
			);
		}
		if (!Array.isArray(root.testResults) && root.numTotalTests === undefined) {
			throw new ParseError(
				PARSER_ID,
				"Vitest JSON 缺少 testResults / numTotalTests 字段",
				input.filePath,
			);
		}

		const cases: TestCase[] = [];
		const files = Array.isArray(root.testResults) ? root.testResults : [];
		for (const file of files) {
			const fileRoot = file.name;
			const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
			for (const a of assertions) {
				const name = a.fullName ?? a.name ?? "未获取";
				const status = mapStatus(a.status);
				const { errorMessage, stackLines } = extractFailure(a);
				cases.push({
					name,
					file: fileRoot ?? a.location?.file,
					status,
					durationMs: toMs(a.duration),
					errorMessage,
					stackLines,
				});
			}
		}

		const total = root.numTotalTests ?? cases.length;
		const passed = root.numPassedTests ?? cases.filter((c) => c.status === "passed").length;
		const failed = root.numFailedTests ?? cases.filter((c) => c.status === "failed").length;
		const skipped =
			(root.numPendingTests ?? 0) +
			(root.numTodoTests ?? 0) +
			cases.filter((c) => c.status === "skipped" || c.status === "todo").length;

		return safeParseResult({
			framework: "Vitest",
			frameworkVersion: undefined,
			command: undefined,
			totals: { total, passed, failed, skipped },
			cases,
			coverage: { obtained: false, byFile: [], belowThreshold: [] },
			sourceArtifactPaths: input.filePath ? [input.filePath] : [],
			sourceFiles: files.map((f) => f.name).filter((v): v is string => !!v),
		});
	}
}

function mapStatus(s?: string): TestCase["status"] {
	switch (s) {
		case "passed":
			return "passed";
		case "failed":
			return "failed";
		case "skipped":
			return "skipped";
		case "todo":
			return "todo";
		default:
			return "passed";
	}
}

function toMs(d?: { seconds?: number; ms?: number; nanoseconds?: number }): number | undefined {
	if (!d) return undefined;
	const seconds = typeof d.seconds === "number" ? d.seconds : 0;
	const ms = typeof d.ms === "number" ? d.ms : 0;
	const ns = typeof d.nanoseconds === "number" ? d.nanoseconds : 0;
	if (seconds === 0 && ms === 0 && ns === 0) return undefined;
	return Math.round(seconds * 1000 + ms + ns / 1e6);
}

function extractFailure(a: VitestAssertion): { errorMessage?: string; stackLines: string[] } {
	const errors = Array.isArray(a.errors) ? a.errors : [];
	if (errors.length === 0) return { stackLines: [] };
	const first = errors[0];
	if (!first) return { stackLines: [] };
	const msg = first.message ?? first.name;
	const stack = first.stack ?? "";
	const stackLines = stack
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
		.slice(0, 8);
	return { errorMessage: msg, stackLines };
}
