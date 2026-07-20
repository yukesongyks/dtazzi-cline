/**
 * 测试报告 Skill — 统一中间模型 (IM) 类型定义
 *
 * 对齐 SSOT D10 字段约束。解析层与渲染层通过 IM 解耦：
 * 解析器产出 IntermediateModel，渲染器消费 IntermediateModel。
 *
 * 字段缺失统一降级为 NA_TOKEN，不静默丢数据。
 */

/** 缺失字段降级令牌（NFR2/NFR3 配套：缺失需显式标注） */
export const NA_TOKEN = '未获取';

/** 支持的测试框架结果格式标识（解析器优先级：vitest-json > jest-json > junit-xml） */
export type FrameworkId = 'vitest-json' | 'jest-json' | 'junit-xml';

/** 单个测试用例状态 */
export type CaseStatus = 'passed' | 'failed' | 'skipped' | 'unknown';

/** 整体运行状态（summary.overallStatus） */
export type OverallStatus = 'passed' | 'failed' | 'unknown';

/** IM 元信息（meta） */
export interface IntermediateModelMeta {
  /** 项目名（取自 package.json name，缺失降级 NA_TOKEN） */
  projectName: string;
  /** 报告生成时间戳（ISO 8601，UTC）— 幂等性例外项（NFR4） */
  generatedAt: string;
  /** 触发测试的命令（解析模式不执行，D7） */
  command: string;
  /** 框架标识，如 'vitest' / 'jest' / 'junit' */
  framework: string;
  /** 框架版本，格式 'x.y.z'，缺失降级 NA_TOKEN */
  frameworkVersion: string;
  /** 运行环境描述（Node 版本/OS），缺失降级 NA_TOKEN */
  environment: string;
}

/** 失败用例摘要（failures[]，限制 1~3 条进入最终返回契约） */
export interface FailureEntry {
  /** 用例名称 */
  name: string;
  /** 用例所属文件路径，缺失降级 NA_TOKEN */
  file: string;
  /** 错误信息（已过敏感过滤，D8） */
  error: string;
  /** 堆栈摘录（截断须显式标注，NFR2） */
  stackExcerpt: string;
}

/** 单个测试用例（suites[].cases[]） */
export interface SuiteCase {
  /** 用例名称 */
  name: string;
  /** 用例状态 */
  status: CaseStatus;
  /** 用例耗时（毫秒） */
  durationMs: number;
}

/** 测试套件（suites[]） */
export interface TestSuite {
  /** 套件文件路径，缺失降级 NA_TOKEN */
  file: string;
  /** 套件内用例列表 */
  cases: SuiteCase[];
}

/** 覆盖率（coverage，百分比 0~100） */
export interface CoverageSummary {
  /** 语句覆盖率 */
  statements: number;
  /** 分支覆盖率 */
  branches: number;
  /** 函数覆盖率 */
  functions: number;
  /** 行覆盖率 */
  lines: number;
  /** 覆盖率低于阈值的文件列表（NFR2：截断须显式标注） */
  lowCoverageFiles: string[];
}

/** 附录（appendix） */
export interface IntermediateModelAppendix {
  /** 原始结果文件绝对路径 */
  resultFilePath: string;
  /** 生成本报告所用工具版本（test-report skill 自身版本） */
  toolVersion: string;
}

/** 运行摘要（summary） */
export interface IntermediateModelSummary {
  /** 用例总数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 跳过数 */
  skipped: number;
  /** 通过率（百分比，0~100） */
  passRate: number;
  /** 总耗时（毫秒） */
  durationMs: number;
  /** 整体状态 */
  overallStatus: OverallStatus;
}

/** 统一中间模型（IM, D10）— 解析层与渲染层的唯一契约 */
export interface IntermediateModel {
  meta: IntermediateModelMeta;
  summary: IntermediateModelSummary;
  failures: FailureEntry[];
  suites: TestSuite[];
  coverage: CoverageSummary;
  appendix: IntermediateModelAppendix;
}

/** 解析器输入：原始结果文件内容与路径 */
export interface RawInput {
  /** 结果文件绝对路径 */
  filePath: string;
  /** 结果文件文本内容 */
  content: string;
}

/** 解析上下文：解析器执行所需的环境信息 */
export interface ParseCtx {
  /** 项目根目录（含 package.json 的最近目录，D5） */
  rootDir: string;
  /** 框架版本，缺失降级 NA_TOKEN */
  frameworkVersion: string;
  /** 触发测试的命令（解析模式不执行，D7） */
  command: string;
  /** 运行环境描述 */
  environment: string;
}

/**
 * 插件式解析器接口（NFR5）
 *
 * detect(input): 嗅探输入是否匹配本格式（不抛错，返回 boolean）
 * parse(raw, ctx): 将原始输入解析为 IM
 *
 * 新增解析器流程：实现 ParserPlugin → 在 registry.registerAll 中注册 → 无需改动既有解析器
 */
export interface ParserPlugin {
  /** 本解析器对应的框架标识 */
  id: FrameworkId;
  /** 嗅探输入是否匹配本格式 */
  detect(input: RawInput): boolean;
  /** 将原始输入解析为统一中间模型 */
  parse(raw: RawInput, ctx: ParseCtx): IntermediateModel;
}

/** 未能识别结果文件格式时的诊断错误（非空报告，AC4） */
export class UnrecognizedResultFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecognizedResultFormatError';
    Object.setPrototypeOf(this, UnrecognizedResultFormatError.prototype);
  }
}
