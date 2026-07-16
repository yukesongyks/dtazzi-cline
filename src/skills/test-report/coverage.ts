/**
 * 覆盖率数据收集
 *
 * 支持 coverage=auto/on/off 三种策略。
 * 主要来源：Jest/Vitest 的 coverage/coverage-summary.json
 */

import * as fs from "fs";
import * as path from "path";
import type { CoverageReport, CoverageSummary, CoverageFileDetail } from "./types";

/** coverage-summary.json 中 Jest/Vitest 的标准结构 */
interface CoverageSummaryJson {
  total?: {
    statements?: { pct?: number };
    branches?: { pct?: number };
    functions?: { pct?: number };
    lines?: { pct?: number };
  };
  [filePath: string]: {
    statements?: { pct?: number };
    branches?: { pct?: number };
    functions?: { pct?: number };
    lines?: { pct?: number };
  } | undefined;
}

/**
 * 过滤出低于阈值的文件清单
 */
export function getFilesBelowThreshold(
  files: CoverageFileDetail[],
  threshold: number
): CoverageFileDetail[] {
  return files
    .filter((f) => {
      const avg =
        (f.statements + f.branches + f.functions + f.lines) / 4;
      return avg < threshold;
    })
    .sort((a, b) => {
      const avgA = (a.statements + a.branches + a.functions + a.lines) / 4;
      const avgB = (b.statements + b.branches + b.functions + b.lines) / 4;
      return avgA - avgB;
    });
}

/**
 * 从 coverage-summary.json 解析覆盖率数据
 */
function parseCoverageSummary(json: CoverageSummaryJson): CoverageReport {
  const total = json.total;

  const summary: CoverageSummary = {
    statements: Math.round((total?.statements?.pct ?? 0) * 100) / 100,
    branches: Math.round((total?.branches?.pct ?? 0) * 100) / 100,
    functions: Math.round((total?.functions?.pct ?? 0) * 100) / 100,
    lines: Math.round((total?.lines?.pct ?? 0) * 100) / 100,
  };

  const files: CoverageFileDetail[] = [];

  for (const [filePath, data] of Object.entries(json)) {
    if (filePath === "total" || !data) continue;

    files.push({
      filePath,
      statements: Math.round((data.statements?.pct ?? 0) * 100) / 100,
      branches: Math.round((data.branches?.pct ?? 0) * 100) / 100,
      functions: Math.round((data.functions?.pct ?? 0) * 100) / 100,
      lines: Math.round((data.lines?.pct ?? 0) * 100) / 100,
    });
  }

  return { summary, files };
}

/**
 * 收集覆盖率数据
 *
 * @param coverageMode 覆盖率策略
 * @returns CoverageReport 或 null（覆盖率不可用时）
 */
export function collectCoverage(
  coverageMode: "auto" | "on" | "off"
): CoverageReport | null {
  if (coverageMode === "off") {
    return null;
  }

  const cwd = process.cwd();
  const summaryPath = path.join(cwd, "coverage", "coverage-summary.json");

  if (fs.existsSync(summaryPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
      return parseCoverageSummary(json);
    } catch {
      if (coverageMode === "on") {
        throw new Error(
          `覆盖率数据文件存在但无法解析: ${summaryPath}`
        );
      }
      return null;
    }
  }

  if (coverageMode === "on") {
    throw new Error(
      `未找到覆盖率数据文件: ${summaryPath}。请确保测试运行时启用了覆盖率收集。`
    );
  }

  return null;
}