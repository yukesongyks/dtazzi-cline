/**
 * 解析器工厂
 *
 * 根据文件路径或内容自动检测测试框架类型，选择对应的解析器。
 * 采用插件式结构，新增解析器只需注册即可。
 */

import type { ParserInput, TestFramework, TestResultParser, TestRunResult } from "../types.js";
import { jestJsonParser } from "./jest-json.js";
import { junitXmlParser } from "./junit-xml.js";

// ─── 解析器注册表 ──────────────────────────────────────────────

/** 已注册的解析器列表（插件式结构） */
const parsers: TestResultParser[] = [jestJsonParser, junitXmlParser];

/**
 * 注册一个新的解析器
 * 注意：先注册的解析器优先级更高
 */
export function registerParser(parser: TestResultParser): void {
	parsers.unshift(parser);
}

/**
 * 获取所有已注册的解析器
 */
export function getRegisteredParsers(): ReadonlyArray<TestResultParser> {
	return parsers;
}

// ─── 框架检测 ──────────────────────────────────────────────────

/**
 * 根据文件扩展名检测框架类型
 */
function detectFrameworkByExtension(filePath: string): TestFramework | null {
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".json")) return "vitest"; // jest/vitest 都使用 JSON reporter
	if (lower.endsWith(".xml")) return "junit";
	return null;
}

/**
 * 根据文件内容特征检测框架类型
 */
function detectFrameworkByContent(content: string): TestFramework | null {
	try {
		const data = JSON.parse(content);
		if (data && typeof data === "object" && "testResults" in data) {
			return "vitest";
		}
	} catch {
		// JSON 解析失败，继续检查 XML
	}
	if (content.includes("<testsuite") || content.includes("<testsuites")) {
		return "junit";
	}
	return null;
}

// ─── 解析器选择 ────────────────────────────────────────────────

/**
 * 自动检测并选择解析器
 * @param input 解析器输入
 * @returns 匹配的解析器，或 null
 */
export function detectParser(input: ParserInput): TestResultParser | null {
	// 优先使用 canParse 检测
	for (const parser of parsers) {
		if (parser.canParse(input)) {
			return parser;
		}
	}
	return null;
}

/**
 * 使用指定框架的解析器，若未指定则自动检测
 * @param input 解析器输入
 * @param framework 可选：指定框架类型
 * @returns 解析结果
 */
export async function parseTestResults(
	input: ParserInput,
	framework?: TestFramework,
): Promise<TestRunResult> {
	let parser: TestResultParser | null;

	if (framework) {
		parser = parsers.find((p) => p.name === framework) ?? null;
		if (!parser) {
			throw new Error(`未找到框架 "${framework}" 的解析器，已注册的框架: ${parsers.map((p) => p.name).join(", ")}`);
		}
	} else {
		parser = detectParser(input);
	}

	if (!parser) {
		const detectedByExt = input.filePath
			? detectFrameworkByExtension(input.filePath)
			: null;
		const detectedByContent = input.content
			? detectFrameworkByContent(input.content)
			: null;

		throw new Error(
			`无法自动检测测试框架。文件: ${input.filePath || "(未提供)"}，` +
				`扩展名检测: ${detectedByExt ?? "未识别"}，内容检测: ${detectedByContent ?? "未识别"}。` +
				`已注册的解析器: ${parsers.map((p) => `${p.name} (${p.supportedFrameworks.join(", ")})`).join("; ")}`,
		);
	}

	return parser.parse(input);
}