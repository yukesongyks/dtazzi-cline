# 测试报告 2.0 T2 — 需求澄清文档

> 阶段: clarify | 日期: 2026-07-16 | 来源: 测试报告 2.0 T2 PRD

## 1. 上下文确认

### 1.1 项目栈确认

| 维度 | 确认结论 | 证据 |
|------|----------|------|
| 主语言 | TypeScript | `package.json` scripts、`tsconfig.json`、`vitest.config.ts` |
| 测试框架 | Vitest（当前项目自身） | `vitest.config.ts` 存在，`package.json` 含 vitest 依赖 |
| 运行环境 | Node.js | `vitest.config.ts` 中 `environment: "node"` |
| 报告模板语言 | 中文 | 项目文档（AGENTS.md、README.md）均为中文，antgroup 内部仓库 |

**决策**: 首期 P0 以 TypeScript/Node + Vitest/Jest 为目标栈，与当前 Kanban 项目自身技术栈一致。PRD 中 Q1 已确认。

### 1.2 现有基础设施

- 项目已有 `vitest.config.ts`，支持 JSON reporter（vitest 原生 `--reporter=json`）
- 项目已有 `docs/superpowers/` 目录结构，含 `plans/` 和 `specs/` 子目录
- 项目 CI 使用 `.github/workflows/test.yml`

## 2. 开放问题解答（Q1-Q3）

### Q1: 首期目标项目栈是否以 TypeScript/Node 为主？

**✅ 确认：是。** 当前 Kanban 项目自身即为 TypeScript/Node 栈，首期 P0 范围（Jest/Vitest + JUnit XML）天然匹配。pytest 支持按 PRD 排入 M2（P1），Go test / cargo test 排入 M4（P2）。

### Q2: 报告是否需要中文/英文双语模板，还是仅中文？

**决策：中文模板，技术字段保留英文原文。**

- 章节标题、摘要说明使用中文
- 用例名、文件路径、错误信息、堆栈保留原始英文（不翻译）
- 字段标签（如 "通过率"、"失败数"）使用中文
- 后续 M3 可扩展双语模板参数 `--lang zh|en`

### Q3: 是否需要将报告自动推送到 IM / 邮件等渠道？

**决策：本期不做。** PRD §2.2 非目标已明确排除。若后续有需求，可作为独立 Skill 或本 Skill 的 M4+ 扩展。

## 3. 需求澄清与决策

### 3.1 FR1.1 框架检测：JSON Reporter 自动启用策略

**问题**: 当 package.json 中 test 脚本为 `vitest run` 但未配置 JSON reporter 时，Skill 的行为？

**决策**: Skill 自动追加 `--reporter=json` 参数，不修改用户配置。

- 理由：不影响用户原有的 `vitest.config.ts` 或 `package.json` 配置
- 风险：若用户脚本中有自定义 reporter 冲突（如 `--reporter=verbose`），vitest 会报错，Skill 应捕获并提示用户显式指定 `test_command`
- 对于 Jest：使用 `--json --outputFile=<tmp>` 而非修改 `jest.config.*`

### 3.2 FR2.4 用例明细截断策略

**问题**: 超过 200 条时"截断并注明"——截断规则？

**决策**:
- 按测试文件分组，每组展示前 20 条用例
- 被截断的组末尾标注 `... 还有 N 条用例（完整明细见附录）`
- 报告总用例数 >200 时，在摘要章节也标注截断提示
- 附录中提供完整明细 JSON 文件路径（`reports/test-report-<ts>-detail.json`），不含截断

### 3.3 FR4.2 fail_threshold 默认值语义

**问题**: 默认值"无"意味着什么？

**决策**: 默认值 `fail_threshold` 为 `null`/`undefined`，语义为"不启用不达标判定"。

- 仅当用户显式设置（如 `fail_threshold=80` 表示通过率 <80% 时标记不达标）后才生效
- 报告中结论字段始终显示 ✅/❌（基于是否全部通过），但"不达标"标记仅在 fail_threshold 启用时计算
- 避免歧义：默认值统一用 `null` 而非 `0` 或 `100`

### 3.4 FR3.2 报告文件名时间戳语义

**问题**: 时间戳是测试开始时间还是报告生成时间？

**决策**: 使用**报告生成时间**。

- 理由：同一轮测试结果可能被多次生成报告（如格式/参数调整后重新生成），报告生成时间更准确反映产物版本
- 执行模式：测试结束时间 ≈ 报告生成时间，差异可忽略
- 解析模式：报告生成时间与测试执行时间无关，时间戳取当前系统时间

### 3.5 FR1.3 解析模式：result_file 不存在时的行为

**问题**: 用户指定 `result_file` 但文件不存在时，是否回退到执行模式？

**决策**: **不回退，返回明确错误。**

- 返回格式：`错误: 指定的结果文件不存在: <path>`，并列出当前目录下可能的候选文件（如 `*.xml`、`*.json`）
- 不回退到执行模式的原因：用户明确选择了"解析模式"，回退会改变用户意图，且可能意外触发长时间测试
- 若用户希望自动回退，应显式使用执行模式（不指定 result_file）

### 3.6 NFR3 安全过滤规则

**问题**: 敏感路径过滤的具体规则？

**决策**:
- 过滤目标：错误堆栈中出现的绝对路径，匹配以下模式时替换为 `[REDACTED]`：
  - `$HOME/.ssh/`、`$HOME/.aws/`、`$HOME/.config/` 下的凭据文件
  - 环境变量值中包含 `token`、`key`、`secret`、`password`、`credential` 关键词的
  - API key 格式（如 `sk-`、`ghp_`、`xoxb-` 等常见前缀）
- 不过滤：项目源码路径（`/src/`、`/packages/`）、`node_modules/` 路径
- 过滤位置：在报告生成阶段，解析原始结果后、写入 Markdown 前执行

### 3.7 覆盖率数据来源

**问题**: Vitest 的 coverage 是否需要用户事先配置 coverage provider？

**决策**:
- Skill 检测 `vitest.config.ts` 中是否已有 `coverage` 配置
- 若有：使用现有配置，追加 `--coverage` 参数
- 若无：Skill 自动追加 `--coverage --coverage.provider=v8`（vitest 默认 provider），并写入临时覆盖率报告到 `coverage/` 目录
- 解析模式：直接读取已有的 `coverage/coverage-summary.json`（istanbul/c8 标准格式）
- 覆盖率章节标注数据来源（vitest c8 / vitest istanbul / pytest-cov / 手动指定）

### 3.8 Skill 实现形式与集成方式

**问题**: 该 Skill 是作为 Kanban 内置 superpower 还是独立工具？

**决策**: 作为 Kanban 内置 superpower 实现。

- 原因：Kanban 的 Agent 执行测试后需要直接生成报告，内置于 Kanban 的 Skill 系统更自然
- 实现位置：`docs/superpowers/` 下新增 `test-report/` 目录，含 SKILL.md、解析器、报告模板
- 报告模板：使用 Markdown 模板字符串，支持占位符替换
- 不与现有 superpower 冲突：该 Skill 是新增的独立能力

## 4. 框架解析器插件式设计澄清

PRD §NFR5 要求"插件式结构"。澄清如下：

| 解析器 | 输入格式 | 触发条件 | M 阶段 |
|--------|----------|----------|--------|
| `jest-json` | Jest JSON (`--json`) | 检测到 `jest.config.*` 或 `--json` 输出 | M1 |
| `vitest-json` | Vitest JSON (`--reporter=json`) | 检测到 `vitest.config.*` | M1 |
| `junit-xml` | JUnit XML (`.xml`) | 文件扩展名 `.xml` 且根元素为 `<testsuites>` 或 `<testsuite>` | M1 |
| `pytest-json` | pytest JSON report | 检测到 `pytest.ini`/`pyproject.toml` 中 pytest 配置 | M2 |
| `pytest-junit` | pytest JUnit XML | 解析模式指定 `.xml` | M2 |

每个解析器实现统一接口 `TestResultParser`：
```typescript
interface TestResultParser {
  readonly name: string;
  canParse(input: ParseInput): boolean;
  parse(input: ParseInput): ParsedTestResult;
}
```

## 5. 决策汇总

| 编号 | 问题 | 决策 | 影响范围 |
|------|------|------|----------|
| D1 | 首期目标栈 | TypeScript/Node + Vitest/Jest | M1 范围 |
| D2 | 报告语言 | 中文模板 + 技术字段英文 | FR2 模板 |
| D3 | IM/邮件推送 | 本期不做 | 无 |
| D4 | JSON reporter 自动启用 | 追加 `--reporter=json` 参数 | FR1.1 |
| D5 | 用例截断规则 | 每组前 20 条，附完整 JSON | FR2.4 |
| D6 | fail_threshold 默认值 | `null` = 不启用 | FR4.2 |
| D7 | 时间戳语义 | 报告生成时间 | FR3.2 |
| D8 | 解析模式文件不存在 | 返回错误，不回退 | FR1.3 |
| D9 | 安全过滤规则 | 凭据路径/值替换为 `[REDACTED]` | NFR3 |
| D10 | 覆盖率自动启用 | 检测配置，无则追加 `--coverage` | FR2 覆盖率 |
| D11 | 实现形式 | Kanban 内置 superpower | 架构 |

## 6. 仍需确认的风险项

| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| R1 | vitest `--reporter=json` 与用户自定义 reporter 冲突 | 捕获冲突错误，提示用户使用 `--test_command` 显式指定 |
| R2 | 大项目（>1000 用例）JSON 输出可能很大 | 使用流式解析，限制内存占用 |
| R3 | 覆盖率生成耗时（vitest --coverage 显著慢于纯测试） | `coverage=auto` 模式检测到已有 coverage 配置才启用；`coverage=off` 完全跳过 |

## 7. 下一步

- 进入 `/openspec-propose` 产出 OPSX 设计文档（`docs/superpowers/specs/test-report-2.0-t2-design.md`）
- 明确 Skill 的目录结构、解析器接口、报告模板
- 产出 M1 实现计划