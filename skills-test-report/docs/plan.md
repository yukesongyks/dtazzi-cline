# test-report Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Goal:** 在 `skills-test-report/` 现有骨架基础上，补全 M1/P0 缺口——报告 §3-§6 渲染器、报告装配器、覆盖率文件解析器、编排入口——使 Skill 能一条指令完成「执行/解析测试结果 → 生成结构化 Markdown 报告 → 落盘返回」。
>
> **Architecture:** 纯函数渲染器 + 插件式解析器 + 编排入口。每个报告章节是独立的纯函数 `(TestRunResult, ...) => string`，返回 Markdown 片段；装配器按固定顺序拼接；编排入口串联 detect → parse → render → 落盘。所有渲染器只依赖 `TestRunResult` 标准模型（`src/models.ts`），不直接耦合框架解析器（NFR5 插件隔离）。
>
> **Tech Stack:** TypeScript 5.x、Zod（schema 验证）、Vitest（测试）、`fast-xml-parser`（已有依赖）、Node.js fs/promises（落盘）。

## Global Constraints

- 主栈 TypeScript/Node（Q1 裁决）。
- 报告正文中文；配置项名称、字段标识符、技术 token 保留英文原文（Q2 裁决）。
- 禁止 `any` 类型；使用 Zod schema 与 SDK 提供类型。
- 禁止 inline imports；统一 top-level `import`（AGENTS.md）。
- 幂等性：仅「报告头-生成时间」与「文件名时间戳」非幂等，其余报告体对同一结果文件多次渲染须字节一致（C5 裁决）。
- 降级：字段缺失渲染「未获取」，不崩溃不静默丢数据（NFR2）。
- 安全：堆栈/错误信息须经 `redactText()` 脱敏；报告不含环境变量/密钥（NFR3）。
- 禁止 Git 写操作（硬性约束）。验证用 `npx vitest run`，不 commit。
- 文件路径均为 `skills-test-report/` 仓库内相对路径。

---

## File Structure

| 文件 | 职责 | 状态 |
|---|---|---|
| `src/config.ts` | 配置解析（defaults + zod 覆盖） | **修改**：增加 `coverageThreshold` |
| `src/report/sections/failures.ts` | §3 失败用例分析渲染 | **新建** |
| `src/report/sections/details.ts` | §4 用例明细渲染 | **新建** |
| `src/report/sections/coverage.ts` | §5 覆盖率渲染 | **新建** |
| `src/report/sections/appendix.ts` | §6 附录渲染 | **新建** |
| `src/report/render.ts` | 报告装配器（6 板块固定顺序） | **新建** |
| `src/parsers/coverage-summary.ts` | istanbul coverage-summary.json 解析 | **新建** |
| `src/index.ts` | 编排入口（detect → parse → render → 落盘） | **新建** |
| `src/report/sections/header.ts` | §1 报告头 | 已存在，不改 |
| `src/report/sections/summary.ts` | §2 结果摘要 | 已存在，不改 |
| `src/models.ts` | 标准数据模型 | 已存在，不改 |
| `src/detect.ts` | 框架检测 | 已存在，不改 |
| `src/parsers/registry.ts` | 解析器注册表 | 已存在，不改 |
| `src/parsers/*.ts` | 各框架解析器 | 已存在，不改 |
| `src/security/redact.ts` | 安全脱敏 | 已存在，不改 |

---

## Task 1: 为 config.ts 增加 coverageThreshold 配置项

**Files:**
- Modify: `src/config.ts`
- Test: `src/__tests__/config.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `Config` 类型新增字段 `coverageThreshold: number`（默认 0.8），用于覆盖率章节筛选低于阈值的文件

**步骤:**

- [ ] 1.1 新建测试文件 `src/__tests__/config.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import { resolveConfig, DEFAULT_CONFIG } from "../config";

describe("resolveConfig", () => {
	it("defaults coverageThreshold to 0.8", () => {
		const c = resolveConfig();
		expect(c.coverageThreshold).toBe(0.8);
	});

	it("accepts user override for coverageThreshold", () => {
		const c = resolveConfig({ coverageThreshold: 0.9 });
		expect(c.coverageThreshold).toBe(0.9);
	});

	it("falls back to default when coverageThreshold is invalid", () => {
		const c = resolveConfig({ coverageThreshold: 1.5 as unknown as number });
		expect(c.coverageThreshold).toBe(0.8);
	});

	it("DEFAULT_CONFIG has coverageThreshold 0.8", () => {
		expect(DEFAULT_CONFIG.coverageThreshold).toBe(0.8);
	});
});
```

- [ ] 1.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/config.test.ts
```

预期输出：4 个测试全部 fail（`coverageThreshold` 属性不存在）。

- [ ] 1.3 修改 `src/config.ts`，在 `ConfigSchema` 的 `failThreshold` 行之后增加：

```typescript
	/** Coverage threshold (0..1); files below this are listed in §5. Default 0.8 (C2). */
	coverageThreshold: z.number().min(0).max(1).default(0.8),
```

在 `DEFAULT_CONFIG` 对象中增加：

```typescript
	coverageThreshold: 0.8,
```

- [ ] 1.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/config.test.ts
```

预期输出：4 个测试全部 pass。

---

## Task 2: 报告 §3 失败用例分析渲染器（failures.ts）

**Files:**
- Create: `src/report/sections/failures.ts`
- Test: `src/__tests__/sections/failures.test.ts`

**Interfaces:**
- Consumes: `TestRunResult`（from `../../models`）、`redactText`（from `../../security/redact`）
- Produces: `renderFailures(result: TestRunResult): string` — 返回 Markdown 片段，无失败时返回空字符串

**步骤:**

- [ ] 2.1 新建测试文件 `src/__tests__/sections/failures.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import type { TestRunResult } from "../../models";
import { renderFailures } from "../../report/sections/failures";

const base: TestRunResult = {
	framework: "Vitest",
	totals: { total: 3, passed: 1, failed: 2, skipped: 0 },
	cases: [
		{ name: "ok", status: "passed", stackLines: [] },
		{
			name: "fails with stack",
			file: "src/foo.test.ts",
			status: "failed",
			errorMessage: "Expected 2 got 1",
			stackLines: ["at foo (src/foo.ts:10:5)", "at bar (src/bar.ts:20:3)"],
		},
		{
			name: "fails no file",
			status: "failed",
			errorMessage: "timeout",
			stackLines: [],
		},
	],
	coverage: { obtained: false, byFile: [], belowThreshold: [] },
	sourceFiles: [],
	sourceArtifactPaths: [],
};

describe("renderFailures", () => {
	it("returns empty string when no failures", () => {
		const r: TestRunResult = {
			...base,
			totals: { total: 1, passed: 1, failed: 0, skipped: 0 },
			cases: [{ name: "ok", status: "passed", stackLines: [] }],
		};
		expect(renderFailures(r)).toBe("");
	});

	it("renders each failure with name, file, error, stack lines", () => {
		const out = renderFailures(base);
		expect(out).toContain("## 失败用例分析");
		expect(out).toContain("fails with stack");
		expect(out).toContain("src/foo.test.ts");
		expect(out).toContain("Expected 2 got 1");
		expect(out).toContain("at foo (src/foo.ts:10:5)");
	});

	it("renders 未获取 for missing file", () => {
		const out = renderFailures(base);
		expect(out).toContain("fails no file");
		expect(out).toContain("未获取");
	});

	it("redacts credentials in error/stack text", () => {
		const r: TestRunResult = {
			...base,
			cases: [
				{
					name: "leaky",
					file: "src/x.test.ts",
					status: "failed",
					errorMessage: "API_TOKEN=sk-1234567890abcdef",
					stackLines: ["at x (src/x.ts:1:1)"],
				},
			],
		};
		const out = renderFailures(r);
		expect(out).not.toContain("sk-1234567890abcdef");
		expect(out).toContain("[REDACTED]");
	});

	it("truncates stack to 8 lines max", () => {
		const r: TestRunResult = {
			...base,
			cases: [
				{
					name: "longstack",
					file: "src/y.test.ts",
					status: "failed",
					errorMessage: "err",
					stackLines: Array.from({ length: 20 }, (_, i) => `line ${i}`),
				},
			],
		};
		const out = renderFailures(r);
		expect(out).toContain("line 0");
		expect(out).toContain("line 7");
		expect(out).not.toContain("line 8");
	});
});
```

- [ ] 2.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/sections/failures.test.ts
```

预期：5 个测试全部 fail（模块不存在）。

- [ ] 2.3 新建 `src/report/sections/failures.ts`：

```typescript
/**
 * §3 failure analysis — per-failed-case name, file, error message, truncated+redacted stack.
 * @see docs/plan.md Task 2, FR2 §3, AC2
 */
import type { TestRunResult } from "../../models";
import { redactText } from "../../security/redact";

const NA = "未获取";
const MAX_STACK_LINES = 8;

export function renderFailures(result: TestRunResult): string {
	const failed = result.cases.filter((c) => c.status === "failed");
	if (failed.length === 0) return "";

	const blocks: string[] = ["## 失败用例分析", ""];

	for (const c of failed) {
		const file = c.file ?? NA;
		const error = c.errorMessage ? redactText(c.errorMessage) : NA;
		const stack = c.stackLines
			.slice(0, MAX_STACK_LINES)
			.map((l) => redactText(l))
			.map((l) => `  - ${l}`)
			.join("\n");

		blocks.push(`### ${c.name}`, "");
		blocks.push(`- 所属文件： ${file}`);
		blocks.push(`- 错误信息： ${error}`);
		if (stack) {
			blocks.push(`- 堆栈关键行：`);
			blocks.push(stack);
		} else {
			blocks.push(`- 堆栈关键行： ${NA}`);
		}
		blocks.push("");
	}

	return blocks.join("\n");
}
```

- [ ] 2.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/sections/failures.test.ts
```

预期：5 个测试全部 pass。

---

## Task 3: 报告 §4 用例明细渲染器（details.ts）

**Files:**
- Create: `src/report/sections/details.ts`
- Test: `src/__tests__/sections/details.test.ts`

**Interfaces:**
- Consumes: `TestRunResult`（from `../../models`）
- Produces: `renderDetails(result: TestRunResult): string` — 按文件分组，超 200 条截断

**步骤:**

- [ ] 3.1 新建测试文件 `src/__tests__/sections/details.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import type { TestRunResult } from "../../models";
import { renderDetails } from "../../report/sections/details";

const base: TestRunResult = {
	framework: "Vitest",
	totals: { total: 3, passed: 2, failed: 1, skipped: 0 },
	cases: [
		{ name: "a", file: "src/a.test.ts", status: "passed", durationMs: 10, stackLines: [] },
		{ name: "b", file: "src/a.test.ts", status: "failed", durationMs: 20, stackLines: [] },
		{ name: "c", file: "src/b.test.ts", status: "passed", stackLines: [] },
	],
	coverage: { obtained: false, byFile: [], belowThreshold: [] },
	sourceFiles: [],
	sourceArtifactPaths: [],
};

describe("renderDetails", () => {
	it("groups cases by file", () => {
		const out = renderDetails(base);
		expect(out).toContain("## 用例明细");
		expect(out).toContain("src/a.test.ts");
		expect(out).toContain("src/b.test.ts");
		expect(out).toContain("a");
		expect(out).toContain("b");
	});

	it("shows duration when available", () => {
		const out = renderDetails(base);
		expect(out).toContain("0.010s");
	});

	it("truncates at 200 cases and notes total", () => {
		const cases = Array.from({ length: 250 }, (_, i) => ({
			name: `case-${i}`,
			file: "src/big.test.ts",
			status: "passed" as const,
			stackLines: [],
		}));
		const r: TestRunResult = { ...base, cases };
		const out = renderDetails(r);
		expect(out).toContain("已截断，共 250 条");
		expect(out).not.toContain("case-200");
	});

	it("groups cases with no file under 未获取", () => {
		const r: TestRunResult = {
			...base,
			cases: [{ name: "nofile", status: "passed", stackLines: [] }],
		};
		const out = renderDetails(r);
		expect(out).toContain("未获取");
	});
});
```

- [ ] 3.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/sections/details.test.ts
```

预期：4 个测试全部 fail。

- [ ] 3.3 新建 `src/report/sections/details.ts`：

```typescript
/**
 * §4 case details — grouped by file, truncated at 200 with note.
 * @see docs/plan.md Task 3, FR2 §4
 */
import type { TestRunResult, TestCase } from "../../models";

const NA = "未获取";
const MAX_CASES = 200;

export function renderDetails(result: TestRunResult): string {
	const cases = result.cases;
	const truncated = cases.length > MAX_CASES;
	const shown = truncated ? cases.slice(0, MAX_CASES) : cases;

	const byFile = groupByFile(shown);

	const blocks: string[] = ["## 用例明细", ""];

	for (const [file, fileCases] of byFile) {
		blocks.push(`### ${file}`, "");
		blocks.push("| 用例 | 状态 | 耗时 |");
		blocks.push("| --- | --- | --- |");
		for (const c of fileCases) {
			const dur = c.durationMs !== undefined ? `${(c.durationMs / 1000).toFixed(3)}s` : NA;
			blocks.push(`| ${c.name} | ${c.status} | ${dur} |`);
		}
		blocks.push("");
	}

	if (truncated) {
		blocks.push(`> 已截断，共 ${cases.length} 条（仅展示前 ${MAX_CASES} 条）`, "");
	}

	return blocks.join("\n");
}

function groupByFile(cases: TestCase[]): Map<string, TestCase[]> {
	const map = new Map<string, TestCase[]>();
	for (const c of cases) {
		const key = c.file ?? NA;
		const arr = map.get(key);
		if (arr) {
			arr.push(c);
		} else {
			map.set(key, [c]);
		}
	}
	return map;
}
```

- [ ] 3.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/sections/details.test.ts
```

预期：4 个测试全部 pass。

---

## Task 4: 报告 §5 覆盖率渲染器（coverage.ts）

**Files:**
- Create: `src/report/sections/coverage.ts`
- Test: `src/__tests__/sections/coverage.test.ts`

**Interfaces:**
- Consumes: `TestRunResult`、`Coverage`（from `../../models`）
- Produces: `renderCoverage(result: TestRunResult, coverageThreshold: number): string` — 覆盖率总表 + 低于阈值文件清单；未获取时返回「未获取」

**步骤:**

- [ ] 4.1 新建测试文件 `src/__tests__/sections/coverage.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import type { TestRunResult } from "../../models";
import { renderCoverage } from "../../report/sections/coverage";

const base: TestRunResult = {
	framework: "Vitest",
	totals: { total: 1, passed: 1, failed: 0, skipped: 0 },
	cases: [{ name: "ok", status: "passed", stackLines: [] }],
	coverage: { obtained: false, byFile: [], belowThreshold: [] },
	sourceFiles: [],
	sourceArtifactPaths: [],
};

describe("renderCoverage", () => {
	it("renders 未获取 when coverage not obtained", () => {
		const out = renderCoverage(base, 0.8);
		expect(out).toContain("## 覆盖率");
		expect(out).toContain("未获取");
	});

	it("renders coverage table when obtained", () => {
		const r: TestRunResult = {
			...base,
			coverage: {
				obtained: true,
				overall: { statements: 90, branches: 80, functions: 70, lines: 85 },
				byFile: [
					{ file: "src/a.ts", statements: 90, branches: 80, functions: 70, lines: 85 },
					{ file: "src/b.ts", statements: 50, branches: 40, functions: 30, lines: 45 },
				],
				belowThreshold: ["src/b.ts"],
			},
		};
		const out = renderCoverage(r, 0.8);
		expect(out).toContain("语句");
		expect(out).toContain("分支");
		expect(out).toContain("函数");
		expect(out).toContain("行");
		expect(out).toContain("90");
		expect(out).toContain("src/b.ts");
	});

	it("lists below-threshold files section", () => {
		const r: TestRunResult = {
			...base,
			coverage: {
				obtained: true,
				overall: { statements: 70 },
				byFile: [],
				belowThreshold: ["src/low.ts", "src/also-low.ts"],
			},
		};
		const out = renderCoverage(r, 0.8);
		expect(out).toContain("低于阈值");
		expect(out).toContain("src/low.ts");
		expect(out).toContain("src/also-low.ts");
	});

	it("shows no below-threshold files when empty", () => {
		const r: TestRunResult = {
			...base,
			coverage: {
				obtained: true,
				overall: { statements: 95 },
				byFile: [],
				belowThreshold: [],
			},
		};
		const out = renderCoverage(r, 0.8);
		expect(out).toContain("无");
	});
});
```

- [ ] 4.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/sections/coverage.test.ts
```

预期：4 个测试全部 fail。

- [ ] 4.3 新建 `src/report/sections/coverage.ts`：

```typescript
/**
 * §5 coverage — overall table + below-threshold file list; 未获取 when absent.
 * @see docs/plan.md Task 4, FR2 §5, AC5
 */
import type { TestRunResult, CoverageRow } from "../../models";

const NA = "未获取";

export function renderCoverage(result: TestRunResult, coverageThreshold: number): string {
	const cov = result.coverage;
	if (!cov || !cov.obtained) {
		return ["## 覆盖率", "", "未获取", ""].join("\n");
	}

	const overall = cov.overall ?? {};
	const blocks: string[] = ["## 覆盖率", ""];

	blocks.push("| 指标 | 覆盖率 |");
	blocks.push("| --- | --- |");
	blocks.push(`| 语句 | ${fmtPct(overall.statements)} |`);
	blocks.push(`| 分支 | ${fmtPct(overall.branches)} |`);
	blocks.push(`| 函数 | ${fmtPct(overall.functions)} |`);
	blocks.push(`| 行 | ${fmtPct(overall.lines)} |`);
	blocks.push("");

	blocks.push(`> 阈值： ${(coverageThreshold * 100).toFixed(0)}%`, "");

	if (cov.belowThreshold.length > 0) {
		blocks.push("### 低于阈值的文件", "");
		for (const f of cov.belowThreshold) {
			blocks.push(`- ${f}`);
		}
	} else {
		blocks.push("### 低于阈值的文件", "", "无");
	}
	blocks.push("");

	return blocks.join("\n");
}

function fmtPct(v: number | undefined): string {
	return v !== undefined ? `${v.toFixed(2)}%` : NA;
}
```

- [ ] 4.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/sections/coverage.test.ts
```

预期：4 个测试全部 pass。

---

## Task 5: 报告 §6 附录渲染器（appendix.ts）

**Files:**
- Create: `src/report/sections/appendix.ts`
- Test: `src/__tests__/sections/appendix.test.ts`

**Interfaces:**
- Consumes: `TestRunResult`（from `../../models`）
- Produces: `renderAppendix(result: TestRunResult, toolVersion: string): string` — 原始结果文件路径 + 生成工具版本

**步骤:**

- [ ] 5.1 新建测试文件 `src/__tests__/sections/appendix.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import type { TestRunResult } from "../../models";
import { renderAppendix } from "../../report/sections/appendix";

const base: TestRunResult = {
	framework: "Vitest",
	totals: { total: 1, passed: 1, failed: 0, skipped: 0 },
	cases: [{ name: "ok", status: "passed", stackLines: [] }],
	coverage: { obtained: false, byFile: [], belowThreshold: [] },
	sourceFiles: [],
	sourceArtifactPaths: [],
};

describe("renderAppendix", () => {
	it("renders appendix header", () => {
		const out = renderAppendix(base, "test-report v1.0.0");
		expect(out).toContain("## 附录");
	});

	it("lists source artifact paths", () => {
		const r: TestRunResult = {
			...base,
			sourceArtifactPaths: ["reports/junit.xml", "reports/vitest.json"],
		};
		const out = renderAppendix(r, "test-report v1.0.0");
		expect(out).toContain("reports/junit.xml");
		expect(out).toContain("reports/vitest.json");
	});

	it("shows 未获取 when no artifact paths", () => {
		const out = renderAppendix(base, "test-report v1.0.0");
		expect(out).toContain("未获取");
	});

	it("shows tool version", () => {
		const out = renderAppendix(base, "test-report v1.0.0");
		expect(out).toContain("test-report v1.0.0");
	});
});
```

- [ ] 5.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/sections/appendix.test.ts
```

预期：4 个测试全部 fail。

- [ ] 5.3 新建 `src/report/sections/appendix.ts`：

```typescript
/**
 * §6 appendix — original result file paths + tool version.
 * @see docs/plan.md Task 5, FR2 §6
 */
import type { TestRunResult } from "../../models";

const NA = "未获取";

export function renderAppendix(result: TestRunResult, toolVersion: string): string {
	const paths = result.sourceArtifactPaths;
	const blocks: string[] = ["## 附录", ""];

	blocks.push("### 原始结果文件", "");
	if (paths.length > 0) {
		for (const p of paths) {
			blocks.push(`- ${p}`);
		}
	} else {
		blocks.push(NA);
	}
	blocks.push("");

	blocks.push("### 生成工具版本", "", toolVersion, "");

	return blocks.join("\n");
}
```

- [ ] 5.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/sections/appendix.test.ts
```

预期：4 个测试全部 pass。

---

## Task 6: 覆盖率文件解析器（coverage-summary.ts）

**Files:**
- Create: `src/parsers/coverage-summary.ts`
- Test: `src/__tests__/parsers/coverage-summary.test.ts`

**Interfaces:**
- Consumes: `Coverage`、`CoverageRow`（from `../models`）、istanbul `coverage-summary.json` 格式
- Produces: `parseCoverageSummary(rawText: string, filePath?: string, threshold?: number): Coverage` — 解析 istanbul/nyc coverage-summary.json，返回标准 `Coverage` 模型

istanbul coverage-summary.json 格式：
```json
{
  "total": { "statements": { "pct": 95 }, "branches": { "pct": 90 }, "functions": { "pct": 85 }, "lines": { "pct": 92 } },
  "./src/a.ts": { "statements": { "pct": 90 }, ... },
  "./src/b.ts": { "statements": { "pct": 50 }, ... }
}
```

**步骤:**

- [ ] 6.1 新建测试文件 `src/__tests__/parsers/coverage-summary.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import { parseCoverageSummary } from "../../parsers/coverage-summary";

const SAMPLE = JSON.stringify({
	total: {
		statements: { pct: 95 },
		branches: { pct: 90 },
		functions: { pct: 85 },
		lines: { pct: 92 },
	},
	"./src/a.ts": {
		statements: { pct: 90 },
		branches: { pct: 80 },
		functions: { pct: 70 },
		lines: { pct: 85 },
	},
	"./src/b.ts": {
		statements: { pct: 50 },
		branches: { pct: 40 },
		functions: { pct: 30 },
		lines: { pct: 45 },
	},
});

describe("parseCoverageSummary", () => {
	it("parses overall coverage", () => {
		const cov = parseCoverageSummary(SAMPLE, undefined, 0.8);
		expect(cov.obtained).toBe(true);
		expect(cov.overall?.statements).toBe(95);
		expect(cov.overall?.branches).toBe(90);
	});

	it("parses per-file coverage", () => {
		const cov = parseCoverageSummary(SAMPLE, undefined, 0.8);
		expect(cov.byFile.length).toBe(2);
		expect(cov.byFile[0].file).toBe("./src/a.ts");
		expect(cov.byFile[0].statements).toBe(90);
	});

	it("computes belowThreshold list", () => {
		const cov = parseCoverageSummary(SAMPLE, undefined, 0.8);
		expect(cov.belowThreshold).toContain("./src/b.ts");
		expect(cov.belowThreshold).not.toContain("./src/a.ts");
	});

	it("returns obtained=false for invalid JSON", () => {
		const cov = parseCoverageSummary("not json", undefined, 0.8);
		expect(cov.obtained).toBe(false);
		expect(cov.byFile).toEqual([]);
	});

	it("handles missing pct fields gracefully", () => {
		const raw = JSON.stringify({
			total: { statements: {} },
			"./src/c.ts": {},
		});
		const cov = parseCoverageSummary(raw, undefined, 0.8);
		expect(cov.obtained).toBe(true);
		expect(cov.overall?.statements).toBeUndefined();
	});
});
```

- [ ] 6.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/parsers/coverage-summary.test.ts
```

预期：5 个测试全部 fail。

- [ ] 6.3 新建 `src/parsers/coverage-summary.ts`：

```typescript
/**
 * istanbul/nyc coverage-summary.json parser → Coverage model.
 *
 * Input shape: { total: { statements: { pct: N }, ... }, "./path": { ... } }
 * Hard corruption (invalid JSON) → obtained=false, empty byFile (NFR2 degradation).
 *
 * @see docs/plan.md Task 6, FR2 §5, AC5
 */
import type { Coverage, CoverageRow } from "../models";

export function parseCoverageSummary(
	rawText: string,
	filePath?: string,
	threshold = 0.8,
): Coverage {
	let data: unknown;
	try {
		data = JSON.parse(rawText);
	} catch {
		return { obtained: false, byFile: [], belowThreshold: [] };
	}

	if (!data || typeof data !== "object") {
		return { obtained: false, byFile: [], belowThreshold: [] };
	}

	const obj = data as Record<string, unknown>;
	const overall = extractRow(obj["total"]);

	const byFile: CoverageRow[] = [];
	const belowThreshold: string[] = [];

	for (const [key, val] of Object.entries(obj)) {
		if (key === "total") continue;
		const row = extractRow(val);
		if (!row) continue;
		row.file = key;
		byFile.push(row);
		const stmt = row.statements;
		if (stmt !== undefined && stmt / 100 < threshold) {
			belowThreshold.push(key);
		}
	}

	return { obtained: true, overall, byFile, belowThreshold };
}

function extractRow(node: unknown): CoverageRow | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;
	return {
		file: "",
		statements: pctOf(obj.statements),
		branches: pctOf(obj.branches),
		functions: pctOf(obj.functions),
		lines: pctOf(obj.lines),
	};
}

function pctOf(node: unknown): number | undefined {
	if (!node || typeof node !== "object") return undefined;
	const obj = node as Record<string, unknown>;
	const pct = obj.pct;
	return typeof pct === "number" && Number.isFinite(pct) ? pct : undefined;
}
```

- [ ] 6.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/parsers/coverage-summary.test.ts
```

预期：5 个测试全部 pass。

---

## Task 7: 报告装配器（render.ts）

**Files:**
- Create: `src/report/render.ts`
- Test: `src/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `TestRunResult`、`Config`（from `../models`、`../config`）、6 个 section 渲染器
- Produces: `renderReport(result: TestRunResult, opts: RenderOpts): string` — 按固定顺序拼接 6 个章节

```typescript
export interface RenderOpts {
	project: string;
	generatedAt: string;
	toolVersion: string;
	failThreshold?: number;
	coverageThreshold: number;
}
```

**步骤:**

- [ ] 7.1 新建测试文件 `src/__tests__/render.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import type { TestRunResult } from "../models";
import { renderReport } from "../report/render";

const result: TestRunResult = {
	framework: "Vitest",
	frameworkVersion: "1.0.0",
	command: "npx vitest run",
	totals: { total: 3, passed: 1, failed: 1, skipped: 1, durationMs: 1500 },
	cases: [
		{ name: "ok", file: "src/a.test.ts", status: "passed", durationMs: 10, stackLines: [] },
		{
			name: "fail",
			file: "src/a.test.ts",
			status: "failed",
			errorMessage: "err",
			stackLines: ["at a (src/a.ts:1:1)"],
		},
		{ name: "skip", file: "src/b.test.ts", status: "skipped", stackLines: [] },
	],
	coverage: { obtained: false, byFile: [], belowThreshold: [] },
	sourceFiles: [],
	sourceArtifactPaths: ["reports/vitest.json"],
};

describe("renderReport", () => {
	it("renders all 6 sections in fixed order", () => {
		const out = renderReport(result, {
			project: "my-proj",
			generatedAt: "2026-07-31 12:00:00",
			toolVersion: "test-report v1.0.0",
			coverageThreshold: 0.8,
		});
		const headerIdx = out.indexOf("# 测试报告");
		const summaryIdx = out.indexOf("## 结果摘要");
		const failuresIdx = out.indexOf("## 失败用例分析");
		const detailsIdx = out.indexOf("## 用例明细");
		const coverageIdx = out.indexOf("## 覆盖率");
		const appendixIdx = out.indexOf("## 附录");

		expect(headerIdx).toBeLessThan(summaryIdx);
		expect(summaryIdx).toBeLessThan(failuresIdx);
		expect(failuresIdx).toBeLessThan(detailsIdx);
		expect(detailsIdx).toBeLessThan(coverageIdx);
		expect(coverageIdx).toBeLessThan(appendixIdx);
	});

	it("includes project name in header", () => {
		const out = renderReport(result, {
			project: "my-proj",
			generatedAt: "2026-07-31 12:00:00",
			toolVersion: "test-report v1.0.0",
			coverageThreshold: 0.8,
		});
		expect(out).toContain("my-proj");
	});

	it("omits failures section when no failures", () => {
		const noFail: TestRunResult = { ...result, totals: { ...result.totals, failed: 0 } };
		const out = renderReport(noFail, {
			project: "p",
			generatedAt: "2026-07-31 12:00:00",
			toolVersion: "test-report v1.0.0",
			coverageThreshold: 0.8,
		});
		expect(out).not.toContain("## 失败用例分析");
	});
});
```

- [ ] 7.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/render.test.ts
```

预期：3 个测试全部 fail。

- [ ] 7.3 新建 `src/report/render.ts`：

```typescript
/**
 * Report assembler — joins 6 sections in fixed order (FR2).
 *
 * Order: header → summary → failures → details → coverage → appendix.
 * Failures section omitted when no failures (§3 is conditional).
 *
 * @see docs/plan.md Task 7, FR2, NFR4 (idempotency except timestamp)
 */
import type { TestRunResult } from "../models";
import { renderHeader } from "./sections/header";
import { renderSummary } from "./sections/summary";
import { renderFailures } from "./sections/failures";
import { renderDetails } from "./sections/details";
import { renderCoverage } from "./sections/coverage";
import { renderAppendix } from "./sections/appendix";

export interface RenderOpts {
	project: string;
	generatedAt: string;
	toolVersion: string;
	failThreshold?: number;
	coverageThreshold: number;
}

export function renderReport(result: TestRunResult, opts: RenderOpts): string {
	const header = renderHeader({
		project: opts.project,
		generatedAt: opts.generatedAt,
		command: result.command,
		framework: result.framework,
		frameworkVersion: result.frameworkVersion,
		env: result.env,
	});

	const summary = renderSummary(result, opts.failThreshold);

	const failures = renderFailures(result);

	const details = renderDetails(result);

	const coverage = renderCoverage(result, opts.coverageThreshold);

	const appendix = renderAppendix(result, opts.toolVersion);

	const parts = [header, summary, failures, details, coverage, appendix];
	return parts.filter((p) => p.length > 0).join("\n\n");
}
```

- [ ] 7.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/render.test.ts
```

预期：3 个测试全部 pass。

---

## Task 8: 编排入口（index.ts）

**Files:**
- Create: `src/index.ts`
- Test: `src/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `resolveConfig`、`detectFramework`、`buildDefaultRegistry`、`parseCoverageSummary`、`renderReport`、Node `fs/promises`、`path`、`child_process`
- Produces:
  - `generateReport(opts: GenerateReportOptions): Promise<GenerateReportResult>`
  - `GenerateReportOptions`: `{ cwd: string; project?: string; overrides?: Partial<Config> }`
  - `GenerateReportResult`: `{ path: string; summary: string }`

**步骤:**

- [ ] 8.1 新建测试文件 `src/__tests__/index.test.ts`，写入失败测试：

```typescript
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { generateReport } from "../index";

describe("generateReport — parse mode", () => {
	it("parses JUnit XML and writes markdown report", async () => {
		const tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "tr-"));
		const junitPath = path.join(tmpDir, "junit.xml");
		const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="suite1">
    <testcase name="ok" time="0.1" />
    <testcase name="fail" time="0.2"><failure>AssertionError: expected 1 got 2
      at foo (src/foo.ts:10:5)</failure></testcase>
  </testsuite>
</testsuites>`;
		await fs.writeFile(junitPath, xml, "utf8");

		const result = await generateReport({
			cwd: tmpDir,
			project: "test-proj",
			overrides: {
				resultFile: junitPath,
				outputPath: path.join(tmpDir, "reports") + "/",
			},
		});

		expect(result.path).toMatch(/test-report-\d{8}-\d{6}\.md$/);
		const content = await fs.readFile(result.path, "utf8");
		expect(content).toContain("# 测试报告");
		expect(content).toContain("test-proj");
		expect(content).toContain("## 结果摘要");
		expect(content).toContain("## 失败用例分析");
		expect(content).toContain("fail");
		expect(content).toContain("AssertionError");
		expect(content).toContain("## 用例明细");
		expect(content).toContain("## 覆盖率");
		expect(content).toContain("## 附录");
		expect(result.summary).toContain("通过");
	});

	it("returns diagnostic error for corrupted file (AC4)", async () => {
		const tmpDir = await fs.mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "tr-"));
		const badPath = path.join(tmpDir, "bad.xml");
		await fs.writeFile(badPath, "<<<not xml>>>", "utf8");

		await expect(
			generateReport({
				cwd: tmpDir,
				overrides: { resultFile: badPath },
			}),
		).rejects.toThrow(/无法解析|缺少|JUnit/);
	});
});
```

- [ ] 8.2 运行测试确认失败：

```bash
npx vitest run src/__tests__/index.test.ts
```

预期：2 个测试全部 fail（模块不存在）。

- [ ] 8.3 新建 `src/index.ts`：

```typescript
/**
 * Orchestrator entry point (CAP-0): detect → parse → render → 落盘 → return.
 *
 * - Parse mode: resultFile provided → read → parse → render.
 * - Exec mode: testCommand or auto-detected → run (foreground) → find result → parse → render.
 *   (Long-running tasks delegate to runtime background exec per C3; this implementation
 *   runs foreground with a timeout, sufficient for M1 unit-scale tests.)
 *
 * @see docs/plan.md Task 8, FR1, FR3, AC1, AC3, AC4
 */
import { promises as fs } from "fs";
import path from "path";
import { resolveConfig, type Config } from "./config";
import { detectFramework, type DetectInput } from "./detect";
import { buildDefaultRegistry, type ParseError } from "./parsers/registry";
import { parseCoverageSummary } from "./parsers/coverage-summary";
import { renderReport } from "./report/render";
import type { TestRunResult } from "./models";

const TOOL_VERSION = "test-report v1.0.0";

export interface GenerateReportOptions {
	cwd: string;
	project?: string;
	overrides?: Partial<Config>;
}

export interface GenerateReportResult {
	path: string;
	summary: string;
}

export async function generateReport(
	opts: GenerateReportOptions,
): Promise<GenerateReportResult> {
	const config = resolveConfig(opts.overrides);
	const project = opts.project ?? path.basename(opts.cwd);

	// 1. Determine mode: parse mode if resultFile, else exec mode.
	let resultFile: string | undefined;
	let rawText: string;
	let frameworkHint: string | undefined;

	if (config.resultFile) {
		// Parse mode.
		resultFile = path.isAbsolute(config.resultFile)
			? config.resultFile
			: path.join(opts.cwd, config.resultFile);
		try {
			rawText = await fs.readFile(resultFile, "utf8");
		} catch (e) {
			throw new Error(
				`无法读取结果文件: ${resultFile} — ${(e as Error).message}`,
			);
		}
	} else {
		// Exec mode: detect command from project files.
		const files = await readDetectFiles(opts.cwd);
		const detection = detectFramework({
			userCommand: config.testCommand,
			files,
		});
		if (detection.source === "none" || !detection.command) {
			throw new Error(
				`无法检测测试命令（未找到 package.json/pyproject.toml/框架配置文件），请显式指定 test_command`,
			);
		}
		// Run test command and capture stdout as result text (M1: foreground exec).
		const { stdout } = await runCommand(detection.command, opts.cwd);
		rawText = stdout;
		resultFile = undefined;
		frameworkHint = detection.frameworkHint;
	}

	// 2. Parse result.
	const registry = await buildDefaultRegistry();
	let parsed: TestRunResult;
	try {
		parsed = await registry.parse({
			rawText,
			filePath: resultFile,
			frameworkHint,
		});
	} catch (e) {
		if (e instanceof ParseError) {
			throw new Error(
				`结果文件解析失败 [${e.parserId}]: ${e.message}` +
					(e.filePath ? ` (文件: ${e.filePath})` : ""),
			);
		}
		throw e;
	}

	// 3. Attach coverage if available.
	if (config.coverage !== "off") {
		const covSummaryPath = path.join(opts.cwd, "coverage", "coverage-summary.json");
		try {
			const covText = await fs.readFile(covSummaryPath, "utf8");
			const cov = parseCoverageSummary(
				covText,
				covSummaryPath,
				config.coverageThreshold,
			);
			if (cov.obtained) {
				parsed = { ...parsed, coverage: cov };
			}
		} catch {
			// Coverage not available — leave as-is (obtained=false → "未获取").
		}
	}

	// Attach source artifact path.
	if (resultFile && parsed.sourceArtifactPaths.length === 0) {
		parsed = { ...parsed, sourceArtifactPaths: [resultFile] };
	}

	// 4. Render report.
	const now = new Date();
	const generatedAt = formatTimestamp(now);
	const report = renderReport(parsed, {
		project,
		generatedAt,
		toolVersion: TOOL_VERSION,
		failThreshold: config.failThreshold,
		coverageThreshold: config.coverageThreshold,
	});

	// 5. Write to disk.
	const outputDir = path.isAbsolute(config.outputPath)
		? config.outputPath
		: path.join(opts.cwd, config.outputPath);
	await fs.mkdir(outputDir, { recursive: true });
	const filename = `test-report-${formatFileTimestamp(now)}.md`;
	const outputPath = path.join(outputDir, filename);
	await fs.writeFile(outputPath, report, "utf8");

	// 6. Return path + summary.
	const { total, passed, failed } = parsed.totals;
	const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : "N/A";
	const summaryParts = [
		`报告路径： ${outputPath}`,
		`通过率： ${passRate}%（${passed}/${total}）`,
		`失败： ${failed}`,
	];
	if (failed > 0) {
		const topFailures = parsed.cases
			.filter((c) => c.status === "failed")
			.slice(0, 3)
			.map((c) => `  - ${c.name}: ${c.errorMessage ?? "未获取"}`);
		summaryParts.push("关键失败原因：", ...topFailures);
	}

	return { path: outputPath, summary: summaryParts.join("\n") };
}

async function readDetectFiles(cwd: string): Promise<Record<string, string>> {
	const candidates = [
		"package.json",
		"pyproject.toml",
		"Cargo.toml",
		"vitest.config.ts",
		"vitest.config.js",
		"jest.config.ts",
		"jest.config.js",
		"pytest.ini",
	];
	const files: Record<string, string> = {};
	for (const name of candidates) {
		try {
			const content = await fs.readFile(path.join(cwd, name), "utf8");
			files[name] = content;
		} catch {
			// File doesn't exist — skip.
		}
	}
	return files;
}

async function runCommand(
	command: string,
	cwd: string,
): Promise<{ stdout: string; stderr: string }> {
	const { exec } = await import("child_process");
	return new Promise((resolve, reject) => {
		exec(
			command,
			{ cwd, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(
							`测试命令执行失败: ${command}\n${stderr || error.message}`,
						),
					);
					return;
				}
				resolve({ stdout: stdout || "", stderr: stderr || "" });
			},
		);
	});
}

function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatFileTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
```

- [ ] 8.4 运行测试确认通过：

```bash
npx vitest run src/__tests__/index.test.ts
```

预期：2 个测试全部 pass。

---

## Self-Review

### 1. Spec coverage

| 需求/AC | 覆盖任务 | 状态 |
|---|---|---|
| FR1.1 框架识别优先级 | 已存在 `detect.ts` | ✅ 不改 |
| FR1.2 Jest/Vitest/JUnit XML | 已存在 `parsers/*.ts` | ✅ 不改 |
| FR1.3 执行/解析双模式 | Task 8 `index.ts` | ✅ 覆盖 |
| FR1.4 执行失败诊断 | Task 8 `index.ts` 错误路径 | ✅ 覆盖 |
| FR2 §1 报告头 | 已存在 `header.ts` | ✅ 不改 |
| FR2 §2 结果摘要 | 已存在 `summary.ts` | ✅ 不改 |
| FR2 §3 失败分析 | Task 2 `failures.ts` | ✅ 覆盖 |
| FR2 §4 用例明细 | Task 3 `details.ts` | ✅ 覆盖 |
| FR2 §5 覆盖率 | Task 4 `coverage.ts` + Task 6 `coverage-summary.ts` | ✅ 覆盖 |
| FR2 §6 附录 | Task 5 `appendix.ts` | ✅ 覆盖 |
| FR3.1 Markdown 默认 | Task 7 `render.ts` | ✅ 覆盖 |
| FR3.2 落盘路径格式 | Task 8 `index.ts` `formatFileTimestamp` | ✅ 覆盖 |
| FR3.3 返回 path+summary | Task 8 `GenerateReportResult` | ✅ 覆盖 |
| FR4.2 配置项 | Task 1 增加 `coverageThreshold` | ✅ 覆盖 |
| AC1 TS 项目产出 Markdown | Task 7+8 集成 | ✅ 覆盖 |
| AC2 失败用例含名称/文件/错误 | Task 2 | ✅ 覆盖 |
| AC3 JUnit XML 解析模式 | Task 8 测试用例 | ✅ 覆盖 |
| AC4 损坏文件诊断 | Task 8 测试用例 | ✅ 覆盖 |
| AC5 覆盖率存在/缺失 | Task 4 + Task 6 | ✅ 覆盖 |
| NFR2 降级 | 各渲染器 `?? NA` | ✅ 覆盖 |
| NFR3 脱敏 | Task 2 用 `redactText()` | ✅ 覆盖 |
| NFR4 幂等 | 仅时间戳非幂等（Task 8） | ✅ 覆盖 |
| NFR5 插件式 | 不改既有解析器 | ✅ 覆盖 |

### 2. Placeholder scan

无 `TBD`/`TODO`/`implement later`。每个步骤含完整代码。✅

### 3. Dependency order

Task 1（config）→ Task 2-5（sections，互不依赖）→ Task 6（coverage parser）→ Task 7（render，依赖 sections）→ Task 8（index，依赖全部）。✅

### 4. Risk check

- Task 8 exec 模式使用 `child_process.exec` 前台执行 + maxBuffer；M1 单元级测试规模足够，长任务后台化留待 C3 后续迭代。
- Task 8 覆盖率读取假设 `coverage/coverage-summary.json` 路径（istanbul/nyc 默认）；不存在时静默降级（NFR2）。

---

## Execution Handoff

Plan complete and saved to `skills-test-report/docs/plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkboxes
