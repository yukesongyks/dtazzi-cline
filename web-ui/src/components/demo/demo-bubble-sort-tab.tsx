import { useState } from "react";

import { showAppToast } from "@/components/app-toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchBubbleSort } from "./demo-api";
import { DemoExportButton } from "./demo-export-button";

export function DemoBubbleSortTab() {
	const [inputText, setInputText] = useState("5,3,8,1,9,2");
	const [result, setResult] = useState<number[] | null>(null);
	const [loading, setLoading] = useState(false);

	const handleExecute = async () => {
		const input = inputText
			.split(",")
			.map((s) => Number.parseInt(s.trim(), 10))
			.filter((n) => !Number.isNaN(n));
		setLoading(true);
		try {
			const res = await fetchBubbleSort(input, {
				"X-Caller-Name": "frontend-user",
				"X-User-Type": "developer",
				"X-User-Level": "L3",
				"X-Department": "data",
			});
			setResult(res.data);
		} catch (e) {
			showAppToast(
				{
					intent: "danger",
					icon: "warning-sign",
					message: `执行失败: ${e instanceof Error ? e.message : String(e)}`,
					timeout: 5000,
				},
				"demo-sort-error",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex flex-col gap-2">
				<label className="text-sm text-text-secondary" htmlFor="sort-input">
					输入数字（逗号分隔）
				</label>
				<input
					id="sort-input"
					type="text"
					value={inputText}
					onChange={(e) => setInputText(e.target.value)}
					placeholder="例如: 5,3,8,1,9,2"
					className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
				/>
			</div>
			<div className="flex gap-2">
				<Button variant="primary" onClick={() => void handleExecute()}>
					执行冒泡排序
				</Button>
				{result ? (
					<DemoExportButton type="bubblesort" data={result.join(",")} />
				) : null}
			</div>
			{loading ? (
				<Spinner size={20} />
			) : result ? (
				<div className="rounded-md bg-surface-2 p-4 font-mono text-sm text-text-primary">
					{result.join(", ")}
				</div>
			) : null}
		</div>
	);
}
