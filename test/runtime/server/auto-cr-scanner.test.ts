import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoCrScannerDependencies } from "../../../src/server/auto-cr-scanner";
import { createAutoCrScanner } from "../../../src/server/auto-cr-scanner";
import type {
	RuntimeAntcodePullRequest,
	RuntimeBoardCard,
	RuntimeBoardData,
	RuntimeWorkspaceStateResponse,
} from "../../../src/core/api-contract";
import type { RuntimeConfigState } from "../../../src/config/runtime-config";
import type { RuntimeWorkspaceAtomicMutationResult } from "../../../src/state/workspace-state";

vi.mock("../../../src/state/workspace-state", () => ({
	listWorkspaceIndexEntries: vi.fn(),
	loadWorkspaceState: vi.fn(),
	mutateWorkspaceState: vi.fn(),
}));

vi.mock("../../../src/cline-sdk/cline-runtime-logger", () => ({
	createKanbanClineLogger: () => ({
		log: vi.fn(),
	}),
}));

import {
	listWorkspaceIndexEntries,
	loadWorkspaceState,
	mutateWorkspaceState,
} from "../../../src/state/workspace-state";

const listWorkspaceIndexEntriesMock = vi.mocked(listWorkspaceIndexEntries);
const loadWorkspaceStateMock = vi.mocked(loadWorkspaceState);
const mutateWorkspaceStateMock = vi.mocked(mutateWorkspaceState);

function createEmptyBoard(): RuntimeBoardData {
	return {
		columns: [
			{ id: "backlog", title: "Backlog", cards: [] },
			{ id: "in_progress", title: "In Progress", cards: [] },
			{ id: "review", title: "Review", cards: [] },
			{ id: "trash", title: "Trash", cards: [] },
		],
		dependencies: [],
	};
}

function createMockWorkspaceState(
	boardOverride?: RuntimeBoardData,
): RuntimeWorkspaceStateResponse {
	return {
		repoPath: "/mock/repo",
		statePath: "/mock/state",
		git: { currentBranch: "main", defaultBranch: "main", branches: ["main"] },
		board: boardOverride ?? createEmptyBoard(),
		sessions: {},
		revision: 1,
	};
}

function createMockRuntimeConfig(
	overrides?: Partial<RuntimeConfigState>,
): RuntimeConfigState {
	return {
		globalConfigPath: "/mock/config.json",
		projectConfigPath: null,
		selectedAgentId: "claude",
		selectedAgentInstanceId: "claude-default",
		configuredAgents: [
			{ id: "claude-default", type: "claude", alias: "Claude Code", command: "claude" },
			{ id: "kimi-reviewer", type: "kimi", alias: "Kimi Review", command: "kimi" },
		],
		selectedShortcutLabel: null,
		agentAutonomousModeEnabled: true,
		readyForReviewNotificationsEnabled: true,
		shortcuts: [],
		commitPromptTemplate: "",
		openPrPromptTemplate: "",
		commitPromptTemplateDefault: "",
		openPrPromptTemplateDefault: "",
		antcodeToken: "test-token",
		autoCrEnabled: true,
		autoCrAgentInstanceIds: ["claude-default", "kimi-reviewer"],
		autoCrScanIntervalMinutes: 45,
		...overrides,
	};
}

function createMockPr(
	overrides?: Partial<RuntimeAntcodePullRequest>,
): RuntimeAntcodePullRequest {
	return {
		iid: 5,
		title: "Fix bug",
		state: "opened",
		labels: ["PendingAGIReview"],
		webUrl: "https://code.alipay.com/group/project/pull_requests/5",
		sourceBranch: "fix-bug",
		targetBranch: "main",
		...overrides,
	};
}

function createMockDeps(
	overrides?: Partial<AutoCrScannerDependencies>,
): AutoCrScannerDependencies {
	return {
		getWorkspacePath: vi.fn().mockReturnValue("/mock/workspace"),
		loadScopedRuntimeConfig: vi.fn().mockResolvedValue(createMockRuntimeConfig()),
		listPullRequests: vi.fn().mockResolvedValue([createMockPr()]),
		resolveProjectContext: vi.fn().mockResolvedValue({
			ok: true as const,
			context: {
				antcodeToken: "test-token",
				projectName: "group/project",
				apiBaseUrl: "https://code.alipay.com/api/v3",
			},
		}),
		startTask: vi.fn().mockResolvedValue(true),
		broadcastWorkspaceStateUpdated: vi.fn().mockResolvedValue(undefined),
		getScanIntervalMs: vi.fn().mockResolvedValue(45 * 60 * 1000),
		...overrides,
	};
}

function setupDefaultModuleMocks(existingBoard?: RuntimeBoardData): void {
	const board = existingBoard ?? createEmptyBoard();

	listWorkspaceIndexEntriesMock.mockResolvedValue([
		{ workspaceId: "ws-1", repoPath: "/mock/repo" },
	]);
	loadWorkspaceStateMock.mockResolvedValue(createMockWorkspaceState(board));

	mutateWorkspaceStateMock.mockImplementation(async (_cwd, mutate) => {
		const currentState = createMockWorkspaceState(board);
		const result = mutate(currentState) as RuntimeWorkspaceAtomicMutationResult<RuntimeBoardCard | null>;
		if (result.save === false) {
			return { value: result.value, state: currentState, saved: false };
		}
		return {
			value: result.value,
			state: { ...currentState, board: result.board },
			saved: true,
		};
	});
}

describe("createAutoCrScanner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("starts one task per matching PR and agent instance", async () => {
		setupDefaultModuleMocks();
		const deps = createMockDeps();
		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		expect(mutateWorkspaceStateMock).toHaveBeenCalledTimes(2);
		expect(deps.startTask).toHaveBeenCalledTimes(2);

		const startTaskMock = vi.mocked(deps.startTask);
		const firstCard = startTaskMock.mock.calls[0]?.[3] as RuntimeBoardCard;
		const secondCard = startTaskMock.mock.calls[1]?.[3] as RuntimeBoardCard;
		expect(firstCard.autoCrSource?.agentInstanceId).toBe("claude-default");
		expect(secondCard.autoCrSource?.agentInstanceId).toBe("kimi-reviewer");
	});

	it("does not create duplicate tasks for the same project PR and agent instance", async () => {
		const existingBoard = createEmptyBoard();
		existingBoard.columns[1].cards.push({
			id: "existing-task",
			title: "[Auto CR] Review PR !5",
			prompt: "review",
			startInPlanMode: false,
			baseRef: "main",
			workspaceMode: "worktree",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			autoCrSource: {
				projectName: "group/project",
				prIid: 5,
				prUrl: "https://code.alipay.com/group/project/pull_requests/5",
				agentInstanceId: "claude-default",
			},
		} as RuntimeBoardCard);

		setupDefaultModuleMocks(existingBoard);
		const deps = createMockDeps();
		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		// mutateWorkspaceState is called for both agents, but the claude-default
		// one returns save:false (duplicate detected inside the mutator).
		// We verify that startTask is only called for the kimi-reviewer task.
		expect(deps.startTask).toHaveBeenCalledTimes(1);
		const startTaskMock = vi.mocked(deps.startTask);
		const card = startTaskMock.mock.calls[0]?.[3] as RuntimeBoardCard;
		expect(card.autoCrSource?.agentInstanceId).toBe("kimi-reviewer");
	});

	it("skips PRs without PendingAGIReview label", async () => {
		setupDefaultModuleMocks();
		const deps = createMockDeps({
			listPullRequests: vi.fn().mockResolvedValue([
				createMockPr({ labels: ["WIP"] }),
			]),
		});

		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		expect(deps.startTask).not.toHaveBeenCalled();
	});

	it("skips when auto CR is disabled", async () => {
		setupDefaultModuleMocks();
		const deps = createMockDeps({
			loadScopedRuntimeConfig: vi.fn().mockResolvedValue(
				createMockRuntimeConfig({ autoCrEnabled: false }),
			),
		});

		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		expect(deps.listPullRequests).not.toHaveBeenCalled();
		expect(deps.startTask).not.toHaveBeenCalled();
	});

	it("removes task when startTask fails", async () => {
		setupDefaultModuleMocks();
		const deps = createMockDeps({
			startTask: vi.fn().mockResolvedValue(false),
			loadScopedRuntimeConfig: vi.fn().mockResolvedValue(
				createMockRuntimeConfig({ autoCrAgentInstanceIds: ["claude-default"] }),
			),
		});

		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		// First call creates the task, second call removes it after startTask returns false
		expect(mutateWorkspaceStateMock).toHaveBeenCalledTimes(2);
	});

	it("skips invalid agent instances", async () => {
		setupDefaultModuleMocks();
		const deps = createMockDeps({
			loadScopedRuntimeConfig: vi.fn().mockResolvedValue(
				createMockRuntimeConfig({
					autoCrAgentInstanceIds: ["nonexistent-agent"],
				}),
			),
		});

		const scanner = createAutoCrScanner(deps);

		scanner.start();
		await vi.advanceTimersByTimeAsync(0);
		scanner.stop();

		expect(deps.startTask).not.toHaveBeenCalled();
	});
});
