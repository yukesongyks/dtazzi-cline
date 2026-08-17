> **文档元信息**
>
> | 项目 | 内容 |
> |------|------|
> | 文档版本 | v1.0 |
> | 作者 | DTCoder |
> | 创建日期 | 2026-08-17 |
> | 需求来源 | 代码审查 — kb-tooltip-show 动画重复 5 处 |
> | 评审状态 | 待评审 |

# kb-tooltip-show 动画重复提取 系分设计

## 1. 需求与范围

### 背景与目标
- **背景**：`@keyframes kb-tooltip-show` 动画关键帧已在 `web-ui/src/styles/globals.css` 中定义，但其应用方式为 5 处独立的 `style={{ animation: "kb-tooltip-show 100ms ease" }}` inline 样式，分布在 4 个组件文件中。
- **目标**：将重复的 inline animation 提取为全局 CSS 工具类，消除代码重复，提升可维护性。

### 核心功能
| 功能点 | 描述 |
|--------|------|
| F01 | 在 globals.css 中定义 `.animate-kb-tooltip-show` 工具类 |
| F02 | 替换 5 处 inline `style={{ animation: "kb-tooltip-show 100ms ease" }}` 为 `className="animate-kb-tooltip-show"` |

### 约束与非功能要求
- 保持动画行为完全一致（100ms ease）
- 不引入任何运行时额外依赖
- 不改变现有 UI 布局或视觉表现
- 兼容 Tailwind CSS v4 样式体系

### 排除范围
- 不修改 `@keyframes kb-tooltip-show` 的定义内容
- 不涉及其他动画或关键帧的重构
- 不涉及后端逻辑变更

### 需求功能清单与优先级

| 编号 | 功能点 | 优先级 | 原始描述 | 备注 |
|------|--------|--------|----------|------|
| F01 | 定义 CSS 工具类 `.animate-kb-tooltip-show` | P0 | 提取为全局 CSS 类 | 定义在 globals.css 中 |
| F02 | 替换 5 处 inline style 为 className | P0 | 替换 inline style | 涉及 4 个文件 |

### 假设与待确认项

| 编号 | 假设/待确认内容 | 当前假设 | 确认状态 |
|------|-----------------|----------|----------|
| A01 | 类名约定为 `.animate-kb-tooltip-show` 与现有 `@keyframes` 命名一致 | 使用 `animate-` 前缀，与 Tailwind 惯例一致 | 待确认 |
| A02 | 100ms 时长在所有 5 处保持一致 | 5 处均为 `100ms ease`，可直接提取 | 已确认 |

## 2. 架构与模块

### 功能架构
本项不适用，原因：本次变更仅为前端 CSS 工具类提取，不涉及系统架构或模块划分变更。

### 模块清单

| 模块 | 涉及文件 | 变更类型 |
|------|----------|----------|
| 样式层 | `web-ui/src/styles/globals.css` | 新增 `.animate-kb-tooltip-show` 类 |
| 组件层 | `web-ui/src/components/ui/tooltip.tsx` | 替换 inline style 为 className |
| 组件层 | `web-ui/src/components/top-bar.tsx` | 替换 inline style 为 className（2 处） |
| 组件层 | `web-ui/src/components/open-workspace-button.tsx` | 替换 inline style 为 className |
| 组件层 | `web-ui/src/components/runtime-settings-dialog.tsx` | 替换 inline style 为 className |

### 应用集成架构
本项不适用，原因：无外部系统集成，纯前端样式变更。

### 部署架构
本项不适用，原因：无部署架构变更。

## 3. 数据模型与存储

本项不适用，原因：本次变更为前端 CSS 样式重构，不涉及数据模型、数据库、缓存或消息队列。

## 4. 接口设计

本项不适用，原因：本次变更为前端 CSS 样式重构，不涉及后端接口或 API 定义。

## 5. 功能模块设计

### 全局约定

| 约定项 | 内容 |
|--------|------|
| CSS 类名 | `.animate-kb-tooltip-show` |
| CSS 类内容 | `animation: kb-tooltip-show 100ms ease` |
| 定义位置 | `web-ui/src/styles/globals.css`，紧邻 `@keyframes kb-tooltip-show` 之后 |
| 变更文件数 | 5 个文件（1 个 CSS + 4 个 TSX） |

### 5.1 样式模块（CSS 工具类定义）

#### 5.1.1 CSS 定义

在 `web-ui/src/styles/globals.css` 中，`@keyframes kb-tooltip-show` 定义之后（第 1080 行后），新增：

```css
.animate-kb-tooltip-show {
	animation: kb-tooltip-show 100ms ease;
}
```

#### 5.1.2 替换方案详细设计

##### 替换清单

| 编号 | 文件路径 | 行号 | 当前代码 | 替换为 |
|------|----------|------|----------|--------|
| R01 | `web-ui/src/components/ui/tooltip.tsx` | 28 | `style={{ animation: "kb-tooltip-show 100ms ease" }}` | `className="animate-kb-tooltip-show"` |
| R02 | `web-ui/src/components/top-bar.tsx` | 84 | `style={{ animation: "kb-tooltip-show 100ms ease" }}` | `className="animate-kb-tooltip-show"` |
| R03 | `web-ui/src/components/top-bar.tsx` | 589 | `style={{ animation: "kb-tooltip-show 100ms ease" }}` | `className="animate-kb-tooltip-show"` |
| R04 | `web-ui/src/components/open-workspace-button.tsx` | 78 | `style={{ animation: "kb-tooltip-show 100ms ease" }}` | `className="animate-kb-tooltip-show"` |
| R05 | `web-ui/src/components/runtime-settings-dialog.tsx` | 395 | `style={{ animation: "kb-tooltip-show 100ms ease" }}` | `className="animate-kb-tooltip-show"` |

##### 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A（推荐） | CSS 工具类 + className 替换 | 最简洁、零运行时开销、与现有 Tailwind 体系一致 | 需要手动替换 5 处 |
| B | Tailwind 插件注册 `kb-tooltip-show` | 可在 className 中直接写 `animate-kb-tooltip-show` | 需额外配置 tailwind.config，增加复杂度 |
| C | 保留现状 inline style | 无需改动 | 代码重复，难以维护 |

**推荐方案：A** — 直接在 globals.css 中定义 CSS 类，与现有的 `@keyframes` 定义放在一起，符合项目现有样式架构。

##### 业务规则

| 规则编号 | 规则描述 | 校验时机 | 不满足时的处理 |
|----------|----------|----------|--------------|
| R01 | `.animate-kb-tooltip-show` 类必须定义在 `@keyframes kb-tooltip-show` 之后 | CSS 构建时 | 动画引用不到 keyframe，浏览器不执行动画 |
| R02 | 替换后的 className 不能与元素上已有的 className 冲突 | 替换时 | 需检查目标元素现有的 className 使用 cn() 合并 |

##### 异常场景

| 异常场景 | 处理方式 |
|----------|----------|
| 目标元素已有多个 className 使用了 cn() 合并 | 将 `"animate-kb-tooltip-show"` 作为 cn() 的额外参数传入 |
| 目标元素同时有 `className` 和 `style` 属性 | 移除 `style` 中的 animation 属性，保留其他 style 属性 |

##### 并发控制

本项不适用，原因：纯 CSS/JSX 变更，不涉及数据写入并发。

##### 状态机设计

本项不适用，原因：无状态字段。

## 6. 非功能性需求设计

### 6.1 高可用性
本项不适用，原因：CSS 工具类提取不涉及服务可用性。

### 6.2 可扩展性
本项不适用，原因：新增 CSS 类不会影响系统扩展性。

### 6.3 稳定性/可靠性
变更后动画行为与变更前完全一致（使用相同的 `@keyframes` 和 `100ms ease` 参数），不会引入视觉差异。CSS 类在构建时静态编译，无运行时失败风险。

### 6.4 安全性设计
本项不适用，原因：CSS 变更不涉及安全维度（账户、授权、数据防护）。

### 6.5 监控/统计/日志/告警
本项不适用，原因：CSS 变更无需监控埋点。

## 7. 变更三板斧

### 7.1 可监控
本项不适用，原因：CSS 样式提取无运行时逻辑，无需监控埋点。构建阶段可通过 `npm run build` 或 `tsc --noEmit` 验证 CSS 编译无报错。

### 7.2 可灰度
本项不适用，原因：CSS 工具类提取不涉及功能开关或灰度逻辑。变更后视觉效果与变更前完全一致，无需灰度验证。

### 7.3 可应急
本项不适用，原因：CSS 变更可通过 git revert 快速回滚，变更粒度小，回滚前后无兼容性问题。回滚时只需恢复 globals.css 和 4 个 TSX 文件即可。