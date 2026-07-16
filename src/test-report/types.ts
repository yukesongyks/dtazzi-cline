/**
 * Test Report 2.0 — 核心类型定义
 */

// ---- 框架枚举 ----

export type TestFramework = "jest" | "vitest" | "pytest" | "junit" | "unknown";

// ---- 测试结果 ----

export interface TestCaseResult {
	/** 用例全名（含 describe 层级） */
	name: string;
	/** 所属测试文件路径 */
	file: string;
	/** 用例状态 */
	status: "passed" | "failed" | "skipped" | "pending" | "todo";
	/** 耗时(ms) */
	duration: number;
	/** 失败时的错误信息 */
	errorMessage?: string;
	/** 失败时的堆栈（已截断） */
	errorStack?: string;
}

export interface TestSuiteResult {
	/** 测试文件路径 */
	file: string;
	/** 套件内用例列表 */
	cases: TestCaseResult[];
	/** 套件总耗时(ms) */
	duration: number;
}

export interface TestResultSummary {
	/** 用例总数 */
	total: number;
	/** 通过数 */
	passed: number;
	/** 失败数 */
	failed: number;
	/** 跳过数 */
	skipped: number;
	/** 通过率 (0-1) */
	passRate: number;
	/** 总耗时(ms) */
	totalDuration: number;
	/** 整体结论 */
	conclusion: "pass" | "fail";
}

export interface ParsedTestResults {
	/** 识别的测试框架 */
	framework: TestFramework;
	/** 框架版本 */
	frameworkVersion?: string;
	/** 摘要 */
	summary: TestResultSummary;
	/** 套件列表 */
	suites: TestSuiteResult[];
	/** 原始结果文件路径 */
	sourceFile?: string;
}

// ---- 覆盖率 ----

export interface CoverageTotals {
	/** 语句覆盖率 (0-100) */
	statements: number | null;
	/** 分支覆盖率 (0-100) */
	branches: number | null;
	/** 函数覆盖率 (0-100) */
	functions: number | null;
	/** 行覆盖率 (0-100) */
	lines: number | null;
}

export interface CoverageFileEntry {
	file: string;
	statements: number | null;
	branches: number | null;
	functions: number | null;
	lines: number | null;
}

export interface CoverageData {
	/** 覆盖数据来源 */
	source: string;
	/** 总体覆盖率 */
	totals: CoverageTotals;
	/** 低于阈值的文件清单 */
	lowCoverageFiles: CoverageFileEntry[];
	/** 完整文件覆盖率明细 */
	files: CoverageFileEntry[];
}

// ---- 报告配置 ----

export type OutputFormat = "markdown" | "html" | "json";

export interface TestReportConfig {
	/** 测试执行命令（自动检测） */
	testCommand?: string;
	/** 解析模式：已有结果文件路径 */
	resultFile?: string;
	/** 输出格式 */
	outputFormat: OutputFormat;
	/** 报告输出目录 */
	outputPath: string;
	/** 覆盖率模式 */
	coverage: "auto" | "on" | "off";
	/** 通过率阈值（0-1），低于该值时标记为不达标 */
	failThreshold?: number;
	/** 项目名 */
	projectName?: string;
}

export const DEFAULT_CONFIG: TestReportConfig = {
	outputFormat: "markdown",
	outputPath: "reports",
	coverage: "auto",
};

// ---- 报告内容（完整结构） ----

export interface TestReport {
	/** 报告头 */
	header: ReportHeader;
	/** 结果摘要 */
	summary: TestResultSummary;
	/** 失败用例分析 */
	failureAnalysis: FailureAnalysis | null;
	/** 用例明细 */
	caseDetails: TestSuiteResult[];
	/** 覆盖率 */
	coverage: CoverageData | null;
	/** 附录 */
	appendix: ReportAppendix;
}

export interface ReportHeader {
	projectName: string;
	generatedAt: string;
	executionCommand: string;
	framework: string;
	frameworkVersion?: string;
	environment: string;
}

export interface FailureAnalysis {
	/** 失败用例列表 */
	failures: TestCaseResult[];
	/** 关键失败摘要（前 3 条） */
	topFailures: TestCaseResult[];
}

export interface ReportAppendix {
	sourceFiles: string[];
	generatorVersion: string;
}