# Spec: 报告输出格式与落盘

**Capability**: test-report-skill / report-output
**Covers**: FR3

## Overview

定义报告的输出格式、文件命名规则、落盘路径约定及生成后用户反馈内容。

## Functional Requirements

### FR3.1 输出格式

| 格式     | 优先级 | 说明                                 |
| -------- | ------ | ------------------------------------ |
| Markdown | P0     | 默认格式，`.md` 文件                  |
| HTML     | P1     | 自包含 HTML（内联 CSS）               |
| JSON     | P1     | 结构化数据，作为可选伴随产物           |

**格式选择**：通过 `output_format` 配置项指定，默认 `markdown`。

### FR3.2 输出路径

| 场景             | 路径                                          |
| ---------------- | --------------------------------------------- |
| 默认             | `reports/test-report-<YYYYMMDD-HHmmss>.md`    |
| 用户指定目录     | `<user_dir>/test-report-<YYYYMMDD-HHmmss>.md` |
| 用户指定完整路径 | `<user_path>`（直接使用）                      |

**配置项**：`output_path`，默认 `reports/`。

**路径安全**：
- 若指定路径的父目录不存在，自动创建
- 若指定路径已存在，追加时间戳后缀避免覆盖

### FR3.3 生成后用户反馈

报告生成后，用户必须收到：

```
📊 测试报告已生成: <报告路径>

结果摘要:
  通过率: xx.x%  ✅/❌
  总计: N | 通过: N | 失败: N | 跳过: N
  耗时: X.Xs

失败用例 (如有，最多展示 3 条):
  1. <用例名> — <文件路径>
  2. <用例名> — <文件路径>
```

## Acceptance Criteria

- **AC-FR3-1**: 默认配置下，报告写入 `reports/test-report-<timestamp>.md`
- **AC-FR3-2**: 指定 `output_path=/tmp/my-report.md` 时，报告写入该路径
- **AC-FR3-3**: 指定 `output_format=json` 时，生成 JSON 伴随产物
- **AC-FR3-4**: 生成后终端输出包含报告路径和结果摘要
- **AC-FR3-5**: 目标目录不存在时自动创建
- **AC-FR3-6**: 目标文件已存在时自动追加时间戳（不覆盖）

## Edge Cases

- 磁盘空间不足时，返回写入错误信息
- 路径包含非法字符时，自动清理或返回错误
- 报告内容为空（0 用例）时，仍生成含摘要的完整报告