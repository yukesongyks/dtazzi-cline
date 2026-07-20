import type { FrameworkId, ParseResult } from "../types.js";
/**
 * 解析器插件契约。新增框架支持只需实现本接口并注册，
 * 不影响既有解析器（NFR5）。
 */
export interface ParserPlugin {
    /** 框架标识 */
    readonly id: FrameworkId;
    /** 内容嗅探：判断给定原始文本是否本插件可解析的结果格式 */
    sniff(content: string): boolean;
    /** 解析：将原始文本转为 IM ParseResult。格式异常时抛 TestReportError(PARSE_FORMAT_INVALID) */
    parse(content: string, opts?: ParseOptions): ParseResult;
}
export interface ParseOptions {
    /** 原始结果文件路径（附录用） */
    rawResultFilePath?: string;
    /** 敏感信息过滤函数（NFR3），默认 no-op */
    sanitize?: (text: string) => string;
}
