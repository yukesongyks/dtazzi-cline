/** 默认敏感信息过滤（NFR3）：过滤疑似密钥/token/环境变量值行 */
const SECRET_PATTERNS = [
    /(?:api[_-]?key|secret|token|password|passwd|pwd|authorization|auth)[=:]\s*\S+/gi,
    /AKIA[0-9A-Z]{16}/g, // AWS key id
    /ghp_[A-Za-z0-9]{36}/g, // GitHub PAT
    /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style key
    /\b[A-Za-z0-9+/]{40,}\b/g, // 长 base64 簇
];
export function defaultSanitize(text) {
    if (!text)
        return "";
    let out = text;
    for (const re of SECRET_PATTERNS) {
        out = out.replace(re, "[已过滤]");
    }
    // 过滤环境变量值形如 KEY=value（KEY 在敏感词表）
    out = out.replace(/^(?:[A-Z][A-Z0-9_]*)=(.+)$/gm, (m) => `${m.split("=")[0]}=[已过滤]`);
    return out;
}
/** 截断堆栈至可读长度（保留前若干关键行） */
export function truncateStack(stack, maxLines = 12, maxChars = 800) {
    const lines = stack.split(/\r?\n/).slice(0, maxLines);
    let joined = lines.join("\n");
    if (joined.length > maxChars)
        joined = `${joined.slice(0, maxChars)}\n...(已截断)`;
    return joined;
}
export function buildError(rawMessage, rawStack, sanitize) {
    const message = sanitize(rawMessage ?? "") || "（未获取错误信息）";
    const err = { message };
    if (rawStack && rawStack.trim() !== "") {
        err.stack = truncateStack(sanitize(rawStack));
    }
    return err;
}
/** 稳定用例 id：filePath::name；两者皆空时用序号兜底 */
export function buildTestCaseId(filePath, name, index) {
    const fp = (filePath ?? "").trim();
    const nm = (name ?? "").trim();
    if (fp && nm)
        return `${fp}::${nm}`;
    if (nm)
        return nm;
    return `case-${index}`;
}
/** 由文件分组汇总 TestSummary */
export function summarizeFromGroups(fileGroups, totalDurationMs) {
    let total = 0, passed = 0, failed = 0, skipped = 0, todo = 0, unknown = 0, dur = 0;
    const failures = [];
    for (const g of fileGroups) {
        for (const c of g.cases) {
            total += 1;
            dur += c.durationMs;
            switch (c.status) {
                case "passed":
                    passed += 1;
                    break;
                case "failed":
                    failed += 1;
                    failures.push(c);
                    break;
                case "skipped":
                    skipped += 1;
                    break;
                case "todo":
                    todo += 1;
                    break;
                default:
                    unknown += 1;
            }
        }
    }
    const passRate = total > 0 ? (passed / total) * 100 : 0;
    const conclusion = failed > 0 ? "failed" : "passed";
    return {
        total,
        passed,
        failed,
        skipped,
        todo,
        unknown,
        passRate: round1(passRate),
        durationMs: totalDurationMs > 0 ? totalDurationMs : dur,
        conclusion,
    };
}
export function round1(n) {
    return Math.round(n * 10) / 10;
}
export function durationMsFromSeconds(s) {
    if (s == null || Number.isNaN(s))
        return 0;
    return Math.round(s * 1000);
}
export function durationMsFromMs(ms) {
    if (ms == null || Number.isNaN(ms))
        return 0;
    return Math.round(ms);
}
