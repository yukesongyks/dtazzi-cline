---
name: test-report
version: 0.1.0
description: Parse test results (Vitest/Jest JSON, JUnit XML) and generate standardized Markdown test reports with summary, failure analysis, and coverage sections.
activation_mode: manual
tags: ["testing", "report", "vitest", "jest", "junit"]
---

# Test Report Skill

解析测试结果并生成标准化测试报告。

## 触发意图
- "生成测试报告"
- "跑一下测试并出报告"
- "把这个 junit.xml 转成测试报告"

## 工作模式
- 执行模式：触发测试运行并收集结果
- 解析模式：直接解析已有结果文件，不重复跑测试

## 输出
默认 Markdown，落盘 `reports/test-report-<YYYYMMDD-HHmmss>.md`。
