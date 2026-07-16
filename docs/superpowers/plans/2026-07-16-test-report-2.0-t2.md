# 测试报告 2.0 T2 (M1) 实施计划

> **来源:** 测试报告 2.0 T2 PRD + 需求澄清文档
> **生成时间:** 2026-07-16
> **关联文档:** docs/superpowers/specs/test-report-2.0-t2-clarify.md
> **里程碑:** M1 — Jest/Vitest JSON + JUnit XML 解析、Markdown 报告、执行/解析双模式

---

## 目标 (Goal)

构建一个名为 `test-report` 的 Skill，Agent 执行后能自动解析测试结果（Jest/Vitest JSON reporter、JUnit XML）并生成标准化的 Markdown 测试报告，支持执行模式和解析模式。

## 架构 (Architecture)

Skill 采用**插件式解析器架构**：核心引擎负责报告模板渲染与编排，各框架解析器以独立模块实现统一接口 `TestResultParser`，通过工厂方法按结果文件格式自动选择解析器。报告模板使用字符串拼接构建 Markdown，不引入外部模板引擎。配置通过字符串参数传入，不使用 TypeScript 配置文件。

## 技术栈 (Tech Stack)

- **语言:** TypeScript（已有项目栈）
- **XML 解析:** `fast-xml-parser`（npm 包，轻量 XML → JSON）
- **报告生成:** 纯字符串拼接生成 Markdown
- **测试:** 跟随项目现有测试框架（Vitest）

---

## 文件结构 (File Structure)

所有新增文件位于 `skills/test-report/` 目录下，不修改现有业务代码。

```
skills/test-report/
├── SKILL.md                        # Skill 入口：触发意图、配置项、使用说明
├── index.ts                        # 主入口：编排执行/解析流程，调用解析器与报告生成器
├── types.ts                        # 共享类型定义：TestSuite, TestCase, CoverageReport, Config 等
├── config.ts                       # 配置解析：默认值合并、参数校验、安全过滤配置
├── framework-detector.ts           # 框架检测：自动识别项目测试框架与命令
├── test-runner.ts                  # 测试执行器：spawn 子进程运行测试，捕获 stdout/stderr
├── parsers/
│   ├── index.ts                    # 解析器工厂：按文件内容/格式选择解析器
│   ├── parser-interface.ts         # 解析器统一接口 TestResultParser
│   ├── jest-json-parser.ts         # Jest JSON reporter 结果解析
│   ├── vitest-json-parser.ts       # Vitest JSON reporter 结果解析
│   └── junit-xml-parser.ts         # JUnit XML 结果解析
├── report-generator.ts             # 报告生成器：将 TestSuite[] 渲染为 Markdown
├── report-templates.ts             # 报告各章节模板字符串（摘要、明细、失败分析、覆盖率、附录）
├── coverage-collector.ts           # 覆盖率收集：解析 coverage 目录产物
├── security-filter.ts              # 安全过滤器：堆栈/错误信息去敏
├── utils.ts                        # 工具函数：时间格式化、文件读写、路径处理
└── __tests__/
    ├── config.test.ts
    ├── framework-detector.test.ts
    ├── jest-json-parser.test.ts
    ├── vitest-json-parser.test.ts
    ├── junit-xml-parser.test.ts
    ├── report-generator.test.ts
    ├── coverage-collector.test.ts
    ├── security-filter.test.ts
    └── fixtures/
        ├── sample-jest.json        # Jest JSON 测试 fixture
        ├── sample-vitest.json      # Vitest JSON 测试 fixture
        ├── sample-junit.xml        # JUnit XML 测试 fixture
        ├── sample-jest-fail.json   # 含失败用例的 fixture
        └── sample-junit-broken.xml # 损坏格式的 fixture（健壮性测试）
```

---

## 任务分解 (Tasks)

### Task 1: 类型定义与配置系统

**目标:** 建立 Skill 的类型基础与配置解析

**文件:**
- `skills/test-report/types.ts`（新建）
- `skills/test-report/config.ts`（新建）

**关键实现:**
- `types.ts` 定义核心类型：
  - `TestReportConfig`：test_command, result_file, output_format, output_path, coverage, fail_threshold
  - `TestSuite`：name, file, tests, failures, errors, skipped, time, cases[]
  - `TestCase`：name, file, status (passed/failed/skipped), duration, failureMessage?, stackTrace?
  - `CoverageReport`：statements, branches, functions, lines（各含 total/covered/percentage）
  - `ReportResult`：summary, suites[], coverage?, metadata
- `config.ts` 实现：
  - `resolveConfig(userInput)`：合并默认值，校验参数合法性
  - 默认值：output_format='markdown', output_path='reports/', coverage='auto', fail_threshold=undefined
  - 校验：output_format 必须是 markdown（M1），output_path 必须可写

**验证:**
- [ ] `npm run typecheck` 通过
- [ ] `skills/test-report/__tests__/config.test.ts`：默认值合并、参数校验、非法值报错

---

### Task 2: 框架检测器

**目标:** 自动识别项目测试框架与运行命令

**文件:**
- `skills/test-report/framework-detector.ts`（新建）

**关键实现:**
- 检测优先级（来自澄清文档 3.2）：
  1. 用户显式指定的 `test_command`
  2. `package.json` scripts.test
  3. 框架特征文件：`jest.config.*` → Jest，`vitest.config.*` → Vitest
- 返回 `{ framework: 'jest' | 'vitest' | 'unknown', command: string }`
- 若无法检测，返回 `unknown` 并提示用户指定命令

**验证:**
- [ ] `skills/test-report/__tests__/framework-detector.test.ts`：mock 文件系统，验证各优先级路径

---

### Task 3: 解析器接口与工厂

**目标:** 定义统一解析器接口，实现按格式自动选择解析器

**文件:**
- `skills/test-report/parsers/parser-interface.ts`（新建）
- `skills/test-report/parsers/index.ts`（新建）

**关键实现:**
- `TestResultParser` 接口：
  ```ts
  interface TestResultParser {
    readonly name: string;
    canParse(content: string, filePath: string): boolean;
    parse(content: string, filePath: string): TestSuite[];
  }
  ```
- 工厂函数 `selectParser(content, filePath)`：遍历注册的解析器，调用 `canParse`，返回第一个匹配的解析器
- `canParse` 判断逻辑：
  - Jest JSON：`content` 含 `"numTotalTestSuites"` 字段
  - Vitest JSON：`content` 含 `"numTotalTestSuites"` 且 `"testResults"` 结构
  - JUnit XML：`filePath` 以 `.xml` 结尾且内容含 `<testsuite` 或 `<testsuites`

**验证:**
- 类型检查通过
- 后续 Task 4/5/6 的解析器注册到工厂后一起验证

---

### Task 4: Jest/Vitest JSON 解析器

**目标:** 解析 Jest/Vitest JSON reporter 输出

**文件:**
- `skills/test-report/parsers/jest-json-parser.ts`（新建）
- `skills/test-report/parsers/vitest-json-parser.ts`（新建）

**关键实现:**
- Jest JSON 格式：`{ numTotalTests, numPassedTests, numFailedTests, testResults: [{ name, assertionResults: [{ title, status, duration, failureMessages }] }] }`
- Vitest JSON 格式：类似 Jest，但 `testResults` 中有 `assertionResults` 或 `tasks`
- 解析逻辑：
  - 遍历 `testResults`，每个文件对应一个 `TestSuite`
  - 每个 `assertionResults` 元素对应一个 `TestCase`
  - 失败用例提取 `failureMessages` 作为 `failureMessage`，截取前 10 行作为 `stackTrace`
- 字段缺失时标注 `"未获取"`（NFR2 降级）

**验证:**
- [ ] `skills/test-report/__tests__/jest-json-parser.test.ts`：正常解析、失败用例解析、字段缺失降级
- [ ] `skills/test-report/__tests__/vitest-json-parser.test.ts`：同上

---

### Task 5: JUnit XML 解析器

**目标:** 解析 JUnit XML 格式结果

**文件:**
- `skills/test-report/parsers/junit-xml-parser.ts`（新建）

**关键实现:**
- 使用 `fast-xml-parser` 解析 XML
- 支持 `<testsuites>` + `<testsuite>` 嵌套结构，以及单层 `<testsuite>` 结构
- 映射：`<testsuite name time tests failures errors skipped>` → `TestSuite`
- 映射：`<testcase name classname time>` + `<failure message>` → `TestCase`
- 字段缺失处理：`time` 缺失 → `0`，`classname` 缺失 → `"未获取"`

**依赖:**
```bash
npm install fast-xml-parser
```

**验证:**
- [ ] `skills/test-report/__tests__/junit-xml-parser.test.ts`：正常 XML、嵌套 testsuites、损坏 XML 报错、字段缺失降级

---

### Task 6: 安全过滤器

**目标:** 过滤错误信息中的敏感内容

**文件:**
- `skills/test-report/security-filter.ts`（新建）

**关键实现:**
- 过滤规则（来自澄清文档 3.6）：
  - 过滤明显 credential 模式：`/secret|token|password|api[_-]?key|credential/i` 关键词
  - 过滤 `KEY=VALUE` 形式的键值对（匹配常见 secret key 名称）
  - 过滤路径中的 `/home/<user>/` 替换为 `~/`
- 过滤后替换为 `[已过滤]`
- 处理场景：`failureMessage`、`stackTrace`、`error.message`

**验证:**
- [ ] `skills/test-report/__tests__/security-filter.test.ts`：过滤 secret/key/token、保留正常路径、边界情况

---

### Task 7: 报告模板

**目标:** 实现报告各章节 Markdown 模板

**文件:**
- `skills/test-report/report-templates.ts`（新建）

**关键实现:**
- 报告章节顺序（FR2 固定顺序）：
  1. 报告头：项目名、生成时间、执行命令、框架/版本、执行环境
  2. 结果摘要：用例总数、通过/失败/跳过数、通过率、总耗时、✅/❌ 结论
  3. 失败用例分析：用例名、所属文件、错误信息、堆栈关键行（截断至 10 行）
  4. 用例明细：按文件分组，展示用例名与耗时
  5. 覆盖率：语句/分支/函数/行覆盖率总表 + 低于阈值文件清单
  6. 附录：原始结果文件路径、生成工具版本
- 每个章节一个导出函数，返回 Markdown 字符串
- 用例明细：默认全部展示，超过 200 条时截断并注明（FR2 4.）
- 失败用例：全部展示（澄清文档 3.4）
- 语言：中文模板（澄清文档 3.1）

**验证:**
- [ ] 集成到 Task 8 的报告生成器后一起验证

---

### Task 8: 报告生成器

**目标:** 将 TestSuite[] 渲染为完整 Markdown 报告

**文件:**
- `skills/test-report/report-generator.ts`（新建）

**关键实现:**
- `generateReport(suites, coverage, config)` → `string`（完整 Markdown）
- 调用各模板函数拼接章节，按 FR2 固定顺序
- 计算摘要数据：totalTests, passed, failed, skipped, passRate, totalDuration
- 整体结论：`fail_threshold` 配置时，通过率低于阈值标记为不达标
- 覆盖率数据存在时渲染覆盖率章节，不存在时标注"未获取"

**验证:**
- [ ] `skills/test-report/__tests__/report-generator.test.ts`：正常报告结构、失败用例报告、覆盖率为空、超过 200 条用例截断、fail_threshold 触发

---

### Task 9: 覆盖率收集器

**目标:** 解析 coverage 目录产物，提取覆盖率数据

**文件:**
- `skills/test-report/coverage-collector.ts`（新建）

**关键实现:**
- 检测 `coverage/coverage-summary.json`（Jest/Vitest 默认产物）
- 解析 `total` 字段：`{ statements, branches, functions, lines }`，每项含 `{ total, covered, pct }`
- 解析各文件覆盖率，识别低于阈值的文件清单
- `coverage` 配置为 `'auto'` 时自动检测，为 `'off'` 时跳过，为 `'on'` 时强制要求
- 覆盖率产物不存在时返回 `null`，标注"未获取"

**验证:**
- [ ] `skills/test-report/__tests__/coverage-collector.test.ts`：正常解析、文件不存在、阈值筛选

---

### Task 10: 测试执行器

**目标:** spawn 子进程运行测试，捕获输出

**文件:**
- `skills/test-report/test-runner.ts`（新建）

**关键实现:**
- `runTests(command, cwd, timeout)` → `{ stdout, stderr, exitCode }`
- 使用 `child_process.spawn` 或 `exec`
- 超时默认 10 分钟（澄清文档 3.3）
- 执行失败（exitCode != 0 且非测试失败）时返回诊断信息，不得生成空报告（FR1.4）
- 捕获 stdout 用于后续 JSON 解析

**验证:**
- [ ] 集成到 Task 11 的主入口一起验证

---

### Task 11: 主入口与 Skill 定义

**目标:** 编排完整流程，定义 Skill 入口

**文件:**
- `skills/test-report/index.ts`（新建）
- `skills/test-report/SKILL.md`（新建）

**关键实现:**
- `index.ts` 主流程：
  1. 解析配置 (`resolveConfig`)
  2. 判断模式：`result_file` 存在 → 解析模式，否则 → 执行模式
  3. 执行模式：检测框架 → 运行测试 → 收集结果文件
  4. 解析模式：读取指定文件 → 校验存在性 → 不存在则报错（不回退，澄清文档 3.5）
  5. 选择解析器 → 解析 → 安全过滤
  6. 收集覆盖率（auto 模式）
  7. 生成报告 → 写入文件
  8. 返回：报告路径 + 摘要
- 多结果文件：取第一个有效文件（澄清文档 3.7）
- `SKILL.md`：
  - 触发意图示例
  - 配置项说明（默认值）
  - 使用模式说明
  - 输出格式说明

**验证:**
- [ ] 端到端测试：在含 Jest 的测试项目中执行完整流程，验证报告输出

---

### Task 12: 文档与集成测试

**目标:** 补充测试 fixtures 与端到端验证

**文件:**
- `skills/test-report/__tests__/fixtures/` 下所有 fixture 文件（新建）
- 各解析器、报告生成器单元测试完善

**关键实现:**
- 创建真实 fixture 数据（基于真实 Jest/Vitest/JUnit 输出）
- 创建损坏格式 fixture（健壮性测试）
- 端到端测试：`tsx skills/test-report/index.ts` 模拟执行

**验证:**
- [ ] `npm run test -- skills/test-report/` 全部通过
- [ ] `npm run typecheck` 通过

---

## 里程碑与交付物

| 阶段 | 交付物 | 优先级 |
|------|--------|--------|
| M1 | Skill 完整代码 + 单元测试 + SKILL.md | P0 |
| M1 | 3 个解析器 (Jest/Vitest/JUnit) + Markdown 报告 | P0 |
| M1 | 执行/解析双模式 | P0 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Jest/Vitest JSON reporter 版本差异 | 按字段存在性做防御解析，缺失字段标注"未获取" |
| `fast-xml-parser` 大文件性能 | 验证 NFR1 性能要求（5 秒内完成 1000 用例） |
| 测试执行超时 | 默认 10 分钟超时，可配置 |

## 后续迭代 (M2+)

- M2: pytest 支持、fail_threshold 完整实现、覆盖率阈值筛选
- M3: HTML 输出、JSON 伴随产物
- M4: 历史趋势对比、更多框架支持