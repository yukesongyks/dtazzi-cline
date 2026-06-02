# Task Worktree 应创建在项目目录下 实现计划

> **Issue:** #2 | **链接:** https://code.alipay.com/zoloz_ai_support/issue-driven-agentic-workflow/issues/2
> **生成时间:** 2026-05-14
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 将 task worktree 默认创建路径从 `~/.cline/worktrees/` 改为 `{projectRoot}/.cline/worktrees/`，使 AI agent 可从 worktree 内方便访问项目根目录和 git 历史。
**技术方案:** 修改 `getTaskWorktreesHomePath` 接受 `repoPath` 参数返回项目目录路径，更新所有调用链、workspace trust 检测、UI 展示，并自动追加 `.gitignore` 条目。
**预估工作量:** 2-3 人天 / 中等复杂度

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/state/workspace-state.ts:L23-26,L165-167` | 修改 `getTaskWorktreesHomePath` 签名，移除 `RUNTIME_WORKTREES_DIR` |
| Modify | `src/workspace/task-worktree.ts:L10,L118-134,L571` | 更新 `getWorktreesRootPath`/`getWorktreesBaseRootPath` 签名和调用 |
| Modify | `src/workspace/task-worktree-path.ts:L4-6,L33-37` | 更新展示路径函数和常量 |
| Modify | `src/terminal/claude-workspace-trust.ts:L2,L64-71` | 双路径检测逻辑 |
| Modify | `src/workspace/task-worktree.ts:L437-563` | 添加 `.gitignore` 自动追加逻辑 |
| Modify | `web-ui/src/components/board-card.tsx:L4,L54-59` | 应用 `formatPathForDisplay` |
| Modify | `web-ui/src/components/debug-dialog.tsx:L66,L94` | 更新文案 |
| Modify | `test/runtime/task-worktree.test.ts:L21,L45,L110,L149` | 更新 mock |
| Modify | `web-ui/src/components/board-card.test.tsx:L265` | 更新断言 |

---

### Task 1: 修改核心路径解析函数

**Files:**
- Modify: `src/state/workspace-state.ts`
- Modify: `src/workspace/task-worktree.ts`
- Test: `test/runtime/task-worktree.test.ts`

- [ ] **Step 1: 编写失败测试 — getTaskWorktreesHomePath 新签名**

  在 `test/runtime/task-worktree.test.ts` 中，更新 `workspaceStateMocks.getTaskWorktreesHomePath` 的 mock 实现，使其接受 `repoPath` 参数并返回 `{repoPath}/.cline/worktrees`：

  ```typescript
  // test/runtime/task-worktree.test.ts
  // 第 149 行附近，修改 mock 返回值
  // Before:
  workspaceStateMocks.getTaskWorktreesHomePath.mockReturnValue(worktreesHomePath);
  // After:
  workspaceStateMocks.getTaskWorktreesHomePath.mockImplementation(
      (repoPath: string) => join(repoPath, ".cline", "worktrees"),
  );
  ```

  同时更新 `worktreesHomePath` 变量（第 143 行附近）为基于 `repoPath` 的路径：

  ```typescript
  // Before:
  const worktreesHomePath = join(sandboxRoot, "worktrees-home");
  // After: 移除此变量，不再需要独立的 worktreesHomePath
  ```

  注意：由于 `getTaskWorktreesHomePath` 现在基于 `repoPath` 计算，mock 返回 `join(repoPath, ".cline", "worktrees")`，worktree 路径将自动变为 `{repoPath}/.cline/worktrees/{taskId}/repo`。

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/task-worktree.test.ts`
  Expected: FAIL — `getTaskWorktreesHomePath` 调用签名不匹配（mock 传了参数但实际函数不接受）

- [ ] **Step 3: 最小实现**

  修改 `src/state/workspace-state.ts`：

  ```typescript
  // src/state/workspace-state.ts
  // 第 25 行: 移除 RUNTIME_WORKTREES_DIR 常量
  // Before:
  const RUNTIME_WORKTREES_DIR = "worktrees";
  // After: 删除此行

  // 第 165-167 行: 修改 getTaskWorktreesHomePath 签名
  // Before:
  export function getTaskWorktreesHomePath(): string {
      return join(homedir(), RUNTIME_HOME_PARENT_DIR, RUNTIME_WORKTREES_DIR);
  }
  // After:
  export function getTaskWorktreesHomePath(repoPath: string): string {
      return join(repoPath, ".cline", "worktrees");
  }
  ```

  修改 `src/workspace/task-worktree.ts`：

  ```typescript
  // src/workspace/task-worktree.ts
  // 第 118-125 行: 更新 getWorktreesRootPath 和 getWorktreesBaseRootPath

  // Before:
  function getWorktreesRootPath(taskId: string): string {
      const normalizedTaskId = normalizeTaskIdForWorktreePath(taskId);
      return join(getTaskWorktreesHomePath(), normalizedTaskId);
  }

  function getWorktreesBaseRootPath(): string {
      return getTaskWorktreesHomePath();
  }

  // After:
  function getWorktreesRootPath(repoPath: string, taskId: string): string {
      const normalizedTaskId = normalizeTaskIdForWorktreePath(taskId);
      return join(getTaskWorktreesHomePath(repoPath), normalizedTaskId);
  }

  function getWorktreesBaseRootPath(repoPath: string): string {
      return getTaskWorktreesHomePath(repoPath);
  }

  // 第 131-134 行: 更新 getTaskWorktreePath
  // Before:
  function getTaskWorktreePath(repoPath: string, taskId: string): string {
      const workspaceLabel = getWorkspaceFolderLabelForWorktreePath(repoPath);
      return join(getWorktreesRootPath(taskId), workspaceLabel);
  }
  // After:
  function getTaskWorktreePath(repoPath: string, taskId: string): string {
      const workspaceLabel = getWorkspaceFolderLabelForWorktreePath(repoPath);
      return join(getWorktreesRootPath(repoPath, taskId), workspaceLabel);
  }

  // 第 571 行: 更新 deleteTaskWorktree 中的 getWorktreesBaseRootPath 调用
  // Before:
  const rootPath = getWorktreesBaseRootPath();
  // After:
  const rootPath = getWorktreesBaseRootPath(options.repoPath);
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run test/runtime/task-worktree.test.ts`
  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add src/state/workspace-state.ts src/workspace/task-worktree.ts test/runtime/task-worktree.test.ts
  git commit -m "refactor(worktree): change worktree path from homedir to project directory

  Change getTaskWorktreesHomePath to accept repoPath parameter and return
  {repoPath}/.cline/worktrees instead of ~/.cline/worktrees. Update all
  downstream callers (getWorktreesRootPath, getWorktreesBaseRootPath,
  getTaskWorktreePath, deleteTaskWorktree) to pass repoPath through.

  Issue: #2"
  ```

---

### Task 2: 更新 workspace trust 双路径检测

**Files:**
- Modify: `src/terminal/claude-workspace-trust.ts`
- Test: 新增单元测试

- [ ] **Step 1: 编写失败测试 — isTaskWorktreePath 双路径检测**

  在 `test/runtime/` 下新建或追加测试到现有测试文件，测试 `isTaskWorktreePath` 对新旧路径的检测：

  ```typescript
  // 测试用例（追加到适当的测试文件或新建 test/runtime/claude-workspace-trust.test.ts）
  import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

  // Mock homedir
  const mockHomedir = vi.fn(() => "/home/testuser");

  vi.mock("node:os", () => ({
      homedir: () => mockHomedir(),
  }));

  vi.mock("../src/state/workspace-state.js", () => ({
      getTaskWorktreesHomePath: (repoPath: string) =>
          require("node:path").join(repoPath, ".cline", "worktrees"),
  }));

  import { shouldAutoConfirmClaudeWorkspaceTrust } from "../../src/terminal/claude-workspace-trust";

  describe("isTaskWorktreePath", () => {
      it("detects project-local worktree path", () => {
          expect(
              shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/testuser/projects/myrepo/.cline/worktrees/task-1/myrepo"),
          ).toBe(true);
      });

      it("detects legacy home-directory worktree path", () => {
          expect(
              shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/testuser/.cline/worktrees/task-1/myrepo"),
          ).toBe(true);
      });

      it("rejects non-worktree path", () => {
          expect(
              shouldAutoConfirmClaudeWorkspaceTrust("claude", "/home/testuser/projects/myrepo/src"),
          ).toBe(false);
      });

      it("rejects non-claude agent", () => {
          expect(
              shouldAutoConfirmClaudeWorkspaceTrust("other-agent", "/home/testuser/projects/myrepo/.cline/worktrees/task-1/myrepo"),
          ).toBe(false);
      });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/claude-workspace-trust.test.ts`
  Expected: FAIL — `shouldAutoConfirmClaudeWorkspaceTrust("claude", projectLocalPath)` 返回 false

- [ ] **Step 3: 最小实现**

  修改 `src/terminal/claude-workspace-trust.ts`：

  ```typescript
  // src/terminal/claude-workspace-trust.ts
  // 第 1-2 行: 更新 import
  // Before:
  import type { RuntimeAgentId } from "../core/api-contract";
  import { getTaskWorktreesHomePath } from "../state/workspace-state";
  // After:
  import { homedir } from "node:os";
  import type { RuntimeAgentId } from "../core/api-contract";

  // 第 64-71 行: 更新 isTaskWorktreePath
  // Before:
  function isTaskWorktreePath(path: string): boolean {
      const worktreesRoot = `${getTaskWorktreesHomePath().replace(/\\/gu, "/").replace(/\/+$/u, "")}/`;
      const normalizedPath = `${path.replace(/\\/gu, "/").replace(/\/+$/u, "")}/`;
      if (process.platform === "win32") {
          return normalizedPath.toLowerCase().startsWith(worktreesRoot.toLowerCase());
      }
      return normalizedPath.startsWith(worktreesRoot);
  }
  // After:
  function isTaskWorktreePath(path: string): boolean {
      const normalizedPath = `${path.replace(/\\/gu, "/").replace(/\/+$/u, "")}/`;

      // Check legacy home-directory worktree path (~/.cline/worktrees/...)
      const legacyWorktreesRoot = `${homedir().replace(/\\/gu, "/").replace(/\/+$/u, "")}/.cline/worktrees/`;
      if (process.platform === "win32") {
          if (normalizedPath.toLowerCase().startsWith(legacyWorktreesRoot.toLowerCase())) {
              return true;
          }
      } else {
          if (normalizedPath.startsWith(legacyWorktreesRoot)) {
              return true;
          }
      }

      // Check project-local worktree path (*/.cline/worktrees/...)
      if (normalizedPath.includes("/.cline/worktrees/")) {
          return true;
      }

      return false;
  }
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run test/runtime/claude-workspace-trust.test.ts`
  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add src/terminal/claude-workspace-trust.ts test/runtime/claude-workspace-trust.test.ts
  git commit -m "feat(trust): detect both project-local and legacy worktree paths

  Update isTaskWorktreePath to check both the new project-local
  (.cline/worktrees under the project root) and legacy home-directory
  (~/.cline/worktrees) worktree paths. Remove dependency on
  getTaskWorktreesHomePath from workspace-state.

  Issue: #2"
  ```

---

### Task 3: 更新展示路径函数和 UI

**Files:**
- Modify: `src/workspace/task-worktree-path.ts`
- Modify: `web-ui/src/components/board-card.tsx`
- Modify: `web-ui/src/components/debug-dialog.tsx`
- Test: `web-ui/src/components/board-card.test.tsx`

- [ ] **Step 1: 编写失败测试 — buildTaskWorktreeDisplayPath 新输出**

  修改 `web-ui/src/components/board-card.test.tsx` 第 265 行的断言：

  ```typescript
  // web-ui/src/components/board-card.test.tsx
  // 第 265 行
  // Before:
  expect(container.textContent).toContain("~/.cline/worktrees/trash-task-1/kanban");
  // After:
  expect(container.textContent).toContain("/Users/alice/projects/kanban/.cline/worktrees/trash-task-1/kanban");
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run web-ui/src/components/board-card.test.tsx`
  Expected: FAIL — 展示路径仍为旧格式 `~/.cline/worktrees/...`

- [ ] **Step 3: 最小实现**

  修改 `src/workspace/task-worktree-path.ts`：

  ```typescript
  // src/workspace/task-worktree-path.ts
  // 第 4-6 行: 移除不再需要的常量
  // Before:
  export const KANBAN_TASK_WORKTREES_HOME_DIR_NAME = ".cline/worktrees";
  export const KANBAN_TASK_WORKTREES_DIR_NAME = "worktrees";
  export const KANBAN_TASK_WORKTREES_DISPLAY_ROOT = `~/${KANBAN_TASK_WORKTREES_HOME_DIR_NAME}`;
  // After:
  export const KANBAN_TASK_WORKTREES_DIR_NAME = "worktrees";
  // 注意：KANBAN_RUNTIME_HOME_DIR_NAME 保持不变（仍用于其他地方）
  // KANBAN_TASK_WORKTREES_HOME_DIR_NAME 和 KANBAN_TASK_WORKTREES_DISPLAY_ROOT 不再需要

  // 第 33-37 行: 更新 buildTaskWorktreeDisplayPath
  // Before:
  export function buildTaskWorktreeDisplayPath(taskId: string, repoPath: string): string {
      const normalizedTaskId = normalizeTaskIdForWorktreePath(taskId);
      const workspaceLabel = getWorkspaceFolderLabelForWorktreePath(repoPath);
      return `${KANBAN_TASK_WORKTREES_DISPLAY_ROOT}/${normalizedTaskId}/${workspaceLabel}`;
  }
  // After:
  export function buildTaskWorktreeDisplayPath(taskId: string, repoPath: string): string {
      const normalizedTaskId = normalizeTaskIdForWorktreePath(taskId);
      const workspaceLabel = getWorkspaceFolderLabelForWorktreePath(repoPath);
      return `${repoPath.replace(/\\/gu, "/").replace(/\/+$/u, "")}/.cline/worktrees/${normalizedTaskId}/${workspaceLabel}`;
  }
  ```

  修改 `web-ui/src/components/board-card.tsx`，在 `reconstructTaskWorktreeDisplayPath` 中应用 `formatPathForDisplay`：

  ```typescript
  // web-ui/src/components/board-card.tsx
  // 第 54-63 行: 更新 reconstructTaskWorktreeDisplayPath
  // Before:
  function reconstructTaskWorktreeDisplayPath(taskId: string, workspacePath: string | null | undefined): string | null {
      if (!workspacePath) {
          return null;
      }
      try {
          return buildTaskWorktreeDisplayPath(taskId, workspacePath);
      } catch {
          return null;
      }
  }
  // After:
  function reconstructTaskWorktreeDisplayPath(taskId: string, workspacePath: string | null | undefined): string | null {
      if (!workspacePath) {
          return null;
      }
      try {
          const absolutePath = buildTaskWorktreeDisplayPath(taskId, workspacePath);
          return formatPathForDisplay(absolutePath);
      } catch {
          return null;
      }
  }
  ```

  确认 `formatPathForDisplay` 已在 `board-card.tsx` 中导入（第 22 行已有 `import { formatPathForDisplay } from "@/utils/path-display";`）。

  修改 `web-ui/src/components/debug-dialog.tsx` 第 66 行和第 94 行，更新文案说明 worktree 路径变更：

  ```typescript
  // web-ui/src/components/debug-dialog.tsx
  // 第 65-66 行
  // Before:
  // Clears browser local storage and removes <code>~/.cline/data</code>, <code>~/.cline/kanban</code>,
  // and <code>~/.cline/worktrees</code>. Kanban reloads after completion.
  // After:
  // Clears browser local storage and removes <code>~/.cline/data</code> and <code>~/.cline/kanban</code>.
  // Task worktrees are stored in each project's <code>.cline/worktrees</code> directory. Kanban reloads after completion.

  // 第 93-94 行
  // Before:
  // This removes local browser storage and deletes <code>~/.cline/data</code>,{" "}
  // <code>~/.cline/kanban</code>, and <code>~/.cline/worktrees</code>.
  // After:
  // This removes local browser storage and deletes <code>~/.cline/data</code> and{" "}
  // <code>~/.cline/kanban</code>. Task worktrees are stored in each project's <code>.cline/worktrees</code> directory.
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run web-ui/src/components/board-card.test.tsx`
  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add src/workspace/task-worktree-path.ts web-ui/src/components/board-card.tsx web-ui/src/components/debug-dialog.tsx web-ui/src/components/board-card.test.tsx
  git commit -m "feat(ui): update worktree display path to project-local format

  Change buildTaskWorktreeDisplayPath to return absolute path instead of
  ~-prefixed path. Apply formatPathForDisplay in board-card for home dir
  substitution. Update debug-dialog text to reflect new worktree location.
  Remove KANBAN_TASK_WORKTREES_HOME_DIR_NAME and
  KANBAN_TASK_WORKTREES_DISPLAY_ROOT constants.

  Issue: #2"
  ```

---

### Task 4: 添加 .gitignore 自动追加

**Files:**
- Modify: `src/workspace/task-worktree.ts`
- Test: `test/runtime/task-worktree.test.ts`

- [ ] **Step 1: 编写失败测试 — ensureWorktreesGitignoreEntry**

  在 `test/runtime/task-worktree.test.ts` 中追加测试用例：

  ```typescript
  it("appends .cline/worktrees/ to project .gitignore when creating worktree", async () => {
      const { path: sandboxRoot, cleanup } = createTempDir("kanban-task-worktree-gitignore-");
      try {
          const repoPath = join(sandboxRoot, "repo");
          mkdirSync(join(repoPath, ".git"), { recursive: true });
          // 创建初始 .gitignore
          writeFileSync(join(repoPath, ".gitignore"), "node_modules/\n", "utf8");

          workspaceStateMocks.getRuntimeHomePath.mockReturnValue(join(sandboxRoot, "runtime-home"));
          workspaceStateMocks.getTaskWorktreesHomePath.mockImplementation(
              (rp: string) => join(rp, ".cline", "worktrees"),
          );
          workspaceStateMocks.loadWorkspaceContext.mockResolvedValue({ repoPath });
          taskWorktreePathMocks.getWorkspaceFolderLabelForWorktreePath.mockReturnValue("repo");
          taskWorktreePathMocks.normalizeTaskIdForWorktreePath.mockImplementation((id: string) => id);

          // 模拟 git 命令使 worktree 创建成功
          childProcessMocks.execFilePromise.mockImplementation(
              async (_file: string, args: readonly string[], options?: ExecFileOptions) => {
                  const { command } = getCommandArgs(args, options);
                  if (command[0] === "rev-parse" && command[1] === "--verify") {
                      return { stdout: "base-commit\n", stderr: "" };
                  }
                  if (command[0] === "rev-parse" && command[1] === "--git-common-dir") {
                      return { stdout: ".git\n", stderr: "" };
                  }
                  if (command[0] === "worktree" && command[1] === "add") {
                      const worktreePath = command[3];
                      if (worktreePath) mkdirSync(worktreePath, { recursive: true });
                      return { stdout: "", stderr: "" };
                  }
                  if (command[0] === "rev-parse" && command[1] === "HEAD") {
                      return { stdout: "base-commit\n", stderr: "" };
                  }
                  if (command[0] === "ls-files") return { stdout: "", stderr: "" };
                  if (command[0] === "rev-parse" && command[1] === "--git-path") {
                      return { stdout: ".git/info/exclude\n", stderr: "" };
                  }
                  if (command[0] === "config" && command[1] === "--file") {
                      return { stdout: "", stderr: "" };
                  }
                  if (command[0] === "submodule") return { stdout: "", stderr: "" };
                  throw createGitError(`Unhandled: ${command.join(" ")}`);
              },
          );

          const result = await ensureTaskWorktreeIfDoesntExist({
              cwd: repoPath,
              taskId: "gitignore-test",
              baseRef: "HEAD",
          });

          expect(result.ok).toBe(true);
          // 验证 .gitignore 包含 .cline/worktrees/ 条目
          const gitignoreContent = readFileSync(join(repoPath, ".gitignore"), "utf8");
          expect(gitignoreContent).toContain("/.cline/worktrees/");
      } finally {
          cleanup();
      }
  });
  ```

  需要在文件顶部添加 `readFileSync` 导入：

  ```typescript
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `npx vitest run test/runtime/task-worktree.test.ts`
  Expected: FAIL — `.gitignore` 中不包含 `/.cline/worktrees/`（功能尚未实现）

- [ ] **Step 3: 最小实现**

  在 `src/workspace/task-worktree.ts` 中添加 `ensureWorktreesGitignoreEntry` 函数，并在 `ensureTaskWorktreeIfDoesntExist` 中调用：

  ```typescript
  // src/workspace/task-worktree.ts
  // 在文件顶部 import 区域添加 appendFile
  // 第 1 行修改:
  // Before:
  import { access, lstat, mkdir, readdir, readFile, rm, symlink } from "node:fs/promises";
  // After:
  import { access, lstat, mkdir, readdir, readFile, rm, symlink } from "node:fs/promises";
  import { appendFile } from "node:fs/promises";

  // 在 KANBAN_TASK_WORKTREE_SETUP_LOCKFILE_NAME 常量后（约第 19 行后）添加:
  const PROJECT_WORKTREES_GITIGNORE_ENTRY = "/.cline/worktrees/";

  async function ensureWorktreesGitignoreEntry(repoPath: string): Promise<void> {
      try {
          const gitignorePath = join(repoPath, ".gitignore");
          let existingContent = "";
          try {
              existingContent = await readFile(gitignorePath, "utf8");
          } catch {
              // .gitignore 不存在，将创建新文件
          }
          if (existingContent.includes(PROJECT_WORKTREES_GITIGNORE_ENTRY)) {
              return;
          }
          const entry = existingContent.endsWith("\n") || existingContent.length === 0
              ? PROJECT_WORKTREES_GITIGNORE_ENTRY
              : `\n${PROJECT_WORKTREES_GITIGNORE_ENTRY}`;
          await appendFile(gitignorePath, entry);
      } catch {
          // .gitignore 写入失败不阻塞 worktree 创建
      }
  }
  ```

  在 `ensureTaskWorktreeIfDoesntExist` 函数中，紧接 `const worktreePath = getTaskWorktreePath(...)` 之后（约第 445 行后），添加 `.gitignore` 确保：

  ```typescript
  // 在 const worktreePath = getTaskWorktreePath(context.repoPath, taskId); 之后
  await ensureWorktreesGitignoreEntry(context.repoPath);
  ```

- [ ] **Step 4: 运行测试确认通过**

  Run: `npx vitest run test/runtime/task-worktree.test.ts`
  Expected: PASS

- [ ] **Step 5: 提交**

  ```bash
  git add src/workspace/task-worktree.ts test/runtime/task-worktree.test.ts
  git commit -m "feat(worktree): auto-append .cline/worktrees/ to project .gitignore

  Add ensureWorktreesGitignoreEntry function that appends
  '/.cline/worktrees/' to the project's .gitignore file when creating
  a task worktree. The entry uses a leading '/' to match only at the
  repo root. The function is idempotent and fails silently to not
  block worktree creation.

  Issue: #2"
  ```

---

### Task 5: 更新 mock 和清理未使用常量

**Files:**
- Modify: `test/runtime/task-worktree.test.ts`
- Modify: `src/workspace/task-worktree-path.ts`

- [ ] **Step 1: 清理 task-worktree-path.ts 中未使用的导出**

  检查 `KANBAN_TASK_WORKTREES_HOME_DIR_NAME` 和 `KANBAN_TASK_WORKTREES_DISPLAY_ROOT` 是否仍被引用：

  ```bash
  grep -r "KANBAN_TASK_WORKTREES_HOME_DIR_NAME" src/ web-ui/ --include="*.ts" --include="*.tsx"
  grep -r "KANBAN_TASK_WORKTREES_DISPLAY_ROOT" src/ web-ui/ --include="*.ts" --include="*.tsx"
  ```

  如果 `KANBAN_TASK_WORKTREES_HOME_DIR_NAME` 仅在 `KANBAN_TASK_WORKTREES_DISPLAY_ROOT` 中使用，且 `KANBAN_TASK_WORKTREES_DISPLAY_ROOT` 不再被引用（`buildTaskWorktreeDisplayPath` 已不再使用它），则移除这两个常量。

  在 `task-worktree-path.ts` 中：
  ```typescript
  // 移除:
  export const KANBAN_TASK_WORKTREES_HOME_DIR_NAME = ".cline/worktrees";
  export const KANBAN_TASK_WORKTREES_DISPLAY_ROOT = `~/${KANBAN_TASK_WORKTREES_HOME_DIR_NAME}`;
  ```

  如果测试 mock 中引用了 `KANBAN_TASK_WORKTREES_HOME_DIR_NAME`，也需更新。

- [ ] **Step 2: 更新测试 mock 中对 getTaskWorktreesHomePath 的调用**

  确认 `test/runtime/task-worktree.test.ts` 中 `workspaceStateMocks.getTaskWorktreesHomePath` 的 mock 已在 Task 1 中更新为接受 `repoPath` 参数的 `mockImplementation`。

  检查是否有其他测试文件引用 `getTaskWorktreesHomePath` 或 `KANBAN_TASK_WORKTREES_HOME_DIR_NAME`：

  ```bash
  grep -r "getTaskWorktreesHomePath\|KANBAN_TASK_WORKTREES_HOME_DIR_NAME\|KANBAN_TASK_WORKTREES_DISPLAY_ROOT" test/ web-ui/ --include="*.ts" --include="*.tsx"
  ```

  逐一更新所有引用。

- [ ] **Step 3: 运行全量测试**

  Run: `npx vitest run test/runtime task/runtime task/utilities web-ui/src/components/board-card.test.tsx`
  Expected: PASS

- [ ] **Step 4: 提交**

  ```bash
  git add src/workspace/task-worktree-path.ts test/
  git commit -m "chore(worktree): remove unused display path constants and update test mocks

  Remove KANBAN_TASK_WORKTREES_HOME_DIR_NAME and
  KANBAN_TASK_WORKTREES_DISPLAY_ROOT which are no longer used after
  the worktree path migration. Update all test mocks to match the
  new getTaskWorktreesHomePath(repoPath) signature.

  Issue: #2"
  ```

---

## 验证方案

- **自动化测试:** `npx vitest run test/runtime task/runtime web-ui/src/components/board-card.test.tsx`
- **手工验证:**
  1. 启动 Kanban，创建一个 task
  2. 确认 worktree 路径为 `{projectRoot}/.cline/worktrees/{taskId}/`
  3. 在 worktree 中执行 `cd ../..` 到达项目根目录，确认可访问
  4. 检查项目 `.gitignore` 包含 `/.cline/worktrees/`
  5. 删除 task，确认 worktree 目录和空父目录被清理
  6. 确认旧路径 `~/.cline/worktrees/` 的 workspace trust 仍可自动确认