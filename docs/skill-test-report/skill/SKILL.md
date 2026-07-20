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

## 报告结构（顺序固定）
1. 报告头（项目名/生成时间/执行命令/框架版本/环境摘要）
2. 结果摘要（总数/通过/失败/跳过/通过率/耗时 + ✅/❌ 结论）
3. 失败用例分析（用例名/文件/错误信息/堆栈摘要）
4. 用例明细（按文件分组，>200 条截断注明）
5. 覆盖率（语句/分支/函数/行 + 低于阈值文件清单；缺失标注"未获取"）
6. 附录（原始结果文件路径/生成工具版本）

## 输出
默认 Markdown，落盘 `reports/test-report-<YYYYMMDD-HHmmss>.md`（可配置 `outputPath`）。

## 可配置项
| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| test_command | auto | 测试执行命令 |
| result_file | auto | 解析模式下的结果文件路径 |
| output_format | markdown | markdown / html / json |
| output_path | reports/ | 报告输出目录 |
| coverage | auto | auto / on / off |
| fail_threshold | 无 | 通过率低于该值标记不达标 |
