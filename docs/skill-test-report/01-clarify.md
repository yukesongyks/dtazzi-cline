我是曼昱。

# Skill 2.0 T2 · 测试报告 Skill · 需求澄清基线 (Clarify)

> 阶段: clarify | 采用技能: /brainstorming | 产物性质: 下游 propose/design/apply 阶段的事实基线(SSOT)
> 生成时间: 2026-07-20 (UTC) | 决策依据: 已验证工程上下文 + 需求描述 + 行业最佳实践 + 安全兜底

---

## 0. 已验证事实 (SSOT)

| 编号 | 事实 | 证据 |
|---|---|---|
| F1 | 目标工程主栈为 **TypeScript / Node 22** | `package.json` name=`@alipay/dtazzicloud`, `engines.node>=22`, `type:module` |
| F2 | 测试框架为 **Vitest** | 根目录 `vitest.config.ts` 存在并配置 `globals/node/testTimeout` |
| F3 | 工程已有 `coverage` 目录惯例 | `package.json` scripts.clean = `shx rm -rf dist coverage` |
| F4 | 多 workspace 形态 | `packages/**` 与 `web-ui/**` 各自独立 vitest 配置,根 config 显式 exclude |
| F5 | 仓库内**无现存 SKILL.md** | `find -iname SKILL.md` (maxdepth 3) 为空 → 本任务为新建 skill |
| F6 | 代码规范: Biome lint | `biome.json` + `lint` script 覆盖 src/test/web-ui |
| F7 | 项目语言环境: 中文优先 | PRD 全中文、内部 antchain 仓库 |

---

## 1. 开放问题裁定 (Q1 / Q2 / Q3)

> 依【防阻塞协议 §2】,澄清节点静默接管决策权,按"上下文优先 → 安全兜底 → 行业最佳实践"裁定。

### Q1 — 首期目标项目栈是否以 TypeScript/Node 为主?
**裁定: ✅ 是。** 维持 PRD 假设。

- P0 解析器优先级固化: **Vitest JSON > Jest JSON > JUnit XML(跨语言兜底)**。
- pytest 保留在 **M2/P1**,不进 P0(与 F1/F2 上下文一致,避免首期铺得过宽)。
- 框架自动识别 (FR1.1) 优先级: 用户指定命令 → `package.json` scripts.test / vitest.config.* / jest.config.* → 框架特征文件 → 兜底按 JUnit XML 解析。

### Q2 — 报告语言: 中文 / 英文双语 / 仅中文?
**裁定: ✅ 首期仅中文 (zh-CN)。** 英文双语列 M4 候选。

- 依据: F7 中文 PRD + 中国团队 + 安全兜底(单语言模板复杂度低、不易出错)。
- **约束 (写入 NFR5)**: 模板须 **i18n-ready** — 文案以 key 引用而非硬编码进 Markdown 生成逻辑,首期仅实现 zh-CN 字典,为 M4 预留扩展点。报告头 `生成时间` 等字段格式遵循 zh-CN 习惯。

### Q3 — 是否自动推送 IM / 邮件?
**裁定: ❌ 不做。** 维持 PRD 非目标。

- FR3.3 仅返回"报告路径 + 结果摘要 + 1~3 条失败原因"到 Agent 会话,由 Agent 决定是否转告用户。不做 webhook/IM/邮件集成。
- 列为 M4+ 候选,需独立安全评审(凭据/隐私)。

---

## 2. PRD 隐含歧义点裁定 (10 项)

> 这些点 PRD 未明确,若不澄清将在 design/apply 阶段反复返工。逐条裁定如下。

### D1 · 覆盖率获取方式 (FR2.5 "若可获取")
- **执行模式**: Skill 在构造测试命令时,若 `coverage=auto`(默认)且检测到 Vitest/Jest,自动追加 `--coverage` 参数,产物输出到默认 `coverage/` 目录,随后解析 `coverage-summary.json`(Vitest/Jest 共用 istanbul 标准)。
- **解析模式**: 不主动跑测试,因此覆盖率章节标注"未获取(解析模式不采集覆盖率)"。
- **`coverage=off`**: 强制不追加 `--coverage`,跳过覆盖率章节。
- **`coverage=on`**: 即使解析模式也尝试从 `coverage/coverage-summary.json` 读取(若存在)。

### D2 · 框架/版本识别 (FR2 报告头)
- **框架名**: 来自 FR1.1 识别结果。
- **版本号**: 优先从 `package.json` → `dependencies` / `devDependencies` 读取(如 `vitest`、`jest`),格式化为 `vitest@x.y.z`。
- **降级**: 读取失败时报告头标注 `版本: 未获取`,不阻塞报告生成(NFR2)。

### D3 · 失败用例堆栈"截断至可读长度" (FR2.3)
- **默认阈值**: 堆栈最多保留 **前 15 行**,每行截断至 **200 字符**;超出以 `... (堆栈已截断,共 N 行)` 标注。
- **错误信息 (message)**: 不截断原 message,但若单条 > 2000 字符则截断尾部并标注。
- **理由**: 平衡可读性与诊断信息完整性,符合 NFR2 不静默丢数据(截断须显式标注)。

### D4 · 用例明细超 200 条截断策略 (FR2.4)
- **分组优先**: 始终按测试文件分组展示。
- **截断规则**: 当用例总数 > 200 时,每个文件组内保留 **失败用例全部 + 通过用例按耗时倒序前 5 条**,组尾标注 `本组共 N 条,展示 M 条(失败 X + 通过 Top5)`。
- **理由**: 失败优先(US2)+ 控制报告体积(NFR1 5 秒内生成)。

### D5 · output_path 默认与文件名 (FR3.2)
- **路径基准**: 相对于 **项目根目录**(由 FR1.1 识别,通常为含 `package.json` 的最近目录),非 Agent cwd。
- **默认文件名**: `reports/test-report-<YYYYMMDD-HHmmss>.md`,时间戳取 **本地时区**(用户可读),与 SSOT F 表中 UTC 区分。
- **目录创建**: 若 `reports/` 不存在自动 `mkdir -p`。
- **幂等性 (NFR4)**: 时间戳字段独立标注 `生成时间`,其余内容对同一结果文件多次生成须一致。

### D6 · fail_threshold 类型与"不达标"体现 (FR4.2)
- **类型**: 百分比整数(0-100),如 `fail_threshold=80` 表示通过率 < 80% 视为不达标。
- **默认**: `无`(不启用)。
- **体现**: 报告头结论行从 `✅ 通过` 变为 `❌ 不达标(通过率 75% < 阈值 80%)`,摘要板块高亮提示。不影响用例数据本身。

### D7 · 解析模式框架识别 (US4 / FR1.3)
- **识别策略**: 
  1. 用户显式 `result_file` 指定时,按文件内容嗅探:以 `<` 开头且含 `testsuite` → JUnit XML;以 `{` 开头且含 `testResults`/`numPassedTestSuites` → Jest/Vitest JSON。
  2. 嗅探失败 → 提示用户指定 `framework` 配置项,不生成空报告(AC4)。
- **不重复执行**: 解析模式绝不调用测试命令,即使检测到 `package.json` 也不触发。

### D8 · 敏感信息过滤规则 (NFR3)
- **过滤对象**: 
  - 环境变量值(键名保留,值替换为 `***`):正则匹配 `process\.env\.\w+` 的赋值上下文、`KEY=value` 形态。
  - 常见凭据模式: `password`、`token`、`secret`、`api_key`、`authorization` 字段值(键名保留,值 `***`)。
  - 绝对路径中的用户名: `/Users/<name>/` → `/Users/***`、`/home/<name>/` → `/home/***`、`C:\Users\<name>\` → `C:\Users\***\`。
- **不过滤**: 错误堆栈中项目内源码相对路径(诊断必需)。
- **降级**: 正则匹配失败时保留原文但日志告警,不阻塞报告。

### D9 · 执行模式后台任务与轮询 (R2)
- **触发条件**: 测试命令预估耗时 > 30s(启发式: 用例数 > 100 或 `testTimeout` 配置值),或 Agent 运行时支持后台执行。
- **轮询**: 间隔 **5s** 拉取一次 stdout/stderr 增量,更新进度。
- **超时**: 默认 **10 分钟**,超时主动停止并生成"执行超时"诊断报告(不算成功,符合 FR1.4)。
- **不阻塞**: 后台执行期间 Agent 可继续其他工作;完成后回调生成报告。

### D10 · JSON 伴随产物结构 (FR3.1 / M3)
- **结构**: 即解析后的**统一中间模型(IM)**,字段固定:
  ```
  {
    "meta": { "projectName", "generatedAt", "command", "framework", "frameworkVersion", "environment" },
    "summary": { "total", "passed", "failed", "skipped", "passRate", "durationMs", "overallStatus" },
    "failures": [{ "name", "file", "error", "stackExcerpt" }],
    "suites": [{ "file", "cases": [{ "name", "status", "durationMs" }] }],
    "coverage": { "statements", "branches", "functions", "lines", "lowCoverageFiles": [...] },
    "appendix": { "resultFilePath", "toolVersion" }
  }
  ```
- **用途**: 既是 JSON 输出产物,也是 Markdown/HTML 渲染的统一数据源(NFR5 插件式解析器输出统一 IM,渲染层与解析层解耦)。

---

## 3. 范围边界重申 (防止 scope creep)

| 类别 | 在范围内 (本期) | 不在范围内 (后续) |
|---|---|---|
| 框架 | Vitest/Jest JSON、JUnit XML(M1)、pytest(M2) | Go test、cargo test(M4) |
| 输出 | Markdown(M1)、HTML+JSON(M3) | PDF、在线托管 |
| 模式 | 执行模式、解析模式 | 趋势对比(M4) |
| 覆盖率 | istanbul `coverage-summary.json` | lcov.info 深度解析、分支级历史 |
| 推送 | 仅返回路径+摘要到会话 | IM/邮件/Webhook(M4+,需安全评审) |
| 语言 | zh-CN(模板 i18n-ready) | en-US 双语(M4) |

---

## 4. 验收标准映射 (AC1-AC5 → 基线条款)

| AC | 依赖基线条款 | 验证方式 |
|---|---|---|
| AC1 Jest/Vitest Markdown 报告结构 | D2/D5/D10 + FR2 全部章节 | 在本仓库跑 `npx vitest run` 后生成报告,对照 4.2 章节清单 |
| AC2 失败用例含名/路径/错误 | D3 截断规则 + FR2.3 | 构造 1 个失败用例,检查失败分析章节 |
| AC3 JUnit XML 解析模式不执行 | D7 嗅探规则 + FR1.3 | 提供 sample junit.xml,验证不调用 vitest/jest 命令 |
| AC4 结果文件损坏返回明确错误 | FR1.4 + NFR2 降级 | 提供截断的 junit.xml,验证错误说明 + 无空报告 |
| AC5 覆盖率存在则呈现,不存在标注"未获取" | D1 获取规则 + FR2.5 | `coverage=off` 与 `coverage=on` 两种场景对比 |

---

## 5. 下游阶段输入契约

**propose 阶段** 应基于本基线产出:
1. Skill 结构骨架 (解析器插件接口、IM schema、渲染器接口)
2. 配置项 schema (FR4.2 表 + D6 类型固化)
3. 触发意图识别规则 (FR4.1 示例 + D7 嗅探)

**design 阶段** 应基于本基线产出:
1. 解析器插件抽象(NFR5): `IFrameworkParser { detect(file): boolean; parse(content): IntermediateModel }`
2. 渲染器抽象: `IReportRenderer { render(model, options): string }`,Markdown/HTML/JSON 三实现
3. 敏感信息过滤器(D8 规则固化)
4. 后台执行抽象(D9): `ITestRunner { run(cmd, opts): Promise<RunHandle> }`

**apply 阶段** 应基于本基线实现 M1 范围(Vitest/Jest JSON + JUnit XML + Markdown + 双模式)。

---

## 6. 风险重申与缓解 (对接 R1/R2)

| 风险 | 缓解措施 (本基线已固化) |
|---|---|
| R1 reporter 输出差异大 | D10 统一中间模型(IM)+ NFR5 插件式 `IFrameworkParser`,各框架独立解析为 IM |
| R2 测试执行耗时不可控 | D9 后台执行 + 5s 轮询 + 10min 超时 + 超时诊断报告(非空报告) |
| 新增风险 R3: 多 workspace 覆盖率合并 | F4 已识别;首期仅处理根 workspace,子 workspace 标注"未聚合",列入 M2 |
| 新增风险 R4: i18n 模板性能 | zh-CN 单字典,O(1) 查表,不影响 NFR1 |

---

**澄清基线冻结。下游阶段以本文件为 SSOT,不得偏离裁定;若需变更须经新一轮 clarify。**
