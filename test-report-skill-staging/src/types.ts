// === 框架标识 ===
export type FrameworkId = "vitest" | "jest" | "junit" | "pytest" | "unknown";

// === 单测用例 ===
export type TestStatus = "passed" | "failed" | "skipped" | "todo" | "unknown";

export interface TestCase {
  id: string; // 稳定标识，由 parser 生成（如 "filePath::testName"），用于幂等
  name: string; // 用例名
  filePath: string; // 所属测试文件路径；缺失时为空串 ""
  status: TestStatus;
  durationMs: number; // 耗时毫秒；缺失/未知填 0
  error?: TestCaseError; // 失败时必填
}

export interface TestCaseError {
  message: string; // 错误信息（已过滤敏感内容）
  stack?: string; // 堆栈关键行（已截断至可读长度，已过滤敏感内容）
}

// === 测试文件分组（用例明细板块） ===
export interface TestFileGroup {
  filePath: string;
  cases: TestCase[];
  durationMs: number; // 该文件下用例耗时合计
}

// === 摘要 ===
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  unknown: number;
  passRate: number; // 0-100，浮点，passed/total*100；total=0 时为 0
  durationMs: number; // 总耗时；缺失填 0
  conclusion: "passed" | "failed"; // failed>0 → failed；否则 passed
}

// === 覆盖率（可选） ===
export interface CoverageTotals {
  statementsPct: number;
  branchesPct: number;
  functionsPct: number;
  linesPct: number;
  hasCoverage: boolean; // 是否真正获取到覆盖率数据
}

export interface CoverageFile {
  filePath: string;
  statementsPct: number;
  branchesPct: number;
  functionsPct: number;
  linesPct: number;
}

export interface CoverageReport {
  totals: CoverageTotals;
  belowThresholdFiles: CoverageFile[]; // 低于阈值的文件清单；无则空数组
}

// === 报告头/环境 ===
export interface ReportHeader {
  projectName: string;
  generatedAt: string; // ISO8601 UTC，渲染时转 zh-CN 格式
  testCommand: string; // 执行命令；解析模式为 "（解析模式）" 前缀
  framework: FrameworkId;
  frameworkVersion?: string; // 框架版本；缺失不输出
  environmentSummary: string; // 执行环境摘要（Node 版本/OS 等），不含敏感信息
}

// === 解析中间产物 IM（Task 3-5 产出，Task 1 先定义契约） ===
export interface ParseResult {
  framework: FrameworkId;
  frameworkVersion?: string;
  summary: TestSummary;
  fileGroups: TestFileGroup[];
  failures: TestCase[]; // 失败用例抽取，供失败分析板块
  coverage?: CoverageReport; // 可选
  rawResultFilePath?: string; // 附录用
}

// === 执行模式上下文 ===
export interface ExecutionContext {
  cwd: string;
  testCommand?: string; // 用户显式指定
  resultFile?: string; // 解析模式指定已有结果文件
  mode: "execute" | "parse";
}

// === 配置项（FR4.2） ===
export interface SkillConfig {
  testCommand: "auto" | string;
  resultFile: "auto" | string;
  outputFormat: "markdown" | "html" | "json";
  outputPath: string; // 目录
  coverage: "auto" | "on" | "off";
  failThreshold?: number; // 通过率阈值 0-100；未设置则无
}

// === 报告最终产物 ===
export interface GeneratedReport {
  header: ReportHeader;
  summary: TestSummary;
  failures: TestCase[];
  fileGroups: TestFileGroup[];
  coverage?: CoverageReport;
  appendix: {
    rawResultFilePath?: string;
    toolVersion: string; // 生成工具版本，常量
  };
  outputPath: string; // 落盘绝对/相对路径
  outputFormat: SkillConfig["outputFormat"];
}

// === 错误类型（Task 1 一并定义） ===
export interface SkillError {
  code: SkillErrorCode;
  message: string;
  diagnostic?: string; // 诊断细节（命令输出摘要等）
  cause?: unknown;
}

export type SkillErrorCode =
  | "PARSE_FORMAT_INVALID" // 结果文件格式异常/损坏
  | "FRAMEWORK_NOT_DETECTED" // 无法识别测试框架
  | "TEST_COMMAND_FAILED" // 命令无法运行（非用例失败）
  | "RESULT_FILE_NOT_FOUND" // 解析模式找不到指定结果文件
  | "RESULT_FILE_EMPTY" // 结果文件为空
  | "OUTPUT_WRITE_FAILED" // 报告落盘失败
  | "UNSUPPORTED_FORMAT" // 不支持的输出格式
  | "INTERNAL_ERROR";
