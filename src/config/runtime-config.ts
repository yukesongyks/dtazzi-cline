// Persists Kanban-owned runtime preferences on disk.
// This module should store Kanban settings such as selected agents,
// shortcuts, and prompt templates, not SDK-owned Cline secrets or OAuth data.
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getRuntimeAgentCatalogEntry, isRuntimeAgentLaunchSupported } from "../core/agent-catalog";
import type { RuntimeAgentId, RuntimeConfiguredAgent, RuntimeProjectShortcut } from "../core/api-contract";
import { type LockRequest, lockedFileSystem } from "../fs/locked-file-system";
import { detectInstalledCommands } from "../terminal/agent-registry";
import {
	DEFAULT_SELECTED_AGENT_INSTANCE_ID,
	createDefaultConfiguredAgents,
	getAgentTypeForInstance,
	normalizeConfiguredAgents,
	normalizeSelectedAgentInstanceId,
} from "./runtime-agent-config";
import { areRuntimeProjectShortcutsEqual } from "./shortcut-utils";

interface RuntimeGlobalConfigFileShape {
	selectedAgentId?: RuntimeAgentId;
	selectedAgentInstanceId?: string;
	configuredAgents?: RuntimeConfiguredAgent[];
	selectedShortcutLabel?: string;
	agentAutonomousModeEnabled?: boolean;
	readyForReviewNotificationsEnabled?: boolean;
	commitPromptTemplate?: string;
	openPrPromptTemplate?: string;
	antcodeToken?: string;
	autoCrEnabled?: boolean;
	autoCrAgentInstanceIds?: string[];
	autoCrScanIntervalMinutes?: number;
}

interface RuntimeProjectConfigFileShape {
	shortcuts?: RuntimeProjectShortcut[];
}

export interface RuntimeConfigState {
	globalConfigPath: string;
	projectConfigPath: string | null;
	selectedAgentId: RuntimeAgentId;
	selectedAgentInstanceId: string;
	configuredAgents: RuntimeConfiguredAgent[];
	selectedShortcutLabel: string | null;
	agentAutonomousModeEnabled: boolean;
	readyForReviewNotificationsEnabled: boolean;
	shortcuts: RuntimeProjectShortcut[];
	commitPromptTemplate: string;
	openPrPromptTemplate: string;
	commitPromptTemplateDefault: string;
	openPrPromptTemplateDefault: string;
	antcodeToken: string | null;
	autoCrEnabled: boolean;
	autoCrAgentInstanceIds: string[];
	autoCrScanIntervalMinutes: number;
}

export interface RuntimeConfigUpdateInput {
	selectedAgentId?: RuntimeAgentId;
	selectedAgentInstanceId?: string;
	configuredAgents?: RuntimeConfiguredAgent[];
	selectedShortcutLabel?: string | null;
	agentAutonomousModeEnabled?: boolean;
	readyForReviewNotificationsEnabled?: boolean;
	shortcuts?: RuntimeProjectShortcut[];
	commitPromptTemplate?: string;
	openPrPromptTemplate?: string;
	antcodeToken?: string | null;
	autoCrEnabled?: boolean;
	autoCrAgentInstanceIds?: string[];
	autoCrScanIntervalMinutes?: number;
}

const RUNTIME_HOME_PARENT_DIR = ".cline";
const RUNTIME_HOME_DIR = "kanban";
const CONFIG_FILENAME = "config.json";
const PROJECT_CONFIG_PARENT_DIR = ".cline";
const PROJECT_CONFIG_DIR = "kanban";
const PROJECT_CONFIG_FILENAME = "config.json";
const DEFAULT_AGENT_ID: RuntimeAgentId = "cline";
const AUTO_SELECT_AGENT_PRIORITY: readonly RuntimeAgentId[] = ["claude", "antcc", "codex", "droid", "kiro", "kimi"];
const DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED = true;
const DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED = true;
const DEFAULT_COMMIT_PROMPT_TEMPLATE = `You are in a worktree on a detached HEAD. When you are finished with the task, commit the working changes onto {{base_ref}}.

- Do not run destructive commands: git reset --hard, git clean -fdx, git worktree remove, rm/mv on repository paths.
- Do not edit files outside git workflows unless required for conflict resolution.
- Preserve any pre-existing user uncommitted changes in the base worktree.

Steps:
1. In the current task worktree, stage and create a commit for the pending task changes.
2. Find where {{base_ref}} is checked out:
   - Run: git worktree list --porcelain
   - If branch {{base_ref}} is checked out in path P, use that P.
   - If not checked out anywhere, use current worktree as P by checking out {{base_ref}} there.
3. In P, verify current branch is {{base_ref}}.
4. If P has uncommitted changes, stash them: git -C P stash push -u -m "kanban-pre-cherry-pick"
5. Cherry-pick the task commit into P. If this fails because .git/index.lock exists, wait briefly for any active git process to finish. If the lock remains and no git process is active, treat the lock as stale, remove it, and retry.
6. If cherry-pick conflicts, resolve carefully, preserving both the intended task changes and existing user edits.
7. If step 4 created a new stash entry, restore that stash with: git -C P stash pop <stash-ref>
8. If stash pop conflicts, resolve them while preserving pre-existing user edits.
9. Report:
   - Final commit hash
   - Final commit message
   - Whether stash was used
   - Whether conflicts were resolved
   - Any remaining manual follow-up needed`;
const DEFAULT_OPEN_PR_PROMPT_TEMPLATE = `You are in a worktree on a detached HEAD. When you are finished with the task, open a pull request against {{base_ref}}.

- Do not run destructive commands: git reset --hard, git clean -fdx, git worktree remove, rm/mv on repository paths.
- Do not modify the base worktree.
- Keep all PR preparation in the current task worktree.

Steps:
1. Ensure all intended changes are committed in the current task worktree.
2. If currently on detached HEAD, create a branch at the current commit in this worktree.
3. Push the branch to origin and set upstream.
4. Create a pull request with base {{base_ref}} and head as the pushed branch (use gh CLI if available).
5. If a pull request already exists for the same head and base, return that existing PR URL instead of creating a duplicate.
6. If PR creation is blocked, explain exactly why and provide the exact commands to complete it manually.
7. Report:
   - PR title: PR URL
   - Base branch
   - Head branch
   - Any follow-up needed`;

export function pickBestInstalledAgentIdFromDetected(detectedCommands: readonly string[]): RuntimeAgentId | null {
	const detected = new Set(detectedCommands);
	for (const agentId of AUTO_SELECT_AGENT_PRIORITY) {
		const catalogEntry = getRuntimeAgentCatalogEntry(agentId);
		const binary = catalogEntry?.binary ?? agentId;
		if (detected.has(binary) || detected.has(agentId)) {
			return agentId;
		}
	}
	return null;
}

function getRuntimeHomePath(): string {
	return join(homedir(), RUNTIME_HOME_PARENT_DIR, RUNTIME_HOME_DIR);
}

function normalizeAgentId(agentId: RuntimeAgentId | string | null | undefined): RuntimeAgentId {
	if (
		(agentId === "claude" ||
			agentId === "antcc" ||
			agentId === "codex" ||
			agentId === "gemini" ||
			agentId === "opencode" ||
			agentId === "droid" ||
			agentId === "kiro" ||
			agentId === "kimi" ||
			agentId === "cline") &&
		isRuntimeAgentLaunchSupported(agentId)
	) {
		return agentId;
	}
	return DEFAULT_AGENT_ID;
}

function normalizeRuntimeAgentSelection(input: {
	selectedAgentId?: RuntimeAgentId | string | null;
	selectedAgentInstanceId?: string | null;
	configuredAgents?: unknown;
}): {
	selectedAgentId: RuntimeAgentId;
	selectedAgentInstanceId: string;
	configuredAgents: RuntimeConfiguredAgent[];
} {
	const legacySelectedAgentId = normalizeAgentId(input.selectedAgentId);
	const configuredAgents = normalizeConfiguredAgents(input.configuredAgents);
	const selectedAgentInstanceId = normalizeSelectedAgentInstanceId(
		input.selectedAgentInstanceId,
		configuredAgents,
		legacySelectedAgentId,
	);
	const selectedAgentId = getAgentTypeForInstance(configuredAgents, selectedAgentInstanceId);
	return {
		selectedAgentId,
		selectedAgentInstanceId,
		configuredAgents,
	};
}

function pickBestInstalledAgentId(): RuntimeAgentId | null {
	return pickBestInstalledAgentIdFromDetected(detectInstalledCommands());
}

function normalizeShortcut(shortcut: RuntimeProjectShortcut): RuntimeProjectShortcut | null {
	if (!shortcut || typeof shortcut !== "object") {
		return null;
	}

	const label = typeof shortcut.label === "string" ? shortcut.label.trim() : "";
	const command = typeof shortcut.command === "string" ? shortcut.command.trim() : "";
	const icon = typeof shortcut.icon === "string" ? shortcut.icon.trim() : "";

	if (!label || !command) {
		return null;
	}

	return {
		label,
		command,
		icon: icon || undefined,
	};
}

function normalizeShortcuts(shortcuts: RuntimeProjectShortcut[] | null | undefined): RuntimeProjectShortcut[] {
	if (!Array.isArray(shortcuts)) {
		return [];
	}
	const normalized: RuntimeProjectShortcut[] = [];
	for (const shortcut of shortcuts) {
		const parsed = normalizeShortcut(shortcut);
		if (parsed) {
			normalized.push(parsed);
		}
	}
	return normalized;
}

function normalizePromptTemplate(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	return fallback;
}

function normalizeShortcutLabel(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeStringOrNull(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeAutoCrAgentInstanceIds(
	ids: string[] | null | undefined,
	configuredAgents: readonly RuntimeConfiguredAgent[],
): string[] {
	if (!Array.isArray(ids)) {
		return [];
	}
	const validIds = new Set(configuredAgents.map((agent) => agent.id));
	return ids.filter((id) => typeof id === "string" && id.length > 0 && validIds.has(id));
}

const DEFAULT_AUTO_CR_SCAN_INTERVAL_MINUTES = 45;
const MIN_AUTO_CR_SCAN_INTERVAL_MINUTES = 5;
const MAX_AUTO_CR_SCAN_INTERVAL_MINUTES = 180;

function normalizeAutoCrScanIntervalMinutes(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_AUTO_CR_SCAN_INTERVAL_MINUTES;
	}
	const clamped = Math.round(value);
	return Math.max(MIN_AUTO_CR_SCAN_INTERVAL_MINUTES, Math.min(MAX_AUTO_CR_SCAN_INTERVAL_MINUTES, clamped));
}

function areConfiguredAgentsEqual(
	left: readonly RuntimeConfiguredAgent[],
	right: readonly RuntimeConfiguredAgent[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		const leftAgent = left[index];
		const rightAgent = right[index];
		if (
			leftAgent.id !== rightAgent.id ||
			leftAgent.type !== rightAgent.type ||
			leftAgent.alias !== rightAgent.alias ||
			leftAgent.command !== rightAgent.command
		) {
			return false;
		}
	}
	return true;
}

function hasOwnKey<T extends object>(value: T | null, key: keyof T): boolean {
	if (!value) {
		return false;
	}
	return Object.hasOwn(value, key);
}

export function getRuntimeGlobalConfigPath(): string {
	return join(getRuntimeHomePath(), CONFIG_FILENAME);
}

export function getRuntimeProjectConfigPath(cwd: string): string {
	return join(resolve(cwd), PROJECT_CONFIG_PARENT_DIR, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILENAME);
}

interface RuntimeConfigPaths {
	globalConfigPath: string;
	projectConfigPath: string | null;
}

function normalizePathForComparison(path: string): string {
	const normalized = resolve(path).replaceAll("\\", "/");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveRuntimeConfigPaths(cwd: string | null): RuntimeConfigPaths {
	const globalConfigPath = getRuntimeGlobalConfigPath();
	if (cwd === null) {
		return {
			globalConfigPath,
			projectConfigPath: null,
		};
	}

	const normalizedCwd = normalizePathForComparison(cwd);
	const normalizedHome = normalizePathForComparison(homedir());
	if (normalizedCwd === normalizedHome) {
		return {
			globalConfigPath,
			projectConfigPath: null,
		};
	}

	return {
		globalConfigPath,
		projectConfigPath: getRuntimeProjectConfigPath(cwd),
	};
}

function getRuntimeConfigLockRequests(cwd: string | null): LockRequest[] {
	const paths = resolveRuntimeConfigPaths(cwd);
	const requests: LockRequest[] = [
		{
			path: paths.globalConfigPath,
			type: "file",
		},
	];
	if (paths.projectConfigPath) {
		requests.push({
			path: paths.projectConfigPath,
			type: "file",
		});
	}
	return requests;
}

function toRuntimeConfigState({
	globalConfigPath,
	projectConfigPath,
	globalConfig,
	projectConfig,
}: {
	globalConfigPath: string;
	projectConfigPath: string | null;
	globalConfig: RuntimeGlobalConfigFileShape | null;
	projectConfig: RuntimeProjectConfigFileShape | null;
}): RuntimeConfigState {
	const normalizedAgentSelection = normalizeRuntimeAgentSelection({
		selectedAgentId: globalConfig?.selectedAgentId,
		selectedAgentInstanceId: globalConfig?.selectedAgentInstanceId,
		configuredAgents: globalConfig?.configuredAgents,
	});
	return {
		globalConfigPath,
		projectConfigPath,
		selectedAgentId: normalizedAgentSelection.selectedAgentId,
		selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
		configuredAgents: normalizedAgentSelection.configuredAgents,
		selectedShortcutLabel: normalizeShortcutLabel(globalConfig?.selectedShortcutLabel),
		agentAutonomousModeEnabled: normalizeBoolean(
			globalConfig?.agentAutonomousModeEnabled,
			DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED,
		),
		readyForReviewNotificationsEnabled: normalizeBoolean(
			globalConfig?.readyForReviewNotificationsEnabled,
			DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED,
		),
		shortcuts: normalizeShortcuts(projectConfig?.shortcuts),
		commitPromptTemplate: normalizePromptTemplate(globalConfig?.commitPromptTemplate, DEFAULT_COMMIT_PROMPT_TEMPLATE),
		openPrPromptTemplate: normalizePromptTemplate(
			globalConfig?.openPrPromptTemplate,
			DEFAULT_OPEN_PR_PROMPT_TEMPLATE,
		),
		commitPromptTemplateDefault: DEFAULT_COMMIT_PROMPT_TEMPLATE,
		openPrPromptTemplateDefault: DEFAULT_OPEN_PR_PROMPT_TEMPLATE,
		antcodeToken: normalizeStringOrNull(globalConfig?.antcodeToken),
		autoCrEnabled: normalizeBoolean(globalConfig?.autoCrEnabled, false),
		autoCrAgentInstanceIds: normalizeAutoCrAgentInstanceIds(
			globalConfig?.autoCrAgentInstanceIds,
			normalizedAgentSelection.configuredAgents,
		),
		autoCrScanIntervalMinutes: normalizeAutoCrScanIntervalMinutes(globalConfig?.autoCrScanIntervalMinutes),
	};
}

async function readRuntimeConfigFile<T>(configPath: string): Promise<T | null> {
	try {
		const raw = await readFile(configPath, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

async function writeRuntimeGlobalConfigFile(
	configPath: string,
	config: {
		selectedAgentId: RuntimeAgentId;
		selectedAgentInstanceId: string;
		configuredAgents: RuntimeConfiguredAgent[];
		selectedShortcutLabel?: string | null;
		agentAutonomousModeEnabled?: boolean;
		readyForReviewNotificationsEnabled?: boolean;
		commitPromptTemplate?: string;
		openPrPromptTemplate?: string;
		antcodeToken?: string | null;
		autoCrEnabled?: boolean;
		autoCrAgentInstanceIds?: string[];
		autoCrScanIntervalMinutes?: number;
	},
): Promise<void> {
	const existing = await readRuntimeConfigFile<RuntimeGlobalConfigFileShape>(configPath);
	const existingSelectedAgentId = hasOwnKey(existing, "selectedAgentId")
		? normalizeAgentId(existing?.selectedAgentId)
		: undefined;
	const existingSelectedAgentInstanceId = hasOwnKey(existing, "selectedAgentInstanceId")
		? normalizeStringOrNull(existing?.selectedAgentInstanceId)
		: undefined;
	const existingConfiguredAgents = hasOwnKey(existing, "configuredAgents")
		? normalizeConfiguredAgents(existing?.configuredAgents)
		: undefined;
	const selectedAgentId = normalizeAgentId(config.selectedAgentId);
	const configuredAgents = normalizeConfiguredAgents(config.configuredAgents);
	const selectedAgentInstanceId = normalizeSelectedAgentInstanceId(
		config.selectedAgentInstanceId,
		configuredAgents,
		selectedAgentId,
	);
	const selectedShortcutLabel =
		config.selectedShortcutLabel === undefined ? undefined : normalizeShortcutLabel(config.selectedShortcutLabel);
	const existingSelectedShortcutLabel = hasOwnKey(existing, "selectedShortcutLabel")
		? normalizeShortcutLabel(existing?.selectedShortcutLabel)
		: undefined;
	const agentAutonomousModeEnabled =
		config.agentAutonomousModeEnabled === undefined
			? DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED
			: normalizeBoolean(config.agentAutonomousModeEnabled, DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED);
	const readyForReviewNotificationsEnabled =
		config.readyForReviewNotificationsEnabled === undefined
			? DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED
			: normalizeBoolean(config.readyForReviewNotificationsEnabled, DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED);
	const commitPromptTemplate =
		config.commitPromptTemplate === undefined
			? DEFAULT_COMMIT_PROMPT_TEMPLATE
			: normalizePromptTemplate(config.commitPromptTemplate, DEFAULT_COMMIT_PROMPT_TEMPLATE);
	const openPrPromptTemplate =
		config.openPrPromptTemplate === undefined
			? DEFAULT_OPEN_PR_PROMPT_TEMPLATE
			: normalizePromptTemplate(config.openPrPromptTemplate, DEFAULT_OPEN_PR_PROMPT_TEMPLATE);
	const antcodeToken =
		config.antcodeToken === undefined ? (existing?.antcodeToken ?? null) : normalizeStringOrNull(config.antcodeToken);

	const payload: RuntimeGlobalConfigFileShape = {};
	if (hasOwnKey(existing, "selectedAgentId") || selectedAgentId !== DEFAULT_AGENT_ID) {
		payload.selectedAgentId = selectedAgentId;
	} else if (existingSelectedAgentId !== undefined) {
		payload.selectedAgentId = existingSelectedAgentId;
	}
	if (
		hasOwnKey(existing, "selectedAgentInstanceId") ||
		selectedAgentInstanceId !== DEFAULT_SELECTED_AGENT_INSTANCE_ID
	) {
		payload.selectedAgentInstanceId = selectedAgentInstanceId;
	} else if (existingSelectedAgentInstanceId !== null && existingSelectedAgentInstanceId !== undefined) {
		payload.selectedAgentInstanceId = existingSelectedAgentInstanceId;
	}
	if (
		hasOwnKey(existing, "configuredAgents") ||
		!areConfiguredAgentsEqual(configuredAgents, createDefaultConfiguredAgents())
	) {
		payload.configuredAgents = configuredAgents;
	} else if (existingConfiguredAgents !== undefined) {
		payload.configuredAgents = existingConfiguredAgents;
	}
	if (selectedShortcutLabel !== undefined) {
		if (selectedShortcutLabel) {
			payload.selectedShortcutLabel = selectedShortcutLabel;
		}
	} else if (existingSelectedShortcutLabel) {
		payload.selectedShortcutLabel = existingSelectedShortcutLabel;
	}
	if (
		hasOwnKey(existing, "agentAutonomousModeEnabled") ||
		agentAutonomousModeEnabled !== DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED
	) {
		payload.agentAutonomousModeEnabled = agentAutonomousModeEnabled;
	}
	if (
		hasOwnKey(existing, "readyForReviewNotificationsEnabled") ||
		readyForReviewNotificationsEnabled !== DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED
	) {
		payload.readyForReviewNotificationsEnabled = readyForReviewNotificationsEnabled;
	}
	if (hasOwnKey(existing, "commitPromptTemplate") || commitPromptTemplate !== DEFAULT_COMMIT_PROMPT_TEMPLATE) {
		payload.commitPromptTemplate = commitPromptTemplate;
	}
	if (hasOwnKey(existing, "openPrPromptTemplate") || openPrPromptTemplate !== DEFAULT_OPEN_PR_PROMPT_TEMPLATE) {
		payload.openPrPromptTemplate = openPrPromptTemplate;
	}
	if (antcodeToken !== null) {
		payload.antcodeToken = antcodeToken;
	}
	if (hasOwnKey(existing, "autoCrEnabled") || config.autoCrEnabled !== undefined) {
		payload.autoCrEnabled = normalizeBoolean(config.autoCrEnabled, false);
	}
	if (hasOwnKey(existing, "autoCrAgentInstanceIds") || (config.autoCrAgentInstanceIds && config.autoCrAgentInstanceIds.length > 0)) {
		payload.autoCrAgentInstanceIds = config.autoCrAgentInstanceIds ?? existing?.autoCrAgentInstanceIds ?? [];
	}
	if (hasOwnKey(existing, "autoCrScanIntervalMinutes") || config.autoCrScanIntervalMinutes !== undefined) {
		payload.autoCrScanIntervalMinutes = normalizeAutoCrScanIntervalMinutes(config.autoCrScanIntervalMinutes);
	}

	await lockedFileSystem.writeJsonFileAtomic(configPath, payload, {
		lock: null,
	});
}

async function writeRuntimeProjectConfigFile(
	configPath: string | null,
	config: { shortcuts: RuntimeProjectShortcut[] },
): Promise<void> {
	const normalizedShortcuts = normalizeShortcuts(config.shortcuts);
	if (!configPath) {
		if (normalizedShortcuts.length > 0) {
			throw new Error("Cannot save project shortcuts without a selected project.");
		}
		return;
	}
	if (normalizedShortcuts.length === 0) {
		await rm(configPath, { force: true });
		try {
			await rm(dirname(configPath));
		} catch {
			// Ignore missing or non-empty project config directories.
		}
		return;
	}
	await lockedFileSystem.writeJsonFileAtomic(
		configPath,
		{
			shortcuts: normalizedShortcuts,
		} satisfies RuntimeProjectConfigFileShape,
		{
			lock: null,
		},
	);
}

interface RuntimeConfigFiles {
	globalConfigPath: string;
	projectConfigPath: string | null;
	globalConfig: RuntimeGlobalConfigFileShape | null;
	projectConfig: RuntimeProjectConfigFileShape | null;
}

async function readRuntimeConfigFiles(cwd: string | null): Promise<RuntimeConfigFiles> {
	const { globalConfigPath, projectConfigPath } = resolveRuntimeConfigPaths(cwd);
	return {
		globalConfigPath,
		projectConfigPath,
		globalConfig: await readRuntimeConfigFile<RuntimeGlobalConfigFileShape>(globalConfigPath),
		projectConfig: projectConfigPath
			? await readRuntimeConfigFile<RuntimeProjectConfigFileShape>(projectConfigPath)
			: null,
	};
}

async function loadRuntimeConfigLocked(cwd: string | null): Promise<RuntimeConfigState> {
	const configFiles = await readRuntimeConfigFiles(cwd);
	if (configFiles.globalConfig === null) {
		const autoSelectedAgentId = pickBestInstalledAgentId();
		if (autoSelectedAgentId) {
			const normalizedAgentSelection = normalizeRuntimeAgentSelection({
				selectedAgentId: autoSelectedAgentId,
			});
			await writeRuntimeGlobalConfigFile(configFiles.globalConfigPath, {
				selectedAgentId: normalizedAgentSelection.selectedAgentId,
				selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
				configuredAgents: normalizedAgentSelection.configuredAgents,
			});
			configFiles.globalConfig = {
				selectedAgentId: normalizedAgentSelection.selectedAgentId,
				selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
				configuredAgents: normalizedAgentSelection.configuredAgents,
			};
		}
	}
	return toRuntimeConfigState(configFiles);
}

function createRuntimeConfigStateFromValues(input: {
	globalConfigPath: string;
	projectConfigPath: string | null;
	selectedAgentId: RuntimeAgentId;
	selectedAgentInstanceId?: string;
	configuredAgents?: RuntimeConfiguredAgent[];
	selectedShortcutLabel: string | null;
	agentAutonomousModeEnabled: boolean;
	readyForReviewNotificationsEnabled: boolean;
	shortcuts: RuntimeProjectShortcut[];
	commitPromptTemplate: string;
	openPrPromptTemplate: string;
	antcodeToken?: string | null;
	autoCrEnabled?: boolean;
	autoCrAgentInstanceIds?: string[];
	autoCrScanIntervalMinutes?: number;
}): RuntimeConfigState {
	const normalizedAgentSelection = normalizeRuntimeAgentSelection({
		selectedAgentId: input.selectedAgentId,
		selectedAgentInstanceId: input.selectedAgentInstanceId,
		configuredAgents: input.configuredAgents,
	});
	return {
		globalConfigPath: input.globalConfigPath,
		projectConfigPath: input.projectConfigPath,
		selectedAgentId: normalizedAgentSelection.selectedAgentId,
		selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
		configuredAgents: normalizedAgentSelection.configuredAgents,
		selectedShortcutLabel: normalizeShortcutLabel(input.selectedShortcutLabel),
		agentAutonomousModeEnabled: normalizeBoolean(
			input.agentAutonomousModeEnabled,
			DEFAULT_AGENT_AUTONOMOUS_MODE_ENABLED,
		),
		readyForReviewNotificationsEnabled: normalizeBoolean(
			input.readyForReviewNotificationsEnabled,
			DEFAULT_READY_FOR_REVIEW_NOTIFICATIONS_ENABLED,
		),
		shortcuts: normalizeShortcuts(input.shortcuts),
		commitPromptTemplate: normalizePromptTemplate(input.commitPromptTemplate, DEFAULT_COMMIT_PROMPT_TEMPLATE),
		openPrPromptTemplate: normalizePromptTemplate(input.openPrPromptTemplate, DEFAULT_OPEN_PR_PROMPT_TEMPLATE),
		commitPromptTemplateDefault: DEFAULT_COMMIT_PROMPT_TEMPLATE,
		openPrPromptTemplateDefault: DEFAULT_OPEN_PR_PROMPT_TEMPLATE,
		antcodeToken: normalizeStringOrNull(input.antcodeToken),
		autoCrEnabled: normalizeBoolean(input.autoCrEnabled, false),
		autoCrAgentInstanceIds: normalizeAutoCrAgentInstanceIds(
			input.autoCrAgentInstanceIds,
			normalizedAgentSelection.configuredAgents,
		),
		autoCrScanIntervalMinutes: normalizeAutoCrScanIntervalMinutes(input.autoCrScanIntervalMinutes),
	};
}

export function toGlobalRuntimeConfigState(current: RuntimeConfigState): RuntimeConfigState {
	return createRuntimeConfigStateFromValues({
		globalConfigPath: current.globalConfigPath,
		projectConfigPath: null,
		selectedAgentId: current.selectedAgentId,
		selectedAgentInstanceId: current.selectedAgentInstanceId,
		configuredAgents: current.configuredAgents,
		selectedShortcutLabel: current.selectedShortcutLabel,
		agentAutonomousModeEnabled: current.agentAutonomousModeEnabled,
		readyForReviewNotificationsEnabled: current.readyForReviewNotificationsEnabled,
		shortcuts: [],
		commitPromptTemplate: current.commitPromptTemplate,
		openPrPromptTemplate: current.openPrPromptTemplate,
		antcodeToken: current.antcodeToken,
		autoCrEnabled: current.autoCrEnabled,
		autoCrAgentInstanceIds: current.autoCrAgentInstanceIds,
		autoCrScanIntervalMinutes: current.autoCrScanIntervalMinutes,
	});
}

export async function loadRuntimeConfig(cwd: string): Promise<RuntimeConfigState> {
	const configFiles = await readRuntimeConfigFiles(cwd);
	if (configFiles.globalConfig !== null) {
		return toRuntimeConfigState(configFiles);
	}
	return await lockedFileSystem.withLocks(
		getRuntimeConfigLockRequests(cwd),
		async () => await loadRuntimeConfigLocked(cwd),
	);
}

export async function loadGlobalRuntimeConfig(): Promise<RuntimeConfigState> {
	const configFiles = await readRuntimeConfigFiles(null);
	if (configFiles.globalConfig !== null) {
		return toRuntimeConfigState(configFiles);
	}
	return await lockedFileSystem.withLocks(
		getRuntimeConfigLockRequests(null),
		async () => await loadRuntimeConfigLocked(null),
	);
}

export async function saveRuntimeConfig(
	cwd: string,
	config: {
		selectedAgentId: RuntimeAgentId;
		selectedAgentInstanceId?: string;
		configuredAgents?: RuntimeConfiguredAgent[];
		selectedShortcutLabel: string | null;
		agentAutonomousModeEnabled: boolean;
		readyForReviewNotificationsEnabled: boolean;
		shortcuts: RuntimeProjectShortcut[];
		commitPromptTemplate: string;
		openPrPromptTemplate: string;
		autoCrEnabled?: boolean;
		autoCrAgentInstanceIds?: string[];
		autoCrScanIntervalMinutes?: number;
	},
): Promise<RuntimeConfigState> {
	const { globalConfigPath, projectConfigPath } = resolveRuntimeConfigPaths(cwd);
	return await lockedFileSystem.withLocks(getRuntimeConfigLockRequests(cwd), async () => {
		const normalizedAgentSelection = normalizeRuntimeAgentSelection({
			selectedAgentId: config.selectedAgentId,
			selectedAgentInstanceId: config.selectedAgentInstanceId,
			configuredAgents: config.configuredAgents,
		});
		await writeRuntimeGlobalConfigFile(globalConfigPath, {
			selectedAgentId: normalizedAgentSelection.selectedAgentId,
			selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
			configuredAgents: normalizedAgentSelection.configuredAgents,
			selectedShortcutLabel: config.selectedShortcutLabel,
			agentAutonomousModeEnabled: config.agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled: config.readyForReviewNotificationsEnabled,
			commitPromptTemplate: config.commitPromptTemplate,
			openPrPromptTemplate: config.openPrPromptTemplate,
			autoCrEnabled: config.autoCrEnabled,
			autoCrAgentInstanceIds: config.autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes: config.autoCrScanIntervalMinutes,
		});
		await writeRuntimeProjectConfigFile(projectConfigPath, { shortcuts: config.shortcuts });
		return createRuntimeConfigStateFromValues({
			globalConfigPath,
			projectConfigPath,
			selectedAgentId: normalizedAgentSelection.selectedAgentId,
			selectedAgentInstanceId: normalizedAgentSelection.selectedAgentInstanceId,
			configuredAgents: normalizedAgentSelection.configuredAgents,
			selectedShortcutLabel: config.selectedShortcutLabel,
			agentAutonomousModeEnabled: config.agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled: config.readyForReviewNotificationsEnabled,
			shortcuts: config.shortcuts,
			commitPromptTemplate: config.commitPromptTemplate,
			openPrPromptTemplate: config.openPrPromptTemplate,
			autoCrEnabled: config.autoCrEnabled,
			autoCrAgentInstanceIds: config.autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes: config.autoCrScanIntervalMinutes,
		});
	});
}

export async function updateRuntimeConfig(cwd: string, updates: RuntimeConfigUpdateInput): Promise<RuntimeConfigState> {
	const { globalConfigPath, projectConfigPath } = resolveRuntimeConfigPaths(cwd);
	return await lockedFileSystem.withLocks(getRuntimeConfigLockRequests(cwd), async () => {
		const current = await loadRuntimeConfigLocked(cwd);
		if (projectConfigPath === null && normalizeShortcuts(updates.shortcuts).length > 0) {
			throw new Error("Cannot save project shortcuts without a selected project.");
		}
		const nextAgentSelection = normalizeRuntimeAgentSelection({
			selectedAgentId: updates.selectedAgentId ?? current.selectedAgentId,
			selectedAgentInstanceId:
				updates.selectedAgentInstanceId !== undefined
					? updates.selectedAgentInstanceId
					: updates.selectedAgentId !== undefined
						? null
						: current.selectedAgentInstanceId,
			configuredAgents: updates.configuredAgents ?? current.configuredAgents,
		});
		const nextConfig = {
			selectedAgentId: nextAgentSelection.selectedAgentId,
			selectedAgentInstanceId: nextAgentSelection.selectedAgentInstanceId,
			configuredAgents: nextAgentSelection.configuredAgents,
			selectedShortcutLabel:
				updates.selectedShortcutLabel === undefined ? current.selectedShortcutLabel : updates.selectedShortcutLabel,
			agentAutonomousModeEnabled: updates.agentAutonomousModeEnabled ?? current.agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled:
				updates.readyForReviewNotificationsEnabled ?? current.readyForReviewNotificationsEnabled,
			shortcuts: projectConfigPath ? (updates.shortcuts ?? current.shortcuts) : current.shortcuts,
			commitPromptTemplate: updates.commitPromptTemplate ?? current.commitPromptTemplate,
			openPrPromptTemplate: updates.openPrPromptTemplate ?? current.openPrPromptTemplate,
			antcodeToken: updates.antcodeToken !== undefined ? updates.antcodeToken : current.antcodeToken,
			autoCrEnabled: updates.autoCrEnabled ?? current.autoCrEnabled,
			autoCrAgentInstanceIds: updates.autoCrAgentInstanceIds ?? current.autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes: updates.autoCrScanIntervalMinutes ?? current.autoCrScanIntervalMinutes,
		};

		const hasChanges =
			nextConfig.selectedAgentId !== current.selectedAgentId ||
			nextConfig.selectedAgentInstanceId !== current.selectedAgentInstanceId ||
			!areConfiguredAgentsEqual(nextConfig.configuredAgents, current.configuredAgents) ||
			nextConfig.selectedShortcutLabel !== current.selectedShortcutLabel ||
			nextConfig.agentAutonomousModeEnabled !== current.agentAutonomousModeEnabled ||
			nextConfig.readyForReviewNotificationsEnabled !== current.readyForReviewNotificationsEnabled ||
			nextConfig.commitPromptTemplate !== current.commitPromptTemplate ||
			nextConfig.openPrPromptTemplate !== current.openPrPromptTemplate ||
			nextConfig.antcodeToken !== current.antcodeToken ||
			nextConfig.autoCrEnabled !== current.autoCrEnabled ||
			JSON.stringify(nextConfig.autoCrAgentInstanceIds) !== JSON.stringify(current.autoCrAgentInstanceIds) ||
			nextConfig.autoCrScanIntervalMinutes !== current.autoCrScanIntervalMinutes ||
			!areRuntimeProjectShortcutsEqual(nextConfig.shortcuts, current.shortcuts);

		if (!hasChanges) {
			return current;
		}

		await writeRuntimeGlobalConfigFile(globalConfigPath, {
			selectedAgentId: nextConfig.selectedAgentId,
			selectedAgentInstanceId: nextConfig.selectedAgentInstanceId,
			configuredAgents: nextConfig.configuredAgents,
			selectedShortcutLabel: nextConfig.selectedShortcutLabel,
			agentAutonomousModeEnabled: nextConfig.agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled: nextConfig.readyForReviewNotificationsEnabled,
			commitPromptTemplate: nextConfig.commitPromptTemplate,
			openPrPromptTemplate: nextConfig.openPrPromptTemplate,
			antcodeToken: nextConfig.antcodeToken,
			autoCrEnabled: nextConfig.autoCrEnabled,
			autoCrAgentInstanceIds: nextConfig.autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes: nextConfig.autoCrScanIntervalMinutes,
		});
		await writeRuntimeProjectConfigFile(projectConfigPath, {
			shortcuts: nextConfig.shortcuts,
		});
		return createRuntimeConfigStateFromValues({
			globalConfigPath,
			projectConfigPath,
			selectedAgentId: nextConfig.selectedAgentId,
			selectedAgentInstanceId: nextConfig.selectedAgentInstanceId,
			configuredAgents: nextConfig.configuredAgents,
			selectedShortcutLabel: nextConfig.selectedShortcutLabel,
			agentAutonomousModeEnabled: nextConfig.agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled: nextConfig.readyForReviewNotificationsEnabled,
			shortcuts: nextConfig.shortcuts,
			commitPromptTemplate: nextConfig.commitPromptTemplate,
			openPrPromptTemplate: nextConfig.openPrPromptTemplate,
			antcodeToken: nextConfig.antcodeToken,
			autoCrEnabled: nextConfig.autoCrEnabled,
			autoCrAgentInstanceIds: nextConfig.autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes: nextConfig.autoCrScanIntervalMinutes,
		});
	});
}

export async function updateGlobalRuntimeConfig(
	current: RuntimeConfigState,
	updates: RuntimeConfigUpdateInput,
): Promise<RuntimeConfigState> {
	const globalConfigPath = getRuntimeGlobalConfigPath();
	return await lockedFileSystem.withLocks(
		[
			{
				path: globalConfigPath,
				type: "file",
			},
		],
		async () => {
			const nextAgentSelection = normalizeRuntimeAgentSelection({
				selectedAgentId: updates.selectedAgentId ?? current.selectedAgentId,
				selectedAgentInstanceId:
					updates.selectedAgentInstanceId !== undefined
						? updates.selectedAgentInstanceId
						: updates.selectedAgentId !== undefined
							? null
							: current.selectedAgentInstanceId,
				configuredAgents: updates.configuredAgents ?? current.configuredAgents,
			});
			const nextConfig = {
				selectedAgentId: nextAgentSelection.selectedAgentId,
				selectedAgentInstanceId: nextAgentSelection.selectedAgentInstanceId,
				configuredAgents: nextAgentSelection.configuredAgents,
				selectedShortcutLabel:
					updates.selectedShortcutLabel === undefined
						? current.selectedShortcutLabel
						: updates.selectedShortcutLabel,
				agentAutonomousModeEnabled: updates.agentAutonomousModeEnabled ?? current.agentAutonomousModeEnabled,
				readyForReviewNotificationsEnabled:
					updates.readyForReviewNotificationsEnabled ?? current.readyForReviewNotificationsEnabled,
				shortcuts: current.shortcuts,
				commitPromptTemplate: updates.commitPromptTemplate ?? current.commitPromptTemplate,
				openPrPromptTemplate: updates.openPrPromptTemplate ?? current.openPrPromptTemplate,
				antcodeToken: updates.antcodeToken !== undefined ? updates.antcodeToken : current.antcodeToken,
				autoCrEnabled: updates.autoCrEnabled ?? current.autoCrEnabled,
				autoCrAgentInstanceIds: updates.autoCrAgentInstanceIds ?? current.autoCrAgentInstanceIds,
				autoCrScanIntervalMinutes: updates.autoCrScanIntervalMinutes ?? current.autoCrScanIntervalMinutes,
			};

			const hasChanges =
				nextConfig.selectedAgentId !== current.selectedAgentId ||
				nextConfig.selectedAgentInstanceId !== current.selectedAgentInstanceId ||
				!areConfiguredAgentsEqual(nextConfig.configuredAgents, current.configuredAgents) ||
				nextConfig.selectedShortcutLabel !== current.selectedShortcutLabel ||
				nextConfig.agentAutonomousModeEnabled !== current.agentAutonomousModeEnabled ||
				nextConfig.readyForReviewNotificationsEnabled !== current.readyForReviewNotificationsEnabled ||
				nextConfig.commitPromptTemplate !== current.commitPromptTemplate ||
				nextConfig.openPrPromptTemplate !== current.openPrPromptTemplate ||
				nextConfig.antcodeToken !== current.antcodeToken ||
				nextConfig.autoCrEnabled !== current.autoCrEnabled ||
				JSON.stringify(nextConfig.autoCrAgentInstanceIds) !== JSON.stringify(current.autoCrAgentInstanceIds) ||
				nextConfig.autoCrScanIntervalMinutes !== current.autoCrScanIntervalMinutes;

			if (!hasChanges) {
				return current;
			}

			await writeRuntimeGlobalConfigFile(globalConfigPath, {
				selectedAgentId: nextConfig.selectedAgentId,
				selectedAgentInstanceId: nextConfig.selectedAgentInstanceId,
				configuredAgents: nextConfig.configuredAgents,
				selectedShortcutLabel: nextConfig.selectedShortcutLabel,
				agentAutonomousModeEnabled: nextConfig.agentAutonomousModeEnabled,
				readyForReviewNotificationsEnabled: nextConfig.readyForReviewNotificationsEnabled,
				commitPromptTemplate: nextConfig.commitPromptTemplate,
				openPrPromptTemplate: nextConfig.openPrPromptTemplate,
				antcodeToken: nextConfig.antcodeToken,
				autoCrEnabled: nextConfig.autoCrEnabled,
				autoCrAgentInstanceIds: nextConfig.autoCrAgentInstanceIds,
				autoCrScanIntervalMinutes: nextConfig.autoCrScanIntervalMinutes,
			});

			return createRuntimeConfigStateFromValues({
				globalConfigPath,
				projectConfigPath: current.projectConfigPath,
				selectedAgentId: nextConfig.selectedAgentId,
				selectedAgentInstanceId: nextConfig.selectedAgentInstanceId,
				configuredAgents: nextConfig.configuredAgents,
				selectedShortcutLabel: nextConfig.selectedShortcutLabel,
				agentAutonomousModeEnabled: nextConfig.agentAutonomousModeEnabled,
				readyForReviewNotificationsEnabled: nextConfig.readyForReviewNotificationsEnabled,
				shortcuts: nextConfig.shortcuts,
				commitPromptTemplate: nextConfig.commitPromptTemplate,
				openPrPromptTemplate: nextConfig.openPrPromptTemplate,
				antcodeToken: nextConfig.antcodeToken,
				autoCrEnabled: nextConfig.autoCrEnabled,
				autoCrAgentInstanceIds: nextConfig.autoCrAgentInstanceIds,
				autoCrScanIntervalMinutes: nextConfig.autoCrScanIntervalMinutes,
			});
		},
	);
}
