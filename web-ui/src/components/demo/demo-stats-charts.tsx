import { useEffect, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { showAppToast } from "@/components/app-toaster";
import { fetchStats } from "./demo-api";
import type { CallStatsResponse } from "./demo-types";

const CHART_COLORS = [
	"#0084FF",
	"#3FB950",
	"#D29922",
	"#A371F7",
	"#F85149",
	"#4C9AFF",
	"#D4A72C",
	"#339DFF",
];

export function DemoStatsCharts() {
	const [stats, setStats] = useState<CallStatsResponse | null>(null);
	const [loading, setLoading] = useState(false);

	const loadStats = async () => {
		setLoading(true);
		try {
			const data = await fetchStats();
			setStats(data);
		} catch (e) {
			showAppToast(
				{
					intent: "danger",
					icon: "warning-sign",
					message: `加载统计数据失败: ${e instanceof Error ? e.message : String(e)}`,
					timeout: 5000,
				},
				"demo-stats-error",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadStats();
	}, []);

	if (loading && !stats) {
		return (
			<div className="flex items-center justify-center p-8">
				<Spinner size={24} />
			</div>
		);
	}

	if (!stats) {
		return (
			<div className="flex flex-col items-center gap-3 p-8">
				<p className="text-sm text-text-secondary">暂无统计数据</p>
				<Button variant="default" onClick={() => void loadStats()}>
					刷新
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-text-primary">
					调用统计报表（总调用次数: {stats.totalCalls}）
				</h3>
				<Button variant="ghost" onClick={() => void loadStats()}>
					刷新数据
				</Button>
			</div>

			{stats.trendByDay.length > 0 ? (
				<div className="rounded-lg border border-border bg-surface-2 p-4">
					<h4 className="mb-3 text-xs font-medium text-text-secondary">
						每日调用趋势（折线图）
					</h4>
					<ResponsiveContainer width="100%" height={240}>
						<LineChart data={stats.trendByDay}>
							<CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
							<XAxis dataKey="date" stroke="#8B949E" fontSize={11} />
							<YAxis stroke="#8B949E" fontSize={11} />
							<Tooltip
								contentStyle={{
									background: "#24292E",
									border: "1px solid #444C56",
									borderRadius: "6px",
									fontSize: "12px",
								}}
							/>
							<Line
								type="monotone"
								dataKey="count"
								stroke="#0084FF"
								strokeWidth={2}
								dot={{ fill: "#0084FF", r: 3 }}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			) : null}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{stats.byUserType.length > 0 ? (
					<div className="rounded-lg border border-border bg-surface-2 p-4">
						<h4 className="mb-3 text-xs font-medium text-text-secondary">
							按人员类型（饼图）
						</h4>
						<ResponsiveContainer width="100%" height={200}>
							<PieChart>
								<Pie
									data={stats.byUserType}
									dataKey="count"
									nameKey="value"
									cx="50%"
									cy="50%"
									outerRadius={70}
									label
								>
									{stats.byUserType.map((_, index) => (
										<Cell
											key={`cell-${index}`}
											fill={CHART_COLORS[index % CHART_COLORS.length]}
										/>
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										background: "#24292E",
										border: "1px solid #444C56",
										borderRadius: "6px",
										fontSize: "12px",
									}}
								/>
								<Legend wrapperStyle={{ fontSize: "11px" }} />
							</PieChart>
						</ResponsiveContainer>
					</div>
				) : null}

				{stats.byUserLevel.length > 0 ? (
					<div className="rounded-lg border border-border bg-surface-2 p-4">
						<h4 className="mb-3 text-xs font-medium text-text-secondary">
							按人员层级（柱状图）
						</h4>
						<ResponsiveContainer width="100%" height={200}>
							<BarChart data={stats.byUserLevel}>
								<CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
								<XAxis dataKey="value" stroke="#8B949E" fontSize={11} />
								<YAxis stroke="#8B949E" fontSize={11} />
								<Tooltip
									contentStyle={{
										background: "#24292E",
										border: "1px solid #444C56",
										borderRadius: "6px",
										fontSize: "12px",
									}}
								/>
								<Bar dataKey="count" fill="#3FB950" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : null}

				{stats.byDepartment.length > 0 ? (
					<div className="rounded-lg border border-border bg-surface-2 p-4">
						<h4 className="mb-3 text-xs font-medium text-text-secondary">
							按人员部门（柱状图）
						</h4>
						<ResponsiveContainer width="100%" height={200}>
							<BarChart data={stats.byDepartment}>
								<CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
								<XAxis dataKey="value" stroke="#8B949E" fontSize={11} />
								<YAxis stroke="#8B949E" fontSize={11} />
								<Tooltip
									contentStyle={{
										background: "#24292E",
										border: "1px solid #444C56",
										borderRadius: "6px",
										fontSize: "12px",
									}}
								/>
								<Bar dataKey="count" fill="#A371F7" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				) : null}
			</div>
		</div>
	);
}
