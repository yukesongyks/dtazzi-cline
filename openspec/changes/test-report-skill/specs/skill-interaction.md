# Spec: Skill 交互约定

**Capability**: test-report-skill / skill-interaction
**Covers**: FR4

## Overview

定义 Skill 的触发方式、可配置项及其默认值、用户交互规范。

## Functional Requirements

### FR4.1 触发意图

Skill 应能识别以下自然语言意图并触发：

| 意图示例                                     | 模式     |
| -------------------------------------------- | -------- |
| "生成测试报告"                               | 执行模式 |
| "跑一下测试并出报告"                         | 执行模式 |
| "帮我跑测试，生成一份 Markdown 报告"         | 执行模式 |
| "把这个 junit.xml 转成测试报告"              | 解析模式 |
| "解析 coverage/ 下的结果并生成报告"          | 解析模式 |
| "仅解析已有测试结果 <path>，不要重新跑测试"  | 解析模式 |

### FR4.2 可配置项

| 配置项          | 默认值       | 说明                                              |
| --------------- | ------------ | ------------------------------------------------- |
| `test_command`  | 自动检测     | 测试执行命令，如 `npx jest --json`                |
| `result_file`   | 自动检测     | 解析模式下的结果文件路径                          |
| `output_format` | `markdown`   | 输出格式：`markdown` / `html` / `json`            |
| `output_path`   | `reports/`   | 报告输出目录或完整路径                            |
| `coverage`      | `auto`       | 覆盖率收集策略：`auto` / `on` / `off`             |
| `fail_threshold`| 无           | 通过率阈值（0-100），低于该值时报告标记为不达标   |

### FR4.3 配置覆盖方式

- 用户通过对话显式指定（如 "用 vitest 跑，输出到 /tmp/report.md"）
- Skill 解析对话中的指令，提取配置项覆盖值
- 未指定的配置项使用默认值

## Acceptance Criteria

- **AC-FR4-1**: 用户说"生成测试报告"时，Skill 触发执行模式
- **AC-FR4-2**: 用户说"把这个 junit.xml 转成测试报告"时，Skill 触发解析模式
- **AC-FR4-3**: 用户指定 `output_path` 时，报告写入指定路径
- **AC-FR4-4**: 用户指定 `coverage=off` 时，覆盖率章节不出现
- **AC-FR4-5**: 用户指定 `fail_threshold=90` 且通过率 85% 时，报告结论标记为"不达标"

## Edge Cases

- 用户同时指定了 `test_command` 和 `result_file` 时，`result_file` 优先（解析模式）
- 无法从对话中提取配置项时，全部使用默认值
- 配置项值非法时（如 `output_format=pdf`），返回错误提示