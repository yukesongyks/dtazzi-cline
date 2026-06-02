// Periodically checks for scheduled tasks and starts them when their time arrives.

import { createKanbanClineLogger } from "../cline-sdk/cline-runtime-logger";
import type { RuntimeBoardCard, RuntimeBoardData } from "../core/api-contract";
import { moveTaskToColumn } from "../core/task-board-mutations";
import { listWorkspaceIndexEntries, loadWorkspaceState, mutateWorkspaceState } from "../state/workspace-state";

const LOGGER = createKanbanClineLogger({ component: "scheduled-task-executor" });

const SCHEDULED_TASK_CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds

export interface ScheduledTaskExecutorDependencies {
	getWorkspacePath: (workspaceId: string) => string | null;
	// Callback to start a task. Returns true if the task was started successfully.
	startTask: (workspaceId: string, workspacePath: string, taskId: string, card: RuntimeBoardCard) => Promise<boolean>;
	broadcastWorkspaceStateUpdated: (workspaceId: string, workspacePath: string) => Promise<void>;
}

export interface ScheduledTaskExecutor {
	start: () => void;
	stop: () => void;
}

function findScheduledTasksToStart(
	board: RuntimeBoardData,
	now: number,
): Array<{ taskId: string; card: RuntimeBoardCard }> {
	const backlogColumn = board.columns.find((col) => col.id === "backlog");
	if (!backlogColumn) {
		return [];
	}
	const tasks: Array<{ taskId: string; card: RuntimeBoardCard }> = [];
	for (const card of backlogColumn.cards) {
		if (card.scheduledStartTime !== undefined && card.scheduledStartTime <= now) {
			tasks.push({ taskId: card.id, card });
		}
	}
	return tasks;
}

export function createScheduledTaskExecutor(deps: ScheduledTaskExecutorDependencies): ScheduledTaskExecutor {
	let intervalId: NodeJS.Timeout | null = null;
	let isRunning = false;

	const checkAndStartScheduledTasks = async () => {
		if (isRunning) {
			return;
		}
		isRunning = true;
		try {
			const now = Date.now();
			LOGGER.log("Checking for scheduled tasks", { timestamp: new Date(now).toISOString() });
			const workspaceEntries = await listWorkspaceIndexEntries();
			LOGGER.log("Found workspaces", { count: workspaceEntries.length });

			for (const { workspaceId, repoPath } of workspaceEntries) {
				try {
					const workspacePath = deps.getWorkspacePath(workspaceId);
					if (!workspacePath) {
						LOGGER.log("No workspace path, skipping", { workspaceId });
						continue;
					}

					// Load current state
					const state = await loadWorkspaceState(repoPath);
					const backlogColumn = state.board.columns.find((col) => col.id === "backlog");
					const scheduledTasks = backlogColumn?.cards.filter((c) => c.scheduledStartTime !== undefined) || [];
					LOGGER.log("Scheduled tasks in backlog", { workspaceId, count: scheduledTasks.length });
					for (const task of scheduledTasks) {
						LOGGER.log("Task schedule info", {
							taskId: task.id,
							scheduledStartTime: task.scheduledStartTime,
							now,
							shouldStart: (task.scheduledStartTime ?? 0) <= now,
						});
					}

					const tasksToStart = findScheduledTasksToStart(state.board, now);
					LOGGER.log("Tasks to start", { count: tasksToStart.length });

					if (tasksToStart.length === 0) {
						continue;
					}

					// Process each scheduled task
					for (const { taskId, card } of tasksToStart) {
						try {
							LOGGER.log("Starting task", { taskId });
							// Move task from backlog to in_progress using mutateWorkspaceState
							const result = await mutateWorkspaceState(repoPath, (currentState) => {
								const moveResult = moveTaskToColumn(currentState.board, taskId, "in_progress", now);
								const updatedCard = moveResult.board.columns
									.find((col) => col.id === "in_progress")
									?.cards.find((c) => c.id === taskId);
								return {
									board: moveResult.board,
									value: { success: moveResult.moved, card: updatedCard ?? null },
								};
							});

							if (!result.value.success || !result.value.card) {
								LOGGER.log("Failed to move task to in_progress", { taskId });
								continue;
							}

							const updatedCard = result.value.card as RuntimeBoardCard;

							// Start the task via the provided callback
							const started = await deps.startTask(workspaceId, workspacePath, taskId, updatedCard);
							if (started) {
								LOGGER.log("Started scheduled task", { taskId, workspaceId });
							} else {
								LOGGER.log("Failed to start task", { taskId });
							}
						} catch (error) {
							LOGGER.log("Error processing task", { taskId, error });
						}
					}

					// Broadcast the updated state
					await deps.broadcastWorkspaceStateUpdated(workspaceId, repoPath);
				} catch (error) {
					LOGGER.log("Error processing workspace", { workspaceId, error });
				}
			}
		} finally {
			isRunning = false;
		}
	};

	const start = () => {
		if (intervalId !== null) {
			return;
		}
		LOGGER.log("Starting scheduled task executor");
		// Run immediately on start
		void checkAndStartScheduledTasks();
		// Then run periodically
		intervalId = setInterval(checkAndStartScheduledTasks, SCHEDULED_TASK_CHECK_INTERVAL_MS);
		intervalId.unref(); // Don't prevent the process from exiting
	};

	const stop = () => {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return {
		start,
		stop,
	};
}
