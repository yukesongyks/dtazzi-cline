/**
 * Framework/command detection (CAP-1 priority chain).
 *
 * Priority:
 * a. user-supplied command (handled by caller / config.testCommand);
 * b. project config scripts — `package.json` (test), `pyproject.toml`, `Cargo.toml`;
 * c. framework feature files — `jest.config.*`, `vitest.config.*`, `pytest.ini`.
 *
 * @see openspec/changes/add-test-report-skill/design.md §1 (detect.ts) and proposal CAP-1.
 */

export interface DetectionResult {
	/** Detected test command to run, or undefined when none found. */
	command?: string;
	/** Framework hint passed to the parser registry (e.g. "vitest", "jest", "pytest"). */
	frameworkHint?: string;
	/** How the command was determined. */
	source: "user" | "project-config" | "feature-file" | "none";
}

export interface DetectInput {
	/** User-supplied command (already highest priority). */
	userCommand?: string;
	/** Map of project-relative path → file content (read by caller; this stays pure). */
	files: Record<string, string>;
}

interface ProjectFile {
	/** Globs matched against DetectInput.files keys. */
	match: RegExp;
	/** Extract the test command + framework hint from the file content. */
	derive: (content: string, files: Record<string, string>) => Pick<DetectionResult, "command" | "frameworkHint"> | undefined;
}

const PROJECT_FILES: ProjectFile[] = [
	{
		// package.json scripts.test → prefer vitest/jest invocation.
		match: /^package\.json$/,
		derive: (content) => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(content);
			} catch {
				return undefined;
			}
			const scripts = (parsed as { scripts?: Record<string, string> })?.scripts;
			const test = scripts?.test;
			if (!test) return undefined;
			if (/\bvitest\b/.test(test)) {
				return { command: test, frameworkHint: "vitest" };
			}
			if (/\bjest\b/.test(test)) {
				return { command: test, frameworkHint: "jest" };
			}
			return { command: test, frameworkHint: undefined };
		},
	},
	{
		// pyproject.toml [tool.pytest.ini_options] or a pytest dep.
		match: /^pyproject\.toml$/,
		derive: (content) => {
			if (/pytest/.test(content)) {
				return { command: "pytest", frameworkHint: "pytest" };
			}
			return undefined;
		},
	},
	{
		// Cargo.toml — mention only; no parser for cargo in v1.0, but detect the command.
		match: /^Cargo\.toml$/,
		derive: () => ({ command: "cargo test", frameworkHint: undefined }),
	},
];

const FEATURE_FILES: Array<{ match: RegExp; hint: string; command: string }> = [
	{ match: /^vitest\.config\.[a-z]+$/, hint: "vitest", command: "vitest run" },
	{ match: /^jest\.config\.[a-z]+$/, hint: "jest", command: "jest" },
	{ match: /^pytest\.ini$/, hint: "pytest", command: "pytest" },
];

/**
 * Run the CAP-1 priority chain against the provided file map. Pure: no filesystem access.
 */
export function detectFramework(input: DetectInput): DetectionResult {
	if (input.userCommand) {
		return { command: input.userCommand, source: "user", frameworkHint: undefined };
	}

	// b. project config scripts.
	for (const pf of PROJECT_FILES) {
		for (const path of Object.keys(input.files)) {
			const base = path.split(/[\\/]/).pop() ?? path;
			if (pf.match.test(base)) {
				const derived = pf.derive(input.files[path], input.files);
				if (derived) {
					return { ...derived, source: "project-config" };
				}
			}
		}
	}

	// c. framework feature files.
	for (const ff of FEATURE_FILES) {
		for (const path of Object.keys(input.files)) {
			const base = path.split(/[\\/]/).pop() ?? path;
			if (ff.match.test(base)) {
				return { command: ff.command, frameworkHint: ff.hint, source: "feature-file" };
			}
		}
	}

	return { source: "none" };
}
