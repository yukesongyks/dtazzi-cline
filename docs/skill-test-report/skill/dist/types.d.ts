export type FrameworkId = "vitest" | "jest" | "junit" | "pytest" | "unknown";
export type TestStatus = "passed" | "failed" | "skipped" | "todo" | "unknown";
export interface TestCase {
    id: string;
    name: string;
    filePath: string;
    status: TestStatus;
    durationMs: number;
    error?: TestCaseError;
}
export interface TestCaseError {
    message: string;
    stack?: string;
}
export interface TestFileGroup {
    filePath: string;
    cases: TestCase[];
    durationMs: number;
}
export interface TestSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    todo: number;
    unknown: number;
    passRate: number;
    durationMs: number;
    conclusion: "passed" | "failed";
}
export interface CoverageTotals {
    statementsPct: number;
    branchesPct: number;
    functionsPct: number;
    linesPct: number;
    hasCoverage: boolean;
}
export interface CoverageFile {
    filePath: string;
    statementsPct: number;
    branchesPct: number;
    functionsPct: number;
    linesPct: number;
}
export interface CoverageReport {
    totals: CoverageTotals;
    belowThresholdFiles: CoverageFile[];
}
export interface ReportHeader {
    projectName: string;
    generatedAt: string;
    testCommand: string;
    framework: FrameworkId;
    frameworkVersion?: string;
    environmentSummary: string;
}
export interface ParseResult {
    framework: FrameworkId;
    frameworkVersion?: string;
    summary: TestSummary;
    fileGroups: TestFileGroup[];
    failures: TestCase[];
    coverage?: CoverageReport;
    rawResultFilePath?: string;
}
export interface ExecutionContext {
    cwd: string;
    testCommand?: string;
    resultFile?: string;
    mode: "execute" | "parse";
}
export interface SkillConfig {
    testCommand: "auto" | string;
    resultFile: "auto" | string;
    outputFormat: "markdown" | "html" | "json";
    outputPath: string;
    coverage: "auto" | "on" | "off";
    failThreshold?: number;
}
export interface GeneratedReport {
    header: ReportHeader;
    summary: TestSummary;
    failures: TestCase[];
    fileGroups: TestFileGroup[];
    coverage?: CoverageReport;
    appendix: {
        rawResultFilePath?: string;
        toolVersion: string;
    };
    outputPath: string;
    outputFormat: SkillConfig["outputFormat"];
}
export interface SkillError {
    code: SkillErrorCode;
    message: string;
    diagnostic?: string;
    cause?: unknown;
}
export type SkillErrorCode = "PARSE_FORMAT_INVALID" | "FRAMEWORK_NOT_DETECTED" | "TEST_COMMAND_FAILED" | "RESULT_FILE_NOT_FOUND" | "RESULT_FILE_EMPTY" | "OUTPUT_WRITE_FAILED" | "UNSUPPORTED_FORMAT" | "INTERNAL_ERROR";
