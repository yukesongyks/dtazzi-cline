/**
 * Security filtering (NFR3, S10).
 *
 * - Denylist: env var values, `*_TOKEN`/`*_KEY`/`*_SECRET` patterns, file paths under
 *   common credential dirs (`~/.ssh`, `~/.aws`, `.env*`).
 * - Stack lines pass through `redactStackLine`: credentials → `[REDACTED]`,
 *   credential-bearing paths replaced with a neutral label, surrounding context preserved.
 * - The report header's `env` field is a *sanitized summary* (e.g. "Node 22, Linux x64"),
 *   never raw `process.env`.
 *
 * @see openspec/changes/add-test-report-skill/design.md §6
 */

const REDACTED = "[REDACTED]";

/** Regex for high-entropy secret-like tokens (hex/base64-ish, length >= 16). */
const SECRET_VALUE_PATTERN = /(?:[A-Za-z0-9+\/_\-]{40,})|(?:[A-Fa-f0-9]{32,})/g;

/** Credential-bearing path fragments (home-relative and project-relative). */
const CREDENTIAL_PATH_PATTERNS: RegExp[] = [
	/\/\.ssh[\/\s]/,
	/\/\.aws[\/\s]/,
	/\/\.env[\w.\-]*([\/\s"']|$)/,
	/\/\.npmrc([\/\s"']|$)/,
	/\/\.pypirc([\/\s"']|$)/,
	/\/\.netrc([\/\s"']|$)/,
];

/** Assignment patterns like KEY=VALUE or export KEY=VALUE in stack/error text. */
const ASSIGN_PATTERN =
	/(^|[\s;&|])([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|CREDENTIAL|PWD))(=|\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;

/**
 * Redact a single stack/error line. Credentials become `[REDACTED]`; credential-bearing
 * paths are replaced with a neutral label while surrounding context is preserved.
 */
export function redactStackLine(line: string): string {
	let out = line;

	// 1. KEY=VALUE / export KEY=VALUE assignments.
	out = out.replace(ASSIGN_PATTERN, (match, prefix, _key, _eq, _value) => {
		return `${prefix}[REDACTED]`;
	});

	// 2. Credential-bearing paths → neutral label.
	for (const re of CREDENTIAL_PATH_PATTERNS) {
		if (re.test(out)) {
			out = out.replace(re, "/[REDACTED-PATH]");
			out = out.replace(/\/\[REDACTED-PATH\].*/, "/[REDACTED-PATH]");
		}
	}

	// 3. Long high-entropy secret-like tokens.
	out = out.replace(SECRET_VALUE_PATTERN, REDACTED);

	return out;
}

/** Redact a block of multi-line text (error message + stack). */
export function redactText(text: string): string {
	return text
		.split(/\r?\n/)
		.map((l) => redactStackLine(l))
		.join("\n");
}

/**
 * Build a sanitized environment summary suitable for the report header. Never echoes raw
 * `process.env`. Returns a stable, environment-independent-ish string derived from
 * `process.versions` and `process.platform`.
 */
export function sanitizeEnvSummary(): string {
	const parts: string[] = [];
	const nodeVersion = process.versions?.node;
	if (nodeVersion) parts.push(`Node ${nodeVersion}`);
	const platform = process.platform;
	if (platform) {
		const arch = process.arch ?? "";
		parts.push(`${platform}${arch ? ` ${arch}` : ""}`);
	}
	return parts.length > 0 ? parts.join(", ") : "未获取";
}

/** Patterns asserted absent from rendered output by S10. Exposed for tests. */
export const DENYLIST_PATTERNS = [
	SECRET_VALUE_PATTERN,
	...CREDENTIAL_PATH_PATTERNS,
	ASSIGN_PATTERN,
];
