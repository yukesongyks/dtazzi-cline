# 修复 Cline worktree 自动隔离行为 实现计划

> **Issue:** #10 | **链接:** https://code.alipay.com/antchain_efficiency/dtazzi_cline/issues/10
> **生成时间:** 2026-05-22
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 为 task 引入显式 `workspaceMode`，让 New Task 可配置是否使用 worktree，同时让 runtime、清理链路和 UI 全量理解 `project_root` 模式。

**技术方案:** 以 task/card 级字段 `workspaceMode: "worktree" | "project_root"` 作为单一事实来源，打通 board model、TRPC contract、runtime 启动链路、workspace info、shutdown cleanup 和 CLI。普通 Kanban task 默认保持 `worktree`，避免回归；issue-refine/plan/list/close/split 这类上层调用方后续只需要在创建或启动 task 时显式写入 `project_root` 即可落到项目根目录。

**预估工作量:** 中等，约 2 人天

---

## 实现决策

### Thought 1: 实现路径选择

- 选择“给 task 建模 `workspaceMode`”而不是在 `runtime.startTaskSession` 临时加布尔开关。
- 原因是当前问题不只发生在启动时，还影响 `ensureWorktree`、workspace info 展示、`task done` 清理和 shutdown cleanup；只有 task-level 模型才能让整条链路保持一致。
- 默认值维持 `worktree`，避免把现有普通 coding task 的默认隔离行为改坏；需要项目根目录运行的调用方显式选择 `project_root`。

### Thought 2: 文件结构设计

- 核心 contract：
  - `src/core/api-contract.ts`
  - `src/core/api-validation.ts`
  - `src/core/task-board-mutations.ts`
- Web UI：
  - `web-ui/src/types/board.ts`
  - `web-ui/src/state/board-state.ts`
  - `web-ui/src/hooks/app-utils.tsx`
  - `web-ui/src/storage/local-storage-store.ts`
  - `web-ui/src/hooks/use-task-editor.ts`
  - `web-ui/src/components/task-create-dialog.tsx`
  - `web-ui/src/components/task-inline-create-card.tsx`
  - `web-ui/src/hooks/use-task-sessions.ts`
  - `web-ui/src/components/board-card.tsx`
- Runtime / cleanup：
  - `src/trpc/runtime-api.ts`
  - `src/trpc/workspace-api.ts`
  - `src/commands/task.ts`
  - `src/server/workspace-registry.ts`
  - `src/server/shutdown-coordinator.ts`
- 测试：
  - `test/runtime/api-validation.test.ts`
  - `test/runtime/trpc/runtime-api.test.ts`
  - `web-ui/src/hooks/use-task-editor.test.tsx`
  - `web-ui/src/hooks/use-task-sessions.test.tsx`

### Thought 3: 接口与数据模型设计

- 新增枚举：

```ts
export const runtimeTaskWorkspaceModeSchema = z.enum(["worktree", "project_root"]);
export type RuntimeTaskWorkspaceMode = z.infer<typeof runtimeTaskWorkspaceModeSchema>;
```

- 在以下结构上新增 `workspaceMode?: RuntimeTaskWorkspaceMode`，并在 transform / create / update 时补默认值 `"worktree"`：
  - `RuntimeBoardCard`
  - `RuntimeCreateTaskInput`
  - `RuntimeUpdateTaskInput`
  - `RuntimeTaskSessionStartRequest`
  - `RuntimeWorktreeEnsureRequest`
  - `RuntimeTaskWorkspaceInfoRequest`
- UI 侧 `BoardCard` 同步新增 `workspaceMode?: "worktree" | "project_root"`。

### Thought 4: 依赖关系与任务排序

1. 先做 contract 和 board model，否则 UI 和 runtime 都无法安全编译。
2. 再做 New Task / Edit Task UI，让字段能写进 board。
3. 再做 runtime / workspace / cleanup，让启动与清理真正尊重新字段。
4. 最后补 CLI 和测试，覆盖 create/start/done/shutdown 回归。

### Thought 5: 测试策略

- Root vitest：
  - `test/runtime/api-validation.test.ts`
  - `test/runtime/trpc/runtime-api.test.ts`
- Web vitest：
  - `web-ui/src/hooks/use-task-editor.test.tsx`
  - `web-ui/src/hooks/use-task-sessions.test.tsx`
- 手工验证：
  - New Task 勾选/取消 worktree 开关后启动 task，分别检查 `pwd`
  - review/done/shutdown 对 `project_root` task 不删除主项目目录、不显示错误 worktree 路径

### Thought 6: 关键决策点与潜在风险

- 关键决策：默认值保留 `worktree`，不在这次计划里把所有普通 task 的默认行为改成项目根目录。
- 关键交互约束：当 New Task / Edit Task 选择 `project_root` 时，`Worktree base ref` 和 `Automatically` 必须隐藏；这两个配置只对 `worktree` 模式有意义。
- 风险 1：只跳过 `ensureWorktree` 而不改 `done`/shutdown，会出现删除不存在 worktree 或错误提示。
- 风险 2：只改 runtime，不改 board/UI，会导致字段无法持久化，刷新后又退回 `worktree`。
- 风险 3：trash restore 目前文案写死 “in new worktree”，需要在 `project_root` 模式下改成项目根目录语义。

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts:L556-L560, L593-L597, L998-L1013` | 新增 `workspaceMode` schema 并扩展 request/card contract |
| Modify | `src/core/api-validation.ts:L150-L174, L195-L208` | 解析并 trim `workspaceMode` |
| Modify | `src/core/task-board-mutations.ts:L15-L42, L307-L322, L625-L644` | task create/update 持久化 `workspaceMode` |
| Modify | `web-ui/src/types/board.ts:L40-L52` | BoardCard 暴露 `workspaceMode` |
| Modify | `web-ui/src/state/board-state.ts:L333-L366, L527-L645` | board create/update 透传 `workspaceMode` |
| Modify | `web-ui/src/storage/local-storage-store.ts:L1-L24` | 为 New Task worktree 开关增加 localStorage key |
| Modify | `web-ui/src/hooks/app-utils.tsx:L1-L12` | worktree 开关 storage 常量与 normalize helper |
| Modify | `web-ui/src/hooks/use-task-editor.ts:L36-L84, L242-L415` | New/Edit task 状态增加 `workspaceMode` |
| Modify | `web-ui/src/components/task-create-dialog.tsx:L680-L760` | Dialog 增加 worktree toggle，并在 `project_root` 下隐藏 base ref / auto review |
| Modify | `web-ui/src/components/task-inline-create-card.tsx:L349-L430` | Inline create/edit 增加 worktree toggle，并在 `project_root` 下隐藏 base ref / auto review |
| Modify | `web-ui/src/hooks/use-task-sessions.ts:L121-L188, L244-L278` | 仅 `worktree` 模式才 ensure/delete worktree，并把 mode 带给 runtime |
| Modify | `web-ui/src/components/board-card.tsx:L415-L420, L654-L654` | UI 文案区分 worktree / project root |
| Modify | `src/trpc/runtime-api.ts:L80-L99, L215-L359` | 根据 `workspaceMode` 决定 cwd 是否走 worktree |
| Modify | `src/trpc/workspace-api.ts:L321-L338` | `ensureWorktree`/`getTaskContext` 理解 `workspaceMode` |
| Modify | `src/commands/task.ts:L475-L525, L541-L586, L690-L719, L784-L860` | CLI create/start/done 理解 `workspaceMode` |
| Modify | `src/server/workspace-registry.ts:L125-L134` | 只收集 `worktree` task 参与 cleanup |
| Modify | `src/server/shutdown-coordinator.ts:L55-L108, L160-L233` | shutdown 仅清理 worktree-backed tasks |
| Test | `test/runtime/api-validation.test.ts` | parser 回归 |
| Test | `test/runtime/trpc/runtime-api.test.ts` | runtime cwd 选择回归 |
| Test | `web-ui/src/hooks/use-task-editor.test.tsx` | New/Edit task 状态回归 |
| Test | `web-ui/src/hooks/use-task-sessions.test.tsx` | start flow / skip ensureWorktree 回归 |

---

### Task 1: Contract 与 Board Model

**Files:**
- Modify: `src/core/api-contract.ts`
- Modify: `src/core/api-validation.ts`
- Modify: `src/core/task-board-mutations.ts`
- Modify: `web-ui/src/types/board.ts`
- Modify: `web-ui/src/state/board-state.ts`
- Test: `test/runtime/api-validation.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
it("parses workspaceMode for task session starts", () => {
	const parsed = parseTaskSessionStartRequest({
		taskId: "  task-1  ",
		prompt: "",
		baseRef: "  main  ",
		workspaceMode: "project_root",
	});
	expect(parsed).toEqual({
		taskId: "task-1",
		prompt: "",
		baseRef: "main",
		workspaceMode: "project_root",
	});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- test/runtime/api-validation.test.ts`
Expected: FAIL - `workspaceMode` 还不存在于 `RuntimeTaskSessionStartRequest`

- [ ] **Step 3: 最小实现**

`src/core/api-contract.ts`

```ts
export const runtimeTaskWorkspaceModeSchema = z.enum(["worktree", "project_root"]);
export type RuntimeTaskWorkspaceMode = z.infer<typeof runtimeTaskWorkspaceModeSchema>;

export const runtimeWorktreeEnsureRequestSchema = z.object({
	taskId: z.string(),
	baseRef: z.string(),
	workspaceMode: runtimeTaskWorkspaceModeSchema.optional(),
});

export const runtimeTaskWorkspaceInfoRequestSchema = z.object({
	taskId: z.string(),
	baseRef: z.string(),
	workspaceMode: runtimeTaskWorkspaceModeSchema.optional(),
});

export const runtimeTaskSessionStartRequestSchema = z.object({
	taskId: z.string(),
	prompt: z.string(),
	taskTitle: z.string().optional(),
	images: z.array(runtimeTaskImageSchema).optional(),
	startInPlanMode: z.boolean().optional(),
	mode: runtimeTaskSessionModeSchema.optional(),
	resumeFromTrash: z.boolean().optional(),
	baseRef: z.string(),
	cols: z.number().int().positive().optional(),
	rows: z.number().int().positive().optional(),
	agentId: runtimeAgentIdSchema.optional(),
	agentInstanceId: runtimeAgentInstanceIdSchema.optional(),
	clineSettings: runtimeTaskClineSettingsSchema.optional(),
	workspaceMode: runtimeTaskWorkspaceModeSchema.optional(),
});
```

`src/core/task-board-mutations.ts`

```ts
export interface RuntimeCreateTaskInput {
	taskId?: string;
	title?: string;
	prompt: string;
	startInPlanMode?: boolean;
	scheduledStartTime?: number;
	autoReviewEnabled?: boolean;
	autoReviewMode?: RuntimeTaskAutoReviewMode;
	images?: RuntimeTaskImage[];
	agentId?: RuntimeAgentId;
	agentInstanceId?: RuntimeAgentInstanceId;
	clineSettings?: RuntimeTaskClineSettings;
	workspaceMode?: RuntimeTaskWorkspaceMode;
	baseRef: string;
}

export interface RuntimeUpdateTaskInput {
	title?: string;
	prompt: string;
	startInPlanMode?: boolean;
	scheduledStartTime?: number;
	autoReviewEnabled?: boolean;
	autoReviewMode?: RuntimeTaskAutoReviewMode;
	images?: RuntimeTaskImage[];
	agentId?: RuntimeAgentId | null;
	agentInstanceId?: RuntimeAgentInstanceId | null;
	clineSettings?: RuntimeTaskClineSettings | null;
	workspaceMode?: RuntimeTaskWorkspaceMode;
	baseRef: string;
}

const task: RuntimeBoardCard = {
	id: explicitTaskId || createUniqueTaskId(existingIds, randomUuid),
	title: resolveTaskTitle(input.title, prompt),
	prompt,
	startInPlanMode: Boolean(input.startInPlanMode),
	autoReviewEnabled: Boolean(input.autoReviewEnabled),
	autoReviewMode: normalizeTaskAutoReviewMode(input.autoReviewMode),
	images: cloneTaskImages(input.images),
	...(input.agentId ? { agentId: input.agentId } : {}),
	...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
	...(input.clineSettings !== undefined ? { clineSettings: cloneTaskClineSettings(input.clineSettings) } : {}),
	workspaceMode: input.workspaceMode ?? "worktree",
	baseRef,
	createdAt: now,
	updatedAt: now,
};
```

`src/core/api-validation.ts`

```ts
export function parseTaskSessionStartRequest(value: unknown): RuntimeTaskSessionStartRequest {
	const parsed = parseWithSchema(runtimeTaskSessionStartRequestSchema, value);
	const taskId = parsed.taskId.trim();
	if (!taskId) {
		throw new Error("Task session taskId cannot be empty.");
	}
	const baseRef = parsed.baseRef.trim();
	if (!baseRef) {
		throw new Error("Task session baseRef cannot be empty.");
	}
	return {
		...parsed,
		taskId,
		baseRef,
	};
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- test/runtime/api-validation.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/api-contract.ts src/core/api-validation.ts src/core/task-board-mutations.ts web-ui/src/types/board.ts web-ui/src/state/board-state.ts test/runtime/api-validation.test.ts
git commit -m "feat(task): add workspace mode to task model"
```

### Task 2: New Task / Edit Task Worktree 开关与条件显隐

**Files:**
- Modify: `web-ui/src/storage/local-storage-store.ts`
- Modify: `web-ui/src/hooks/app-utils.tsx`
- Modify: `web-ui/src/hooks/use-task-editor.ts`
- Modify: `web-ui/src/components/task-create-dialog.tsx`
- Modify: `web-ui/src/components/task-inline-create-card.tsx`
- Test: `web-ui/src/hooks/use-task-editor.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("creates project-root tasks when the editor workspace mode is set to project_root", async () => {
	let latestSnapshot: HookSnapshot | null = null;

	await act(async () => {
		root.render(
			<HookHarness
				initialBoard={createBoard()}
				onSnapshot={(snapshot) => {
					latestSnapshot = snapshot;
				}}
			/>,
		);
	});

	await act(async () => {
		requireSnapshot(latestSnapshot).handleOpenCreateTask();
		requireSnapshot(latestSnapshot).setNewTaskPrompt("Investigate issue #10");
		requireSnapshot(latestSnapshot).setNewTaskWorkspaceMode("project_root");
	});

	await act(async () => {
		requireSnapshot(latestSnapshot).handleCreateTask();
	});

expect(requireSnapshot(latestSnapshot).board.columns[0]?.cards[0]?.workspaceMode).toBe("project_root");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- src/hooks/use-task-editor.test.tsx`
Expected: FAIL - `setNewTaskWorkspaceMode` 和 `card.workspaceMode` 尚不存在

- [ ] **Step 3: 最小实现**

`web-ui/src/storage/local-storage-store.ts`

```ts
export enum LocalStorageKey {
	TaskStartInPlanMode = "kanban.task-start-in-plan-mode",
	TaskAutoReviewEnabled = "kanban.task-auto-review-enabled",
	TaskAutoReviewMode = "kanban.task-auto-review-mode",
	TaskWorkspaceMode = "kanban.task-workspace-mode",
	// ...
}
```

`web-ui/src/hooks/use-task-editor.ts`

```ts
const [newTaskWorkspaceMode, setNewTaskWorkspaceMode] = useRawLocalStorageValue<RuntimeTaskWorkspaceMode>(
	TASK_WORKSPACE_MODE_STORAGE_KEY,
	"worktree",
	normalizeStoredTaskWorkspaceMode,
);
const [editTaskWorkspaceMode, setEditTaskWorkspaceMode] = useState<RuntimeTaskWorkspaceMode>("worktree");

setEditTaskWorkspaceMode(task.workspaceMode ?? "worktree");

const created = addTaskToColumnWithResult(board, "backlog", {
	title,
	prompt,
	startInPlanMode: newTaskStartInPlanMode,
	autoReviewEnabled: newTaskAutoReviewEnabled,
	autoReviewMode: newTaskAutoReviewMode,
	images: newTaskImages,
	agentId: newTaskAgentId,
	agentInstanceId: newTaskAgentInstanceId,
	clineSettings: newTaskClineSettings,
	workspaceMode: newTaskWorkspaceMode,
	baseRef,
	scheduledStartTime: newTaskScheduledStartTime,
});
```

`web-ui/src/components/task-create-dialog.tsx`

```tsx
<div className="flex items-center gap-2 flex-wrap">
	<label htmlFor={workspaceModeId} className="flex items-center gap-2 text-[12px] text-text-primary">
		<RadixCheckbox.Root
			id={workspaceModeId}
			checked={workspaceMode === "worktree"}
			onCheckedChange={(checked) => onWorkspaceModeChange(checked === true ? "worktree" : "project_root")}
			className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border-bright bg-surface-3 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
		>
			<RadixCheckbox.Indicator>
				<Check size={10} className="text-white" />
			</RadixCheckbox.Indicator>
		</RadixCheckbox.Root>
		Use isolated worktree
	</label>
	<span className="text-[11px] text-text-secondary">
		{workspaceMode === "worktree" ? "Task starts in .cline/worktrees/..." : "Task starts in the project root"}
	</span>
</div>

{workspaceMode === "worktree" ? (
	<>
		<div>
			<span className="text-[11px] text-text-secondary block mb-1">Worktree base ref</span>
			<BranchSelectDropdown
				options={branchOptions}
				selectedValue={branchRef}
				onSelect={onBranchRefChange}
				fill
				size="sm"
				emptyText="No branches detected"
			/>
		</div>

		<div className="flex items-center gap-2 flex-wrap">
			<label htmlFor={autoReviewEnabledId} className="flex items-center gap-2 text-[12px] text-text-primary">
				<RadixCheckbox.Root
					id={autoReviewEnabledId}
					checked={autoReviewEnabled}
					onCheckedChange={(checked) => onAutoReviewEnabledChange(checked === true)}
					className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border-bright bg-surface-3 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
				>
					<RadixCheckbox.Indicator>
						<Check size={10} className="text-white" />
					</RadixCheckbox.Indicator>
				</RadixCheckbox.Root>
				Automatically
			</label>
			<NativeSelect
				size="sm"
				value={autoReviewMode}
				onChange={(e) => onAutoReviewModeChange(e.currentTarget.value as TaskAutoReviewMode)}
				style={{ width: "16ch", maxWidth: "100%" }}
			>
				{AUTO_REVIEW_MODE_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</NativeSelect>
		</div>
	</>
) : null}
```

`web-ui/src/components/task-inline-create-card.tsx`

```tsx
{workspaceMode === "worktree" ? (
	<>
		<div>
			<span className="text-[11px] text-text-secondary block mb-1">Worktree base ref</span>
			<BranchSelectDropdown
				id={branchSelectId}
				options={branchOptions}
				selectedValue={branchRef}
				onSelect={onBranchRefChange}
				onPopoverOpenChange={setIsBranchPopoverOpen}
				fill
				size="sm"
				emptyText="No branches detected"
			/>
		</div>

		<div className="flex items-center gap-2 flex-wrap">
			<label htmlFor={autoReviewEnabledId} className="flex items-center gap-2 text-[12px] text-text-primary">
				<RadixCheckbox.Root
					id={autoReviewEnabledId}
					aria-label="Enable automatic review action"
					checked={autoReviewEnabled}
					onCheckedChange={(checked) => onAutoReviewEnabledChange(checked === true)}
					className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border-bright bg-surface-3 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
				>
					<RadixCheckbox.Indicator>
						<Check size={10} className="text-white" />
					</RadixCheckbox.Indicator>
				</RadixCheckbox.Root>
				<span>Automatically</span>
			</label>
			<NativeSelect
				id={autoReviewModeId}
				size="sm"
				value={autoReviewMode}
				onChange={(event) => onAutoReviewModeChange(event.currentTarget.value as TaskAutoReviewMode)}
				style={{ width: `${AUTO_REVIEW_MODE_SELECT_WIDTH_CH}ch`, maxWidth: "100%" }}
			>
				{AUTO_REVIEW_MODE_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</NativeSelect>
		</div>
	</>
) : null}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- src/hooks/use-task-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add web-ui/src/storage/local-storage-store.ts web-ui/src/hooks/app-utils.tsx web-ui/src/hooks/use-task-editor.ts web-ui/src/components/task-create-dialog.tsx web-ui/src/components/task-inline-create-card.tsx web-ui/src/hooks/use-task-editor.test.tsx
git commit -m "feat(web-ui): add task worktree toggle"
```

### Task 3: Runtime / Workspace 链路尊重 `workspaceMode`

**Files:**
- Modify: `src/trpc/runtime-api.ts`
- Modify: `src/trpc/workspace-api.ts`
- Modify: `web-ui/src/hooks/use-task-sessions.ts`
- Modify: `web-ui/src/components/board-card.tsx`
- Test: `test/runtime/trpc/runtime-api.test.ts`
- Test: `web-ui/src/hooks/use-task-sessions.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("uses the workspace root when starting a project-root task session", async () => {
	const terminalManager = {
		startTaskSession: vi.fn(async () => createSummary()),
		applyTurnCheckpoint: vi.fn(),
	};
	const clineTaskSessionService = createClineTaskSessionServiceMock();
	const api = createTestRuntimeApi({
		getActiveWorkspaceId: vi.fn(() => "workspace-1"),
		loadScopedRuntimeConfig: vi.fn(async () => createRuntimeConfigState()),
		setActiveRuntimeConfig: vi.fn(),
		getScopedTerminalManager: vi.fn(async () => terminalManager as never),
		getScopedClineTaskSessionService: vi.fn(async () => clineTaskSessionService as never),
		resolveInteractiveShellCommand: vi.fn(),
		runCommand: vi.fn(),
	});

	const response = await api.startTaskSession(
		{ workspaceId: "workspace-1", workspacePath: "/tmp/repo" },
		{ taskId: "task-1", baseRef: "main", prompt: "Investigate", workspaceMode: "project_root" },
	);

	expect(response.ok).toBe(true);
	expect(taskWorktreeMocks.resolveTaskCwd).not.toHaveBeenCalled();
	expect(terminalManager.startTaskSession).toHaveBeenCalledWith(
		expect.objectContaining({ cwd: "/tmp/repo" }),
	);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- test/runtime/trpc/runtime-api.test.ts`
Expected: FAIL - runtime 仍会无条件走 `resolveExistingTaskCwdOrEnsure`

- [ ] **Step 3: 最小实现**

`src/trpc/runtime-api.ts`

```ts
function resolveTaskExecutionCwd(input: {
	workspacePath: string;
	taskId: string;
	baseRef: string;
	workspaceMode?: RuntimeTaskWorkspaceMode;
}): Promise<string> | string {
	if (isHomeAgentSessionId(input.taskId) || input.workspaceMode === "project_root") {
		return input.workspacePath;
	}
	return resolveExistingTaskCwdOrEnsure({
		cwd: input.workspacePath,
		taskId: input.taskId,
		baseRef: input.baseRef,
	});
}
```

```ts
const taskCwd = await resolveTaskExecutionCwd({
	workspacePath: workspaceScope.workspacePath,
	taskId: body.taskId,
	baseRef: body.baseRef,
	workspaceMode: body.workspaceMode,
});
const shouldCaptureTurnCheckpoint =
	!body.resumeFromTrash && !isHomeAgentSessionId(body.taskId) && body.workspaceMode !== "project_root";
```

`web-ui/src/hooks/use-task-sessions.ts`

```ts
const ensureTaskWorkspace = useCallback(
	async (task: BoardCard): Promise<EnsureTaskWorkspaceResult> => {
		if (task.workspaceMode === "project_root") {
			return { ok: true };
		}
		// existing ensureWorktree path...
	},
	[currentProjectId],
);

const payload = await trpcClient.runtime.startTaskSession.mutate({
	taskId: task.id,
	prompt: kickoffPrompt,
	taskTitle: task.title,
	images: options?.resumeFromTrash ? undefined : task.images,
	startInPlanMode: options?.resumeFromTrash ? undefined : task.startInPlanMode,
	resumeFromTrash: options?.resumeFromTrash,
	baseRef: task.baseRef,
	cols: geometry.cols,
	rows: geometry.rows,
	agentId: task.agentId,
	agentInstanceId: task.agentInstanceId,
	clineSettings: task.clineSettings,
	workspaceMode: task.workspaceMode ?? "worktree",
});
```

`web-ui/src/components/board-card.tsx`

```tsx
const reviewWorkspacePath = reviewWorkspaceSnapshot
	? formatPathForDisplay(reviewWorkspaceSnapshot.path)
	: isTrashCard && card.workspaceMode !== "project_root"
		? reconstructTaskWorktreeDisplayPath(card.id, workspacePath)
		: card.workspaceMode === "project_root"
			? formatPathForDisplay(workspacePath ?? "")
			: null;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- test/runtime/trpc/runtime-api.test.ts`
Expected: PASS

Run: `npm run web:test -- src/hooks/use-task-sessions.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/trpc/runtime-api.ts src/trpc/workspace-api.ts web-ui/src/hooks/use-task-sessions.ts web-ui/src/components/board-card.tsx test/runtime/trpc/runtime-api.test.ts web-ui/src/hooks/use-task-sessions.test.tsx
git commit -m "feat(runtime): honor project-root task sessions"
```

### Task 4: CLI、Done 与 Shutdown Cleanup

**Files:**
- Modify: `src/commands/task.ts`
- Modify: `src/server/workspace-registry.ts`
- Modify: `src/server/shutdown-coordinator.ts`
- Test: `test/runtime/trpc/runtime-api.test.ts`
- Test: `web-ui/src/hooks/use-task-sessions.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("skips ensureWorktree for project-root tasks", async () => {
	const task = {
		...createTask(),
		workspaceMode: "project_root" as const,
	};
	await act(async () => {
		await latestSnapshot?.startTaskSession(task);
	});
	expect(startTaskSessionMutateMock).toHaveBeenCalledWith(
		expect.objectContaining({ workspaceMode: "project_root" }),
	);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run web:test -- src/hooks/use-task-sessions.test.tsx`
Expected: FAIL - `workspaceMode` 未透传，且 cleanup 仍默认删除 worktree

- [ ] **Step 3: 最小实现**

`src/commands/task.ts`

```ts
if (shouldStartSession && task.workspaceMode !== "project_root") {
	const ensured = await runtimeClient.workspace.ensureWorktree.mutate({
		taskId: task.id,
		baseRef: task.baseRef,
		workspaceMode: task.workspaceMode,
	});
	if (!ensured.ok) {
		throw new Error(ensured.error ?? "Could not ensure task worktree.");
	}
}

const started = await runtimeClient.runtime.startTaskSession.mutate({
	taskId: task.id,
	prompt: task.prompt,
	taskTitle: task.title,
	startInPlanMode: task.startInPlanMode,
	baseRef: task.baseRef,
	agentId: task.agentId,
	clineSettings: task.clineSettings,
	workspaceMode: task.workspaceMode,
});
```

`src/server/workspace-registry.ts`

```ts
export function collectProjectWorktreeTaskIdsForRemoval(board: RuntimeBoardData): Set<string> {
	const taskIds = new Set<string>();
	for (const column of board.columns) {
		if (column.id === "backlog" || column.id === "trash") {
			continue;
		}
		for (const card of column.cards) {
			if ((card.workspaceMode ?? "worktree") !== "worktree") {
				continue;
			}
			taskIds.add(card.id);
		}
	}
	return taskIds;
}
```

`src/server/shutdown-coordinator.ts`

```ts
const worktreeTaskIds = collectProjectWorktreeTaskIdsForRemoval(workspaceState.board);
const worktreeTaskIdsToCleanup = interruptedTaskIds.filter((taskId) => worktreeTaskIds.has(taskId));
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run web:test -- src/hooks/use-task-sessions.test.tsx`
Expected: PASS

Run: `npm run test -- test/runtime/trpc/runtime-api.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/commands/task.ts src/server/workspace-registry.ts src/server/shutdown-coordinator.ts web-ui/src/hooks/use-task-sessions.test.tsx test/runtime/trpc/runtime-api.test.ts
git commit -m "fix(worktree): skip cleanup for project-root tasks"
```

---

## 验证方案

- 自动化测试:
  - `npm run test -- test/runtime/api-validation.test.ts test/runtime/trpc/runtime-api.test.ts`
  - `npm run web:test -- src/hooks/use-task-editor.test.tsx src/hooks/use-task-sessions.test.tsx`
- 手工验证:
  - 1. 打开 New Task，关闭 `Use isolated worktree`
  - 2. 创建并启动 task
  - 3. 预期 `Worktree base ref` 和 `Automatically` 两块 UI 不显示
  - 4. 在会话中执行 `pwd`
  - 5. 预期输出为项目根目录，而不是 `.cline/worktrees/...`
  - 6. 再创建一个保持 `Use isolated worktree` 打开的 task
  - 7. 预期 `Worktree base ref` 和 `Automatically` 正常显示
  - 8. 启动后执行 `pwd`
  - 9. 预期输出为 `.cline/worktrees/{taskId}/...`
  - 10. 将两个 task 都走到 done
  - 11. 预期 `project_root` task 不触发 worktree 删除报错，`worktree` task 正常清理隔离目录

---

## 自审查

- 规格覆盖:
  - issue 中“只在 resolve/显式需要时才进入 worktree”由 `workspaceMode` 建模覆盖
  - “New Task 可配置”由 TaskCreateDialog / TaskInlineCreateCard 覆盖
  - “完成/退出后不要错误清理主项目目录”由 `task done` 和 shutdown cleanup 覆盖
- 占位符扫描:
  - 未使用 `TBD` / `TODO` / “implement later” / “write tests for the above”
- 命名一致性:
  - 统一使用 `workspaceMode`
  - 统一枚举值 `worktree` / `project_root`
