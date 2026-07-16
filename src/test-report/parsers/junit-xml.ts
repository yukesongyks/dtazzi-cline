/**
 * JUnit XML 结果解析器
 *
 * 解析标准的 JUnit XML 格式，作为跨语言兜底解析器。
 * 使用正则表达式解析，避免引入 XML 库依赖。
 *
 * 支持的 JUnit XML 结构：
 * <?xml version="1.0" encoding="UTF-8"?>
 * <testsuites name="..." tests="N" failures="N" errors="N" time="...">
 *   <testsuite name="..." tests="N" failures="N" errors="N" skipped="N" time="...">
 *     <testcase name="..." classname="..." time="...">
 *       <failure message="..." type="..."><![CDATA[...]]></failure>
 *       <error message="..." type="..."><![CDATA[...]]></error>
 *       <skipped message="..." />
 *     </testcase>
 *   </testsuite>
 * </testsuites>
 */

import { readFile } from "node:fs/promises";
import type { ParserInput, TestCaseResult, TestRunResult, TestSuite } from "../types.js";

// ─── 正则模式 ──────────────────────────────────────────────────

// 匹配 <testsuite ...> 开始标签
const TESTSUITE_RE =
	/<testsuite\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/testsuite>)/gi;

// 匹配 <testcase ...> 元素
const TESTCASE_RE =
	/<testcase\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;

// 匹配 <failure> / <error> / <skipped> 子元素
const FAILURE_RE = /<failure\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/failure>)/i;
const ERROR_RE = /<error\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/error>)/i;
const SKIPPED_RE = /<skipped\s+([^>]*?)\/?>/i;

// 匹配属性 key="value"
const ATTR_RE = /(\w+)="([^"]*)"/g;

// CDATA 内容
const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/;

// ─── 辅助函数 ──────────────────────────────────────────────────

/**
 * 解析 XML 属性 key="value"
 */
function parseAttributes(attrStr: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	let match: RegExpExecArray | null;
	// 重置 lastIndex
	ATTR_RE.lastIndex = 0;
	while ((match = ATTR_RE.exec(attrStr)) !== null) {
		attrs[match[1]] = match[2];
	}
	return attrs;
}

/**
 * 提取 CDATA 或纯文本内容
 */
function extractTextContent(raw: string): string {
	const cdataMatch = raw.match(CDATA_RE);
	if (cdataMatch) {
		return cdataMatch[1].trim();
	}
	// 移除 HTML 标签
	return raw.replace(/<[^>]*>/g, "").trim();
}

/**
 * 截断堆栈跟踪至关键行
 */
function summarizeStack(stack: string): string {
	if (!stack) return "";
	const lines = stack.split("\n").filter((l) => l.trim().length > 0);
	const MAX_LINES = 5;
	if (lines.length <= MAX_LINES) return stack;
	const head = lines.slice(0, MAX_LINES).join("\n");
	return `${head}\n  ... (共 ${lines.length} 行，已截断)`;
}

/**
 * 解析毫秒数（JUnit time 属性是秒）
 */
function parseSecondsToMs(timeStr: string | undefined): number {
	if (!timeStr) return 0;
	const seconds = Number.parseFloat(timeStr);
	return Number.isNaN(seconds) ? 0 : Math.round(seconds * 1000);
}

// ─── 解析器实现 ────────────────────────────────────────────────

export class JUnitXmlParser {
	readonly name = "junit" as const;
	readonly supportedFrameworks = ["junit", "pytest", "go test", "cargo test"];

	canParse(input: ParserInput): boolean {
		if (!input.content) {
			return input.filePath.endsWith(".xml");
		}
		return (
			input.content.includes("<testsuite") ||
			input.content.includes("<testsuites")
		);
	}

	async parse(input: ParserInput): Promise<TestRunResult> {
		const content = input.content ?? (await readFile(input.filePath, "utf-8"));

		if (!content.includes("<testsuite") && !content.includes("<testsuites")) {
			throw new Error("无效的 JUnit XML：未找到 <testsuite> 或 <testsuites> 元素");
		}

		const suites: TestSuite[] = [];
		let totalTests = 0;
		let totalPassed = 0;
		let totalFailed = 0;
		let totalSkipped = 0;
		let totalDuration = 0;

		// 重置正则
		TESTSUITE_RE.lastIndex = 0;
		let suiteMatch: RegExpExecArray | null;

		while ((suiteMatch = TESTSUITE_RE.exec(content)) !== null) {
			const suiteAttrs = parseAttributes(suiteMatch[1]);
			const suiteBody = suiteMatch[2] || "";

			const suiteName = suiteAttrs["name"] || "未知套件";
			const suiteTime = parseSecondsToMs(suiteAttrs["time"]);

			const cases: TestCaseResult[] = [];
			let suitePassed = 0;
			let suiteFailed = 0;
			let suiteSkipped = 0;
			let suiteDuration = 0;

			// 解析测试用例
			TESTCASE_RE.lastIndex = 0;
			let caseMatch: RegExpExecArray | null;

			while ((caseMatch = TESTCASE_RE.exec(suiteBody)) !== null) {
				const caseAttrs = parseAttributes(caseMatch[1]);
				const caseBody = caseMatch[2] || "";

				const caseName = caseAttrs["name"] || "未命名用例";
				const className = caseAttrs["classname"] || "";
				const fullName = className ? `${className} › ${caseName}` : caseName;
				const caseTime = parseSecondsToMs(caseAttrs["time"]);

				let status: TestCaseResult["status"] = "passed";
				let errorMessage: string | undefined;
				let errorStack: string | undefined;

				// 检查 <failure>
				const failureMatch = caseBody.match(FAILURE_RE);
				if (failureMatch) {
					status = "failed";
					// 从 failure 属性中提取 message
					const failAttrs = parseAttributes(failureMatch[1]);
					errorMessage = failAttrs["message"] || "测试失败";
					const failBody = failureMatch[2] || "";
					const detail = extractTextContent(failBody);
					if (detail) {
						errorMessage = `${errorMessage}\n${detail}`;
					}
					errorStack = summarizeStack(errorMessage);
				}

				// 检查 <error>（错误也视为失败）
				const errorMatch = caseBody.match(ERROR_RE);
				if (errorMatch && status !== "failed") {
					status = "failed";
					const errAttrs = parseAttributes(errorMatch[1]);
					errorMessage = errAttrs["message"] || "测试错误";
					const errBody = errorMatch[2] || "";
					const detail = extractTextContent(errBody);
					if (detail) {
						errorMessage = `${errorMessage}\n${detail}`;
					}
					errorStack = summarizeStack(errorMessage);
				}

				// 检查 <skipped>
				if (caseBody.match(SKIPPED_RE)) {
					status = "skipped";
				}

				const tc: TestCaseResult = {
					name: fullName,
					file: suiteName,
					status,
					duration: caseTime,
					errorMessage,
					errorStack,
					errorStackSummary: errorStack,
				};
				cases.push(tc);

				if (status === "passed") suitePassed++;
				else if (status === "failed") suiteFailed++;
				else suiteSkipped++;

				suiteDuration += caseTime;
			}

			// 如果没有解析到用例，使用 suite 属性统计
			if (cases.length === 0) {
				const suiteTests = Number.parseInt(suiteAttrs["tests"] || "0", 10);
				const suiteFailures =
					Number.parseInt(suiteAttrs["failures"] || "0", 10) +
					Number.parseInt(suiteAttrs["errors"] || "0", 10);
				const suiteSkippedCount = Number.parseInt(
					suiteAttrs["skipped"] || "0",
					10,
				);
				suitePassed = suiteTests - suiteFailures - suiteSkippedCount;
				suiteFailed = suiteFailures;
				suiteSkipped = suiteSkippedCount;
				suiteDuration = suiteTime;
			}

			suites.push({
				file: suiteName,
				name: suiteName,
				cases,
				duration: suiteDuration,
				passed: suitePassed,
				failed: suiteFailed,
				skipped: suiteSkipped,
			});

			totalTests += suitePassed + suiteFailed + suiteSkipped;
			totalPassed += suitePassed;
			totalFailed += suiteFailed;
			totalSkipped += suiteSkipped;
			totalDuration += suiteDuration;
		}

		if (suites.length === 0) {
			throw new Error("JUnit XML 解析完成但未找到任何测试套件");
		}

		const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

		return {
			framework: "junit",
			frameworkVersion: "auto-detected",
			suites,
			totalTests,
			passed: totalPassed,
			failed: totalFailed,
			skipped: totalSkipped,
			passRate: Math.round(passRate * 100) / 100,
			duration: totalDuration,
			success: totalFailed === 0,
			resultFilePath: input.filePath,
		};
	}
}

export const junitXmlParser = new JUnitXmlParser();