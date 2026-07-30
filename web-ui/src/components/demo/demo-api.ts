import type { CallStatsResponse, DemoResult } from "./demo-types";

const BASE_URL = "/api/demo";

export async function fetchHelloWorld(
	headers: Record<string, string> = {},
): Promise<DemoResult<string>> {
	const response = await fetch(`${BASE_URL}/hello`, { headers });
	if (!response.ok) {
		throw new Error(`HelloWorld request failed: ${response.status}`);
	}
	return response.json() as Promise<DemoResult<string>>;
}

export async function fetchHash(
	algorithm: string,
	input: string,
	headers: Record<string, string> = {},
): Promise<DemoResult<string>> {
	const params = new URLSearchParams({ algorithm, input });
	const response = await fetch(`${BASE_URL}/hash?${params}`, { headers });
	if (!response.ok) {
		throw new Error(`Hash request failed: ${response.status}`);
	}
	return response.json() as Promise<DemoResult<string>>;
}

export async function fetchBubbleSort(
	input: number[],
	headers: Record<string, string> = {},
): Promise<DemoResult<number[]>> {
	const response = await fetch(`${BASE_URL}/bubble-sort`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify({ input }),
	});
	if (!response.ok) {
		throw new Error(`BubbleSort request failed: ${response.status}`);
	}
	return response.json() as Promise<DemoResult<number[]>>;
}

export function getExportUrl(type: string, data: string): string {
	const params = new URLSearchParams({ type, data });
	return `${BASE_URL}/export?${params}`;
}

export async function fetchStats(): Promise<CallStatsResponse> {
	const response = await fetch(`${BASE_URL}/stats`);
	if (!response.ok) {
		throw new Error(`Stats request failed: ${response.status}`);
	}
	return response.json() as Promise<CallStatsResponse>;
}
