import type { SkillConfig } from "./types.js";

export const DEFAULT_CONFIG: SkillConfig = {
  testCommand: "auto",
  resultFile: "auto",
  outputFormat: "markdown",
  outputPath: "reports/",
  coverage: "auto",
  failThreshold: undefined,
};

export const TOOL_VERSION = "0.1.0";
export const TOOL_NAME = "test-report-skill";

// 输出文件名模板：test-report-<YYYYMMDD-HHmmss>.md
export function buildOutputFileName(format: SkillConfig["outputFormat"], timestampMs: number): string {
  const d = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const ext = format === "markdown" ? "md" : format === "html" ? "html" : "json";
  return `test-report-${stamp}.${ext}`;
}
