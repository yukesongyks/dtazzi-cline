// Test Report Skill · 框架识别 (detector.ts) — FR1.1
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FrameworkId } from "./types.js";

/**
 * FR1.1 自动识别项目使用的测试框架与运行命令，识别优先级：
 *  a. 用户显式指定的命令；
 *  b. package.json scripts(test)、pyproject.toml、Cargo.toml 等项目配置；
 *  c. 框架特征文件推断（jest.config.*、vitest.config.*、pytest.ini）。
 */
export interface DetectionResult {
  framework: FrameworkId;
  testCommand: string;
  frameworkVersion?: string;
  evidence: string;
}

export interface DetectOptions {
  cwd: string;
  /** 用户显式指定的测试命令（优先级 a） */
  userTestCommand?: string;
  /** 用户显式指定的框架（覆盖推断） */
  userFramework?: FrameworkId;
}

export function detectFramework(opts: DetectOptions): DetectionResult {
  const { cwd } = opts;

  // a. 用户显式指定框架 → 直接采信，命令优先用 userTestCommand
  if (opts.userFramework && opts.userFramework !== "unknown") {
    return {
      framework: opts.userFramework,
      testCommand: opts.userTestCommand ?? defaultCommandFor(opts.userFramework),
      evidence: "用户显式指定框架",
    };
  }

  // b/c. 配置/特征文件推断
  const byConfig = detectByConfigFiles(cwd);
  if (byConfig) return byConfig;

  // 兜底
  return {
    framework: "unknown",
    testCommand: opts.userTestCommand ?? "npm test",
    evidence: "未识别到测试框架配置，使用默认 npm test",
  };
}

function defaultCommandFor(f: FrameworkId): string {
  switch (f) {
    case "vitest":
      return "npx vitest run";
    case "jest":
      return "npx jest";
    case "pytest":
      return "pytest";
    case "junit":
      return "npm test";
    default:
      return "npm test";
  }
}

/** b+c. 按特征文件/配置推断 */
function detectByConfigFiles(cwd: string): DetectionResult | null {
  // Vitest 优先于 Jest 检测（vitest.config.*）
  if (hasAny(cwd, ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"])) {
    return {
      framework: "vitest",
      testCommand: "npx vitest run",
      evidence: "发现 vitest.config.* 特征文件",
    };
  }
  if (hasAny(cwd, ["jest.config.ts", "jest.config.js", "jest.config.mjs", "jest.config.cjs"])) {
    return {
      framework: "jest",
      testCommand: "npx jest",
      evidence: "发现 jest.config.* 特征文件",
    };
  }
  // package.json scripts.test 内容推断
  const pj = readPackageJson(cwd);
  if (pj) {
    const testScript: string | undefined = pj.scripts?.test;
    if (typeof testScript === "string") {
      if (/vitest/.test(testScript)) {
        return {
          framework: "vitest",
          testCommand: "npx vitest run",
          frameworkVersion: pickDepVersion(pj, "vitest"),
          evidence: "package.json scripts.test 含 vitest",
        };
      }
      if (/jest/.test(testScript)) {
        return {
          framework: "jest",
          testCommand: "npx jest",
          frameworkVersion: pickDepVersion(pj, "jest"),
          evidence: "package.json scripts.test 含 jest",
        };
      }
      if (/pytest/.test(testScript)) {
        return { framework: "pytest", testCommand: "pytest", evidence: "package.json scripts.test 含 pytest" };
      }
    }
  }
  // pytest 特征
  if (hasAny(cwd, ["pytest.ini", "pyproject.toml", "tox.ini"])) {
    return { framework: "pytest", testCommand: "pytest", evidence: "发现 pytest 特征文件" };
  }
  return null;
}

function hasAny(cwd: string, names: string[]): boolean {
  return names.some((n) => existsSync(join(cwd, n)));
}

interface PkgShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

function readPackageJson(cwd: string): PkgShape | null {
  const p = join(cwd, "package.json");
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    if (raw.trim() === "") return null;
    return JSON.parse(raw) as PkgShape;
  } catch {
    return null;
  }
}

function pickDepVersion(pj: PkgShape, dep: string): string | undefined {
  return pj.devDependencies?.[dep] ?? pj.dependencies?.[dep];
}
