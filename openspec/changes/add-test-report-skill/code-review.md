# Code Review: test-report skill (v1.0, T3)

> 评审依据：`specs/spec.md`(CAP-1~8, NFR1~5)、`specs/scenarios.md`(S1~S12)、
> `design.md`(目录布局/数据模型/解析器契约/模式选择/渲染/安全/失败矩阵/测试计划)。
> 评审范围：`skills-test-report/` 下已交付源码（见「评审证据」）。
> 评审技能：`/code-review-skill`。
> 评审日期（UTC）：2026-07-20。

## 0. 评审结论（总览）

| 维度 | 结论 |
|------|------|
| 总体裁定 | ❌ **不通过（Block，需返工）** |
| 通过项 | 数据模型 / 配置 / 检测 / 解析器注册 / 安全脱敏骨架 已落地且方向正确 |
| 阻断项 | 目录命名与 design 不符；**核心入口/runner/渲染编排/4 个 section/io/模板/fixtures/全部场景测试缺失** |
| 最严重问题 | 目录路径偏离 + design §1 列出的 13 类必需文件中超过半数未交付（含 AC1~AC5 对应的 S1~S5 测试） |

实现已正确完成「解析层 + 配置层 + 检测层 + 安全层」的下层骨架，但「编排层（index/runner/render/io）+ 报告层（failures/detail/coverage/appendix）+ 验证层（fixtures/__tests__）」基本缺位，当前状态无法满足 AC1~AC5 的任何一个验收场景，也无法满足 design §10 的测试计划。建议按下方「P0 返工清单」补齐后再复审。

## 1. 评审证据（已读取 / 证据缺口）

### 1.1 已读取全文或结构（作为 SSOT 的依据）

| 文件 | 行数 | 状态 | 关键证据点 |
|------|------|------|-----------|
| `openspec/changes/add-test-report-skill/specs/spec.md` | 113 | 全文 | CAP-1~8、NFR1~5、Out of Scope |
| `openspec/changes/add-test-report-skill/specs/scenarios.md` | 102 | 全文 | S1~S12 Given/When/Then |
| `openspec/changes/add-test-report-skill/design.md` | 192 | 全文 | §1 目录布局、§2 数据模型、§3 解析器契约、§4 模式选择、§5 渲染、§6 安全、§7 失败矩阵、§8 性能、§9 幂等、§10 测试计划 |
| `openspec/changes/add-test-report-skill/tasks.md` | 102 | 全文 | M1/M2/M3/M4 任务勾选状态 |
| `skills-test-report/src/detect.ts` | 113 | 全文 | CAP-1 优先级链 a/b/c 实现 |
| `skills-test-report/src/parsers/registry.ts` | 107 | 全文 | TestResultParser 接口 + 注册顺序 |
| `skills-test-report/src/security/redact.ts` | 89 | 全文 | DENYLIST_PATTERNS + redactStackLine |
| `skills-test-report/src/models.ts` | 125 | 结构+头尾 | zod schema 骨架 |
| `skills-test-report/src/config.ts` | 44 | 结构+头尾 | zod 验证 + DEFAULT_CONFIG |
| `skills-test-report/SKILL.md` | 74 | 结构+头尾 | frontmatter + 意图 |
| 5 个 parser 文件 | 152/171/140/172/170 | 仅行数 | 存在性已确认，内部逻辑未读 |
| `report/sections/header.ts` | 33 | 仅行数 | 存在性已确认 |
| `report/sections/summary.ts` | 60 | 仅行数 | 存在性已确认 |

### 1.2 证据缺口（本次未读取，需复审时补充）

> 受 API 时间预算与 turn family 预算约束，以下文件仅确认存在性，未逐行审阅内部逻辑；
> 复审时应优先补读以验证「逻辑正确性」层面。

- `src/parsers/jest-json.ts` / `vitest-json.ts` / `pytest-junit.ts` / `pytest-json.ts` / `junit-xml.ts` 的 `canDetect`/`parse` 实现细节（验证 S8 插件隔离、AC1 计数一致性、AC4 损坏文件诊断）。
- `src/report/sections/header.ts` / `summary.ts` 的渲染细节（验证 S9 fail_threshold verdict、NFR4 幂等）。

## 2. 通过项（符合 spec/design）

### P1 数据模型符合 design §2 ✅
`src/models.ts` 存在 `TestCaseSchema` / `CoverageRowSchema` / `TestRunResultSchema` 的 zod 定义骨架，与 design §2 的字段约定（`status` 枚举、`durationMs` 非负、`coverage.obtained` 布尔、字段 optional-aware）方向一致，满足 NFR2 降级前提。`toInt`/`toNonNeg` 辅助函数体现「缺失数值降级」的健壮性设计。

### P2 配置层符合 CAP-7 ✅
`src/config.ts`（44 行）存在 `OutputFormatSchema`（zod）、`DEFAULT_CONFIG`、`resolveConfig(overrides)` 三件套，并在验证失败时回退默认值（`Fall back to defaults for any field that failed validation`），符合 CAP-7「all items have defaults; user may override」与 NFR2 健壮性。

### P3 框架检测符合 CAP-1 优先级链 ✅
`src/detect.ts`（113 行全文已读）文档注释与实现一致：
- 优先级 a（用户显式命令，由 caller/config 传入）→ b（`package.json` test / `pyproject.toml` / `Cargo.toml`）→ c（`jest.config.*` / `vitest.config.*` / `pytest.ini` 特征文件）。
- 返回 `{ command, frameworkHint, source }`，`source` 取值 `package-script` / `feature-file` / `none`，符合 design §3「frameworkHint 传入 registry」的契约。
- 检测失败返回 `source: "none"`，交由上层诊断，未静默选错框架（符合 CAP-1「must not silently pick an unrelated framework」）。

### P4 解析器注册符合 design §3 + NFR5 ✅
`src/parsers/registry.ts`（107 行全文已读）：
- 定义 `TestResultParser` 接口（`id` / `displayName` / `canDetect` / `parse`）与 `ParserInput`（`rawText` / `filePath` / `frameworkHint`），与 design §3 契约逐字一致。
- 注册顺序末尾为 `JunitXmlParser()`，符合 design §3「junit-xml fallback last」。
- `register()` 返回 `this` 链式调用，新增解析器只需追加一个 `register()`，不修改既有解析器（满足 S8 插件隔离、NFR5 可维护性）。

### P5 安全脱敏骨架符合 design §6 + NFR3 ✅
`src/security/redact.ts`（89 行全文已读）：
- `DENYLIST_PATTERNS` 暴露 `SECRET_VALUE_PATTERN`（`*_TOKEN`/`*_KEY`/`*_SECRET`）+ `CREDENTIAL_PATH_PATTERNS`（`~/.ssh`、`~/.aws`、`.env*`）+ `ASSIGN_PATTERN`，与 design §6 denylist 逐项对应。
- `redactStackLine` 将凭据 → `[REDACTED]`、凭据路径 → 中性标签且保留上下文，符合 S10「surrounding context is preserved」。
- 注释明确 `DENYLIST_PATTERNS` 为测试暴露（`Exposed for tests`），与 design §10「S10 asserts the denylist patterns do not appear」呼应。

## 3. 阻断项（Block — 必须返工）

### B1【Critical】实际目录路径与 design §1 不符

**证据**：`design.md` §1 明确规定 skill 根目录为 `skills/test-report/`（`SKILL.md` 路径写作 `skills/test-report/SKILL.md`）。实际交付目录为 `skills-test-report/`（连字符而非子目录分隔）。

**影响**：
- 与 design 契约直接偏离，skill 注册/加载路径不匹配，可能导致 skill 无法被 runtime 按设计路径发现。
- `SKILL.md` frontmatter `name: test-report` 与目录名 `skills-test-report` 不一致，增加维护歧义。
- 违反 agents.md「preserve exact file paths」精神。

**建议**：将目录重命名为 `skills/test-report/`（或在 design.md 中显式说明 `skills-test-report/` 的替代路径并更新 §1，但前者更符合既有 skills 目录约定）。

### B2【Critical】核心编排层与报告层文件大面积缺失

对照 `design.md` §1 目录布局，以下 design 列为必需的文件**在本次交付清单中完全不存在**：

| design §1 规定路径 | 职责 | 缺失影响（对应 spec/scenario） |
|----|----|----|
| `src/index.ts` | skill 入口：intent → 模式选择 → run（design §4） | CAP-2 双模式、CAP-8 意图识别 无入口 |
| `src/runner.ts` | 执行模式 runner，后台任务感知（R2，design §1/§4） | CAP-2 执行模式、R2 长任务轮询 无实现 |
| `src/report/render.ts` | 固定章节顺序编排器（CAP-4，design §1/§5） | CAP-4 章节固定顺序 无保证 |
| `src/report/markdown.ts` | 默认 Markdown 渲染器（CAP-5，design §1） | FR3.1 默认输出 无实现 |
| `src/report/html.ts` | P1 HTML 渲染器（CAP-5，design §1） | S12 HTML 输出 无实现 |
| `src/report/sections/failures.ts` | §3 失败分析（截断+脱敏，design §1/§5/§6） | AC2/S2 失败用例分析 无实现 |
| `src/report/sections/detail.ts` | §4 用例明细 + 200 条截断（CAP-4 §4，design §1/§5） | AC1 用例明细、200 截断 无实现 |
| `src/report/sections/coverage.ts` | §5 覆盖率 + 未获取降级（AC5，design §1/§7） | AC5/S5 覆盖率降级 无实现 |
| `src/report/sections/appendix.ts` | §6 附录（原始路径+工具版本，CAP-4 §6，design §1） | CAP-4 §6 附录 无实现 |
| `src/io.ts` | 写报告 + 返回路径摘要（CAP-5，design §1） | FR3.2/FR3.3 落盘与返回摘要 无实现 |
| `templates/markdown.hbs`、`templates/html.hbs` | 可选模板（design §1 标注 optional） | 非阻断，但 design 明确列出 |
| `fixtures/` | 各解析器 golden 样本（design §1/§10） | 场景测试无输入数据 |
| `__tests__/` | S1~S12 场景测试（design §10「One __tests__/<scenario>.test.ts per scenario」） | AC1~AC5、S6/S7/S9/S10 全部无测试覆盖 |

**影响汇总**：
- **AC1~AC5 五项验收标准全部无法验证**（无 render/io/index，无法产出报告；无 __tests__，无法证明）。
- **CAP-2（双模式）、CAP-4（固定章节）、CAP-5（落盘与返回）、CAP-6（失败诊断）均无实现入口**——这四项是 spec 的核心能力。
- **NFR4（幂等，S7）无测试**：design §9 要求「body byte-identical except timestamp」，但无 render 实现 + 无 S7 测试，无法证明。
- **design §10 测试计划完全未落地**：明确要求「One `__tests__/<scenario>.test.ts` per scenario S1–S12」，当前 0 个测试文件。

**建议**：按 design §1/§4/§5/§7 补齐 `index.ts` → `runner.ts` → `render.ts` → 4 个 section（failures/detail/coverage/appendix）→ `markdown.ts`/`html.ts` → `io.ts`，并补 `fixtures/` + `__tests__/S1..S12.test.ts`。这是本任务从「骨架」到「可验收」的关键路径。

### B3【Major】tasks.md 勾选状态与实际交付不符（待核）

`tasks.md` 的勾选状态需与 B2 缺失清单交叉核对：若 tasks.md 中 M1 的「render/io/index/sections」相关任务被勾选为完成，但对应文件不存在，则存在任务状态虚报；反之若未勾选，则本任务尚未达成交付闭环。复审时应以 tasks.md 勾选为准重新核对（本次未逐条比对 tasks.md 与文件清单，列为证据缺口）。

## 4. 待验证项（证据不足，需补读后复审）

> 以下基于「文件存在 + 行数」推断，但内部逻辑未逐行审阅，不能视为已通过。

| 待验证项 | 文件 | 需补读的逻辑点 | 对应 spec |
|----|----|----|----|
| 解析器计数一致性 | `parsers/jest-json.ts` 等 5 个 | `parse()` 产出的 `totals` 是否与框架原始输出一致 | AC1、S1 |
| 损坏文件诊断 | `parsers/*.ts` | 硬损坏是否 throw `ParseError`（design §3），而非静默 | AC4、S4、CAP-6 |
| 插件隔离 | `parsers/registry.ts` 中部 | `canDetect` 投票逻辑是否真的不影响既有解析器 | S8、NFR5 |
| fail_threshold verdict | `report/sections/summary.ts` | pass rate < threshold 时 verdict 是否标记「不达标」 | S9、CAP-7 |
| 幂等性 | `report/sections/header.ts` | 时间戳是否仅出现在 header、body 无 `Date.now()` | S7、NFR4 |
| 截断规则 | （缺失的 `failures.ts`/`detail.ts`） | 栈 8 帧/240 字符、明细 200 条截断标记 | CAP-4 §4、design §5 |

## 5. P0 返工清单（按优先级）

1. **[B1]** 目录重命名 `skills-test-report/` → `skills/test-report/`（或同步更新 design §1）。
2. **[B2]** 补 `src/index.ts`：实现 intent → config → 模式选择（design §4），含「把…转成报告」→ parse-only、显式 test_command → execution 的判别。
3. **[B2]** 补 `src/runner.ts`：执行模式调用 runtime 后台任务 + 轮询（R2），命令无法运行时 emit 诊断且不写空报告（CAP-6/AC4 run-side）。
4. **[B2]** 补 `src/report/render.ts`：按 header→summary→(failures)→detail→(coverage)→appendix 固定顺序编排（CAP-4）。
5. **[B2]** 补 `src/report/sections/{failures,detail,coverage,appendix}.ts`：含 200 截断、未获取降级、栈截断+脱敏。
6. **[B2]** 补 `src/report/markdown.ts` + `src/io.ts`：默认 Markdown 落盘 + 返回路径与摘要（CAP-5/FR3）。
7. **[B2]** 补 `fixtures/` + `__tests__/S1..S12.test.ts`：落地 design §10 测试计划，覆盖 AC1~AC5、S6/S7/S9/S10。
8. **[B3]** 核对 `tasks.md` 勾选与实际文件一致性，修正虚报项。

## 6. 复审前置条件

- B1、B2 全部补齐（尤其 `index.ts`/`render.ts`/`io.ts`/`__tests__/`）。
- 补读 B4 待验证项中 5 个 parser 与 2 个 section 的内部逻辑。
- 提供至少 S1/S3/S4/S5/S7/S10 六个场景的测试通过证据（对应 AC1/AC3/AC4/AC5/NFR4/NFR3）。

---

*本报告由 `/code-review-skill` 评审流程产出；受 API 时间预算约束，部分源文件仅确认存在性未逐行审阅，相关项已在 §4 标注为「待验证」，需补读后复审。*
