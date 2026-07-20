/**
 * JUnit XML parser — cross-language fallback (CAP-3).
 *
 * Uses `fast-xml-parser` (existing monorepo dep). Maps JUnit XML <testsuite>/<testcase>
 * to the normalized {@link TestRunResult}. Hard corruption (unparseable XML) throws
 * {@link ParseError} (AC4/S4); missing attributes degrade to "未获取" (NFR2).
 *
 * @see openspec/changes/add-test-report-skill/design.md §3
 */
import { XMLParser } from "fast-xml-parser";
import type { TestCase, TestRunResult } from "../models";
import { safeParseResult } from "../models";
import { ParseError, type ParserInput, type TestResultParser } from "./registry";

const PARSER_ID = "junit-xml";

export class JunitXmlParser implements TestResultParser {
	readonly id = PARSER_ID;
	readonly displayName = "JUnit XML";

	canDetect(input: ParserInput): boolean {
		const text = input.rawText.trimStart();
		if (input.frameworkHint === PARSER_ID) return true;
		// Heuristic: leading <?xml ...?> or <testsuite(s)> root.
		return (
			text.startsWith("<?xml") ||
			/^\s*<testsuites?[\s>]/.test(text) ||
			/^\s*<testsuite[\s>]/.test(text)
		);
	}

	async parse(input: ParserInput): Promise<TestRunResult> {
		let root: unknown;
		try {
			const parser = new XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: "@_",
				isArray: (name) => name === "testcase" || name === "testsuite",
			});
			root = parser.parse(input.rawText);
		} catch (e) {
			throw new ParseError(
				PARSER_ID,
				`无法解析 JUnit XML: ${(e as Error).message}`,
				input.filePath,
			);
		}

		const suites = collectSuites(root);
		if (suites.length === 0) {
			// XML parsed but no testsuite elements → treat as corruption (AC4).
			throw new ParseError(
				PARSER_ID,
				"JUnit XML 缺少 testsuite 元素，无法提取结果",
				input.filePath,
			);
		}

		const cases: TestCase[] = [];
		let total = 0;
		let passed = 0;
		let failed = 0;
		let skipped = 0;
		let durationMs = 0;

		for (const suite of suites) {
			const suiteFile = suite.file;
			const suiteCases = Array.isArray(suite.testcase) ? suite.testcase : suite.testcase ? [suite.testcase] : [];
			for (const tc of suiteCases) {
				const caseName = tc["@_name"] ?? tc.name ?? "未获取";
				const file = tc["@_file"] ?? suiteFile ?? undefined;
				const timeAttr = tc["@_time"];
				const dur = timeAttr !== undefined ? Math.round(toNumber(timeAttr) * 1000) : undefined;
				const status = deriveStatus(tc);
				const { errorMessage, stackLines } = extractFailure(tc);

				const c: TestCase = {
					name: String(caseName),
					file: file !== undefined ? String(file) : undefined,
					status,
					durationMs: dur,
					errorMessage,
					stackLines,
				};
				cases.push(c);
				total += 1;
				if (status === "passed") passed += 1;
				else if (status === "failed") failed += 1;
				else if (status === "skipped") skipped += 1;
				if (dur !== undefined) durationMs += dur;
			}
		}

		const result = safeParseResult({
			framework: "JUnit XML",
			command: undefined,
			totals: { total, passed, failed, skipped, durationMs: durationMs || undefined },
			cases,
			coverage: { obtained: false, byFile: [], belowThreshold: [] },
			sourceArtifactPaths: input.filePath ? [input.filePath] : [],
		});
		return result;
	}
}

interface NormalizedSuite {
	file?: string;
	testcase?: Array<Record<string, unknown>>;
}

function collectSuites(root: unknown): NormalizedSuite[] {
	const out: NormalizedSuite[] = [];
	const visit = (node: unknown) => {
		if (!node || typeof node !== "object") return;
		const obj = node as Record<string, unknown>;
		if (obj.testsuite) {
			const suites = Array.isArray(obj.testsuite) ? obj.testsuite : [obj.testsuite];
			for (const s of suites) out.push(toSuite(s));
		}
		if (obj.testsuites) {
			visit(obj.testsuites);
		}
	};
	visit(root);
	return out;
}

function toSuite(node: unknown): NormalizedSuite {
	if (!node || typeof node !== "object") return {};
	const obj = node as Record<string, unknown>;
	return {
		file: typeof obj["@_file"] === "string" ? obj["@_file"] : undefined,
		testcase: Array.isArray(obj.testcase)
			? obj.testcase
			: obj.testcase
				? [obj.testcase]
				: [],
	};
}

function deriveStatus(tc: Record<string, unknown>): TestCase["status"] {
	if (tc.failure || tc.error) return "failed";
	if (tc.skipped) return "skipped";
	return "passed";
}

function extractFailure(tc: Record<string, unknown>): { errorMessage?: string; stackLines: string[] } {
	const node = tc.failure ?? tc.error;
	if (!node) return { stackLines: [] };
	const msg = typeof node === "string" ? node : extractText(node);
	if (!msg) return { stackLines: [] };
	const lines = msg.split(/\r?\n/);
	const head = lines[0]?.trim() || undefined;
	const stack = lines.slice(1).map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 8);
	return { errorMessage: head, stackLines: stack };
}

function extractText(node: unknown): string {
	if (typeof node === "string") return node;
	if (node && typeof node === "object") {
		const obj = node as Record<string, unknown>;
		if (typeof obj["#text"] === "string") return obj["#text"];
		if (typeof obj.message === "string") return obj.message;
	}
	return "";
}

function toNumber(v: unknown): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
