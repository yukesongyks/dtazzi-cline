import type { FrameworkId, ParseResult } from "../types.js";
import type { ParserPlugin, ParseOptions } from "./interface.js";
/** 注册一个解析器插件（幂等：同 id 不重复注册） */
export declare function registerParser(plugin: ParserPlugin): void;
/** 获取已注册插件列表（只读快照） */
export declare function listParsers(): readonly ParserPlugin[];
/** 嗅探：依据内容自动选择首个可解析的插件 */
export declare function detectByContent(content: string): ParserPlugin | undefined;
/** 按框架 id 取插件 */
export declare function getParser(id: FrameworkId): ParserPlugin | undefined;
/** 统一解析入口：内容嗅探 → parse，失败抛明确错误 */
export declare function parseContent(content: string, opts?: ParseOptions): ParseResult;
