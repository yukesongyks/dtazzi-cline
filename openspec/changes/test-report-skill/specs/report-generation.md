# Spec: Report Generation (报告生成)

## Overview
定义报告生成器的行为规范，包括 Markdown 报告结构、输出格式、文件落盘、以及用户反馈。

## FR2: 报告内容结构

报告必须包含以下章节，顺序固定：

### 1. 报告头
### 2. 结果摘要
### 3. 失败用例分析
### 4. 用例明细
### 5. 覆盖率
### 6. 附录

### Scenario: 完整报告生成（全部通过）
- **Given** 解析结果包含 42 个用例，全部通过，覆盖率数据可用
- **When** 生成 Markdown 报告
- **Then** 报告包含所有 6 个章节
- **And** 结果摘要中通过率 = 100%，结论为 ✅
- **And** 失败用例分析章节标注"无失败用例"或省略
- **And** 覆盖率章节展示语句/分支/函数/行覆盖率

### Scenario: 含失败用例的报告
- **Given** 解析结果包含 50 个用例，5 个失败，3 个跳过
- **When** 生成 Markdown 报告
- **Then** 结果摘要中通过率 = 84%，结论为 ❌
- **And** 失败用例分析章节包含 5 条失败详情
- **And** 每条失败含：用例名、所属文件、错误信息、堆栈关键行（≤10 行）

### Scenario: 超过 200 条用例截断
- **Given** 解析结果包含 350 个用例
- **When** 生成 Markdown 报告
- **Then** 用例明细章节展示前 200 条
- **And** 末尾标注"（共 350 条用例，已截断至前 200 条）"

### Scenario: 覆盖率不可用
- **Given** 解析结果中 `coverage` 为 undefined
- **When** 生成 Markdown 报告
- **Then** 覆盖率章节标注"未获取"
- **And** 其余章节正常渲染

## FR3: 输出格式与落盘

### Scenario: 默认输出路径
- **Given** 用户未指定 `output_path`
- **When** 生成报告
- **Then** 报告写入 `reports/test-report-<YYYYMMDD-HHmmss>.md`
- **And** 若 `reports/` 目录不存在，自动创建

### Scenario: 用户指定输出路径
- **Given** 用户指定 `output_path: "./my-reports/"`
- **When** 生成报告
- **Then** 报告写入 `./my-reports/test-report-<YYYYMMDD-HHmmss>.md`

### Scenario: 用户指定完整文件名
- **Given** 用户指定 `output_path: "./my-reports/ci-report.md"`
- **When** 生成报告
- **Then** 报告写入 `./my-reports/ci-report.md`（不追加时间戳）

### Scenario: 输出目录无写权限
- **Given** 用户指定的输出路径所在目录无写权限
- **When** 生成报告
- **Then** 返回错误："无法写入报告: <路径>，权限不足"

## FR3.3: 用户反馈

### Scenario: 全部通过的反馈
- **Given** 测试全部通过（通过率 100%）
- **When** 报告生成完成
- **Then** 向用户返回：
  - 报告路径
  - "✅ 全部通过: 42/42 用例通过，通过率 100%"

### Scenario: 含失败的反馈
- **Given** 测试有 5 个失败
- **When** 报告生成完成
- **Then** 向用户返回：
  - 报告路径
  - "❌ 5 个失败: 45/50 用例通过，通过率 90%"
  - 附最关键的 1~3 条失败原因摘要

### Scenario: 无测试用例
- **Given** 解析结果包含 0 个用例
- **When** 报告生成完成
- **Then** 向用户返回：
  - 报告路径
  - "⚠️ 未发现测试用例，请检查测试配置"

## FR4.2: 可配置项

### Scenario: fail_threshold 触发
- **Given** 用户设置 `fail_threshold: 80`
- **And** 实际通过率为 75%
- **When** 生成报告
- **Then** 报告结论标注为"不达标（通过率 75% < 阈值 80%）"

### Scenario: fail_threshold 未触发
- **Given** 用户设置 `fail_threshold: 80`
- **And** 实际通过率为 85%
- **When** 生成报告
- **Then** 报告结论正常显示 ✅

## NFR4: 幂等性

### Scenario: 同一结果文件多次生成
- **Given** 同一结果文件，相同配置
- **When** 连续生成两次报告
- **Then** 两份报告内容一致（时间戳字段除外）
- **And** 报告摘要数据完全相同