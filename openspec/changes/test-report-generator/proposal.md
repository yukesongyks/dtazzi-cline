# 测试报告生成器 (Test Report Generator) 1.0

## Why

当前团队在完成测试执行后，测试结果散落在终端输出、CI 日志或框架原生产物（如 JUnit XML、coverage 目录）中，存在以下痛点：

- 测试结果需要人工收集、整理、汇总，耗时且易遗漏
- 缺乏统一格式的测试报告，跨项目/跨团队沟通成本高
- 失败用例的上下文（错误信息、堆栈、关联代码）需要人工回溯
- 覆盖率、通过率等质量指标无法沉淀为可追踪的历史数据

## What Changes

新增一个 Skill，使 Agent 在执行测试后能够自动解析测试结果并生成结构化、可读性强的标准测试报告。核心能力：

1. **自动识别测试框架**：支持从项目配置（package.json、vitest.config.ts 等）自动推断测试命令与框架
2. **双模式工作**：执行模式（运行测试 + 收集结果）与解析模式（仅解析已有结果文件，如 JUnit XML）
3. **标准化报告结构**：报告头 → 结果摘要 → 失败用例分析 → 用例明细 → 覆盖率 → 附录
4. **多框架支持（P0）**：Jest（JSON reporter）、Vitest（JSON reporter）、JUnit XML（通用兜底）
5. **多格式输出**：默认 Markdown，P1 支持 HTML 与 JSON 伴随产物
6. **覆盖率集成**：自动提取语句/分支/函数/行覆盖率，低于阈值标注

## Impact

- **新增 Skill**：`test-report-generator` — 位于 `skills/test-report-generator/`
- **新增依赖**：JUnit XML 解析库（如 `fast-xml-parser`）、覆盖率报告解析（复用现有 vitest/c8 输出）
- **影响范围**：独立 Skill，不修改现有系统代码；仅在 Agent 触发时介入
- **输出产物**：`reports/test-report-<timestamp>.md`（默认路径，用户可覆盖）
- **非目标（本期不做）**：测试用例自动生成/修复、在线托管、历史趋势对比、非测试类质量报告聚合