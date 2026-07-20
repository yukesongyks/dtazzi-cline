/**
 * 测试报告 Skill — 解析器注册表
 *
 * 按 SSOT 优先级注册解析器：vitest-json → jest-json → junit-xml。
 * resolve(input) 返回首个 detect 命中的解析器；均未命中抛
 * UnrecognizedResultFormatError（非空诊断，AC4）。
 *
 * 新增解析器流程（文档化）：
 * 1. 实现 ParserPlugin 接口（id/detect/parse），见 ./interface.ts
 * 2. 在 registerAll() 中调用 register()，按期望优先级顺序插入
 * 3. 不改动既有解析器实现（NFR5：插件式，对扩展开放、对修改关闭）
 */

import {
  NA_TOKEN,
  type IntermediateModel,
  type ParserPlugin,
  type RawInput,
  UnrecognizedResultFormatError,
} from './interface';

/** 注册表：按注册顺序即优先级 */
const registry: ParserPlugin[] = [];

/**
 * 注册单个解析器。重复 id 视为覆盖（后注册者替换前者）。
 */
export function registerParser(plugin: ParserPlugin): void {
  const idx = registry.findIndex((p) => p.id === plugin.id);
  if (idx >= 0) {
    registry[idx] = plugin;
  } else {
    registry.push(plugin);
  }
}

/**
 * 占位注册：真实解析器实现于后续 Task。
 *
 * 当前阶段骨架层仅注册占位条目以保证 resolve 流程类型自洽；
 * 实际 detect/parse 逻辑由后续 Task 的 vitest-json / jest-json /
 * junit-xml 解析器实现填充。
 */
export function registerAll(): void {
  // 后续 Task 在此调用 registerParser(vitestJsonParser) 等。
  // 当前骨架层：无具体解析器注册，resolve 将抛 UnrecognizedResultFormatError。
}

/**
 * 按优先级返回首个 detect 命中的解析器。
 *
 * @param input 原始结果文件输入
 * @throws UnrecognizedResultFormatError 当所有已注册解析器均未命中
 */
export function resolve(input: RawInput): ParserPlugin {
  for (const parser of registry) {
    try {
      if (parser.detect(input)) {
        return parser;
      }
    } catch {
      // detect 不应抛错（契约）；单解析器异常时跳过，继续下一个。
    }
  }
  throw new UnrecognizedResultFormatError(
    '无法识别测试结果文件格式：无已注册解析器的 detect 命中该输入。' +
      `已注册解析器数量: ${registry.length}。` +
      '请确认结果文件由 vitest/jest JSON 或 junit xml 生成，且对应解析器已注册。',
  );
}

// 确保未实际使用的导入不影响类型自洽（占位引用）
export const _NA_TOKEN_REF: typeof NA_TOKEN = NA_TOKEN;
export type _IntermediateModelRef = IntermediateModel;

// 模块加载时自动注册（骨架层无解析器，仅初始化注册表）
registerAll();
