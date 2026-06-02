# New Task 时 Override Agent 支持选择实例 设计文档

> Issue: #9 — New Task 时 Override Agent 支持选择实例

## 背景

Issue #7 已实现 Agent 实例模型：用户可在设置页面添加多个同名 Agent（如多个 Claude Code 实例，分别指向不同 AI 服务），每个实例有唯一 `instanceId`、别名（alias）和自定义启动命令。

当前 New Task 的 Override Agent Settings 仍按 Agent **类型**（cline/claude 等字符串）选择，在多实例场景下无法精确指定用哪一个具体实例。本 issue 是 #7 的自然延伸，将 Task 创建流程升级为选择具体 Agent 实例。

## 目标

1. New Task 的 Override Agent Settings 中，Agent 选择器展示 **实例列表**（而非类型列表）
2. 用户选择的是具体实例（`instanceId`），而非 Agent 类型字符串
3. 与 Issue #7 已有的 API Contract 保持一致（agentInstanceId 字段已存在于 RuntimeTaskSessionStartRequest）

**成功标准：**
- 下拉框展示所有已配置 Agent 实例（含别名，无别名时显示 type + 默认标签）
- 保存 Task 时 BoardCard 持久化 `selectedAgentInstanceId`
- 启动 Task 时传 `agentInstanceId`，后端 `resolveSelectedAgentInstanceId` 路由到正确实例
- 旧 Task（只有 `agentId`）兼容正常运行

## 设计方案

### 方案探索

**方案 A（推荐）：扩展 BoardCard + 升级选择器组件**

在 `BoardCard` 接口加 `agentInstanceId` 可选字段，将 `task-agent-model-picker.tsx` 改为从 `configuredAgents` 渲染实例选项。启动时优先传 `agentInstanceId`，兼顾旧 `agentId` 字段作为 fallback。

优点：改动最小、完全复用后端已有的 fallback 逻辑；
缺点：需同时维护 `agentId` + `agentInstanceId` 两个字段（过渡期）。

**方案 B：废弃 agentId，全量迁移到 agentInstanceId**

将所有 BoardCard 中的 `agentId` 替换为 `agentInstanceId`，统一数据模型。

优点：模型更干净；
缺点：需要数据迁移，影响面广，风险高，不适合当前阶段。

**结论：采用方案 A。**

### 架构与接口

**涉及文件及改动：**

| 文件 | 改动内容 |
|------|---------|
| `web-ui/src/types/board.ts` | BoardCard 接口加 `agentInstanceId?: RuntimeAgentInstanceId` |
| `web-ui/src/components/task-agent-model-picker.tsx` | 接收 `configuredAgents` 列表，渲染实例选项（别名 / type+默认标签）；选中值为 instanceId |
| `web-ui/src/hooks/use-task-editor.ts` | 加 `newTaskAgentInstanceId` 状态；onAgentInstanceChange 回调 |
| `web-ui/src/components/task-create-dialog.tsx` | 向 picker 传入 configuredAgents；处理 instanceId 选择 |
| `web-ui/src/hooks/use-task-sessions.ts` | 启动时在 payload 加 `agentInstanceId: task.agentInstanceId` |

**数据流：**
```
用户选择实例
  → use-task-editor.newTaskAgentInstanceId = instanceId
  → task-create-dialog 保存 BoardCard.agentInstanceId
  → use-task-sessions.startTaskSession({ agentInstanceId })
  → 后端 resolveSelectedAgentInstanceId() 路由到正确实例
```

**选择器 UI 逻辑：**
```
configuredAgents 非空:
  选项 = configuredAgents.map(agent => ({
    value: agent.id,
    label: agent.alias ?? `${agent.type}（默认）`
  }))
  + 头部选项："使用全局默认（不覆盖）" → value = null

configuredAgents 为空:
  禁用状态 + 提示文案："请先在设置中配置 Agent 实例"
```

### 范围边界

**做什么：**
- New Task 对话框中的 Agent 选择器改为展示实例
- BoardCard 扩展 agentInstanceId 字段
- 启动 Task 时传递 agentInstanceId

**不做什么：**
- 不迁移已有 BoardCard 数据（保留 agentId 字段，后端有 fallback）
- 不改动设置页面的 Agent 实例 CRUD（已由 #7 实现）
- 不处理 kanban board 卡片上的 agent 显示（属于另一 issue 范围）

## 影响分析

**纯前端改动，无 DB/外部 API/配置变更。**

| 风险维度 | 评级 | 说明 |
|---------|------|------|
| 数据库 schema 变更 | 🟢 低 | 无 |
| 外部 API/第三方系统 | 🟢 低 | 无 |
| 配置变更 | 🟢 低 | 无 |
| 并发/幂等 | 🟢 低 | 纯前端状态 |
| 影响现有功能 | 🟡 中 | 旧 Task（只有 agentId）需 fallback 验证 |
| 可回滚性 | 🟢 低 | revert 前端改动即可 |
| 数据不一致 | 🟢 低 | 无持久化迁移 |

**回滚方案：** revert 前端文件改动，无需 DB rollback。

## 测试方案

### 单元测试

- `task-agent-model-picker`：configuredAgents 非空时渲染实例列表（含别名）
- `task-agent-model-picker`：configuredAgents 为空时显示禁用态
- `task-agent-model-picker`：无别名实例显示 "type（默认）"
- `use-task-editor`：选中实例后 newTaskAgentInstanceId 状态更新正确
- 兼容：BoardCard 只有 agentId（无 agentInstanceId）时组件不崩溃

### 集成测试

- 预配置 2 个 Claude Code 实例（Theta / KIMI）
- 选择 Theta 实例创建 Task → 后端 resolveSelectedAgentInstanceId 返回 Theta id
- 选择 KIMI 实例创建 Task → 后端返回 KIMI id
- 不设置 override（agentInstanceId=null）→ 后端使用全局 selectedAgentInstanceId

### 手工验证步骤

1. 在设置页面配置 2 个不同别名的 Claude Code 实例
2. 打开 New Task 对话框，展开 Override Agent Settings
3. 确认 Agent 选择器展示实例列表（含别名），而非 cline/claude 类型
4. 选择 "Claude Code Theta" 实例，保存并启动 Task
5. 观察 terminal 实际启动命令（应含 Theta 的 ANTHROPIC_BASE_URL）
6. 测试不设置 override → 应使用全局默认实例

### 回归测试范围

- 无 override 的普通 Task 正常启动
- 旧 Task（只有 agentId）正常渲染和启动
- 设置页面 Agent 实例 CRUD 不受影响

## 验收标准

- [ ] Override Agent Settings 的 Agent 选择器展示所有已配置 Agent 实例
- [ ] 选择器显示实例别名（如有）或 type + 默认标签
- [ ] 保存 Task 时持久化 selectedAgentInstanceId 到 BoardCard
- [ ] 与 Issue #7 的 API Contract 一致（agentInstanceId 字段）
- [ ] 无已配置实例时，选择器降级为"使用全局默认"占位（不崩溃）
- [ ] 旧 Task（只有 agentId）兼容正常运行

## 工作量估算

**复杂度：简单**
**估算：1-2 人天**

后端基础设施已完全就绪（api-contract.ts、runtime-api.ts），主要工作量在前端 5 个文件的改造，逻辑直接，无需新的设计决策。
