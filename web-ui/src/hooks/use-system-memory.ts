import { useCallback, useEffect, useRef, useState } from "react";

import { useInterval } from "@/utils/react-use";
import { fetchSystemMemory } from "@/runtime/runtime-config-query";
import type { RuntimeSystemMemoryResponse } from "@/runtime/types";

const MEMORY_POLL_INTERVAL_MS = 30_000;
const MEMORY_UPDATE_THRESHOLD_PERCENT = 5;

interface UseSystemMemoryResult {
	memory: RuntimeSystemMemoryResponse | null;
	isLoading: boolean;
}

export function useSystemMemory(): UseSystemMemoryResult {
	const [memory, setMemory] = useState<RuntimeSystemMemoryResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const genRef = useRef(0);

	const refresh = useCallback(async () => {
		const gen = ++genRef.current;
		try {
			const result = await fetchSystemMemory(null);
			if (gen !== genRef.current) return;
			setMemory((prev) => {
				if (prev && Math.abs(result.usagePercent - prev.usagePercent) < MEMORY_UPDATE_THRESHOLD_PERCENT) {
					return prev;
				}
				return result;
			});
		} catch {
			// Best effort: memory status is non-critical.
		} finally {
			if (gen === genRef.current) {
				setIsLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useInterval(() => {
		void refresh();
	}, MEMORY_POLL_INTERVAL_MS);

	return { memory, isLoading };
}
