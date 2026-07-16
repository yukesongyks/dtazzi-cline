/**
 * Test Report 2.0 — 核心类型定义
 *
 * 定义测试结果、框架配置、报告配置、报告结构等所有核心类型。
 */

// ─── 框架与格式 ────────────────────────────────────────────────

/** 支持的测试框架 */
export type TestFramework = "jest" | "vitest" | "pytest" | "junit";

/** 支持的输出格式 */
export type OutputFormat = "markdown" | "html" | "json";

/** 覆盖率模式 */
export type CoverageMode = "auto" | "on" | "off";

// ─── 测试用例结果 ──────────────────────────────────────────────

/** 单个测试用例的状态 */
export type TestCaseStatus = "passed" | "failed" | "skipped" | "pending" | "todo";

/** 单个测试用例结果 */
export interface TestCaseResult {
	/** 用例名称（含 describe 层级） */
	name: string;
	/** 所属测试文件路径 */
	file: string;
	/** 执行状态 */
	status: TestCaseStatus;
	/** 执行耗时（毫秒） */
	duration: number;
	/** 失败时的错误信息 */
	errorMessage?: string;
	/** 失败时的堆栈跟踪 */
	errorStack?: string;
	/** 失败时的堆栈关键行（截断后） */
	errorStackSummary?: string;
}

/** 测试套件（一个测试文件） */
export interface TestSuite {
	/** 文件路径 */
	file: string;
	/** 套件名称 */
	name: string;
	/** 该套件内的用例列表 */
	cases: TestCaseResult[];
	/** 套件总耗时（毫秒） */
	duration: number;
	/** 套件内通过数 */
	passed: number;
	/** 套件内失败数 */
	failed: number;
	/** 套件内跳过数 */
	skipped: number;
}

// ─── 覆盖率 ────────────────────────────────────────────────────

/** 覆盖率数据 */
export interface CoverageData {
	/** 语句覆盖率 (0-100) */
	statements: number;
	/** 分支覆盖率 (0-100) */
	branches: number;
	/** 函数覆盖率 (0-100) */
	functions: number;
	/** 行覆盖率 (0-100) */
	lines: number;
	/** 覆盖率低于阈值的文件清单 */
	lowCoverageFiles: CoverageFileDetail[];
}

/** 单个文件的覆盖率明细 */
export interface CoverageFileDetail {
	/** 文件路径 */
	file: string;
	/** 语句覆盖率 */
	statements: number;
	/** 分支覆盖率 */
	branches: number;
	/** 函数覆盖率 */
	functions: number;
	/** 行覆盖率 */
	lines: number;
}

// ─── 测试运行结果 ──────────────────────────────────────────────

/** 完整的测试运行结果 */
export interface TestRunResult {
	/** 执行框架 */
	framework: TestFramework;
	/** 框架版本 */
	frameworkVersion?: string;
	/** 测试套件列表 */
	suites: TestSuite[];
	/** 用例总数 */
	totalTests: number;
	/** 通过数 */
	passed: number;
	/** 失败数 */
	failed: number;
	/** 跳过数 */
	skipped: number;
	/** 通过率 (0-100) */
	passRate: number;
	/** 总耗时（毫秒） */
	duration: number;
	/** 整体是否通过 */
	success: boolean;
	/** 覆盖率数据（可选） */
	coverage?: CoverageData;
	/** 原始结果文件路径 */
	resultFilePath?: string;
	/** 执行命令 */
	executionCommand?: string;
	/** 执行环境摘要 */
	environment?: EnvironmentSummary;
	/** 原始解析错误（降级输出用） */
	parseErrors?: string[];
}

/** 执行环境摘要 */
export interface EnvironmentSummary {
	/** 操作系统 */
	os: string;
	/** Node.js 版本 */
	nodeVersion?: string;
	/** 项目名称 */
	projectName?: string;
	/** 项目版本 */
	projectVersion?: string;
}

// ─── 报告配置 ──────────────────────────────────────────────────

/** 报告生成配置 */
export interface ReportConfig {
	/** 测试执行命令（自动检测或用户指定） */
	testCommand?: string;
	/** 解析模式下的结果文件路径 */
	resultFile?: string;
	/** 输出格式 */
	outputFormat: OutputFormat;
	/** 报告输出目录 */
	outputPath: string;
	/** 覆盖率模式 */
	coverage: CoverageMode;
	/** 通过率阈值（低于该值时报告结论标记为不达标） */
	failThreshold?: number;
	/** 工作模式 */
	mode: "execute" | "parse";
}

/** 报告配置默认值 */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
	outputFormat: "markdown",
	outputPath: "reports/",
	coverage: "auto",
	mode: "execute",
};

// ─── 报告结构 ──────────────────────────────────────────────────

/** 报告章节类型 */
export type ReportSection =
	| "header"
	| "summary"
	| "failure-analysis"
	| "case-details"
	| "coverage"
	| "appendix";

/** 报告头 */
export interface ReportHeader {
	projectName: string;
	generatedAt: string;
	executionCommand: string;
	framework: string;
	frameworkVersion: string;
	environment: EnvironmentSummary;
}

/** 结果摘要 */
export interface ReportSummary {
	totalTests: number;
	passed: number;
	failed: number;
	skipped: number;
	passRate: number;
	duration: number;
	conclusion: "✅ 通过" | "❌ 失败" | "⚠️ 不达标";
}

/** 失败用例分析项 */
export interface FailureAnalysisItem {
	testName: string;
	file: string;
	errorMessage: string;
	errorStackSummary: string;
}

/** 用例明细 */
export interface CaseDetail {
	file: string;
	suiteName: string;
	cases: TestCaseResult[];
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	duration: number;
}

/** 覆盖率章节 */
export interface ReportCoverage {
	summary: CoverageData;
	available: boolean;
}

/** 附录 */
export interface ReportAppendix {
	resultFilePath: string;
	toolVersion: string;
}

/** 完整的报告结构 */
export interface TestReport {
	header: ReportHeader;
	summary: ReportSummary;
	failureAnalysis: FailureAnalysisItem[];
	caseDetails: CaseDetail[];
	coverage: ReportCoverage;
	appendix: ReportAppendix;
}

// ─── 解析器接口 ────────────────────────────────────────────────

/** 解析器输入 */
export interface ParserInput {
	/** 结果文件路径 */
	filePath: string;
	/** 结果文件内容（可选，若提供则跳过文件读取） */
	content?: string;
}

/** 解析器接口（插件式） */
export interface TestResultParser {
	/** 解析器名称 */
	readonly name: TestFramework;
	/** 支持的框架版本范围 */
	readonly supportedFrameworks: string[];
	/**
	 * 判断是否能解析该文件
	 * @param input 解析器输入
	 */
	canParse(input: ParserInput): boolean;
	/**
	 * 解析测试结果文件
	 * @param input 解析器输入
	 * @returns 测试运行结果
	 */
	parse(input: ParserInput): Promise<TestRunResult>;
}