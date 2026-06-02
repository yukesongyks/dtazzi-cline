# 支持启动 Kimi Code CLI 作为 runtime agent 设计文档

> Issue: #3 — feat(agent): 支持启动 Kimi Code CLI 作为 runtime agent

## 背景

当前 Kanban 已支持 Claude Code / Codex / Cline / Droid / Kiro / OpenCode / Gemini 等 7 种 coding agent，但暂未支持 Moonshot AI 开源的 Kimi Code CLI。Kimi CLI 是一个终端 AI Agent，能完成代码读写、shell 执行、网页抓取等任务，使用模式与现有 agent 一致，可直接接入现有的 agent-catalog 注册机制。

关键特性：
- 二进制名：`kimi`
- 自动批准模式：`--yolo`（等同 Claude Code 的 `--dangerously-skip-permissions`）
- 会话恢复：`--continue`（恢复最近会话）
- 计划模式：`--plan`（只读规划模式）
- 无人值守模式：`--afk`（自动批准 + 自动回答问题）
- Hooks 系统（Beta）：通过 `~/.kimi/config.toml` 配置，支持 13 种生命周期事件
- 原生 ACP 支持：`kimi acp` 子命令（MVP 不涉及，留作 Future Work）
- 安装：`uv tool install kimi-cli` 或 `pip install kimi-cli`

## 目标

让用户能在 Kanban 中为 task 选择 Kimi CLI 作为执行 agent，正常启动并运行任务，包括：
- 自动模式（`--yolo`）
- 会话恢复（`--continue`）
- 计划模式（`--plan`）
- Hooks 集成（任务状态自动回调）

## 设计方案

### 方案探索

**方案 A：最小化 Gemini 镜像方案**
- 完全参照 Gemini adapter 结构，hooks 配置写 JSON settings 文件
- 优点：改动最小
- 缺点：Kimi CLI hooks 格式是 TOML（`~/.kimi/config.toml`），不是 JSON settings，与 Gemini 方式不兼容

**方案 B：Kiro 镜像方案（推荐 ✅）**
- 参照 Kiro adapter 结构：Kimi CLI 的 hooks 配置与 Kiro 的 agent config 模式最接近
- 优点：hooks 事件映射清晰，Kimi 支持 Stop/PreToolUse/PostToolUse/Notification/SessionStart 等事件，与 Kiro 的 agentSpawn/userPromptSubmit/preToolUse/postToolUse/stop 对应良好
- 缺点：需写 TOML 格式配置（非 JSON）

选择方案 B，因为 Kimi CLI 的 hooks 事件模型与 Kiro 最接近，能实现完整的状态转换。

### 架构与接口

**改动文件清单**（5 个文件）：

1. **`src/core/api-contract.ts:74`** — `runtimeAgentIdSchema` 枚举加入 `"kimi"`
2. **`src/core/agent-catalog.ts`** — `RUNTIME_AGENT_CATALOG` 增加 Kimi 条目，`RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS` 加入 `"kimi"`
3. **`src/terminal/agent-session-adapters.ts`** — `ADAPTERS` map 增加 `kimiAdapter`
4. **`web-ui/src/components/runtime-settings-dialog.tsx:98`** — `SETTINGS_AGENT_ORDER` 加入 `"kimi"`
5. **`web-ui/src/components/task-start-agent-onboarding-carousel.tsx:86`** — `ONBOARDING_AGENT_IDS` 加入 `"kimi"`

### 前端展示改动

Kimi 在前端 UI 的三个展示位置均需新增，均为纯加法操作（在现有列表末尾追加），无需新增组件：

#### 1. Settings — Agent 列表（`runtime-settings-dialog.tsx`）

- **改动**：`SETTINGS_AGENT_ORDER` 数组末尾追加 `"kimi"`
- **效果**：Settings → Agent 面板中新增 "Kimi Code CLI" 行，显示 label、binary 命令、安装状态、install 链接
- **展示内容**（由 `agent-catalog.ts` 条目 + runtime 检测自动填充）：
  - Label：`Kimi Code CLI`
  - Binary 命令行：`kimi --yolo`（autonomous 模式时显示）
  - 安装状态：`Installed` / `Not installed`（由 `agent-registry.ts` 的 `detectInstalledCommands()` 自动检测 `kimi` 是否在 PATH 上）
  - Install 链接：`https://github.com/MoonshotAI/kimi-cli`
- **选择行为**：点击 Kimi 行 → 设置 `selectedAgentId` 为 `"kimi"` → 保存后生效

#### 2. Task 创建/编辑 — Agent 下拉（`task-agent-model-picker.tsx`）

- **改动**：无需额外改动。该组件使用 `getRuntimeLaunchSupportedAgentCatalog()` 动态生成下拉选项，只要 catalog 和 supported list 中包含 `"kimi"` 即自动展示
- **效果**：创建/编辑 task 时，Agent 下拉框中出现 "Kimi Code CLI" 选项；选择 "Default" 时使用全局默认 agent，选择 Kimi 则覆盖该 task 的 agent

#### 3. Onboarding 引导流程（`task-start-agent-onboarding-carousel.tsx`）

- **改动**：`ONBOARDING_AGENT_IDS` 数组末尾追加 `"kimi"`
- **效果**：首次使用引导流程的 agent 选择步骤中新增 "Kimi Code CLI" 卡片，显示 label、安装状态、install 引导

**Catalog 条目**：
```typescript
{
  id: "kimi",
  label: "Kimi Code CLI",
  binary: "kimi",
  baseArgs: [],
  autonomousArgs: ["--yolo"],
  installUrl: "https://github.com/MoonshotAI/kimi-cli",
}
```

**Kimi Adapter 设计**：

```typescript
const kimiAdapter: AgentSessionAdapter = {
  async prepare(input) {
    const args = [...input.args];
    const env: Record<string, string | undefined> = {};

    // 自主模式：--yolo
    if (input.autonomousModeEnabled && !hasCliOption(args, "--yolo")) {
      args.push("--yolo");
    }

    // 恢复会话：--continue
    if (input.resumeFromTrash && !hasCliOption(args, "--continue")) {
      args.push("--continue");
    }

    // 计划模式：--plan
    if (input.startInPlanMode) {
      args.push("--plan");
    }

    // Hooks 配置：写入 ~/.kimi/config.toml
    const hooks = resolveHookContext(input);
    if (hooks) {
      const configPath = join(getHookAgentDirectory("kimi"), "config.toml");
      // 写入 TOML 格式的 hooks 配置
      // 事件映射：
      //   Kimi Stop        → Kanban to_review
      //   Kimi PreToolUse  → Kanban activity + to_in_progress
      //   Kimi PostToolUse → Kanban activity
      //   Kimi Notification(matcher="permission_prompt") → Kanban to_review
      //   Kimi SessionStart → Kanban to_in_progress
      await writeKimiHooksConfig(configPath, hooks);
      Object.assign(env, createHookRuntimeEnv({
        taskId: hooks.taskId,
        workspaceId: hooks.workspaceId,
      }));
      env.KIMI_CONFIG_PATH = configPath; // 如果 Kimi 支持环境变量指定配置路径
    }

    // Prompt 处理
    const trimmed = input.prompt.trim();
    if (trimmed) {
      args.push(trimmed); // Kimi CLI 接受位置参数作为初始 prompt
    }

    return { args, env };
  },
};
```

**Kimi Hooks 配置（TOML 格式）**：

Kimi CLI 通过 `~/.kimi/config.toml` 配置 hooks，格式为 `[[hooks]]` 数组：

```toml
# 任务完成时通知 Kanban
[[hooks]]
event = "Stop"
command = "<kanban-hooks-notify to_review --source kimi>"

# 工具使用前保持活跃状态
[[hooks]]
event = "PreToolUse"
command = "<kanban-hooks-notify activity --source kimi>"

[[hooks]]
event = "PreToolUse"
command = "<kanban-hooks-notify to_in_progress --source kimi>"

# 工具使用后活动通知
[[hooks]]
event = "PostToolUse"
command = "<kanban-hooks-notify activity --source kimi>"

# 权限提示时通知用户
[[hooks]]
event = "Notification"
matcher = "permission_prompt"
command = "<kanban-hooks-notify to_review --source kimi>"

# 会话开始时标记进行中
[[hooks]]
event = "SessionStart"
command = "<kanban-hooks-notify to_in_progress --source kimi>"
```

**注意事项**：
- Kimi CLI 的 hooks 配置是 `~/.kimi/config.toml`（全局配置），可能与用户已有的 hooks 配置冲突。需要调研 Kimi CLI 是否支持项目级配置或环境变量覆盖配置路径。
- 如果不支持配置路径覆盖，则需要将 Kanban hooks 追加到用户现有配置中，而非覆盖。这增加了复杂度，可能需要在 MVP 中先不考虑 hooks，后续再补。

### 范围边界
- 做什么：catalog 注册、adapter 实现（--yolo/--continue/--plan）、hooks 集成、UI 展示
- 不做什么：ACP 协议接入（Future Work）、--afk 模式、--thinking 模式、MCP 配置

## 影响分析

- **涉及模块**：api-contract（枚举扩展）、agent-catalog（注册条目）、agent-session-adapters（adapter）、runtime-settings-dialog（UI 排序）、onboarding-carousel（UI 展示）
- **无外部依赖变更**：Kimi CLI 是本地子进程，无 API 调用
- **无数据库变更**：纯枚举扩展
- **无 API 变更**：RuntimeAgentId 枚举扩展是向后兼容的
- **风险**：Kimi CLI hooks 系统为 Beta，配置格式可能变更；hooks 配置写入全局 `~/.kimi/config.toml` 可能与用户现有配置冲突

## 测试方案

### 1. 单元测试
- 测试目标：`runtimeAgentIdSchema`、`getRuntimeAgentCatalogEntry`、`isRuntimeAgentLaunchSupported`、`kimiAdapter.prepare()`
- 用例列表：
  - 正常路径：`prepare({agentId: "kimi", autonomousModeEnabled: true})` → args 包含 `--yolo`
  - 正常路径：`prepare({agentId: "kimi", resumeFromTrash: true})` → args 包含 `--continue`
  - 正常路径：`prepare({agentId: "kimi", startInPlanMode: true})` → args 包含 `--plan`
  - 边界值：`autonomousModeEnabled: false` → args 不包含 `--yolo`
  - 边界值：prompt 为空 → args 不追加 prompt
  - 异常路径：hooks 目录不可写时 adapter 不抛异常

### 2. 集成测试
- 测试目标：`buildRuntimeConfigResponse()` 包含 kimi 条目、`resolveAgentCommand()` 选中 kimi 时返回正确命令
- 测试数据准备：mock `isBinaryAvailableOnPath` 返回 true/false
- 用例列表：kimi installed=true/false 场景

### 3. 手工验证步骤
- 前置条件：安装 kimi-cli、配置 API key、启动 Kanban dev server
- 验证步骤：
  1. Settings → Agent 列表可见 "Kimi Code CLI"，状态正确
  2. 选择 Kimi → 保存成功
  3. 创建 task → Agent 下拉可选 Kimi
  4. 启动 task → 确认 kimi 进程启动
  5. 确认 `--yolo` 参数传递
  6. 确认 hooks 配置生成
  7. task 完成后状态自动转 Review

### 4. 回归测试范围
- 受影响的已有功能：其他 agent 启动、agent 选择器 UI、onboarding carousel
- 需要回归的用例：claude/codex/cline/droid/kiro 启动正常
- 回归验证方式：手工（纯加法改动，回归风险极低）

## 验收标准

- [ ] `src/core/api-contract.ts` 的 `runtimeAgentIdSchema` 加入 `"kimi"` 枚举值
- [ ] `src/core/agent-catalog.ts` 的 `RUNTIME_AGENT_CATALOG` 增加 Kimi 条目（binary=`kimi`, autonomousArgs=`["--yolo"]`, installUrl=`https://github.com/MoonshotAI/kimi-cli`）
- [ ] `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS` 加入 `"kimi"`，允许从 UI 启动
- [ ] `src/terminal/agent-session-adapters.ts` 增加 `kimiAdapter`，支持 `--yolo`/`--continue`/`--plan` 参数和 hooks 配置
- [ ] Web UI agent 选择器（Settings + Onboarding）能展示 Kimi 选项
- [ ] 本地验证：装好 kimi-cli 后，在 Kanban 创建 task 并选 Kimi，能成功启动一轮对话
- [ ] Hooks 配置正确生成，task 完成后状态自动转为 Review

## 工作量估算

- 复杂度：简单
- 工作量：0.5-1 人天
- 核心改动：5 个文件，每个文件改动量 1-50 行
- 最大风险点：Kimi CLI hooks 配置路径冲突（需调研是否支持环境变量覆盖）