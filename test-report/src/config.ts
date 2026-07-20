/**
 * 测试报告 Skill — 配置合并与项目根目录基准解析
 *
 * 合并默认值 (defaults.ts) 与用户覆盖；按 D5 从 cwd 向上查找
 * 含 package.json 的最近目录作为项目根目录。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_COVERAGE,
  DEFAULT_FAIL_THRESHOLD,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_RESULT_FILE,
  DEFAULT_TEST_COMMAND,
} from '../config/defaults';
import {
  validateCoverage,
  validateFailThreshold,
  validateOutputFormat,
  type CoverageMode,
  type OutputFormat,
} from '../config/schema';
import { NA_TOKEN } from './types';

/** 用户可覆盖的配置项（全部可选） */
export interface UserConfig {
  test_command?: string;
  result_file?: string;
  output_format?: OutputFormat;
  output_path?: string;
  coverage?: CoverageMode;
  fail_threshold?: number;
}

/** 解析后的最终配置（所有字段已填充） */
export interface ResolvedConfig {
  test_command: string;
  result_file: string;
  output_format: OutputFormat;
  output_path: string;
  coverage: CoverageMode;
  fail_threshold: number | undefined;
  /** 项目根目录（含 package.json 的最近目录，D5） */
  rootDir: string;
}

/**
 * 从给定起点目录向上查找含 package.json 的最近目录（D5）。
 * 找不到时回退到起点目录本身，rootDir 标注为该路径（不抛错，
 * 下游字段缺失降级 NA_TOKEN）。
 */
export function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir);
  // 防御性上限，避免符号链接导致无限上溯
  for (let i = 0; i < 64; i++) {
    try {
      if (fs.existsSync(path.join(current, 'package.json'))) {
        return current;
      }
    } catch {
      // 读权限异常，继续上溯
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(startDir);
}

/**
 * 合并默认值与用户覆盖，校验合法性，解析项目根目录。
 *
 * @param userConfig 用户覆盖（可选）
 * @param cwd 解析起点（默认 process.cwd()）
 */
export function resolveConfig(
  userConfig?: UserConfig,
  cwd: string = process.cwd(),
): ResolvedConfig {
  const rootDir = findProjectRoot(cwd);

  const output_format = validateOutputFormat(
    userConfig?.output_format ?? DEFAULT_OUTPUT_FORMAT,
  );
  const coverage = validateCoverage(userConfig?.coverage ?? DEFAULT_COVERAGE);
  const fail_threshold = validateFailThreshold(
    userConfig?.fail_threshold ?? DEFAULT_FAIL_THRESHOLD,
  );

  const test_command = userConfig?.test_command ?? DEFAULT_TEST_COMMAND;
  const result_file = userConfig?.result_file ?? DEFAULT_RESULT_FILE;
  const output_path = userConfig?.output_path ?? DEFAULT_OUTPUT_PATH;

  return {
    test_command,
    result_file,
    output_format,
    output_path,
    coverage,
    fail_threshold,
    rootDir: rootDir ?? NA_TOKEN,
  };
}
