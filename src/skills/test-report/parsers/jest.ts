/**
 * Jest JSON 解析器
 *
 * 解析 Jest `--json` 输出（jest --json --outputFile=result.json）的 testResults 结构。
 * 参考 Jest 官方文档：https://jestjs.io/docs/cli#--json
 */

import type { TestReport, FailureDetail, TestSuiteDetail, TestCaseDetail } from "../types";
import { sanitizeStackTrace, sanitizeErrorMessage, sanitizeFilePath } from "../sanitize";
import type { TestResultParser, ParseOptions } from "./types";

/** Jest JSON 输出的顶层结构 */
interface JestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
  startTime?: number;
  success?: boolean;
}

interface JestTestResult {
  name: string; // 文件路径
  status: "passed" | "failed" | "pending";
  startTime?: number;
  endTime?: number;
  assertionResults: JestAssertionResult[];
  message?: string;
}

interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  duration?: number;
  failureDetails?: JestFailureDetail[];
  failureMessages?: string[];
  location?: { line: number; column: number } | null;
}

interface JestFailureDetail {
  matcherResult?: {
    message: string;
  };
  message?: string;
}

/** 堆栈截断最大行数 */
const MAX_STACK_LINES = 20;

/**
 * 截断堆栈跟踪到最多 maxLines 行（过滤 node_modules）
 */
function truncateStackTrace(stack: string): string {
  if (!stack) return "";

  const lines = stack.split("\n");
  const filtered = lines.filter((line) => !line.includes("node_modules"));

  if (filtered.length <= MAX_STACK_LINES) {
    return filtered.join("\n");
  }

  return filtered.slice(0, MAX_STACK_LINES).join("\n") + `\n  ... (共 ${filtered.length} 行，已截断)`;
}

/**
 * 获取用例全名：ancestorTitles 拼接 title
 */
function getFullName(ancestor: string[], title: string): string {
  return [...ancestor, title].join(" › ");
}

/**
 * 从文件路径中提取项目名
 */
function extractProjectName(): string {
  try {
    // 尝试读取 package.json
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    return pkg.name || "unknown";
  } catch {
    return "unknown";
  }
}

export class JestParser implements TestResultParser {
  readonly formatId = "jest-json";

  canParse(content: string, filePath?: string): boolean {
    if (filePath && filePath.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content);
        return (
          typeof parsed.numTotalTests === "number" &&
          Array.isArray(parsed.testResults)
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  parse(content: string, options?: ParseOptions): TestReport {
    const data: JestJsonOutput = JSON.parse(content);

    const totalDuration =
      data.testResults.reduce((sum, r) => {
        const start = r.startTime ?? 0;
        const end = r.endTime ?? 0;
        return sum + (end > start ? end - start : 0);
      }, 0);

    const failures: FailureDetail[] = [];
    const suites: TestSuiteDetail[] = [];

    for (const result of data.testResults) {
      const filePath = sanitizeFilePath(result.name);
      const suiteDuration =
        result.endTime && result.startTime
          ? result.endTime - result.startTime
          : 0;

      const cases: TestCaseDetail[] = result.assertionResults.map((a) => {
        const caseName = getFullName(a.ancestorTitles, a.title);
        const duration = a.duration ?? 0;

        if (a.status === "failed") {
          const detail = a.failureDetails?.[0];
          const rawMessage =
            detail?.matcherResult?.message ||
            detail?.message ||
            a.failureMessages?.[0] ||
            "未知错误";

          failures.push({
            testName: caseName,
            filePath,
            errorMessage: sanitizeErrorMessage(rawMessage.split("\n")[0] || rawMessage),
            stackTrace: sanitizeStackTrace(truncateStackTrace(rawMessage)),
          });
        }

        return {
          name: caseName,
          status: a.status as TestCaseDetail["status"],
          durationMs: duration,
        };
      });

      suites.push({
        filePath,
        durationMs: suiteDuration,
        cases,
      });
    }

    const passed = data.numPassedTests ?? 0;
    const failed = data.numFailedTests ?? 0;
    const skipped = data.numPendingTests ?? 0;
    const total = data.numTotalTests ?? passed + failed + skipped;

    return {
      meta: {
        projectName: options?.projectName || extractProjectName(),
        generatedAt: new Date().toISOString(),
        command: options?.command || "--",
        framework: "Jest",
        frameworkVersion: options?.frameworkVersion || "未获取",
        environment: `${process.platform} / Node ${process.version}`,
      },
      summary: {
        total,
        passed,
        failed,
        skipped,
        passRate: total > 0 ? Math.round((passed / total) * 100 * 100) / 100 : 0,
        durationMs: totalDuration,
        verdict: failed > 0 ? "fail" : "pass",
      },
      failures,
      suites,
      appendix: {
        resultFiles: [],
        toolVersion: "test-report-skill/1.0",
      },
    };
  }
}