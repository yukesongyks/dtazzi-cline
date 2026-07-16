/**
 * JUnit XML 通用解析器
 *
 * 解析标准 JUnit XML 格式，支持 <testsuite> 和 <testsuites> 两种结构。
 * 参考 JUnit XML 格式规范：https://llg.cubic.org/docs/junit/
 */

import type { TestReport, FailureDetail, TestSuiteDetail, TestCaseDetail } from "../types";
import { sanitizeStackTrace, sanitizeErrorMessage, sanitizeFilePath } from "../sanitize";
import type { TestResultParser, ParseOptions } from "./types";

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
 * 简单的 XML 解析器（不依赖外部库，仅处理 JUnit 格式）
 *
 * 使用正则提取标签，不构建完整 DOM 树。
 * 这是为了保持零依赖，同时满足 JUnit XML 解析需求。
 */
interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  textContent: string;
}

/**
 * 解析 XML 字符串为节点树
 */
function parseXml(xml: string): XmlNode | null {
  // 移除 XML 声明和注释
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?xml[^?]*\?>/g, "");

  const tagRegex = /<(\/?)([a-zA-Z0-9_.-]+)((?:\s+[a-zA-Z0-9_.-]+="[^"]*")*)\s*(\/?)>/g;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const isClosing = match[1] === "/";
    const tagName = match[2];
    const attrStr = match[3];
    const isSelfClosing = match[4] === "/";

    // 提取标签间的文本
    const textBefore = cleaned.slice(lastIndex, match.index).trim();
    lastIndex = tagRegex.lastIndex;

    if (textBefore && stack.length > 0) {
      stack[stack.length - 1].textContent += textBefore;
    }

    if (isClosing) {
      if (stack.length > 0 && stack[stack.length - 1].name === tagName) {
        const node = stack.pop()!;
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
        } else {
          root = node;
        }
      }
    } else {
      const attrs: Record<string, string> = {};
      if (attrStr) {
        const attrRegex = /([a-zA-Z0-9_.-]+)="([^"]*)"/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          attrs[attrMatch[1]] = attrMatch[2];
        }
      }

      const node: XmlNode = {
        name: tagName,
        attributes: attrs,
        children: [],
        textContent: "",
      };

      if (isSelfClosing) {
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
        } else {
          root = node;
        }
      } else {
        stack.push(node);
      }
    }
  }

  return root;
}

/**
 * 解析单个 <testcase> 节点
 */
function parseTestCase(
  tc: XmlNode,
  suiteName: string
): TestCaseDetail {
  const className = tc.attributes.classname || "";
  const name = tc.attributes.name || "unknown";
  const fullName = className ? `${className}.${name}` : name;
  const time = parseFloat(tc.attributes.time || "0") * 1000; // 转换为毫秒

  const failureNode = tc.children.find((c) => c.name === "failure");
  const skippedNode = tc.children.find((c) => c.name === "skipped");
  const errorNode = tc.children.find((c) => c.name === "error");

  let status: TestCaseDetail["status"];
  if (failureNode || errorNode) {
    status = "failed";
  } else if (skippedNode) {
    status = "skipped";
  } else {
    status = "passed";
  }

  return {
    name: fullName,
    status,
    durationMs: time,
  };
}

/**
 * 提取失败用例的 FailureDetail
 */
function extractFailure(
  tc: XmlNode,
  filePath: string,
  className: string
): FailureDetail | null {
  const failureNode = tc.children.find((c) => c.name === "failure");
  const errorNode = tc.children.find((c) => c.name === "error");

  const failedNode = failureNode || errorNode;
  if (!failedNode) return null;

  const name = tc.attributes.name || "unknown";
  const fullName = className ? `${className}.${name}` : name;
  const message = sanitizeErrorMessage(
    failedNode.attributes.message || failedNode.textContent.split("\n")[0] || "未知错误"
  );
  const stack = sanitizeStackTrace(
    truncateStackTrace(failedNode.textContent || failedNode.attributes.message || "")
  );

  return {
    testName: fullName,
    filePath: sanitizeFilePath(filePath),
    errorMessage: message,
    stackTrace: stack,
  };
}

export class JunitXmlParser implements TestResultParser {
  readonly formatId = "junit-xml";

  canParse(content: string, filePath?: string): boolean {
    if (filePath && filePath.endsWith(".xml")) {
      return content.includes("<testsuite") || content.includes("<testsuites");
    }
    // 也支持内容检测
    return content.includes("<testsuite") || content.includes("<testsuites");
  }

  parse(content: string, options?: ParseOptions): TestReport {
    const root = parseXml(content);
    if (!root) {
      throw new Error("无法解析 JUnit XML：无效的 XML 格式");
    }

    const failures: FailureDetail[] = [];
    const suites: TestSuiteDetail[] = [];

    let totalTests = 0;
    let totalFailures = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let totalTime = 0;

    // 收集所有 <testsuite> 节点（支持 <testsuites> 包裹）
    let suiteNodes: XmlNode[] = [];

    if (root.name === "testsuites") {
      suiteNodes = root.children.filter((c) => c.name === "testsuite");
    } else if (root.name === "testsuite") {
      suiteNodes = [root];
    }

    for (const suite of suiteNodes) {
      const suiteName = suite.attributes.name || "unknown";
      const suiteTime = parseFloat(suite.attributes.time || "0") * 1000;
      totalTime += suiteTime;

      const suiteFailures = parseInt(suite.attributes.failures || "0", 10);
      const suiteErrors = parseInt(suite.attributes.errors || "0", 10);
      const suiteSkipped = parseInt(suite.attributes.skipped || "0", 10);
      const suiteTests = parseInt(suite.attributes.tests || "0", 10);

      totalFailures += suiteFailures;
      totalErrors += suiteErrors;
      totalSkipped += suiteSkipped;
      totalTests += suiteTests;

      const testCases = suite.children.filter((c) => c.name === "testcase");
      const cases: TestCaseDetail[] = [];

      // 推断文件路径：从 classname 或 suite name 提取
      const filePath = suite.attributes.file || suiteName;

      for (const tc of testCases) {
        cases.push(parseTestCase(tc, suiteName));

        const failure = extractFailure(tc, filePath, tc.attributes.classname || suiteName);
        if (failure) {
          failures.push(failure);
        }
      }

      suites.push({
        filePath: sanitizeFilePath(filePath),
        durationMs: suiteTime,
        cases,
      });
    }

    const passed = totalTests - totalFailures - totalErrors - totalSkipped;

    return {
      meta: {
        projectName: options?.projectName || extractProjectName(),
        generatedAt: new Date().toISOString(),
        command: options?.command || "--",
        framework: "JUnit XML",
        frameworkVersion: options?.frameworkVersion || "未获取",
        environment: `${process.platform} / Node ${process.version}`,
      },
      summary: {
        total: totalTests,
        passed: Math.max(0, passed),
        failed: totalFailures + totalErrors,
        skipped: totalSkipped,
        passRate:
          totalTests > 0
            ? Math.round((Math.max(0, passed) / totalTests) * 100 * 100) / 100
            : 0,
        durationMs: totalTime,
        verdict: totalFailures + totalErrors > 0 ? "fail" : "pass",
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