import { useState } from "react";

import { DemoBubbleSortTab } from "./demo-bubble-sort-tab";
import { DemoHashTab } from "./demo-hash-tab";
import { DemoHelloWorldTab } from "./demo-hello-world-tab";
import { DemoStatsCharts } from "./demo-stats-charts";
import type { DemoTab } from "./demo-types";

const TABS: { id: DemoTab; label: string }[] = [
	{ id: "helloworld", label: "HelloWorld" },
	{ id: "hash", label: "哈希算法" },
	{ id: "bubblesort", label: "冒泡排序" },
];

export function DemoPage() {
	const [activeTab, setActiveTab] = useState<DemoTab>("helloworld");

	return (
		<div className="flex h-full flex-col overflow-hidden bg-surface-0">
			<header className="border-b border-border bg-surface-1 px-6 py-4">
				<h1 className="text-base font-semibold text-text-primary">
					Hello World 1.0T2 演示页面
				</h1>
				<p className="text-xs text-text-secondary">
					三接口执行结果展示 · 导出 · 调用统计可视化
				</p>
			</header>

			<div className="flex gap-1 border-b border-border bg-surface-1 px-4">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={
							activeTab === tab.id
								? "border-b-2 border-accent px-4 py-2 text-sm font-medium text-text-primary"
								: "px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
						}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="flex-1 overflow-auto">
				{activeTab === "helloworld" ? <DemoHelloWorldTab /> : null}
				{activeTab === "hash" ? <DemoHashTab /> : null}
				{activeTab === "bubblesort" ? <DemoBubbleSortTab /> : null}
			</div>

			<div className="border-t border-border bg-surface-1">
				<DemoStatsCharts />
			</div>
		</div>
	);
}
