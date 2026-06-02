import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

import { MEMORY_USAGE_THRESHOLD_PERCENT } from "./api-contract.js";

export { MEMORY_USAGE_THRESHOLD_PERCENT };

const execFileAsync = promisify(execFile);

export interface SystemMemoryStatus {
	ok: boolean;
	totalMemory: number;
	freeMemory: number;
	usagePercent: number;
	usedGB: string;
	totalGB: string;
}

async function getAvailableMemory(): Promise<number> {
	if (process.platform !== "darwin") {
		return os.freemem();
	}
	try {
		const { stdout } = await execFileAsync("vm_stat", [], { encoding: "utf-8", timeout: 3000 });
		const pageSize = /page size of (\d+) bytes/.exec(stdout);
		if (!pageSize) {
			return os.freemem();
		}
		const size = Number(pageSize[1]);
		const free = /Pages free:\s+(\d+)\.?/.exec(stdout);
		const inactive = /Pages inactive:\s+(\d+)\.?/.exec(stdout);
		const purgeable = /Pages purgeable:\s+(\d+)\.?/.exec(stdout);
		const pages = Number(free?.[1] ?? 0) + Number(inactive?.[1] ?? 0) + Number(purgeable?.[1] ?? 0);
		return pages * size;
	} catch {
		return os.freemem();
	}
}

export async function checkSystemMemory(): Promise<SystemMemoryStatus> {
	const totalMem = os.totalmem();
	const freeMem = await getAvailableMemory();
	const usagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
	const usedGB = ((totalMem - freeMem) / 1024 ** 3).toFixed(1);
	const totalGB = (totalMem / 1024 ** 3).toFixed(1);
	return {
		ok: usagePercent <= MEMORY_USAGE_THRESHOLD_PERCENT,
		totalMemory: totalMem,
		freeMemory: freeMem,
		usagePercent,
		usedGB,
		totalGB,
	};
}

export async function assertMemoryAvailable(): Promise<void> {
	const status = await checkSystemMemory();
	if (!status.ok) {
		throw new Error(
			`System memory is critically low (${status.usedGB}/${status.totalGB} GB used, ${status.usagePercent}% usage). ` +
				`Stop running task sessions to free up memory before creating new tasks.`,
		);
	}
}
