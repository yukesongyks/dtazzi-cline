/**
 * 框架自动检测
 * 检测优先级：用户指定 > package.json scripts.test > 特征文件 > 扩展名
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FrameworkDetection, TestFramework } from './types';

/** 框架特征文件映射 */
const FRAMEWORK_CONFIG_FILES: Record<string, TestFramework> = {
  'vitest.config.ts': 'vitest',
  'vitest.config.js': 'vitest',
  'vitest.config.mjs': 'vitest',
  'vitest.config.cjs': 'vitest',
  'jest.config.ts': 'jest',
  'jest.config.js': 'jest',
  'jest.config.mjs': 'jest',
  'jest.config.cjs': 'jest',
  'jest.config.json': 'jest',
  'pytest.ini': 'pytest',
  'pyproject.toml': 'pytest',
  'setup.cfg': 'pytest',
  'tox.ini': 'pytest',
};

/** 框架对应执行命令 */
const FRAMEWORK_COMMANDS: Record<TestFramework, string> = {
  vitest: 'npx vitest run --reporter=json',
  jest: 'npx jest --json --outputFile=/tmp/jest-results.json',
  pytest: 'python -m pytest --junitxml=/tmp/pytest-results.xml',
  junit: '',
  unknown: '',
};

/**
 * 检测项目使用的测试框架
 * @param cwd 项目根目录
 * @param userCommand 用户显式指定的测试命令
 * @param resultFile 用户指定的结果文件路径
 */
export function detectFramework(
  cwd: string,
  userCommand?: string,
  resultFile?: string,
): FrameworkDetection {
  // 1. 用户显式指定命令
  if (userCommand) {
    const framework = inferFrameworkFromCommand(userCommand);
    return {
      framework,
      source: 'user',
      run_command: userCommand,
    };
  }

  // 2. 解析模式：resultFile 指定时，按扩展名推断
  if (resultFile) {
    const ext = path.extname(resultFile).toLowerCase();
    if (ext === '.xml') {
      return { framework: 'junit', source: 'extension', run_command: '' };
    }
    if (ext === '.json') {
      return { framework: 'vitest', source: 'extension', run_command: '' };
    }
    return { framework: 'junit', source: 'extension', run_command: '' };
  }

  // 3. package.json scripts.test
  const pkgJson = readPackageJson(cwd);
  if (pkgJson?.scripts?.test) {
    const testScript = pkgJson.scripts.test;
    const framework = inferFrameworkFromCommand(testScript);
    return {
      framework,
      source: 'package_json',
      run_command: resolveRunCommand(framework, testScript),
    };
  }

  // 4. 特征文件检测
  for (const [configFile, framework] of Object.entries(FRAMEWORK_CONFIG_FILES)) {
    if (fs.existsSync(path.join(cwd, configFile))) {
      return {
        framework,
        source: 'config_file',
        run_command: FRAMEWORK_COMMANDS[framework],
      };
    }
  }

  // 5. 未检测到
  return {
    framework: 'unknown',
    source: 'config_file',
    run_command: undefined,
  };
}

/**
 * 从测试脚本命令推断框架
 */
function inferFrameworkFromCommand(command: string): TestFramework {
  const lower = command.toLowerCase();
  if (lower.includes('vitest')) return 'vitest';
  if (lower.includes('jest')) return 'jest';
  if (lower.includes('pytest')) return 'pytest';
  if (lower.includes('junit')) return 'junit';
  // 默认返回 vitest（当前项目使用 vitest）
  return 'vitest';
}

/**
 * 解析实际执行命令，将默认 test 脚本替换为带 reporter 的版本
 */
function resolveRunCommand(framework: TestFramework, _testScript: string): string {
  return FRAMEWORK_COMMANDS[framework] || '';
}

/**
 * 读取 package.json
 */
function readPackageJson(cwd: string): { scripts?: { test?: string }; name?: string } | null {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      return JSON.parse(raw) as { scripts?: { test?: string }; name?: string };
    }
  } catch {
    // 读取失败，跳过
  }
  return null;
}

/**
 * 获取项目名称（从 package.json）
 */
export function getProjectName(cwd: string): string {
  const pkg = readPackageJson(cwd);
  return pkg?.name ?? path.basename(cwd);
}

/**
 * 获取 Node.js 版本 + 平台信息
 */
export function getEnvironmentInfo(): string {
  return `Node.js ${process.version} / ${process.platform} ${process.arch}`;
}