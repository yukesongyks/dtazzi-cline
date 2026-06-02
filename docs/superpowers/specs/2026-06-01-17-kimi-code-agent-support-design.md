# 新增 kimi-code 类型 Agent 支持 设计文档

> Issue: #17 — feat: 新增 kimi-code 类型 Agent 支持（Settings & New Task）

## 背景

dtazzi_cline 当前在 `RUNTIME_AGENT_CATALOG`（`src/core/agent-catalog.ts`）中注册了 9 种 Agent，但仅 `cline / claude / codex / kimi` 4 种属于「可配置实例」(`CONFIGURABLE_AGENT_TYPES`)。`kimi` 条目固定使用 binary=`kimi`，安装链接指向旧 Python 版仓库 `MoonshotAI/kimi-cli`。

Moonshot 官方已将 kimi-cli 重写为新的 `kimi-code`（TypeScript / Node.js，npm 包 `@moonshot-ai/kimi-code`），原 Python 仓库自 1.44.0（2026-05-13）后基本停更，新仓库正在高频迭代（最新 0.6.0，2026-05-29）。两者关键差异：

| 维度 | kimi-cli（旧·Python） | kimi-code（新·TS） |
|---|---|---|
| 运行时 | Python | Node.js ≥ 24.15.0 |
| 分发方式 | 安装脚本 / pipx / 二进制 | npm（`@moonshot-ai/kimi-code`）|
| 可执行命令 | `kimi` | `kimi`（**与旧版冲突**）|
| 数据目录 | `~/.kimi/` | `~/.kimi-code/`（可由 `KIMI_CODE_HOME` 覆盖）|
| 维护状态 | 1.44.0 起基本停更 | 官方主线，每日迭代 |

由于两者可执行文件同名、数据目录不同、能力对齐尚未完全一致，简单复用 `type:"kimi"` 会导致 Settings UI 无法辨识、hook 配置目录冲突、安装提示无法分别给出。需要引入第 5 种可配置 Agent 类型 `kimi-code`，与现有 `kimi` 并存。

## 目标

1. 新增 `kimi-code` 作为一等 Agent 类型，与 `cline / claude / codex / kimi` 并列
2. Settings → Agent Instance 页面可对 kimi-code 实例进行增删改查，与 kimi 实例互不干扰
3. New Task 创建流程可选择 kimi-code 实例并成功启动
4. 后端 / 启动层为 kimi-code 提供独立的 hook 配置目录与 user config 读取路径，避免与 kimi 串扰
5. 保留对 kimi 的完整向后兼容，旧实例配置无需迁移

可量化成功标准：
- `CONFIGURABLE_AGENT_TYPES` 长度从 4 变为 5
- 默认实例集合包含 1 个 `type:"kimi-code"` 实例
- 单元 + 集成测试全部通过，旧 kimi 测试无回归

## 设计方案

### 方案探索

**方案 A（采纳）**：新增独立 Agent ID `kimi-code`
- 改动：`runtimeAgentIdSchema`、`runtimeConfigurableAgentTypeSchema`、`CONFIGURABLE_AGENT_TYPES`、`RUNTIME_AGENT_CATALOG`、`RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS`、`isConfigurableAgentType()`、`ADAPTERS` map 各加一项；新增 `kimiCodeAdapter`
- 优点：类型安全、UI 自动渲染、与 kimi 行为完全隔离、风险可控
- 缺点：跨多文件改动，需同步测试

**方案 B（弃用）**：在现有 `kimi` 实例 command 字段填不同 binary 路径，不新增类型
- 缺点：Settings UI 无法区分两者；hook 目录 `~/.cline/kanban/hooks/kimi/` 必然冲突；`installUrl` / `label` 单一无法呈现；用户排障难度高

**方案 C（弃用）**：在 catalog 同 type 下加 sub-variant 字段
- 缺点：引入新概念，与既有 5 处扩展点（enum / catalog / config / adapter / UI）不对齐，回报低

→ 采纳方案 A

### 架构与接口

#### 类型层（`src/core/api-contract.ts`）

```typescript
export const runtimeAgentIdSchema = z.enum([
  "claude","codex","gemini","opencode","droid","kiro","cline","kimi",
  "kimi-code",   // ← 新增
  "antcc",
]);

export const runtimeConfigurableAgentTypeSchema = z.enum([
  "cline","claude","codex","kimi",
  "kimi-code",   // ← 新增
]);
```

#### Catalog（`src/core/agent-catalog.ts`）

```typescript
{
  id: "kimi-code",
  label: "Kimi Code",
  binary: "kimi",           // 同名，由用户 command 字段消歧
  baseArgs: [],
  autonomousArgs: ["--afk"], // 待预研确认 0.6.0 是否支持
  installUrl: "https://github.com/MoonshotAI/kimi-code",
}
```

并加入 `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS`。

#### Config（`src/config/runtime-agent-config.ts`）

```typescript
export const CONFIGURABLE_AGENT_TYPES: readonly RuntimeConfigurableAgentType[] = [
  "cline","claude","codex","kimi","kimi-code",
];

export function isConfigurableAgentType(value: unknown): value is RuntimeConfigurableAgentType {
  return value === "cline" || value === "claude" || value === "codex"
    || value === "kimi" || value === "kimi-code";
}
```

`createDefaultConfiguredAgents` 自动产出 5 个默认实例。

#### Adapter（`src/terminal/agent-session-adapters.ts`）

抽出工厂函数：

```typescript
function createKimiFamilyAdapter(opts: {
  hookAgentDir: "kimi" | "kimi-code";
  userConfigDir: string;  // 绝对路径，如 join(homedir(), ".kimi-code")
}): AgentSessionAdapter
```

`kimiAdapter` = `createKimiFamilyAdapter({ hookAgentDir: "kimi", userConfigDir: join(homedir(), ".kimi") })`
`kimiCodeAdapter` = `createKimiFamilyAdapter({ hookAgentDir: "kimi-code", userConfigDir: join(homedir(), ".kimi-code") })`

`ADAPTERS` map 增加键 `"kimi-code"`。

工厂内现有 `buildKimiMergedConfig` 中硬编码的 `join(homedir(), ".kimi", "config.toml")` 改为 `join(userConfigDir, "config.toml")`；`getHookAgentDirectory("kimi")` 改为 `getHookAgentDirectory(hookAgentDir)`。

#### UI（`web-ui/src/components/runtime-settings-dialog.tsx`、`task-create-dialog.tsx`）

`AgentEditorState.type` 联合类型自动扩展（来自 `RuntimeConfiguredAgent["type"]`），需要在以下位置显式覆盖文案：
- type 选择器下拉选项（如硬编码则补 `"kimi-code"`）
- 默认 alias / placeholder 文案
- 安装提示文案：kimi-code 提示 `npm i -g @moonshot-ai/kimi-code` 并要求 Node.js ≥ 24.15.0
- Settings 行显示 type 标签，避免两行长得一样

New Task 的 `TaskAgentModelPicker` 沿用 `RuntimeConfiguredAgent[]` 渲染，无需逻辑改动，但 model picker 对 cline 类的 reasoning effort 配置不适用于 kimi-code（已有逻辑只对 `type === "cline"` 显示）。

### 范围边界

**做**：
- 类型枚举 / catalog / config / adapter / UI 选择器 / 默认实例 / 测试 / 文档文案

**不做**：
- 旧 kimi 实例自动迁移到 kimi-code（用户手动新增）
- 新 hooks 协议封装（沿用 kimi-cli 的 TOML hooks 接口，假设 kimi-code 完全兼容；若实测不兼容须另立 issue）
- kimi-code ACP / Wire 模式封装
- kimi-code 版本预检 / 升级提示自动化

## 影响分析

### 涉及文件

| 文件 | 改动类型 |
|---|---|
| `src/core/api-contract.ts` | 枚举追加 |
| `src/core/agent-catalog.ts` | catalog 条目追加、launch supported 列表追加 |
| `src/config/runtime-agent-config.ts` | `CONFIGURABLE_AGENT_TYPES` / `isConfigurableAgentType` 追加 |
| `src/terminal/agent-session-adapters.ts` | 提取工厂函数，新增 `kimiCodeAdapter`，`ADAPTERS` map 追加 |
| `web-ui/src/components/runtime-settings-dialog.tsx` | type 选择器、默认文案、安装提示 |
| `web-ui/src/runtime/native-agent.ts` | 客户端类型映射（若有显式枚举）|
| `web-ui/src/components/task-create-dialog.tsx` | model picker 分支（如需）|
| `test/runtime/config/runtime-agent-config.test.ts` | 默认数 / 白名单测试 |
| `test/runtime/terminal/agent-session-adapters.test.ts` | `kimiCodeAdapter` 完整 prepare 路径 |
| `test/runtime/terminal/agent-registry.test.ts` | 新 type 校验 |
| `test/runtime/config/runtime-config.test.ts` | 序列化-反序列化 |

### 风险评估（7 项必查）

| 维度 | 等级 | 说明 |
|---|---|---|
| DB schema 变更 | 🟢 低 | 无 DB |
| 外部 API/第三方 | 🟢 低 | 仅引入新外部依赖 `@moonshot-ai/kimi-code` |
| 配置变更 | 🟡 中 | 跨版本回滚会丢弃 kimi-code 实例（被 normalize 静默过滤），需 release note 提示 |
| 并发 / 幂等 | 🟢 低 | Adapter prepare 无副作用 |
| 现有功能回归 | 🟡 中 | 默认实例数 4→5，需 grep 检查 `length === 4` 等硬编码假设 |
| 可回滚 | 🟡 中 | 代码可回滚；用户实例丢失风险见上 |
| 数据不一致 | 🟢 低 | 单机本地 JSON |

**无 🔴 高风险**。

## 测试方案

### 1. 单元测试

**`runtime-agent-config.test.ts`**
- 正常：`CONFIGURABLE_AGENT_TYPES` 长度 = 5、含 `"kimi-code"`
- 正常：`isConfigurableAgentType("kimi-code")` true；边界：`isConfigurableAgentType("kimi-cli")` false
- 正常：`createDefaultConfiguredAgents()` 返回 5 个实例，含 1 个 `type:"kimi-code"`、`id:"kimi-code"`、`command:"kimi"`
- 异常：`normalizeConfiguredAgents([{type:"kimi-code-typo"}])` 丢弃，回退默认集合

**`agent-session-adapters.test.ts`**
- autonomous → `--afk`（不重复 push）
- resumeFromTrash → `--continue`
- startInPlanMode → `--plan`
- hook context：合并配置写入 `~/.cline/kanban/hooks/kimi-code/config.toml`（**不是 kimi/**）
- user config 读取自 `~/.kimi-code/config.toml`，缺失时降级到 hooks-only
- 已存在 `--config-file` 参数时不重复注入
- 同环境 kimi + kimi-code 各自 prepare，hook 目录互不污染

**`agent-catalog.test.ts`**
- `RUNTIME_AGENT_CATALOG` 含 `id:"kimi-code"` 条目，binary=`kimi`，installUrl 指向新仓库
- `isRuntimeAgentLaunchSupported("kimi-code")` true

### 2. 集成测试

- `runtime-config.test.ts`：含 kimi 与 kimi-code 混合实例的配置序列化-反序列化
- `prepareAgentLaunch({agentId:"kimi-code",...})` 返回的 args/env/configFile 路径正确

### 3. 手工验证

前置：`npm i -g @moonshot-ai/kimi-code`，确认 `kimi --version` 输出 0.6.x；旧 Python kimi 保留在备用路径

1. Settings → Agent Instance → 新增 type=`Kimi Code`，alias `kimi-code-test`，command 填 kimi-code 绝对路径
2. 验证已安装 / 已配置徽标
3. 保留旧 `Kimi Code CLI` 实例
4. New Task → Agent 下拉显示两项；选 kimi-code 实例创建任务
5. 终端中确认 `kimi --version` 是 0.6.x；`~/.cline/kanban/hooks/kimi-code/config.toml` 存在
6. 同时启动旧 kimi 任务；确认两处 hook 目录互不覆盖
7. 删除 kimi-code 实例 → 列表消失；重启应用配置正确

### 4. 回归测试范围

- 现有 kimi 任务三种模式（autonomous / plan / resume）启动正常
- 旧版 4 实例配置文件加载无报错
- New Task 默认 Agent 仍为 cline
- 全套 `test/runtime/terminal/` 与 `test/runtime/config/` 测试通过
- grep `CONFIGURABLE_AGENT_TYPES.length` / `agents.length === 4` 等硬编码假设

## 验收标准

- [ ] Settings → Agent Instance 页面可新增、编辑、删除 kimi-code 类型实例，并校验 `kimi --version` 成功
- [ ] kimi-cli 与 kimi-code 在 Agent Instance 列表中作为独立 Agent 类型展示，每行显示 type 标签
- [ ] New Task 选择 Agent 时，下拉可见 kimi-code 实例，能成功创建并启动任务
- [ ] kimi-code Agent 启动时合并配置写入 `~/.cline/kanban/hooks/kimi-code/`、user config 读取自 `~/.kimi-code/`
- [ ] 同环境同时运行 kimi 与 kimi-code 任务，两处 hook 目录互不污染
- [ ] 现有 kimi 类型任务行为无回归（配置、历史会话、启动方式不变）
- [ ] 文档 / Settings 内联说明同步更新（标注 kimi-code 需 Node.js ≥ 24.15.0、`npm i -g @moonshot-ai/kimi-code`）
- [ ] 新增单元 + 集成测试通过；CI 全绿

## 工作量估算

- 复杂度：中等
- 估算：**1.5 人天**
  - 0.5d 后端（enum / catalog / config / adapter 工厂化 + 新 adapter）
  - 0.5d 前端（Settings 表单选项、安装提示、Task 选择器文案）
  - 0.5d 测试与手工验证

**阻塞项**：需预研 kimi-code 0.6.0 是否实现 `--afk` / `--plan` / `--continue` / `--config-file` 参数。若部分缺失，autonomous mode 等验收项需降级或加版本探测。

## 回滚方案

- 代码层：回滚相关 5 个文件的 diff
- 配置层：用户已创建的 kimi-code 实例在旧版本启动时会被 `normalizeConfiguredAgents` 静默丢弃 → release note 明示，建议用户回滚前导出配置
- 测试层：旧测试不受影响
