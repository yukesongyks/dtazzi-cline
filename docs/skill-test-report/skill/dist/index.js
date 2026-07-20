#!/usr/bin/env node
// Test Report Skill · CLI 主入口 (index.ts) — Task 10
import { run } from "./runner.js";
import { DEFAULT_CONFIG } from "./config.js";
import { TestReportError } from "./errors.js";
function parseArgs(argv) {
    const config = {};
    let cwd = process.cwd();
    let resultFile;
    let testCommand;
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case "--cwd":
                cwd = argv[++i];
                break;
            case "--result-file":
                resultFile = argv[++i];
                config.resultFile = argv[i];
                break;
            case "--test-command":
                testCommand = argv[++i];
                config.testCommand = argv[i];
                break;
            case "--output-format":
                config.outputFormat = argv[++i] ?? "markdown";
                break;
            case "--output-path":
                config.outputPath = argv[++i];
                break;
            case "--coverage":
                config.coverage = argv[++i] ?? "auto";
                break;
            case "--fail-threshold":
                config.failThreshold = Number(argv[++i]);
                break;
            case "-h":
            case "--help":
                printHelp();
                process.exit(0);
            default:
                console.error(`未知参数：${a}`);
                printHelp();
                process.exit(2);
        }
    }
    return { cwd, config, resultFile, testCommand };
}
function printHelp() {
    console.log(`test-report-skill — 解析测试结果并生成标准化测试报告

用法：test-report [options]

选项：
  --cwd <path>              目标项目目录（默认当前目录）
  --result-file <path>      解析模式：已有结果文件路径
  --test-command <cmd>      执行模式：测试命令
  --output-format <fmt>     markdown | html | json（默认 markdown）
  --output-path <dir>       输出目录（默认 reports/）
  --coverage <mode>         auto | on | off（默认 auto）
  --fail-threshold <pct>    通过率阈值 0-100
  -h, --help                显示帮助`);
}
function main() {
    const { cwd, config, resultFile, testCommand } = parseArgs(process.argv);
    const merged = { ...DEFAULT_CONFIG, ...config };
    try {
        const report = run({ cwd, config: merged, resultFile, testCommand });
        console.log(`测试报告已生成：${report.outputPath}`);
        console.log(`结论：${report.summary.conclusion === "passed" ? "✅ 通过" : "❌ 失败"} | 通过率 ${report.summary.passRate}% (${report.summary.passed}/${report.summary.total})`);
    }
    catch (e) {
        if (e instanceof TestReportError) {
            console.error(`[错误] ${e.code}：${e.message}`);
            if (e.diagnostic)
                console.error(`  诊断：${e.diagnostic}`);
            process.exit(1);
        }
        throw e;
    }
}
main();
