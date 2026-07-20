---
name: test-report
description: 解析 Vitest/Jest JSON 或 JUnit XML 测试结果文件，生成中文 Markdown 测试报告。支持触发意图如"生成测试报告"/"跑一下测试并出报告"/"把这个 junit.xml 转成测试报告"。
triggers:
  - 生成测试报告
  - 跑一下测试并出报告
  - 把这个 junit.xml 转成测试报告
  - 把测试结果转成报告
  - 出一份测试报告
---

# 测试报告 Skill (test-report)

## 概述

将测试运行结果文件（Vitest JSON / Jest JSON / JUnit XML）解析为统一中间模型 (IM)，渲染为中文 (zh-CN) Markdown 报告。解析模式**绝不执行测试**（D7），只读取已有结果文件。

**核心原则：** 嗅探格式 → 解析为 IM → 渲染中文报告 → 输出报告路径+摘要+失败原因。

**设计约束 (SSOT)：**
- P0 仅 TypeScript/Node 栈；解析器优先级 Vitest JSON > Jest JSON > JUnit XML
- 报告语言仅中文 (zh-CN)，模板 i18n-ready，文案以 i18n key 引用
- 统一中间模型 IM (D10) 字段固定，解析层与渲染层解耦
- 插件式解析器 (NFR5)：`detect(input)→boolean`, `parse(raw)→IM`
- 项目根目录基准 (D5)：含 `package.json` 的最近目录
- 解析模式绝不执行测试 (D7)
- 截断须显式标注 (NFR2)，不静默丢数据
- 敏感信息过滤 (NFR3/D8)：值替换 `***`，键名保留
- 幂等性 (NFR4)：除生成时间戳外内容一致

## 触发意图示例

- "生成测试报告"
- "跑一下测试并出报告"
- "把这个 junit.xml 转成测试报告"

## 可配置项

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `test_command` | string | `未获取` | 触发测试的命令（仅记录于 meta.command，解析模式不执行，D7） |
| `result_file` | string | `未获取` | 测试结果文件路径；缺失时由 detect 从项目结构嗅探 |
| `output_format` | `'markdown' \| 'html' \| 'json'` | `'markdown'` | 报告输出格式 |
| `output_path` | string | `'reports/'` | 报告输出目录 |
| `coverage` | `'auto' \| 'on' \| 'off'` | `'auto'` | 是否渲染覆盖率章节；`auto` 表示仅当结果文件含覆盖率数据时渲染 |
| `fail_threshold` | number \| undefined | `undefined` | 失败用例数阈值（0~100 整数），超出则报告标记失败；`undefined` 表示不设阈值 |

## 返回契约

skill 完成后向调用方返回：

1. **报告路径**：生成的报告文件绝对路径（如 `reports/test-report-<timestamp>.md`）
2. **摘要**：一行中文摘要，形如 `共 120 用例，通过 118，失败 2，跳过 0，通过率 98.3%，耗时 3.2s`
3. **失败原因**：1~3 条失败用例的名称与错误摘要（取自 IM.failures，敏感信息已过滤 D8）

## 流程

1. 解析配置（合并默认值与用户覆盖，定位项目根目录 D5）
2. 定位结果文件（用户提供或 detect 嗅探）
3. 嗅探格式 → 按优先级选择解析器
4. 解析为 IM（字段缺失降级 `未获取`）
5. 渲染中文报告（i18n key 引用，截断显式标注 NFR2）
6. 写入 `output_path`，返回报告路径 + 摘要 + 失败原因
