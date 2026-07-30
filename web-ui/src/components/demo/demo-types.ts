export interface DemoResult<T> {
	success: boolean;
	type: string;
	data: T;
	timestamp: string;
}

export interface DimensionStat {
	dimension: string;
	value: string;
	count: number;
}

export interface TrendPoint {
	date: string;
	count: number;
}

export interface CallStatsResponse {
	totalCalls: number;
	byUserType: DimensionStat[];
	byUserLevel: DimensionStat[];
	byDepartment: DimensionStat[];
	trendByDay: TrendPoint[];
}

export type DemoTab = "helloworld" | "hash" | "bubblesort";
