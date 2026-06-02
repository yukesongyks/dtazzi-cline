import type { RuntimeAgentId } from "@/runtime/types";
import type { TaskAutoReviewMode } from "@/types";

export type TelemetrySelectedAgentId = RuntimeAgentId | "unknown";

interface TelemetryEventMap {
	task_created: {
		selected_agent_id: TelemetrySelectedAgentId;
		start_in_plan_mode: boolean;
		auto_review_mode?: TaskAutoReviewMode;
		prompt_character_count: number;
	};
	task_dependency_created: Record<string, never>;
	tasks_auto_started_from_dependency: {
		started_task_count: number;
	};
	task_resumed_from_trash: Record<string, never>;
}

export function toTelemetrySelectedAgentId(agentId: RuntimeAgentId | null | undefined): TelemetrySelectedAgentId {
	return agentId ?? "unknown";
}

// Telemetry is disabled for internal builds
// These functions are kept as no-ops for compatibility
function captureTelemetryEvent<EventName extends keyof TelemetryEventMap>(
	_eventName: EventName,
	_properties: TelemetryEventMap[EventName],
): void {
	// Telemetry disabled - no-op
}

export function trackTaskCreated(_properties: TelemetryEventMap["task_created"]): void {
	// Telemetry disabled - no-op
}

export function trackTaskDependencyCreated(): void {
	// Telemetry disabled - no-op
}

export function trackTasksAutoStartedFromDependency(_startedTaskCount: number): void {
	// Telemetry disabled - no-op
}

export function trackTaskResumedFromTrash(): void {
	// Telemetry disabled - no-op
}
