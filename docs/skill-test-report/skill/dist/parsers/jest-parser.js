import { TestReportError } from "../errors.js";
import { buildError, buildTestCaseId, defaultSanitize, durationMsFromMs, round1, summarizeFromGroups, } from "./shared.js";
export class JestParser {
    id = "jest";
    sniff(content) {
        return (/"numTotalTests"\s*:/.test(content) &&
            /"testResults"\s*:/.test(content) &&
            /"assertionResults"\s*:/.test(content));
    }
    parse(content, opts) {
        const sanitize = opts?.sanitize ?? defaultSanitize;
        let data;
        try {
            data = JSON.parse(content);
        }
        catch (e) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "Jest JSON 解析失败：不是合法 JSON。", { cause: e });
        }
        const rawResults = data.testResults ?? [];
        if (rawResults.length === 0 && (data.numTotalTests ?? 0) === 0) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "Jest JSON 解析失败：testResults 为空且无用例数据。");
        }
        const fileGroups = [];
        let idx = 0;
        for (const r of rawResults) {
            const filePath = r.name ?? "";
            const cases = [];
            for (const a of r.assertionResults ?? []) {
                idx += 1;
                const status = mapStatus(a.status);
                const name = a.fullName ?? a.title ?? `(anonymous-${idx})`;
                const failureMsg = a.failureMessages?.[0];
                const error = status === "failed" && failureMsg ? buildError(failureMsg, undefined, sanitize) : undefined;
                cases.push({
                    id: buildTestCaseId(filePath, name, idx),
                    name,
                    filePath,
                    status,
                    durationMs: durationMsFromMs(a.duration),
                    error,
                });
            }
            fileGroups.push({
                filePath: filePath || "(unknown file)",
                cases,
                durationMs: groupDuration(r, cases),
            });
        }
        const failures = [];
        for (const g of fileGroups)
            for (const c of g.cases)
                if (c.status === "failed" && c.error)
                    failures.push(c);
        const overallDuration = computeOverallDuration(rawResults);
        const summary = summarizeFromGroups(fileGroups, overallDuration);
        const coverage = extractCoverage(data);
        return {
            framework: "jest",
            frameworkVersion: undefined,
            summary,
            fileGroups,
            failures,
            coverage,
            rawResultFilePath: opts?.rawResultFilePath,
        };
    }
}
function mapStatus(s) {
    switch (s) {
        case "passed":
            return "passed";
        case "failed":
            return "failed";
        case "pending":
        case "skipped":
            return "skipped";
        case "todo":
            return "todo";
        default:
            return "unknown";
    }
}
function groupDuration(r, cases) {
    if (r.startTime && r.endTime)
        return Math.max(0, r.endTime - r.startTime);
    return cases.reduce((a, c) => a + (c.durationMs || 0), 0);
}
function computeOverallDuration(results) {
    let min = Infinity;
    let max = 0;
    for (const r of results) {
        if (r.startTime)
            min = Math.min(min, r.startTime);
        if (r.endTime)
            max = Math.max(max, r.endTime);
    }
    if (min === Infinity || max === 0)
        return 0;
    return Math.max(0, max - min);
}
function extractCoverage(data) {
    const map = data.coverageMap;
    if (!map || Object.keys(map).length === 0)
        return undefined;
    let s = 0, b = 0, f = 0, l = 0, n = 0;
    const files = [];
    const threshold = data.coverageThreshold?.global ?? {};
    for (const [p, c] of Object.entries(map)) {
        const sp = c.statements?.pct ?? 0;
        const bp = c.branches?.pct ?? 0;
        const fp = c.functions?.pct ?? 0;
        const lp = c.lines?.pct ?? 0;
        s += sp;
        b += bp;
        f += fp;
        l += lp;
        n += 1;
        files.push({
            filePath: p,
            statementsPct: round1(sp),
            branchesPct: round1(bp),
            functionsPct: round1(fp),
            linesPct: round1(lp),
        });
    }
    const totals = {
        statementsPct: n > 0 ? round1(s / n) : 0,
        branchesPct: n > 0 ? round1(b / n) : 0,
        functionsPct: n > 0 ? round1(f / n) : 0,
        linesPct: n > 0 ? round1(l / n) : 0,
        hasCoverage: n > 0,
    };
    const below = files.filter((file) => {
        const st = threshold.statements;
        const br = threshold.branches;
        const fu = threshold.functions;
        const li = threshold.lines;
        return ((st !== undefined && file.statementsPct < st) ||
            (br !== undefined && file.branchesPct < br) ||
            (fu !== undefined && file.functionsPct < fu) ||
            (li !== undefined && file.linesPct < li));
    });
    return { totals, belowThresholdFiles: below };
}
