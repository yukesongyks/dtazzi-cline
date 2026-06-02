export interface ParsedAgentCommand {
	env: Record<string, string>;
	binary: string;
	args: string[];
}

export interface AgentCommandParseError {
	code: "empty" | "unterminated_quote" | "dangling_escape" | "missing_binary";
	message: string;
}

export type ParseConfiguredAgentCommandResult =
	| { ok: true; value: ParsedAgentCommand }
	| { ok: false; error: AgentCommandParseError };

interface TokenizeCommandResult {
	tokens: string[];
	error: AgentCommandParseError | null;
}

function tokenizeCommand(command: string): TokenizeCommandResult {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaping = false;

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index] ?? "";
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (quote === "'") {
			if (char === "'") {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (quote === '"') {
			if (char === '"') {
				quote = null;
				continue;
			}
			if (char === "\\") {
				escaping = true;
				continue;
			}
			current += char;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}

	if (escaping) {
		return {
			tokens: [],
			error: {
				code: "dangling_escape",
				message: "Agent command cannot end with a trailing escape character.",
			},
		};
	}
	if (quote !== null) {
		return {
			tokens: [],
			error: {
				code: "unterminated_quote",
				message: "Agent command contains an unterminated quoted string.",
			},
		};
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return { tokens, error: null };
}

export function parseConfiguredAgentCommand(command: string): ParseConfiguredAgentCommandResult {
	const trimmedCommand = command.trim();
	if (trimmedCommand.length === 0) {
		return {
			ok: false,
			error: {
				code: "empty",
				message: "Agent command is required.",
			},
		};
	}

	const tokenized = tokenizeCommand(trimmedCommand);
	if (tokenized.error) {
		return {
			ok: false,
			error: tokenized.error,
		};
	}

	const env: Record<string, string> = {};
	let binaryIndex = 0;
	while (binaryIndex < tokenized.tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokenized.tokens[binaryIndex] ?? "")) {
		const token = tokenized.tokens[binaryIndex] ?? "";
		const separatorIndex = token.indexOf("=");
		env[token.slice(0, separatorIndex)] = token.slice(separatorIndex + 1);
		binaryIndex += 1;
	}

	const binary = tokenized.tokens[binaryIndex];
	if (!binary) {
		return {
			ok: false,
			error: {
				code: "missing_binary",
				message: "Agent command must include a binary after any environment variables.",
			},
		};
	}

	return {
		ok: true,
		value: {
			env,
			binary,
			args: tokenized.tokens.slice(binaryIndex + 1),
		},
	};
}

export function getConfiguredAgentCommandIssue(command: string): string | null {
	const parsed = parseConfiguredAgentCommand(command);
	return parsed.ok ? null : parsed.error.message;
}
