# Tasks: test-report-skill

## Milestone M1: P0 — Jest/Vitest + JUnit XML + Markdown 报告 + 双模式

### Task 1: 类型定义与解析器接口

**Files**: `src/skills/test-report/types.ts`, `src/skills/test-report/parsers/types.ts`

- [ ] 定义 `TestReport`、`TestSummary`、`FailureDetail`、`TestSuiteDetail`、`CoverageReport` 等核心类型
- [ ] 定义 `TestResultParser` 接口（`formatId`, `canParse()`, `parse()`）
- [ ] 定义 `ParseOptions`、`GeneratorOptions` 等配置类型
- [ ] 定义 `SkillConfig` 类型（test_command, result_file, output_format, output_path, coverage, fail_threshold）

**Verification**: TypeScript 编译通过，类型导出无循环依赖

---

### Task 2: 配置解析模块

**Files**: `src/skills/test-report/config.ts`

- [ ] 实现 `resolveConfig()` — 从对话上下文提取配置项覆盖值
- [ ] 实现 `resolveTestCommand()` — 框架自动检测（package.json → 特征文件 → 默认）
- [ ] 实现 `resolveOutputPath()` — 根据 `output_path` 配置生成目标路径
- [ ] 实现配置项默认值填充与校验

**Verification**: 单元测试覆盖各配置项默认值、覆盖、非法值处理

---

### Task 3: Jest JSON 解析器

**Files**: `src/skills/test-report/parsers/jest.ts`

- [ ] 实现 `JestParser` 类，解析 Jest `--json` 输出的 `testResults` 结构
- [ ] 提取：用例名、文件路径、耗时、状态（passed/failed/pending）
- [ ] 提取失败用例的 `failureDetails` / `failureMessages`
- [ ] 堆栈截断：最多 20 行，过滤 node_modules 路径
- [ ] 安全过滤：敏感信息清理

**Verification**: 使用 Jest 真实 JSON 产物文件做解析测试，验证摘要数据一致

---

### Task 4: Vitest JSON 解析器

**Files**: `src/skills/test-report/parsers/vitest.ts`

- [ ] 实现 `VitestParser` 类，解析 Vitest `--reporter=json` 输出
- [ ] 提取：用例名、文件路径、耗时、状态
- [ ] 提取失败用例的 `error` 字段
- [ ] 堆栈截断与安全过滤

**Verification**: 使用 Vitest 真实 JSON 产物文件做解析测试

---

### Task 5: JUnit XML 通用解析器

**Files**: `src/skills/test-report/parsers/junit-xml.ts`

- [ ] 实现 `JunitXmlParser` 类，解析标准 JUnit XML 格式
- [ ] 支持 `<testsuite>` / `<testsuites>` 两种结构
- [ ] 提取：用例名（`classname.name`）、文件路径、耗时、状态
- [ ] 提取 `<failure>` 节点的 `message` 和文本内容
- [ ] 处理 `<skipped>` 节点

**Verification**: 使用多个真实 JUnit XML 文件做解析测试（含嵌套 suites）

---

### Task 6: 解析器注册表

**Files**: `src/skills/test-report/parser.ts`

- [ ] 实现 `PluginRegistry` 类（注册、查找、自动检测）
- [ ] 注册 Jest、Vitest、JUnit XML 解析器
- [ ] 实现 `detectParser()` — 根据文件扩展名/内容特征自动选择解析器
- [ ] 实现 `parse()` 调度方法

**Verification**: 给定不同格式的结果文件，自动选择正确解析器并返回结果

---

### Task 7: 测试执行器

**Files**: `src/skills/test-report/runner.ts`

- [ ] 实现 `detectFramework()` — 框架检测逻辑
- [ ] 实现 `buildCommand()` — 构建测试执行命令（含 JSON reporter 参数）
- [ ] 实现 `runTests()` — 执行测试并收集结果文件路径
- [ ] 实现执行失败处理：捕获 exit code + stderr，返回诊断信息

**Verification**: 在示例项目中执行测试，验证结果文件生成且路径正确

---

### Task 8: Markdown 报告生成器

**Files**: `src/skills/test-report/generators/markdown.ts`

- [ ] 实现 6 章节模板渲染：
  1. 报告头
  2. 结果摘要
  3. 失败用例分析 (有失败时)
  4. 用例明细 (>200 条截断)
  5. 覆盖率 (可获取时)
  6. 附录
- [ ] 实现 `generateMarkdown()` 函数
- [ ] 实现 fail_threshold 逻辑

**Verification**: 给定 TestReport 数据，生成 Markdown 文件，人工验证结构完整性

---

### Task 9: 覆盖率收集

**Files**: `src/skills/test-report/coverage.ts`

- [ ] 实现 `collectCoverage()` — 检测 coverage 目录产物
- [ ] 支持 `coverage-summary.json`（Jest/Vitest）
- [ ] 实现 `coverage=auto/on/off` 策略
- [ ] 覆盖率不可用时返回 `null` 并标注"未获取"

**Verification**: 在配置了 coverage 的项目中验证覆盖率数据提取正确

---

### Task 10: Skill 入口与注册

**Files**: `src/skills/test-report/skill.ts`

- [ ] 实现 Skill 生命周期：`activate()` / `execute()` / `deactivate()`
- [ ] 实现双模式调度：执行模式 vs 解析模式
- [ ] 实现生成后用户反馈输出
- [ ] 注册 Skill 到 Kanban Skill 注册表

**Verification**: 端到端测试：在测试项目中触发 Skill，验证报告生成

---

### Task 11: 安全过滤模块

**Files**: `src/skills/test-report/sanitize.ts`

- [ ] 实现 `sanitizeStackTrace()` — 过滤敏感信息
- [ ] 过滤模式：`AWS_SECRET`、`TOKEN`、`PASSWORD`、`PRIVATE_KEY`、`API_KEY` 等
- [ ] 过滤环境变量值（保留变量名）

**Verification**: 构造含敏感信息的堆栈，验证过滤后不含敏感值

---

## Milestone M2: P1 — pytest + 覆盖率增强 + fail_threshold

### Task 12: pytest 解析器

**Files**: `src/skills/test-report/parsers/pytest.ts`

- [ ] 实现 `PytestParser` 类
- [ ] 支持 pytest JUnit XML 输出（`--junitxml=`）
- [ ] 支持 pytest JSON report 插件输出
- [ ] 注册到 PluginRegistry

**Verification**: 使用 pytest 真实产物文件做解析测试

---

### Task 13: 覆盖率阈值文件清单

**Files**: `src/skills/test-report/generators/markdown.ts` (增强)

- [ ] 覆盖率章节增加低于阈值（默认 80%）的文件清单
- [ ] 文件清单按覆盖率从低到高排序

**Verification**: 给定覆盖率数据，验证低覆盖率文件正确列出

---

## Milestone M3: P1 — HTML 输出 + JSON 伴随产物

### Task 14: HTML 报告生成器

**Files**: `src/skills/test-report/generators/html.ts`

- [ ] 实现自包含 HTML 报告（内联 CSS）
- [ ] 样式与 Markdown 报告等价
- [ ] 支持折叠/展开功能

**Verification**: 生成 HTML 文件，浏览器打开验证渲染正确

---

### Task 15: JSON 结构化输出

**Files**: `src/skills/test-report/generators/json.ts`

- [ ] 实现 `generateJson()` — 将 TestReport 序列化为 JSON
- [ ] 作为 Markdown 报告的伴随产物（同一目录）

**Verification**: 生成 JSON 文件，验证结构完整且可反序列化

---

## Task Dependencies

```
Task 1 (types)
 ├─ Task 2 (config)
 ├─ Task 3 (jest parser) ──┐
 ├─ Task 4 (vitest parser) ─┤
 ├─ Task 5 (junit parser) ─┼─ Task 6 (registry) ──┐
 └─ Task 11 (sanitize) ────┘                       │
                                                    ├─ Task 8 (markdown gen) ──┐
Task 7 (runner) ────────────────────────────────────┤                          │
Task 9 (coverage) ──────────────────────────────────┘                          │
                                                                               ├─ Task 10 (skill entry)
Task 12 (pytest) ──> Task 6 ──> Task 8 ──> Task 13 (threshold) ───────────────┘
Task 14 (html gen) ──> Task 10
Task 15 (json gen) ──> Task 10
```