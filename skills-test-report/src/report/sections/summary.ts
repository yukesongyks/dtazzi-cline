/**
 * §2 result summary — counts, pass rate, duration, ✅/❌; fail_threshold verdict (S9).
 * @see openspec/changes/add-test-report-skill/design.md §5, §7
 */
import type { TestRunResult } from "../../models";

const NA = "未获取";

export interface SummaryVerdict {
	passRate: number | "NA";
	mark: "✅" | "❌";
	meetsThreshold: boolean;
	thresholdApplied: boolean;
}

export function computeVerdict(result: TestRunResult, failThreshold?: number): SummaryVerdict {
	const { total, passed, failed } = result.totals;
	const passRate = total > 0 ? passed / total : (passed > 0 ? 1 : 0);
	const mark: "✅" | "❌" = failed > 0 ? "❌" : "✅";
	let meetsThreshold = true;
	const thresholdApplied = typeof failThreshold === "number";
	if (thresholdApplied && (passRate as number) < (failThreshold as number)) {
		meetsThreshold = false;
	}
	return {
		passRate: total > 0 ? passRate : "NA",
		mark,
		meetsThreshold,
		thresholdApplied,
	};
}

export function renderSummary(result: TestRunResult, failThreshold?: number): string {
	const { total, passed, failed, skipped, durationMs } = result.totals;
	const verdict = computeVerdict(result, failThreshold);
	const passRateText =
		verdict.passRate === "NA" ? NA : `${((verdict.passRate as number) * 100).toFixed(2)}%`;
	const durationText = durationMs !== undefined ? `${(durationMs / 1000).toFixed(3)}s` : NA;

	let conclusion = `整体结论： ${verdict.mark}`;
	if (verdict.thresholdApplied && !verdict.meetsThreshold) {
		conclusion += " · 不达标（通过率低于阈值）";
	}

	const lines = [
		"## 结果摘要",
		"",
		"| 指标 | 值 |",
		"| --- | --- |",
		`| 用例总数 | ${total} |`,
		`| 通过 | ${passed} |`,
		`| 失败 | ${failed} |`,
		`| 跳过 | ${skipped} |`,
		`| 通过率 | ${passRateText} |`,
		`| 总耗时 | ${durationText} |`,
		"",
		conclusion,
	];
	return lines.join("\n");
}
