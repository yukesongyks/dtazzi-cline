/**
 * Jest / Vitest JSON 结果解析器
 *
 * 解析 Jest 或 Vitest 的 JSON reporter 输出，转换为统一的 TestRunResult。
 * Jest 和 Vitest 的 JSON 输出格式兼容，共享同一解析器。
 */

import { readFile } from "node:fs/promises";
import type {
	CoverageData,
	CoverageFileDetail,
	ParserInput,
	TestCaseResult,
	TestRunResult,
	TestSuite,
} from "../types.js";

// ─── 上游 JSON 类型 ────────────────────────────────────────────

/** Jest/Vitest assertionResult 原始结构 */
interface JestAssertionResult {
	ancestorTitles: string[];
	fullName: string;
	status: string;
	title: string;
	duration: number;
	failureMessages: string[];
	location?: string;
}

/** Jest/Vitest testResult 原始结构 */
interface JestTestResult {
	assertionResults: JestAssertionResult[];
	startTime: number;
	endTime: number;
	status: string;
	message: string;
	name: string;
}

/** Jest/Vitest JSON 顶层结构 */
interface JestJsonOutput {
	numFailedTestSuites: number;
	numFailedTests: number;
	numPassedTestSuites: number;
	numPassedTests: number;
	numPendingTestSuites: number;
	numPendingTests: number;
	numTodoTests: number;
	numTotalTestSuites: number;
	numTotalTests: number;
	startTime: number;
	success: boolean;
	testResults: JestTestResult[];
	coverageMap?: Record<string, JestCoverageFile>;
}

/** Jest 覆盖率文件结构 */
interface JestCoverageFile {
	path: string;
	statementMap: Record<string, unknown>;
	fnMap: Record<string, unknown>;
	branchMap: Record<string, unknown>;
	s: Record<string, number>;
	f: Record<string, number>;
	b: Record<string, number[]>;
}

/** 覆盖率摘要统计 */
interface CoverageSummary {
	total: {
		statements: { pct: number };
		branches: { pct: number };
		functions: { pct: number };
		lines: { pct: number };
	};
	[filePath: string]: {
		statements: { pct: number };
		branches: { pct: number };
		functions: { pct: number };
		lines: { pct: number };
	};
}

// ─── 状态映射 ──────────────────────────────────────────────────

const JEST_STATUS_MAP: Record<string, TestCaseResult["status"]> = {
	passed: "passed",
	failed: "failed",
	pending: "skipped",
	skipped: "skipped",
	todo: "todo",
	disabled: "skipped",
};

/**
 * 将 Jest/Vitest 状态字符串映射为统一状态
 */
function mapStatus(raw: string): TestCaseResult["status"] {
	const normalized = raw.toLowerCase();
	return JEST_STATUS_MAP[normalized] ?? "skipped";
}

// ─── 堆栈截断 ──────────────────────────────────────────────────

const MAX_STACK_LINES = 5;

/**
 * 截断堆栈跟踪至关键行
 */
function summarizeStack(stack: string): string {
	if (!stack) return "";
	const lines = stack.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length <= MAX_STACK_LINES) return stack;
	const head = lines.slice(0, MAX_STACK_LINES).join("\n");
	return `${head}\n  ... (共 ${lines.length} 行，已截断)`;
}

// ─── 覆盖率解析 ─────────────────────────────────────────────────

const LOW_COVERAGE_THRESHOLD = 80;

/**
 * 从 Jest 覆盖率数据中提取 CoverageData
 */
function extractCoverage(
	coverageMap: Record<string, JestCoverageFile> | undefined,
): CoverageData | undefined {
	if (!coverageMap) return undefined;

	const files = Object.values(coverageMap);
	if (files.length === 0) return undefined;

	let totalStatements = 0;
	let coveredStatements = 0;
	let totalBranches = 0;
	let coveredBranches = 0;
	let totalFunctions = 0;
	let coveredFunctions = 0;
	let totalLines = 0;
	let coveredLines = 0;
	const fileDetails: CoverageFileDetail[] = [];

	for (const file of files) {
		const stmtKeys = Object.keys(file.s);
		const fnKeys = Object.keys(file.f);
		const branchValues = Object.values(file.b);

		const fileStmts = stmtKeys.length;
		const fileCoveredStmts = stmtKeys.filter((k) => file.s[k] > 0).length;
		const fileFns = fnKeys.length;
		const fileCoveredFns = fnKeys.filter((k) => file.f[k] > 0).length;
		const fileBranches = branchValues.length;
		const fileCoveredBranches = branchValues.filter(
			(v) => Array.isArray(v) && v.some((c) => c > 0),
		).length;

		// 行覆盖率 = 语句覆盖率（Jest 中两者通常一致）
		const fileLines = fileStmts;
		const fileCoveredLines = fileCoveredStmts;

		const stmtPct = fileStmts > 0 ? (fileCoveredStmts / fileStmts) * 100 : 100;
		const branchPct =
			fileBranches > 0 ? (fileCoveredBranches / fileBranches) * 100 : 100;
		const fnPct = fileFns > 0 ? (fileCoveredFns / fileFns) * 100 : 100;
		const linePct = fileLines > 0 ? (fileCoveredLines / fileLines) * 100 : 100;

		totalStatements += fileStmts;
		coveredStatements += fileCoveredStmts;
		totalBranches += fileBranches;
		coveredBranches += fileCoveredBranches;
		totalFunctions += fileFns;
		coveredFunctions += fileCoveredFns;
		totalLines += fileLines;
		coveredLines += fileCoveredLines;

		if (
			stmtPct < LOW_COVERAGE_THRESHOLD ||
			branchPct < LOW_COVERAGE_THRESHOLD ||
			fnPct < LOW_COVERAGE_THRESHOLD
		) {
			fileDetails.push({
				file: file.path,
				statements: Math.round(stmtPct * 100) / 100,
				branches: Math.round(branchPct * 100) / 100,
				functions: Math.round(fnPct * 100) / 100,
				lines: Math.round(linePct * 100) / 100,
			});
		}
	}

	return {
		statements:
			totalStatements > 0
				? Math.round((coveredStatements / totalStatements) * 10000) / 100
				: 0,
		branches:
			totalBranches > 0
				? Math.round((coveredBranches / totalBranches) * 10000) / 100
				: 0,
		functions:
			totalFunctions > 0
				? Math.round((coveredFunctions / totalFunctions) * 10000) / 100
				: 0,
		lines:
			totalLines > 0
				? Math.round((coveredLines / totalLines) * 10000) / 100
				: 0,
		lowCoverageFiles: fileDetails,
	};
}

/**
 * 从 coverage-final.json 或类似 summary 文件提取覆盖率
 */
function extractCoverageFromSummary(
	summary: CoverageSummary | undefined,
): CoverageData | undefined {
	if (!summary?.total) return undefined;

	const { total } = summary;
	const fileDetails: CoverageFileDetail[] = [];

	for (const [key, value] of Object.entries(summary)) {
		if (key === "total") continue;
		const stmtPct = value.statements?.pct ?? 0;
		const branchPct = value.branches?.pct ?? 0;
		const fnPct = value.functions?.pct ?? 0;
		const linePct = value.lines?.pct ?? 0;

		if (
			stmtPct < LOW_COVERAGE_THRESHOLD ||
			branchPct < LOW_COVERAGE_THRESHOLD ||
			fnPct < LOW_COVERAGE_THRESHOLD
		) {
			fileDetails.push({
				file: key,
				statements: Math.round(stmtPct * 100) / 100,
				branches: Math.round(branchPct * 100) / 100,
				functions: Math.round(fnPct * 100) / 100,
				lines: Math.round(linePct * 100) / 100,
			});
		}
	}

	return {
		statements: Math.round(total.statements.pct * 100) / 100,
		branches: Math.round(total.branches.pct * 100) / 100,
		functions: Math.round(total.functions.pct * 100) / 100,
		lines: Math.round(total.lines.pct * 100) / 100,
		lowCoverageFiles: fileDetails,
	};
}

// ─── 解析器实现 ────────────────────────────────────────────────

export class JestJsonParser {
	readonly name = "vitest" as const; // 同时处理 jest 和 vitest
	readonly supportedFrameworks = ["jest", "vitest"];

	/**
	 * 判断是否能解析：检查是否为 JSON 且包含 jest/vitest 特征字段
	 */
	canParse(input: ParserInput): boolean {
		if (!input.content) {
			// 根据文件扩展名判断
			return input.filePath.endsWith(".json");
		}
		try {
			const data = JSON.parse(input.content);
			return (
				data &&
				typeof data === "object" &&
				"testResults" in data &&
				"numTotalTests" in data
			);
		} catch {
			return false;
		}
	}

	/**
	 * 解析 Jest/Vitest JSON 输出
	 */
	async parse(input: ParserInput): Promise<TestRunResult> {
		const content = input.content ?? (await readFile(input.filePath, "utf-8"));
		const data: JestJsonOutput = JSON.parse(content);

		// 验证必要字段
		if (!data.testResults || !Array.isArray(data.testResults)) {
			throw new Error(
				"无效的 Jest/Vitest JSON 输出：缺少 testResults 字段或格式不正确",
			);
		}

		const suites: TestSuite[] = [];
		let totalPassed = 0;
		let totalFailed = 0;
		let totalSkipped = 0;
		let totalDuration = 0;

		for (const result of data.testResults) {
			const cases: TestCaseResult[] = [];
			let suitePassed = 0;
			let suiteFailed = 0;
			let suiteSkipped = 0;
			let suiteDuration = 0;

			for (const assertion of result.assertionResults) {
				const status = mapStatus(assertion.status);
				const errorMessages = assertion.failureMessages ?? [];
				const errorMessage =
					errorMessages.length > 0 ? errorMessages.join("\n") : undefined;
				const errorStack = errorMessage ? summarizeStack(errorMessage) : undefined;

				const tc: TestCaseResult = {
					name: assertion.fullName || assertion.title,
					file: result.name,
					status,
					duration: assertion.duration ?? 0,
					errorMessage,
					errorStack,
					errorStackSummary: errorStack,
				};

				cases.push(tc);
				suiteDuration += tc.duration;

				if (status === "passed") suitePassed++;
				else if (status === "failed") suiteFailed++;
				else suiteSkipped++;
			}

			suites.push({
				file: result.name,
				name: result.name,
				cases,
				duration: suiteDuration,
				passed: suitePassed,
				failed: suiteFailed,
				skipped: suiteSkipped,
			});

			totalPassed += suitePassed;
			totalFailed += suiteFailed;
			totalSkipped += suiteSkipped;
			totalDuration += suiteDuration;
		}

		const totalTests = totalPassed + totalFailed + totalSkipped;
		const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

		// 覆盖率
		let coverage: CoverageData | undefined;
		if (data.coverageMap) {
			coverage = extractCoverage(data.coverageMap);
		}

		return {
			framework: "vitest" as const,
			frameworkVersion: "auto-detected",
			suites,
			totalTests,
			passed: totalPassed,
			failed: totalFailed,
			skipped: totalSkipped,
			passRate: Math.round(passRate * 100) / 100,
			duration: totalDuration,
			success: data.success,
			coverage,
			resultFilePath: input.filePath,
		};
	}
}

export const jestJsonParser = new JestJsonParser();