# 任务分解：测试报告生成器 1.0

## M1：核心解析与 Markdown 报告（P0）

### T1.1 搭建 Skill 骨架
- 创建 `skills/test-report-generator/` 目录结构
- 编写 `SKILL.md` 入口定义
- 定义核心类型 `types.ts`
- 配置项解析 `config.ts`

### T1.2 框架自动检测
- 实现 `framework-detector.ts`
- 检测优先级：用户指定 > package.json > 特征文件
- 支持 Vitest、Jest 特征文件识别

### T1.3 JUnit XML 解析器
- 实现 `parsers/junit-xml.ts`
- 解析测试套件、用例、状态、耗时、失败信息
- 异常字段降级处理

### T1.4 Jest JSON 解析器
- 实现 `parsers/jest-json.ts`
- 解析 Jest `--json --outputFile` 输出
- 映射到统一 `TestResult` 结构

### T1.5 Vitest JSON 解析器
- 实现 `parsers/vitest-json.ts`
- 解析 Vitest `--reporter=json` 输出
- 映射到统一 `TestResult` 结构

### T1.6 报告构建器
- 实现 `report/builder.ts` 章节组装
- 实现 `report/sections.ts` 各章节生成
- 实现 `report/formatters/markdown.ts` Markdown 渲染

### T1.7 主入口编排
- 实现 `index.ts` 完整流水线
- 执行/解析双模式切换
- 结果返回（路径 + 摘要）

### T1.8 M1 集成测试
- 编写 Vitest 项目的端到端测试
- 编写 JUnit XML 解析模式测试
- 编写异常场景测试（损坏文件、空结果）

## M2：pytest 支持与覆盖率（P1）

### T2.1 pytest 解析器
- 实现 `parsers/pytest-junit.ts`
- 解析 pytest 生成的 JUnit XML
- 映射 Python 测试结构

### T2.2 覆盖率章节
- 实现 `coverage.ts`
- 解析 vitest/c8 coverage 输出
- 低于阈值文件清单

### T2.3 fail_threshold 支持
- 实现阈值比较逻辑
- 报告结论标注 "不达标"

## M3：HTML / JSON 输出（P1）

### T3.1 HTML 格式化器
- 实现 `report/formatters/html.ts`
- 自包含 HTML（内联 CSS）

### T3.2 JSON 伴随产物
- 实现 `report/formatters/json.ts`
- 与 Markdown 同时输出

## M4：后续迭代（P2）
- 历史趋势对比
- Go test / cargo test 支持
- IM/邮件推送集成