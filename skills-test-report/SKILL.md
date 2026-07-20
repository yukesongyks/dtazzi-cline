---
name: test-report
version: "1.0.0"
description: >-
  测试执行后自动解析结果（Jest/Vitest JSON、pytest JUnit XML/JSON、JUnit XML 兜底）
  并生成结构化标准测试报告（Markdown 默认，可选 HTML/JSON）。支持执行模式与
  解析模式两种工作模式，含失败分析、覆盖率、安全脱敏与幂等渲染。
activation: manual
intents:
  - 生成测试报告
  - 跑一下测试并出报告
  - 把这个 junit.xml 转成测试报告
  - 生成 test report
---

# test-report skill (v1.0, T3)

> 结构化测试报告生成 Skill。在测试执行后（或收到已有结果文件时），自动解析结果
> 并产出固定顺序的标准报告：报告头 → 结果摘要 → 失败分析 → 用例明细 → 覆盖率 → 附录。

## 何时使用

- 用户说「生成测试报告」「跑一下测试并出报告」「把这个 junit.xml 转成测试报告」。
- 测试执行后需要一份可读、可沉淀的质量报告。
- CI 流程中需把已有 JUnit XML / JSON 结果转成报告而不重复跑测试。

## 支持的结果格式（P0）

- JavaScript/TypeScript：Jest JSON reporter、Vitest JSON reporter。
- Python：pytest（JUnit XML / JSON report）。
- 通用兜底：JUnit XML（跨语言）。

## 工作模式

- **执行模式**：检测测试命令 → 触发运行（委托运行时后台任务，不阻塞 agent turn）→ 解析 → 生成报告。
- **解析模式**：用户提供 `result_file` 或说「把…转成报告」→ 跳过执行 → 直接解析已有结果 → 生成报告。

## 配置项（均有默认值，用户可覆盖）

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `test_command` | 自动检测 | 测试执行命令；显式指定则进入执行模式 |
| `result_file` | 自动检测 | 解析模式下结果文件路径；显式指定则进入解析模式 |
| `output_format` | `markdown` | `markdown` / `html` / `json` |
| `output_path` | `reports/` | 报告输出目录 |
| `coverage` | `auto` | `auto` / `on` / `off` |
| `fail_threshold` | 无 | 通过率低于该值（0-1）时结论标记为「不达标」 |

## 报告结构（固定顺序）

1. **报告头**：项目名、生成时间、执行命令、框架/版本、执行环境摘要（已脱敏）。
2. **结果摘要**：用例总数、通过/失败/跳过数、通过率、总耗时；整体结论 ✅/❌（低于 `fail_threshold` 时附「不达标」）。
3. **失败用例分析**（有失败时）：用例名、所属文件、错误信息、堆栈关键行（截断 + 脱敏）。
4. **用例明细**：按测试文件分组；超过 200 条时截断并注明「已截断，共 N 条」。
5. **覆盖率**（可获取时）：语句/分支/函数/行覆盖率总表 + 低于阈值文件清单；缺失时标注「未获取」。
6. **附录**：原始结果文件路径、生成工具版本。

## 失败处理

- 测试命令无法运行或结果文件损坏 → 返回明确诊断，**不**生成空报告冒充成功（AC4/S4）。
- 可解析文件中字段缺失 → 渲染「未获取」，其余章节正常（NFR2/S5）。
- 报告不含环境变量、密钥；堆栈中凭据路径被脱敏（NFR3/S10）。
- 同一结果文件多次生成，报告体除时间戳外字节一致（NFR4/S7）。

## 落盘

默认输出 `reports/test-report-<YYYYMMDD-HHmmss>.md`，允许用户指定路径。生成后返回
`{ path, summary }`，失败时附最关键的 1~3 条失败原因。

## 实现说明

本 Skill 的 TypeScript 源码落在本仓库的 `skills-test-report/` 目录（已被根
`tsconfig.json` include 且被 `vitest` 覆盖）。解析器为插件式结构，新增框架支持不影响
既有解析器（NFR5）。
