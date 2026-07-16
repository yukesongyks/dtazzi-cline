/**
 * 测试报告 Skill — 公共类型定义
 *
 * 此文件定义所有模块共享的核心数据结构，包括：
 * - TestReport 报告顶层结构
 * - TestSummary 结果摘要
 * - FailureDetail 失败用例详情
 * - TestSuiteDetail 测试套件明细
 * - CoverageReport 覆盖率
 * - SkillConfig 技能配置
 * - 生成器选项
 */

// ─── 报告顶层结构 ────────────────────────────────────────────────

export interface TestReport {
  meta: ReportMeta;
  summary: TestSummary;
  failures: FailureDetail[];
  suites: TestSuiteDetail[];
  coverage?: CoverageReport;
  appendix: Appendix;
}

export interface ReportMeta {
  /** 项目名称，从 package.json / pyproject.toml 等提取 */
  projectName: string;
  /** 报告生成时间，ISO 8601 格式 */
  generatedAt: string;
  /** 实际执行的测试命令（执行模式）或 "--"（解析模式） */
  command: string;
  /** 检测到的测试框架标识 */
  framework: string;
  /** 框架版本号，未能获取时标注 "未获取" */
  frameworkVersion: string;
  /** 执行环境摘要，如 "Node.js v20.11.0 / Linux x64" */
  environment: string;
}

// ─── 结果摘要 ────────────────────────────────────────────────────

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** 通过率 0–100 */
  passRate: number;
  /** 总耗时，毫秒 */
  durationMs: number;
  /** 整体结论：pass=✅ / fail=❌ */
  verdict: "pass" | "fail";
}

// ─── 失败详情 ────────────────────────────────────────────────────

export interface FailureDetail {
  /** 用例名称（含 describe 层级） */
  testName: string;
  /** 所属测试文件路径 */
  filePath: string;
  /** 错误摘要信息 */
  errorMessage: string;
  /** 堆栈关键行，已截断至最多 20 行 */
  stackTrace: string;
}

// ─── 套件明细 ────────────────────────────────────────────────────

export interface TestSuiteDetail {
  /** 测试文件路径 */
  filePath: string;
  /** 该文件总耗时，毫秒 */
  durationMs: number;
  /** 文件内用例列表 */
  cases: TestCaseDetail[];
}

export interface TestCaseDetail {
  /** 用例名称 */
  name: string;
  /** 用例状态 */
  status: "passed" | "failed" | "skipped" | "pending";
  /** 单个用例耗时，毫秒 */
  durationMs: number;
}

// ─── 覆盖率 ──────────────────────────────────────────────────────

export interface CoverageReport {
  /** 覆盖率摘要（语句 / 分支 / 函数 / 行） */
  summary: CoverageSummary;
  /** 按文件细分的覆盖率明细，可选 */
  files?: CoverageFileDetail[];
}

export interface CoverageSummary {
  statements: number; // 0–100
  branches: number; // 0–100
  functions: number; // 0–100
  lines: number; // 0–100
}

export interface CoverageFileDetail {
  filePath: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

// ─── 附录 ────────────────────────────────────────────────────────

export interface Appendix {
  /** 原始结果文件路径列表 */
  resultFiles: string[];
  /** 工具版本字符串 */
  toolVersion: string;
}

// ─── 技能配置 ────────────────────────────────────────────────────

export interface SkillConfig {
  /** 测试执行命令，默认自动检测 */
  testCommand?: string;
  /** 解析模式下的结果文件路径 */
  resultFile?: string;
  /** 输出格式 markdown / html / json */
  outputFormat: "markdown" | "html" | "json";
  /** 报告输出目录，默认 reports/ */
  outputPath: string;
  /** 覆盖率策略 */
  coverage: "auto" | "on" | "off";
  /** 通过率阈值，低于该值时报告结论标记为不达标 */
  failThreshold?: number;
}

export const DEFAULT_SKILL_CONFIG: SkillConfig = {
  outputFormat: "markdown",
  outputPath: "reports/",
  coverage: "auto",
};

// ─── 生成器选项 ──────────────────────────────────────────────────

export interface GeneratorOptions {
  /** 是否在明细区截断超过 200 条用例 (默认截断) */
  truncateDetails?: boolean;
  /** 用例明细截断阈值，默认 200 */
  detailLimit?: number;
  /** 通过率不达标阈值 */
  failThreshold?: number;
}