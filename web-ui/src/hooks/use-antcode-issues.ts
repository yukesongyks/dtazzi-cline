import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAntcodeIssues } from "@/runtime/runtime-config-query";
import type { RuntimeAntcodeIssue } from "@/runtime/types";

export interface UseAntcodeIssuesResult {
	issues: RuntimeAntcodeIssue[];
	isLoading: boolean;
	error: string | null;
	refetch: () => void;
	searchIssues: (query: string) => void;
}

export function useAntcodeIssues(workspaceId: string | null, enabled: boolean = false): UseAntcodeIssuesResult {
	const [issues, setIssues] = useState<RuntimeAntcodeIssue[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

	const fetchIssues = useCallback(
		async (search?: string) => {
			if (!workspaceId || !enabled) {
				setIssues([]);
				setIsLoading(false);
				setError(null);
				return;
			}

			setIsLoading(true);
			setError(null);

			try {
				const trimmedSearch = search?.trim();
				const response = await fetchAntcodeIssues(workspaceId, {
					search: trimmedSearch || undefined,
					perPage: trimmedSearch ? 30 : 10,
				});
				if (response.ok) {
					setIssues(response.issues);
					setError(null);
				} else {
					setIssues([]);
					setError(response.error ?? "Failed to fetch issues");
				}
			} catch (err) {
				setIssues([]);
				setError(err instanceof Error ? err.message : "Failed to fetch issues");
			} finally {
				setIsLoading(false);
			}
		},
		[workspaceId, enabled],
	);

	// Initial fetch - get recent 10 issues
	useEffect(() => {
		if (enabled) {
			void fetchIssues();
		}
	}, [enabled, fetchIssues]);

	// Debounced search when searchQuery changes
	useEffect(() => {
		if (!enabled) {
			return;
		}

		// Clear previous timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		if (searchQuery) {
			// Debounce search queries
			debounceTimerRef.current = setTimeout(() => {
				void fetchIssues(searchQuery);
			}, 300);
		} else {
			// When search is cleared, fetch recent issues
			void fetchIssues();
		}

		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [searchQuery, enabled, fetchIssues]);

	const searchIssues = useCallback((query: string) => {
		setSearchQuery(query);
	}, []);

	const refetch = useCallback(() => {
		setSearchQuery("");
		void fetchIssues();
	}, [fetchIssues]);

	return {
		issues,
		isLoading,
		error,
		refetch,
		searchIssues,
	};
}
