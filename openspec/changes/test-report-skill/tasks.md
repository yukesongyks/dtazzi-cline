# Tasks: test-report-skill

## M1: 核心框架 (P0) — Jest/Vitest JSON + JUnit XML + Markdown 报告 + 双模式

### 基础设施
- [ ] 创建 `skills/test-report/` 目录结构
- [ ] 定义核心类型 `types.ts`（`ParsedTestResults`, `TestReportConfig` 等）
- [ ] 实现 `config.ts`（默认配置加载与用户配置合并）
- [ ] 实现 `utils.ts`（路径处理、时间格式化、安全过滤函数）

### 解析器基础
- [ ] 定义 `TestResultParser` 接口（`parser/base.ts`）
- [ ] 实现解析器注册表 `parser/registry.ts`（注册、匹配、优先级）

### 解析器实现
- [ ] 实现 `parser/jest-json.ts`（Jest JSON reporter 解析）
- [ ] 实现 `parser/vitest-json.ts`（Vitest JSON reporter 解析）
- [ ] 实现 `parser/junit-xml.ts`（通用 JUnit XML 解析，兜底）
- [ ] 为每个解析器编写单元测试（正常解析 + 降级场景）

### 测试执行器
- [ ] 实现 `executor.ts`（框架自动检测：package.json → 特征文件）
- [ ] 实现执行模式：执行测试命令 → 收集结果文件
- [ ] 实现解析模式：跳过执行，直接读取指定结果文件
- [ ] 实现执行失败诊断（命令未找到、退出码非 0、无结果文件）

### 报告生成器
- [ ] 实现 `generator/markdown.ts`（完整六章 Markdown 报告生成）
- [ ] 实现报告头章节（项目名、时间、命令、框架/版本、环境）
- [ ] 实现结果摘要章节（用例数、通过率、耗时、✅/❌ 结论）
- [ ] 实现失败用例分析章节（用例名、文件、错误、堆栈截断 10 行）
- [ ] 实现用例明细章节（按文件分组，超 200 条截断标注）
- [ ] 实现覆盖率章节（条件渲染：有数据时展示，无数据时标注"未获取"）
- [ ] 实现附录章节（原始文件路径、工具版本）
- [ ] 实现 `fail_threshold` 逻辑（低于阈值时标注不达标）
- [ ] 为报告生成器编写单元测试（各章节渲染 + 边界条件）

### 安全
- [ ] 实现堆栈环境变量脱敏（`process.env.*` 模式）
- [ ] 实现密钥模式过滤（AWS key、private key、token 等）
- [ ] 为安全过滤编写单元测试

### Skill 入口
- [ ] 实现 `index.ts`（Skill 入口：意图识别 → 模式判定 → 路由）
- [ ] 实现用户反馈生成（报告路径 + 摘要 + 失败原因）
- [ ] 实现 Skill 注册（与 Agent 运行时集成）

### 集成验证
- [ ] 在含 Jest 的示例项目中端到端测试：执行模式 → 报告生成
- [ ] 在含 Vitest 的示例项目中端到端测试：执行模式 → 报告生成
- [ ] 用 JUnit XML 文件端到端测试：解析模式 → 报告生成
- [ ] 验证 AC1~AC5 全部验收标准

## M2: pytest 支持 + 覆盖率 (P1)

- [ ] 实现 `parser/pytest-junit.ts`（pytest JUnit XML 解析）
- [ ] 实现 `parser/pytest-json.ts`（pytest JSON report 解析）
- [ ] 实现 `coverage/parser.ts`（istanbul/lcov/cobertura 覆盖率解析）
- [ ] 覆盖率数据集成到报告生成器
- [ ] 为 pytest 解析器编写单元测试
- [ ] 为覆盖率解析器编写单元测试

## M3: 多格式输出 (P1)

- [ ] 实现 `generator/html.ts`（HTML 报告生成器）
- [ ] 实现 `generator/json.ts`（JSON 伴随产物生成器）
- [ ] 为 HTML/JSON 生成器编写单元测试

## M4: 后续迭代 (P2)

- [ ] 历史趋势对比（多次运行结果对比分析）
- [ ] Go test 解析器（`go test -json` 输出）
- [ ] cargo test 解析器（`cargo test -- -Z unstable-options --format json` 输出）