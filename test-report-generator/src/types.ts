/** 测试报告生成器核心类型定义 */

// ============================================================
// 配置类型
// ============================================================

export interface TestReportConfig {
  /** 用户显式指定的测试命令 */
  test_command?: string;
  /** 解析模式下的结果文件路径 */
  result_file?: string;
  /** 输出格式 */
  output_format: 'markdown' | 'html' | 'json';
  /** 报告输出目录，默认 reports/ */
  output_path: string;
  /** 覆盖率模式 */
  coverage: 'auto' | 'on' | 'off';
  /** 通过率阈值，低于该值时报告结论标记为不达标 (0-100) */
  fail_threshold?: number;
}

export const DEFAULT_CONFIG: Required<Pick<TestReportConfig, 'output_format' | 'output_path' | 'coverage'>> = {
  output_format: 'markdown',
  output_path: 'reports/',
  coverage: 'auto',
};

// ============================================================
// 框架检测类型
// ============================================================

export type TestFramework = 'vitest' | 'jest' | 'pytest' | 'junit' | 'unknown';

export interface FrameworkDetection {
  framework: TestFramework;
  source: 'user' | 'package_json' | 'config_file' | 'extension';
  run_command?: string;
  version?: string;
}

// ============================================================
// 解析器接口
// ============================================================

export interface TestResultParser {
  readonly name: string;
  canParse(filePath: string, content: string): boolean;
  parse(filePath: string, content: string): TestResult[];
}

export interface ParserRegistry {
  register(parser: TestResultParser): void;
  findParser(filePath: string, content: string): TestResultParser | null;
  getRegisteredParsers(): TestResultParser[];
}

// ============================================================
// 测试结果类型
// ============================================================

export interface TestResult {
  suite: string;
  file: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: TestError;
}

export interface TestError {
  message: string;
  stack: string;
}

// ============================================================
// 覆盖率类型
// ============================================================

export interface CoverageSummary {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  files: CoverageFile[];
}

export interface CoverageFile {
  path: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

// ============================================================
// 报告类型
// ============================================================

export interface TestReport {
  header: ReportHeader;
  summary: ReportSummary;
  failures: FailureDetail[];
  details: TestDetail[];
  coverage: CoverageSection;
  appendix: Appendix;
}

export interface ReportHeader {
  project: string;
  generated_at: string;
  test_command: string;
  framework: string;
  environment: string;
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pass_rate: number;
  total_duration_ms: number;
  conclusion: 'passed' | 'failed' | 'degraded';
  threshold_note?: string;
}

export interface FailureDetail {
  name: string;
  file: string;
  error_message: string;
  stack_trace: string;
}

export interface TestDetail {
  file: string;
  cases: TestCaseDetail[];
}

export interface TestCaseDetail {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
}

export interface CoverageSection {
  available: boolean;
  summary?: CoverageSummary;
  below_threshold_files: CoverageFile[];
  unavailable_reason?: string;
}

export interface Appendix {
  source_files: string[];
  tool: string;
  generated_at: string;
}

// ============================================================
// 主入口返回类型
// ============================================================

export interface ExecutionResult {
  report_path: string;
  summary: {
    pass_rate: number;
    failed_count: number;
    total: number;
  };
  top_failures: string[];
  mode: 'execute' | 'parse';
  error?: string;
}