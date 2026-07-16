# 需求澄清报告：测试报告生成器 1.0

> 生成时间：2026-07-16 08:24 UTC
> 变更名称：test-report-generator
> 项目：@alipay/dtazzicloud
> 语言：zh-CN

## 一、整体评估

### 1.1 一致性检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| proposal ↔ specs 映射 | ✅ 一致 | 四份 FR spec 与四份 NFR spec 完整覆盖 proposal 中所有需求点 |
| proposal ↔ tasks 映射 | ✅ 一致 | M1~M4 里程碑分解与 proposal 的优先级划分完全对应 |
| specs ↔ design 映射 | ✅ 一致 | design 中的架构、类型、数据流与 specs 中的功能定义吻合 |
| FR 内部交叉引用 | ✅ 一致 | FR1 的执行/解析双模式与 FR4 的 `result_file` 配置项、US4 的 CI 场景一致 |
| NFR 与 FR 关系 | ✅ 一致 | NFR2 降级策略在 FR1.4、FR2（覆盖率章节）、design 错误处理中均有体现 |

### 1.2 完整性检查

| 需求点 | 覆盖状态 | 证据 |
|--------|----------|------|
| FR1.1 框架自动识别 | ✅ 完整 | `fr1-execution.md` 含优先级链，`design.md` 含 `framework-detector.ts` |
| FR1.2 首期框架 (Jest/Vitest/JUnit XML) | ✅ 完整 | specs 含三种框架，tasks 含 T1.3~T1.5 对应解析器 |
| FR1.3 执行/解析双模式 | ✅ 完整 | specs + design + tasks 均有明确双模式切换逻辑 |
| FR1.4 执行失败诊断 | ✅ 完整 | design 错误处理策略明确："返回明确诊断信息，不生成空报告" |
| FR2.1~FR2.6 报告六大章节 | ✅ 完整 | `fr2-report-content.md` 逐章定义字段来源与格式 |
| FR3.1 输出格式 | ⚠️ 部分 | P0 Markdown 完整，P1 HTML/JSON 仅有骨架，M3 为后续里程碑 |
| FR3.2 落盘路径 | ✅ 完整 | 默认路径与覆盖逻辑均已定义 |
| FR3.3 生成后返回 | ✅ 完整 | 路径 + 摘要 + 失败原因 top 3 均已定义 |
| FR4.1 触发意图 | ✅ 完整 | 三条典型意图已列出 |
| FR4.2 可配置项 | ✅ 完整 | 六个配置项均有默认值与说明 |
| NFR1 性能 | ✅ 完整 | 5s / 1000 用例，design 含流式解析策略 |
| NFR2 健壮性 | ✅ 完整 | 降级输出、try-catch 包裹 |
| NFR3 安全 | ✅ 完整 | 凭据过滤规则已定义 |
| NFR4 幂等性 | ✅ 完整 | 定义明确 |
| NFR5 可维护性 | ✅ 完整 | 插件式架构，ParserRegistry |
| AC1~AC5 验收标准 | ✅ 完整 | 五条 AC 均可在 specs 中找到对应验收点 |

## 二、发现的问题与建议

### 2.1 关键问题（需处理）

#### Q1: 覆盖率数据来源不明确
- **位置**: `coverage.ts` design 描述为"解析 vitest/c8 coverage 输出"
- **问题**: proposal 和 specs 中未明确覆盖率数据的具体来源格式。vitest 使用 `vitest run --coverage` 生成 JSON，c8 生成 `coverage/coverage-final.json`，但 Jest 的覆盖率格式（`--coverage` 输出 `coverage/` 目录）未在 design 中体现
- **建议**: 在 `design.md` 补充覆盖率解析器支持的格式清单（vitest coverage JSON、c8 JSON、istanbul JSON），并标注 Jest 覆盖率的处理方式（复用 istanbul 格式）

#### Q2: test_command 自动检测与显式指定的冲突边界
- **位置**: `fr1-execution.md` 与 `framework-detector.ts`
- **问题**: 当用户同时提供 `test_command` 和 `result_file` 时，行为未定义。按 design 的双模式逻辑，`result_file` 应优先触发解析模式，但 `test_command` 的存在可能导致歧义
- **建议**: 在 `fr1-execution.md` 补充优先级规则：`result_file` 存在 > `test_command` 存在 > 自动检测

#### Q3: pytest 解析器实现方案不一致
- **位置**: `tasks.md` T2.1 描述为 `parsers/pytest-junit.ts`，解析 pytest 生成的 JUnit XML
- **问题**: 若 pytest 已输出 JUnit XML，则 T2.1 与 T1.3 (JUnit XML 解析器) 存在功能重叠。pytest 的 JUnit XML 格式与通用 JUnit XML 格式兼容，但 pytest 特有字段（如 `@pytest.mark.*` 标记）可能丢失
- **建议**: 明确 T2.1 是复用 T1.3 的 JUnit XML 解析器 + 扩展 pytest 特有字段映射，还是完全独立的解析器

#### Q4: 报告语言模板未决策
- **位置**: 提案 "开放问题 Q2" 未关闭
- **问题**: 报告章节标题、字段标签（如 "通过率"、"未获取"）的语言未确定。specs 中所有章节标题为中文，但 design 中 TypeScript 类型、代码注释为英文
- **建议**: 决策后写入 `proposal.md`。基于当前 specs 中文标题的事实，建议默认中文模板，P1 支持英文模板切换

#### Q5: 首期项目栈确认
- **位置**: 提案 "开放问题 Q1" 未关闭
- **问题**: 提案假设以 TypeScript/Node 为主，但未明确排除 Python 项目。当前 specs 中 FR1.2 将 pytest 列为 P1，但 CI 场景（US4）的 JUnit XML 解析可覆盖任何语言
- **建议**: 在 `proposal.md` 明确决策：首期 M1 仅 TS/Node 项目，JUnit XML 作为跨语言兜底；Python 项目仅解析模式可用（通过 JUnit XML），执行模式延后至 M2

### 2.2 次要问题（建议优化）

#### Q6: 超 200 条用例截断策略不完整
- **位置**: `fr2-report-content.md` 用例明细章节
- **问题**: 仅说明"截断并注明"，未说明截断方式（保留前 200？按文件分组各保留 N 条？）
- **建议**: 明确截断策略：按文件分组，每组保留前 50 条，总条目不超过 200，注明实际总数

#### Q7: 时区处理未定义
- **位置**: `fr2-report-content.md` 报告头 "生成时间"
- **问题**: 生成时间使用 UTC 还是本地时区？文件名中的时间戳（`YYYYMMDD-HHmmss`）与报告内容中的时间戳是否一致？
- **建议**: 统一使用本地时区，并在报告头注明时区偏移

#### Q8: 并发安全
- **位置**: NFR 未覆盖
- **问题**: 默认输出路径含时间戳，天然避免并发冲突。但用户指定固定路径时，并发执行可能覆盖
- **建议**: 在 NFR 中补充说明：用户指定固定路径时不保证并发安全，建议使用时间戳后缀

### 2.3 潜在风险

#### R1: 外部依赖执行风险
- 测试执行阶段依赖 Node.js 运行时和 npm/npx 可用性，若 Agent 运行环境无 Node.js，执行模式将失败
- **缓解**: 已有 FR1.4 诊断机制，且解析模式可绕过此限制

#### R2: 大文件解析性能
- JUnit XML 文件可能包含数千条用例，内存解析可能超出 NFR1 的 5 秒限制
- **缓解**: design 中提及"流式解析"，但未在 tasks 中体现具体实现

## 三、建议的 artifact 更新

| 文件 | 更新内容 | 优先级 |
|------|----------|--------|
| `proposal.md` | 关闭 Q1（首期 TS/Node 为主）、Q2（默认中文模板） | 高 |
| `design.md` | 补充覆盖率格式清单、补充 `result_file` 与 `test_command` 优先级 | 高 |
| `fr1-execution.md` | 补充 `result_file` > `test_command` > 自动检测 的优先级规则 | 高 |
| `tasks.md` | 明确 T2.1 与 T1.3 的关系（复用/独立） | 中 |
| `fr2-report-content.md` | 补充截断策略细节、时区说明 | 低 |
| `nfr.md` | 补充并发安全说明 | 低 |

## 四、结论

现有 artifacts 整体质量良好，proposal / specs / design / tasks 四者之间一致性高，功能需求覆盖完整。主要待处理事项为三项开放问题的决策回填和 pytest 解析器实现方案的明确化。所有问题均可在不改动现有架构的前提下，通过局部补充完成修复。

### 下一步

1. 根据本报告更新 `proposal.md` 关闭三个开放问题
2. 更新 `design.md` 补充覆盖率格式和优先级规则
3. 更新 `fr1-execution.md` 补充优先级规则
4. 确认后即可进入 `openspec-apply` 实现阶段