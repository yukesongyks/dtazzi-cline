import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Clock } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/components/ui/cn";

interface TaskScheduledExecutionPickerProps {
	scheduledStartTime: number | undefined;
	onScheduledStartTimeChange: (value: number | undefined) => void;
}

function formatDateTimeLocal(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocal(value: string): number | undefined {
	if (!value) {
		return undefined;
	}
	const timestamp = new Date(value).getTime();
	if (isNaN(timestamp)) {
		return undefined;
	}
	return timestamp;
}

export function TaskScheduledExecutionPicker({
	scheduledStartTime,
	onScheduledStartTimeChange,
}: TaskScheduledExecutionPickerProps): ReactElement {
	const [isExpanded, setIsExpanded] = useState(scheduledStartTime !== undefined);
	const [isEnabled, setIsEnabled] = useState(scheduledStartTime !== undefined);
	const [dateValue, setDateValue] = useState(scheduledStartTime ? formatDateTimeLocal(scheduledStartTime) : "");
	const [timeValue, setTimeValue] = useState(
		scheduledStartTime
			? `${String(new Date(scheduledStartTime).getHours()).padStart(2, "0")}:${String(new Date(scheduledStartTime).getMinutes()).padStart(2, "0")}`
			: "",
	);

	// Sync internal state with external props
	useEffect(() => {
		const hasScheduledTime = scheduledStartTime !== undefined;
		setIsEnabled(hasScheduledTime);
		setIsExpanded(hasScheduledTime);
		if (scheduledStartTime) {
			setDateValue(formatDateTimeLocal(scheduledStartTime));
			setTimeValue(
				`${String(new Date(scheduledStartTime).getHours()).padStart(2, "0")}:${String(new Date(scheduledStartTime).getMinutes()).padStart(2, "0")}`,
			);
		} else {
			setDateValue("");
			setTimeValue("");
		}
	}, [scheduledStartTime]);

	const handleToggle = useCallback(
		(enabled: boolean) => {
			setIsEnabled(enabled);
			if (!enabled) {
				onScheduledStartTimeChange(undefined);
				setDateValue("");
				setTimeValue("");
			} else {
				// Set default to 1 hour from now
				const defaultTime = Date.now() + 60 * 60 * 1000;
				setDateValue(formatDateTimeLocal(defaultTime));
				setTimeValue(
					`${String(new Date(defaultTime).getHours()).padStart(2, "0")}:${String(new Date(defaultTime).getMinutes()).padStart(2, "0")}`,
				);
				onScheduledStartTimeChange(defaultTime);
			}
		},
		[onScheduledStartTimeChange],
	);

	const handleDateChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newDateValue = e.target.value;
			setDateValue(newDateValue);

			if (newDateValue && timeValue) {
				const timestamp = parseDateTimeLocal(`${newDateValue}T${timeValue}`);
				if (timestamp && timestamp > Date.now()) {
					onScheduledStartTimeChange(timestamp);
				}
			}
		},
		[timeValue, onScheduledStartTimeChange],
	);

	const handleTimeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newTimeValue = e.target.value;
			setTimeValue(newTimeValue);

			if (dateValue && newTimeValue) {
				const datePart = dateValue.split("T")[0];
				const timestamp = parseDateTimeLocal(`${datePart}T${newTimeValue}`);
				if (timestamp && timestamp > Date.now()) {
					onScheduledStartTimeChange(timestamp);
				}
			}
		},
		[dateValue, onScheduledStartTimeChange],
	);

	// Get minimum date (today)
	const minDate = formatDateTimeLocal(Date.now()).split("T")[0];

	return (
		<div className="flex flex-col gap-2">
			<Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
				<Collapsible.Trigger asChild>
					<button
						type="button"
						className="inline-flex w-fit items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary cursor-pointer bg-transparent border-none p-0"
					>
						<ChevronDown
							size={12}
							className={cn("transition-transform", isExpanded ? "rotate-0" : "-rotate-90")}
						/>
						<Clock size={12} />
						Scheduled Execution
					</button>
				</Collapsible.Trigger>
				<Collapsible.Content className="pt-2">
					<div className="flex flex-col gap-2">
						<label className="flex items-center gap-2 text-[12px] text-text-primary cursor-pointer select-none">
							<input
								type="checkbox"
								checked={isEnabled}
								onChange={(e) => handleToggle(e.target.checked)}
								className="h-3.5 w-3.5 rounded-sm border border-border-bright bg-surface-3 accent-accent"
							/>
							Enable scheduled execution
						</label>

						{isEnabled && (
							<div className="flex flex-col gap-2 pl-5">
								<span className="text-[11px] text-text-secondary">
									Task will automatically start at the specified time
								</span>
								<div className="flex items-center gap-2">
									<div className="flex flex-col gap-1">
										<span className="text-[11px] text-text-secondary">Date</span>
										<input
											type="date"
											value={dateValue.split("T")[0] || ""}
											onChange={handleDateChange}
											min={minDate}
											className="h-7 px-2 rounded-md border border-border bg-surface-2 text-[12px] text-text-primary focus:border-border-focus focus:outline-none"
										/>
									</div>
									<div className="flex flex-col gap-1">
										<span className="text-[11px] text-text-secondary">Time</span>
										<input
											type="time"
											value={timeValue}
											onChange={handleTimeChange}
											className="h-7 px-2 rounded-md border border-border bg-surface-2 text-[12px] text-text-primary focus:border-border-focus focus:outline-none"
										/>
									</div>
								</div>
								{scheduledStartTime && scheduledStartTime <= Date.now() && (
									<span className="text-[11px] text-status-orange">Selected time must be in the future</span>
								)}
							</div>
						)}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		</div>
	);
}
