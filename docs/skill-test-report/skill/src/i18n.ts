// Test Report Skill · i18n 字典 (i18n.ts) — Q2 首期 zh-CN
export type Locale = "zh-CN";

const zhCN: Record<string, string> = {
  report_title: "测试报告",
  project_name: "项目名称",
  generated_at: "生成时间",
  test_command: "执行命令",
  framework: "测试框架",
  framework_version: "框架版本",
  environment: "执行环境",
  summary: "结果摘要",
  total: "用例总数",
  passed: "通过",
  failed: "失败",
  skipped: "跳过",
  todo: "待办",
  unknown: "未知",
  pass_rate: "通过率",
  duration: "总耗时",
  conclusion: "整体结论",
  passed_label: "✅ 通过",
  failed_label: "❌ 失败",
  not_met: "❌ 不达标",
  threshold_note: "通过率 {0}% < 阈值 {1}%",
  failure_analysis: "失败用例分析",
  no_failures: "无失败用例",
  case_name: "用例名",
  file_path: "所属文件",
  error_message: "错误信息",
  stack: "堆栈摘要",
  details: "用例明细",
  truncated_note: "（用例数超过 200 条，已截断展示前 200 条，完整明细见附录原始结果）",
  coverage: "覆盖率",
  coverage_not_available: "未获取",
  coverage_statements: "语句覆盖率",
  coverage_branches: "分支覆盖率",
  coverage_functions: "函数覆盖率",
  coverage_lines: "行覆盖率",
  coverage_below_threshold: "低于阈值的文件清单",
  coverage_no_below: "无低于阈值的文件",
  appendix: "附录",
  raw_result_file: "原始结果文件路径",
  tool_version: "生成工具版本",
  not_available: "未获取",
  parse_mode_prefix: "（解析模式）",
  duration_ms: "{0} ms",
  appendix_missing: "未获取",
};

export function t(key: string, ...args: (string | number)[]): string {
  let s = zhCN[key] ?? key;
  args.forEach((v, i) => {
    s = s.replace(`{${i}}`, String(v));
  });
  return s;
}

export function formatGeneratedAt(isoUtc: string): string {
  // ISO8601 → zh-CN 习惯格式
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())} UTC`;
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return t("not_available");
  if (ms >= 1000) {
    const s = (ms / 1000).toFixed(2);
    return `${s} s`;
  }
  return t("duration_ms", ms);
}
