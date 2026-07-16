/**
 * 测试执行器
 *
 * 负责：
 * 1. 检测项目使用的测试框架
 * 2. 构建测试执行命令（含 JSON reporter 参数）
 * 3. 执行测试并收集结果文件路径
 * 4. 执行失败处理
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { detectFramework, resolveTestCommand } from "./config";

export interface RunResult {
  /** 结果文件路径 */
  resultFilePath: string;
  /** 检测到的框架 */
  framework: string;
  /** 实际执行的命令 */
  command: string;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 框架版本 */
  frameworkVersion?: string;
}

/**
 * 获取框架版本号
 */
function getFrameworkVersion(framework: string): string {
  try {
    switch (framework) {
      case "jest": {
        const pkgPath = path.join(process.cwd(), "node_modules", "jest", "package.json");
        if (fs.existsSync(pkgPath)) {
          return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "未获取";
        }
        return "未获取";
      }
      case "vitest": {
        const pkgPath = path.join(process.cwd(), "node_modules", "vitest", "package.json");
        if (fs.existsSync(pkgPath)) {
          return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "未获取";
        }
        return "未获取";
      }
      default:
        return "未获取";
    }
  } catch {
    return "未获取";
  }
}

/**
 * 构建测试执行命令
 *
 * 确保命令包含正确的 reporter 参数以生成 JSON/XML 结果文件。
 */
export function buildCommand(framework: string, explicitCommand?: string): {
  command: string;
  resultFilePath: string;
} {
  const command = resolveTestCommand(framework, explicitCommand);

  // 从命令中提取输出文件路径
  const outputFileMatch = command.match(/--outputFile[= ]([^\s]+)/);
  const junitMatch = command.match(/--junitxml[= ]([^\s]+)/);
  const redirectMatch = command.match(/>\s*([^\s]+)/);

  let resultFilePath: string;

  if (outputFileMatch) {
    resultFilePath = outputFileMatch[1];
  } else if (junitMatch) {
    resultFilePath = junitMatch[1];
  } else if (redirectMatch) {
    resultFilePath = redirectMatch[1];
  } else {
    // 默认路径
    resultFilePath = `/tmp/test-report-result-${Date.now()}.json`;
  }

  return { command, resultFilePath };
}

/**
 * 执行测试并收集结果
 *
 * @param explicitCommand 用户显式指定的测试命令（可选）
 * @returns 执行结果，包含结果文件路径
 */
export function runTests(explicitCommand?: string): RunResult {
  const framework = detectFramework();

  if (!framework && !explicitCommand) {
    throw new Error(
      "无法自动检测测试框架，请指定 test_command。\n" +
        "支持的检测方式：package.json scripts.test、jest.config.*、vitest.config.*"
    );
  }

  const resolvedFramework = framework || "custom";
  const { command, resultFilePath } = buildCommand(resolvedFramework, explicitCommand);

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const result = execSync(command, {
      cwd: process.cwd(),
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB
      timeout: 300_000, // 5 分钟超时
      env: {
        ...process.env,
        CI: "true",
        FORCE_COLOR: "0",
      },
    });
    stdout = result;
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
      message?: string;
    };
    stdout = execErr.stdout || "";
    stderr = execErr.stderr || "";
    exitCode = execErr.status ?? 1;

    // 测试用例失败（exitCode != 0）不属于"执行失败"，而是正常的测试结果
    // 只有当结果文件未生成时才认为是执行失败
    if (!fs.existsSync(resultFilePath)) {
      throw new Error(
        `测试执行失败 (exit code: ${exitCode}):\n${stderr || stdout || "无错误输出"}`
      );
    }
  }

  // 验证结果文件是否存在
  if (!fs.existsSync(resultFilePath)) {
    throw new Error(
      `测试执行完成但未生成结果文件: ${resultFilePath}\n` +
        `stdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`
    );
  }

  return {
    resultFilePath,
    framework: resolvedFramework,
    command,
    stdout,
    stderr,
    exitCode,
    frameworkVersion: getFrameworkVersion(resolvedFramework),
  };
}