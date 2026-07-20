/**
 * 测试报告 Skill — 默认配置值
 *
 * 对齐 SSOT：所有默认值集中此处，config.ts 合并用户覆盖。
 */

/** 输出格式默认值 */
export const DEFAULT_OUTPUT_FORMAT = 'markdown' as const;

/** 输出目录默认值（相对项目根目录） */
export const DEFAULT_OUTPUT_PATH = 'reports/';

/** 覆盖率渲染策略默认值：auto = 仅当结果文件含覆盖率数据时渲染 */
export const DEFAULT_COVERAGE = 'auto' as const;

/** 失败阈值默认值：undefined 表示不设阈值 */
export const DEFAULT_FAIL_THRESHOLD: number | undefined = undefined;

/** 测试命令默认值：未获取（解析模式不执行测试，D7） */
export const DEFAULT_TEST_COMMAND = '未获取';

/** 结果文件默认值：未获取（由 detect 嗅探） */
export const DEFAULT_RESULT_FILE = '未获取';
