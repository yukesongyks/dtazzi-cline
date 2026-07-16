/**
 * 配置项解析与默认值
 * 支持从环境变量、用户输入合并默认配置
 */
import type { TestReportConfig } from './types';
import { DEFAULT_CONFIG } from './types';

/**
 * 解析用户配置，合并默认值
 */
export function resolveConfig(overrides: Partial<TestReportConfig> = {}): TestReportConfig {
  return {
    output_format: overrides.output_format ?? DEFAULT_CONFIG.output_format,
    output_path: overrides.output_path ?? DEFAULT_CONFIG.output_path,
    coverage: overrides.coverage ?? DEFAULT_CONFIG.coverage,
    test_command: overrides.test_command,
    result_file: overrides.result_file,
    fail_threshold: overrides.fail_threshold,
  };
}

/**
 * 获取当前时间戳字符串，格式 YYYYMMDD-HHmmss
 */
export function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 获取报告文件完整路径
 */
export function getReportPath(outputDir: string, format: string, timestamp?: string): string {
  const ts = timestamp ?? getTimestamp();
  const ext = format === 'markdown' ? 'md' : format;
  const dir = outputDir.endsWith('/') ? outputDir : `${outputDir}/`;
  return `${dir}test-report-${ts}.${ext}`;
}

/**
 * 工具版本信息
 */
export const TOOL_VERSION = '1.0.0';
export const TOOL_NAME = 'test-report-generator';