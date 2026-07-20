# 测试报告生成 Skill 实现计划

> **需求来源:** loop问题修复 2.0 T3 — 测试报告自动生成
> **设计文档:** [2026-07-20-test-report-skill-design.md](../specs/2026-07-20-test-report-skill-design.md)
> **生成时间:** 2026-07-20
> **按计划逐 Task 实现**

**目标:** 在 Kanban 中新增 `test-report` Skill，支持执行/解析双模式，自动解析 Jest/Vitest/JUnit XML 结果并生成结构化 Markdown 测试报告。
**技术方案:** 方案 A：Skill 驱动 + 插件式解析器架构。Skill 入口负责意图识别与模式判定，解析器通过 `ParserRegistry` 统一注册调度，报告通过模板渲染输出。
**预估工作量:** 3 人天（核心 Skill 1d + 解析器 1d + 报告渲染 0.5d + 测试 0.5d）/ 中等复杂度

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Add | `src/skills/test-report/index.ts` | Skill 入口：注册 + 意图识别 + 模式路由 |
| Add | `src/skills/test-report/types.ts` | 所有类型定义（TestResultParser、ParsedTestResult、TestReportData 等） |
| Add | `src/skills/test-report/config.ts` | 默认配置 + 配置解析（ShellConfig 合并） |
| Add | `src/skills/test-report/framework-detector.ts` | 框架自动检测：package.json / 配置文件 / 结果文件推断 |
| Add | `src/skills/test-report/executor.ts` | 测试执行器：执行模式下的命令构造与运行 |
| Add | `src/skills/test-report/parser-registry.ts` | ParserRegistry：解析器注册与调度 |
| Add | `src/skills/test-report/parsers/jest-parser.ts` | Jest JSON 解析器（P0） |
| Add | `src/skills/test-report/parsers/vitest-parser.ts` | Vitest JSON 解析器（P0） |
| Add | `src/skills/test-report/parsers/junit-xml-parser.ts` | JUnit XML 解析器（P0，含 pytest 降级路径） |
| Add | `src/skills/test-report/report-builder.ts` | 报告数据组装：摘要计算、覆盖率提取、章节排序 |
| Add | `src/skills/test-report/renderers/markdown-renderer.ts` | Markdown 输出（P0） |
| Add | `src/skills/test-report/renderers/html-renderer.ts` | HTML 输出（P1 骨架） |
| Add | `src/skills/test-report/renderers/json-renderer.ts` | JSON 伴随产物（P1 骨架） |
| Add | `src/skills/test-report/sanitizer.ts` | 安全过滤：凭据模式过滤、路径脱敏 |
| Add | `src/skills/test-report/utils.ts` | 工具函数：时间格式化、文本截断、文件 I/O |
| Add | `test/skills/test-report/jest-parser.test.ts` | Jest 解析器单元测试 |
| Add | `test/skills/test-report/vitest-parser.test.ts` | Vitest 解析器单元测试 |
| Add | `test/skills/test-report/junit-xml-parser.test.ts` | JUnit XML 解析器单元测试 |
| Add | `test/skills/test-report/report-builder.test.ts` | 报告组装器单元测试 |
| Add | `test/skills/test-report/markdown-renderer.test.ts` | Markdown 渲染器单元测试 |
| Add | `test/skills/test-report/integration.test.ts` | 端到端集成测试（执行/解析双模式） |

---

### Task 1: 搭建 Skill 骨架与类型定义

**目标:** 创建 Skill 目录结构，定义所有核心接口与类型，搭建 Skill 注册入口。

**Files:**
- Add: `src/skills/test-report/types.ts`
- Add: `src/skills/test-report/config.ts`
- Add: `src/skills/test-report/index.ts`

- [ ] **Step 1: 定义核心类型（types.ts）**
  实现 `TestSuiteResult`、`TestAssertionResult`、`CoverageSummary`、`ParsedTestResult`、`TestReportData`、`TestResultParser` 接口，以及 `SkillConfig`、`ReportFormat` 等枚举类型。

- [ ] **Step 2: 实现配置模块（config.ts）**
  定义默认配置常量（`DEFAULT_CONFIG`），实现 `resolveConfig(userInput)` 合并用户覆盖项。

- [ ] **Step 3: 实现 Skill 入口（index.ts）**
  注册 Skill 到 Kanban Skill 体系，实现意图识别：匹配"生成测试报告"/"跑测试并出报告"/"转成测试报告"等触发模式，区分执行模式与解析模式，路由到 executor 或直接读取文件。

---

### Task 2: 实现框架检测器

**目标:** 自动识别项目使用的测试框架，返回框架名称与推荐命令。

**Files:**
- Add: `src/skills/test-report/framework-detector.ts`

- [ ] **Step 1: 项目配置文件检测**
  检查 `package.json` → `scripts.test` 中是否含 `jest`/`vitest` 关键词；检查 `vitest.config.*`、`jest.config.*`、`pytest.ini`、`pyproject.toml` 是否存在。

- [ ] **Step 2: 结果文件自动发现**
  搜索 `test-results.json`、`junit.xml`、`coverage/` 等常见产物路径。

- [ ] **Step 3: 优先级整合**
  按"用户显式指定 > 配置文件检测 > 结果文件推断"返回检测结果，含 `framework`、`recommendedCommand`、`resultFiles`。

---

### Task 3: 实现 P0 解析器（Jest / Vitest / JUnit XML）

**目标:** 实现三个 P0 解析器，遵循 `TestResultParser` 接口，注册到 `ParserRegistry`。

**Files:**
- Add: `src/skills/test-report/parsers/jest-parser.ts`
- Add: `src/skills/test-report/parsers/vitest-parser.ts`
- Add: `src/skills/test-report/parsers/junit-xml-parser.ts`
- Add: `src/skills/test-report/parser-registry.ts`

- [ ] **Step 1: 实现 ParserRegistry（parser-registry.ts）**
  单例注册中心，`register(parser)`、`detectParser(input, hint?)`、`getParser(framework)` 方法。

- [ ] **Step 2: 实现 Jest 解析器（jest-parser.ts）**
  解析 Jest `--json --outputFile=` 输出：`testResults[].assertionResults[]`，提取 `status`/`failureMessages`/`duration`/`ancestorTitles`。

- [ ] **Step 3: 实现 Vitest 解析器（vitest-parser.ts）**
  解析 Vitest `--reporter=json` 输出：结构类似 Jest，适配 `testResults[].assertionResults[]`。

- [ ] **Step 4: 实现 JUnit XML 解析器（junit-xml-parser.ts）**
  解析 `<testsuite>`/`<testcase>`/`<failure>`/`<skipped>` 元素，支持嵌套 `<testsuites>`。采用宽松解析：缺失字段标注"未获取"。

- [ ] **Step 5: 注册所有 P0 解析器**
  在 Skill 初始化时注册 Jest/Vitest/JUnit XML 解析器到 ParserRegistry。

---

### Task 4: 实现报告组装器

**目标:** 将解析后的 `ParsedTestResult` 组装为 `TestReportData`，计算摘要指标。

**Files:**
- Add: `src/skills/test-report/report-builder.ts`

- [ ] **Step 1: 摘要计算**
  统计 `total/passed/failed/skipped`、通过率、总耗时、结论判定（含 `fail_threshold` 检查）。

- [ ] **Step 2: 失败用例提取**
  从 suites 中提取所有 `status === "failed"` 的用例，截断堆栈至可读长度（前 20 行）。

- [ ] **Step 3: 用例明细分组**
  按 `file` 字段分组，生成 `FileDetail[]`，超过 200 条时截断并标注。

- [ ] **Step 4: 覆盖率数据提取**
  从 `coverage/coverage-summary.json`（istanbul）或 `coverage/coverage-final.json` 提取覆盖率数据，提取低于阈值的文件清单。

- [ ] **Step 5: 环境信息收集**
  获取 `node --version`、`os` 信息，填充报告头。

---

### Task 5: 实现 Markdown 渲染器

**目标:** 将 `TestReportData` 渲染为 Markdown 字符串并写入文件。

**Files:**
- Add: `src/skills/test-report/renderers/markdown-renderer.ts`
- Add: `src/skills/test-report/utils.ts`
- Add: `src/skills/test-report/sanitizer.ts`

- [ ] **Step 1: 实现工具函数（utils.ts）**
  `formatDuration(ms)`、`formatDateTime(date)`、`truncateText(text, maxLines)`、`ensureDir(path)`。

- [ ] **Step 2: 实现安全过滤（sanitizer.ts）**
  过滤环境变量密钥模式（`AWS_*`、`NPM_TOKEN`、`DOCKER_PASSWORD`、`SECRET_*` 等），路径脱敏（`/Users/<name>/` → `~/`）。

- [ ] **Step 3: 实现 Markdown 渲染器（markdown-renderer.ts）**
  按标准模板（报告头 → 摘要 → 失败分析 → 用例明细 → 覆盖率 → 附录）渲染，状态图标映射（✅/❌/⏭️），失败章节条件渲染。

- [ ] **Step 4: 实现文件落盘**
  默认路径 `reports/test-report-<YYYYMMDD-HHmmss>.md`，返回路径与摘要。

---

### Task 6: 实现测试执行器（执行模式）

**目标:** 执行模式下触发测试运行并收集结果文件。

**Files:**
- Add: `src/skills/test-report/executor.ts`

- [ ] **Step 1: 命令构造**
  根据检测到的框架构造完整命令：Jest 加 `--json --outputFile=`，Vitest 加 `--reporter=json --reporter=verbose`，支持用户自定义 `test_command` 覆盖。

- [ ] **Step 2: 执行与结果收集**
  通过 Agent 运行时执行测试命令，收集 stdout/stderr，定位结果文件路径，处理执行失败场景（命令不存在、超时等）。

- [ ] **Step 3: 错误诊断**
  测试执行失败时返回明确诊断信息（stderr 摘要、退出码），不生成空报告。

---

### Task 7: P1 渲染器骨架（HTML / JSON）

**目标:** 搭建 HTML 和 JSON 渲染器骨架，为 P1 阶段做接口预留。

**Files:**
- Add: `src/skills/test-report/renderers/html-renderer.ts`
- Add: `src/skills/test-report/renderers/json-renderer.ts`

- [ ] **Step 1: HTML 渲染器骨架**
  实现 `HtmlRenderer` 接口，生成基础 HTML 结构（可后续美化）。

- [ ] **Step 2: JSON 渲染器**
  实现 `JsonRenderer`，将 `TestReportData` 序列化为 JSON 伴随产物。

---

### Task 8: 单元测试

**目标:** 覆盖所有解析器、报告组装器、Markdown 渲染器的核心逻辑。

**Files:**
- Add: `test/skills/test-report/jest-parser.test.ts`
- Add: `test/skills/test-report/vitest-parser.test.ts`
- Add: `test/skills/test-report/junit-xml-parser.test.ts`
- Add: `test/skills/test-report/report-builder.test.ts`
- Add: `test/skills/test-report/markdown-renderer.test.ts`

- [ ] **Step 1: Jest 解析器测试**
  正常 JSON 解析、空结果、失败用例含堆栈、字段缺失降级。

- [ ] **Step 2: Vitest 解析器测试**
  正常 JSON 解析、空结果、失败用例、字段缺失降级。

- [ ] **Step 3: JUnit XML 解析器测试**
  正常 XML 解析、空 `<testsuite>`、含 `<failure>` 的用例、嵌套 `<testsuites>`、格式损坏 XML 的错误处理。

- [ ] **Step 4: 报告组装器测试**
  全通过/全失败/混合结果场景的摘要计算、`fail_threshold` 判定、覆盖率缺失场景、>200 条截断。

- [ ] **Step 5: Markdown 渲染器测试**
  输出包含所有必需章节、失败用例条件渲染、覆盖率章节条件渲染。

---

### Task 9: 集成测试

**目标:** 端到端验证执行/解析双模式完整流程。

**Files:**
- Add: `test/skills/test-report/integration.test.ts`

- [ ] **Step 1: 执行模式集成测试**
  使用项目自身 `vitest` 运行测试，验证 Skill 触发执行 → 收集结果 → 生成报告全流程。

- [ ] **Step 2: 解析模式集成测试**
  提供预置 JUnit XML 文件，验证跳过执行直接生成报告。

- [ ] **Step 3: 异常场景测试**
  结果文件不存在、格式损坏、无法识别框架的错误处理。

---

## 依赖关系

```
Task 1 (类型 + 入口) ──┬── Task 2 (框架检测)
                      ├── Task 3 (解析器 + Registry) ── Task 4 (报告组装) ── Task 5 (Markdown 渲染)
                      └── Task 6 (执行器)
                                                      │
                      Task 7 (P1 渲染器骨架) ◄────────┘
                                                      │
                      Task 8 (单元测试) ◄──────────────┘
                      Task 9 (集成测试) ◄──────────────┘ (依赖 Task 1-6 全部完成)
```

## 验证标准

- [ ] `npm run test -- --run test/skills/test-report/` 全部通过
- [ ] 在项目根目录执行 Skill"生成测试报告"，产出 `reports/test-report-*.md`
- [ ] 报告包含摘要、明细、失败分析、覆盖率四大章节
- [ ] 提供 JUnit XML 走解析模式，不触发测试执行即可产出报告
- [ ] 结果文件损坏时返回明确错误而非空报告