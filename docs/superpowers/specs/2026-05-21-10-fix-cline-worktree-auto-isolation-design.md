# 修复 Cline worktree 自动隔离行为 设计文档

> Issue: #10 — 修复 Cline worktree 自动隔离行为

## 背景

当前云上 issue 类 skill 的会话启动行为与预期不符：

1. 会话一启动就自动进入 `.cline/worktrees/...` 下的 task worktree，而不是项目根目录。
2. `issue-refine` / `issue-plan` 这类本应只做分析和文档落盘的流程，也会运行在 worktree 里。
3. 用户在 Cline / Claude Code 会话中很难感知自己当前是否在隔离 worktree 内，行为体验偏离“原生 CC 在项目根目录工作”的直觉。

issue 评论里已经给出一个可选方向：在 New Task 增加“是否创建 worktrees”选项，默认不开启。但在正式设计前，需要先确认真实根因是否真的是 New Task UI 缺少一个开关。

## 根因分析

### B1. 根因调查

#### 现象复盘

根据 issue 描述，问题具备稳定复现特征：

- 启动 issue 类 skill 会话时自动进入 `.cline/worktrees/...`
- refine 阶段写入的 design doc 落在 worktree 语义里，后续被当成待提交改动
- 只有 issue-resolve 真的需要隔离开发环境，其他 issue skill 并不需要

#### 代码证据

关键链路已经存在明确证据：

1. `src/trpc/runtime-api.ts:80-99`
   `resolveExistingTaskCwdOrEnsure(...)` 对普通 task session 先尝试解析已有 task cwd，失败后直接 `ensure: true` 创建 worktree。

2. `src/trpc/runtime-api.ts:215-229`
   `startTaskSession(...)` 中，只要 `taskId` 不是 `home-agent session`，就会走：

   - `resolveExistingTaskCwdOrEnsure(...)`
   - 也就是普通 task 启动默认绑定 worktree

3. `src/core/home-agent-session.ts:3-18`
   系统其实已经有“不绑定真实 task worktree”的 session 模型：`home-agent session`。

4. `web-ui/src/hooks/use-home-agent-session.ts:313-323`
   `home-agent session` 启动时传的就是 workspace 根目录 baseRef，会话本身不要求创建 worktree。

5. `/Users/yukesong/.codex/skills/issue-resolve/SKILL.md:146-158`
   `issue-resolve` 明确依赖 worktree，并且会在进入 worktree 后，把主仓库中的 `specs/plans` 复制进去再提交。这说明：

   - `issue-resolve` 保持 worktree 语义是合理的
   - 非 resolve 类 skill 不必为了 artifact 传递而强制也跑在 worktree 中

#### 根因结论

真正的根因不是单一 hook，也不是单一 UI 缺少选项，而是：

- 当前系统把“这是一个 task”直接等同于“这个 task 必须工作在 worktree 中”
- 缺少显式的“执行隔离策略 / session workspace mode”建模
- 导致所有 issue 类 skill 都复用了 `issue-resolve` 的隔离模型

换句话说，**问题源头是 session/task 启动模型缺少“项目根目录运行”这一等价一等能力**。

### B2. 模式分析

对比正常工作的参考模式，可以看到两套本就并存的模型：

#### 模式 A：worktree-backed task

适用场景：

- 真正要改代码
- 需要 diff 隔离
- 需要 PR / commit / cleanup 生命周期

现有代表：

- 普通 Kanban task
- `issue-resolve`

#### 模式 B：workspace-root session

适用场景：

- 只读分析
- 写本地设计文档 / 计划文档
- 不需要 git worktree 隔离

现有代表：

- `home-agent session`

当前 issue 的异常点就在于：`issue-refine/plan/list/close/split` 这类本应属于模式 B 的任务，被错误塞进了模式 A。

## 修复策略

### B3. 假设与验证

核心假设：

> 我认为问题根因是“非 home-agent 的 task session 默认一定绑定 worktree”，因为 `runtime.startTaskSession` 对普通 task 无条件走 `resolveExistingTaskCwdOrEnsure(...)`，而 issue 类 skill 又是以普通 task 形式启动的。

这条假设与当前代码证据一致，也解释了全部症状：

- 自动进入 worktree
- refine/plan 产物留在 worktree 语义中
- 用户无法感知当前不在项目根目录

### B4. 推荐修复方向

#### 推荐方向：引入显式执行隔离策略，按 skill 类型路由

策略描述：

为 task/session 增加显式执行模式，例如：

- `worktree`：需要隔离开发环境
- `project_root`：直接在项目根目录运行，不创建/进入 worktree

然后按 issue skill 类型路由：

- `issue-resolve` → `worktree`
- `issue-refine` / `issue-plan` / `issue-list` / `issue-close` / `issue-split` → `project_root`

选择理由：

- 直接命中根因：不是 patch 某个 skill，而是补齐缺失的运行语义
- 能保留 `issue-resolve` 的现有开发隔离能力
- 与现有 `home-agent session` 的“无 worktree”能力方向一致，但不强行复用其“你不是 coding agent”的 sidebar prompt 语义
- 比“所有 task 默认不建 worktree”更安全，不会破坏 README 和现有 Kanban 主模型

#### 备选方向 1：New Task 增加“是否创建 worktree”开关，默认关闭

优点：

- 用户可见，控制权直接
- 能覆盖不仅是 issue skill，连普通 task 也可选择不隔离

缺点：

- 产品面太宽，会改变 Kanban “task 默认隔离”这一核心心智
- issue 描述其实是按 skill 类型区分，而不是希望所有 task 默认不隔离
- 默认关闭会对现有 task coding 工作流造成较大行为回归风险

适用场景：

- 如果产品目标是把 Kanban 从“默认 worktree”改成“可选 worktree”，才值得走这条路

#### 备选方向 2：直接把非 resolve issue skill 改走 home-agent session

优点：

- 现有代码已经具备无 worktree session 模型
- 实现成本可能最低

缺点：

- `home-agent session` 当前自带 sidebar / board-manager prompt 语义，不适合直接承载 refine/plan 这类会写文档的 coding-oriented skill
- 一旦直接复用，容易把“会话身份模型”和“prompt 角色模型”绑死

适用场景：

- 如果后续愿意拆出一个新的 “project-root task session” 抽象，可借鉴 `home-agent` 的 session identity 设计，但不应直接照搬

## 影响分析

涉及模块：

- `src/trpc/runtime-api.ts`
  task session 启动时的 cwd / worktree 决策
- `src/workspace/task-worktree.ts`
  仅在 `worktree` 模式下才应参与
- `src/core/api-contract.ts`
  如引入 session/task workspace mode，需要新增 schema
- `web-ui/src/hooks/use-task-sessions.ts`
  启动 payload 需要带上执行模式
- issue skill 启动入口
  需要区分 `issue-resolve` 与其他 issue 类 skill 的运行策略

外部依赖：

- 无新增第三方依赖
- 与 git worktree 生命周期、现有 hook/commit prompt 有行为耦合

隐含边界：

- `issue-resolve` 依赖 worktree，不可一起关闭
- `issue-refine/plan` 写入的本地 `docs/superpowers/specs|plans` 仍需与 `issue-resolve` 串联
  这里现有 skill 已通过“进入 worktree 后从主仓库复制 artifacts”处理，因此不是阻塞项

## Issue 类型识别

🔍 Issue 类型识别: `bug`
依据: 标题包含“修复”，正文描述的是当前行为与期望行为不一致
置信度: 高

## 方案探索

### 方案 A：默认 task 增加 worktree 开关，New Task 可配置

描述：

在 task 模型中增加 `createWorktree` 或 `workspaceMode` 配置，并在 New Task UI 上暴露选项。

优点：

- 用户可见、通用性强
- 满足 issue 评论中“New Task 增加选项”的思路

缺点：

- 超出本 issue 的最小修复范围
- 容易改变 Kanban 整体交互模型
- issue 的真实需求是“按 skill 类型分流”，不是“普通 task 让用户每次手动选”

### 方案 B：按 skill 类型内建执行模式

描述：

引入显式执行隔离策略，由 issue skill 启动器内部决定：

- resolve 走 worktree
- refine/plan/list/close/split 走 project root

优点：

- 最贴合 issue 目标
- 风险最小
- 不要求用户增加额外理解成本

缺点：

- 需要理清 skill 启动入口与 task/session 启动 payload 的关系
- 后续如果要推广到普通 task，再往通用配置抽象时需要二次设计

### 推荐方案

推荐方案 B。

理由：

- 根因在“启动模型缺少执行模式”，不是单纯 UI
- issue 目标是修复 issue skill 体验，不是重构整个 task 产品形态
- 能最大程度保留 `issue-resolve` 的既有隔离优势

## Issue 完整度分析

- [x] 背景描述 - 当前异常行为和期望行为已经写得很清楚
- [/] 目标定义 - 已明确 skill 分流方向，但“是否推广到普通 New Task”仍需边界说明
- [/] 技术方案 - 评论里给了一个 UI 方案雏形，但未覆盖真正根因和 session 模型
- [/] 影响范围 - 当前 issue 只写到了 worktree 行为，未显式点出 `runtime-api`、session 启动和 skill 路由
- [/] 验收标准 - 需要可观测地验证哪些 skill 走项目根目录、哪些仍走 worktree
- [/] 测试方案 - 原文缺失
- [/] 工作量估算 - 原文缺失
- [/] 范围边界 - 需明确这次是否修改普通 New Task 默认行为
- [/] 依赖关系 - 依赖现有 home-agent / worktree / issue-resolve artifact 复制语义
- [/] 风险分析 - 需补现有 task coding 流程回归风险
- [/] 回滚方案 - 原文缺失

### 优先级

1. 🔴 **必须补充**：是否只修 issue 类 skill，还是同时改普通 New Task 的默认 worktree 行为
2. 🟡 **强烈建议**：明确 session/task 层的执行模式命名与落点
3. 🟢 **锦上添花**：后续是否开放给普通 task 作为可选配置

## 风险评估

- 是否涉及数据库 schema 变更：🟢 低
  当前看不到数据库，主要是 runtime contract / config / session 启动逻辑
- 是否涉及外部 API/第三方系统变更：🟢 低
  无新增第三方依赖
- 是否涉及配置变更（需重启/发布）：🟡 中
  如引入新的 task/session 运行模式，需前后端一起发布
- 是否有并发/幂等问题：🟡 中
  如果同一 task 在不同运行模式之间切换，需防止重复会话或错误复用
- 是否影响现有功能的正常路径（回归风险）：🟡 中
  影响 task session 启动主链路，但范围可通过“仅 issue skill 分流”收窄
- 代码/配置/数据是否均可回滚：🟢 低
  回滚到“全部 task 走 worktree”即可
- 是否有数据不一致的窗口期：🟢 低
  主要是会话启动语义，不涉及持久业务数据迁移

## 测试方案

### 1. 单元测试

- 测试目标：session/task 启动时的 cwd 决策逻辑
- 用例列表：
  - 正常路径：`issue-resolve` 类型 task → 选择 `worktree` 模式 → 调用 `resolveTaskCwd(... ensure=true)`
  - 正常路径：`issue-refine` / `issue-plan` 类型 task → 选择 `project_root` 模式 → 直接使用 workspace 根目录
  - 边界值：未显式指定模式时，普通 task 仍保持现有默认 `worktree`
  - 异常路径：传入未知模式 / 缺少 baseRef 时，返回明确错误而不是 silent fallback

### 2. 集成测试

- 测试目标：runtime API 和 session manager 协同
- 测试数据准备：
  - 一个普通 workspace
  - 一个 `issue-refine` 风格 task
  - 一个 `issue-resolve` 风格 task
- 用例列表：
  - 启动 refine task，不创建 worktree，summary.workspacePath 为项目根目录
  - 启动 resolve task，创建并进入 `.cline/worktrees/...`
  - refine 生成 `docs/superpowers/specs/*` 后，resolve 仍可按既有技能流程复制 artifacts 到 worktree

### 3. 手工验证步骤

- 前置条件：准备一个 issue，分别执行 refine / plan / resolve
- 验证步骤：
  1. 启动 `issue-refine`
  2. 在会话中执行 `pwd`
  3. 预期结果：显示项目根目录，而不是 `.cline/worktrees/...`
  4. 启动 `issue-plan`
  5. 再次执行 `pwd`
  6. 预期结果：仍为项目根目录
  7. 启动 `issue-resolve`
  8. 执行 `pwd`
  9. 预期结果：进入 `.cline/worktrees/{taskId}/...`

### 4. 回归测试范围

- 受影响已有功能：
  - 普通 task 启动
  - worktree 创建/删除
  - home-agent session
  - issue-resolve 复制 specs/plans artifacts 的流程
- 需要回归的用例：
  - 普通 task 仍按现有方式进入 worktree
  - home sidebar agent 仍保持无 worktree 行为
  - issue-resolve 仍可正常 commit / PR / cleanup
  - refine/plan 写入 docs 后，resolve 不丢失 design artifacts
- 回归验证方式：
  - 自动化 + 手工 smoke test

## 验收标准

- [ ] `issue-refine` 启动后默认在项目根目录运行，不创建/进入 worktree
- [ ] `issue-plan` / `issue-list` / `issue-close` / `issue-split` 默认在项目根目录运行
- [ ] `issue-resolve` 仍保持在 `.cline/worktrees/` 下运行
- [ ] 非 resolve 类 issue skill 产出的 `docs/superpowers/specs|plans` 不再落在隔离 worktree 语义中
- [ ] 用户可明确感知当前会话是否在 worktree 中
- [ ] 普通 task 的现有 worktree 隔离默认行为不被意外破坏

## 工作量估算

- 复杂度：中等
- 估算：1-2 人天

其中：

- 0.5 天：定位并抽象 session/task 执行模式
- 0.5 天：修正 issue skill 路由与启动链路
- 0.5-1 天：测试与回归
