import type { GeneratedReport, SkillConfig } from "./types.js";
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
export declare function run(opts: RunOptions): GeneratedReport;
declare function renderMarkdown(report: GeneratedReport, config: SkillConfig): string;
export { renderMarkdown };
