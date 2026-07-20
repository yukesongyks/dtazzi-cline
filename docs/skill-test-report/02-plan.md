# 测试报告 Skill 实施计划 (Test Report Skill Implementation Plan)

> 阶段: plan | 采用技能: /writing-plans | 产物: 下游 apply 阶段的执行基线
> 生成时间: 2026-07-20 (UTC) | SSOT: `docs/skill-test-report/01-clarify.md`
> 范围: M1 / P0 —— Vitest JSON + Jest JSON + JUnit XML 解析、Markdown 报告、执行/解析双模式

---

## Global Constraints (全局约束)

> 来源于 `01-clarify.md` 裁定，apply 阶段不得偏离；变更须新一轮 clarify。

1. **语言/技术栈 (Q1)**: P0 仅 TypeScript/Node 栈。解析器优先级固化：`Vitest JSON > Jest JSON > JUnit XML (跨语言兜底)`。pytest 保留 M2/P1，不进 P0。
2. **报告语言 (Q2)**: 首期仅中文 (zh-CN)。模板须 **i18n-ready** —— 文案以 i18n key 引用而非硬编码进 Markdown 生成逻辑，首期实现 zh-CN 字典，为 M4 预留扩展点。`生成时间` 等字段格式遵循 zh-CN 习惯。
3. **无外部推送 (Q3)**: 不做 webhook/IM/邮件集成。FR3.3 仅返回"报告路径 + 结果摘要 + 1~3 条失败原因"到 Agent 会话。
4. **统一中间模型 (D10)**: 所有解析器输出统一 IM (Intermediate Model)，字段固定。IM 既是 JSON 伴随产物，也是 Markdown/HTML 渲染的数据源 —— 解析层与渲染层解耦。
5. **插件式解析器 (NFR5)**: 新增框架解析器须以独立模块注册，不影响既有解析器；解析器接口统一 (`detect(input) → boolean`, `parse(raw) → IM`)。
6. **项目根目录基准 (D5)**: 路径基准为含 `package.json` 的最近目录（FR1.1 识别结果），非 Agent cwd。`reports/` 不存在自动 `mkdir -p`。
7. **幂等性 (NFR4)**: 时间戳字段独立标注 `生成时间`，其余内容对同一结果文件多次生成须一致。
8. **截断须显式标注 (NFR2)**: 不得静默丢数据；堆栈截断、用例明细截断、覆盖率缺失均须显式标注（"未获取"/"已截断,共 N 行"）。
9. **敏感信息过滤 (NFR3, D8)**: 环境变量值/凭据字段值替换为 `***`（键名保留）；绝对路径中用户名脱敏；项目内源码相对路径不过滤。
10. **解析模式绝不执行测试 (D7)**: 即使检测到 `package.json` 也不触发测试命令。
11. **性能 (NFR1)**: 结果解析 + 报告生成（不含测试执行）≤ 5 秒（1000 用例）。
12. **不允许使用 grep/glob 工具**；遵循 anti-timeout 与 anti-blocking 协议。

---

## 目录结构 (Target Layout)

```
skills/test-report/
├── SKILL.md                      # Skill 入口与触发意图
├── config/
│   ├── defaults.ts              # 默认配置项 (FR4.2)
│   └── schema.ts                # 配置项类型与校验
├── src/
│   ├── types.ts                 # IM (统一中间模型) 类型定义 (D10)
│   ├── config.ts                # 配置解析与合并
│   ├── detect.ts                # 框架自动识别 (FR1.1)
│   ├── execute.ts               # 测试执行 + 后台轮询 (FR1.3/D9)
│   ├── parsers/
│   │   ├── registry.ts          # 插件式解析器注册表 (NFR5)
│   │   ├── interface.ts         # 解析器统一接口
│   │   ├── vitest-json.ts       # Vitest JSON 解析器 (P0)
│   │   ├── jest-json.ts         # Jest JSON 解析器 (P0)
│   │   └── junit-xml.ts         # JUnit XML 解析器 (P0 兜底)
│   ├── coverage.ts              # 覆盖率采集与解析 (D1)
│   ├── sanitize.ts              # 敏感信息过滤 (NFR3/D8)
│   ├── report/
│   │   ├── render.ts            # 渲染分发 (markdown/html/json)
│   │   ├── markdown.ts          # Markdown 渲染器 (默认)
│   │   ├── truncation.ts        # 截断策略 (D3/D4)
│   │   └── i18n/
│   │       ├── index.ts         # i18n 取值函数
│   │       └── zh-CN.ts         # zh-CN 字典
│   └── orchestrator.ts          # 主入口编排 (FR4/FR3.3)
├── fixtures/                    # 解析器单测用样本数据
└── tests/                       # 单元测试与降级测试
```

---

## 任务分解 (Task Breakdown)

### Task 1: Skill 骨架、类型定义与配置模块

**Component**: `SKILL.md` / `src/types.ts` / `src/config.ts` / `config/defaults.ts` / `config/schema.ts`
**Spec refs**: FR4.2 / D10 / D5 / D6 / NFR4 / NFR5

**Files**:
- `skills/test-report/SKILL.md` — 触发意图、配置项说明、调用契约
- `skills/test-report/src/types.ts` — IM 类型（meta/summary/failures/suites/coverage/appendix）
- `skills/test-report/config/defaults.ts` — 默认值表
- `skills/test-report/config/schema.ts` — 配置校验

**Interfaces**:
- `IntermediateModel`（D10 字段固定）
- `ResolvedConfig`：`test_command`、`result_file`、`output_format`、`output_path`、`coverage`、`fail_threshold`、`framework`

**Steps**:
1. 编写 `SKILL.md`：触发意图示例（"生成测试报告"/"跑一下测试并出报告"/"把这个 junit.xml 转成测试报告"）、可配置项表（FR4.2）、返回契约（FR3.3）。
2. 定义 `types.ts`：IM 完整类型，字段严格对齐 D10（`meta.projectName/generatedAt/command/framework/frameworkVersion/environment`，`summary.total/passed/failed/skipped/passRate/durationMs/overallStatus`，`failures[].name/file/error/stackExcerpt`，`suites[].file/cases[].name/status/durationMs`，`coverage.statements/branches/functions/lines/lowCoverageFiles`，`appendix.resultFilePath/toolVersion`）。
3. `defaults.ts`：默认值 `output_format=markdown`、`output_path=reports/`、`coverage=auto`、`fail_threshold=无`。
4. `schema.ts`：校验 `fail_threshold` 为 0-100 整数或 `undefined`（D6）；`output_format ∈ {markdown, html, json}`；`coverage ∈ {auto, on, off}`。
5. `config.ts`：合并默认值与用户覆盖；项目根目录基准解析（D5）。

**Verification**: 类型编译通过；`fail_threshold=80`/`coverage=auto` 正常解析；非法值被拒绝。

---

### Task 2: 框架自动识别模块

**Component**: `src/detect.ts`
**Spec refs**: FR1.1 / FR1.2 / D7 / Q1

**Interfaces**:
- `detectFramework(rootDir): { framework: FrameworkId; runner: string; configEvidence: string }`
- `sniffResultFile(filePath): FrameworkId`（解析模式内容嗅探，D7）

**Steps**:
1. 执行模式优先级：用户显式 `test_command` → `package.json` scripts.test / `vitest.config.*` / `jest.config.*` → 框架特征文件 → 兜底按 JUnit XML 解析（Q1）。
2. 解析模式内容嗅探（D7）：以 `<` 开头且含 `testsuite` → JUnit XML；以 `{` 开头且含 `testResults`/`numPassedTestSuites` → Jest/Vitest JSON；嗅探失败 → 提示用户指定 `framework`，不生成空报告（AC4）。
3. 框架/版本识别（D2）：版本号优先从 `package.json` → `dependencies`/`devDependencies` 读取，格式化 `vitest@x.y.z`；失败标注 `版本: 未获取`，不阻塞（NFR2）。
4. 返回识别证据字符串，写入报告头 `执行命令`/`框架/版本`。

**Verification**: 给定含 `vitest.config.ts` 的 fixture → 识别 Vitest；给定 junit.xml 片段 → 内容嗅探 JUnit XML；缺失证据 → 抛明确诊断而非空报告。

---

### Task 3: 插件式解析器接口与注册表

**Component**: `src/parsers/interface.ts` / `src/parsers/registry.ts`
**Spec refs**: NFR5 / D10

**Interfaces**:
```ts
interface ParserPlugin {
  id: FrameworkId;                 // 'vitest-json' | 'jest-json' | 'junit-xml' | ...
  detect(input: RawInput): boolean; // 内容嗅探
  parse(raw: RawInput, ctx: ParseCtx): IntermediateModel;
}
```
- `RawInput` = 文件路径 + 原始文本/Buffer
- `ParseCtx` = `{ rootDir, frameworkVersion, command, environment }`

**Steps**:
1. 定义 `ParserPlugin` 接口，`detect` 与 `parse` 双方法。
2. `registry.ts`：按 Q1 优先级注册 `vitest-json → jest-json → junit-xml`；提供 `resolve(input)` 按 `detect` 返回首个命中解析器；均未命中抛 `UnrecognizedResultFormatError`（AC4）。
3. 文档化新增解析器流程：实现 `ParserPlugin` → 注册 → 不改动既有解析器（NFR5）。

**Verification**: 注入两个假解析器，`resolve` 按优先级返回首个命中；全部未命中抛特定错误类型。

---

### Task 4: Vitest / Jest JSON 解析器 (P0)

**Component**: `src/parsers/vitest-json.ts` / `src/parsers/jest-json.ts`
**Spec refs**: FR1.2 / D10 / NFR2 / US2

**Files**: 两个解析器实现 + `fixtures/vitest-sample.json` / `fixtures/jest-sample.json`

**Steps**:
1. 解析 Jest/Vitest 标准 JSON reporter 输出（`testResults`/`numPassedTestSuites` 等字段）。
2. 映射到 IM：`testResults[].assertionResults[].status` → `suites[].cases[].status`；`status=passed/failed/skipped`。
3. 失败用例提取（US2/FR2.3）：`name`、`file`（`failureMessages`/`location`）、`error`（`failureMessages[0]`）、`stackExcerpt`（原始堆栈，截断在渲染层做）。
4. 汇总 `summary`：total/passed/failed/skipped/passRate/durationMs/overallStatus。
5. 字段缺失降级（NFR2）：缺失项标注 `未获取`，不抛异常；记录 `parseWarnings`。
6. 写解析器单测覆盖：全通过、含失败、字段缺失、空 `testResults`。

**Verification**: 解析 fixture 后 IM 字段与原始 JSON 数值一致；缺失 `duration` 时标注 `未获取` 且不崩溃。

---

### Task 5: JUnit XML 解析器 (P0 兜底)

**Component**: `src/parsers/junit-xml.ts`
**Spec refs**: FR1.2 / D10 / D7 / AC3 / NFR2

**Files**: 实现 + `fixtures/junit-sample.xml`

**Steps**:
1. 解析 JUnit XML（`<testsuites>`/`<testsuite>`/`<testcase>`/`<failure>`/`<skipped>`）。
2. 映射到 IM：`<testsuite name>` → `suites[].file`（缺失时用 `name`）；`<testcase>` → `cases[]`；`<failure message>` → `failures[]`；`time` 属性 → `durationMs`（秒→毫秒）。
3. 失败用例含 `name`、`file`（`classname`+`name` 或 `file` 属性）、`error`（`<failure>` 文本/message）、`stackExcerpt`（原始，截断在渲染层）。
4. 属性缺失降级：`time` 缺失 → `durationMs=未获取`；`<failure>` 无 message → `error` 取元素文本（NFR2）。
5. 支持 CI 流程"仅解析已有结果"（US4/AC3）：不触发执行。
6. 单测覆盖：标准 JUnit、含 skipped、属性缺失、非 utf-8 编码兜底。

**Verification**: 给定 `fixtures/junit-sample.xml`，解析模式不触发执行即产出报告（AC3）；属性缺失标注 `未获取`。

---

### Task 6: 测试执行模块（执行/解析双模式 + 后台轮询）

**Component**: `src/execute.ts`
**Spec refs**: FR1.3 / FR1.4 / D9 / R2 / AC4

**Interfaces**:
- `runTests(command, opts): Promise<{ stdout, stderr, exitCode, durationMs }>`
- `shouldBackgroundRun(ctx): boolean`（D9 启发式）

**Steps**:
1. 执行模式：依据 `detect` 结果构造命令；Vitest/Jest 自动追加 JSON reporter 参数以产出可解析文件。
2. 解析模式（FR1.3）：`result_file` 非空时直接跳过执行，交由解析器（绝不调用测试命令，D7）。
3. 后台执行判定（D9）：预估耗时 > 30s（用例数 > 100 或 `testTimeout` 配置）或运行时支持后台 → 后台执行；轮询间隔 5s 拉取 stdout/stderr 增量；默认 10 分钟超时，超时主动停止并生成"执行超时"诊断报告（符合 FR1.4，不算成功）。
4. 命令无法运行（FR1.4）：非用例失败而是命令不可执行 → 明确诊断（命令、退出码、stderr 摘要），不得生成空报告冒充成功（AC4）。
5. 执行成功后定位 reporter 产物路径，交由解析层。

**Verification**: 解析模式断言不触发执行；执行模式超时生成诊断报告而非空报告；命令不存在给出明确诊断。

---

### Task 7: 覆盖率采集与解析

**Component**: `src/coverage.ts`
**Spec refs**: FR2.5 / D1 / AC5 / NFR2

**Steps**:
1. 执行模式（D1）：`coverage=auto` 且检测到 Vitest/Jest → 构造命令时自动追加 `--coverage`，产物到 `coverage/`，解析 `coverage-summary.json`（istanbul 标准）。
2. `coverage=off`：强制不追加 `--coverage`，跳过覆盖率章节。
3. `coverage=on`：解析模式也尝试从 `coverage/coverage-summary.json` 读取（若存在）。
4. 解析模式默认：标注"未获取(解析模式不采集覆盖率)"（D1）。
5. 映射到 `IM.coverage`：`statements/branches/functions/lines`（百分比）+ `lowCoverageFiles`（低于阈值的文件清单，FR2.5）。
6. 覆盖率不存在时（AC5）：标注"未获取"，其余章节正常输出，不阻塞。
7. 单测：有 `coverage-summary.json` fixture → 正确呈现；缺失 → 标注 `未获取`。

**Verification**: AC5 —— 覆盖率数据存在时正确呈现，不存在时标注"未获取"且其余章节正常。

---

### Task 8: 敏感信息过滤模块

**Component**: `src/sanitize.ts`
**Spec refs**: NFR3 / D8 / NFR2

**Steps**:
1. 环境变量值过滤：正则匹配 `process\.env\.\w+` 赋值上下文、`KEY=value` 形态，值替换 `***`（键名保留）。
2. 凭据字段过滤：`password`/`token`/`secret`/`api_key`/`authorization` 字段值替换 `***`（键名保留）。
3. 绝对路径用户名脱敏：`/Users/<name>/` → `/Users/***/`、`/home/<name>/` → `/home/***/`、`C:\Users\<name>\` → `C:\Users\***\`。
4. **不过滤**：错误堆栈中项目内源码相对路径（诊断必需）。
5. 降级（NFR2）：正则匹配失败时保留原文并日志告警，不阻塞报告。
6. 单测：含 `process.env.SECRET=x`、`/Users/alice/src` 的堆栈 → 脱敏；`./src/foo.ts` 保留。

**Verification**: 敏感值被 `***` 替换；项目内相对路径保留；正则异常不崩溃。

---

### Task 9: 报告渲染层（Markdown 默认 + 截断策略 + i18n-ready）

**Component**: `src/report/render.ts` / `src/report/markdown.ts` / `src/report/truncation.ts` / `src/report/i18n/index.ts` / `src/report/i18n/zh-CN.ts`
**Spec refs**: FR2 / FR3.1 / FR3.2 / D3 / D4 / D6 / Q2 / NFR4

**Files**: 渲染分发、Markdown 渲染器、截断策略、i18n 取值函数 + zh-CN 字典

**Steps**:
1. `render.ts`：按 `output_format` 分发；`markdown` 默认，`json` 输出 IM 伴随产物（M3），`html` 列 M3（P1）。
2. 截断策略（D3）：失败用例堆栈最多保留前 15 行，每行截断 200 字符，超出标注 `... (堆栈已截断,共 N 行)`；`error` message > 2000 字符截断尾部并标注。
3. 用例明细截断（D4）：始终按测试文件分组；用例总数 > 200 时每文件组保留"失败全部 + 通过按耗时倒序前 5 条"，组尾标注 `本组共 N 条,展示 M 条(失败 X + 通过 Top5)`。
4. Markdown 报告固定章节顺序（FR2）：① 报告头（项目名/生成时间/执行命令/框架版本/执行环境）② 结果摘要（total/passed/failed/skipped/passRate/总耗时/✅❌）③ 失败用例分析（有失败时必选）④ 用例明细（按文件分组）⑤ 覆盖率（若可获取，否则标注"未获取"）⑥ 附录（原始结果文件路径/生成工具版本）。
5. `fail_threshold` 体现（D6）：通过率 < 阈值 → 报告头结论行 `❌ 不达标(通过率 X% < 阈值 Y%)`，摘要板块高亮；不影响用例数据。
6. i18n-ready（Q2）：所有文案经 `t(key)` 取值，首期实现 zh-CN 字典；`生成时间` 等 zh-CN 习惯格式。
7. 幂等性（NFR4）：除 `生成时间` 时间戳字段外，其余内容对同一结果文件多次生成一致。
8. 单测：固定章节顺序断言；截断标注存在；幂等性（同输入两次渲染 diff 仅时间戳字段）。

**Verification**: AC1 —— Markdown 报告符合 FR2 六大板块且摘要数据与原始输出一致；AC2 —— 失败分析含用例名/文件路径/错误信息；幂等性断言通过。

---

### Task 10: 主入口编排与交互约定

**Component**: `src/orchestrator.ts`
**Spec refs**: FR1 / FR3.3 / FR4.1 / FR4.2 / D5 / NFR1

**Interfaces**:
- `generateTestReport(userConfig): Promise<{ reportPath, summary, topFailures }>`

**Steps**:
1. 编排流程（FR1）：解析配置 → 识别模式（执行/解析）→ 执行或读取结果 → 解析为 IM → 采集覆盖率 → 敏感过滤 → 渲染 → 落盘 → 返回摘要。
2. 落盘（D5/FR3.2）：`reports/test-report-<YYYYMMDD-HHmmss>.md`（本地时区时间戳）；`reports/` 不存在 `mkdir -p`；允许用户指定 `output_path`。
3. 返回契约（FR3.3）：报告路径 + 结果摘要（passRate/失败数）+ 失败时最关键 1~3 条失败原因（`topFailures`）。
4. 性能保障（NFR1）：解析+渲染 ≤ 5 秒（1000 用例）；大文件流式读取避免一次性载入。
5. 配置项全部有默认值（FR4.2），用户可覆盖。
6. 集成测试（端到端）：执行模式跑一个最小 Vitest fixture → 产出报告；解析模式读 junit.xml → 产出报告（AC3）。

**Verification**: AC1/AC3 端到端通过；返回结构含 `reportPath/summary/topFailures`；1000 用例 fixture 解析+渲染 < 5 秒。

---

## Self-Review (自检)

**Spec 覆盖核验**:
- FR1.1 框架识别 → Task 2 ✅
- FR1.2 P0 框架/格式 → Task 4/5 ✅
- FR1.3 执行/解析双模式 → Task 6 ✅
- FR1.4 执行失败诊断 → Task 6 ✅
- FR2 报告六板块 → Task 9 ✅
- FR3.1 输出格式 → Task 9 ✅
- FR3.2 落盘路径 → Task 10 ✅
- FR3.3 返回契约 → Task 10 ✅
- FR4.1/4.2 交互约定 → Task 1/10 ✅
- NFR1 性能 → Task 10 ✅
- NFR2 降级 → Task 4/5/8/9 ✅
- NFR3 安全过滤 → Task 8 ✅
- NFR4 幂等 → Task 9 ✅
- NFR5 插件式 → Task 3 ✅

**AC 覆盖核验**:
- AC1 (Jest/Vitest + Markdown 结构) → Task 4 + Task 9 + Task 10 端到端 ✅
- AC2 (失败用例含名称/路径/错误) → Task 4/5 + Task 9 失败分析板块 ✅
- AC3 (JUnit XML 解析模式不执行) → Task 5 + Task 6 解析模式 ✅
- AC4 (结果损坏返回错误非空报告) → Task 3 `UnrecognizedResultFormatError` + Task 6 诊断 ✅
- AC5 (覆盖率存在/缺失降级) → Task 7 ✅

**里程碑对齐**: M1/P0 范围 = Vitest JSON + Jest JSON + JUnit XML + Markdown + 执行/解析双模式 —— 全部由 Task 4/5/6/9/10 覆盖。pytest(HTML/JSON 伴随) 留 M2/M3，不在本期。

**SSOT 一致性**: Q1/Q2/Q3 + D1-D10 裁定均已映射到对应 Task；无偏离。

**占位符扫描**: 无 TODO/TBD/未记录；所有任务含具体 files/interfaces/steps/verification。

**执行交接**: apply 阶段按 Task 1→10 顺序执行；Task 间依赖（types/IM 先于解析器，解析器先于渲染，最后编排）已在编号中体现。
