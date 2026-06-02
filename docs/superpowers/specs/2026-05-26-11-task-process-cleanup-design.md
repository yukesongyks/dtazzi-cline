# Task 进程未及时清理导致内存和线程持续占用 设计文档

> Issue: #11 — Task 进程未及时清理导致内存和线程持续占用

## 背景

用户反馈 Kanban 中的 task 在 review 或 done（trash）状态后持续占用系统线程，导致系统逐渐变卡。经实测确认：

- **Done/trash 清理已正常工作**：`stopTaskSession` 会终止 PTY 进程，worktree 也会被删除
- **每个 project 的侧边栏 Claude 进程** 是设计行为，删除 project 后进程终止
- **核心问题**：没有资源上限控制，用户可以无限创建 task 直到系统资源耗尽

## 根因分析

### 根因 1: SessionEntry Map 永不清理（内存泄漏）🔴

- **位置**：`src/terminal/session-manager.ts:957-973`
- `stopTaskSession()` 调用 `entry.active.session.stop()` 终止 PTY，但**从不调用 `entries.delete(taskId)`**
- 整个 `session-manager.ts` 没有任何 `entries.delete()` 调用
- 每个 `SessionEntry` 包含 summary、active state、terminal state mirror、listeners map、restart timestamps 等对象
- 随着 task 创建/删除循环，Map 无限增长

### 根因 2: 无资源上限控制 🔴

- **位置**：`src/commands/task.ts:488-548`
- `createTask()` 无任何内存/资源检查
- 全代码库无 `os.freemem`、`os.totalmem`、`process.memoryUsage` 调用
- 用户可无限创建 task，无预警机制

### 根因 3: Review 列不必要的轮询 🟡

- **位置**：`src/server/workspace-metadata-monitor.ts:60-78`
- `collectTrackedTasks` 包含 review 列 task，每秒产生 git 子进程调用
- review 状态下 git 元数据几乎不会变化，轮询无意义

## 修复策略

### 修复 1: 创建 task 时内存检查（P0）

**方案**：在 `createTask()` 中调用 `os.freemem()` / `os.totalmem()` 检查可用内存占比。

- 阈值：可用内存 < 20% 时阻止创建
- 行为：硬拦截，返回错误信息，提示用户将无用任务拖到 Done 释放资源
- 模块：`src/commands/task.ts`

**注意事项**：
- macOS 上 `os.freemem()` 可能偏保守（file cache 算 used），但作为"保守阈值"反而是安全的
- 阈值可作为常量定义，后续按需可配置化

### 修复 2: SessionEntry Map 清理（P1）

**方案**：在 `TerminalSessionManager` 中新增 `removeTaskEntry(taskId)` 方法，在 `trashTaskById` 停止 session 后调用。

- 新增方法：`removeTaskEntry(taskId)` — 从 `entries` Map 中删除条目
- 调用时机：`trashTaskById` 中 `stopTaskRuntimeSession` 之后
- 模块：`src/terminal/session-manager.ts`、`src/commands/task.ts`

### 修复 3: Review 列轮询优化（P3）

**方案**：`collectTrackedTasks` 跳过 review 列，或降低 review 列 task 的轮询频率。

- 模块：`src/server/workspace-metadata-monitor.ts`

### 修复 4: 前端内存使用可视化（P1）

**方案**：在 Kanban TopBar 中展示系统内存实时状态，让用户直观感知资源使用情况。

**后端**：
- 在 `src/core/api-contract.ts` 新增 `runtimeSystemMemoryResponseSchema`（totalMemory、freeMemory、usagePercent）
- 在 `src/trpc/app-router.ts` 的 `runtime` router 新增 `getSystemMemory` query，调用 `os.freemem()` / `os.totalmem()`

**前端**：
- 在 `web-ui/src/runtime/runtime-config-query.ts` 新增 `fetchSystemMemory` query helper
- 新建 `web-ui/src/hooks/use-system-memory.ts` 轮询 hook（10 秒间隔，generation counter 防 race）
- 在 `web-ui/src/components/top-bar.tsx` 右侧按钮区（Settings 左边）新增内存指示器
- 在 `web-ui/src/App.tsx` 调用 `useSystemMemory()` 并传入 TopBar

**展示格式**：`12.3 / 16.0 GB (77%)`，用 Tooltip 展示完整信息

**颜色分级**：
- 正常（< 80%）：`text-text-secondary` + `bg-surface-2`
- 警告（>= 80%）：`text-status-orange` + `bg-status-orange/10`
- 危险（>= 90%）：`text-status-red` + `bg-status-red/10`

### 不做的事

- **Review 列自动超时**：不自动停止 review 状态的 session，仅依赖内存检查防止资源耗尽
- **进程树 kill 优化**：`terminatePtyProcess` 和 `treeKill` 的当前实现在用户实测中工作正常，暂不改动

## 影响分析

| 维度 | 风险等级 | 评估 |
|------|----------|------|
| 数据库 schema 变更 | 🟢 低 | 不涉及 |
| 外部 API/第三方系统 | 🟢 低 | 不涉及 |
| 配置变更（需重启） | 🟢 低 | 无需重启 |
| 并发/幂等问题 | 🟡 中 | 内存检查存在 TOCTOU 窗口，但用户操作间隔远大于竞态窗口 |
| 回归风险 | 🟡 中 | SessionEntry Map 清理需确保不影响活跃 session |
| 可回滚性 | 🟢 低 | 纯代码变更 |
| 数据不一致 | 🟢 低 | 不涉及数据持久化 |

**综合风险评级：🟡 中风险**

## 测试方案

### 1. 单元测试

**内存检查逻辑：**
- 正常路径：可用内存 > 20%，task 创建成功
- 边界值：可用内存 = 20%，task 创建成功（>=20% 放行）
- 异常路径：可用内存 < 20%，返回错误信息，不创建 task

**SessionEntry 清理：**
- 正常路径：trash task 后，entries Map 中对应条目被删除
- 边界值：task 不在 Map 中时调用清理，不报错
- 异常路径：清理不影响其他 task 的 SessionEntry

### 2. 集成测试
- 创建 task → trash task → 验证 SessionEntry 被清理
- 低内存模拟 → 创建 task → 验证拦截和错误提示

### 3. 手工验证步骤
1. 启动 Kanban，打开 Activity Monitor / `htop`
2. 创建 5 个 task，记录进程数和内存用量
3. 将所有 task 移到 Done，验证内存回收
4. 临时降低内存阈值（如 99%），验证创建拦截和提示信息展示
5. 恢复阈值，验证正常创建

### 4. 回归测试范围
- 受影响功能：task 创建、task 删除/trash、review 列 git 轮询
- 需要回归：正常 task 生命周期（创建→开发→review→done）
- 验证方式：手工

## 验收标准

- [ ] 可用内存 < 20% 时，阻止创建新 task 并显示明确提示
- [ ] 提示信息引导用户将无用任务拖到 Done 释放资源
- [ ] Task 被 trash 后，TerminalSessionManager 的 entries Map 中对应条目被清理
- [ ] 长时间运行后，trash/done 的 task 不再导致 SessionEntry Map 无限增长
- [ ] Review 列 task 不产生每秒 git 轮询（或降低频率）
- [ ] TopBar 右侧显示系统内存信息（剩余/总量/使用率），每 10 秒刷新
- [ ] 内存使用率 >= 80% 时指示器变为橙色警告，>= 90% 变为红色危险
- [ ] 补充内存检查和 SessionEntry 清理的单元测试

## 工作量估算

| 项目 | 估算 |
|------|------|
| 内存检查 + 拦截提示 | 0.5 人天 |
| SessionEntry Map 清理 | 0.5 人天 |
| Review 列轮询优化 | 0.5 人天 |
| 前端内存可视化（TopBar） | 0.5 人天 |
| 单元测试 + 手工验证 | 0.5-1 人天 |
| **合计** | **2.5-3 人天** |

复杂度：中等
