import type { FrameworkId, ParseResult } from "../types.js";
import type { ParserPlugin, ParseOptions } from "./interface.js";
export declare class VitestParser implements ParserPlugin {
    readonly id: FrameworkId;
    sniff(content: string): boolean;
    parse(content: string, opts?: ParseOptions): ParseResult;
}
