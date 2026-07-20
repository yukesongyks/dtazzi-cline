/**
 * §1 report header — project name, generation time, command, framework/version,
 * sanitized env summary.
 *
 * The timestamp is the ONLY non-deterministic field and is confined here (NFR4/S7).
 * @see openspec/changes/add-test-report-skill/design.md §5
 */
import { sanitizeEnvSummary } from "../../security/redact";

export function renderHeader(args: {
	project: string;
	generatedAt: string;
	command?: string;
	framework?: string;
	frameworkVersion?: string;
	env?: string;
}): string {
	const framework = args.framework ?? "未获取";
	const frameworkLine = args.frameworkVersion
		? `${framework} (${args.frameworkVersion})`
		: framework;
	const env = args.env ?? sanitizeEnvSummary();
	const lines = [
		"# 测试报告",
		"",
		"- 项目： " + args.project,
		"- 生成时间： " + args.generatedAt,
		"- 执行命令： " + (args.command ?? "未获取"),
		"- 框架/版本： " + frameworkLine,
		"- 执行环境： " + env,
	];
	return lines.join("\n");
}
