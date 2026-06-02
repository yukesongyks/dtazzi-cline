# Task Worktree 应创建在项目目录下 设计文档

> Issue: #2 — Task Worktree 应创建在项目目录下而非 ~/.cline/worktrees/

## 背景

当前 Kanban 创建 task 时，git worktree 创建在用户主目录下的集中路径 `~/.cline/worktrees/{taskId}/{projectName}/`。这导致：

1. AI agent 在 worktree 中工作时无法方便地回溯项目根目录查看 git 提交历史
2. Code review 工作流受限，无法结合 git 历史做辅助分析
3. 路径 `~/.cline/worktrees/snl9w/zstrategy` 对开发者不直观，难以快速定位

## 目标

将 worktree 默认创建位置从 `~/.cline/worktrees/` 改为 `{projectRoot}/.cline/worktrees/{taskId}/`，使 AI agent 可从 worktree 内方便访问项目根目录和 git 历史。

## 设计方案

### 方案探索

#### 方案 A：修改 getTaskWorktreesHomePath 接受 repoPath 参数（推荐）

将 `getTaskWorktreesHomePath()` 改为 `getTaskWorktreesHomePath(repoPath: string)`，返回 `{repoPath}/.cline/worktrees/`。所有调用点传入 `repoPath`。

- 优点：改动集中，调用链清晰，向后兼容性好
- 缺点：原有无参纯函数变为需要参数，影响面稍大

#### 方案 B：新增 getProjectTaskWorktreesHomePath 函数

保留原函数不变，新增函数返回项目目录路径。创建用新函数，清理时两个路径都检查。

- 优点：旧函数不动，减少回归风险
- 缺点：两个路径函数共存，增加过渡期维护成本

**选择方案 A**：用户选择了"仅新路径"策略，不需要双路径共存期，方案 A 更直接。

### 架构与接口

#### 核心函数变更

```ts
// workspace-state.ts — Before:
export function getTaskWorktreesHomePath(): string {
  return join(homedir(), RUNTIME_HOME_PARENT_DIR, RUNTIME_WORKTREES_DIR);
}

// workspace-state.ts — After:
export function getTaskWorktreesHomePath(repoPath: string): string {
  return join(repoPath, ".cline", "worktrees");
}
```

#### 调用链变更

| 文件 | 函数 | 变更 |
|------|------|------|
| `task-worktree.ts` | `getWorktreesRootPath(taskId)` | 新增 `repoPath` 参数 |
| `task-worktree.ts` | `getTaskWorktreePath(repoPath, taskId)` | 已有 `repoPath`，直接传入 |
| `task-worktree.ts` | `getWorktreesBaseRootPath()` | 新增 `repoPath` 参数 |
| `claude-workspace-trust.ts` | `isTaskWorktreePath(path)` | 同时检测新旧路径 |
| `task-worktree-path.ts` | `buildTaskWorktreeDisplayPath` | 适配新路径格式 |

#### .gitignore 自动追加

在 `ensureTaskWorktreeIfDoesntExist` 创建 worktree 前：
1. 检查项目 `.gitignore` 是否已包含 `.cline/worktrees/`
2. 未包含则追加（并发安全：使用写锁或 append 模式）
3. 写入失败仅 warn，不阻塞 worktree 创建

#### 旧路径兼容

`isTaskWorktreePath` 保留对 `~/.cline/worktrees` 前缀的检测，用于自动确认旧 worktree 的 workspace trust。新创建的 worktree 全部在项目目录下。

### 范围边界

- **做什么**：
  - 修改 worktree 默认创建路径到项目目录
  - 自动追加 `.gitignore` 条目
  - UI 路径展示适配新格式
  - 旧路径 workspace trust 兼容
- **不做什么**：
  - 不提供配置项切换回旧路径
  - 不自动迁移旧 worktree
  - 不提供回滚脚本

## 影响分析

### 风险评估

| 维度 | 风险 | 等级 |
|------|------|------|
| DB schema 变更 | 无数据库 | 🟢 低 |
| 外部 API 变更 | 无外部依赖 | 🟢 低 |
| 配置变更 | 无需重启/发布 | 🟢 低 |
| 并发/幂等 | `.gitignore` 追加需并发安全 | 🟡 中 |
| 回归风险 | workspace trust 自动确认逻辑变更 | 🟡 中 |
| 可回滚性 | 代码回滚 + 手动清理 worktree | 🟢 低 |
| 数据不一致窗口 | 无 | 🟢 低 |

**总体风险：🟡 中风险**

## 测试方案

### 1. 单元测试

- 测试目标：`getTaskWorktreesHomePath`, `getTaskWorktreePath`, `isTaskWorktreePath`, `buildTaskWorktreeDisplayPath`, `.gitignore` 追加逻辑
- 用例列表：
  - 正常路径：`getTaskWorktreesHomePath("/home/user/project")` → `/home/user/project/.cline/worktrees`
  - 正常路径：`getTaskWorktreePath("/home/user/project", "task1")` → `/home/user/project/.cline/worktrees/task1/project`
  - 边界值：repoPath 尾部有 `/` → 正确处理无重复 `/`
  - 边界值：taskId 含特殊字符 → `normalizeTaskIdForWorktreePath` 拒绝 `/`, `\\`, `..`
  - 异常路径：`isTaskWorktreePath` 检测旧路径 worktree → true（兼容）
  - 异常路径：`isTaskWorktreePath` 检测新路径 worktree → true
  - 异常路径：`isTaskWorktreePath` 检测非 worktree 路径 → false
  - 正常路径：`.gitignore` 已包含条目 → 不重复追加
  - 正常路径：`.gitignore` 不存在 → 创建并写入

### 2. 集成测试

- 测试目标：worktree 创建/删除完整流程
- 测试数据准备：使用临时 git 仓库目录
- 用例列表：
  - 创建 task worktree → 验证路径在项目目录下
  - 删除 task worktree → 验证 `.cline/worktrees/{taskId}/` 目录被清理
  - 创建 worktree 后 `.gitignore` 包含 `.cline/worktrees/`
  - shutdown 时 interrupted task 的 worktree 正确清理

### 3. 手工验证步骤

- 前置条件：本地开发环境，有 Kanban 项目
- 验证步骤：
  1. 启动 Kanban，创建一个 task
  2. 确认 worktree 路径为 `{projectRoot}/.cline/worktrees/{taskId}/`
  3. 在 worktree 中执行 `cd ../..` 到达项目根目录，确认可访问
  4. 检查项目 `.gitignore` 包含 `.cline/worktrees/`
  5. 删除 task，确认 worktree 目录和空父目录被清理

### 4. 回归测试范围

- 受影响的已有功能：workspace trust 自动确认、task patch 保存/恢复、shutdown cleanup、UI 路径展示
- 需要回归的用例：旧路径 worktree 的 trust 自动确认、patch 保存/恢复
- 回归验证方式：自动化单元测试 + 手工验证

## 验收标准

- [ ] Task worktree 默认创建在 `{projectRoot}/.cline/worktrees/{taskId}/` 下
- [ ] AI agent 在 worktree 中能方便地访问项目根目录和 git 历史
- [ ] `.cline/worktrees/` 自动追加到项目 `.gitignore`
- [ ] UI 层路径展示适配新路径格式
- [ ] 旧路径 `~/.cline/worktrees/` 的 workspace trust 仍可自动确认

## 工作量估算

2-3 人天，复杂度中等。核心改动集中在 3 个文件，UI 和测试各需少量适配。
