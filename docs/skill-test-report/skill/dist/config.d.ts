import type { SkillConfig } from "./types.js";
export declare const DEFAULT_CONFIG: SkillConfig;
export declare const TOOL_VERSION = "0.1.0";
export declare const TOOL_NAME = "test-report-skill";
export declare function buildOutputFileName(format: SkillConfig["outputFormat"], timestampMs: number): string;
