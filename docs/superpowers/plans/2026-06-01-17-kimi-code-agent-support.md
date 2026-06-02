# 新增 kimi-code 类型 Agent 支持 实现计划

> **Issue:** #17 | **链接:** https://code.alipay.com/antchain_efficiency/dtazzi_cline/issues/17
> **生成时间:** 2026-06-01
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 在 dtazzi_cline 中新增第 5 种可配置 Agent 类型 `kimi-code`，与现有 `kimi` 并存，覆盖类型枚举、catalog、adapter、UI 选择器、测试与文档。
**技术方案:** 复用方案 A：枚举/catalog/config/adapter/UI 5 处扩展；将 `kimiAdapter` 重构为 `createKimiFamilyAdapter` 工厂以隔离 hook 目录（`~/.cline/kanban/hooks/kimi[/code]/`）与 user config 路径（`~/.kimi[-code]/config.toml`）。
**预估工作量:** 1.5 人天（后端 0.5d + 前端 0.5d + 测试 0.5d）/ 中等复杂度

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts:78-91` | 在两个 z.enum 中追加 `"kimi-code"` |
| Modify | `src/core/agent-catalog.ts:70-99` | catalog 加新条目，launch 支持列表加项 |
| Modify | `src/config/runtime-agent-config.ts:11-15` | 配置白名单 + type guard 加项 |
| Modify | `src/terminal/agent-session-adapters.ts:1548-1618` | 抽出 `createKimiFamilyAdapter`，新增 `kimiCodeAdapter`，ADAPTERS map 加键 |
| Modify | `web-ui/src/components/runtime-settings-dialog.tsx:175,925,1167` | settings 排序、handleAddAgent、type 下拉三处 |
| Modify | `test/runtime/terminal/agent-session-adapters.test.ts:417+` | 镜像现有 kimi 测试为 kimi-code |
| Modify | `test/runtime/terminal/agent-registry.test.ts` | 加 kimi-code 实例校验 |
| Modify | `test/runtime/config/runtime-agent-config.test.ts`（新文件可能） | 校验 `CONFIGURABLE_AGENT_TYPES` / `createDefaultConfiguredAgents` |

---

### Task 1: 扩展类型枚举（api-contract）

**Files:**
- Modify: `src/core/api-contract.ts`

- [ ] **Step 1: 编辑 `runtimeAgentIdSchema`（L78-88）**

  将
  ```typescript
  export const runtimeAgentIdSchema = z.enum([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "droid",
      "kiro",
      "cline",
      "kimi",
      "antcc",
  ]);
  ```
  修改为：
  ```typescript
  export const runtimeAgentIdSchema = z.enum([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "droid",
      "kiro",
      "cline",
      "kimi",
      "kimi-code",
      "antcc",
  ]);
  ```

- [ ] **Step 2: 编辑 `runtimeConfigurableAgentTypeSchema`（L91）**

  将
  ```typescript
  export const runtimeConfigurableAgentTypeSchema = z.enum(["cline", "claude", "codex", "kimi"]);
  ```
  修改为：
  ```typescript
  export const runtimeConfigurableAgentTypeSchema = z.enum(["cline", "claude", "codex", "kimi", "kimi-code"]);
  ```

- [ ] **Step 3: 类型检查**

  Run: `npm run typecheck`
  Expected: PASS（仅类型变更，全项目 type 推断应保持一致）

### Task 2: 扩展 Agent Catalog

**Files:**
- Modify: `src/core/agent-catalog.ts`

- [ ] **Step 1: 在 `RUNTIME_AGENT_CATALOG` 中追加条目（L76 之后）**

  在 `kimi` 条目之后、`antcc` 条目之前插入：
  ```typescript
  {
      id: "kimi-code",
      label: "Kimi Code",
      binary: "kimi",
      baseArgs: [],
      autonomousArgs: ["--afk"],
      installUrl: "https://github.com/MoonshotAI/kimi-code",
  },
  ```

- [ ] **Step 2: 扩展 `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS`（L89-99）**

  将
  ```typescript
  export const RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS: readonly RuntimeAgentId[] = [
      "cline",
      "claude",
      "codex",
      "droid",
      "kiro",
      "kimi",
      "antcc",
      // "opencode",
      // "gemini",
  ];
  ```
  修改为：
  ```typescript
  export const RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS: readonly RuntimeAgentId[] = [
      "cline",
      "claude",
      "codex",
      "droid",
      "kiro",
      "kimi",
      "kimi-code",
      "antcc",
      // "opencode",
      // "gemini",
  ];
  ```

- [ ] **Step 3: 类型检查**

  Run: `npm run typecheck`
  Expected: PASS

### Task 3: 扩展配置白名单

**Files:**
- Modify: `src/config/runtime-agent-config.ts`
- Create/Modify: `test/runtime/config/runtime-agent-config.test.ts`

- [ ] **Step 1: 编写测试 — 验证白名单包含 kimi-code**

  检查 `test/runtime/config/runtime-agent-config.test.ts` 是否存在，若不存在创建文件，加入以下 describe 块；若存在则在文件末尾追加：

  ```typescript
  import { describe, expect, it } from "vitest";

  import {
      CONFIGURABLE_AGENT_TYPES,
      createDefaultConfiguredAgents,
      isConfigurableAgentType,
      normalizeConfiguredAgents,
  } from "../../../src/config/runtime-agent-config";

  describe("runtime-agent-config kimi-code support", () => {
      it("includes kimi-code in CONFIGURABLE_AGENT_TYPES", () => {
          expect(CONFIGURABLE_AGENT_TYPES).toContain("kimi-code");
          expect(CONFIGURABLE_AGENT_TYPES).toHaveLength(5);
      });

      it("recognises kimi-code via isConfigurableAgentType", () => {
          expect(isConfigurableAgentType("kimi-code")).toBe(true);
          expect(isConfigurableAgentType("kimi-cli")).toBe(false);
          expect(isConfigurableAgentType("kimi")).toBe(true);
      });

      it("creates a default kimi-code instance", () => {
          const defaults = createDefaultConfiguredAgents();
          const kimiCode = defaults.find((agent) => agent.type === "kimi-code");
          expect(kimiCode).toBeDefined();
          expect(kimiCode?.id).toBe("kimi-code");
          expect(kimiCode?.command).toBe("kimi");
      });

      it("normalises a user-defined kimi-code instance", () => {
          const result = normalizeConfiguredAgents([
              { id: "my-kimi-code", type: "kimi-code", alias: "Local Kimi Code", command: "/opt/bin/kimi" },
          ]);
          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
              id: "my-kimi-code",
              type: "kimi-code",
              alias: "Local Kimi Code",
              command: "/opt/bin/kimi",
          });
      });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/config/runtime-agent-config.test.ts -t "kimi-code"`
  Expected: FAIL — `CONFIGURABLE_AGENT_TYPES` 不含 `kimi-code`

- [ ] **Step 3: 修改 `src/config/runtime-agent-config.ts`**

  将 L11
  ```typescript
  export const CONFIGURABLE_AGENT_TYPES: readonly RuntimeConfigurableAgentType[] = ["cline", "claude", "codex", "kimi"];
  ```
  修改为：
  ```typescript
  export const CONFIGURABLE_AGENT_TYPES: readonly RuntimeConfigurableAgentType[] = ["cline", "claude", "codex", "kimi", "kimi-code"];
  ```

  将 L13-15
  ```typescript
  export function isConfigurableAgentType(value: unknown): value is RuntimeConfigurableAgentType {
      return value === "cline" || value === "claude" || value === "codex" || value === "kimi";
  }
  ```
  修改为：
  ```typescript
  export function isConfigurableAgentType(value: unknown): value is RuntimeConfigurableAgentType {
      return (
          value === "cline" ||
          value === "claude" ||
          value === "codex" ||
          value === "kimi" ||
          value === "kimi-code"
      );
  }
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run test/runtime/config/runtime-agent-config.test.ts -t "kimi-code"`
  Expected: PASS

- [ ] **Step 5: 提交 Task 1-3 合并提交**

  ```bash
  git add src/core/api-contract.ts src/core/agent-catalog.ts src/config/runtime-agent-config.ts test/runtime/config/runtime-agent-config.test.ts
  git commit -m "feat(agents): register kimi-code as configurable agent type"
  ```

### Task 4: 抽出 `createKimiFamilyAdapter` 工厂 + 新增 `kimiCodeAdapter`

**Files:**
- Modify: `src/terminal/agent-session-adapters.ts`
- Modify: `test/runtime/terminal/agent-session-adapters.test.ts`

- [ ] **Step 1: 编写 kimi-code 失败测试**

  在 `test/runtime/terminal/agent-session-adapters.test.ts` 中现有 kimi 测试块（L417 起）后面追加（保持同 describe 块内，紧随 "merges Kimi hooks with user config when --config-file is used" 之后）：

  ```typescript
  it("writes Kimi Code hooks config to kimi-code/ and reads ~/.kimi-code/config.toml", async () => {
      const homePath = setupTempHome();
      const launch = await prepareAgentLaunch({
          taskId: "task-kimi-code-1",
          agentId: "kimi-code",
          binary: "kimi",
          args: [],
          autonomousModeEnabled: true,
          cwd: "/tmp",
          prompt: "Refactor",
          startInPlanMode: true,
          resumeFromTrash: true,
          workspaceId: "workspace-1",
      });

      expect(launch.args).toContain("--afk");
      expect(launch.args).toContain("--continue");
      expect(launch.args).toContain("--plan");

      const kimiCodeHookPath = join(homePath, ".cline", "kanban", "hooks", "kimi-code", "config.toml");
      const kimiHookPath = join(homePath, ".cline", "kanban", "hooks", "kimi", "config.toml");
      expect(existsSync(kimiCodeHookPath)).toBe(true);
      expect(existsSync(kimiHookPath)).toBe(false);

      const configFileIndex = launch.args.indexOf("--config-file");
      expect(configFileIndex).toBeGreaterThanOrEqual(0);
      expect(launch.args[configFileIndex + 1]).toBe(kimiCodeHookPath);
  });

  it("does not pollute kimi hooks dir when both kimi and kimi-code are launched in same env", async () => {
      const homePath = setupTempHome();
      // Seed user configs for both runtimes
      const kimiDir = join(homePath, ".kimi");
      const kimiCodeDir = join(homePath, ".kimi-code");
      mkdirSync(kimiDir, { recursive: true });
      mkdirSync(kimiCodeDir, { recursive: true });
      writeFileSync(join(kimiDir, "config.toml"), 'model = "k1"\n', "utf8");
      writeFileSync(join(kimiCodeDir, "config.toml"), 'model = "k2"\n', "utf8");

      await prepareAgentLaunch({
          taskId: "task-kimi",
          agentId: "kimi",
          binary: "kimi",
          args: [],
          autonomousModeEnabled: true,
          cwd: "/tmp",
          prompt: "p1",
          startInPlanMode: false,
          resumeFromTrash: false,
          workspaceId: "ws",
      });
      await prepareAgentLaunch({
          taskId: "task-kimi-code",
          agentId: "kimi-code",
          binary: "kimi",
          args: [],
          autonomousModeEnabled: true,
          cwd: "/tmp",
          prompt: "p2",
          startInPlanMode: false,
          resumeFromTrash: false,
          workspaceId: "ws",
      });

      const kimiHook = readFileSync(join(homePath, ".cline", "kanban", "hooks", "kimi", "config.toml"), "utf8");
      const kimiCodeHook = readFileSync(join(homePath, ".cline", "kanban", "hooks", "kimi-code", "config.toml"), "utf8");
      expect(kimiHook).toContain('model = "k1"');
      expect(kimiCodeHook).toContain('model = "k2"');
      expect(kimiHook).not.toContain('model = "k2"');
      expect(kimiCodeHook).not.toContain('model = "k1"');
  });
  ```

  确保文件顶部 imports 包含 `existsSync`、`mkdirSync`、`writeFileSync`、`readFileSync` 与 `join`（已有的复用即可，不重复导入）。

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/terminal/agent-session-adapters.test.ts -t "Kimi Code"`
  Expected: FAIL — `agentId:"kimi-code"` 在 ADAPTERS map 中不存在

- [ ] **Step 3: 修改 `src/terminal/agent-session-adapters.ts`**

  将 `buildKimiMergedConfig`（L1548-1563）改为接受 `userConfigDir` 参数：

  ```typescript
  async function buildKimiMergedConfig(hookEntries: string[], userConfigDir: string): Promise<string> {
      const userConfigPath = join(userConfigDir, "config.toml");
      let userConfig = "";
      try {
          const raw = await readFile(userConfigPath, "utf-8");
          userConfig = stripKimiManagedHooks(raw);
      } catch {
          // No user config — that's fine.
      }
      const mergedHooksConfig = userConfig ? appendKimiHookEntriesToExistingAssignment(userConfig, hookEntries) : null;
      if (mergedHooksConfig) {
          return `${mergedHooksConfig}\n`;
      }
      const hooksToml = buildKimiHooksToml(hookEntries);
      return userConfig ? `${userConfig}\n\n${hooksToml}\n` : `${hooksToml}\n`;
  }
  ```

  将 `kimiAdapter`（L1565-1606）整体替换为工厂 + 两个实例：

  ```typescript
  function createKimiFamilyAdapter(opts: {
      hookAgentDir: "kimi" | "kimi-code";
      userConfigDir: () => string;
  }): AgentSessionAdapter {
      return {
          async prepare(input) {
              const args = [...input.args];
              const env: Record<string, string | undefined> = {};

              if (input.autonomousModeEnabled && !hasCliOption(args, "--afk") && !hasCliOption(args, "--yolo")) {
                  args.push("--afk");
              }

              if (input.resumeFromTrash && !hasCliOption(args, "--continue")) {
                  args.push("--continue");
              }

              if (input.startInPlanMode) {
                  args.push("--plan");
              }

              const hooks = resolveHookContext(input);
              if (hooks) {
                  const configPath = join(getHookAgentDirectory(opts.hookAgentDir), "config.toml");
                  const hookEntries = buildKimiHookEntries();
                  const mergedConfig = await buildKimiMergedConfig(hookEntries, opts.userConfigDir());
                  await ensureTextFile(configPath, mergedConfig);
                  if (!hasCliOption(args, "--config-file")) {
                      args.push("--config-file", configPath);
                  }
                  Object.assign(
                      env,
                      createHookRuntimeEnv({
                          taskId: hooks.taskId,
                          workspaceId: hooks.workspaceId,
                      }),
                  );
              }

              return {
                  args,
                  env,
                  deferredStartupInput: input.prompt.trim() ? toBracketedPasteSubmission(input.prompt.trim()) : undefined,
              };
          },
      };
  }

  const kimiAdapter: AgentSessionAdapter = createKimiFamilyAdapter({
      hookAgentDir: "kimi",
      userConfigDir: () => join(homedir(), ".kimi"),
  });

  const kimiCodeAdapter: AgentSessionAdapter = createKimiFamilyAdapter({
      hookAgentDir: "kimi-code",
      userConfigDir: () => join(homedir(), ".kimi-code"),
  });
  ```

  注意 `userConfigDir` 使用惰性函数：避免模块加载时 `homedir()` 被冻结（测试通过 `setupTempHome` 改 `HOME` 环境变量后，每次调用都拿到最新值）。

  确认 `getHookAgentDirectory` 签名支持 `"kimi-code"` 字符串。如果它当前是 `(agent: "kimi" | "claude" | ...): string`，需要在其定义处也加 `"kimi-code"` 联合分支（grep 该函数定义并对应扩展）。

  在 `ADAPTERS` 对象（L1608-1618）中加入：

  ```typescript
  const ADAPTERS: Record<RuntimeAgentId, AgentSessionAdapter> = {
      claude: claudeAdapter,
      antcc: antccAdapter,
      codex: codexAdapter,
      gemini: geminiAdapter,
      opencode: opencodeAdapter,
      droid: droidAdapter,
      kiro: kiroAdapter,
      cline: clineAdapter,
      kimi: kimiAdapter,
      "kimi-code": kimiCodeAdapter,
  };
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run test/runtime/terminal/agent-session-adapters.test.ts`
  Expected: PASS（含新增 2 个测试 + 现有 kimi 测试无回归）

- [ ] **Step 5: 全量回归**

  Run: `npm run test:fast`
  Expected: PASS（验证默认实例数 4→5 没有击中其他文件硬编码）

- [ ] **Step 6: 提交**

  ```bash
  git add src/terminal/agent-session-adapters.ts test/runtime/terminal/agent-session-adapters.test.ts
  git commit -m "feat(agents): add kimiCodeAdapter with isolated hooks dir and user config"
  ```

### Task 5: 更新 agent-registry 测试覆盖

**Files:**
- Modify: `test/runtime/terminal/agent-registry.test.ts`

- [ ] **Step 1: 编辑测试 — 加 kimi-code 实例校验**

  在已有 `kimi` 实例断言所在 describe 块内追加（参考现有 kimi 用例的写法，约 L133-159 附近）：

  ```typescript
  it("registers a default kimi-code configured agent instance", () => {
      const defaults = createDefaultConfiguredAgents();
      const kimiCode = defaults.find((agent) => agent.type === "kimi-code");
      expect(kimiCode).toBeDefined();
      expect(kimiCode?.id).toBe("kimi-code");
      expect(kimiCode?.command).toBe("kimi");
  });
  ```

  确保 `createDefaultConfiguredAgents` 已 import 自 `src/config/runtime-agent-config`。

- [ ] **Step 2: 运行测试确认通过**

  Run: `npx vitest run test/runtime/terminal/agent-registry.test.ts -t "kimi-code"`
  Expected: PASS

- [ ] **Step 3: 提交**

  ```bash
  git add test/runtime/terminal/agent-registry.test.ts
  git commit -m "test(agents): cover kimi-code default instance in agent-registry"
  ```

### Task 6: 扩展 Settings UI 三处枚举

**Files:**
- Modify: `web-ui/src/components/runtime-settings-dialog.tsx`

- [ ] **Step 1: 扩展 `SETTINGS_AGENT_ORDER`（L175）**

  将
  ```typescript
  const SETTINGS_AGENT_ORDER: readonly RuntimeAgentId[] = ["cline", "claude", "antcc", "codex", "droid", "kiro", "kimi"];
  ```
  修改为：
  ```typescript
  const SETTINGS_AGENT_ORDER: readonly RuntimeAgentId[] = [
      "cline",
      "claude",
      "antcc",
      "codex",
      "droid",
      "kiro",
      "kimi",
      "kimi-code",
  ];
  ```

- [ ] **Step 2: 扩展 `handleAddAgent` 类型映射（L925）**

  将
  ```typescript
  setAgentEditor(createAgentEditorState(selectedAgentId === "cline" ? "cline" : selectedAgentId === "codex" ? "codex" : selectedAgentId === "kimi" ? "kimi" : "claude"));
  ```
  修改为：
  ```typescript
  setAgentEditor(
      createAgentEditorState(
          selectedAgentId === "cline"
              ? "cline"
              : selectedAgentId === "codex"
                  ? "codex"
                  : selectedAgentId === "kimi"
                      ? "kimi"
                      : selectedAgentId === "kimi-code"
                          ? "kimi-code"
                          : "claude",
      ),
  );
  ```

- [ ] **Step 3: 扩展 type 下拉选项（L1167）**

  将
  ```typescript
  {(["cline", "claude", "codex", "kimi"] as const).map((agentType) => (
  ```
  修改为：
  ```typescript
  {(["cline", "claude", "codex", "kimi", "kimi-code"] as const).map((agentType) => (
  ```

- [ ] **Step 4: 类型检查 + 构建验证**

  Run: `npm run web:typecheck`
  Expected: PASS

  Run: `npm run web:build`
  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add web-ui/src/components/runtime-settings-dialog.tsx
  git commit -m "feat(web-ui): expose kimi-code in Settings agent picker and order"
  ```

### Task 7: 文档与文案

**Files:**
- Modify: `README.md`（如包含 Agent 类型清单则同步）
- 可选 Modify: `web-ui/src/components/runtime-settings-dialog.tsx` 安装提示

- [ ] **Step 1: README 检查**

  Run: `grep -n -i "kimi" README.md`
  - 若 README 列出已支持 Agent 类型，在 kimi 条目后追加：`- Kimi Code (kimi-code) — Node.js ≥ 24.15.0, install via \`npm i -g @moonshot-ai/kimi-code\``
  - 若 README 无相关章节，跳过

- [ ] **Step 2: Settings 内联提示（可选）**

  如果 `runtime-settings-dialog.tsx` 中 `installUrl` 渲染区已有自定义安装说明（grep `installUrl` 周边逻辑），为 `kimi-code` 类型加一行 Node.js ≥ 24.15.0 提示；否则沿用 catalog 的 `installUrl` 即可。

- [ ] **Step 3: 提交**

  ```bash
  git add README.md web-ui/src/components/runtime-settings-dialog.tsx
  git commit -m "docs(agents): document kimi-code install requirements"
  ```

  若无文档实际改动，跳过本 Task。

### Task 8: 端到端自检 + 全量回归

**Files:** 无新增

- [ ] **Step 1: 完整测试套件**

  Run: `npm run check`
  Expected: PASS（biome + typecheck + 全部测试）

- [ ] **Step 2: 手工验证（前置：`npm i -g @moonshot-ai/kimi-code`）**

  1. `npm run dev:full` 启动应用
  2. Settings → Agent Instance → 新增 type=`Kimi Code`，alias `kimi-code-test`，command 填 kimi-code 绝对路径（`which kimi` 检查具体指向）
  3. 列表中确认 kimi-cli 与 kimi-code 两类型独立显示
  4. New Task → Agent 下拉显示两项；选 `kimi-code-test` 创建任务
  5. 任务终端中 `kimi --version` 输出 0.6.x
  6. 检查 `~/.cline/kanban/hooks/kimi-code/config.toml` 存在
  7. 同时启动旧 kimi 任务，检查 `~/.cline/kanban/hooks/kimi/` 与 `~/.cline/kanban/hooks/kimi-code/` 文件独立无串扰
  8. 删除 kimi-code 实例 → 列表消失；重启后配置正确

- [ ] **Step 3: 自检完成提示**

  无需提交，准备 PR 收尾。

---

## 验证方案

- 自动化测试: `npm run check` （含 lint + typecheck + 全套测试）
- 快速回归: `npm run test:fast`
- 单元 / 集成定向: `npx vitest run test/runtime/terminal/agent-session-adapters.test.ts -t "Kimi Code"`
- 手工验证: Task 8 Step 2 的 8 步流程
- 跨版本回滚兼容: 手工编辑 `~/.cline/config.json`，加入一个 `type:"kimi-code"` 实例，重启旧版本，确认旧 normalize 会静默丢弃（**这是符合预期的，release note 需告知**）
