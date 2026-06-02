# Settings - Agent 管理功能增强 实现计划

> **Issue:** #7 | **链接:** https://code.alipay.com/antchain_efficiency/dtazzi_cline/issues/7
> **生成时间:** 2026-05-21
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 将 Settings 中的 Agent 配置从固定内置 Agent 单选升级为可管理的 Agent 实例列表，支持删除、别名、自定义 command、多个同类型实例。

**技术方案:** 采用已确认的方案 B：Agent 实例模型。先扩展 contract 与 runtime config，持久化 `configuredAgents` 与 `selectedAgentInstanceId`，再让 `agent-registry` 按实例解析 command，最后重构 Settings 的 Agent 区块为增删改列表。保留 `selectedAgentId` 作为兼容字段，降低现有任务卡片、onboarding、home agent 链路的迁移风险。

**预估工作量:** 中等偏上，2-3 人天。

---

## 代码探索结论

- 技术栈：TypeScript ESM + React + Vitest，包管理使用 npm。
- 现有 contract：`src/core/api-contract.ts:74` 定义 `RuntimeAgentId`，`src/core/api-contract.ts:931-973` 定义 `RuntimeAgentDefinition`、`RuntimeConfigResponse`、`RuntimeConfigSaveRequest`。
- 现有配置：`src/config/runtime-config.ts:13-51` 只保存 `selectedAgentId` 等全局偏好；`src/config/runtime-config.ts:274-307` 将旧 config 归一化为 `RuntimeConfigState`。
- 现有 agent 列表：`src/terminal/agent-registry.ts:64-99` 从固定 catalog 生成列表并按 `selectedAgentId` 解析命令。
- 现有启动链路：`src/trpc/runtime-api.ts:196-284` 以 `agentId` 解析 Cline/native agent 路径，`src/terminal/session-manager.ts:335-349` 接收最终 binary/args。
- 现有 Settings UI：`web-ui/src/components/runtime-settings-dialog.tsx:360-940` 维护 `selectedAgentId` 状态，并在 General 区块渲染单选 `AgentRow` 列表。
- 现有测试：后端测试集中在 `test/runtime/config/runtime-config.test.ts` 与 `test/runtime/terminal/agent-registry.test.ts`；前端设置页测试在 `web-ui/src/components/runtime-settings-dialog.test.tsx`。

## 实现决策记录

1. 实现路径选择：不在旧 `RuntimeAgentId` 上打补丁，正式引入 Agent 实例模型。`RuntimeAgentId` 保留为 agent type，新增 instance id 承载多实例能力。
2. 文件结构设计：新增共享 helper 集中处理 configured agents 归一化和 command 解析，避免把复杂逻辑塞进 `runtime-config.ts` 或 Settings 组件。
3. 接口与数据模型设计：新增 `RuntimeAgentInstanceId = string`、`RuntimeConfiguredAgent`、`RuntimeConfigurableAgentType`，扩展 `RuntimeAgentDefinition` 为实例视图。
4. 依赖关系与排序：先 contract/config，后 agent-registry/runtime-api，最后 UI。UI 依赖前两层响应结构，不能先做。
5. 测试策略：每个共享行为先用后端单元测试锁住；Settings UI 用 jsdom 测新增、删除、别名展示；最后跑 typecheck 和定向测试。
6. 关键风险：`selectedAgentId` 被大量调用方使用，第一版实现保留兼容字段，新增 `selectedAgentInstanceId`，并让二者在 normalize 中保持一致。

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts:74-75,931-973,987` | 增加 agent instance/type schemas，扩展 config contract |
| Create | `src/config/runtime-agent-config.ts` | Agent 实例归一化、默认实例生成、command 解析 helper |
| Modify | `src/config/runtime-config.ts:13-51,274-307,319-633` | 持久化 configured agents 与 selected instance，兼容旧配置 |
| Modify | `src/terminal/agent-registry.ts:11-129` | 按 agent instance 构造列表与解析启动命令 |
| Modify | `src/trpc/runtime-api.ts:196-284` | 默认启动从 selected instance 解析，保留 card agentId 兼容 |
| Modify | `web-ui/src/runtime/runtime-config-query.ts:39-52` | 保存 configured agents 与 selected instance |
| Modify | `web-ui/src/components/runtime-settings-dialog.tsx:56-940` | Agent 区块改为实例 CRUD UI |
| Modify | `web-ui/src/runtime/native-agent.ts` | 按 selected agent type 判断 Cline/native readiness |
| Test | `test/runtime/config/runtime-config.test.ts` | 配置迁移、删除兜底、多实例保存 |
| Test | `test/runtime/terminal/agent-registry.test.ts` | 实例列表、alias、command 解析 |
| Test | `web-ui/src/components/runtime-settings-dialog.test.tsx` | 新增、删除、别名、最后实例不可删 |

---

### Task 1: Contract 与 Agent 配置模型

**Files:**
- Modify: `src/core/api-contract.ts`
- Create: `src/config/runtime-agent-config.ts`
- Modify: `src/config/runtime-config.ts`
- Test: `test/runtime/config/runtime-config.test.ts`

- [ ] **Step 1: 编写失败测试**

  在 `test/runtime/config/runtime-config.test.ts` 增加以下用例，使用现有临时 HOME / temp dir helper 风格：

  ```ts
  it("migrates legacy selectedAgentId into configured agent instances", async () => {
  	await withTemporaryHome(async () => {
  		const workspacePath = createGitWorkspace();
  		writeFileSync(
  			getRuntimeGlobalConfigPath(),
  			JSON.stringify({ selectedAgentId: "claude" }, null, 2),
  			"utf8",
  		);

  		const config = await loadRuntimeConfig(workspacePath);

  		expect(config.selectedAgentId).toBe("claude");
  		expect(config.selectedAgentInstanceId).toBe("claude");
  		expect(config.configuredAgents.some((agent) => agent.id === "claude" && agent.type === "claude")).toBe(true);
  	});
  });

  it("normalizes custom agent instances and preserves multiple agents with the same type", async () => {
  	await withTemporaryHome(async () => {
  		const workspacePath = createGitWorkspace();
  		await updateRuntimeConfig(workspacePath, {
  			selectedAgentInstanceId: "claude-kimi",
  			configuredAgents: [
  				{
  					id: "claude-theta",
  					type: "claude",
  					alias: "Claude Code Theta",
  					command: 'ANTHROPIC_BASE_URL="https://antchat.alipay.com/api/anthropic" claude --dangerously-skip-permissions --model GLM-5',
  				},
  				{
  					id: "claude-kimi",
  					type: "claude",
  					alias: "Claude Code KIMI",
  					command: 'ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1" claude --dangerously-skip-permissions --model kimi-k2.6',
  				},
  			],
  		});

  		const config = await loadRuntimeConfig(workspacePath);

  		expect(config.selectedAgentId).toBe("claude");
  		expect(config.selectedAgentInstanceId).toBe("claude-kimi");
  		expect(config.configuredAgents.map((agent) => agent.id)).toEqual(["claude-theta", "claude-kimi"]);
  	});
  });

  it("falls back when selected agent instance is missing and keeps at least one instance", async () => {
  	await withTemporaryHome(async () => {
  		const workspacePath = createGitWorkspace();
  		writeFileSync(
  			getRuntimeGlobalConfigPath(),
  			JSON.stringify({
  				selectedAgentInstanceId: "missing",
  				configuredAgents: [],
  			}, null, 2),
  			"utf8",
  		);

  		const config = await loadRuntimeConfig(workspacePath);

  		expect(config.configuredAgents.length).toBeGreaterThan(0);
  		expect(config.configuredAgents.some((agent) => agent.id === config.selectedAgentInstanceId)).toBe(true);
  	});
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/config/runtime-config.test.ts`

  Expected: FAIL - `selectedAgentInstanceId` 和 `configuredAgents` 字段尚不存在。

- [ ] **Step 3: 扩展 API contract**

  在 `src/core/api-contract.ts` 中新增 schemas：

  ```ts
  export const runtimeConfigurableAgentTypeSchema = z.enum(["cline", "claude", "codex", "kimi"]);
  export type RuntimeConfigurableAgentType = z.infer<typeof runtimeConfigurableAgentTypeSchema>;

  export const runtimeAgentInstanceIdSchema = z.string().min(1);
  export type RuntimeAgentInstanceId = z.infer<typeof runtimeAgentInstanceIdSchema>;

  export const runtimeConfiguredAgentSchema = z.object({
  	id: runtimeAgentInstanceIdSchema,
  	type: runtimeConfigurableAgentTypeSchema,
  	alias: z.string().nullable(),
  	command: z.string().min(1),
  });
  export type RuntimeConfiguredAgent = z.infer<typeof runtimeConfiguredAgentSchema>;
  ```

  将 `runtimeAgentDefinitionSchema` 扩展为实例视图：

  ```ts
  export const runtimeAgentDefinitionSchema = z.object({
  	id: runtimeAgentInstanceIdSchema,
  	type: runtimeConfigurableAgentTypeSchema,
  	label: z.string(),
  	defaultLabel: z.string(),
  	alias: z.string().nullable(),
  	binary: z.string(),
  	command: z.string(),
  	defaultArgs: z.array(z.string()),
  	installed: z.boolean(),
  	configured: z.boolean(),
  	builtin: z.boolean(),
  });
  ```

  将 `runtimeConfigResponseSchema` 和 `runtimeConfigSaveRequestSchema` 增加：

  ```ts
  selectedAgentInstanceId: runtimeAgentInstanceIdSchema,
  configuredAgents: z.array(runtimeConfiguredAgentSchema),
  ```

  保存请求中这两个字段应为 optional，保留 `selectedAgentId` optional 做兼容。

- [ ] **Step 4: 新增 runtime-agent-config helper**

  新建 `src/config/runtime-agent-config.ts`，集中放置以下逻辑：

  ```ts
  import { randomUUID } from "node:crypto";

  import { getRuntimeAgentCatalogEntry, getRuntimeLaunchSupportedAgentCatalog } from "../core/agent-catalog";
  import type { RuntimeAgentId, RuntimeConfigurableAgentType, RuntimeConfiguredAgent } from "../core/api-contract";

  export const DEFAULT_SELECTED_AGENT_INSTANCE_ID = "cline";
  export const CONFIGURABLE_AGENT_TYPES: readonly RuntimeConfigurableAgentType[] = ["cline", "claude", "codex", "kimi"];

  export function isConfigurableAgentType(value: unknown): value is RuntimeConfigurableAgentType {
  	return value === "cline" || value === "claude" || value === "codex" || value === "kimi";
  }

  export function createDefaultConfiguredAgents(): RuntimeConfiguredAgent[] {
  	return getRuntimeLaunchSupportedAgentCatalog()
  		.filter((entry) => isConfigurableAgentType(entry.id))
  		.map((entry) => ({
  			id: entry.id,
  			type: entry.id,
  			alias: null,
  			command: [entry.binary, ...entry.baseArgs].join(" ").trim(),
  		}));
  }

  export function createAgentInstanceId(type: RuntimeConfigurableAgentType): string {
  	return `${type}-${randomUUID().slice(0, 8)}`;
  }

  export function normalizeConfiguredAgents(value: unknown): RuntimeConfiguredAgent[] {
  	if (!Array.isArray(value)) {
  		return createDefaultConfiguredAgents();
  	}
  	const seen = new Set<string>();
  	const normalized: RuntimeConfiguredAgent[] = [];
  	for (const item of value) {
  		if (!item || typeof item !== "object") {
  			continue;
  		}
  		const candidate = item as Partial<RuntimeConfiguredAgent>;
  		const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  		const command = typeof candidate.command === "string" ? candidate.command.trim() : "";
  		if (!id || seen.has(id) || !isConfigurableAgentType(candidate.type) || !command) {
  			continue;
  		}
  		seen.add(id);
  		const alias = typeof candidate.alias === "string" && candidate.alias.trim().length > 0
  			? candidate.alias.trim()
  			: null;
  		normalized.push({ id, type: candidate.type, alias, command });
  	}
  	return normalized.length > 0 ? normalized : createDefaultConfiguredAgents();
  }

  export function normalizeSelectedAgentInstanceId(
  	value: unknown,
  	agents: readonly RuntimeConfiguredAgent[],
  	legacySelectedAgentId: RuntimeAgentId,
  ): string {
  	if (typeof value === "string" && agents.some((agent) => agent.id === value)) {
  		return value;
  	}
  	return agents.find((agent) => agent.type === legacySelectedAgentId)?.id ?? agents[0]?.id ?? DEFAULT_SELECTED_AGENT_INSTANCE_ID;
  }

  export function getAgentTypeForInstance(
  	agents: readonly RuntimeConfiguredAgent[],
  	instanceId: string,
  ): RuntimeConfigurableAgentType {
  	return agents.find((agent) => agent.id === instanceId)?.type ?? agents[0]?.type ?? "cline";
  }

  export function getAgentDefaultLabel(type: RuntimeConfigurableAgentType): string {
  	return getRuntimeAgentCatalogEntry(type)?.label ?? type;
  }
  ```

- [ ] **Step 5: 修改 runtime-config 持久化**

  修改 `src/config/runtime-config.ts`：

  - `RuntimeGlobalConfigFileShape` 增加 `selectedAgentInstanceId?: string` 和 `configuredAgents?: RuntimeConfiguredAgent[]`
  - `RuntimeConfigState` 增加 `selectedAgentInstanceId` 与 `configuredAgents`
  - `RuntimeConfigUpdateInput` 增加同名 optional 字段
  - `toRuntimeConfigState()` 先 normalize `selectedAgentId`，再 normalize agents 与 selected instance，最后用 selected instance 反推兼容的 `selectedAgentId`
  - `writeRuntimeGlobalConfigFile()` 合并保存新字段
  - `updateRuntimeConfig()`、`updateGlobalRuntimeConfig()` 的 `hasChanges` 纳入新字段

  关键代码形态：

  ```ts
  const configuredAgents = normalizeConfiguredAgents(globalConfig?.configuredAgents);
  const selectedAgentInstanceId = normalizeSelectedAgentInstanceId(
  	globalConfig?.selectedAgentInstanceId,
  	configuredAgents,
  	normalizeAgentId(globalConfig?.selectedAgentId),
  );
  const selectedAgentId = getAgentTypeForInstance(configuredAgents, selectedAgentInstanceId);
  ```

- [ ] **Step 6: 运行测试确认通过**

  Run: `npx vitest run test/runtime/config/runtime-config.test.ts`

  Expected: PASS

- [ ] **Step 7: 提交**

  ```bash
  git add src/core/api-contract.ts src/config/runtime-agent-config.ts src/config/runtime-config.ts test/runtime/config/runtime-config.test.ts
  git commit -m "feat(config): add configurable agent instances"
  ```

---

### Task 2: Agent Registry 按实例展示和解析命令

**Files:**
- Modify: `src/terminal/agent-registry.ts`
- Test: `test/runtime/terminal/agent-registry.test.ts`

- [ ] **Step 1: 编写失败测试**

  在 `test/runtime/terminal/agent-registry.test.ts` 增加：

  ```ts
  it("builds agent definitions from configured instances with aliases", () => {
  	const response = buildRuntimeConfigResponse(
  		createRuntimeConfigState({
  			selectedAgentId: "claude",
  			selectedAgentInstanceId: "claude-kimi",
  			configuredAgents: [
  				{
  					id: "claude-kimi",
  					type: "claude",
  					alias: "Claude Code KIMI",
  					command: 'ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1" claude --model kimi-k2.6',
  				},
  			],
  		}),
  		createClineProviderSettings(),
  	);

  	expect(response.selectedAgentInstanceId).toBe("claude-kimi");
  	expect(response.agents[0]).toMatchObject({
  		id: "claude-kimi",
  		type: "claude",
  		label: "Claude Code KIMI",
  		defaultLabel: "Claude Code",
  		alias: "Claude Code KIMI",
  		command: 'ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1" claude --model kimi-k2.6',
  		configured: true,
  	});
  });

  it("resolves a configured agent command into env, binary, and args", () => {
  	const resolved = resolveAgentCommand(
  		createRuntimeConfigState({
  			selectedAgentId: "claude",
  			selectedAgentInstanceId: "claude-theta",
  			configuredAgents: [
  				{
  					id: "claude-theta",
  					type: "claude",
  					alias: "Claude Code Theta",
  					command: 'ANTHROPIC_BASE_URL="https://antchat.alipay.com/api/anthropic" claude --dangerously-skip-permissions --model GLM-5',
  				},
  			],
  		}),
  	);

  	expect(resolved).toMatchObject({
  		agentInstanceId: "claude-theta",
  		agentId: "claude",
  		label: "Claude Code Theta",
  		binary: "claude",
  		args: ["--dangerously-skip-permissions", "--model", "GLM-5"],
  		env: {
  			ANTHROPIC_BASE_URL: "https://antchat.alipay.com/api/anthropic",
  		},
  	});
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/terminal/agent-registry.test.ts`

  Expected: FAIL - registry 仍按 catalog 生成 agent 列表，且不能解析 env 前缀命令。

- [ ] **Step 3: 实现 shell-like command 解析**

  在 `src/terminal/agent-registry.ts` 添加小型 parser，支持 issue 示例所需语法：

  ```ts
  interface ParsedAgentCommand {
  	env: Record<string, string>;
  	binary: string;
  	args: string[];
  }

  function tokenizeCommand(command: string): string[] {
  	const tokens: string[] = [];
  	let current = "";
  	let quote: "'" | '"' | null = null;
  	for (let index = 0; index < command.length; index += 1) {
  		const char = command[index] ?? "";
  		if (quote) {
  			if (char === quote) {
  				quote = null;
  			} else {
  				current += char;
  			}
  			continue;
  		}
  		if (char === "'" || char === '"') {
  			quote = char;
  			continue;
  		}
  		if (/\s/.test(char)) {
  			if (current.length > 0) {
  				tokens.push(current);
  				current = "";
  			}
  			continue;
  		}
  		current += char;
  	}
  	if (current.length > 0) {
  		tokens.push(current);
  	}
  	return tokens;
  }

  function parseConfiguredAgentCommand(command: string): ParsedAgentCommand | null {
  	const tokens = tokenizeCommand(command.trim());
  	const env: Record<string, string> = {};
  	let binaryIndex = 0;
  	while (binaryIndex < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[binaryIndex] ?? "")) {
  		const token = tokens[binaryIndex] ?? "";
  		const separatorIndex = token.indexOf("=");
  		env[token.slice(0, separatorIndex)] = token.slice(separatorIndex + 1);
  		binaryIndex += 1;
  	}
  	const binary = tokens[binaryIndex];
  	if (!binary) {
  		return null;
  	}
  	return {
  		env,
  		binary,
  		args: tokens.slice(binaryIndex + 1),
  	};
  }
  ```

- [ ] **Step 4: 改造 registry 输出**

  - `ResolvedAgentCommand` 增加 `agentInstanceId`、`env`
  - `getCuratedDefinitions()` 改为遍历 `runtimeConfig.configuredAgents`
  - `resolveAgentCommand()` 通过 `selectedAgentInstanceId` 查实例，解析 `command`
  - `installed` 判断用解析后的 binary；`cline` 保持 installed true
  - alias 展示逻辑：`label = alias ?? defaultLabel`

- [ ] **Step 5: 运行测试确认通过**

  Run: `npx vitest run test/runtime/terminal/agent-registry.test.ts`

  Expected: PASS

- [ ] **Step 6: 提交**

  ```bash
  git add src/terminal/agent-registry.ts test/runtime/terminal/agent-registry.test.ts
  git commit -m "feat(agent): resolve configured agent instances"
  ```

---

### Task 3: Runtime 启动链路兼容实例选择

**Files:**
- Modify: `src/core/api-contract.ts`
- Modify: `src/trpc/runtime-api.ts`
- Modify: `src/terminal/session-manager.ts` if request types need env wiring confirmation
- Test: focused runtime tests if present; otherwise `test/runtime/terminal/agent-registry.test.ts`

- [ ] **Step 1: 编写失败测试或扩展现有测试**

  如果 `runtime-api` 已有 startTaskSession 单元测试，在其中增加：

  ```ts
  it("starts native agents with the selected configured instance command", async () => {
  	const result = await runtimeApi.startTaskSession(workspaceScope, {
  		taskId: "task-1",
  		prompt: "hello",
  		baseRef: "main",
  	});

  	expect(result.ok).toBe(true);
  	expect(startTaskSessionMock).toHaveBeenCalledWith(
  		expect.objectContaining({
  			agentId: "claude",
  			binary: "claude",
  			args: ["--model", "kimi-k2.6"],
  			env: { ANTHROPIC_BASE_URL: "https://api.moonshot.cn/v1" },
  		}),
  	);
  });
  ```

  如果没有 runtime-api 测试基础，先在 `test/runtime/terminal/agent-registry.test.ts` 保留 registry 覆盖，本 Task 以 typecheck 和手工验证为主。

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/terminal/agent-registry.test.ts`

  Expected: PASS for registry, but runtime typecheck fails until request wiring includes env and selected instance fields.

- [ ] **Step 3: 扩展 start request 兼容字段**

  在 `src/core/api-contract.ts` 中让 `runtimeTaskSessionStartRequestSchema` 继续支持 `agentId`，并新增 optional：

  ```ts
  agentInstanceId: runtimeAgentInstanceIdSchema.optional(),
  ```

  说明：

  - `agentId` 保留给任务卡片旧 override
  - `agentInstanceId` 用于新 UI 或后续 per-task instance override
  - 当前 issue 不要求任务卡片改为实例选择，可先只使用 workspace 默认 instance

- [ ] **Step 4: 修改 runtime-api 解析**

  在 `src/trpc/runtime-api.ts` 的 startTaskSession 中：

  - `effectiveAgentId` 保留用于 Cline 判断和旧卡片兼容
  - 默认路径使用 `scopedRuntimeConfig.selectedAgentInstanceId`
  - 若 body 带旧 `agentId` 且与默认不同，构造临时 selected instance 时选择同 type 的第一个实例
  - 调用 `resolveAgentCommand()` 后，把 `resolved.env` 传给 `terminalManager.startTaskSession`

  关键代码形态：

  ```ts
  const resolved = resolveAgentCommand(resolvedConfig);
  if (!resolved) {
  	return {
  		ok: false,
  		summary: null,
  		error: "No runnable agent command is configured. Open Settings, install a supported CLI, and select it.",
  	};
  }
  const summary = await terminalManager.startTaskSession({
  	taskId: body.taskId,
  	agentId: resolved.agentId,
  	binary: resolved.binary,
  	args: resolved.args,
  	env: resolved.env,
  	autonomousModeEnabled: scopedRuntimeConfig.agentAutonomousModeEnabled,
  	cwd: taskCwd,
  	prompt: body.prompt,
  	images: body.images,
  	startInPlanMode: body.startInPlanMode,
  	resumeFromTrash: body.resumeFromTrash,
  	cols: body.cols,
  	rows: body.rows,
  	workspaceId: workspaceScope.workspaceId,
  });
  ```

- [ ] **Step 5: 运行验证**

  Run: `npm run typecheck`

  Expected: PASS

- [ ] **Step 6: 提交**

  ```bash
  git add src/core/api-contract.ts src/trpc/runtime-api.ts src/terminal/session-manager.ts
  git commit -m "feat(runtime): launch selected agent instances"
  ```

---

### Task 4: Settings Agent 实例 CRUD UI

**Files:**
- Modify: `web-ui/src/runtime/runtime-config-query.ts`
- Modify: `web-ui/src/components/runtime-settings-dialog.tsx`
- Test: `web-ui/src/components/runtime-settings-dialog.test.tsx`

- [ ] **Step 1: 编写失败测试**

  在 `web-ui/src/components/runtime-settings-dialog.test.tsx` 增加：

  ```tsx
  it("renders configured agent aliases and custom commands", async () => {
  	await act(async () => {
  		root.render(
  			<RuntimeSettingsDialog
  				open={true}
  				workspaceId={"workspace-1"}
  				initialConfig={configuredAgentConfig}
  				onOpenChange={() => {}}
  			/>,
  		);
  	});

  	expect(document.body.textContent).toContain("Claude Code KIMI");
  	expect(document.body.textContent).toContain("--model kimi-k2.6");
  });

  it("adds a second agent with the same type and saves it", async () => {
  	await act(async () => {
  		root.render(
  			<RuntimeSettingsDialog
  				open={true}
  				workspaceId={"workspace-1"}
  				initialConfig={configuredAgentConfig}
  				onOpenChange={() => {}}
  			/>,
  		);
  	});

  	await act(async () => {
  		findButtonByText(document.body, "Add Agent")?.click();
  	});

  	const aliasInput = document.body.querySelector<HTMLInputElement>('input[name="agent-alias"]');
  	const commandInput = document.body.querySelector<HTMLTextAreaElement>('textarea[name="agent-command"]');
  	expect(aliasInput).not.toBeNull();
  	expect(commandInput).not.toBeNull();

  	await act(async () => {
  		aliasInput!.value = "Claude Code Theta";
  		aliasInput!.dispatchEvent(new Event("input", { bubbles: true }));
  		commandInput!.value = 'ANTHROPIC_BASE_URL="https://antchat.alipay.com/api/anthropic" claude --model GLM-5';
  		commandInput!.dispatchEvent(new Event("input", { bubbles: true }));
  		findButtonByText(document.body, "Save")?.click();
  	});

  	expect(saveRuntimeConfigMock).toHaveBeenCalledWith(
  		"workspace-1",
  		expect.objectContaining({
  			configuredAgents: expect.arrayContaining([
  				expect.objectContaining({ alias: "Claude Code Theta", type: "claude" }),
  			]),
  		}),
  	);
  });

  it("prevents deleting the last agent instance", async () => {
  	await act(async () => {
  		root.render(
  			<RuntimeSettingsDialog
  				open={true}
  				workspaceId={"workspace-1"}
  				initialConfig={singleAgentConfig}
  				onOpenChange={() => {}}
  			/>,
  		);
  	});

  	const deleteButton = findButtonByAriaLabel(document.body, "Delete Cline");
  	expect(deleteButton).toBeDisabled();
  });
  ```

  测试需要把 `useRuntimeConfig` mock 的 `save` 暴露为 hoisted mock，便于断言保存 payload。

- [ ] **Step 2: 运行测试确认失败**

  Run: `npm --prefix web-ui run test -- runtime-settings-dialog.test.tsx`

  Expected: FAIL - UI 尚未渲染新增/删除/编辑控件。

- [ ] **Step 3: 扩展前端 save query 类型**

  修改 `web-ui/src/runtime/runtime-config-query.ts` 的 `saveRuntimeConfig()` input，增加：

  ```ts
  selectedAgentInstanceId?: string;
  configuredAgents?: RuntimeConfiguredAgent[];
  ```

  并从 `@/runtime/types` 引入 `RuntimeConfiguredAgent`。

- [ ] **Step 4: 重构 Settings Agent 状态**

  在 `web-ui/src/components/runtime-settings-dialog.tsx` 中：

  - 新增 `configuredAgents` state
  - 新增 `selectedAgentInstanceId` state
  - 用 `config.configuredAgents` 初始化
  - `hasUnsavedChanges` 比较 agents 和 selected instance
  - `handleSave()` 保存 `configuredAgents` 与 `selectedAgentInstanceId`
  - `selectedAgentId` 改为从当前 selected instance 的 `type` 推导，用于 Cline 专属设置区兼容

  建议 helper：

  ```ts
  function getSelectedAgentType(
  	agents: RuntimeConfiguredAgent[],
  	selectedAgentInstanceId: string,
  ): RuntimeAgentId {
  	return agents.find((agent) => agent.id === selectedAgentInstanceId)?.type ?? "cline";
  }
  ```

- [ ] **Step 5: 实现 Agent 实例列表组件**

  在同文件内替换 `AgentRow` 为实例 row，字段包括：

  - radio/check selected
  - 主标题：`agent.alias ?? defaultLabel`
  - 次级类型：`defaultLabel`
  - command mono 摘要
  - edit button
  - delete button

  删除规则：

  ```ts
  function deleteAgentInstance(agentId: string) {
  	setConfiguredAgents((current) => {
  		if (current.length <= 1) {
  			setSaveError("At least one agent instance is required.");
  			return current;
  		}
  		const nextAgents = current.filter((agent) => agent.id !== agentId);
  		setSelectedAgentInstanceId((selected) => {
  			if (selected !== agentId) {
  				return selected;
  			}
  			return nextAgents[0]?.id ?? selected;
  		});
  		return nextAgents;
  	});
  }
  ```

- [ ] **Step 6: 实现 Add/Edit 表单**

  使用现有 dark theme / Tailwind / Radix Select 风格：

  - 类型 select：`cline`、`claude`、`codex`、`kimi`
  - alias input
  - command textarea
  - Add Agent 按钮默认填对应 catalog command
  - Edit 保存时更新当前实例
  - command 为空时禁止保存并显示 `saveError`

  按钮使用现有 `Button`，图标用 lucide `Plus`、`Trash2`、`Pencil`。

- [ ] **Step 7: 运行测试确认通过**

  Run: `npm --prefix web-ui run test -- runtime-settings-dialog.test.tsx`

  Expected: PASS

- [ ] **Step 8: 提交**

  ```bash
  git add web-ui/src/runtime/runtime-config-query.ts web-ui/src/components/runtime-settings-dialog.tsx web-ui/src/components/runtime-settings-dialog.test.tsx
  git commit -m "feat(settings): manage agent instances"
  ```

---

### Task 5: 前端周边适配与整体验证

**Files:**
- Modify: `web-ui/src/runtime/native-agent.ts`
- Modify: `web-ui/src/hooks/use-home-agent-session.ts`
- Modify: `web-ui/src/components/task-agent-model-picker.tsx`
- Modify tests that construct `RuntimeConfigResponse`

- [ ] **Step 1: 编写/更新失败测试**

  更新以下测试 fixtures，让 `RuntimeConfigResponse` 都包含：

  ```ts
  selectedAgentInstanceId: selectedAgentId,
  configuredAgents: [
  	{
  		id: selectedAgentId,
  		type: selectedAgentId,
  		alias: null,
  		command: selectedAgentId,
  	},
  ],
  agents: [
  	{
  		id: selectedAgentId,
  		type: selectedAgentId,
  		label: selectedAgentId,
  		defaultLabel: selectedAgentId,
  		alias: null,
  		binary: selectedAgentId,
  		command: selectedAgentId,
  		defaultArgs: [],
  		installed: true,
  		configured: true,
  		builtin: true,
  	},
  ],
  ```

  覆盖文件优先级：

  - `web-ui/src/runtime/native-agent.test.ts`
  - `web-ui/src/runtime/use-runtime-config.test.tsx`
  - `web-ui/src/runtime/use-runtime-project-config.test.tsx`
  - `web-ui/src/hooks/use-home-agent-session.test.tsx`
  - `web-ui/src/hooks/use-git-actions.test.tsx`

- [ ] **Step 2: 运行测试确认失败**

  Run: `npm --prefix web-ui run test -- native-agent.test.ts use-runtime-config.test.tsx use-runtime-project-config.test.tsx use-home-agent-session.test.tsx`

  Expected: FAIL - fixtures/types still assume agent id equals instance id.

- [ ] **Step 3: 更新 native-agent helpers**

  在 `web-ui/src/runtime/native-agent.ts`：

  - 用 selected instance 找 agent definition
  - 判断 Cline 时看 `agent.type === "cline"`，兼容 fallback `selectedAgentId === "cline"`
  - readiness 判断遍历 `agents` 时看 `agent.type`

- [ ] **Step 4: 更新 Home Agent / Task UI 展示**

  - `web-ui/src/hooks/use-home-agent-session.ts` 的 home session id 暂时仍使用 `selectedAgentId` 以保留旧 session 兼容
  - 展示名称使用 `agents.find(agent => agent.id === selectedAgentInstanceId)?.label`
  - task agent picker 本期仍可按 agent type 展示，不新增 per-task instance override，避免扩大范围

- [ ] **Step 5: 运行自动化验证**

  Run:

  ```bash
  npm run typecheck
  npm --prefix web-ui run typecheck
  npx vitest run test/runtime/config/runtime-config.test.ts test/runtime/terminal/agent-registry.test.ts
  npm --prefix web-ui run test -- runtime-settings-dialog.test.tsx native-agent.test.ts use-runtime-config.test.tsx use-runtime-project-config.test.tsx use-home-agent-session.test.tsx
  ```

  Expected: PASS

- [ ] **Step 6: 手工验证**

  Run:

  ```bash
  npm run web:dev
  ```

  在浏览器打开 dev server：

  1. 打开 Settings
  2. 新增 `Claude Code` 实例，alias 为 `Claude Code Theta`
  3. command 填：`ANTHROPIC_BASE_URL="https://antchat.alipay.com/api/anthropic" claude --dangerously-skip-permissions --model GLM-5`
  4. 再新增第二个 `Claude Code` 实例，alias 为 `Claude Code KIMI`
  5. 设为默认，保存并重新打开 Settings
  6. 删除非默认实例
  7. 确认仅剩一个实例时删除按钮禁用

- [ ] **Step 7: 提交**

  ```bash
  git add web-ui/src/runtime/native-agent.ts web-ui/src/hooks/use-home-agent-session.ts web-ui/src/components/task-agent-model-picker.tsx web-ui/src/**/*.test.ts web-ui/src/**/*.test.tsx
  git commit -m "test(agent): cover configurable agent instance flows"
  ```

---

## 验证方案

- 后端类型检查: `npm run typecheck`
- 前端类型检查: `npm --prefix web-ui run typecheck`
- 后端定向测试: `npx vitest run test/runtime/config/runtime-config.test.ts test/runtime/terminal/agent-registry.test.ts`
- 前端定向测试: `npm --prefix web-ui run test -- runtime-settings-dialog.test.tsx native-agent.test.ts use-runtime-config.test.tsx use-runtime-project-config.test.tsx use-home-agent-session.test.tsx`
- 手工验证: 按 Task 5 Step 6 在 Settings 中完成新增、别名展示、多同类型实例、默认选择、删除、最后实例不可删除流程

## 规格覆盖自审查

- Agent 删除功能：Task 4 Step 5 + Task 5 手工验证覆盖
- Agent 别名字段：Task 1 数据模型 + Task 2 registry response + Task 4 UI 覆盖
- Agent 添加 UI：Task 4 Step 6 覆盖
- 内置 Agent 类型限制：Task 1 `RuntimeConfigurableAgentType` 限定为 `cline | claude | codex | kimi`
- 自定义 command：Task 1 持久化 + Task 2 解析 + Task 3 启动链路覆盖
- 多个同名 Agent：Task 1/2/4 测试覆盖两个 Claude 实例
- 最后一个 Agent 不允许删除：Task 4 删除规则与测试覆盖

## 已知边界

- 本计划不把任务卡片的 per-task agent picker 升级为实例选择，仍以 agent type 兼容旧卡片数据。
- 自定义 command parser 只覆盖常见 env 前缀、引号和空白分隔，足够支持 issue 示例；复杂 shell 表达式不作为本期目标。
- Cline 专属 provider settings 继续由现有 Cline 设置区管理，不并入通用 Agent 实例 command。
