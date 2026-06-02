import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import { execFile } from "node:child_process";

import {
	assertMemoryAvailable,
	checkSystemMemory,
	MEMORY_USAGE_THRESHOLD_PERCENT,
} from "../../src/core/system-memory";

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

function mockExecFileResult(stdout: string): void {
	mockedExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
		(cb as (err: null, result: { stdout: string }) => void)(null, { stdout });
		return {} as ReturnType<typeof execFile>;
	});
}

function mockExecFileError(): void {
	mockedExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
		(cb as (err: Error) => void)(new Error("command not found"));
		return {} as ReturnType<typeof execFile>;
	});
}

const TOTAL_16GB = 16 * 1024 ** 3;

describe("system memory check", () => {
	const originalPlatform = process.platform;

	beforeEach(() => {
		vi.spyOn(os, "totalmem").mockReturnValue(TOTAL_16GB);
	});

	afterEach(() => {
		Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
		vi.restoreAllMocks();
	});

	it("threshold constant is 85", () => {
		expect(MEMORY_USAGE_THRESHOLD_PERCENT).toBe(85);
	});

	describe("macOS memory calculation", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
		});

		it("uses vm_stat to calculate available memory on macOS", async () => {
			const vmStatOutput = [
				"Mach Virtual Memory Statistics: (page size of 16384 bytes)",
				"Pages free:                             10000.",
				"Pages active:                          200000.",
				"Pages inactive:                        100000.",
				"Pages speculative:                       3000.",
				"Pages throttled:                            0.",
				"Pages wired down:                      240000.",
				"Pages purgeable:                         5000.",
			].join("\n");
			mockExecFileResult(vmStatOutput);
			vi.spyOn(os, "freemem").mockReturnValue(0);

			const status = await checkSystemMemory();
			const expectedFree = 115000 * 16384;
			const expectedUsage = Math.round(((TOTAL_16GB - expectedFree) / TOTAL_16GB) * 100);
			expect(status.freeMemory).toBe(expectedFree);
			expect(status.usagePercent).toBe(expectedUsage);
		});

		it("falls back to os.freemem when vm_stat fails", async () => {
			mockExecFileError();
			const fallbackFree = 4 * 1024 ** 3;
			vi.spyOn(os, "freemem").mockReturnValue(fallbackFree);

			const status = await checkSystemMemory();
			expect(status.freeMemory).toBe(fallbackFree);
			expect(status.usagePercent).toBe(75);
		});
	});

	describe("non-macOS memory calculation", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		});

		it("uses os.freemem on Linux", async () => {
			const freeMem = 4.8 * 1024 ** 3;
			vi.spyOn(os, "freemem").mockReturnValue(freeMem);

			const status = await checkSystemMemory();
			expect(status.freeMemory).toBe(freeMem);
			expect(status.usagePercent).toBe(70);
		});
	});

	describe("checkSystemMemory threshold", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		});

		it("returns ok when usage is below threshold", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.3);
			const status = await checkSystemMemory();
			expect(status.ok).toBe(true);
			expect(status.usagePercent).toBe(70);
		});

		it("returns ok at exactly threshold", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.15);
			const status = await checkSystemMemory();
			expect(status.ok).toBe(true);
			expect(status.usagePercent).toBe(85);
		});

		it("returns not ok above threshold", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.1);
			const status = await checkSystemMemory();
			expect(status.ok).toBe(false);
			expect(status.usagePercent).toBe(90);
		});

		it("formats GB values", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.25);
			const status = await checkSystemMemory();
			expect(status.totalGB).toBe("16.0");
			expect(status.usedGB).toBe("12.0");
		});
	});

	describe("assertMemoryAvailable", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux", configurable: true });
		});

		it("does not throw when memory is available", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.3);
			await expect(assertMemoryAvailable()).resolves.toBeUndefined();
		});

		it("throws when memory exceeds threshold", async () => {
			vi.spyOn(os, "freemem").mockReturnValue(TOTAL_16GB * 0.05);
			await expect(assertMemoryAvailable()).rejects.toThrow(/System memory is critically low/);
		});
	});
});
