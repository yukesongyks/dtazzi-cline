# kanban支持对话持久存储能力 设计文档

> Issue: #4 - kanban支持对话持久存储能力

## 背景

Kanban 的 agent 执行记录通过 workspace state 持久化到运行时目录下的 `sessions.json`。当前用户问题是：重启 Kanban 后，历史 agent 执行记录可能无法恢复，或者在没有活跃 session 的情况下被保存为空，导致历史记录丢失。

Issue 原始描述认为根因在 `buildWorkspaceStateSnapshot` 使用重启后的空 terminal manager 覆盖磁盘 sessions。代码调查后需要修正这一点：`ensureTerminalManagerForWorkspace` 会在创建 `TerminalSessionManager` 时调用 `loadWorkspaceState(repoPath)` 并执行 `manager.hydrateFromRecord(existingWorkspace.sessions)`，因此初始 snapshot 本身并不必然丢失磁盘 sessions。更准确的风险边界是：workspace state 保存链路把客户端传入的 `sessions` 当作完整事实源写回磁盘，任何空视图、旧视图或竞争窗口内的保存请求，都可能把 `sessions.json` 全量替换成空或过期内容。

## 根因分析

### 复现与现象

可验证场景如下：

1. 某 workspace 已经存在至少一条 persisted session，磁盘上 `sessions.json` 非空。
2. Kanban 重启，前端或其他客户端在 session state 尚未完整恢复、或持有空 `sessions` 的情况下触发 `workspace.saveState`。
3. 服务端 `saveState` 将传入 payload 的 `sessions` 写入 `saveWorkspaceState`。
4. `saveWorkspaceState` 以全量替换方式写入 `sessions.json`。
5. 再次加载 workspace state 时，历史 session 已经被覆盖为空或覆盖为旧版本。

### 数据流追溯

- 持久化文件：`src/state/workspace-state.ts` 使用 `SESSIONS_FILENAME = "sessions.json"`，`loadWorkspaceState` 读取 board、sessions、meta 后组装 `RuntimeWorkspaceStateResponse`。
- 全量写入点：`saveWorkspaceState` 在 `src/state/workspace-state.ts` 中直接使用 `parsedPayload.sessions` 写入 `getWorkspaceSessionsPath(context.workspaceId)`，没有与当前磁盘 sessions 合并。
- TRPC 保存入口：`src/trpc/workspace-api.ts` 的 `saveState` 在保存前把 `terminalManager.listSummaries()` 合并到 `input.sessions`，但仍以 `input.sessions` 为基础。如果 `terminalManager` 没有相关记录，或者客户端 payload 已经丢失历史条目，服务端不会保留磁盘原值。
- 前端保存入口：`web-ui/src/runtime/use-workspace-persistence.ts` 仅在 board 变更时保存，但 payload 包含 `sessions: sessionsRef.current`。这使 board 持久化和 session 持久化耦合，board 的正常保存可能意外携带一个不完整 session 集合。
- 前端同步逻辑：`web-ui/src/runtime/use-runtime-state-stream.ts` 和 `web-ui/src/hooks/use-workspace-sync.ts` 都倾向于按 `updatedAt` 合并较新的 session summary，能缓解 UI 层短暂空更新，但无法阻止服务端持久化全量覆盖。

### 模式分析

正常工作的模式已经存在于 shutdown cleanup：`src/server/shutdown-coordinator.ts` 先加载当前 `workspaceState.sessions`，再只覆盖被中断 task 的 summary，其余 session 原样保留。这说明 session 更新更适合采用“以磁盘已有记录为基线，按 taskId 覆盖新增/更新 summary”的 merge 语义，而不是无条件全量替换。

### 根因结论

根因不是单一的 snapshot load 逻辑，而是 session 持久化的 ownership 边界不清晰：board state 可以由客户端全量保存，但 session history 是运行时事实和磁盘历史的合并结果，不应被客户端空 payload 全量清空。修复应把 sessions 的保护放到服务端持久化边界，前端保存语义作为配套收敛。

## 修复策略

### 推荐修复方向

在服务端保存边界保证 session 合并语义：

- `workspace.saveState` 或 `saveWorkspaceState` 保存 sessions 前，先读取当前磁盘 sessions。
- 以当前磁盘 sessions 为基线，合并客户端 payload sessions 和 live terminal summaries。
- 同一 `taskId` 冲突时采用明确规则：优先使用 `updatedAt` 较新的 summary；live terminal summary 代表当前进程状态，可在时间相同或更可信时覆盖。
- 除非后续引入显式删除 session 的 API，否则普通 workspace state save 不应删除 payload 中缺失的历史 session。

选择理由：

- 根因位于持久化边界，服务端保护能覆盖所有客户端、stream、race 和未来调用方。
- 改动范围集中，避免依赖前端始终持有完整 session map。
- 与 shutdown coordinator 的“基于当前 state 保留并局部覆盖”模式一致。

### 备选方向

备选一：只修改前端 `useWorkspacePersistence`，让 board save 不再提交 sessions，或者确保提交前 sessions 永远完整。优点是对现有 storage API 影响小；缺点是无法保护其他调用方，也无法彻底解决服务端全量覆盖的脆弱语义。

备选二：拆分 API，新增独立的 board save 和 session save/mutate 接口。优点是长期边界更清楚；缺点是改动更大，涉及 contract、前端 hook、测试和兼容迁移。本 issue 可以先用服务端 merge 修复缺陷，后续再评估是否拆 API。

## 影响分析

### 影响范围

- `src/trpc/workspace-api.ts`：`saveState` 当前会把 live summaries 写入 `input.sessions` 后调用 storage，推荐在这里或下层 storage 统一合并。
- `src/state/workspace-state.ts`：`saveWorkspaceState` 当前全量覆盖 `sessions.json`，如果在 storage 层修复，需要调整保存逻辑并补充冲突测试。
- `src/server/workspace-registry.ts`：`buildWorkspaceStateSnapshot` 当前加载磁盘 state 后合并 terminal manager summaries，需验证新逻辑不会破坏 snapshot 语义。
- `web-ui/src/runtime/use-workspace-persistence.ts`：当前 board 持久化携带 sessions，可作为后续配套优化，降低客户端空 sessions 写入风险。
- 测试：需要覆盖 storage integration、TRPC saveState、runtime state stream 重启/空 payload 场景。

### 风险评估

- 数据库 schema 变更：低风险。无数据库，无 DDL，无数据迁移。
- 外部 API/第三方系统变更：低风险。仅内部 TRPC/storage 行为。
- 配置变更：低风险。无需新增配置或重启策略。
- 并发/幂等问题：中风险。`saveWorkspaceState` 已有 workspace directory lock 和 revision conflict，但 session merge 需要在 lock 内读取当前 sessions，避免读写窗口。
- 现有功能回归：中风险。若 merge 规则不支持删除 session，未来“清空历史”的行为需要显式 API；当前未发现这种需求。
- 回滚能力：低风险。代码可回滚；数据层修复主要是防止丢失，不做破坏性迁移。
- 数据不一致窗口期：中风险。前端空 payload 与 live summaries 并发保存时，要靠服务端 merge 和 revision 保护兜底。

综合风险评级：中风险。主要风险集中在 session merge 规则和并发保存语义。

## 测试方案

### 1. 单元测试

- 测试目标：session merge 规则。建议抽取小工具函数，例如 `mergeWorkspaceSessionSummaries(current, incoming, live)`。
- 正常路径：
  - 当前磁盘包含 `task-a`，payload 包含 `task-b`，保存后同时保留 `task-a` 和 `task-b`。
  - 当前磁盘包含旧 `task-a`，payload 或 live 包含更新的 `task-a`，保存后使用 `updatedAt` 较新的 summary。
  - live terminal summary 与 payload 同 taskId 时，明确验证优先级符合设计。
- 边界值：
  - payload sessions 为空，当前磁盘 sessions 非空，保存后磁盘 sessions 仍非空。
  - 当前磁盘为空，payload 非空，保存后正常写入。
  - `updatedAt` 相等时采用稳定、可预测的优先级。
- 异常路径：
  - malformed `sessions.json` 继续抛出当前 schema 错误，不静默吞掉。
  - stale `expectedRevision` 仍抛出 `WorkspaceStateConflictError`。

### 2. 集成测试

- 测试目标：`saveWorkspaceState` 或 `workspace.saveState` 不会用空 sessions 覆盖历史记录。
- 测试数据准备：
  - 使用临时 home 和临时 git repo。
  - 先保存包含 `persisted-task` 的 workspace state。
  - 再模拟一次 board-only save，payload sessions 为空。
- 用例列表：
  - 调用 storage save 后重新 `loadWorkspaceState`，断言 `persisted-task` 仍存在。
  - 调用 TRPC `workspace.saveState`，mock terminal manager `listSummaries()` 返回空，断言磁盘历史仍存在。
  - mock terminal manager 返回 `live-task`，断言保存后同时存在历史 task 和 live task。

### 3. 手工验证步骤

前置条件：

- 本地启动 Kanban。
- 选择一个 workspace，创建并运行一次 agent 任务，让任务出现在 agent 执行记录中。

验证步骤：

1. 确认运行时目录对应 workspace 的 `sessions.json` 非空。
2. 退出并重启 Kanban。
3. 打开同一 workspace。
4. 观察 agent 历史执行记录仍可见。
5. 执行一次只改 board 的操作，例如移动卡片或调整任务状态。
6. 再次查看 `sessions.json`，确认历史 session 条目未被清空。
7. 再次重启 Kanban，确认历史记录仍可恢复。

### 4. 回归测试范围

- Workspace board 持久化：拖拽卡片、创建任务、删除任务、刷新后状态保持。
- Runtime state stream：初始 snapshot、workspace_state_updated、task_sessions_updated 都能正确合并 session。
- Shutdown cleanup：运行中和待 review 的 session 仍会在关闭时标记 interrupted，并保留已有历史。
- Revision conflict：多窗口或过期 revision 保存仍能触发冲突并 refetch。

## 验收标准

- 重启 Kanban 后，之前保存的 agent 执行记录能够正确恢复。
- 没有活跃 terminal session 时，历史 session 记录不会被空 payload 或空 live summary 覆盖。
- board-only 保存不会删除 `sessions.json` 中客户端 payload 缺失的历史 session。
- live terminal summary 仍能覆盖同 taskId 的旧 summary，使运行中状态保持最新。
- 自动化测试覆盖空 sessions payload、live summary 合并、revision conflict 保持原行为。

## 工作量估算

复杂度：中等。

预计工作量：1-2 人天。

- 0.5 天：抽取/实现 session merge 规则，放入服务端保存边界。
- 0.5 天：补充 storage/TRPC 集成测试。
- 0.5 天：手工验证重启恢复、board-only save、shutdown cleanup 回归。
- 预留 0.5 天：处理前端保存语义收敛或测试环境中 runtime state stream 的 race 问题。

## Issue 完整度分析

- [x] 背景描述 - 已说明用户问题和现象，但原始根因描述需要按代码证据修正。
- [x] 目标定义 - 目标可观测：重启后历史记录可恢复，空活跃 session 不清空历史。
- [x] 技术方案 - 已补充推荐方案、备选方案、冲突合并规则和持久化边界。
- [x] 影响范围 - 已列出 storage、TRPC、workspace registry、前端 persistence、测试范围。
- [x] 验收标准 - 已补充 board-only save、live summary 覆盖、自动化测试要求。
- [x] 测试方案 - 已细化单元、集成、手工、回归测试。
- [x] 工作量估算 - 中等复杂度，1-2 人天。
- [x] 范围边界 - 本 issue 修复持久化保护，不引入完整历史删除 API，不重构全部 workspace state API。
- [x] 依赖关系 - 依赖现有 workspace state lock、revision、terminal manager summary schema。
- [x] 风险分析 - 并发/幂等和回归风险为中，其余为低。
- [x] 回滚方案 - 代码可回滚；若上线后发现 merge 规则异常，可回退到旧保存逻辑，但需先备份受影响 workspace 的 `sessions.json`。

### 优先级

1. 必须补充：服务端 session merge 规则及对应测试。
2. 强烈建议：收敛前端 board save 携带 sessions 的语义，避免无关保存继续扩大风险窗口。
3. 锦上添花：后续拆分 board/session 保存 API，并设计显式 session 删除能力。

