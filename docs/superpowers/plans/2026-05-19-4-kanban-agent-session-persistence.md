# kanban支持对话持久存储能力 实现计划

> **Issue:** #4 | **链接:** https://code.alipay.com/antchain_efficiency/dtazzi_cline/issues/4
> **生成时间:** 2026-05-19
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 修复 workspace state 保存时历史 agent session 被空 payload 或旧 payload 覆盖的问题，确保 Kanban 重启后能恢复 agent 执行记录。

**技术方案:** 在 `saveWorkspaceState` 的 workspace directory lock 内读取当前磁盘 sessions，把当前磁盘 sessions 作为基线，再按 `taskId` 合并 payload sessions；同一 task 使用 `updatedAt` 较新的 summary，时间相同时 payload 覆盖，确保 live terminal summary 经 `workspace.saveState` 注入后能刷新旧记录。保留现有 revision conflict、schema validation、atomic write 行为。

**预估工作量:** 中等，0.5-1 人天。

---

## 代码探索结论

- 技术栈：TypeScript ESM + Vitest，包管理与测试命令使用 npm。
- 存储入口：`src/state/workspace-state.ts:647-685` 的 `saveWorkspaceState` 当前把 `parsedPayload.sessions` 全量写入 `sessions.json`。
- 目录锁：`saveWorkspaceState` 已在 `lockedFileSystem.withLock(getWorkspaceDirectoryLockRequest(...))` 内执行 revision 检查和写文件，session merge 必须在这个锁内读取当前 sessions。
- TRPC 入口：`src/trpc/workspace-api.ts:363-375` 的 `saveState` 会先把 `terminalManager.listSummaries()` 写入 `input.sessions`，再调用 `saveWorkspaceState`；storage 层 merge 后能覆盖该入口和其他调用方。
- 测试模式：`test/integration/workspace-state.integration.test.ts` 已有临时 HOME、临时 git repo、`createBoard`、`createSessionSummary`、revision conflict 和 malformed sessions 测试，适合直接补充回归用例。

## Sequential Thinking 设计记录

1. 实现路径选择：优先在 storage 层修复，而不是只改前端或 TRPC。storage 层是所有 workspace state 保存的共同边界，且已经拥有锁和 revision 检查。
2. 文件结构设计：只需要修改 `src/state/workspace-state.ts` 和 `test/integration/workspace-state.integration.test.ts`。不新增生产文件，不调整 API contract。
3. 接口与数据模型设计：不改 `RuntimeWorkspaceStateSaveRequest` schema；新增私有 helper `mergeWorkspaceSessions`，输入输出均为 `Record<string, RuntimeTaskSessionSummary>`。
4. 依赖关系与任务排序：先补失败测试，再实现 helper 和保存路径 merge，最后运行聚焦测试和必要全量测试。
5. 测试策略：覆盖空 payload 保留历史、新 payload 新增 session、较新 payload 覆盖较旧历史、较旧 payload 不覆盖较新历史、revision conflict 保持原行为。
6. 关键风险：普通 `saveWorkspaceState` 将不再通过缺失 key 删除历史 session；当前 issue 需要这个保护，后续若要清空历史，需要单独设计显式删除 API。

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `test/integration/workspace-state.integration.test.ts:47-62` | 扩展 `createSessionSummary` 支持覆盖字段，便于构造不同 `updatedAt` 的 session |
| Modify | `test/integration/workspace-state.integration.test.ts:98-145` | 增加 workspace sessions merge 的失败测试 |
| Modify | `src/state/workspace-state.ts:286-292` | 新增 session merge 私有 helper |
| Modify | `src/state/workspace-state.ts:653-683` | 在锁内读取当前 sessions 并合并 payload sessions 后写回 |

---

### Task 1: Storage 回归测试

**Files:**
- Modify: `test/integration/workspace-state.integration.test.ts`
- Test: `test/integration/workspace-state.integration.test.ts`

- [ ] **Step 1: 扩展测试 helper**

  在 `test/integration/workspace-state.integration.test.ts:47-62` 将 `createSessionSummary` 替换为：

  ```ts
  function createSessionSummary(
  	taskId: string,
  	overrides: Partial<RuntimeTaskSessionSummary> = {},
  ): RuntimeTaskSessionSummary {
  	return {
  		taskId,
  		state: "idle",
  		agentId: null,
  		workspacePath: null,
  		pid: null,
  		startedAt: null,
  		updatedAt: Date.now(),
  		lastOutputAt: null,
  		reviewReason: null,
  		exitCode: null,
  		lastHookAt: null,
  		latestHookActivity: null,
  		...overrides,
  	};
  }
  ```

- [ ] **Step 2: 编写失败测试**

  在 `describe.sequential("workspace-state integration", () => {` 内、现有 `"persists revision numbers and rejects stale writes"` 测试之后插入：

  ```ts
  	it("merges saved sessions with persisted history instead of replacing missing entries", async () => {
  		await withTemporaryHome(async () => {
  			const { path: sandboxRoot, cleanup } = createTempDir("kanban-workspace-sessions-merge-");
  			try {
  				const workspacePath = join(sandboxRoot, "project-sessions");
  				mkdirSync(workspacePath, { recursive: true });
  				initGitRepository(workspacePath);
  
  				const initial = await loadWorkspaceState(workspacePath);
  				const firstSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Initial Task"),
  					sessions: {
  						"persisted-task": createSessionSummary("persisted-task", {
  							updatedAt: 100,
  						}),
  					},
  					expectedRevision: initial.revision,
  				});
  
  				const secondSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Board Only Change"),
  					sessions: {},
  					expectedRevision: firstSave.revision,
  				});
  
  				expect(secondSave.sessions["persisted-task"]?.updatedAt).toBe(100);
  
  				const loaded = await loadWorkspaceState(workspacePath);
  				expect(loaded.sessions["persisted-task"]?.updatedAt).toBe(100);
  			} finally {
  				cleanup();
  			}
  		});
  	});
  
  	it("uses newer incoming session summaries while preserving unrelated history", async () => {
  		await withTemporaryHome(async () => {
  			const { path: sandboxRoot, cleanup } = createTempDir("kanban-workspace-sessions-newer-");
  			try {
  				const workspacePath = join(sandboxRoot, "project-newer-sessions");
  				mkdirSync(workspacePath, { recursive: true });
  				initGitRepository(workspacePath);
  
  				const initial = await loadWorkspaceState(workspacePath);
  				const firstSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Initial Task"),
  					sessions: {
  						"task-1": createSessionSummary("task-1", {
  							state: "idle",
  							updatedAt: 100,
  						}),
  						"history-only": createSessionSummary("history-only", {
  							updatedAt: 50,
  						}),
  					},
  					expectedRevision: initial.revision,
  				});
  
  				const secondSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Updated Task"),
  					sessions: {
  						"task-1": createSessionSummary("task-1", {
  							state: "running",
  							updatedAt: 200,
  						}),
  						"incoming-only": createSessionSummary("incoming-only", {
  							updatedAt: 150,
  						}),
  					},
  					expectedRevision: firstSave.revision,
  				});
  
  				expect(secondSave.sessions["task-1"]?.state).toBe("running");
  				expect(secondSave.sessions["task-1"]?.updatedAt).toBe(200);
  				expect(secondSave.sessions["history-only"]?.updatedAt).toBe(50);
  				expect(secondSave.sessions["incoming-only"]?.updatedAt).toBe(150);
  			} finally {
  				cleanup();
  			}
  		});
  	});
  
  	it("keeps newer persisted sessions when incoming payload is stale", async () => {
  		await withTemporaryHome(async () => {
  			const { path: sandboxRoot, cleanup } = createTempDir("kanban-workspace-sessions-stale-");
  			try {
  				const workspacePath = join(sandboxRoot, "project-stale-sessions");
  				mkdirSync(workspacePath, { recursive: true });
  				initGitRepository(workspacePath);
  
  				const initial = await loadWorkspaceState(workspacePath);
  				const firstSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Initial Task"),
  					sessions: {
  						"task-1": createSessionSummary("task-1", {
  							state: "running",
  							updatedAt: 300,
  						}),
  					},
  					expectedRevision: initial.revision,
  				});
  
  				const secondSave = await saveWorkspaceState(workspacePath, {
  					board: createBoard("Stale Session Payload"),
  					sessions: {
  						"task-1": createSessionSummary("task-1", {
  							state: "idle",
  							updatedAt: 200,
  						}),
  					},
  					expectedRevision: firstSave.revision,
  				});
  
  				expect(secondSave.sessions["task-1"]?.state).toBe("running");
  				expect(secondSave.sessions["task-1"]?.updatedAt).toBe(300);
  			} finally {
  				cleanup();
  			}
  		});
  	});
  ```

- [ ] **Step 3: 运行测试确认失败**

  Run: `npx vitest run test/integration/workspace-state.integration.test.ts`

  Expected: FAIL - 第一个新增用例中 `secondSave.sessions["persisted-task"]` 为 `undefined`，因为当前实现直接写入空 `sessions`。

- [ ] **Step 4: 自审查**

  确认新增测试只使用现有 helper、`RuntimeTaskSessionSummary` 类型和 `saveWorkspaceState` 公共 API，没有引入额外测试依赖。

---

### Task 2: 在 storage 保存边界合并 sessions

**Files:**
- Modify: `src/state/workspace-state.ts`
- Test: `test/integration/workspace-state.integration.test.ts`

- [ ] **Step 1: 新增 merge helper**

  在 `parseWorkspaceStateSavePayload` 函数之后、`readWorkspaceBoard` 函数之前插入：

  ```ts
  function mergeWorkspaceSessions(
  	currentSessions: Record<string, RuntimeTaskSessionSummary>,
  	incomingSessions: Record<string, RuntimeTaskSessionSummary>,
  ): Record<string, RuntimeTaskSessionSummary> {
  	const mergedSessions = { ...currentSessions };
  	for (const [taskId, incomingSession] of Object.entries(incomingSessions)) {
  		const currentSession = mergedSessions[taskId];
  		if (!currentSession || currentSession.updatedAt <= incomingSession.updatedAt) {
  			mergedSessions[taskId] = incomingSession;
  		}
  	}
  	return mergedSessions;
  }
  ```

- [ ] **Step 2: 修改 `saveWorkspaceState` 写入逻辑**

  在 `src/state/workspace-state.ts:653-683` 将锁内主体替换为：

  ```ts
  	return await lockedFileSystem.withLock(getWorkspaceDirectoryLockRequest(context.workspaceId), async () => {
  		const metaPath = getWorkspaceMetaPath(context.workspaceId);
  		const currentMeta = await readWorkspaceMeta(context.workspaceId);
  		const expectedRevision = parsedPayload.expectedRevision;
  		if (
  			typeof expectedRevision === "number" &&
  			Number.isInteger(expectedRevision) &&
  			expectedRevision >= 0 &&
  			expectedRevision !== currentMeta.revision
  		) {
  			throw new WorkspaceStateConflictError(expectedRevision, currentMeta.revision);
  		}
  		const board = parsedPayload.board;
  		const currentSessions = await readWorkspaceSessions(context.workspaceId);
  		const sessions = mergeWorkspaceSessions(currentSessions, parsedPayload.sessions);
  		const nextRevision = currentMeta.revision + 1;
  		const nextMeta: WorkspaceStateMeta = {
  			revision: nextRevision,
  			updatedAt: Date.now(),
  		};
  
  		await lockedFileSystem.writeJsonFileAtomic(getWorkspaceBoardPath(context.workspaceId), board, {
  			lock: null,
  		});
  		await lockedFileSystem.writeJsonFileAtomic(getWorkspaceSessionsPath(context.workspaceId), sessions, {
  			lock: null,
  		});
  		await lockedFileSystem.writeJsonFileAtomic(metaPath, nextMeta, {
  			lock: null,
  		});
  
  		return toWorkspaceStateResponse(context, board, sessions, nextRevision);
  	});
  ```

- [ ] **Step 3: 运行测试确认通过**

  Run: `npx vitest run test/integration/workspace-state.integration.test.ts`

  Expected: PASS

- [ ] **Step 4: 检查 TypeScript**

  Run: `npm run typecheck`

  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add src/state/workspace-state.ts test/integration/workspace-state.integration.test.ts
  git commit -m "fix(state): preserve persisted workspace sessions"
  ```

---

### Task 3: 验证 TRPC saveState 与 live summaries 入口

**Files:**
- Modify: `test/integration/workspace-state.integration.test.ts`
- Review: `src/trpc/workspace-api.ts`

- [ ] **Step 1: 增加 live summary 语义覆盖**

  如果 Task 2 的测试已经覆盖 payload 中较新 summary 合并，则无需 mock TRPC。为了把 `workspace.saveState` 的 live summary 入口也纳入验收，在 `Task 1` 第二个测试里确认 `incoming-only` 表示由 `src/trpc/workspace-api.ts:369-371` 注入的 live summary：

  ```ts
  expect(secondSave.sessions["incoming-only"]?.updatedAt).toBe(150);
  ```

- [ ] **Step 2: 人工检查 TRPC 入口无需额外改动**

  确认 `src/trpc/workspace-api.ts:369-372` 保持如下语义：live summaries 先写入 `input.sessions`，再交给 `saveWorkspaceState` 与磁盘历史合并。

  ```ts
  for (const summary of terminalManager.listSummaries()) {
  	input.sessions[summary.taskId] = summary;
  }
  const response = await saveWorkspaceState(workspaceScope.workspacePath, input);
  ```

- [ ] **Step 3: 运行相关测试**

  Run: `npx vitest run test/runtime/trpc/workspace-api.test.ts test/integration/workspace-state.integration.test.ts`

  Expected: PASS

- [ ] **Step 4: 提交**

  如果 Task 3 没有新增文件改动，跳过提交。若补充了额外测试断言：

  ```bash
  git add test/integration/workspace-state.integration.test.ts
  git commit -m "test(state): cover live session persistence merge"
  ```

---

## 验证方案

- 自动化测试:

  ```bash
  npx vitest run test/integration/workspace-state.integration.test.ts
  npx vitest run test/runtime/trpc/workspace-api.test.ts
  npm run typecheck
  npm run test:fast
  ```

- 手工验证:
  1. 启动 Kanban：`npm run dev:full`
  2. 在同一 workspace 创建并运行一次 agent task，等待 agent 执行记录出现在 UI。
  3. 停止 Kanban。
  4. 重新启动 Kanban：`npm run dev:full`
  5. 打开同一 workspace，确认历史 agent 执行记录仍存在。
  6. 移动一张 board 卡片触发 workspace state 保存。
  7. 再次刷新或重启，确认历史 agent 执行记录没有被清空。

## 规格覆盖自审查

- 重启后恢复历史执行记录：Task 1 的空 payload 保留历史测试覆盖 storage 层，手工验证覆盖 UI 重启场景。
- 没有活跃 session 不覆盖为空：Task 1 第一个测试覆盖 `sessions: {}`。
- live terminal summary 仍可刷新旧记录：Task 1 第二个测试覆盖较新 incoming summary 合并。
- 旧 payload 不覆盖较新历史：Task 1 第三个测试覆盖 stale payload。
- revision conflict 原行为：现有 `"persists revision numbers and rejects stale writes"` 测试继续覆盖。

## 命名一致性自审查

- 新 helper 名称：`mergeWorkspaceSessions`
- 现有类型：`RuntimeTaskSessionSummary`
- 现有公共 API：`loadWorkspaceState`, `saveWorkspaceState`
- 现有测试 helper：`withTemporaryHome`, `initGitRepository`, `createBoard`, `createSessionSummary`

