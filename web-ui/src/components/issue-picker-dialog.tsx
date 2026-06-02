import * as RadixDialog from "@radix-ui/react-dialog";
import { Check, ExternalLink, Loader2, Search } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useAntcodeIssues } from "@/hooks/use-antcode-issues";
import { fetchAntcodeIssueDetail } from "@/runtime/runtime-config-query";
import type { RuntimeAntcodeIssue } from "@/runtime/types";

interface IssuePickerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string | null;
	onSelectIssue: (issue: RuntimeAntcodeIssue) => void;
}

function formatIssueState(state: string): string {
	switch (state.toLowerCase()) {
		case "opened":
			return "Open";
		case "closed":
			return "Closed";
		default:
			return state;
	}
}

function getStateColor(state: string): string {
	switch (state.toLowerCase()) {
		case "opened":
			return "bg-status-green/20 text-status-green";
		case "closed":
			return "bg-status-red/20 text-status-red";
		default:
			return "bg-surface-3 text-text-secondary";
	}
}

export function IssuePickerDialog({
	open,
	onOpenChange,
	workspaceId,
	onSelectIssue,
}: IssuePickerDialogProps): ReactElement {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIssue, setSelectedIssue] = useState<RuntimeAntcodeIssue | null>(null);
	const [isFetchingDetail, setIsFetchingDetail] = useState(false);

	const { issues, isLoading, error, refetch } = useAntcodeIssues(workspaceId, open);

	// Reset selection when dialog opens
	useEffect(() => {
		if (open) {
			setSelectedIssue(null);
			setSearchQuery("");
			setIsFetchingDetail(false);
		}
	}, [open]);

	const filteredIssues = useMemo(() => {
		if (!searchQuery.trim()) {
			return issues;
		}
		const query = searchQuery.toLowerCase();
		return issues.filter((issue) => {
			const titleMatch = issue.title.toLowerCase().includes(query);
			const iidMatch = String(issue.iid).includes(query);
			const labelMatch = issue.labels?.some((label) => label.toLowerCase().includes(query));
			return titleMatch || iidMatch || (labelMatch ?? false);
		});
	}, [issues, searchQuery]);

	const handleSelectIssue = useCallback((issue: RuntimeAntcodeIssue) => {
		setSelectedIssue((current) => (current?.iid === issue.iid ? null : issue));
	}, []);

	const handleConfirm = useCallback(async () => {
		if (!selectedIssue || !workspaceId) {
			return;
		}
		setIsFetchingDetail(true);
		try {
			const response = await fetchAntcodeIssueDetail(workspaceId, selectedIssue.iid);
			if (response.ok && response.issue) {
				onSelectIssue(response.issue);
				onOpenChange(false);
			} else {
				// Fallback to basic issue info if detail fetch fails
				onSelectIssue(selectedIssue);
				onOpenChange(false);
			}
		} catch {
			// Fallback to basic issue info on error
			onSelectIssue(selectedIssue);
			onOpenChange(false);
		} finally {
			setIsFetchingDetail(false);
		}
	}, [selectedIssue, workspaceId, onSelectIssue, onOpenChange]);

	const handleOpenIssue = useCallback((issue: RuntimeAntcodeIssue) => {
		if (issue.webUrl) {
			window.open(issue.webUrl, "_blank", "noopener,noreferrer");
		}
	}, []);

	return (
		<RadixDialog.Root open={open} onOpenChange={onOpenChange}>
			<RadixDialog.Portal>
				<RadixDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
				<RadixDialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] rounded-lg border border-border bg-surface-1 shadow-xl flex flex-col">
					<RadixDialog.Title className="px-4 py-3 border-b border-border text-sm font-medium text-text-primary">
						Select Issue
					</RadixDialog.Title>
					<div className="px-4 py-3 border-b border-border">
						<div className="relative">
							<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
							<input
								type="text"
								placeholder="Search issues by title, ID, or label..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full h-8 pl-9 pr-3 rounded-md border border-border bg-surface-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
							/>
						</div>
					</div>
					<div className="flex-1 overflow-auto p-2">
						{isLoading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 size={20} className="animate-spin text-text-tertiary" />
								<span className="ml-2 text-sm text-text-secondary">Loading issues...</span>
							</div>
						) : error ? (
							<div className="flex flex-col items-center justify-center py-8 gap-2">
								<span className="text-sm text-status-red">{error}</span>
								<Button size="sm" onClick={refetch}>
									Retry
								</Button>
							</div>
						) : filteredIssues.length === 0 ? (
							<div className="flex items-center justify-center py-8">
								<span className="text-sm text-text-tertiary">
									{searchQuery.trim() ? "No matching issues found" : "No issues available"}
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-1">
								{filteredIssues.map((issue) => (
									<button
										key={issue.iid}
										type="button"
										onClick={() => handleSelectIssue(issue)}
										className={cn(
											"flex items-start gap-3 p-3 rounded-md text-left hover:bg-surface-3 transition-colors",
											selectedIssue?.iid === issue.iid && "bg-surface-3",
										)}
									>
										<div className="flex-shrink-0 mt-0.5">
											<div
												className={cn(
													"w-4 h-4 rounded-sm border flex items-center justify-center",
													selectedIssue?.iid === issue.iid
														? "bg-accent border-accent"
														: "border-border bg-surface-2",
												)}
											>
												{selectedIssue?.iid === issue.iid && <Check size={12} className="text-white" />}
											</div>
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<span className="text-[11px] text-text-tertiary">#{issue.iid}</span>
												<span
													className={cn("text-[10px] px-1.5 py-0.5 rounded", getStateColor(issue.state))}
												>
													{formatIssueState(issue.state)}
												</span>
												{issue.webUrl && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handleOpenIssue(issue);
														}}
														className="text-text-tertiary hover:text-text-secondary"
													>
														<ExternalLink size={12} />
													</button>
												)}
											</div>
											<div className="text-[13px] text-text-primary line-clamp-2">{issue.title}</div>
											{issue.labels && issue.labels.length > 0 && (
												<div className="flex flex-wrap gap-1 mt-1.5">
													{issue.labels.slice(0, 3).map((label) => (
														<span
															key={label}
															className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary"
														>
															{label}
														</span>
													))}
													{issue.labels.length > 3 && (
														<span className="text-[10px] text-text-tertiary">
															+{issue.labels.length - 3} more
														</span>
													)}
												</div>
											)}
										</div>
									</button>
								))}
							</div>
						)}
					</div>
					<div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
						<Button size="sm" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={handleConfirm}
							disabled={!selectedIssue || isFetchingDetail}
						>
							{isFetchingDetail ? (
								<>
									<Loader2 size={14} className="animate-spin" />
									Loading...
								</>
							) : (
								"Select Issue"
							)}
						</Button>
					</div>
				</RadixDialog.Content>
			</RadixDialog.Portal>
		</RadixDialog.Root>
	);
}
