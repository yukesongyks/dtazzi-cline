/**
 * 配置解析模块
 *
 * 从对话上下文、项目配置文件中提取和解析 Skill 配置项。
 * 提供默认值填充、配置校验、框架自动检测等功能。
 */

import * as fs from "fs";
import * as path from "path";
import type { SkillConfig } from "./types";
import { DEFAULT_SKILL_CONFIG } from "./types";

/** 支持的输出格式 */
const VALID_OUTPUT_FORMATS = ["markdown", "html", "json"] as const;

/** 支持的覆盖率策略 */
const VALID_COVERAGE_MODES = ["auto", "on", "off"] as const;

/**
 * 从对话上下文提取配置项覆盖值
 *
 * 配置来源优先级：
 * 1. 用户显式指定的配置项
 * 2. 项目配置文件
 * 3. 默认值
 */
export function resolveConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  const config: SkillConfig = {
    ...DEFAULT_SKILL_CONFIG,
    outputFormat: DEFAULT_SKILL_CONFIG.outputFormat,
    outputPath: DEFAULT_SKILL_CONFIG.outputPath,
    coverage: DEFAULT_SKILL_CONFIG.coverage,
    ...overrides,
  };

  // 校验 output_format
  if (!VALID_OUTPUT_FORMATS.includes(config.outputFormat)) {
    throw new Error(
      `不支持的输出格式: ${config.outputFormat}。支持的格式: ${VALID_OUTPUT_FORMATS.join(", ")}`
    );
  }

  // 校验 coverage
  if (!VALID_COVERAGE_MODES.includes(config.coverage)) {
    throw new Error(
      `不支持的覆盖率策略: ${config.coverage}。支持的策略: ${VALID_COVERAGE_MODES.join(", ")}`
    );
  }

  return config;
}

/**
 * 自动检测测试框架
 *
 * 检测优先级：
 * 1. 用户显式指定的 test_command
 * 2. package.json → scripts.test（Node 项目）
 * 3. 框架特征文件
 * 4. 默认回退
 */
export function detectFramework(): string | null {
  const cwd = process.cwd();

  // 检查 package.json
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

      if (pkg.scripts?.test) {
        const testScript = pkg.scripts.test.toLowerCase();

        if (testScript.includes("vitest")) return "vitest";
        if (testScript.includes("jest")) return "jest";
        if (testScript.includes("mocha")) return "mocha";

        // 默认推断为 Node 项目，使用 jest 作为默认
        return "jest";
      }
    }
  } catch {
    // package.json 不可读，继续
  }

  // 检查特征文件
  if (fs.existsSync(path.join(cwd, "vitest.config.ts")) || fs.existsSync(path.join(cwd, "vitest.config.js"))) {
    return "vitest";
  }
  if (
    fs.existsSync(path.join(cwd, "jest.config.ts")) ||
    fs.existsSync(path.join(cwd, "jest.config.js")) ||
    fs.existsSync(path.join(cwd, "jest.config.json"))
  ) {
    return "jest";
  }
  if (fs.existsSync(path.join(cwd, "pytest.ini")) || fs.existsSync(path.join(cwd, "pyproject.toml"))) {
    return "pytest";
  }

  return null;
}

/**
 * 构建测试执行命令
 *
 * 根据检测到的框架，构建带 JSON reporter 的测试命令。
 */
export function resolveTestCommand(
  framework: string | null,
  explicitCommand?: string
): string {
  if (explicitCommand) return explicitCommand;

  if (!framework) {
    throw new Error(
      "无法自动检测测试框架。请指定 test_command 或确保项目中存在 package.json / 框架特征文件。"
    );
  }

  switch (framework) {
    case "jest":
      return "npx jest --json --outputFile=/tmp/test-report-jest-result.json";
    case "vitest":
      return "npx vitest run --reporter=json --outputFile=/tmp/test-report-vitest-result.json";
    case "mocha":
      return "npx mocha --reporter json > /tmp/test-report-mocha-result.json";
    case "pytest":
      return "pytest --junitxml=/tmp/test-report-pytest-result.xml -q";
    default:
      throw new Error(`不支持的测试框架: ${framework}`);
  }
}

/**
 * 生成报告输出路径
 *
 * 默认格式：reports/test-report-<YYYYMMDD-HHmmss>.md
 */
export function resolveOutputPath(
  outputPath: string,
  format: "markdown" | "html" | "json"
): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const extension = format === "json" ? "json" : format === "html" ? "html" : "md";
  const fileName = `test-report-${timestamp}.${extension}`;

  // 确保输出目录存在
  const dir = outputPath.replace(/\/$/, "");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return path.join(dir, fileName);
}