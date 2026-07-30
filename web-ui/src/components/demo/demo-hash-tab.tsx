import { useState } from "react";

import { showAppToast } from "@/components/app-toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchHash } from "./demo-api";
import { DemoExportButton } from "./demo-export-button";

const ALGORITHMS = ["SHA-256", "SHA-1", "MD5", "SHA-512"];

export function DemoHashTab() {
	const [algorithm, setAlgorithm] = useState("SHA-256");
	const [input, setInput] = useState("");
	const [result, setResult] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleExecute = async () => {
		setLoading(true);
		try {
			const res = await fetchHash(algorithm, input, {
				"X-Caller-Name": "frontend-user",
				"X-User-Type": "developer",
				"X-User-Level": "L2",
				"X-Department": "tech",
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
				"demo-hash-error",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex flex-col gap-2">
				<label className="text-sm text-text-secondary" htmlFor="hash-algorithm">
					哈希算法
				</label>
				<select
					id="hash-algorithm"
					value={algorithm}
					onChange={(e) => setAlgorithm(e.target.value)}
					className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
				>
					{ALGORITHMS.map((algo) => (
						<option key={algo} value={algo}>
							{algo}
						</option>
					))}
				</select>
			</div>
			<div className="flex flex-col gap-2">
				<label className="text-sm text-text-secondary" htmlFor="hash-input">
					输入文本
				</label>
				<input
					id="hash-input"
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="请输入要哈希的文本"
					className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
				/>
			</div>
			<div className="flex gap-2">
				<Button variant="primary" onClick={() => void handleExecute()}>
					执行哈希
				</Button>
				{result ? <DemoExportButton type="hash" data={result} /> : null}
			</div>
			{loading ? (
				<Spinner size={20} />
			) : result ? (
				<div className="break-all rounded-md bg-surface-2 p-4 font-mono text-xs text-text-primary">
					{result}
				</div>
			) : null}
		</div>
	);
}
