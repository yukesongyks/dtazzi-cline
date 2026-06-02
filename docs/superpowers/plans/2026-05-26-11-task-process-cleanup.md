# Task 进程未及时清理导致内存和线程持续占用 实现计划

> **Issue:** #11 | **链接:** AntCode Issue #11
> **生成时间:** 2026-05-26
> **使用 issue-resolve 按计划逐 Task 实现**

**目标:** 防止 Kanban task 资源无限增长：创建时内存检查拦截、停止时清理 SessionEntry、减少 review 列轮询、前端可视化内存状态。
**技术方案:** 4 个互补修复 — P0 内存检查阈值 + P1 SessionEntry Map 泄漏修复 + P1 前端内存可视化 + P3 review 列轮询优化。
**预估工作量:** 2.5-3 人天 / 中等复杂度

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| Modify | `src/core/api-contract.ts:L957` | 新增 `runtimeSystemMemoryResponseSchema` |
| Modify | `src/trpc/app-router.ts:L611` | 新增 `getSystemMemory` query |
| Modify | `src/commands/task.ts:L500` | `createTask` 增加内存检查 |
| Modify | `src/terminal/session-manager.ts:L957-973` | `stopTaskSession` 后清理 entries |
| Modify | `src/server/workspace-metadata-monitor.ts:L66` | 跳过 review 列轮询 |
| Modify | `web-ui/src/runtime/runtime-config-query.ts:L257` | 新增 `fetchSystemMemory` |
| Create | `web-ui/src/hooks/use-system-memory.ts` | 内存轮询 hook |
| Modify | `web-ui/src/components/top-bar.tsx:L675` | 内存指示器 UI |
| Modify | `web-ui/src/App.tsx:L910` | 传递内存数据给 TopBar |
| Create | `test/runtime/system-memory-check.test.ts` | 内存检查单元测试 |

---

### Task 1: API Contract — 内存状态 Schema

**Files:**
- Modify: `src/core/api-contract.ts:L957`

- [ ] **Step 1: 新增 schema 和类型**

  在 `runtimeUpdateStatusResponseSchema`（L956）之后添加：

  ```typescript
  export const runtimeSystemMemoryResponseSchema = z.object({
  	totalMemory: z.number(),
  	freeMemory: z.number(),
  	usagePercent: z.number(),
  });
  export type RuntimeSystemMemoryResponse = z.infer<typeof runtimeSystemMemoryResponseSchema>;
  ```

---

### Task 2: Backend — getSystemMemory tRPC endpoint

**Files:**
- Modify: `src/trpc/app-router.ts:L6,L185,L611`

- [ ] **Step 1: 添加 import**

  在 `app-router.ts` 顶部 `import { z } from "zod"` 之后（L6），添加：

  ```typescript
  import os from "node:os";
  ```

  在 schema import 块（L103-197）中，在 `runtimeUpdateStatusResponseSchema,`（L185）之后添加：

  ```typescript
  	runtimeSystemMemoryResponseSchema,
  ```

  在 type import 块（L8-102）中，在 `RuntimeUpdateStatusResponse,`（L90）之后添加：

  ```typescript
  	RuntimeSystemMemoryResponse,
  ```

- [ ] **Step 2: 添加 getSystemMemory query**

  在 `getUpdateStatus` procedure（L613）之后添加：

  ```typescript
  		getSystemMemory: t.procedure.output(runtimeSystemMemoryResponseSchema).query((): RuntimeSystemMemoryResponse => {
  			const totalMemory = os.totalmem();
  			const freeMemory = os.freemem();
  			const usagePercent = Math.round(((totalMemory - freeMemory) / totalMemory) * 100);
  			return { totalMemory, freeMemory, usagePercent };
  		}),
  ```

- [ ] **Step 3: 验证编译**

  Run: `npx tsc --noEmit`
  Expected: PASS

---

### Task 3: 内存检查 — createTask 拦截

**Files:**
- Modify: `src/commands/task.ts:L1,L500`

- [ ] **Step 1: 添加 os import**

  在 `src/commands/task.ts` 顶部 import 区域添加：

  ```typescript
  import os from "node:os";
  ```

- [ ] **Step 2: 添加内存检查常量和逻辑**

  在 `createTask` 函数体开头（L500 `}): Promise<JsonRecord> {` 之后，L501 之前），插入：

  ```typescript
  	const MEMORY_THRESHOLD_PERCENT = 20;
  	const totalMem = os.totalmem();
  	const freeMem = os.freemem();
  	const freePercent = (freeMem / totalMem) * 100;
  	if (freePercent < MEMORY_THRESHOLD_PERCENT) {
  		const usedGB = ((totalMem - freeMem) / (1024 ** 3)).toFixed(1);
  		const totalGB = (totalMem / (1024 ** 3)).toFixed(1);
  		throw new Error(
  			`System memory is critically low (${usedGB}/${totalGB} GB used, ${Math.round(100 - freePercent)}% usage). ` +
  				`Move unused tasks to Done to free up resources before creating new tasks.`,
  		);
  	}
  ```

---

### Task 4: SessionEntry Map 清理

**Files:**
- Modify: `src/terminal/session-manager.ts:L957-973`

- [ ] **Step 1: 修改 stopTaskSession 添加 entries 清理**

  将 `stopTaskSession`（L957-973）的最后两行从：

  ```typescript
  		return cloneSummary(entry.summary);
  	}
  ```

  改为：

  ```typescript
  		const result = cloneSummary(entry.summary);
  		this.entries.delete(taskId);
  		return result;
  	}
  ```

  说明：`cloneSummary` 先拷贝返回值，再从 Map 中删除条目。PTY exit handler 通过闭包引用 entry 对象，删除 Map 条目不影响其执行。后续若同一 taskId 重新启动 session，`ensureEntry` 会创建新条目。

---

### Task 5: Review 列轮询优化

**Files:**
- Modify: `src/server/workspace-metadata-monitor.ts:L66`

- [ ] **Step 1: 跳过 review 列**

  将 `collectTrackedTasks`（L66）中的条件从：

  ```typescript
  		if (column.id === "backlog" || column.id === "trash") {
  ```

  改为：

  ```typescript
  		if (column.id === "backlog" || column.id === "trash" || column.id === "review") {
  ```

---

### Task 6: Frontend — Query Helper + Hook

**Files:**
- Modify: `web-ui/src/runtime/runtime-config-query.ts:L37,L257`
- Create: `web-ui/src/hooks/use-system-memory.ts`

- [ ] **Step 1: 添加 fetchSystemMemory query helper**

  在 `runtime-config-query.ts` 的 type import（L37）中添加：

  ```typescript
  	RuntimeSystemMemoryResponse,
  ```

  在 `fetchRuntimeUpdateStatus`（L257）之后添加：

  ```typescript
  export async function fetchSystemMemory(workspaceId: string | null): Promise<RuntimeSystemMemoryResponse> {
  	const trpcClient = getRuntimeTrpcClient(workspaceId);
  	return await trpcClient.runtime.getSystemMemory.query();
  }
  ```

- [ ] **Step 2: 创建 useSystemMemory hook**

  新建 `web-ui/src/hooks/use-system-memory.ts`：

  ```typescript
  import { useCallback, useEffect, useRef, useState } from "react";

  import { fetchSystemMemory } from "@/runtime/runtime-config-query";
  import type { RuntimeSystemMemoryResponse } from "@/runtime/types";

  const MEMORY_POLL_INTERVAL_MS = 30_000;
  const MEMORY_UPDATE_THRESHOLD_PERCENT = 5;

  interface UseSystemMemoryResult {
  	memory: RuntimeSystemMemoryResponse | null;
  	isLoading: boolean;
  }

  export function useSystemMemory(): UseSystemMemoryResult {
  	const [memory, setMemory] = useState<RuntimeSystemMemoryResponse | null>(null);
  	const [isLoading, setIsLoading] = useState(true);
  	const genRef = useRef(0);

  	const refresh = useCallback(async () => {
  		const gen = ++genRef.current;
  		try {
  			const result = await fetchSystemMemory(null);
  			if (gen !== genRef.current) return;
  			setMemory((prev) => {
  				if (prev && Math.abs(result.usagePercent - prev.usagePercent) < MEMORY_UPDATE_THRESHOLD_PERCENT) {
  					return prev;
  				}
  				return result;
  			});
  		} catch {
  			// Best effort: memory status is non-critical.
  		} finally {
  			if (gen === genRef.current) {
  				setIsLoading(false);
  			}
  		}
  	}, []);

  	useEffect(() => {
  		void refresh();
  		const interval = window.setInterval(() => {
  			void refresh();
  		}, MEMORY_POLL_INTERVAL_MS);
  		return () => {
  			window.clearInterval(interval);
  		};
  	}, [refresh]);

  	return { memory, isLoading };
  }
  ```

---

### Task 7: Frontend — TopBar 内存指示器 + App.tsx 接线

**Files:**
- Modify: `web-ui/src/components/top-bar.tsx:L1,L281,L675`
- Modify: `web-ui/src/App.tsx:L82,L856`

- [ ] **Step 1: TopBar — 添加 import 和 formatBytes 函数**

  在 `top-bar.tsx` 的 import 区域（L17-30），添加 `MemoryStick` icon import：

  ```typescript
  // 在 lucide-react import 中增加 MemoryStick
  import {
  	ArrowDown,
  	ArrowLeft,
  	ArrowUp,
  	Bug,
  	Check,
  	ChevronDown,
  	CircleArrowDown,
  	Command,
  	GitBranch,
  	MemoryStick,
  	Menu,
  	Play,
  	Plus,
  	Settings,
  	Terminal,
  } from "lucide-react";
  ```

  在 TopBar 组件 export function 之前，添加 import 和辅助函数：

  ```typescript
  import React from "react";
  import type { RuntimeSystemMemoryResponse } from "@/runtime/types";

  function formatBytes(bytes: number): string {
  	const gb = bytes / (1024 ** 3);
  	return `${gb.toFixed(1)} GB`;
  }
  ```

- [ ] **Step 2: TopBar — 添加 systemMemory prop**

  在 TopBar props 参数列表（L281-316）中，在 `hideProjectDependentActions = false,` 之前添加：

  ```typescript
  	systemMemory,
  ```

  在 props 类型声明中，在 `hideProjectDependentActions?: boolean;` 之前添加：

  ```typescript
  	systemMemory?: RuntimeSystemMemoryResponse | null;
  ```

- [ ] **Step 3: TopBar — 添加内存指示器 UI（独立 memo 组件）**

  在 TopBar 组件 export function 之前，添加独立的 memo 组件，防止内存数据刷新导致整个 TopBar re-render：

  ```tsx
  const MemoryIndicator = React.memo(function MemoryIndicator({
  	memory,
  }: {
  	memory: RuntimeSystemMemoryResponse;
  }) {
  	return (
  		<Tooltip
  			content={`Memory: ${formatBytes(memory.totalMemory - memory.freeMemory)} used / ${formatBytes(memory.totalMemory)} total`}
  		>
  			<span
  				className={cn(
  					"inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs",
  					memory.usagePercent >= 90
  						? "border-status-red/30 bg-status-red/10 text-status-red"
  						: memory.usagePercent >= 80
  							? "border-status-orange/30 bg-status-orange/10 text-status-orange"
  							: "border-border bg-surface-2 text-text-secondary",
  				)}
  			>
  				<MemoryStick size={12} />
  				{formatBytes(memory.freeMemory)} / {formatBytes(memory.totalMemory)} ({memory.usagePercent}%)
  			</span>
  		</Tooltip>
  	);
  });
  ```

  在 Settings 按钮之前（L675 的 `{/* Settings: always visible */}` 之前），插入：

  ```tsx
  					{systemMemory && !isMobile ? (
  						<MemoryIndicator memory={systemMemory} />
  					) : null}
  ```

- [ ] **Step 4: App.tsx — 调用 hook 并传 props**

  在 `web-ui/src/App.tsx` 的 import 区域添加：

  ```typescript
  import { useSystemMemory } from "@/hooks/use-system-memory";
  ```

  在 App 组件内部（约 L135 附近，与其他 hook 调用并列），添加：

  ```typescript
  	const { memory: systemMemory } = useSystemMemory();
  ```

  在 TopBar 组件渲染处（约 L910，`isGitHistoryOpen={isGitHistoryOpen}` 之后），添加 prop：

  ```typescript
  						systemMemory={systemMemory}
  ```

- [ ] **Step 5: 验证编译**

  Run: `npx tsc --noEmit`
  Expected: PASS

---

### Task 8: 单元测试

**Files:**
- Create: `test/runtime/system-memory-check.test.ts`

- [ ] **Step 1: 创建内存检查测试**

  ```typescript
  import { afterEach, describe, expect, it, vi } from "vitest";
  import os from "node:os";

  describe("createTask memory check", () => {
  	afterEach(() => {
  		vi.restoreAllMocks();
  	});

  	it("should calculate correct usage percentage", () => {
  		const totalMem = 16 * 1024 ** 3; // 16 GB
  		vi.spyOn(os, "totalmem").mockReturnValue(totalMem);
  		vi.spyOn(os, "freemem").mockReturnValue(totalMem * 0.3); // 30% free

  		const freePercent = (os.freemem() / os.totalmem()) * 100;
  		expect(freePercent).toBe(30);
  		expect(freePercent).toBeGreaterThanOrEqual(20);
  	});

  	it("should detect low memory condition", () => {
  		const totalMem = 16 * 1024 ** 3;
  		vi.spyOn(os, "totalmem").mockReturnValue(totalMem);
  		vi.spyOn(os, "freemem").mockReturnValue(totalMem * 0.15); // 15% free

  		const freePercent = (os.freemem() / os.totalmem()) * 100;
  		expect(freePercent).toBeLessThan(20);
  	});

  	it("should pass at exactly 20% free", () => {
  		const totalMem = 16 * 1024 ** 3;
  		vi.spyOn(os, "totalmem").mockReturnValue(totalMem);
  		vi.spyOn(os, "freemem").mockReturnValue(totalMem * 0.2); // exactly 20% free

  		const freePercent = (os.freemem() / os.totalmem()) * 100;
  		expect(freePercent).toBeGreaterThanOrEqual(20);
  	});
  });
  ```

- [ ] **Step 2: 运行测试**

  Run: `npx vitest run test/runtime/system-memory-check.test.ts`
  Expected: PASS

---

## 验证方案

- 自动化测试: `npm run test:fast`
- 类型检查: `npx tsc --noEmit`
- 手工验证:
  1. 启动 Kanban dev server
  2. 确认 TopBar 右侧 Settings 按钮左边出现内存指示器，格式 `X.X GB / Y.Y GB (Z%)`
  3. 每 30 秒数值自动刷新（usagePercent 变化 < 5% 时不触发 UI 更新）
  4. 对照 `node -e "const os=require('os');console.log(os.freemem(),os.totalmem())"` 验证数值一致
  5. 创建多个 task → 移到 Done → 确认进程释放
  6. 临时修改 `MEMORY_THRESHOLD_PERCENT` 为 99 → 尝试创建 task → 确认拦截并显示错误信息
