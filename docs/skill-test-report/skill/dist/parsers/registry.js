import { TestReportError } from "../errors.js";
const registry = [];
/** 注册一个解析器插件（幂等：同 id 不重复注册） */
export function registerParser(plugin) {
    if (registry.some((p) => p.id === plugin.id))
        return;
    registry.push(plugin);
}
/** 获取已注册插件列表（只读快照） */
export function listParsers() {
    return registry.slice();
}
/** 嗅探：依据内容自动选择首个可解析的插件 */
export function detectByContent(content) {
    return registry.find((p) => {
        try {
            return p.sniff(content);
        }
        catch {
            return false;
        }
    });
}
/** 按框架 id 取插件 */
export function getParser(id) {
    return registry.find((p) => p.id === id);
}
/** 统一解析入口：内容嗅探 → parse，失败抛明确错误 */
export function parseContent(content, opts) {
    const trimmed = content.trim();
    if (trimmed === "") {
        throw new TestReportError("RESULT_FILE_EMPTY", "结果文件为空，无法解析。");
    }
    const plugin = detectByContent(trimmed);
    if (!plugin) {
        throw new TestReportError("PARSE_FORMAT_INVALID", "无法识别结果文件格式：未匹配任何已注册解析器。", { diagnostic: summarizeForDiagnostic(trimmed) });
    }
    return plugin.parse(trimmed, opts);
}
function summarizeForDiagnostic(content) {
    // 诊断信息只取前 200 字符，且不做敏感输出
    const safe = content.slice(0, 200).replace(/\s+/g, " ");
    return `内容片段(前200字符)：${safe}`;
}
