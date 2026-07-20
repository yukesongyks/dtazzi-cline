import type { TestCaseError, TestFileGroup, TestSummary } from "../types.js";
export declare function defaultSanitize(text: string): string;
/** 截断堆栈至可读长度（保留前若干关键行） */
export declare function truncateStack(stack: string, maxLines?: number, maxChars?: number): string;
export declare function buildError(rawMessage: string, rawStack: string | undefined, sanitize: (s: string) => string): TestCaseError;
/** 稳定用例 id：filePath::name；两者皆空时用序号兜底 */
export declare function buildTestCaseId(filePath: string, name: string, index: number): string;
/** 由文件分组汇总 TestSummary */
export declare function summarizeFromGroups(fileGroups: TestFileGroup[], totalDurationMs: number): TestSummary;
export declare function round1(n: number): number;
export declare function durationMsFromSeconds(s: number | undefined): number;
export declare function durationMsFromMs(ms: number | undefined): number;
