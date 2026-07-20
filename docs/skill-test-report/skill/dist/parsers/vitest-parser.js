import { TestReportError } from "../errors.js";
import { buildError, buildTestCaseId, defaultSanitize, durationMsFromMs, summarizeFromGroups, } from "./shared.js";
export class VitestParser {
    id = "vitest";
    sniff(content) {
        // Vitest JSON: 顶层为数组/对象，含 numTotalTestSuites 或 suite 结构
        return /"numTotalTests"|"numTotalTestSuites"|"testResults"|"numPassedTests"/.test(content) === false &&
            /"tasks"\s*:/.test(content);
    }
    parse(content, opts) {
        const sanitize = opts?.sanitize ?? defaultSanitize;
        let data;
        try {
            data = JSON.parse(content);
        }
        catch (e) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "Vitest JSON 解析失败：不是合法 JSON。", { cause: e, diagnostic: "JSON.parse 抛错，内容可能损坏。" });
        }
        const suites = asArray(data) ?? extractSuites(data);
        if (!suites || suites.length === 0) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "Vitest JSON 解析失败：未发现测试套件（tasks）。", { diagnostic: "嗅探匹配 tasks 但结构不符合预期。" });
        }
        const fileGroups = [];
        let overallDuration = 0;
        for (const s of suites) {
            const cases = collectCases(s, sanitize);
            const dur = durationMsFromMs(s.duration);
            overallDuration += dur;
            const filePath = s.filepath ?? s.name ?? "";
            fileGroups.push({
                filePath: filePath || "(unknown file)",
                cases,
                durationMs: dur + sumCasesDuration(cases),
            });
        }
        const failures = [];
        for (const g of fileGroups) {
            for (const c of g.cases)
                if (c.status === "failed" && c.error)
                    failures.push(c);
        }
        const summary = summarizeFromGroups(fileGroups, overallDuration);
        return {
            framework: "vitest",
            summary,
            fileGroups,
            failures,
            rawResultFilePath: opts?.rawResultFilePath,
        };
    }
}
function collectCases(suite, sanitize, idxSeed = { i: 0 }) {
    const out = [];
    const tasks = suite.tasks ?? [];
    for (const t of tasks) {
        out.push(toCase(t, suite, idxSeed, sanitize));
        // 嵌套 tasks（describe 内 it）
        if (t.tasks && t.tasks.length > 0) {
            for (const sub of t.tasks)
                out.push(toCase(sub, suite, idxSeed, sanitize));
        }
    }
    return out;
}
function toCase(t, suite, idx, sanitize) {
    idx.i += 1;
    const status = mapStatus(t.mode, t.status);
    const filePath = suite.filepath ?? "";
    const name = t.name ?? `(anonymous-${idx.i})`;
    const error = status === "failed" && t.error ? buildError(t.error.message ?? "", t.error.stack, sanitize) : undefined;
    return {
        id: buildTestCaseId(filePath, name, idx.i),
        name,
        filePath,
        status,
        durationMs: durationMsFromMs(t.duration),
        error,
    };
}
function mapStatus(mode, status) {
    if (mode === "skip")
        return "skipped";
    if (mode === "todo")
        return "todo";
    switch (status) {
        case "passed":
        case "failed":
        case "skipped":
        case "todo":
            return status;
        default:
            return "unknown";
    }
}
function sumCasesDuration(cases) {
    return cases.reduce((a, c) => a + (c.durationMs || 0), 0);
}
function asArray(data) {
    if (Array.isArray(data))
        return data;
    return null;
}
function extractSuites(data) {
    if (typeof data !== "object" || data === null)
        return null;
    const d = data;
    const tasks = d.tasks;
    if (Array.isArray(tasks))
        return [{ name: d.name, filepath: d.filepath, duration: d.duration, tasks: tasks }];
    return null;
}
