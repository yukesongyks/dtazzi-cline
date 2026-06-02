# feat(agent): 支持启动 Kimi Code CLI 作为 runtime agent 实现计划

> **Issue:** #3 | **链接:** https://code.alipay.com/yukesong.yks/dtazzi-cline/issues/3
> **生成时间:** 2026-05-18
> **最后更新:** 2026-05-19
> **状态:** 已实现，并根据联调问题补充 Kimi CLI 交互启动、hooks 合并、输入发送时机修复

**目标:** 在 Kanban 中注册 Kimi Code CLI 作为 runtime agent，用户可在 Settings、Task 创建、Onboarding 中选择 Kimi，并能够创建任务、持续查看执行记录、任务完成后继续对话。

**当前实现方案:** 按现有 agent 注册模式新增 `kimi`，并使用交互式 Kimi CLI 启动。Kanban 不再通过 `--prompt` 或命令行位置参数传入任务，而是在 Kimi 输入区真正出现后，通过 bracketed paste 延迟发送任务内容，避免 Kimi 先执行完再进入 CLI、无法继续对话、日志丢失或循环执行的问题。

---

## 当前行为

- Agent ID: `kimi`
- 展示名称: `Kimi Code CLI`
- CLI binary: `kimi`
- 默认参数: `[]`
- 自动模式参数: `--afk`
- 兼容用户手动配置的自动参数: 如果用户参数已包含 `--afk` 或 `--yolo`，不会重复追加 `--afk`
- 继续会话参数: `--continue`
- 计划模式参数: `--plan`
- hooks 配置文件: `~/.cline/kanban/hooks/kimi/config.toml`
- Kimi 用户配置来源: `~/.kimi/config.toml`
- Kimi 启动时额外注入: `--config-file ~/.cline/kanban/hooks/kimi/config.toml`
- 任务 prompt 注入方式: `deferredStartupInput` + bracketed paste + `\r`

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts` | `RuntimeAgentId` 枚举加入 `"kimi"` |
| Modify | `src/core/agent-catalog.ts` | `RUNTIME_AGENT_CATALOG` 加 Kimi 条目，`RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS` 加 `"kimi"` |
| Modify | `src/config/runtime-config.ts` | 自动选择、agent ID normalize 支持 Kimi |
| Modify | `src/prompts/append-system-prompt.ts` | Kimi 支持 append system prompt 与 Linear MCP 引导 |
| Modify | `web-ui/src/components/runtime-settings-dialog.tsx` | Settings Agent 顺序加入 Kimi |
| Modify | `web-ui/src/components/task-start-agent-onboarding-carousel.tsx` | Onboarding agent 列表加入 Kimi |
| Modify | `src/terminal/agent-session-adapters.ts` | 新增 `kimiAdapter`，生成 hooks 配置，使用 deferred startup input 发送任务 |
| Modify | `src/terminal/session-manager.ts` | 检测 Kimi 输入区出现后延迟发送任务内容，支持分片输出检测 |
| Modify | `test/runtime/terminal/agent-registry.test.ts` | 更新 agent registry 期望 |
| Modify | `test/runtime/terminal/agent-session-adapters.test.ts` | 覆盖 Kimi adapter、hooks merge、参数与 deferred input |
| Modify | `test/runtime/terminal/session-manager-auto-restart.test.ts` | 覆盖 Kimi 输入发送时机、clean exit 不自动重启 |

---

## Task 1: Schema 与 Catalog 注册

**Files:**
- `src/core/api-contract.ts`
- `src/core/agent-catalog.ts`

- [x] 在 `runtimeAgentIdSchema` 中加入 `"kimi"`
- [x] 在 `RUNTIME_AGENT_CATALOG` 中加入 Kimi 条目
- [x] 在 `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS` 中加入 `"kimi"`
- [x] 将 Kimi 自动模式参数定义为 `["--afk"]`

当前 Kimi catalog 行为:

```typescript
{
	id: "kimi",
	label: "Kimi Code CLI",
	binary: "kimi",
	baseArgs: [],
	autonomousArgs: ["--afk"],
	installUrl: "https://github.com/MoonshotAI/kimi-cli",
}
```

---

## Task 2: Kimi Adapter 实现

**Files:**
- `src/terminal/agent-session-adapters.ts`

- [x] 实现 `kimiAdapter`
- [x] 支持 `--afk`
- [x] 支持 `--continue`
- [x] 支持 `--plan`
- [x] 支持 `--config-file`
- [x] 使用 `deferredStartupInput` 发送任务 prompt
- [x] 不再使用 `--prompt`
- [x] 不再把 prompt 作为普通 CLI 参数传给 Kimi

关键实现:

```typescript
if (input.autonomousModeEnabled && !hasCliOption(args, "--afk") && !hasCliOption(args, "--yolo")) {
	args.push("--afk");
}

if (input.resumeFromTrash && !hasCliOption(args, "--continue")) {
	args.push("--continue");
}

if (input.startInPlanMode) {
	args.push("--plan");
}

return {
	args,
	env,
	deferredStartupInput: input.prompt.trim() ? toBracketedPasteSubmission(input.prompt.trim()) : undefined,
};
```

说明:

- 之前使用 `--prompt` 会让 Kimi 以一次性 prompt 模式执行，完成后直接退出，导致无法继续对话。
- 现在先启动完整交互式 CLI，再等待输入区出现后发送任务内容。
- `toBracketedPasteSubmission` 会生成 `\u001b[200~... \u001b[201~\r`，减少多行 prompt 被终端错误解释的风险。

---

## Task 3: Kimi hooks 配置

**Files:**
- `src/terminal/agent-session-adapters.ts`

- [x] 生成 Kanban 管理的 Kimi hooks
- [x] 写入 `~/.cline/kanban/hooks/kimi/config.toml`
- [x] 读取并合并用户原有 `~/.kimi/config.toml`
- [x] 保留用户已有 hooks
- [x] 清理旧的 Kanban-managed hooks，避免重复注入
- [x] 保证最终 TOML 中只有一个顶层 `hooks = [...]`
- [x] 启动 Kimi 时追加 `--config-file <kanban config>`

当前 hooks 使用 Kimi 支持的顶层数组写法:

```toml
# Kanban-managed hooks for Kimi Code CLI
hooks = [
	{ event = "Stop", command = "..." },
	{ event = "PreToolUse", command = "..." },
	{ event = "PreToolUse", command = "..." },
	{ event = "PostToolUse", command = "..." },
	{ event = "Notification", matcher = "permission_prompt", command = "..." },
	{ event = "SessionStart", command = "..." },
]
```

修复背景:

- 初版用多个 `[[hooks]]` 片段追加配置，和用户已有 `hooks = [...]` 混用时会触发 `Key "hooks" already exists`。
- 当前实现会先解析顶层 `hooks = [...]` 范围，再把 Kanban hooks 插入同一个数组。
- 如果历史配置中已有 Kanban marker，会先移除旧的 Kanban hooks，再写入新的 hooks，避免重复和脏配置。

---

## Task 4: 终端输入发送时机

**Files:**
- `src/terminal/session-manager.ts`

- [x] Kimi 不在进程启动后立刻发送任务 prompt
- [x] 只在真实输入区出现后发送任务 prompt
- [x] 输入区检测支持 `_ input`、`── input` 等形态
- [x] 输入区检测支持输出被拆成多个 chunk
- [x] 检测命中后延迟 750ms 再发送，避免 UI 尚未完成初始化
- [x] 发送后清空 `deferredStartupInput`，避免重复发送、循环执行

当前检测逻辑:

```typescript
function hasKimiStartupInputReady(text: string): boolean {
	const stripped = stripAnsi(text).toLowerCase();
	return /(?:^|[\n\r])\s*(?:[_▁-]+|─+)\s*input\b/u.test(stripped);
}
```

当前缓冲逻辑:

```typescript
entry.active.startupInputBuffer += data;
if (entry.active.startupInputBuffer.length > MAX_STARTUP_INPUT_BUFFER_CHARS) {
	entry.active.startupInputBuffer = entry.active.startupInputBuffer.slice(-MAX_STARTUP_INPUT_BUFFER_CHARS);
}
if (hasKimiStartupInputReady(entry.active.startupInputBuffer)) {
	entry.active.startupInputBuffer = null;
	setTimeout(() => {
		this.trySendDeferredStartupInput(request.taskId, "kimi");
	}, 750);
}
```

修复背景:

- 只看单次 `data` chunk 时，`_ in` 和 `put` 分开输出会导致永远检测不到输入区。
- 把欢迎语当成 ready 会过早发送，Kimi 还没进入输入区，任务不会真正执行。
- 底部 `afk agent / context` 状态行抖动属于 Kimi CLI 自己的 live status line 更新，不是 Kanban 重复刷新。

---

## Task 5: clean exit 与继续对话

**Files:**
- `src/terminal/session-manager.ts`
- `test/runtime/terminal/session-manager-auto-restart.test.ts`

- [x] 移除 Kimi prompt-mode clean exit 后的自动 resume 逻辑
- [x] interactive clean exit 后不再自动重启 Kimi
- [x] 任务完成后依赖 Kimi 交互会话保持可用，从源头支持继续对话

修复背景:

- 初版为了解决 `--prompt` 执行后退出，加入了 clean exit 后自动 resume。
- 改为交互式启动后，自动 resume 反而会导致执行记录消失、重复启动、循环执行。
- 当前逻辑删除 `getKimiPromptExitResumeRequest` / `scheduleKimiPromptExitResume` 相关路径。

---

## Task 6: 配置与 Prompt 适配

**Files:**
- `src/config/runtime-config.ts`
- `src/prompts/append-system-prompt.ts`

- [x] `normalizeAgentId` 支持 `"kimi"`
- [x] `AUTO_SELECT_AGENT_PRIORITY` 支持 `"kimi"`
- [x] `APPEND_PROMPT_AGENT_IDS` 支持 `"kimi"`
- [x] `renderLinearSetupGuidanceForAgent` 支持 Kimi 的 Linear MCP 引导

---

## Task 7: 前端 UI 展示

**Files:**
- `web-ui/src/components/runtime-settings-dialog.tsx`
- `web-ui/src/components/task-start-agent-onboarding-carousel.tsx`

- [x] `SETTINGS_AGENT_ORDER` 加入 `"kimi"`
- [x] `ONBOARDING_AGENT_IDS` 加入 `"kimi"`
- [x] Settings 中可选择 `Kimi Code CLI`
- [x] 创建任务和 onboarding 流程中可选择 Kimi

---

## Task 8: 测试更新

**Files:**
- `test/runtime/terminal/agent-registry.test.ts`
- `test/runtime/terminal/agent-session-adapters.test.ts`
- `test/runtime/terminal/session-manager-auto-restart.test.ts`

- [x] 更新 agent registry 期望列表
- [x] 覆盖 Kimi `--afk` / `--continue` / `--plan`
- [x] 覆盖 Kimi 不使用 `--prompt`
- [x] 覆盖 Kimi prompt 进入 `deferredStartupInput`
- [x] 覆盖 Kimi hooks config 写入
- [x] 覆盖用户 `~/.kimi/config.toml` 合并
- [x] 覆盖旧 Kanban hooks 清理
- [x] 覆盖 inline `hooks = [...]` 中只替换 Kanban hooks、保留 user hooks
- [x] 覆盖 Kimi 输入区出现后延迟发送 prompt
- [x] 覆盖 Kimi 输入区分片输出场景
- [x] 覆盖 interactive clean exit 不自动 resume

---

## 验证方案

自动化验证:

```bash
npm test -- --run test/runtime/terminal/agent-session-adapters.test.ts test/runtime/terminal/session-manager-auto-restart.test.ts
npm run typecheck
```

已验证结果:

- `Test Files 82 passed (82)`
- `Tests 1150 passed (1150)`
- `tsc -p tsconfig.json --noEmit` 通过

手工验证:

1. 启动 Kanban dev server: `npm run dev:full`
2. Settings -> Agent 列表可见 `Kimi Code CLI`
3. 选择 Kimi 为默认 agent 后保存成功
4. 创建 task，Agent 下拉可选 `Kimi Code CLI`
5. Kimi 任务启动后先显示完整欢迎页和输入区
6. 输入区出现后，Kanban 自动发送任务 prompt
7. 任务执行记录持续显示，不因 clean exit 自动重启丢失日志
8. 任务完成后仍可继续在同一个 Kimi 交互会话中对话
9. `~/.cline/kanban/hooks/kimi/config.toml` 中只有一个顶层 `hooks = [...]`
10. 用户 `~/.kimi/config.toml` 中已有配置和 hooks 被保留
11. 回归 Claude Code / Codex / Cline / Droid / Kiro 启动正常

---

## 关联提交

- `da1725d` PullRequest: 4 feat(agent): add Kimi Code CLI as runtime agent (#3)
- `6b71ef9` fix(agent): stabilize kimi cli sessions
- `ec227fb` fix(agent): start kimi in interactive mode
- `2707b8b` fix(agent): stabilize kimi startup and hooks merge
