/**
 * Parser registry & contract (NFR5 plugin model).
 *
 * Selection order: explicit hint → `canDetect` votes → junit-xml fallback last.
 * Adding a parser = registering one file; no existing parser edited (S8). Hard corruption
 * (unparseable JSON/XML) throws {@link ParseError} → surfaces as the AC4 diagnostic;
 * partial data is filled and flagged "未获取", never crashes (NFR2).
 *
 * @see openspec/changes/add-test-report-skill/design.md §3
 */
import type { TestRunResult } from "../models";

/** Input handed to every parser. */
export interface ParserInput {
	rawText: string;
	filePath?: string;
	/** Framework hint from detect.ts; can force selection when set. */
	frameworkHint?: string;
}

/**
 * One parser per framework/format. Implementations MUST throw {@link ParseError} on hard
 * corruption (unparseable JSON/XML) and MUST NOT throw on mere missing fields.
 */
export interface TestResultParser {
	readonly id: string; // "vitest-json" | "jest-json" | "pytest-junit" | "pytest-json" | "junit-xml"
	readonly displayName: string;
	/** Cheap discriminator: does this parser claim the given file/shape? */
	canDetect(input: ParserInput): boolean;
	/** Parse to normalized model. Throws ParseError on hard corruption. */
	parse(input: ParserInput): Promise<TestRunResult>;
}

/** Thrown on hard corruption (unparseable JSON/XML) — triggers the AC4 diagnostic path. */
export class ParseError extends Error {
	readonly parserId: string;
	readonly filePath?: string;
	constructor(parserId: string, message: string, filePath?: string) {
		super(message);
		this.name = "ParseError";
		this.parserId = parserId;
		this.filePath = filePath;
	}
}

/**
 * Registry. Selection order: explicit hint → canDetect votes → junit-xml fallback last.
 * Order-independent registration: a stub parser added later does not touch existing ones
 * (S8 isolation).
 */
export class ParserRegistry {
	private readonly parsers: TestResultParser[] = [];

	register(parser: TestResultParser): this {
		this.parsers.push(parser);
		return this;
	}

	/** List registered parser ids (for diagnostics / appendix). */
	list(): string[] {
		return this.parsers.map((p) => p.id);
	}

	select(input: ParserInput): TestResultParser {
		// 1. explicit hint match.
		if (input.frameworkHint) {
			const byHint = this.parsers.find((p) => p.id === input.frameworkHint);
			if (byHint) return byHint;
		}

		// 2. canDetect votes — first parser that claims the shape (in registration order).
		for (const p of this.parsers) {
			if (p.canDetect(input)) return p;
		}

		// 3. junit-xml fallback last (cross-language). Look it up explicitly so callers
		//    can register it anywhere without relying on registration order.
		const fallback = this.parsers.find((p) => p.id === "junit-xml");
		if (fallback) return fallback;

		throw new ParseError("registry", "no parser matched the input and no junit-xml fallback is registered", input.filePath);
	}

	/** Parse via the selected parser. Throws ParseError on hard corruption. */
	async parse(input: ParserInput): Promise<TestRunResult> {
		const parser = this.select(input);
		return parser.parse(input);
	}
}

/** Build the default registry with all v1.0 parsers registered. */
export async function buildDefaultRegistry(): Promise<ParserRegistry> {
	const { JunitXmlParser } = await import("./junit-xml");
	const { VitestJsonParser } = await import("./vitest-json");
	const { JestJsonParser } = await import("./jest-json");
	const { PytestJunitParser } = await import("./pytest-junit");
	const { PytestJsonParser } = await import("./pytest-json");
	const registry = new ParserRegistry();
	// Registration order biases canDetect ties; junit-xml is always last regardless.
	registry
		.register(new VitestJsonParser())
		.register(new JestJsonParser())
		.register(new PytestJunitParser())
		.register(new PytestJsonParser())
		.register(new JunitXmlParser());
	return registry;
}
