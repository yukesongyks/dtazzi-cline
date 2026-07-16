/**
 * 解析器注册表与调度
 *
 * 插件式架构：所有解析器注册到 PluginRegistry，支持自动检测和手动选择。
 */

import * as fs from "fs";
import type { TestReport } from "./types";
import type { TestResultParser, ParseOptions } from "./parsers/types";
import { JestParser } from "./parsers/jest";
import { VitestParser } from "./parsers/vitest";
import { JunitXmlParser } from "./parsers/junit-xml";

export class PluginRegistry {
  private parsers: TestResultParser[] = [];

  /** 注册解析器 */
  register(parser: TestResultParser): void {
    // 避免重复注册
    if (!this.parsers.some((p) => p.formatId === parser.formatId)) {
      this.parsers.push(parser);
    }
  }

  /** 获取指定格式的解析器 */
  get(formatId: string): TestResultParser | undefined {
    return this.parsers.find((p) => p.formatId === formatId);
  }

  /** 获取所有已注册的解析器 */
  getAll(): TestResultParser[] {
    return [...this.parsers];
  }

  /**
   * 根据文件扩展名和内容特征自动检测合适的解析器
   *
   * 检测优先级：Jest > Vitest > JUnit XML
   */
  detectParser(content: string, filePath: string): TestResultParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(content, filePath)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * 通用解析入口：自动检测并解析结果文件
   */
  parse(filePath: string, options?: ParseOptions): TestReport {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`结果文件不存在: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");

    const parser = this.detectParser(content, filePath);
    if (!parser) {
      throw new Error(
        `无法解析结果文件: ${filePath} — 不支持的格式或文件损坏。支持的格式: ${this.parsers.map((p) => p.formatId).join(", ")}`
      );
    }

    try {
      return parser.parse(content, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`无法解析结果文件: ${filePath} — ${message}`);
    }
  }
}

/**
 * 创建默认注册表实例（注册 P0 解析器）
 */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(new JestParser());
  registry.register(new VitestParser());
  registry.register(new JunitXmlParser());
  return registry;
}

/** 全局单例 */
let defaultRegistry: PluginRegistry | null = null;

export function getDefaultRegistry(): PluginRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}