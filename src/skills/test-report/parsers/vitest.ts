/**
 * Vitest JSON 解析器
 *
 * 解析 Vitest `--reporter=json` 输出。
 * 参考 Vitest 文档：https://vitest.dev/guide/reporters.html#json-reporter
 */

import type { TestReport, FailureDetail, TestSuiteDetail, TestCaseDetail } from "../types";
import { sanitizeStackTrace, sanitizeErrorMessage, sanitizeFilePath } from "../sanitize";
import type { TestResultParser, ParseOptions } from "./types";

/** Vitest JSON reporter 输出结构 */
interface VitestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  testResults: VitestTestResult[];
  startTime?: number;
  success?: boolean;
}

interface VitestTestResult {
  name: string; // 文件路径
  status: "passed" | "failed" | "pending";
  startTime?: number;
  endTime?: number;
  /** Vitest 的 assertionResults 或直接包含 tasks */
  assertionResults?: VitestAssertionResult[];
  /** 某些版本使用 tasks */
  tasks?: VitestTask[];
  message?: string;
}

interface VitestAssertionResult {
  ancestorTitles?: string[];
  name?: string;
  title?: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  duration?: number;
  failureMessages?: string[];
  /** 某些版本使用 error */
  error?: { message: string; stack?: string };
}

interface VitestTask {
  name: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  duration?: number;
  result?: {
    error?: { message: string; stack?: string };
  };
  tasks?: VitestTask[];
}

/** 堆栈截断最大行数 */
const MAX_STACK_LINES = 20;

/**
 * 截断堆栈跟踪
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
 * 获取用例全名
 */
function getFullName(ancestor: string[], title: string): string {
  return [...ancestor, title].join(" › ");
}

/**
 * 提取项目名
 */
function extractProjectName(): string {
  try {
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    return pkg.name || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 递归提取 Vitest 嵌套 task 中的所有用例
 */
function flattenTasks(
  tasks: VitestTask[],
  ancestor: string[],
  filePath: string,
  failures: FailureDetail[]
): TestCaseDetail[] {
  const cases: TestCaseDetail[] = [];

  for (const task of tasks) {
    const fullName = [...ancestor, task.name].join(" › ");

    if (task.tasks && task.tasks.length > 0) {
      // 这是 describe 块，递归
      cases.push(
        ...flattenTasks(task.tasks, [...ancestor, task.name], filePath, failures)
      );
    } else {
      // 叶子用例
      const duration = task.duration ?? 0;
      const status = mapStatus(task.status);

      if (status === "failed") {
        const error = task.result?.error;
        const rawMessage = error?.message || "未知错误";
        failures.push({
          testName: fullName,
          filePath,
          errorMessage: sanitizeErrorMessage(rawMessage.split("\n")[0] || rawMessage),
          stackTrace: sanitizeStackTrace(
            truncateStackTrace(error?.stack || rawMessage)
          ),
        });
      }

      cases.push({ name: fullName, status, durationMs: duration });
    }
  }

  return cases;
}

function mapStatus(status: string): TestCaseDetail["status"] {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
    case "todo":
      return "skipped";
    case "pending":
      return "pending";
    default:
      return "pending";
  }
}

export class VitestParser implements TestResultParser {
  readonly formatId = "vitest-json";

  canParse(content: string, filePath?: string): boolean {
    if (filePath && filePath.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content);
        // Vitest JSON 输出包含 numTotalTests 和 testResults
        // 区分于 Jest：检查是否有 tasks 结构或 error 字段
        const hasVitestMarkers =
          typeof parsed.numTotalTests === "number" &&
          Array.isArray(parsed.testResults) &&
          (parsed.testResults.some(
            (r: VitestTestResult) => r.tasks || r.assertionResults?.some((a: VitestAssertionResult) => a.error)
          ) ||
            parsed.testResults.length === 0);
        return hasVitestMarkers || (typeof parsed.numTotalTests === "number" && Array.isArray(parsed.testResults));
      } catch {
        return false;
      }
    }
    return false;
  }

  parse(content: string, options?: ParseOptions): TestReport {
    const data: VitestJsonOutput = JSON.parse(content);

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

      let cases: TestCaseDetail[];

      if (result.tasks && result.tasks.length > 0) {
        // 使用 tasks 结构（嵌套 describe）
        cases = flattenTasks(result.tasks, [], filePath, failures);
      } else if (result.assertionResults && result.assertionResults.length > 0) {
        // 使用 assertionResults 结构（扁平）
        cases = result.assertionResults.map((a) => {
          const title = a.title || a.name || "";
          const ancestor = a.ancestorTitles || [];
          const caseName = getFullName(ancestor, title);
          const duration = a.duration ?? 0;

          if (a.status === "failed") {
            const rawMessage =
              a.failureMessages?.[0] ||
              a.error?.message ||
              "未知错误";
            failures.push({
              testName: caseName,
              filePath,
              errorMessage: sanitizeErrorMessage(rawMessage.split("\n")[0] || rawMessage),
              stackTrace: sanitizeStackTrace(
                truncateStackTrace(a.error?.stack || rawMessage)
              ),
            });
          }

          return {
            name: caseName,
            status: mapStatus(a.status),
            durationMs: duration,
          };
        });
      } else {
        cases = [];
      }

      suites.push({
        filePath,
        durationMs: suiteDuration,
        cases,
      });
    }

    const passed = data.numPassedTests ?? 0;
    const failed = data.numFailedTests ?? 0;
    const skipped = (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0);
    const total = data.numTotalTests ?? passed + failed + skipped;

    return {
      meta: {
        projectName: options?.projectName || extractProjectName(),
        generatedAt: new Date().toISOString(),
        command: options?.command || "--",
        framework: "Vitest",
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