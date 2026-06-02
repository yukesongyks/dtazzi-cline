# Settings - Agent 管理功能增强 设计文档

> Issue: #7 — Settings - Agent 管理功能增强

## 背景

当前 Kanban 的 Settings 中，Agent 配置本质上仍是“从固定 catalog 中选择一个当前 agent”：

- 后端配置仅持久化 `selectedAgentId`
- `agents` 列表由 `src/terminal/agent-registry.ts` 根据固定 catalog 和 PATH 检测结果动态生成
- 设置页 `web-ui/src/components/runtime-settings-dialog.tsx` 也是单选 UI，而非支持 CRUD 的实例列表

这使得以下用户需求无法表达：

- 删除不常用的内置 Agent
- 为 Agent 配置别名并在 UI 中展示
- 添加多个同类型 Agent 实例（例如多个 Claude Code）
- 为不同实例配置不同启动 command

这个需求现在要做，原因很直接：用户已经开始实际使用多套模型/多套 endpoint/多条命令入口来运行同一种 CLI，现有“按 agent 类型单选”的配置模型已经无法承载个性化使用场景。

## 目标

目标是把 Agent 设置从“固定 catalog 单选”升级为“用户可管理的 Agent 实例列表”。

成功标准：

- 用户可以在 Settings 中删除不需要的 Agent 实例
- 用户可以为实例填写别名，并在 Agent 列表中优先展示别名
- 用户可以新增自定义 Agent 实例，类型限定为当前支持的内置运行类型：`cline`、`claude`、`codex`、`kimi`
- 每个实例可以编辑自己的启动命令
- 可以存在多个同类型实例，通过别名区分
- 现有默认 agent 选择能力仍然保留，并能从“选类型”平滑升级为“选实例”

非目标：

- 本期不扩展新的 agent 类型能力边界（如重新启用 `gemini`、`opencode`）
- 本期不设计复杂的命令模板 DSL
- 本期不处理跨机器同步、导入导出、分享配置
- 本期不改变 Cline provider settings 的专属配置模型

## 设计方案

### 方案探索

#### 方案 A：在现有 `RuntimeAgentId` 模型上打补丁

描述：
继续保留 `selectedAgentId` 作为核心配置，只额外挂一个“隐藏内置项 + alias 映射 + command 覆盖”配置。

优点：

- 初始改动看起来较小
- 对现有接口侵入较少

缺点：

- 无法自然支持多个同类型 Agent
- “别名”和“自定义 command”都会变成按 `RuntimeAgentId` 维度配置，天然只能一对一
- 删除某个内置 Agent 与默认选中状态、安装检测、展示逻辑会缠在一起
- 后续再演进到多实例时大概率要推翻重做

适用场景：

- 仅需要“隐藏某些内置 agent + 改展示名”，不需要多实例

#### 方案 B：引入“Agent 实例”配置模型

描述：
新增持久化的 `configuredAgents` 概念。每个配置项都是一个独立实例，包含：

- `id`：实例 ID（稳定唯一值）
- `type`：运行类型（`cline | claude | codex | kimi`）
- `alias`：可空别名
- `command`：启动命令
- `enabled` / 删除语义：通过实例存在与否决定

默认选中项从 `selectedAgentId` 升级为 `selectedAgentInstanceId`；返回给前端的 `agents` 列表也从“catalog 推导”升级为“实例视图”。

优点：

- 原生支持多个同类型 Agent
- 删除、添加、编辑、默认选择的语义统一
- alias 与 command 都有明确归属
- UI 和运行时最终都围绕“实例”而不是“类型”工作，更符合用户心智

缺点：

- 需要升级配置 schema、TRPC contract、设置页和启动解析
- 需要设计从旧配置到新配置的兼容/迁移策略

适用场景：

- 需要支持多实例、自定义命令、别名、删除等完整管理能力

#### 推荐方案

推荐采用 **方案 B：Agent 实例模型**。

理由：

- issue 的核心价值不只是“展示 alias”，而是“让用户真正管理 agent 实例”
- 多个同名 Agent 是硬需求，方案 A 无法真正满足
- 从架构上看，启动 command 本来就应该绑定在“一个可启动实例”上，而不是绑定在抽象类型上

已确认决策：

- 2026-05-21：用户确认采用 **方案 B（Agent 实例模型）** 作为正式设计基线
- 2026-05-21：用户确认 **最后一个 Agent 实例不允许删除**

### 架构与接口

#### 1. 配置模型升级

当前：

- `RuntimeConfigState.selectedAgentId`
- `RuntimeConfigResponse.agents: RuntimeAgentDefinition[]`

建议升级为：

- 保留 `selectedAgentId` 作为兼容字段一个过渡版本，内部逐步切到 `selectedAgentInstanceId`
- 新增 `configuredAgents`（持久化）
- `agents` 响应改为面向 UI 的实例列表

建议的数据结构：

```ts
type RuntimeConfigurableAgentType = "cline" | "claude" | "codex" | "kimi";

interface RuntimeConfiguredAgent {
  id: string;
  type: RuntimeConfigurableAgentType;
  alias: string | null;
  command: string;
}
```

建议返回结构扩展：

```ts
interface RuntimeAgentDefinition {
  id: string; // 实例 ID，不再等同于 RuntimeAgentId
  type: RuntimeConfigurableAgentType;
  label: string; // alias ?? catalog label
  defaultLabel: string; // catalog label
  alias: string | null;
  command: string;
  binary: string;
  installed: boolean;
  configured: boolean;
  builtin: boolean;
}
```

这里最重要的设计决定是：

- `id` 改为实例 ID
- `type` 才代表 agent 类型

否则多个 Claude Code 实例在现有 `id: RuntimeAgentId` 约束下无法表达。

#### 2. 旧配置兼容

为了兼容当前用户已有配置，首次读取配置时可按以下规则归一化：

- 若旧配置中没有 `configuredAgents`
  - 根据现有 launch-supported catalog 自动生成一组默认实例
  - 每个实例的默认 command 基于 catalog 的 `binary + baseArgs (+ autonomous args 展示层处理)` 构造
- 若旧配置只有 `selectedAgentId`
  - 将其映射到对应类型的默认实例 ID

这样能保证老用户升级后仍能看到熟悉的默认列表，同时后续改动都围绕实例工作。

#### 3. 设置页 UI

当前 Settings 的 Agent 区块是单选列表。建议调整为两层结构：

- **Agent Instances 列表**
  - 展示别名或默认名
  - 展示类型徽标/类型名
  - 展示 command 摘要
  - 支持删除
  - 支持设为默认
- **Agent 编辑器**
  - 类型选择（新增时）
  - 别名输入框
  - command 输入框
  - 保存/取消
- **新增入口**
  - “Add Agent” 按钮

展示规则：

- 列表主标题显示 `alias || defaultLabel`
- 次级信息显示 `defaultLabel`
- 无 alias 时，主标题直接显示默认 label

#### 4. 启动解析

当前 `resolveAgentCommand()` 根据 `selectedAgentId` 到 catalog 查默认二进制和参数。

建议改为：

- 先通过 `selectedAgentInstanceId` 找到实例
- 直接解析实例的 `command`
- 同时保留 `type`，供后续 adapter / autonomous arg / 类型专属行为使用

这意味着 `ResolvedAgentCommand` 也要升级，至少包含：

- `agentInstanceId`
- `agentType`
- `label`
- `command`
- 解析后的 `binary`
- 解析后的 `args`

#### 5. 删除规则

删除不是单纯 UI 行为，必须定义联动规则：

- 如果删除的是非默认实例：直接删除
- 如果删除的是当前默认实例：
  - 若仍有其他实例，自动切换到首个可用实例
  - 若没有其他实例，阻止删除或自动保留至少一个默认实例

建议：

- 系统必须始终保证至少存在 1 个 agent 实例
- 因此“删除最后一个实例”应被禁止，并提示用户先新增其他实例或修改默认选择

已确认产品规则：

- 最后一个 Agent 实例不允许删除
- 删除按钮在仅剩一个实例时应禁用，且需要给出明确提示文案

这是本功能最关键的边界之一，否则 runtime 会落到“无默认 agent 可启动”的非法状态。

### 范围边界

- 做什么：
  - 引入 agent 实例配置模型
  - 支持 alias / add / delete / custom command
  - 支持多个同类型实例
  - 支持从实例列表中设置默认 agent

- 不做什么：
  - 不支持任意未知 agent 类型
  - 不做命令合法性沙箱和复杂实时校验
  - 不做导入导出和分享
  - 不合并 Cline provider settings 与通用 agent 实例配置

## 影响分析

### 影响范围

涉及模块：

- `src/config/runtime-config.ts`
  - 配置文件 shape、normalize、默认值、兼容逻辑
- `src/core/api-contract.ts`
  - `RuntimeAgentDefinition`、`RuntimeConfigResponse`、`RuntimeConfigSaveRequest` 需要扩展
- `src/core/agent-catalog.ts`
  - catalog 继续作为“类型元信息源”，但不再直接代表用户可见实例列表
- `src/terminal/agent-registry.ts`
  - 从“固定类型解析”改为“实例解析 + 类型元数据补充”
- `src/trpc/app-router.ts` / runtime config save 相关 runtime API
  - 保存和读取新字段
- `web-ui/src/components/runtime-settings-dialog.tsx`
  - Agent 区块重构为实例管理 UI
- 依赖 `config.agents` 或 `selectedAgentId` 的前端代码
  - 如 home sidebar、onboarding、task editor、native-agent 判断等

外部依赖：

- 无第三方 API 强依赖
- 但运行时 command 由用户自定义，系统需要面对命令不可执行、PATH 缺失、env 写法不同等宿主环境差异

### 风险评估

- 数据库 schema 变更：🟢 低
  - 无数据库，仅本地配置 JSON schema 升级
- 外部 API / 第三方系统变更：🟢 低
  - 不直接依赖外部接口变更
- 配置变更：🟡 中
  - 涉及 runtime config 文件 shape 变化，需要兼容旧配置
- 并发 / 幂等：🟡 中
  - 设置页反复保存时要保证配置归一化稳定，不生成重复实例或丢失默认选择
- 现有功能回归风险：🟡 中
  - 依赖 `selectedAgentId` / `agents[].id` 的前后端逻辑较多
- 回滚能力：🟡 中
  - 代码可回滚，但若配置已迁移为新 shape，需要兼容双读或提供降级逻辑
- 数据不一致窗口期：🟡 中
  - 若 `selectedAgentInstanceId` 指向已删除实例，会导致 UI/启动异常，需在 normalize 时兜底修复

综合评级：**中风险**

未发现必须暂停的 🔴 高风险项，但这是一个横跨 schema、runtime、UI 的中等复杂度 feature，不能只做 Settings 页表面改造。

## 测试方案

### 1. 单元测试

- 测试目标：
  - runtime config 新旧 schema 归一化
  - agent 实例列表构造
  - 默认 agent 选择与删除联动
  - command 解析逻辑

- 用例列表：
  - 正常路径：
    - 旧配置自动迁移为默认实例列表
    - 新增 Claude 实例并保存后可重新读出
    - alias 存在时 `label = alias`
    - alias 为空时 `label = defaultLabel`
    - 多个相同 `type` 的实例同时存在
  - 边界值：
    - alias 为空字符串时归一化为 `null`
    - command 前后有空白时被 trim
    - 删除当前默认实例后自动切换到其他实例
    - 仅剩一个实例时禁止删除
  - 异常路径：
    - `selectedAgentInstanceId` 指向不存在实例时回退到首个可用实例
    - 非支持类型被过滤或拒绝
    - 非法 command 配置不会导致读取配置崩溃

### 2. 集成测试

- 测试目标：
  - runtime config save / load 全链路
  - UI 保存后响应体与下次加载的一致性
  - 选中实例后实际启动命令解析正确

- 测试数据准备：
  - 准备旧版 config 文件
  - 准备包含多个同类型实例的新 config 文件
  - 准备默认实例被删除后的异常态 config 文件

- 用例列表：
  - `saveConfig` 保存新增实例后，`getConfig` 返回正确实例列表
  - 同类型双 Claude 实例保存后，两个实例都存在且 label 区分正确
  - 删除一个实例后，返回列表与选中默认实例同步更新
  - 读取旧配置时自动补全实例列表且不丢失原默认 agent

### 3. 手工验证步骤

- 前置条件：
  - 本地启动 Kanban
  - 打开任一 workspace 的 Settings

- 验证步骤：
  1. 打开 Settings，进入 Agent 管理区
     - 预期：能看到当前实例列表，而非只有固定单选
  2. 新增一个 `Claude Code` 实例，alias 填 `Claude Code Theta`，command 填自定义命令
     - 预期：保存成功，列表主标题展示 alias
  3. 再新增一个 `Claude Code` 实例，alias 填 `Claude Code KIMI`
     - 预期：两个 Claude 实例同时存在
  4. 将第二个实例设为默认并保存
     - 预期：重新打开 Settings 后默认项仍正确
  5. 删除一个非默认实例
     - 预期：删除成功，其他实例不受影响
  6. 尝试删除最后一个剩余实例
     - 预期：被阻止，并看到明确提示
  7. 从任务或 Home Agent 入口发起一次 agent 启动
     - 预期：实际使用的是当前默认实例的 command

### 4. 回归测试范围

- Settings 保存与重新打开回显
- Startup onboarding 的 agent 展示与选择
- Home sidebar 当前 agent 名称展示
- task start / home agent session 的默认 agent 选择
- native-agent readiness 判断
- Cline 专属设置页显示逻辑（仅在选中 Cline 类型实例时出现）

## 验收标准

- [ ] 用户可以从 Settings 删除非必需 Agent 实例
- [ ] Agent 列表有 alias 时展示 alias，无 alias 时展示默认名称
- [ ] 用户可以在 Settings 中新增自定义 Agent 实例，类型受支持范围限制
- [ ] 用户可以编辑实例级启动 command
- [ ] 用户可以添加多个同类型 Agent，并通过 alias 区分
- [ ] 删除当前默认实例时，系统能稳定兜底默认选择，不进入无默认 agent 状态
- [ ] 老配置升级后不会丢失当前默认 agent，且能自动迁移到实例模型

## 工作量估算

复杂度：**中等偏上**

预计工作量：**2-3 人天**

- 0.5 天：配置 schema / contract 设计与兼容策略
- 0.5-1 天：runtime-config、agent-registry、API 改造
- 0.5-1 天：Settings 页 UI 重构
- 0.5 天：测试补齐与手工回归

## Issue 完整度分析

- [x] 背景描述 - 需求背景清楚，已明确现有能力边界
- [x] 目标定义 - 已可量化，成功标准明确
- [/] 技术方案 - issue 原文未给出，本文已补充实例模型方案与备选路径
- [/] 影响范围 - issue 原文仅列了少量文件，本文已扩展到 config / contract / registry / settings / 启动链路
- [/] 验收标准 - 原文基本可用，但缺少默认实例删除兜底和旧配置兼容验收，本文已补充
- [/] 测试方案 - issue 原文无测试设计，本文已补充单元/集成/手工/回归
- [/] 工作量估算 - issue 原文无估算，本文已补充
- [/] 范围边界 - issue 原文未明确非目标，本文已补充
- [/] 依赖关系 - issue 原文未明确，本文已补充对现有 catalog/config/settings 的依赖
- [/] 风险分析 - issue 原文未覆盖 schema 兼容和默认选择联动风险，本文已补充
- [/] 回滚方案 - issue 原文未给出，建议实现阶段采用“新旧配置兼容双读一个版本”，以便代码回滚时不致配置不可读

### 优先级

1. 🔴 **必须补充**：确认是否接受“Agent 实例模型”作为正式设计基线，而不是继续沿用 `selectedAgentId` 的单类型模型
2. 🟡 **强烈建议**：删除保护的交互细节（禁用按钮、确认文案、错误提示）在计划阶段进一步细化
3. 🟢 **锦上添花**：后续可考虑导入导出、复制现有实例、命令可执行性预检查
