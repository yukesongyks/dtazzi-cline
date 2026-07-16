/**
 * 解析器接口与解析相关类型
 *
 * 插件式架构：新增框架支持只需实现 TestResultParser 并注册到 PluginRegistry。
 */

import type { TestReport } from "../types";

// ─── 解析器接口 ──────────────────────────────────────────────────

export interface TestResultParser {
  /** 解析器支持的结果格式标识，如 "jest-json"、"junit-xml" */
  readonly formatId: string;

  /** 判断是否能解析给定的结果内容 */
  canParse(content: string, filePath?: string): boolean;

  /** 解析结果内容为标准 TestReport 结构 */
  parse(content: string, options?: ParseOptions): TestReport;
}

// ─── 解析选项 ────────────────────────────────────────────────────

export interface ParseOptions {
  /** 项目名称覆盖 */
  projectName?: string;
  /** 框架版本覆盖 */
  frameworkVersion?: string;
  /** 测试命令覆盖 */
  command?: string;
}