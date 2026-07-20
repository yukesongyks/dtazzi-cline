/**
 * 测试报告 Skill — 解析器插件接口
 *
 * 该模块为解析层对外契约入口。ParserPlugin 接口定义于 ../types，
 * 此处集中再导出，便于解析器实现方从单一入口引用，并固化 RawInput/ParseCtx。
 *
 * 新增解析器流程：
 * 1. 实现本接口 ParserPlugin（id/detect/parse）
 * 2. 在 registry.ts 的 registerAll 中注册
 * 3. 无需改动既有解析器（NFR5 插件式）
 */

export type {
  FrameworkId,
  RawInput,
  ParseCtx,
  ParserPlugin,
  IntermediateModel,
} from '../types';
