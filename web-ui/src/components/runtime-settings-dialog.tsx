// Settings dialog composition for Kanban.
// Generic app settings live here, while Cline-specific provider state and
// side effects should stay in use-runtime-settings-cline-controller.ts.
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixPopover from "@radix-ui/react-popover";
import * as RadixSelect from "@radix-ui/react-select";
import * as RadixSwitch from "@radix-ui/react-switch";
import { getRuntimeAgentCatalogEntry, getRuntimeLaunchSupportedAgentCatalog } from "@runtime-agent-catalog";
import { getConfiguredAgentCommandIssue, parseConfiguredAgentCommand } from "@runtime-agent-command";
import { areRuntimeProjectShortcutsEqual } from "@runtime-shortcuts";
import {
	Bell,
	Bot,
	Check,
	ChevronDown,
	Circle,
	CircleDot,
	ExternalLink,
	FolderOpen,
	GitBranch,
	GitCommit,
	Key,
	Palette,
	Pencil,
	Plus,
	ScanSearch,
	Settings,
	Shield,
	SlidersHorizontal,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountOrganizationSection } from "@/components/shared/account-organization-section";
import { ClineSetupSection } from "@/components/shared/cline-setup-section";
import {
	getRuntimeShortcutIconComponent,
	getRuntimeShortcutPickerOption,
	RUNTIME_SHORTCUT_ICON_OPTIONS,
	type RuntimeShortcutIconOption,
	type RuntimeShortcutPickerIconId,
} from "@/components/shared/runtime-shortcut-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { TASK_GIT_BASE_REF_PROMPT_VARIABLE, type TaskGitAction } from "@/git-actions/build-task-git-action-prompt";
import { useRuntimeSettingsClineController } from "@/hooks/use-runtime-settings-cline-controller";
import { useRuntimeSettingsClineMcpController } from "@/hooks/use-runtime-settings-cline-mcp-controller";
import { previewThemeId, readStoredThemeId, saveThemeId, THEME_GROUPS, THEMES, type ThemeId } from "@/hooks/use-theme";
import { useLayoutCustomizations } from "@/resize/layout-customizations";
import { openFileOnHost } from "@/runtime/runtime-config-query";
import type {
	RuntimeAgentId,
	RuntimeClineMcpServerAuthStatus,
	RuntimeConfigResponse,
	RuntimeConfiguredAgent,
	RuntimeProjectShortcut,
} from "@/runtime/types";
import { useRuntimeConfig } from "@/runtime/use-runtime-config";
import {
	type BrowserNotificationPermission,
	getBrowserNotificationPermission,
	requestBrowserNotificationPermission,
} from "@/utils/notification-permission";
import { formatPathForDisplay } from "@/utils/path-display";
import { useUnmount, useWindowEvent } from "@/utils/react-use";

interface RuntimeSettingsAgentRowModel {
	id: string;
	type: RuntimeAgentId;
	label: string;
	defaultLabel: string;
	alias: string | null;
	binary: string;
	command: string;
	installed: boolean | null;
	configured: boolean;
}

interface AgentEditorState {
	id: string | null;
	type: RuntimeConfiguredAgent["type"];
	alias: string;
	command: string;
}

function quoteCommandPartForDisplay(part: string): string {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(part)) {
		return part;
	}
	return JSON.stringify(part);
}

function buildDisplayedAgentCommand(agentId: RuntimeAgentId, binary: string, autonomousModeEnabled: boolean): string {
	if (agentId === "cline") {
		return "";
	}
	const entry = getRuntimeAgentCatalogEntry(agentId);
	const baseArgs = entry?.baseArgs ?? [];
	const autonomousArgs = autonomousModeEnabled ? (entry?.autonomousArgs ?? []) : [];
	return [binary, ...baseArgs, ...autonomousArgs].map(quoteCommandPartForDisplay).join(" ");
}

function buildDefaultAgentCommand(agentId: RuntimeAgentId): string {
	const entry = getRuntimeAgentCatalogEntry(agentId);
	if (!entry) {
		return agentId;
	}
	return [entry.binary, ...(entry.baseArgs ?? [])].join(" ").trim();
}

function areConfiguredAgentsEqual(left: RuntimeConfiguredAgent[], right: RuntimeConfiguredAgent[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	return left.every((agent, index) => {
		const candidate = right[index];
		return (
			candidate !== undefined &&
			agent.id === candidate.id &&
			agent.type === candidate.type &&
			agent.alias === candidate.alias &&
			agent.command === candidate.command
		);
	});
}

function getSelectedAgentType(agents: RuntimeConfiguredAgent[], selectedAgentInstanceId: string): RuntimeAgentId {
	return agents.find((agent) => agent.id === selectedAgentInstanceId)?.type ?? "cline";
}

function resolveDisplayedAgentInstalled(options: {
	command: string;
	savedCommand?: string;
	savedInstalled?: boolean;
	detectedCommands: ReadonlySet<string>;
}): boolean | null {
	const parsedCommand = parseConfiguredAgentCommand(options.command);
	if (!parsedCommand.ok) {
		return false;
	}
	if (options.savedCommand === options.command && options.savedInstalled !== undefined) {
		return options.savedInstalled;
	}
	return options.detectedCommands.has(parsedCommand.value.binary);
}

function createAgentEditorState(type: RuntimeConfiguredAgent["type"]): AgentEditorState {
	return {
		id: null,
		type,
		alias: "",
		command: buildDefaultAgentCommand(type),
	};
}

function normalizeTemplateForComparison(value: string): string {
	return value.replaceAll("\r\n", "\n").trim();
}

const GIT_PROMPT_VARIANT_OPTIONS: Array<{ value: TaskGitAction; label: string }> = [
	{ value: "commit", label: "Commit" },
	{ value: "pr", label: "Make PR" },
];

export type RuntimeSettingsSection = "shortcuts";

const SETTINGS_AGENT_ORDER: readonly RuntimeAgentId[] = [
	"cline",
	"claude",
	"antcc",
	"codex",
	"droid",
	"kiro",
	"kimi",
	"kimi-code",
];

type SettingsNavId =
	| "general"
	| "cline"
	| "git-prompts"
	| "notifications"
	| "antcode"
	| "auto-cr"
	| "appearance"
	| "project"
	| "remote";

const SETTINGS_NAV_ITEMS: ReadonlyArray<{
	id: SettingsNavId;
	label: string;
	icon: React.ReactNode;
	clineOnly?: boolean;
}> = [
	{ id: "general", label: "General", icon: <SlidersHorizontal size={16} /> },
	{ id: "cline", label: "Cline", icon: <Bot size={16} />, clineOnly: true },
	{ id: "git-prompts", label: "Git Prompts", icon: <GitCommit size={16} /> },
	{ id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
	{ id: "antcode", label: "Antcode", icon: <GitBranch size={16} /> },
	{ id: "auto-cr", label: "Auto CR", icon: <ScanSearch size={16} /> },
	{ id: "remote", label: "Remote Access", icon: <Shield size={16} /> },
	{ id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
	{ id: "project", label: "Project", icon: <FolderOpen size={16} /> },
];

function getShortcutIconOption(icon: string | undefined): RuntimeShortcutIconOption {
	return getRuntimeShortcutPickerOption(icon);
}

function ShortcutIconComponent({ icon, size = 14 }: { icon: string | undefined; size?: number }): React.ReactElement {
	const Component = getRuntimeShortcutIconComponent(icon);
	return <Component size={size} />;
}

function formatNotificationPermissionStatus(permission: BrowserNotificationPermission): string {
	if (permission === "default") {
		return "not requested yet";
	}
	return permission;
}

function getNextShortcutLabel(shortcuts: RuntimeProjectShortcut[], baseLabel: string): string {
	const normalizedTakenLabels = new Set(
		shortcuts.map((shortcut) => shortcut.label.trim().toLowerCase()).filter((label) => label.length > 0),
	);
	const normalizedBaseLabel = baseLabel.trim().toLowerCase();
	if (!normalizedTakenLabels.has(normalizedBaseLabel)) {
		return baseLabel;
	}

	let suffix = 2;
	while (normalizedTakenLabels.has(`${normalizedBaseLabel} ${suffix}`)) {
		suffix += 1;
	}
	return `${baseLabel} ${suffix}`;
}

function AgentRow({
	agent,
	isSelected,
	onSelect,
	onEdit,
	onDelete,
	deleteDisabled,
	disabled,
}: {
	agent: RuntimeSettingsAgentRowModel;
	isSelected: boolean;
	onSelect: () => void;
	onEdit: () => void;
	onDelete: () => void;
	deleteDisabled: boolean;
	disabled: boolean;
}): React.ReactElement {
	const installUrl = getRuntimeAgentCatalogEntry(agent.type)?.installUrl;
	const isNativeCline = agent.type === "cline";
	const isInstalled = agent.installed === true;
	const isInstallStatusPending = !isNativeCline && agent.installed === null;

	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2">
			<div className="flex items-start gap-2 min-w-0">
				<button
					type="button"
					aria-label={`Select ${agent.label}`}
					onClick={onSelect}
					disabled={disabled || !isInstalled}
					className="mt-0.5 shrink-0 disabled:cursor-default"
				>
					{isSelected ? (
						<CircleDot size={16} className="text-accent shrink-0" />
					) : (
						<Circle
							size={16}
							className={cn("shrink-0", !isInstalled ? "text-text-tertiary" : "text-text-secondary")}
						/>
					)}
				</button>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="text-[13px] text-text-primary">{agent.label}</span>
						{agent.alias ? <span className="text-xs text-text-secondary">{agent.defaultLabel}</span> : null}
						{!isNativeCline && isInstalled ? (
							<span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-status-green/10 text-status-green">
								Installed
							</span>
						) : isInstallStatusPending ? (
							<span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-3 text-text-secondary">
								Checking...
							</span>
						) : null}
					</div>
					{agent.command ? (
						<p className="mt-1 rounded-md bg-surface-1 px-2 py-1.5 font-mono text-xs leading-5 text-text-secondary break-all whitespace-pre-wrap">
							{agent.command}
						</p>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2 self-start">
				{!isNativeCline && agent.installed === false && installUrl ? (
					<a
						href={installUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center justify-center rounded-md font-medium duration-150 cursor-default select-none h-7 px-2 text-xs bg-surface-2 border border-border text-text-primary hover:bg-surface-3 hover:border-border-bright"
					>
						Install
					</a>
				) : null}
				<Button size="sm" variant="ghost" icon={<Pencil size={14} />} disabled={disabled} onClick={onEdit}>
					Edit
				</Button>
				<Button
					size="sm"
					variant="ghost"
					icon={<Trash2 size={14} />}
					aria-label={`Delete ${agent.label}`}
					disabled={disabled || deleteDisabled}
					onClick={onDelete}
				>
					Delete
				</Button>
			</div>
		</div>
	);
}

function InlineUtilityButton({
	text,
	onClick,
	disabled,
	monospace,
	widthCh,
}: {
	text: string;
	onClick: () => void;
	disabled?: boolean;
	monospace?: boolean;
	widthCh?: number;
}): React.ReactElement {
	return (
		<Button
			size="sm"
			disabled={disabled}
			onClick={onClick}
			className={cn(monospace && "font-mono")}
			style={{
				fontSize: 10,
				verticalAlign: "middle",
				...(typeof widthCh === "number"
					? {
							width: `${widthCh}ch`,
							justifyContent: "center",
						}
					: {}),
			}}
		>
			{text}
		</Button>
	);
}

function ShortcutIconPicker({
	value,
	onSelect,
}: {
	value: string | undefined;
	onSelect: (icon: RuntimeShortcutPickerIconId) => void;
}): React.ReactElement {
	const [open, setOpen] = useState(false);
	const selectedOption = getShortcutIconOption(value);

	return (
		<RadixPopover.Root open={open} onOpenChange={setOpen}>
			<RadixPopover.Trigger asChild>
				<button
					type="button"
					aria-label={`Shortcut icon: ${selectedOption.label}`}
					className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md border border-border bg-surface-2 text-text-primary hover:bg-surface-3"
				>
					<ShortcutIconComponent icon={value} size={14} />
					<ChevronDown size={12} />
				</button>
			</RadixPopover.Trigger>
			<RadixPopover.Portal>
				<RadixPopover.Content
					side="bottom"
					align="start"
					sideOffset={4}
					className="z-50 rounded-md border border-border bg-surface-2 p-1 shadow-lg"
					style={{ animation: "kb-tooltip-show 100ms ease" }}
				>
					<div className="flex gap-0.5">
						{RUNTIME_SHORTCUT_ICON_OPTIONS.map((option) => {
							const IconComponent = getRuntimeShortcutIconComponent(option.value);
							return (
								<button
									key={option.value}
									type="button"
									aria-label={option.label}
									className={cn(
										"p-1.5 rounded hover:bg-surface-3",
										selectedOption.value === option.value && "bg-surface-3",
									)}
									onClick={() => {
										onSelect(option.value);
										setOpen(false);
									}}
								>
									<IconComponent size={14} />
								</button>
							);
						})}
					</div>
				</RadixPopover.Content>
			</RadixPopover.Portal>
		</RadixPopover.Root>
	);
}

function SettingsNav({
	items,
	activeId,
	onSelect,
}: {
	items: ReadonlyArray<{ id: SettingsNavId; label: string; icon: React.ReactNode }>;
	activeId: SettingsNavId;
	onSelect: (id: SettingsNavId) => void;
}): React.ReactElement {
	return (
		<nav className="hidden md:flex w-[180px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-3 overflow-y-auto">
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => onSelect(item.id)}
					className={cn(
						"flex items-center gap-2.5 text-left px-3 py-2 rounded-md text-[13px] font-medium cursor-pointer",
						activeId === item.id
							? "bg-surface-3 text-text-primary"
							: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
					)}
				>
					<span className="shrink-0 opacity-80">{item.icon}</span>
					<span>{item.label}</span>
				</button>
			))}
		</nav>
	);
}

export function RuntimeSettingsDialog({
	open,
	workspaceId,
	initialConfig = null,
	liveMcpAuthStatuses = null,
	onOpenChange,
	onSaved,
	onAccountSwitched,
	initialSection,
}: {
	open: boolean;
	workspaceId: string | null;
	initialConfig?: RuntimeConfigResponse | null;
	liveMcpAuthStatuses?: RuntimeClineMcpServerAuthStatus[] | null;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
	onAccountSwitched?: () => void;
	initialSection?: RuntimeSettingsSection | null;
}): React.ReactElement {
	const { config, isLoading, isSaving, save, refresh } = useRuntimeConfig(open, workspaceId, initialConfig);
	const { resetLayoutCustomizations } = useLayoutCustomizations();
	const [configuredAgents, setConfiguredAgents] = useState<RuntimeConfiguredAgent[]>([]);
	const [selectedAgentInstanceId, setSelectedAgentInstanceId] = useState("");
	const [agentEditor, setAgentEditor] = useState<AgentEditorState | null>(null);
	const [agentAutonomousModeEnabled, setAgentAutonomousModeEnabled] = useState(true);
	const [readyForReviewNotificationsEnabled, setReadyForReviewNotificationsEnabled] = useState(true);
	const [initialThemeId, setInitialThemeId] = useState<ThemeId>(readStoredThemeId);
	const [draftThemeId, setDraftThemeId] = useState<ThemeId>(readStoredThemeId);
	const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>("unsupported");
	const [shortcuts, setShortcuts] = useState<RuntimeProjectShortcut[]>([]);
	const [commitPromptTemplate, setCommitPromptTemplate] = useState("");
	const [openPrPromptTemplate, setOpenPrPromptTemplate] = useState("");
	const [antcodeToken, setAntcodeToken] = useState("");
	const [autoCrEnabled, setAutoCrEnabled] = useState(false);
	const [autoCrAgentInstanceIds, setAutoCrAgentInstanceIds] = useState<string[]>([]);
	const [autoCrScanIntervalMinutes, setAutoCrScanIntervalMinutes] = useState(45);
	const [remotePasscodeEnabled, setRemotePasscodeEnabled] = useState(false);
	const [remotePasscode, setRemotePasscode] = useState<string | null>(null);
	const [isLoadingPasscode, setIsLoadingPasscode] = useState(false);
	const [selectedPromptVariant, setSelectedPromptVariant] = useState<TaskGitAction>("commit");
	const [copiedVariableToken, setCopiedVariableToken] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [pendingShortcutScrollIndex, setPendingShortcutScrollIndex] = useState<number | null>(null);
	const copiedVariableResetTimerRef = useRef<number | null>(null);
	const shortcutsSectionRef = useRef<HTMLHeadingElement | null>(null);
	const shortcutRowRefs = useRef<Array<HTMLDivElement | null>>([]);
	const bodyRef = useRef<HTMLDivElement>(null);
	const isScrollingProgrammatically = useRef(false);
	const [activeSection, setActiveSection] = useState<SettingsNavId>("general");
	const controlsDisabled = isLoading || isSaving || config === null;
	const commitPromptTemplateDefault = config?.commitPromptTemplateDefault ?? "";
	const openPrPromptTemplateDefault = config?.openPrPromptTemplateDefault ?? "";
	const isCommitPromptAtDefault =
		normalizeTemplateForComparison(commitPromptTemplate) ===
		normalizeTemplateForComparison(commitPromptTemplateDefault);
	const isOpenPrPromptAtDefault =
		normalizeTemplateForComparison(openPrPromptTemplate) ===
		normalizeTemplateForComparison(openPrPromptTemplateDefault);
	const selectedPromptValue = selectedPromptVariant === "commit" ? commitPromptTemplate : openPrPromptTemplate;
	const selectedPromptDefaultValue =
		selectedPromptVariant === "commit" ? commitPromptTemplateDefault : openPrPromptTemplateDefault;
	const isSelectedPromptAtDefault =
		selectedPromptVariant === "commit" ? isCommitPromptAtDefault : isOpenPrPromptAtDefault;
	const selectedPromptPlaceholder =
		selectedPromptVariant === "commit" ? "Commit prompt template" : "PR prompt template";
	const bypassPermissionsCheckboxId = "runtime-settings-bypass-permissions";
	const selectedAgentId = useMemo(
		() => getSelectedAgentType(configuredAgents, selectedAgentInstanceId),
		[configuredAgents, selectedAgentInstanceId],
	);
	const refreshNotificationPermission = useCallback(() => {
		setNotificationPermission(getBrowserNotificationPermission());
	}, []);

	const supportedAgents = useMemo<RuntimeSettingsAgentRowModel[]>(() => {
		const definitionById = new Map((config?.agents ?? []).map((agent) => [agent.id, agent] as const));
		const orderIndexByAgentId = new Map(SETTINGS_AGENT_ORDER.map((agentId, index) => [agentId, index] as const));
		const detectedCommands = new Set(config?.detectedCommands ?? []);
		const orderedAgents = [...configuredAgents].sort((left, right) => {
			const leftOrderIndex = orderIndexByAgentId.get(left.type) ?? Number.MAX_SAFE_INTEGER;
			const rightOrderIndex = orderIndexByAgentId.get(right.type) ?? Number.MAX_SAFE_INTEGER;
			return leftOrderIndex - rightOrderIndex;
		});
		return orderedAgents.map((agent) => {
			const definition = definitionById.get(agent.id);
			const catalogEntry = getRuntimeAgentCatalogEntry(agent.type);
			const parsedCommand = parseConfiguredAgentCommand(agent.command);
			return {
				id: agent.id,
				type: agent.type,
				label: definition?.label ?? agent.alias ?? catalogEntry?.label ?? agent.type,
				defaultLabel: definition?.defaultLabel ?? catalogEntry?.label ?? agent.type,
				alias: agent.alias,
				binary:
					definition?.binary ??
					(parsedCommand.ok ? parsedCommand.value.binary : (catalogEntry?.binary ?? agent.type)),
				command: agent.command,
				installed: resolveDisplayedAgentInstalled({
					command: agent.command,
					savedCommand: definition?.command,
					savedInstalled: definition?.installed,
					detectedCommands,
				}),
				configured: agent.id === selectedAgentInstanceId,
			};
		});
	}, [config?.agents, configuredAgents, selectedAgentInstanceId]);
	const displayedAgents = useMemo(() => supportedAgents, [supportedAgents]);
	const navItems = useMemo(
		() => SETTINGS_NAV_ITEMS.filter((item) => !item.clineOnly || selectedAgentId === "cline"),
		[selectedAgentId],
	);
	const initialConfiguredAgents = config?.configuredAgents ?? [];
	const initialSelectedAgentInstanceId = config?.selectedAgentInstanceId ?? initialConfiguredAgents[0]?.id ?? "cline";
	const initialAgentAutonomousModeEnabled = config?.agentAutonomousModeEnabled ?? true;
	const initialReadyForReviewNotificationsEnabled = config?.readyForReviewNotificationsEnabled ?? true;
	const initialShortcuts = config?.shortcuts ?? [];
	const initialCommitPromptTemplate = config?.commitPromptTemplate ?? "";
	const initialOpenPrPromptTemplate = config?.openPrPromptTemplate ?? "";
	const initialAntcodeToken = config?.antcodeToken ?? "";
	const initialAutoCrEnabled = config?.autoCrEnabled ?? false;
	const initialAutoCrAgentInstanceIds = config?.autoCrAgentInstanceIds ?? [];
	const initialAutoCrScanIntervalMinutes = config?.autoCrScanIntervalMinutes ?? 45;
	const clineSettings = useRuntimeSettingsClineController({
		open,
		workspaceId,
		selectedAgentId,
		config,
	});
	const clineMcpSettings = useRuntimeSettingsClineMcpController({
		open,
		workspaceId,
		selectedAgentId,
		liveAuthStatuses: liveMcpAuthStatuses,
	});
	const hasUnsavedChanges = useMemo(() => {
		if (!config) {
			return false;
		}
		if (selectedAgentInstanceId !== initialSelectedAgentInstanceId) {
			return true;
		}
		if (!areConfiguredAgentsEqual(configuredAgents, initialConfiguredAgents)) {
			return true;
		}
		if (agentAutonomousModeEnabled !== initialAgentAutonomousModeEnabled) {
			return true;
		}
		if (readyForReviewNotificationsEnabled !== initialReadyForReviewNotificationsEnabled) {
			return true;
		}
		if (clineSettings.hasUnsavedChanges) {
			return true;
		}
		if (clineMcpSettings.hasUnsavedChanges) {
			return true;
		}
		if (draftThemeId !== initialThemeId) {
			return true;
		}
		if (!areRuntimeProjectShortcutsEqual(shortcuts, initialShortcuts)) {
			return true;
		}
		if (
			normalizeTemplateForComparison(commitPromptTemplate) !==
			normalizeTemplateForComparison(initialCommitPromptTemplate)
		) {
			return true;
		}
		return (
			normalizeTemplateForComparison(openPrPromptTemplate) !==
				normalizeTemplateForComparison(initialOpenPrPromptTemplate) ||
			antcodeToken !== initialAntcodeToken ||
			autoCrEnabled !== initialAutoCrEnabled ||
			JSON.stringify(autoCrAgentInstanceIds) !== JSON.stringify(initialAutoCrAgentInstanceIds) ||
			autoCrScanIntervalMinutes !== initialAutoCrScanIntervalMinutes
		);
	}, [
		agentAutonomousModeEnabled,
		antcodeToken,
		autoCrEnabled,
		autoCrAgentInstanceIds,
		autoCrScanIntervalMinutes,
		clineMcpSettings.hasUnsavedChanges,
		clineSettings.hasUnsavedChanges,
		commitPromptTemplate,
		config,
		draftThemeId,
		initialAgentAutonomousModeEnabled,
		initialAntcodeToken,
		initialAutoCrEnabled,
		initialAutoCrAgentInstanceIds,
		initialAutoCrScanIntervalMinutes,
		initialCommitPromptTemplate,
		initialConfiguredAgents,
		initialOpenPrPromptTemplate,
		initialReadyForReviewNotificationsEnabled,
		initialSelectedAgentInstanceId,
		initialShortcuts,
		initialThemeId,
		openPrPromptTemplate,
		readyForReviewNotificationsEnabled,
		selectedAgentInstanceId,
		configuredAgents,
		shortcuts,
	]);

	useEffect(() => {
		if (!open) {
			return;
		}
		setConfiguredAgents(config?.configuredAgents ?? []);
		setSelectedAgentInstanceId(config?.selectedAgentInstanceId ?? config?.configuredAgents?.[0]?.id ?? "cline");
		setAgentEditor(null);
		setAgentAutonomousModeEnabled(config?.agentAutonomousModeEnabled ?? true);
		setReadyForReviewNotificationsEnabled(config?.readyForReviewNotificationsEnabled ?? true);
		setShortcuts(config?.shortcuts ?? []);
		setCommitPromptTemplate(config?.commitPromptTemplate ?? "");
		setOpenPrPromptTemplate(config?.openPrPromptTemplate ?? "");
		setAntcodeToken(config?.antcodeToken ?? "");
		setAutoCrEnabled(config?.autoCrEnabled ?? false);
		setAutoCrAgentInstanceIds(config?.autoCrAgentInstanceIds ?? []);
		setAutoCrScanIntervalMinutes(config?.autoCrScanIntervalMinutes ?? 45);
		setSaveError(null);
	}, [
		config?.agentAutonomousModeEnabled,
		config?.antcodeToken,
		config?.autoCrEnabled,
		config?.autoCrAgentInstanceIds,
		config?.autoCrScanIntervalMinutes,
		config?.commitPromptTemplate,
		config?.configuredAgents,
		config?.openPrPromptTemplate,
		config?.readyForReviewNotificationsEnabled,
		config?.selectedAgentInstanceId,
		config?.shortcuts,
		open,
	]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const persistedThemeId = readStoredThemeId();
		setInitialThemeId(persistedThemeId);
		setDraftThemeId(persistedThemeId);
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		refreshNotificationPermission();
	}, [open, refreshNotificationPermission]);
	useWindowEvent("focus", open ? refreshNotificationPermission : null);

	useEffect(() => {
		if (!open || initialSection !== "shortcuts") {
			return;
		}
		const timeout = window.setTimeout(() => {
			shortcutsSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
		}, 500);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [initialSection, open]);

	useEffect(() => {
		if (pendingShortcutScrollIndex === null) {
			return;
		}
		const frame = window.requestAnimationFrame(() => {
			const target = shortcutRowRefs.current[pendingShortcutScrollIndex] ?? null;
			if (target) {
				target.scrollIntoView({ block: "nearest", behavior: "smooth" });
				const firstInput = target.querySelector("input");
				firstInput?.focus();
				setPendingShortcutScrollIndex(null);
			}
		});
		return () => {
			window.cancelAnimationFrame(frame);
		};
	}, [pendingShortcutScrollIndex, shortcuts]);

	useUnmount(() => {
		if (copiedVariableResetTimerRef.current !== null) {
			window.clearTimeout(copiedVariableResetTimerRef.current);
			copiedVariableResetTimerRef.current = null;
		}
	});

	useEffect(() => {
		if (activeSection === "cline" && selectedAgentId !== "cline") {
			setActiveSection("general");
		}
	}, [activeSection, selectedAgentId]);

	// Load passcode config when dialog opens
	useEffect(() => {
		if (!open) {
			return;
		}
		setIsLoadingPasscode(true);
		fetch("/api/passcode/config")
			.then((res) => res.json())
			.then((data) => {
				setRemotePasscodeEnabled(data.enabled ?? false);
				setRemotePasscode(data.passcode ?? null);
			})
			.catch(() => {
				setRemotePasscodeEnabled(false);
			})
			.finally(() => {
				setIsLoadingPasscode(false);
			});
	}, [open]);

	const handleTogglePasscode = (enabled: boolean) => {
		setIsLoadingPasscode(true);
		fetch("/api/passcode/config", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enable: enabled, regenerate: false }),
		})
			.then((res) => res.json())
			.then((data) => {
				setRemotePasscodeEnabled(enabled);
				if (enabled && data.passcode) {
					setRemotePasscode(data.passcode);
				} else {
					setRemotePasscode(null);
				}
			})
			.catch(() => {
				// Ignore errors
			})
			.finally(() => {
				setIsLoadingPasscode(false);
			});
	};

	const handleRegeneratePasscode = () => {
		setIsLoadingPasscode(true);
		fetch("/api/passcode/config", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enable: true, regenerate: true }),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.passcode) {
					setRemotePasscode(data.passcode);
				}
			})
			.catch(() => {
				// Ignore errors
			})
			.finally(() => {
				setIsLoadingPasscode(false);
			});
	};

	const handleSetCustomPasscode = (customPasscode: string) => {
		if (!customPasscode || customPasscode.trim().length === 0) {
			return;
		}
		setIsLoadingPasscode(true);
		fetch("/api/passcode/config", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enable: true, passcode: customPasscode.trim() }),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.passcode) {
					setRemotePasscode(data.passcode);
				}
				// Clear the input
				const input = document.getElementById("custom-passcode-input") as HTMLInputElement;
				if (input) {
					input.value = "";
				}
			})
			.catch(() => {
				// Ignore errors
			})
			.finally(() => {
				setIsLoadingPasscode(false);
			});
	};

	const handleCopyPasscode = () => {
		if (remotePasscode) {
			handleCopyVariableToken(remotePasscode);
		}
	};

	const handleBodyScroll = useCallback(() => {
		if (isScrollingProgrammatically.current) return;
		const body = bodyRef.current;
		if (!body) return;
		const headings = body.querySelectorAll<HTMLElement>("[data-settings-section]");
		const bodyRect = body.getBoundingClientRect();
		let current: SettingsNavId = "general";

		for (const heading of headings) {
			const rect = heading.getBoundingClientRect();
			if (rect.top - bodyRect.top <= 40) {
				const id = heading.getAttribute("data-settings-section");
				if (id) current = id as SettingsNavId;
			}
		}

		setActiveSection(current);
	}, []);

	const handleNavSelect = useCallback((id: SettingsNavId) => {
		setActiveSection(id);
		isScrollingProgrammatically.current = true;
		const body = bodyRef.current;
		if (!body) return;
		const target = body.querySelector(`[data-settings-section="${id}"]`);
		if (target) {
			const bodyRect = body.getBoundingClientRect();
			const targetRect = target.getBoundingClientRect();
			body.scrollTo({
				top: targetRect.top - bodyRect.top + body.scrollTop,
				behavior: "smooth",
			});
		}
		window.setTimeout(() => {
			isScrollingProgrammatically.current = false;
		}, 600);
	}, []);

	const handleCopyVariableToken = (token: string) => {
		void (async () => {
			try {
				await navigator.clipboard.writeText(token);
				setCopiedVariableToken(token);
				if (copiedVariableResetTimerRef.current !== null) {
					window.clearTimeout(copiedVariableResetTimerRef.current);
				}
				copiedVariableResetTimerRef.current = window.setTimeout(() => {
					setCopiedVariableToken((current) => (current === token ? null : current));
					copiedVariableResetTimerRef.current = null;
				}, 2000);
			} catch {
				// Ignore clipboard failures.
			}
		})();
	};

	const handleSelectedPromptChange = (value: string) => {
		if (selectedPromptVariant === "commit") {
			setCommitPromptTemplate(value);
			return;
		}
		setOpenPrPromptTemplate(value);
	};

	const handleResetSelectedPrompt = () => {
		handleSelectedPromptChange(selectedPromptDefaultValue);
	};

	const handleAddAgent = () => {
		setSaveError(null);
		setAgentEditor(
			createAgentEditorState(
				selectedAgentId === "cline"
					? "cline"
					: selectedAgentId === "codex"
						? "codex"
						: selectedAgentId === "kimi"
							? "kimi"
							: selectedAgentId === "kimi-code"
								? "kimi-code"
								: "claude",
			),
		);
	};

	const handleEditAgent = (agentId: string) => {
		const agent = configuredAgents.find((candidate) => candidate.id === agentId);
		if (!agent) {
			return;
		}
		setSaveError(null);
		setAgentEditor({
			id: agent.id,
			type: agent.type,
			alias: agent.alias ?? "",
			command: agent.command,
		});
	};

	const handleDeleteAgent = (agentId: string) => {
		setConfiguredAgents((current) => {
			if (current.length <= 1) {
				setSaveError("At least one agent instance is required.");
				return current;
			}
			const nextAgents = current.filter((agent) => agent.id !== agentId);
			setSelectedAgentInstanceId((selected) => (selected === agentId ? (nextAgents[0]?.id ?? selected) : selected));
			setAgentEditor((currentEditor) => (currentEditor?.id === agentId ? null : currentEditor));
			setAutoCrAgentInstanceIds((current) => current.filter((id) => id !== agentId));
			setSaveError(null);
			return nextAgents;
		});
	};

	const handleAgentEditorSave = () => {
		if (!agentEditor) {
			return;
		}
		const normalizedCommand = agentEditor.command.trim();
		const commandIssue = getConfiguredAgentCommandIssue(normalizedCommand);
		if (commandIssue) {
			setSaveError(commandIssue);
			return;
		}
		const normalizedAlias = agentEditor.alias.trim();
		const nextAgent: RuntimeConfiguredAgent = {
			id: agentEditor.id ?? `${agentEditor.type}-${Date.now().toString(36)}`,
			type: agentEditor.type,
			alias: normalizedAlias.length > 0 ? normalizedAlias : null,
			command: normalizedCommand,
		};
		setConfiguredAgents((current) => {
			const nextAgents =
				agentEditor.id === null
					? [...current, nextAgent]
					: current.map((agent) => (agent.id === agentEditor.id ? nextAgent : agent));
			if (agentEditor.id === null) {
				setSelectedAgentInstanceId(nextAgent.id);
			}
			return nextAgents;
		});
		setAgentEditor(null);
		setSaveError(null);
	};

	const handleSave = async () => {
		setSaveError(null);
		if (!config) {
			setSaveError("Runtime settings are still loading. Try again in a moment.");
			return;
		}
		const selectedAgent = displayedAgents.find((agent) => agent.id === selectedAgentInstanceId);
		const invalidConfiguredAgent = configuredAgents
			.map((agent) => ({
				agent,
				issue: getConfiguredAgentCommandIssue(agent.command),
			}))
			.find((entry) => entry.issue !== null);
		if (invalidConfiguredAgent) {
			const label =
				invalidConfiguredAgent.agent.alias ??
				displayedAgents.find((agent) => agent.id === invalidConfiguredAgent.agent.id)?.defaultLabel ??
				invalidConfiguredAgent.agent.type;
			setSaveError(`Agent instance "${label}" has an invalid command. ${invalidConfiguredAgent.issue}`);
			return;
		}
		if (!selectedAgent || selectedAgent.installed !== true) {
			setSaveError(
				"Selected agent instance command is not available on PATH. Install it first or choose another instance.",
			);
			return;
		}
		const shouldRequestNotificationPermission =
			!initialReadyForReviewNotificationsEnabled &&
			readyForReviewNotificationsEnabled &&
			notificationPermission === "default";
		if (shouldRequestNotificationPermission) {
			const nextPermission = await requestBrowserNotificationPermission();
			setNotificationPermission(nextPermission);
		}
		if (selectedAgentId === "cline" && clineSettings.providerId.trim().length === 0) {
			setSaveError("Choose a Cline provider before saving.");
			return;
		}
		if (selectedAgentId === "cline") {
			const clineProviderSaveResult = await clineSettings.saveProviderSettings();
			if (!clineProviderSaveResult.ok) {
				setSaveError(clineProviderSaveResult.message ?? "Could not save Cline provider settings.");
				return;
			}
			const clineMcpSaveResult = await clineMcpSettings.saveMcpSettings();
			if (!clineMcpSaveResult.ok) {
				setSaveError(clineMcpSaveResult.message ?? "Could not save Cline MCP settings.");
				return;
			}
		}
		const saved = await save({
			selectedAgentId,
			selectedAgentInstanceId,
			configuredAgents,
			agentAutonomousModeEnabled,
			readyForReviewNotificationsEnabled,
			shortcuts,
			commitPromptTemplate,
			openPrPromptTemplate,
			antcodeToken,
			autoCrEnabled,
			autoCrAgentInstanceIds,
			autoCrScanIntervalMinutes,
		});
		if (!saved) {
			setSaveError("Could not save runtime settings. Check runtime logs and try again.");
			return;
		}
		setAgentEditor(null);
		if (draftThemeId !== initialThemeId) {
			saveThemeId(draftThemeId);
			setInitialThemeId(draftThemeId);
		}
		onSaved?.();
		handleDialogOpenChange(false);
	};

	const handleRequestPermission = () => {
		void (async () => {
			const nextPermission = await requestBrowserNotificationPermission();
			setNotificationPermission(nextPermission);
		})();
	};

	const handleOpenFilePath = useCallback(
		(filePath: string) => {
			setSaveError(null);
			void openFileOnHost(workspaceId, filePath).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				setSaveError(`Could not open file on host: ${message}`);
			});
		},
		[workspaceId],
	);

	const handleClineSetupSaved = useCallback(() => {
		refresh();
		onSaved?.();
	}, [onSaved, refresh]);

	const handleDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				const persistedThemeId = readStoredThemeId();
				if (draftThemeId !== persistedThemeId) {
					previewThemeId(persistedThemeId);
				}
				setDraftThemeId(persistedThemeId);
				setInitialThemeId(persistedThemeId);
			}
			onOpenChange(nextOpen);
		},
		[draftThemeId, onOpenChange],
	);

	const currentThemeDef = THEMES.find((t) => t.id === draftThemeId);

	return (
		<Dialog open={open} onOpenChange={handleDialogOpenChange} contentClassName="!max-w-[780px]">
			<DialogHeader title="Settings" icon={<Settings size={16} />} />
			<div className="flex h-[min(480px,60vh)]">
				<SettingsNav items={navItems} activeId={activeSection} onSelect={handleNavSelect} />
				<div
					ref={bodyRef}
					onScroll={handleBodyScroll}
					className="px-5 pb-5 overflow-y-auto overscroll-contain flex-1 min-h-0 bg-surface-1"
				>
					{/* ---- General ---- */}
					<div data-settings-section="general" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<SlidersHorizontal size={16} className="text-text-secondary" />
							General
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<h6 className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary m-0 mb-1">
							Agent Instances
						</h6>
						<div className="mb-2 flex justify-end">
							<Button size="sm" icon={<Plus size={14} />} disabled={controlsDisabled} onClick={handleAddAgent}>
								Add Agent
							</Button>
						</div>
						{displayedAgents.map((agent) => (
							<AgentRow
								key={agent.id}
								agent={agent}
								isSelected={agent.id === selectedAgentInstanceId}
								onSelect={() => setSelectedAgentInstanceId(agent.id)}
								onEdit={() => handleEditAgent(agent.id)}
								onDelete={() => handleDeleteAgent(agent.id)}
								deleteDisabled={configuredAgents.length <= 1}
								disabled={controlsDisabled}
							/>
						))}
						{agentEditor ? (
							<div className="mt-3 rounded-md border border-border bg-surface-1 p-3">
								<div className="grid gap-3">
									<label className="grid gap-1 text-[13px] text-text-primary">
										<span>Agent type</span>
										<NativeSelect
											value={agentEditor.type}
											onChange={(event) => {
												const nextType = event.target.value as RuntimeConfiguredAgent["type"];
												setAgentEditor((current) =>
													current
														? {
																...current,
																type: nextType,
																command:
																	current.id === null &&
																	current.command === buildDefaultAgentCommand(current.type)
																		? buildDefaultAgentCommand(nextType)
																		: current.command,
															}
														: current,
												);
											}}
											disabled={controlsDisabled || agentEditor.id !== null}
										>
											{(["cline", "claude", "codex", "kimi", "kimi-code"] as const).map((agentType) => (
												<option key={agentType} value={agentType}>
													{getRuntimeAgentCatalogEntry(agentType)?.label ?? agentType}
												</option>
											))}
										</NativeSelect>
									</label>
									<label className="grid gap-1 text-[13px] text-text-primary">
										<span>Alias</span>
										<input
											name="agent-alias"
											value={agentEditor.alias}
											onInput={(event) =>
												setAgentEditor((current) =>
													current
														? { ...current, alias: (event.target as HTMLInputElement).value }
														: current,
												)
											}
											onChange={(event) =>
												setAgentEditor((current) =>
													current ? { ...current, alias: event.target.value } : current,
												)
											}
											disabled={controlsDisabled}
											className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-primary outline-none focus:border-border-focus"
										/>
									</label>
									<label className="grid gap-1 text-[13px] text-text-primary">
										<span>Command</span>
										<textarea
											name="agent-command"
											value={agentEditor.command}
											onInput={(event) =>
												setAgentEditor((current) =>
													current
														? { ...current, command: (event.target as HTMLTextAreaElement).value }
														: current,
												)
											}
											onChange={(event) =>
												setAgentEditor((current) =>
													current ? { ...current, command: event.target.value } : current,
												)
											}
											disabled={controlsDisabled}
											rows={3}
											className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus"
										/>
									</label>
									<div className="flex justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											disabled={controlsDisabled}
											onClick={() => setAgentEditor(null)}
										>
											Cancel
										</Button>
										<Button
											size="sm"
											disabled={controlsDisabled || agentEditor.command.trim().length === 0}
											onClick={handleAgentEditorSave}
										>
											Save
										</Button>
									</div>
								</div>
							</div>
						) : null}
						{config === null ? (
							<p className="text-text-secondary py-2">Checking which CLIs are installed for this project...</p>
						) : null}
						<label
							htmlFor={bypassPermissionsCheckboxId}
							className="flex items-center gap-2 text-[13px] text-text-primary mt-2 cursor-pointer"
						>
							<RadixCheckbox.Root
								id={bypassPermissionsCheckboxId}
								aria-label="Enable bypass permissions flag"
								checked={agentAutonomousModeEnabled}
								disabled={controlsDisabled}
								onCheckedChange={(checked) => setAgentAutonomousModeEnabled(checked === true)}
								className="flex h-4 w-4 cursor-pointer items-center justify-center rounded border border-border bg-surface-2 data-[state=checked]:bg-accent data-[state=checked]:border-accent disabled:cursor-default disabled:opacity-40"
							>
								<RadixCheckbox.Indicator>
									<Check size={12} className="text-white" />
								</RadixCheckbox.Indicator>
							</RadixCheckbox.Root>
							<span>Enable bypass permissions flag</span>
						</label>
						<p className="text-text-secondary text-[13px] ml-6 mt-0 mb-0">
							Allows agents to use tools without stopping for permission. Use at your own risk.
						</p>
					</div>

					{/* ---- Cline ---- */}
					{selectedAgentId === "cline" ? (
						<>
							<div data-settings-section="cline" />
							<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
								<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
									<Bot size={16} className="text-text-secondary" />
									Cline
								</h2>
							</div>
							<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
								<ClineSetupSection
									controller={clineSettings}
									mcpController={clineMcpSettings}
									controlsDisabled={controlsDisabled}
									workspaceId={workspaceId}
									accountSection={
										clineSettings.providerId.trim() === "cline" ? (
											<AccountOrganizationSection
												workspaceId={workspaceId}
												open={open}
												onAccountSwitched={onAccountSwitched}
											/>
										) : null
									}
									onError={setSaveError}
									onSaved={handleClineSetupSaved}
								/>
							</div>
						</>
					) : null}

					{/* ---- Git Prompts ---- */}
					<div data-settings-section="git-prompts" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<GitCommit size={16} className="text-text-secondary" />
							Git Prompts
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<p className="text-text-secondary text-[13px] mt-0 mb-2">
							Modify the prompts sent to the agent when using Commit or Make PR on tasks in Review.
						</p>
						<div className="flex items-center justify-between gap-2 mb-2">
							<NativeSelect
								value={selectedPromptVariant}
								onChange={(event) => setSelectedPromptVariant(event.target.value as TaskGitAction)}
								disabled={controlsDisabled}
								style={{ minWidth: 220 }}
							>
								{GIT_PROMPT_VARIANT_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</NativeSelect>
							<Button
								variant="ghost"
								size="sm"
								onClick={handleResetSelectedPrompt}
								disabled={controlsDisabled || isSelectedPromptAtDefault}
							>
								Reset
							</Button>
						</div>
						<textarea
							rows={5}
							value={selectedPromptValue}
							onChange={(event) => handleSelectedPromptChange(event.target.value)}
							placeholder={selectedPromptPlaceholder}
							disabled={controlsDisabled}
							className="w-full rounded-md border border-border bg-surface-2 p-3 text-[13px] text-text-primary font-mono placeholder:text-text-tertiary focus:border-border-focus focus:outline-none resize-none disabled:opacity-40"
						/>
						<p className="text-text-secondary text-[13px] mt-2 mb-0">
							Use{" "}
							<InlineUtilityButton
								text={
									copiedVariableToken === TASK_GIT_BASE_REF_PROMPT_VARIABLE.token
										? "Copied!"
										: TASK_GIT_BASE_REF_PROMPT_VARIABLE.token
								}
								monospace
								widthCh={Math.max(TASK_GIT_BASE_REF_PROMPT_VARIABLE.token.length, "Copied!".length) + 2}
								onClick={() => {
									handleCopyVariableToken(TASK_GIT_BASE_REF_PROMPT_VARIABLE.token);
								}}
								disabled={controlsDisabled}
							/>{" "}
							to reference {TASK_GIT_BASE_REF_PROMPT_VARIABLE.description}
						</p>
					</div>

					{/* ---- Notifications ---- */}
					<div data-settings-section="notifications" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<Bell size={16} className="text-text-secondary" />
							Notifications
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<div className="flex items-center gap-2">
							<RadixSwitch.Root
								checked={readyForReviewNotificationsEnabled}
								disabled={controlsDisabled}
								onCheckedChange={setReadyForReviewNotificationsEnabled}
								className="relative h-5 w-9 rounded-full bg-surface-4 data-[state=checked]:bg-accent cursor-pointer disabled:opacity-40"
							>
								<RadixSwitch.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
							</RadixSwitch.Root>
							<span className="text-[13px] text-text-primary">Notify when a task is ready for review</span>
						</div>
						<div className="flex items-center gap-2 mt-2">
							<p className="text-text-secondary text-[13px] m-0">
								Browser permission: {formatNotificationPermissionStatus(notificationPermission)}
							</p>
							{notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
								<InlineUtilityButton
									text="Request permission"
									onClick={handleRequestPermission}
									disabled={controlsDisabled}
								/>
							) : null}
						</div>
					</div>

					{/* ---- Antcode ---- */}
					<div data-settings-section="antcode" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<GitBranch size={16} className="text-text-secondary" />
							Antcode
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<p className="text-text-secondary text-[13px] mt-0 mb-2">
							Configure your Antcode token to fetch issues for task assignment.
						</p>
						<label htmlFor="antcode-token" className="text-[13px] text-text-primary block mb-1">
							Antcode Token
						</label>
						<input
							id="antcode-token"
							type="password"
							value={antcodeToken}
							onChange={(event) => setAntcodeToken(event.target.value)}
							placeholder="Enter your Antcode token"
							disabled={controlsDisabled}
							className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none disabled:opacity-40"
						/>
						<p className="text-text-secondary text-[12px] mt-2 mb-0">
							You can generate a token in Antcode settings.
						</p>
					</div>

					{/* ---- Auto CR ---- */}
					<div data-settings-section="auto-cr" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<ScanSearch size={16} className="text-text-secondary" />
							Auto CR
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<div className="flex items-center justify-between mb-2">
							<div>
								<span className="text-[13px] font-medium text-text-primary">Enable Auto CR</span>
								<p className="text-text-secondary text-[12px] mt-0.5 mb-0">
									Automatically scan for PRs with PendingAGIReview label and create review tasks.
								</p>
							</div>
							<RadixSwitch.Root
								checked={autoCrEnabled}
								disabled={controlsDisabled}
								onCheckedChange={setAutoCrEnabled}
								className="relative h-5 w-9 shrink-0 rounded-full bg-surface-4 data-[state=checked]:bg-accent cursor-pointer disabled:opacity-40"
							>
								<RadixSwitch.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
							</RadixSwitch.Root>
						</div>
						{autoCrEnabled && displayedAgents.length > 0 ? (
							<div className="mt-3 pt-3 border-t border-border">
								<span className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary block mb-2">
									Review Agents
								</span>
								<div className="space-y-1.5">
									{displayedAgents.map((agent) => (
										<label
											key={agent.id}
											className="flex items-center gap-2 text-[13px] text-text-primary cursor-pointer"
										>
											<RadixCheckbox.Root
												checked={autoCrAgentInstanceIds.includes(agent.id)}
												disabled={controlsDisabled}
												onCheckedChange={(checked) => {
													setAutoCrAgentInstanceIds((current) =>
														checked ? [...current, agent.id] : current.filter((id) => id !== agent.id),
													);
												}}
												className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-surface-2 data-[state=checked]:bg-accent data-[state=checked]:border-accent disabled:opacity-40"
											>
												<RadixCheckbox.Indicator>
													<Check size={12} className="text-white" />
												</RadixCheckbox.Indicator>
											</RadixCheckbox.Root>
											{agent.label}
										</label>
									))}
								</div>
								<div className="mt-3 pt-3 border-t border-border">
									<span className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary block mb-2">
										Scan Interval
									</span>
									<NativeSelect
										value={autoCrScanIntervalMinutes}
										disabled={controlsDisabled}
										onChange={(e) => setAutoCrScanIntervalMinutes(Number(e.target.value))}
									>
										<option value={15}>15 minutes</option>
										<option value={30}>30 minutes</option>
										<option value={45}>45 minutes (default)</option>
										<option value={60}>60 minutes</option>
										<option value={120}>120 minutes</option>
									</NativeSelect>
								</div>
							</div>
						) : null}
					</div>

					{/* ---- Remote Access ---- */}
					<div data-settings-section="remote" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<Shield size={16} className="text-text-secondary" />
							Remote Access
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<p className="text-text-secondary text-[13px] mt-0 mb-3">
							Protect your remote access with a passcode. When enabled, users must enter this passcode to access
							the application remotely.
						</p>
						<div className="flex items-center gap-2 mb-4">
							<RadixSwitch.Root
								checked={remotePasscodeEnabled}
								disabled={controlsDisabled || isLoadingPasscode}
								onCheckedChange={handleTogglePasscode}
								className="relative h-5 w-9 rounded-full bg-surface-4 data-[state=checked]:bg-accent cursor-pointer disabled:opacity-40"
							>
								<RadixSwitch.Thumb className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
							</RadixSwitch.Root>
							<span className="text-[13px] text-text-primary">
								{remotePasscodeEnabled ? "Passcode protection enabled" : "Enable passcode protection"}
							</span>
						</div>
						{remotePasscodeEnabled && (
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<Key size={14} className="text-text-secondary" />
									<span className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
										Set Custom Passcode
									</span>
								</div>
								<div className="flex items-center gap-2">
									<input
										type="text"
										id="custom-passcode-input"
										placeholder="Enter custom passcode"
										className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												const input = document.getElementById("custom-passcode-input") as HTMLInputElement;
												if (input?.value) {
													handleSetCustomPasscode(input.value);
												}
											}
										}}
									/>
									<Button
										size="sm"
										onClick={() => {
											const input = document.getElementById("custom-passcode-input") as HTMLInputElement;
											if (input?.value) {
												handleSetCustomPasscode(input.value);
											}
										}}
										disabled={isLoadingPasscode}
									>
										Set
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={handleRegeneratePasscode}
										disabled={isLoadingPasscode}
									>
										Generate
									</Button>
								</div>
								<p className="text-text-secondary text-[12px] m-0">
									Enter a custom passcode or click Generate to create a random one.
								</p>
								{remotePasscode && (
									<div className="mt-3 pt-3 border-t border-border">
										<div className="flex items-center gap-2 mb-2">
											<span className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
												Current Passcode
											</span>
										</div>
										<div className="flex items-center gap-2">
											<input
												type="text"
												value={remotePasscode}
												readOnly
												className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary font-mono"
											/>
											<Button size="sm" onClick={handleCopyPasscode} disabled={isLoadingPasscode}>
												{copiedVariableToken === remotePasscode ? "Copied!" : "Copy"}
											</Button>
										</div>
										<p className="text-text-secondary text-[12px] mt-2 m-0">
											Share this passcode with users who need remote access.
										</p>
									</div>
								)}
							</div>
						)}
						{isLoadingPasscode ? <p className="text-text-secondary text-[13px] mt-2">Loading...</p> : null}
					</div>

					{/* ---- Appearance ---- */}
					<div data-settings-section="appearance" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<Palette size={16} className="text-text-secondary" />
							Appearance
						</h2>
					</div>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<h6 className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary m-0 mb-2">
							Theme
						</h6>
						<div className="min-w-0 w-1/2 max-w-full">
							<RadixSelect.Root
								value={draftThemeId}
								onValueChange={(value) => {
									setDraftThemeId(value as ThemeId);
									previewThemeId(value as ThemeId);
								}}
								onOpenChange={(selectOpen) => {
									if (!selectOpen) {
										previewThemeId(draftThemeId);
									}
								}}
							>
								<RadixSelect.Trigger
									className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-border-bright bg-surface-2 px-3 text-[13px] text-text-primary outline-none hover:bg-surface-3 hover:border-border-bright focus:border-border-focus focus:outline-none"
									aria-label="Theme"
								>
									<span className="flex items-center gap-2.5">
										<span className="flex shrink-0 h-5 w-10 rounded overflow-hidden border border-border">
											<span
												className="flex-1"
												style={{ background: currentThemeDef?.surface ?? "#1F2428" }}
											/>
											<span
												className="flex-1"
												style={{ background: currentThemeDef?.accent ?? "#0084FF" }}
											/>
											<span
												className="flex-1"
												style={{ background: currentThemeDef?.accent2 ?? "#7C5CFF" }}
											/>
										</span>
										<RadixSelect.Value />
									</span>
									<RadixSelect.Icon>
										<ChevronDown size={14} className="text-text-tertiary" />
									</RadixSelect.Icon>
								</RadixSelect.Trigger>
								<RadixSelect.Portal>
									<RadixSelect.Content
										className="z-50 max-h-72 w-(--radix-select-trigger-width) overflow-auto rounded-lg border border-border bg-surface-1 p-1 shadow-xl"
										position="popper"
										sideOffset={4}
										align="start"
									>
										<RadixSelect.Viewport>
											{THEME_GROUPS.map((group) => {
												const groupThemes = THEMES.filter((t) => t.group === group.key);
												if (groupThemes.length === 0) return null;
												return (
													<RadixSelect.Group key={group.key}>
														<RadixSelect.Label className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
															{group.label}
														</RadixSelect.Label>
														{groupThemes.map((theme) => (
															<RadixSelect.Item
																key={theme.id}
																value={theme.id}
																className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-text-secondary outline-none data-highlighted:bg-surface-3 data-highlighted:text-text-primary data-[state=checked]:text-text-primary"
																onMouseEnter={() => previewThemeId(theme.id)}
																onFocus={() => previewThemeId(theme.id)}
															>
																<span className="flex shrink-0 h-5 w-10 rounded overflow-hidden border border-border">
																	<span className="flex-1" style={{ background: theme.surface }} />
																	<span className="flex-1" style={{ background: theme.accent }} />
																	<span className="flex-1" style={{ background: theme.accent2 }} />
																</span>
																<RadixSelect.ItemText>{theme.label}</RadixSelect.ItemText>
																<RadixSelect.ItemIndicator className="ml-auto">
																	<Check size={14} className="text-accent-2" />
																</RadixSelect.ItemIndicator>
															</RadixSelect.Item>
														))}
													</RadixSelect.Group>
												);
											})}
										</RadixSelect.Viewport>
									</RadixSelect.Content>
								</RadixSelect.Portal>
							</RadixSelect.Root>
						</div>

						<h6 className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary mt-5 mb-2">
							Layout
						</h6>
						<Button size="sm" onClick={resetLayoutCustomizations}>
							Reset layout
						</Button>
						<p className="text-text-secondary text-[13px] mt-2 mb-0">
							Reset sidebar, split pane, and terminal resize customizations back to their defaults.
						</p>
					</div>
					<div data-settings-section="project" />
					<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
						<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
							<FolderOpen size={16} className="text-text-secondary" />
							Project
						</h2>
					</div>
					<p
						className="text-text-secondary font-mono text-xs m-0 mb-3 break-all"
						style={{ cursor: config?.projectConfigPath ? "pointer" : undefined }}
						onClick={() => {
							if (config?.projectConfigPath) {
								handleOpenFilePath(config.projectConfigPath);
							}
						}}
					>
						{config?.projectConfigPath
							? formatPathForDisplay(config.projectConfigPath)
							: "<project>/.cline/kanban/config.json"}
						{config?.projectConfigPath ? <ExternalLink size={12} className="inline ml-1.5 align-middle" /> : null}
					</p>
					<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">
						<div className="flex items-center justify-between mb-2">
							<h6
								ref={shortcutsSectionRef}
								className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary m-0"
							>
								Script shortcuts
							</h6>
							<Button
								variant="ghost"
								size="sm"
								icon={<Plus size={14} />}
								onClick={() => {
									setShortcuts((current) => {
										const nextLabel = getNextShortcutLabel(current, "Run");
										setPendingShortcutScrollIndex(current.length);
										return [
											...current,
											{
												label: nextLabel,
												command: "",
												icon: "play",
											},
										];
									});
								}}
								disabled={controlsDisabled}
							>
								Add
							</Button>
						</div>

						{shortcuts.map((shortcut, shortcutIndex) => (
							<div
								key={shortcutIndex}
								ref={(node) => {
									shortcutRowRefs.current[shortcutIndex] = node;
								}}
								className="grid gap-2 mb-1"
								style={{
									gridTemplateColumns: "max-content 1fr 2fr auto",
								}}
							>
								<ShortcutIconPicker
									value={shortcut.icon}
									onSelect={(icon) =>
										setShortcuts((current) =>
											current.map((item, itemIndex) =>
												itemIndex === shortcutIndex ? { ...item, icon } : item,
											),
										)
									}
								/>
								<input
									value={shortcut.label}
									onChange={(event) =>
										setShortcuts((current) =>
											current.map((item, itemIndex) =>
												itemIndex === shortcutIndex ? { ...item, label: event.target.value } : item,
											),
										)
									}
									placeholder="Label"
									className="h-7 w-full rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
								/>
								<input
									value={shortcut.command}
									onChange={(event) =>
										setShortcuts((current) =>
											current.map((item, itemIndex) =>
												itemIndex === shortcutIndex ? { ...item, command: event.target.value } : item,
											),
										)
									}
									placeholder="Command"
									className="h-7 w-full rounded-md border border-border bg-surface-2 px-2 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
								/>
								<Button
									variant="ghost"
									size="sm"
									icon={<X size={14} />}
									aria-label={`Remove shortcut ${shortcut.label}`}
									onClick={() =>
										setShortcuts((current) => current.filter((_, itemIndex) => itemIndex !== shortcutIndex))
									}
								/>
							</div>
						))}
						{shortcuts.length === 0 ? (
							<p className="text-text-secondary text-[13px]">No shortcuts configured.</p>
						) : null}
					</div>

					{saveError ? (
						<div className="flex gap-2 rounded-md border border-status-red/30 bg-status-red/5 p-3 text-[13px]">
							<span className="text-text-primary">{saveError}</span>
						</div>
					) : null}
				</div>
			</div>
			<DialogFooter>
				<Button
					size="sm"
					variant="ghost"
					className="mr-auto mt-[3px]"
					icon={<ExternalLink size={14} />}
					onClick={() => window.open("https://docs.cline.bot/kanban/overview", "_blank")}
				>
					Read the docs
				</Button>
				<Button onClick={() => handleDialogOpenChange(false)} disabled={controlsDisabled}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => void handleSave()}
					disabled={controlsDisabled || !hasUnsavedChanges}
				>
					Save
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
