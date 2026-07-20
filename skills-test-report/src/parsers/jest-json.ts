/**
 * Jest JSON reporter parser (CAP-3).
 *
 * Jest's `--json` reporter emits a top-level object with `numTotalTestSuites`,
 * `testResults[]` (per file) and `assertionResults[]` (per test). We map it to
 * {@link TestRunResult}. Hard corruption (unparseable JSON or missing top-level shape)
 * throws {@link ParseError} (AC4); missing fields degrade to "未获取" (NFR2).
 *
 * @see openspec/changes/add-test-report-skill/design.md §3
 */
import type { TestCase, TestRunResult } from "../models";
import { safeParseResult } from "../models";
import { ParseError, type ParserInput, type TestResultParser } from "./registry";

const PARSER_ID = "jest-json";

interface JestRoot {
	numTotalTests?: number;
	numPassedTests?: number;
	numFailedTests?: number;
	numPendingTests?: number;
	testResults?: JestTestFile[];
	success?: boolean;
}

interface JestTestFile {
	name?: string;
	status?: string;
	message?: string;
	assertionResults?: JestAssertion[];
}

interface JestAssertion {
	fullName?: string;
	title?: string;
	status?: string;
	durationMs?: number;
	failureMessages?: string[];
	ancestorTitles?: string[];
	location?: { path?: string; line?: number };
}

export class JestJsonParser implements TestResultParser {
	readonly id = PARSER_ID;
	readonly displayName = "Jest JSON";

	canDetect(input: ParserInput): boolean {
		if (input.frameworkHint === PARSER_ID) return true;
		const text = input.rawText.trimStart();
		if (!text.startsWith("{")) return false;
		try {
			const obj = JSON.parse(input.rawText) as Record<string, unknown>;
			return (
				"numTotalTests" in obj ||
				"numTotalTestSuites" in obj ||
				Array.isArray((obj as { testResults?: unknown }).testResults)
			);
		} catch {
			return false;
		}
	}

	async parse(input: ParserInput): Promise<TestRunResult> {
		let root: JestRoot;
		try {
			root = JSON.parse(input.rawText) as JestRoot;
		} catch (e) {
			throw new ParseError(
				PARSER_ID,
				`无法解析 Jest JSON: ${(e as Error).message}`,
				input.filePath,
			);
		}
		if (
			!Array.isArray(root.testResults) &&
			root.numTotalTests === undefined
		) {
			throw new ParseError(
				PARSER_ID,
				"Jest JSON 缺少 testResults / numTotalTests 字段",
				input.filePath,
			);
		}

		const cases: TestCase[] = [];
		const files = Array.isArray(root.testResults) ? root.testResults : [];

		for (const file of files) {
			const fileRoot = file.name;
			const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
			for (const a of assertions) {
				const name = a.fullName ?? a.title ?? "未获取";
				const status = mapStatus(a.status);
				const { errorMessage, stackLines } = extractFailure(a);
				cases.push({
					name,
					file: fileRoot,
					status,
					durationMs: a.durationMs,
					errorMessage,
					stackLines,
				});
			}
		}

		const total =
			root.numTotalTests ?? cases.length;
		const passed =
			root.numPassedTests ?? cases.filter((c) => c.status === "passed").length;
		const failed =
			root.numFailedTests ?? cases.filter((c) => c.status === "failed").length;
		const skipped =
			root.numPendingTests ??
			cases.filter((c) => c.status === "skipped" || c.status === "todo").length;

		return safeParseResult({
			framework: "Jest",
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
		case "pending":
		case "todo":
		case "skipped":
			return "skipped";
		default:
			return "passed";
	}
}

function extractFailure(a: JestAssertion): { errorMessage?: string; stackLines: string[] } {
	const msgs = Array.isArray(a.failureMessages) ? a.failureMessages : [];
	if (msgs.length === 0) return { stackLines: [] };
	const combined = msgs.join("\n");
	const lines = combined.split(/\r?\n/);
	const head = lines[0]?.trim() || undefined;
	const stack = lines.slice(1).map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 8);
	return { errorMessage: head, stackLines: stack };
}
