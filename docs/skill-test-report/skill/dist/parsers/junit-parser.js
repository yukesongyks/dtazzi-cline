import { TestReportError } from "../errors.js";
import { buildError, buildTestCaseId, defaultSanitize, durationMsFromSeconds, summarizeFromGroups, } from "./shared.js";
export class JUnitParser {
    id = "junit";
    sniff(content) {
        return /^\s*(?:<\?xml[^>]*\?>\s*)?<testsuites?\b/i.test(content);
    }
    parse(content, opts) {
        const sanitize = opts?.sanitize ?? defaultSanitize;
        let root;
        try {
            root = parseXml(content);
        }
        catch (e) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "JUnit XML 解析失败：XML 格式错误。", { cause: e, diagnostic: e instanceof Error ? e.message : String(e) });
        }
        const suites = getElementsByTagName(root, "testsuite");
        if (suites.length === 0) {
            throw new TestReportError("PARSE_FORMAT_INVALID", "JUnit XML 解析失败：未发现 testsuite 元素。");
        }
        const fileGroups = [];
        let idx = 0;
        let overallDurationSec = 0;
        for (const suite of suites) {
            const filePath = suite.getAttribute("file") || suite.getAttribute("name") || suite.getAttribute("package") || "";
            const cases = [];
            const directTc = suite.children.filter((c) => c.tagName === "testcase");
            const nodes = directTc.length > 0 ? directTc : getElementsByTagName(suite, "testcase");
            for (const tc of nodes) {
                idx += 1;
                const name = tc.getAttribute("name") || `(anonymous-${idx})`;
                const cls = tc.getAttribute("classname") || "";
                const fp = filePath || cls.split(".").slice(-1)[0] || "";
                const dur = durationMsFromSeconds(num(tc.getAttribute("time")));
                const status = inferStatus(tc);
                const error = status === "failed" ? extractError(tc, sanitize) : undefined;
                cases.push({
                    id: buildTestCaseId(fp, name, idx),
                    name,
                    filePath: fp,
                    status,
                    durationMs: dur,
                    error,
                });
            }
            overallDurationSec += num(suite.getAttribute("time"));
            fileGroups.push({
                filePath: filePath || "(unknown suite)",
                cases,
                durationMs: durationMsFromSeconds(num(suite.getAttribute("time"))) || cases.reduce((a, c) => a + c.durationMs, 0),
            });
        }
        const failures = [];
        for (const g of fileGroups)
            for (const c of g.cases)
                if (c.status === "failed" && c.error)
                    failures.push(c);
        const summary = summarizeFromGroups(fileGroups, durationMsFromSeconds(overallDurationSec));
        return {
            framework: "junit",
            summary,
            fileGroups,
            failures,
            rawResultFilePath: opts?.rawResultFilePath,
        };
    }
}
function inferStatus(tc) {
    const has = (name) => tc.children.some((c) => c.tagName === name);
    if (has("failure") || has("error"))
        return "failed";
    if (has("skipped"))
        return "skipped";
    const st = tc.getAttribute("status");
    if (st) {
        const lower = st.toLowerCase();
        if (lower === "fail" || lower === "failed")
            return "failed";
        if (lower === "skip" || lower === "skipped")
            return "skipped";
        if (lower === "pass" || lower === "passed")
            return "passed";
    }
    return "passed";
}
function extractError(tc, sanitize) {
    const failure = tc.children.find((c) => c.tagName === "failure") ?? tc.children.find((c) => c.tagName === "error");
    const message = failure?.getAttribute("message") ?? failure?.textContent ?? "";
    const stack = failure?.textContent ?? undefined;
    return buildError(message, stack && stack.trim() !== message.trim() ? stack : undefined, sanitize);
}
function num(s) {
    if (!s)
        return 0;
    const n = Number(s);
    return Number.isNaN(n) ? 0 : n;
}
function getElementsByTagName(root, name) {
    const lower = name.toLowerCase();
    const out = [];
    const walk = (e) => {
        if (e.tagName === lower)
            out.push(e);
        for (const c of e.children)
            walk(c);
    };
    for (const c of root.children)
        walk(c);
    return out;
}
function newEl(tagName) {
    const el = {
        tagName,
        attributes: {},
        children: [],
        textContent: "",
        getAttribute(name) {
            return this.attributes[name] ?? "";
        },
    };
    return el;
}
function parseXml(xml) {
    const root = newEl("#root");
    const stack = [root];
    const tagRe = /<(\/?)([a-zA-Z_][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let lastIdx = 0;
    let m;
    let textBuffer = "";
    while ((m = tagRe.exec(xml)) !== null) {
        if (m.index > lastIdx) {
            textBuffer += xml.slice(lastIdx, m.index);
        }
        lastIdx = tagRe.lastIndex;
        const closeSlash = m[1];
        const name = m[2].toLowerCase();
        const attrsRaw = m[3];
        if (closeSlash) {
            const cur = stack.pop() ?? root;
            cur.textContent = (cur.textContent ?? "") + decodeEntities(textBuffer).trim();
            textBuffer = "";
            continue;
        }
        const el = newEl(name);
        el.attributes = parseAttrs(attrsRaw);
        if (/\/\s*$/.test(attrsRaw)) {
            stack[stack.length - 1].children.push(el);
            textBuffer = "";
            continue;
        }
        stack[stack.length - 1].children.push(el);
        stack.push(el);
        textBuffer = "";
    }
    const top = root.children[0];
    if (!top) {
        throw new Error("XML 无根元素");
    }
    return top;
}
function parseAttrs(raw) {
    const out = {};
    const re = /([a-zA-Z_][\w.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        out[m[1].toLowerCase()] = m[2].slice(1, -1);
    }
    return out;
}
function decodeEntities(s) {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
