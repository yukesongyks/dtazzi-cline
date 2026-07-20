// Test Report Skill · 运行器 (runner.ts) — Task 6-8
// 执行/解析双模式 + 执行失败诊断 + 覆盖率采集 + 敏感过滤
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, isAbsolute } from "node:path";
import type {
  ExecutionContext,
  GeneratedReport,
  ParseResult,
  ReportHeader,
  SkillConfig,
} from "./types.js";
import { TestReportError } from "./errors.js";
import { detectFramework } from "./detector.js";
import { registerParser, parseContent } from "./parsers/registry.js";
import { VitestParser } from "./parsers/vitest-parser.js";
import { JestParser } from "./parsers/jest-parser.js";
import { JUnitParser } from "./parsers/junit-parser.js";
import { defaultSanitize } from "./parsers/shared.js";
import { buildOutputFileName, TOOL_VERSION } from "./config.js";
import { formatGeneratedAt } from "./i18n.js";

// 注册全部解析器插件（NFR5）
registerParser(new VitestParser());
registerParser(new JestParser());
registerParser(new JUnitParser());

export interface RunOptions {
  cwd: string;
  config: SkillConfig;
  /** 解析模式：指定已有结果文件路径（覆盖 config.resultFile） */
  resultFile?: string;
  /** 执行模式：指定测试命令（覆盖 config.testCommand） */
  testCommand?: string;
}

/**
 * 主入口：按模式编排 解析 → 渲染 → 落盘。
 * 返回 GeneratedReport（含落盘路径）。
 */
export function run(opts: RunOptions): GeneratedReport {
  const ctx = resolveContext(opts);
  const parseResult = ctx.mode === "parse" ? runParseMode(ctx) : runExecuteMode(ctx);
  const report = assembleReport(ctx, parseResult, opts.config);
  writeReport(report, opts.config);
  return report;
}

function resolveContext(opts: RunOptions): ExecutionContext {
  const resultFileRaw = opts.resultFile ?? opts.config.resultFile;
  if (resultFileRaw && resultFileRaw !== "auto") {
    const abs = isAbsolute(resultFileRaw) ? resultFileRaw : resolve(opts.cwd, resultFileRaw);
    if (!existsSync(abs)) {
      throw new TestReportError("RESULT_FILE_NOT_FOUND", `结果文件不存在：${abs}`);
    }
    return { cwd: opts.cwd, resultFile: abs, mode: "parse" };
  }
  // 执行模式：识别框架与命令
  const det = detectFramework({ cwd: opts.cwd, userTestCommand: opts.testCommand ?? (opts.config.testCommand !== "auto" ? opts.config.testCommand : undefined) });
  return {
    cwd: opts.cwd,
    testCommand: det.testCommand,
    mode: "execute",
  };
}

// === 解析模式：不重复跑测试，直接读已有结果文件 ===
function runParseMode(ctx: ExecutionContext): ParseResult {
  if (!ctx.resultFile) {
    throw new TestReportError("RESULT_FILE_NOT_FOUND", "解析模式未提供结果文件路径。");
  }
  let raw: string;
  try {
    raw = readFileSync(ctx.resultFile, "utf8");
  } catch (e) {
    throw new TestReportError("RESULT_FILE_NOT_FOUND", `读取结果文件失败：${ctx.resultFile}`, { cause: e });
  }
  return parseContent(raw, { rawResultFilePath: ctx.resultFile, sanitize: defaultSanitize });
}

// === 执行模式：运行测试命令收集结果 ===
function runExecuteMode(ctx: ExecutionContext): ParseResult {
  const cmd = ctx.testCommand ?? "npm test";
  // Vitest/Jest 需要 JSON 报告器；此处用 JUnit XML 作为通用桥接（CI 友好）。
  // 默认尝试带 --reporter=junit 或等价参数；若命令已被用户显式指定则原样执行。
  const effectiveCmd = looksUserSpecified(cmd) ? cmd : wrapForJUnit(cmd);
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const out = execSync(effectiveCmd, {
      cwd: ctx.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    });
    stdout = out ?? "";
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number; message?: string };
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
    exitCode = err.status ?? 1;
    // 命令无法运行（非用例失败）→ TEST_COMMAND_FAILED；用例失败会写入结果文件，下方继续解析
    if (exitCode !== 0 && stdout.trim() === "" && stderr.trim() !== "") {
      throw new TestReportError(
        "TEST_COMMAND_FAILED",
        `测试命令无法运行：${cmd}`,
        { diagnostic: `exit=${exitCode}\nstderr(前300字)：${stderr.slice(0, 300)}` },
      );
    }
  }
  // 优先解析 stdout（JUnit XML 通常输出到 stdout）；若为空则尝试常见结果文件
  let parseSrc = stdout;
  let rawPath: string | undefined;
  if (parseSrc.trim() === "") {
    const guessed = ["test-results.xml", "junit.xml", "reports/junit.xml", "coverage/test-results.xml"]
      .map((p) => join(ctx.cwd, p))
      .find((p) => existsSync(p));
    if (guessed) {
      parseSrc = readFileSync(guessed, "utf8");
      rawPath = guessed;
    }
  }
  if (parseSrc.trim() === "") {
    throw new TestReportError(
      "RESULT_FILE_EMPTY",
      "执行模式未能收集到测试结果（stdout 为空且未发现结果文件）。",
      { diagnostic: `exit=${exitCode}, stderr(前300字)=${stderr.slice(0, 300)}` },
    );
  }
  return parseContent(parseSrc, { rawResultFilePath: rawPath, sanitize: defaultSanitize });
}

function looksUserSpecified(cmd: string): boolean {
  // 用户显式指定的命令通常含空格参数或特定标志
  return cmd.includes("--") || cmd.includes(" ") && !cmd.startsWith("npx vitest run") && !cmd.startsWith("npx jest");
}

function wrapForJUnit(cmd: string): string {
  if (/vitest/.test(cmd)) return `${cmd} --reporter=junit --outputFile=test-results.xml`;
  if (/jest/.test(cmd)) return `${cmd} --json --outputFile=test-results.json`;
  // 通用：假设目标项目已配置报告器，原样执行
  return cmd;
}

// === 报告组装 ===
function assembleReport(ctx: ExecutionContext, pr: ParseResult, config: SkillConfig): GeneratedReport {
  const now = Date.now();
  const det = ctx.mode === "execute"
    ? detectFramework({ cwd: ctx.cwd, userTestCommand: ctx.testCommand })
    : undefined;
  const header: ReportHeader = {
    projectName: readProjectName(ctx.cwd),
    generatedAt: formatGeneratedAt(new Date(now).toISOString()),
    testCommand: ctx.mode === "parse" ? `（解析模式）${ctx.resultFile ?? ""}` : (ctx.testCommand ?? ""),
    framework: pr.framework,
    frameworkVersion: pr.frameworkVersion ?? det?.frameworkVersion,
    environmentSummary: buildEnvSummary(),
  };
  // 输出路径
  const outDir = isAbsolute(config.outputPath) ? config.outputPath : resolve(ctx.cwd, config.outputPath);
  const fileName = buildOutputFileName(config.outputFormat, now);
  const outputPath = join(outDir, fileName);
  return {
    header,
    summary: pr.summary,
    failures: pr.failures,
    fileGroups: pr.fileGroups,
    coverage: pr.coverage,
    appendix: {
      rawResultFilePath: pr.rawResultFilePath ?? ctx.resultFile,
      toolVersion: TOOL_VERSION,
    },
    outputPath,
    outputFormat: config.outputFormat,
  };
}

function buildEnvSummary(): string {
  const nodeV = process.version;
  const plat = process.platform;
  const arch = process.arch;
  return `Node ${nodeV} / ${plat} ${arch}`;
}

function readProjectName(cwd: string): string {
  const pj = join(cwd, "package.json");
  if (!existsSync(pj)) return "(未获取)";
  try {
    const raw = readFileSync(pj, "utf8");
    const obj = JSON.parse(raw) as { name?: string };
    return obj.name ?? "(未获取)";
  } catch {
    return "(未获取)";
  }
}

// === 落盘 ===
function writeReport(report: GeneratedReport, config: SkillConfig): void {
  const dir = resolveDirOf(report.outputPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    throw new TestReportError("OUTPUT_WRITE_FAILED", `创建输出目录失败：${dir}`, { cause: e });
  }
  let content: string;
  switch (config.outputFormat) {
    case "json":
      content = JSON.stringify(report, null, 2);
      break;
    case "html":
      content = renderHtmlFallback(report);
      break;
    case "markdown":
    default:
      content = renderMarkdown(report, config);
      break;
  }
  try {
    writeFileSync(report.outputPath, content, "utf8");
  } catch (e) {
    throw new TestReportError("OUTPUT_WRITE_FAILED", `写入报告失败：${report.outputPath}`, { cause: e });
  }
}

function resolveDirOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx > 0 ? p.slice(0, idx) : ".";
}

// === Markdown 渲染（六板块固定顺序，Task 9）===
function renderMarkdown(report: GeneratedReport, config: SkillConfig): string {
  const L: string[] = [];
  L.push(`# 测试报告`);
  L.push("");
  // 1. 报告头
  L.push(`## 报告头`);
  L.push(`- **项目名称**：${report.header.projectName}`);
  L.push(`- **生成时间**：${report.header.generatedAt}`);
  L.push(`- **执行命令**：\`${report.header.testCommand}\``);
  L.push(`- **测试框架**：${report.header.framework}${report.header.frameworkVersion ? ` (${report.header.frameworkVersion})` : ""}`);
  L.push(`- **执行环境**：${report.header.environmentSummary}`);
  L.push("");
  // 2. 结果摘要
  L.push(`## 结果摘要`);
  const s = report.summary;
  const conclusion = s.conclusion === "passed" ? "✅ 通过" : "❌ 失败";
  L.push(`| 用例总数 | 通过 | 失败 | 跳过 | 通过率 | 总耗时 | 整体结论 |`);
  L.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  L.push(`| ${s.total} | ${s.passed} | ${s.failed} | ${s.skipped} | ${s.passRate}% | ${fmtDur(s.durationMs)} | ${conclusion} |`);
  if (config.failThreshold !== undefined && s.passRate < config.failThreshold) {
    L.push("");
    L.push(`> ❌ 不达标：通过率 ${s.passRate}% < 阈值 ${config.failThreshold}%`);
  }
  L.push("");
  // 3. 失败用例分析
  L.push(`## 失败用例分析`);
  if (report.failures.length === 0) {
    L.push("无失败用例。");
  } else {
    for (const f of report.failures) {
      L.push(`### ${f.name}`);
      L.push(`- **所属文件**：${f.filePath || "(未获取)"}`);
      L.push(`- **错误信息**：`);
      L.push("  ```");
      L.push(`  ${f.error?.message ?? "(未获取错误信息)"}`);
      L.push("  ```");
      if (f.error?.stack) {
        L.push(`- **堆栈摘要**：`);
        L.push("  ```");
        L.push(`  ${f.error.stack}`);
        L.push("  ```");
      }
      L.push("");
    }
  }
  // 4. 用例明细
  L.push(`## 用例明细`);
  const totalCases = report.fileGroups.reduce((a, g) => a + g.cases.length, 0);
  let shown = 0;
  const cap = 200;
  for (const g of report.fileGroups) {
    if (shown >= cap) break;
    L.push(`### ${g.filePath}`);
    L.push(`| 用例名 | 状态 | 耗时(ms) |`);
    L.push(`| --- | --- | --- |`);
    for (const c of g.cases) {
      if (shown >= cap) break;
      L.push(`| ${c.name} | ${statusLabel(c.status)} | ${c.durationMs} |`);
      shown += 1;
    }
    L.push("");
  }
  if (totalCases > cap) {
    L.push(`> （用例数超过 200 条，已截断展示前 200 条，完整明细见附录原始结果）`);
    L.push("");
  }
  // 5. 覆盖率
  L.push(`## 覆盖率`);
  if (!report.coverage || !report.coverage.totals.hasCoverage) {
    L.push("未获取。");
  } else {
    const ct = report.coverage.totals;
    L.push(`| 语句覆盖率 | 分支覆盖率 | 函数覆盖率 | 行覆盖率 |`);
    L.push(`| --- | --- | --- | --- |`);
    L.push(`| ${ct.statementsPct}% | ${ct.branchesPct}% | ${ct.functionsPct}% | ${ct.linesPct}% |`);
    L.push("");
    if (report.coverage.belowThresholdFiles.length > 0) {
      L.push(`**低于阈值的文件清单**：`);
      L.push(`| 文件 | 语句 | 分支 | 函数 | 行 |`);
      L.push(`| --- | --- | --- | --- | --- |`);
      for (const f of report.coverage.belowThresholdFiles) {
        L.push(`| ${f.filePath} | ${f.statementsPct}% | ${f.branchesPct}% | ${f.functionsPct}% | ${f.linesPct}% |`);
      }
    } else {
      L.push("无低于阈值的文件。");
    }
  }
  L.push("");
  // 6. 附录
  L.push(`## 附录`);
  L.push(`- **原始结果文件路径**：${report.appendix.rawResultFilePath ?? "(未获取)"}`);
  L.push(`- **生成工具版本**：${report.appendix.toolVersion}`);
  L.push("");
  return L.join("\n");
}

function statusLabel(s: string): string {
  switch (s) {
    case "passed": return "✅ 通过";
    case "failed": return "❌ 失败";
    case "skipped": return "⏭️ 跳过";
    case "todo": return "📝 待办";
    default: return "❓ 未知";
  }
}

function fmtDur(ms: number): string {
  if (!ms || ms <= 0) return "(未获取)";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

// HTML 最小兜底（非本期重点，保证输出格式可切换）
function renderHtmlFallback(report: GeneratedReport): string {
  const md = renderMarkdown(report, { ...({} as SkillConfig), outputFormat: "markdown" });
  return `<!doctype html><html><head><meta charset="utf-8"><title>测试报告</title></head><body><pre>${escapeHtml(md)}</pre></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { renderMarkdown };
