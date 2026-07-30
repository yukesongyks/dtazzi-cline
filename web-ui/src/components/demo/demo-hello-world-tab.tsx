import { useState } from "react";

import { showAppToast } from "@/components/app-toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchHelloWorld } from "./demo-api";
import { DemoExportButton } from "./demo-export-button";

export function DemoHelloWorldTab() {
	const [result, setResult] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleExecute = async () => {
		setLoading(true);
		try {
			const res = await fetchHelloWorld({
				"X-Caller-Name": "frontend-user",
				"X-User-Type": "developer",
				"X-User-Level": "L1",
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
				"demo-hello-error",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex gap-2">
				<Button variant="primary" onClick={() => void handleExecute()}>
					执行 HelloWorld
				</Button>
				{result ? <DemoExportButton type="helloworld" data={result} /> : null}
			</div>
			{loading ? (
				<Spinner size={20} />
			) : result ? (
				<div className="rounded-md bg-surface-2 p-4 font-mono text-sm text-text-primary">
					{result}
				</div>
			) : (
				<p className="text-sm text-text-secondary">点击按钮执行 HelloWorld 接口。</p>
			)}
		</div>
	);
}
