/**
 * 测试报告 Skill — 框架/结果文件探测
 *
 * detectFramework(rootDir): 从 package.json 读取框架与版本证据
 * sniffResultFile(filePath): 按内容嗅探结果文件格式
 *
 * 无法识别格式时抛 UnrecognizedResultFormatError（非空诊断，AC4）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { NA_TOKEN, type FrameworkId, UnrecognizedResultFormatError } from './types';

/** 框架探测结果 */
export interface DetectedFramework {
  /** 框架标识，如 'vitest' / 'jest' / 'junit'；缺失降级 NA_TOKEN */
  framework: string;
  /** 运行器命令，如 'npx vitest' / 'npx jest'；缺失降级 NA_TOKEN */
  runner: string;
  /** 版本证据，格式 'vitest@x.y.z'；缺失标注 '版本: 未获取' */
  configEvidence: string;
}

/** 已知框架到 package.json 依赖键的映射 */
const FRAMEWORK_KEYS: Record<string, { dep: string; runner: string }> = {
  vitest: { dep: 'vitest', runner: 'npx vitest' },
  jest: { dep: 'jest', runner: 'npx jest' },
};

/**
 * 读取 package.json 中的依赖版本（合并 dependencies 与 devDependencies）。
 */
function readPackageJson(rootDir: string): {
  name: string | undefined;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const pkgPath = path.join(rootDir, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) {
      return { name: undefined, dependencies: {}, devDependencies: {} };
    }
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: parsed.name,
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {},
    };
  } catch {
    return { name: undefined, dependencies: {}, devDependencies: {} };
  }
}

/**
 * 从 dependencies/devDependencies 查找指定包版本。
 * @returns 版本字符串（去 '^~' 前缀），未找到返回 undefined
 */
function findVersion(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  pkgName: string,
): string | undefined {
  const v = deps[pkgName] ?? devDeps[pkgName];
  if (!v) return undefined;
  return v.replace(/^[^0-9]*/, '');
}

/**
 * 探测项目使用的测试框架与版本（基于 package.json）。
 * 缺失证据时字段降级，不抛错。
 */
export function detectFramework(rootDir: string): DetectedFramework {
  const { dependencies, devDependencies } = readPackageJson(rootDir);

  // 按优先级探测：vitest 优先于 jest
  for (const [fw, cfg] of Object.entries(FRAMEWORK_KEYS)) {
    const version = findVersion(dependencies, devDependencies, cfg.dep);
    if (version) {
      return {
        framework: fw,
        runner: cfg.runner,
        configEvidence: `${fw}@${version}`,
      };
    }
  }

  // 无框架证据：降级，不抛错（解析层仍可基于结果文件内容工作）
  return {
    framework: NA_TOKEN,
    runner: NA_TOKEN,
    configEvidence: '版本: 未获取',
  };
}

/**
 * 按内容嗅探结果文件格式（解析器优先级：vitest-json > jest-json > junit-xml）。
 *
 * 内容特征：
 * - junit-xml：以 `<` 开头且含 `testsuite`
 * - vitest-json / jest-json：以 `{` 开头且含 `testResults` / `numPassedTestSuites`
 *   - vitest-json：含 `testResults[].console` 或 `name` 字段风格（vitest 输出与 jest 高度相似，
 *     精确区分留待解析器 detect；此处优先返回 vitest-json 以匹配优先级）
 *
 * 无法识别时抛 UnrecognizedResultFormatError（AC4，非空诊断）。
 */
export function sniffResultFile(content: string): FrameworkId {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('<')) {
    if (/testsuite/i.test(trimmed.slice(0, 2048))) {
      return 'junit-xml';
    }
  }
  if (trimmed.startsWith('{')) {
    const head = trimmed.slice(0, 4096);
    if (/(testResults|numPassedTestSuites|numFailedTestSuites)/.test(head)) {
      // vitest 与 jest JSON 结构相似；按优先级优先返回 vitest-json，
      // 由 registry 中各解析器 detect 做最终裁决。
      return 'vitest-json';
    }
  }

  throw new UnrecognizedResultFormatError(
    '无法识别测试结果文件格式：内容既非 JUnit XML（未发现 <testsuite>），' +
      '亦非 Vitest/Jest JSON（未发现 testResults / numPassedTestSuites 字段）。' +
      '请确认结果文件由支持的测试框架生成（vitest/jest JSON 或 junit xml）。',
  );
}

/**
 * 读取结果文件文本内容。
 */
export function readResultFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}
