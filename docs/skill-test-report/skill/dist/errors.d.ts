import type { SkillError, SkillErrorCode } from "./types.js";
export declare class TestReportError extends Error {
    readonly code: SkillErrorCode;
    readonly diagnostic?: string;
    readonly cause?: unknown;
    constructor(code: SkillErrorCode, message: string, opts?: {
        diagnostic?: string;
        cause?: unknown;
    });
    toSkillError(): SkillError;
}
