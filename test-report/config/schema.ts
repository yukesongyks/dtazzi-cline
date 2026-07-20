/**
 * 测试报告 Skill — 配置校验
 *
 * 校验用户覆盖项的合法取值，非法值抛明确诊断错误。
 */

/** 允许的输出格式 */
export const ALLOWED_OUTPUT_FORMATS = ['markdown', 'html', 'json'] as const;
export type OutputFormat = (typeof ALLOWED_OUTPUT_FORMATS)[number];

/** 允许的覆盖率策略 */
export const ALLOWED_COVERAGE_MODES = ['auto', 'on', 'off'] as const;
export type CoverageMode = (typeof ALLOWED_COVERAGE_MODES)[number];

/** 配置校验错误（非法取值/类型） */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }
}

/**
 * 校验 fail_threshold：须为 0~100 整数或 undefined
 */
export function validateFailThreshold(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ConfigValidationError(
      `fail_threshold 必须为 0~100 的整数或 undefined，收到: ${JSON.stringify(value)}`,
    );
  }
  if (value < 0 || value > 100) {
    throw new ConfigValidationError(
      `fail_threshold 必须在 0~100 范围内，收到: ${value}`,
    );
  }
  return value;
}

/**
 * 校验 output_format：须为 markdown | html | json
 */
export function validateOutputFormat(value: unknown): OutputFormat {
  if (typeof value !== 'string' || !ALLOWED_OUTPUT_FORMATS.includes(value as OutputFormat)) {
    throw new ConfigValidationError(
      `output_format 必须为 ${ALLOWED_OUTPUT_FORMATS.join(' | ')}，收到: ${JSON.stringify(value)}`,
    );
  }
  return value as OutputFormat;
}

/**
 * 校验 coverage：须为 auto | on | off
 */
export function validateCoverage(value: unknown): CoverageMode {
  if (typeof value !== 'string' || !ALLOWED_COVERAGE_MODES.includes(value as CoverageMode)) {
    throw new ConfigValidationError(
      `coverage 必须为 ${ALLOWED_COVERAGE_MODES.join(' | ')}，收到: ${JSON.stringify(value)}`,
    );
  }
  return value as CoverageMode;
}
