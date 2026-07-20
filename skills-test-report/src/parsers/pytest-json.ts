/**
 * pytest JSON report parser (CAP-3, M2 P1).
 *
 * pytest-json-report (`--json-report`) emits `{ tests: [{ nodeid, outcome, duration,
 * call: { longrepr, crash } }], summary: { ... } }`. Mapped to {@link TestRunResult}.
 * Hard corruption (unparseable JSON or missing tests[]+summary) throws {@link ParseError}
 * (AC4); missing fields degrade to "未获取" (NFR2).
 *
 * @see openspec/changes/add-test-report-skill/design.md §3
 */
import type { TestCase, TestRunResult } from "../models";
import { safeParseResult } from "../models";
import { ParseError, type ParserInput, type TestResultParser } from "./registry";

const PARSER_ID = "pytest-json";

interface PytestJsonRoot {
	tests?: PytestTest[];
	summary?: { total?: number; passed?: number; failed?: number; skipped?: number };
	created?: string;
	duration?: number;
}

interface PytestTest {
	nodeid?: string;
	outcome?: string;
	duration?: number;
	call?: { longrepr?: string; crash?: { message?: string } };
	setup?: { outcome?: string; longrepr?: string };
	teardown?: { outcome?: string; longrepr?: string };
	user_properties?: unknown;
}

export class PytestJsonParser implements TestResultParser {
	readonly id = PARSER_ID;
	readonly displayName = "pytest JSON";

	canDetect(input: ParserInput): boolean {
		if (input.frameworkHint === PARSER_ID) return true;
		const text = input.rawText.trimStart();
		if (!text.startsWith("{")) return false;
		try {
			const obj = JSON.parse(input.rawText) as Record<string, unknown>;
			if (Array.isArray(obj.tests) && typeof obj.tests === "object") return true;
			return Array.isArray(obj.tests) && "summary" in obj;
		} catch {
			return false;
		}
	}

	async parse(input: ParserInput): Promise<TestRunResult> {
		let root: PytestJsonRoot;
		try {
			root = JSON.parse(input.rawText) as PytestJsonRoot;
		} catch (e) {
			throw new ParseError(
				PARSER_ID,
				`无法解析 pytest JSON: ${(e as Error).message}`,
				input.filePath,
			);
		}
		if (!Array.isArray(root.tests) && !root.summary) {
			throw new ParseError(
				PARSER_ID,
				"pytest JSON 缺少 tests / summary 字段",
				input.filePath,
			);
		}

		const cases: TestCase[] = [];
		const tests = Array.isArray(root.tests) ? root.tests : [];

		for (const t of tests) {
			const nodeid = t.nodeid ?? "未获取";
			const { name, file } = splitNodeid(nodeid);
			const status = mapOutcome(t.outcome, t.setup?.outcome, t.teardown?.outcome);
			const { errorMessage, stackLines } = extractFailure(t);
			cases.push({
				name,
				file,
				status,
				durationMs: typeof t.duration === "number" ? Math.round(t.duration * 1000) : undefined,
				errorMessage,
				stackLines,
			});
		}

		const summary = root.summary ?? {};
		const total = summary.total ?? cases.length;
		const passed = summary.passed ?? cases.filter((c) => c.status === "passed").length;
		const failed = summary.failed ?? cases.filter((c) => c.status === "failed").length;
		const skipped = summary.skipped ?? cases.filter((c) => c.status === "skipped").length;
		const durationMs = typeof root.duration === "number" ? Math.round(root.duration * 1000) : undefined;

		return safeParseResult({
			framework: "pytest",
			frameworkVersion: undefined,
			command: undefined,
			totals: { total, passed, failed, skipped, durationMs },
			cases,
			coverage: { obtained: false, byFile: [], belowThreshold: [] },
			sourceArtifactPaths: input.filePath ? [input.filePath] : [],
		});
	}
}

function splitNodeid(nodeid: string): { name: string; file?: string } {
	// pytest nodeid: "path/to/test_x.py::TestClass::test_method"
	const sep = nodeid.indexOf("::");
	if (sep < 0) return { name: nodeid };
	const file = nodeid.slice(0, sep);
	const rest = nodeid.slice(sep + 2);
	return { name: rest, file };
}

function mapOutcome(outcome?: string, setup?: string, teardown?: string): TestCase["status"] {
	// Any phase failed → failed; otherwise respect the body outcome.
	if (setup === "failed" || teardown === "failed") return "failed";
	switch (outcome) {
		case "passed":
			return "passed";
		case "failed":
			return "failed";
		case "skipped":
			return "skipped";
		default:
			return "passed";
	}
}

function extractFailure(t: PytestTest): { errorMessage?: string; stackLines: string[] } {
	const longrepr = t.call?.longrepr ?? t.setup?.longrepr ?? t.teardown?.longrepr;
	const crashMsg = t.call?.crash?.message;
	const combined = [crashMsg, longrepr].filter((v): v is string => typeof v === "string" && v.length > 0).join("\n");
	if (!combined) return { stackLines: [] };
	const lines = combined.split(/\r?\n/);
	const head = lines[0]?.trim() || undefined;
	const stack = lines.slice(1).map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 8);
	return { errorMessage: head, stackLines: stack };
}
