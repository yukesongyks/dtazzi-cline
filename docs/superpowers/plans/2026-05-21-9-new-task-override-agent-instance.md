# New Task 时 Override Agent 支持选择实例 实现计划

> **Issue:** #9 | **链接:** https://code.alipay.com/antchain_efficiency/dtazzi_cline/issues/9
> **生成时间:** 2026-05-21
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 让 New Task 的 Override Agent Settings 从“按 agent 类型覆盖”升级为“按 agent 实例覆盖”，并兼容已有只存 `agentId` 的旧任务。

**技术方案:** 采用方案 A，保留 `agentId` 作为兼容 fallback，同时在 task 卡片、前端编辑态、task 启动 payload 中新增 `agentInstanceId`。前端 picker 改为消费 `configuredAgents` 实例列表，后端继续复用已有 `resolveSelectedAgentInstanceId()` 逻辑。

**预估工作量:** 1-2 人天，复杂度：中等

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts:146-185,997-1012` | 为 `RuntimeBoardCard` 持久化补充 `agentInstanceId` |
| Modify | `src/core/task-board-mutations.ts:14-39,304-318,580-660` | 让创建/更新 task 时读写 `agentInstanceId` |
| Modify | `web-ui/src/types/board.ts:1-53` | 前端 BoardCard 类型补充 `agentInstanceId` |
| Modify | `web-ui/src/state/board-state.ts:21-32,147-207` | 本地 board 归一化与 draft 透传 `agentInstanceId` |
| Modify | `web-ui/src/hooks/use-task-editor.ts:18-87,128-133,211-229,243-315,350-460` | 新增 create/edit 的实例 override 状态 |
| Modify | `web-ui/src/components/task-create-dialog.tsx:107-211,1118-1150` | 对话框接线 `configuredAgents` 与 `agentInstanceId` |
| Modify | `web-ui/src/components/task-agent-model-picker.tsx:1-260` | picker 从实例列表渲染选项，并兼容旧 `agentId` |
| Modify | `web-ui/src/hooks/use-task-sessions.ts:147-169` | 启动 task 时传 `agentInstanceId` |
| Modify | `web-ui/src/App.tsx:1118-1150` | 把 runtime config 里的 `configuredAgents` / 默认实例传给创建对话框 |
| Test | `test/runtime/task-board-mutations.test.ts` | 覆盖 task 持久化 `agentInstanceId` |
| Test | `web-ui/src/hooks/use-task-editor.test.tsx` | 覆盖 create/split/edit 时实例 override 的保存 |
| Test | `web-ui/src/components/task-agent-model-picker.test.tsx` | 覆盖实例列表选项、默认项、空列表降级 |
| Test | `web-ui/src/hooks/use-task-sessions.test.tsx` | 覆盖启动 payload 透传 `agentInstanceId` |

---

### Task 1: 扩展 Task 数据模型并持久化 `agentInstanceId`

**Files:**
- Modify: `src/core/api-contract.ts`
- Modify: `src/core/task-board-mutations.ts`
- Modify: `web-ui/src/types/board.ts`
- Modify: `web-ui/src/state/board-state.ts`
- Test: `test/runtime/task-board-mutations.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
it("persists agentInstanceId on the card when creating a task", () => {
	const created = addTaskToColumn(
		createBoard(),
		"backlog",
		{
			prompt: "Task with instance override",
			baseRef: "main",
			agentId: "claude",
			agentInstanceId: "claude-kimi",
		},
		() => "aaaaa111",
	);

	expect(created.task.agentId).toBe("claude");
	expect(created.task.agentInstanceId).toBe("claude-kimi");
});

it("updates agentInstanceId from undefined to a value", () => {
	const created = addTaskToColumn(createBoard(), "backlog", { prompt: "Task", baseRef: "main" }, () => "aaaaa111");

	const updated = updateTask(created.board, created.task.id, {
		prompt: "Task",
		baseRef: "main",
		agentId: "claude",
		agentInstanceId: "claude-theta",
	});

	expect(updated.updated).toBe(true);
	expect(updated.task?.agentInstanceId).toBe("claude-theta");
});

it("clears agentInstanceId when update input provides null", () => {
	const created = addTaskToColumn(
		createBoard(),
		"backlog",
		{
			prompt: "Task",
			baseRef: "main",
			agentId: "codex",
			agentInstanceId: "codex-default",
		},
		() => "aaaaa111",
	);

	const updated = updateTask(created.board, created.task.id, {
		prompt: "Task",
		baseRef: "main",
		agentId: "codex",
		agentInstanceId: null,
	});

	expect(updated.task?.agentInstanceId).toBeUndefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/runtime/task-board-mutations.test.ts`
Expected: FAIL - `agentInstanceId` 相关断言失败，类型或 schema 尚未支持该字段

- [ ] **Step 3: 最小实现**

```ts
// src/core/api-contract.ts
export const runtimeBoardCardSchema = z
	.object({
		id: z.string(),
		title: z.string().optional(),
		prompt: z.string(),
		startInPlanMode: z.boolean(),
		scheduledStartTime: z.number().optional(),
		autoReviewEnabled: z.boolean().optional(),
		autoReviewMode: runtimeTaskAutoReviewModeSchema.optional(),
		images: z.array(runtimeTaskImageSchema).optional(),
		agentId: runtimeAgentIdSchema.optional(),
		agentInstanceId: runtimeAgentInstanceIdSchema.optional(),
		clineSettings: runtimeTaskClineSettingsSchema.optional(),
		clineProviderId: z.string().optional(),
		clineModelId: z.string().optional(),
		clineReasoningEffort: runtimeLegacyTaskClineReasoningEffortSchema.optional(),
		baseRef: z.string(),
		createdAt: z.number(),
		updatedAt: z.number(),
	})
	.transform(({ clineProviderId: _legacyProviderId, clineModelId: _legacyModelId, clineReasoningEffort: _legacyReasoningEffort, ...card }) => {
		const clineSettings = normalizeRuntimeTaskClineSettings({
			clineSettings: card.clineSettings,
			clineProviderId: _legacyProviderId,
			clineModelId: _legacyModelId,
			clineReasoningEffort: _legacyReasoningEffort,
		});
		return {
			...card,
			...(clineSettings !== undefined ? { clineSettings } : {}),
			title: resolveTaskTitle(card.title, card.prompt),
		};
	});

// web-ui/src/types/board.ts
import type {
	RuntimeAgentId,
	RuntimeAgentInstanceId,
	RuntimeBoardColumnId,
	RuntimeTaskAutoReviewMode,
	RuntimeTaskClineSettings,
	RuntimeTaskImage,
} from "@/runtime/types";

export interface BoardCard {
	id: string;
	title: string;
	prompt: string;
	startInPlanMode: boolean;
	scheduledStartTime?: number;
	autoReviewEnabled?: boolean;
	autoReviewMode?: TaskAutoReviewMode;
	images?: TaskImage[];
	agentId?: RuntimeAgentId;
	agentInstanceId?: RuntimeAgentInstanceId;
	clineSettings?: RuntimeTaskClineSettings;
	baseRef: string;
	createdAt: number;
	updatedAt: number;
}

// src/core/task-board-mutations.ts
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
	baseRef: string;
}

const task: RuntimeBoardCard = {
	id: explicitTaskId || createUniqueTaskId(existingIds, randomUuid),
	title: resolveTaskTitle(input.title, prompt),
	prompt,
	startInPlanMode: Boolean(input.startInPlanMode),
	...(input.scheduledStartTime !== undefined ? { scheduledStartTime: input.scheduledStartTime } : {}),
	autoReviewEnabled: Boolean(input.autoReviewEnabled),
	autoReviewMode: normalizeTaskAutoReviewMode(input.autoReviewMode),
	images: cloneTaskImages(input.images),
	...(input.agentId ? { agentId: input.agentId } : {}),
	...(input.agentInstanceId ? { agentInstanceId: input.agentInstanceId } : {}),
	...(input.clineSettings !== undefined ? { clineSettings: cloneTaskClineSettings(input.clineSettings) } : {}),
	baseRef,
	createdAt: now,
	updatedAt: now,
};

updatedTask = {
	...card,
	title: resolveTaskTitle(input.title, prompt),
	prompt,
	startInPlanMode: Boolean(input.startInPlanMode),
	...(input.scheduledStartTime !== undefined ? { scheduledStartTime: input.scheduledStartTime } : {}),
	autoReviewEnabled: Boolean(input.autoReviewEnabled),
	autoReviewMode: normalizeTaskAutoReviewMode(input.autoReviewMode),
	images: input.images === undefined ? card.images : cloneTaskImages(input.images),
	agentId: input.agentId === undefined ? card.agentId : (input.agentId ?? undefined),
	agentInstanceId:
		input.agentInstanceId === undefined ? card.agentInstanceId : (input.agentInstanceId ?? undefined),
	clineSettings:
		input.clineSettings === undefined
			? cloneTaskClineSettings(card.clineSettings)
			: input.clineSettings === null
				? undefined
				: cloneTaskClineSettings(input.clineSettings),
	baseRef,
	updatedAt: now,
};

// web-ui/src/state/board-state.ts
export interface TaskDraft {
	title?: string;
	prompt: string;
	startInPlanMode?: boolean;
	scheduledStartTime?: number;
	autoReviewEnabled?: boolean;
	autoReviewMode?: TaskAutoReviewMode;
	images?: TaskImage[];
	agentId?: RuntimeAgentId;
	agentInstanceId?: string;
	clineSettings?: RuntimeTaskClineSettings;
	baseRef: string;
}

return {
	id: typeof card.id === "string" && card.id ? card.id : createShortTaskId(createBrowserUuid),
	title,
	prompt,
	startInPlanMode: typeof card.startInPlanMode === "boolean" ? card.startInPlanMode : false,
	...(typeof card.scheduledStartTime === "number" ? { scheduledStartTime: card.scheduledStartTime } : {}),
	autoReviewEnabled: typeof card.autoReviewEnabled === "boolean" ? card.autoReviewEnabled : false,
	autoReviewMode: resolveTaskAutoReviewMode(typeof card.autoReviewMode === "string" ? (card.autoReviewMode as TaskAutoReviewMode) : undefined),
	images: normalizeTaskImages(card.images),
	baseRef,
	...(typeof card.agentId === "string" && card.agentId ? { agentId: card.agentId as RuntimeAgentId } : {}),
	...(typeof card.agentInstanceId === "string" && card.agentInstanceId.trim()
		? { agentInstanceId: card.agentInstanceId.trim() }
		: {}),
	...(clineSettings !== undefined ? { clineSettings } : {}),
	createdAt: typeof card.createdAt === "number" ? card.createdAt : now,
	updatedAt: typeof card.updatedAt === "number" ? card.updatedAt : now,
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/runtime/task-board-mutations.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/api-contract.ts src/core/task-board-mutations.ts web-ui/src/types/board.ts web-ui/src/state/board-state.ts test/runtime/task-board-mutations.test.ts
git commit -m "feat(task): persist agent instance overrides"
```

### Task 2: 升级 task editor 状态与 TaskCreateDialog 接线

**Files:**
- Modify: `web-ui/src/hooks/use-task-editor.ts`
- Modify: `web-ui/src/components/task-create-dialog.tsx`
- Modify: `web-ui/src/App.tsx`
- Test: `web-ui/src/hooks/use-task-editor.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("persists per-task agent instance override fields on each split task", async () => {
	let latestSnapshot: HookSnapshot | null = null;

	await act(async () => {
		root.render(<HookHarness initialBoard={createBoard()} onSnapshot={(snapshot) => { latestSnapshot = snapshot; }} />);
	});

	await act(async () => {
		requireSnapshot(latestSnapshot).handleOpenCreateTask();
		requireSnapshot(latestSnapshot).setNewTaskAgentId("claude");
		requireSnapshot(latestSnapshot).setNewTaskAgentInstanceId("claude-kimi");
	});

	let createdTaskIds: string[] = [];
	await act(async () => {
		createdTaskIds = requireSnapshot(latestSnapshot).handleCreateTasks(["Task A", "Task B"]);
	});

	expect(createdTaskIds).toHaveLength(2);
	const backlogCards = requireSnapshot(latestSnapshot).board.columns[0]?.cards ?? [];
	for (const card of backlogCards) {
		expect(card.agentId).toBe("claude");
		expect(card.agentInstanceId).toBe("claude-kimi");
	}
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix web-ui run test -- use-task-editor.test.tsx`
Expected: FAIL - `setNewTaskAgentInstanceId` 不存在，或 `agentInstanceId` 未写入卡片

- [ ] **Step 3: 最小实现**

```ts
// web-ui/src/hooks/use-task-editor.ts
const [newTaskAgentInstanceId, setNewTaskAgentInstanceId] = useState<string | undefined>(undefined);
const [editTaskAgentInstanceId, setEditTaskAgentInstanceId] = useState<string | undefined>(undefined);

setEditTaskAgentId(task.agentId);
setEditTaskAgentInstanceId(task.agentInstanceId);

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
	baseRef,
	scheduledStartTime: newTaskScheduledStartTime,
});

const updated = updateTask(currentBoard, savedTaskId, {
	title,
	prompt,
	startInPlanMode: editTaskStartInPlanMode,
	autoReviewEnabled: editTaskAutoReviewEnabled,
	autoReviewMode: editTaskAutoReviewMode,
	images: editTaskImages,
	agentId: editTaskAgentId,
	agentInstanceId: editTaskAgentInstanceId ?? null,
	clineSettings: editTaskClineSettings,
	baseRef,
	scheduledStartTime,
});

// web-ui/src/components/task-create-dialog.tsx
<TaskAgentModelPicker
	agentId={agentId}
	agentInstanceId={agentInstanceId}
	onAgentIdChange={onAgentIdChange}
	onAgentInstanceIdChange={onAgentInstanceIdChange}
	configuredAgents={configuredAgents}
	defaultAgentId={defaultAgentId}
	defaultAgentInstanceId={defaultAgentInstanceId}
	...
/>

// web-ui/src/App.tsx
<TaskCreateDialog
	...
	agentId={newTaskAgentId}
	agentInstanceId={newTaskAgentInstanceId}
	onAgentIdChange={setNewTaskAgentId}
	onAgentInstanceIdChange={setNewTaskAgentInstanceId}
	configuredAgents={runtimeProjectConfig?.configuredAgents ?? []}
	defaultAgentId={runtimeProjectConfig?.selectedAgentId ?? null}
	defaultAgentInstanceId={runtimeProjectConfig?.selectedAgentInstanceId ?? null}
	...
/>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix web-ui run test -- use-task-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add web-ui/src/hooks/use-task-editor.ts web-ui/src/components/task-create-dialog.tsx web-ui/src/App.tsx web-ui/src/hooks/use-task-editor.test.tsx
git commit -m "feat(task): wire agent instance overrides into editor state"
```

### Task 3: 将 Agent picker 从类型列表升级为实例列表

**Files:**
- Modify: `web-ui/src/components/task-agent-model-picker.tsx`
- Test: `web-ui/src/components/task-agent-model-picker.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("builds instance options from configured agents", async () => {
	const { useTaskAgentModelPicker } = await import("@/components/task-agent-model-picker");
	let snapshot: UseTaskAgentModelPickerResult | null = null;

	function Harness() {
		const result = useTaskAgentModelPicker({
			active: true,
			workspaceId: null,
			agentId: "claude",
			agentInstanceId: "claude-kimi",
			configuredAgents: [
				{ id: "claude-default", type: "claude", alias: null, command: "claude" },
				{ id: "claude-kimi", type: "claude", alias: "Claude Code KIMI", command: "claude --model kimi-k2.6" },
			],
			defaultAgentId: "claude",
			defaultAgentInstanceId: "claude-default",
			defaultProviderId: null,
			defaultModelId: null,
		});
		useEffect(() => {
			snapshot = result;
		});
		return null;
	}

	await act(async () => root.render(<Harness />));
	expect(snapshot?.agentOptions).toEqual([
		{ value: "", label: "使用全局默认（Claude Code）" },
		{ value: "claude-default", label: "claude / Claude Code" },
		{ value: "claude-kimi", label: "Claude Code KIMI" },
	]);
});

it("returns a disabled-only option when no configured agents exist", async () => {
	const { useTaskAgentModelPicker } = await import("@/components/task-agent-model-picker");
	let snapshot: UseTaskAgentModelPickerResult | null = null;

	function Harness() {
		const result = useTaskAgentModelPicker({
			active: true,
			workspaceId: null,
			agentId: undefined,
			agentInstanceId: undefined,
			configuredAgents: [],
			defaultAgentId: "claude",
			defaultAgentInstanceId: "claude-default",
			defaultProviderId: null,
			defaultModelId: null,
		});
		useEffect(() => {
			snapshot = result;
		});
		return null;
	}

	await act(async () => root.render(<Harness />));
	expect(snapshot?.agentOptions).toEqual([{ value: "", label: "使用全局默认（Claude Code）" }]);
	expect(snapshot?.agentOptionsDisabled).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix web-ui run test -- task-agent-model-picker.test.tsx`
Expected: FAIL - hook 仍然只基于 `getRuntimeLaunchSupportedAgentCatalog()` 产出类型级选项

- [ ] **Step 3: 最小实现**

```ts
// web-ui/src/components/task-agent-model-picker.tsx
import { getRuntimeAgentCatalogEntry } from "@runtime-agent-catalog";
import type { RuntimeAgentId, RuntimeAgentInstanceId, RuntimeConfiguredAgent } from "@/runtime/types";

export interface UseTaskAgentModelPickerInput {
	active: boolean;
	workspaceId: string | null;
	agentId: RuntimeAgentId | undefined;
	agentInstanceId?: RuntimeAgentInstanceId | undefined;
	configuredAgents: RuntimeConfiguredAgent[];
	clineSettings?: RuntimeTaskClineSettings;
	defaultAgentId?: RuntimeAgentId | null;
	defaultAgentInstanceId?: RuntimeAgentInstanceId | null;
	defaultProviderId?: string | null;
	defaultModelId?: string | null;
}

export interface UseTaskAgentModelPickerResult {
	agentOptions: Array<{ value: string; label: string }>;
	agentOptionsDisabled: boolean;
	clineProviderOptions: Array<{ value: string; label: string }>;
	clineModelOptions: Array<{ value: string; label: string }>;
	effectiveDefaultModelId: string | null;
	providerModels: RuntimeClineProviderModel[];
	isLoadingProviders: boolean;
	isLoadingModels: boolean;
	providerDefaultModels: Record<string, string>;
}

const effectiveAgentId =
	agentInstanceId
		? configuredAgents.find((agent) => agent.id === agentInstanceId)?.type ?? agentId ?? defaultAgentId ?? null
		: agentId ?? defaultAgentId ?? null;

const agentOptions = useMemo(() => {
	const defaultAgentLabel =
		(defaultAgentId ? getRuntimeAgentCatalogEntry(defaultAgentId)?.label : null) ?? "全局默认";
	return [
		{ value: "", label: `使用全局默认（${defaultAgentLabel}）` },
		...configuredAgents.map((agent) => {
			const defaultLabel = getRuntimeAgentCatalogEntry(agent.type)?.label ?? agent.type;
			return {
				value: agent.id,
				label: agent.alias ?? `${agent.type} / ${defaultLabel}`,
			};
		}),
	];
}, [configuredAgents, defaultAgentId]);

const agentOptionsDisabled = configuredAgents.length === 0;

// 组件 props
agentInstanceId?: RuntimeAgentInstanceId | undefined;
onAgentInstanceIdChange: (value: RuntimeAgentInstanceId | undefined) => void;

<NativeSelect
	value={agentInstanceId ?? ""}
	onChange={(event) => {
		const nextInstanceId = event.target.value.trim() || undefined;
		onAgentInstanceIdChange(nextInstanceId);
		const nextAgentType =
			nextInstanceId === undefined
				? undefined
				: configuredAgents.find((agent) => agent.id === nextInstanceId)?.type;
		onAgentIdChange(nextAgentType);
	}}
	disabled={agentOptionsDisabled}
	options={agentOptions}
/>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix web-ui run test -- task-agent-model-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add web-ui/src/components/task-agent-model-picker.tsx web-ui/src/components/task-agent-model-picker.test.tsx
git commit -m "feat(task): show agent instance overrides in picker"
```

### Task 4: 启动 Task 时优先传 `agentInstanceId`

**Files:**
- Modify: `web-ui/src/hooks/use-task-sessions.ts`
- Test: `web-ui/src/hooks/use-task-sessions.test.tsx`

- [ ] **Step 1: 编写失败测试**

```ts
it("forwards task agentInstanceId when starting a task", async () => {
	let latestSnapshot: HookSnapshot | null = null;

	await act(async () => {
		root.render(<HookHarness onSnapshot={(snapshot) => { latestSnapshot = snapshot; }} />);
	});

	await act(async () => {
		await latestSnapshot?.startTaskSession({
			...createTask(),
			agentId: "claude",
			agentInstanceId: "claude-kimi",
		});
	});

	expect(startTaskSessionMutateMock).toHaveBeenCalledWith({
		taskId: "task-1",
		prompt: "Resume me",
		taskTitle: "Resume me",
		images: undefined,
		startInPlanMode: false,
		resumeFromTrash: undefined,
		baseRef: "main",
		cols: 120,
		rows: 40,
		agentId: "claude",
		agentInstanceId: "claude-kimi",
		clineSettings: undefined,
	});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix web-ui run test -- use-task-sessions.test.tsx`
Expected: FAIL - mutate payload 里缺少 `agentInstanceId`

- [ ] **Step 3: 最小实现**

```ts
// web-ui/src/hooks/use-task-sessions.ts
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
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix web-ui run test -- use-task-sessions.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add web-ui/src/hooks/use-task-sessions.ts web-ui/src/hooks/use-task-sessions.test.tsx
git commit -m "feat(task): send agent instance override on start"
```

---

## 验证方案

- 自动化测试:
  - `npx vitest run test/runtime/task-board-mutations.test.ts`
  - `npm --prefix web-ui run test -- task-agent-model-picker.test.tsx use-task-editor.test.tsx use-task-sessions.test.tsx`
  - `npm run typecheck`
  - `npm --prefix web-ui run typecheck`

- 手工验证:
  - 在设置页准备两个 Claude 实例，例如 `claude-default` 与别名为 `Claude Code KIMI` 的实例
  - 打开 New Task 对话框，展开 `Override Agent Settings`
  - 确认 Agent 下拉展示实例别名，而不是单纯 `cline/claude/codex/kimi`
  - 选择 `Claude Code KIMI` 创建 Task，保存后在卡片 JSON 中确认 `agentInstanceId` 已持久化
  - 启动该 Task，检查 runtime `startTaskSession` 请求体包含 `agentInstanceId`
  - 对旧卡片（只有 `agentId` 没有 `agentInstanceId`）执行启动，确认仍能正常 fallback 到 `resolveSelectedAgentInstanceId()`
