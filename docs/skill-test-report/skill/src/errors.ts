// Test Report Skill · 错误类型 (errors.ts)
import type { SkillError, SkillErrorCode } from "./types.js";

export class TestReportError extends Error {
  readonly code: SkillErrorCode;
  readonly diagnostic?: string;
  readonly cause?: unknown;

  constructor(
    code: SkillErrorCode,
    message: string,
    opts?: { diagnostic?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "TestReportError";
    this.code = code;
    if (opts) {
      this.diagnostic = opts.diagnostic;
      this.cause = opts.cause;
    }
  }

  toSkillError(): SkillError {
    return {
      code: this.code,
      message: this.message,
      diagnostic: this.diagnostic,
      cause: this.cause,
    };
  }
}
