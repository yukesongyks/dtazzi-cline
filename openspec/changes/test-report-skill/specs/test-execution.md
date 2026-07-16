# Spec: 测试执行与结果收集

**Capability**: test-report-skill / test-execution
**Covers**: FR1

## Overview

Skill 负责测试的自动执行或已有结果的解析，支持执行模式和解析模式双模式。

## Functional Requirements

### FR1.1 框架自动检测

系统必须按以下优先级自动识别测试框架与运行命令：

1. 用户显式指定的 `test_command` 配置项
2. `package.json` 中 `scripts.test` 字段
3. `pyproject.toml` 中 `[tool.pytest.ini_options]` 配置
4. 框架特征文件推断：
   - `jest.config.*` → Jest
   - `vitest.config.*` → Vitest
   - `pytest.ini` / `tox.ini` → pytest
5. 默认回退：`npx jest --json --outputFile=<tmp>`

### FR1.2 首期支持的框架

| 语言/运行时        | 框架    | 结果格式          | 优先级 |
| ------------------ | ------- | ----------------- | ------ |
| JavaScript/TypeScript | Jest    | JSON reporter     | P0     |
| JavaScript/TypeScript | Vitest  | JSON reporter     | P0     |
| 通用               | JUnit XML | XML            | P0     |
| Python             | pytest  | JUnit XML / JSON  | P1     |

### FR1.3 双模式

| 模式     | 触发条件                        | 行为                                          |
| -------- | ------------------------------- | --------------------------------------------- |
| 执行模式 | `result_file` 未指定            | 自动检测框架 → 构建命令 → 执行测试 → 收集结果 |
| 解析模式 | `result_file` 指定了有效路径    | 跳过执行 → 直接解析已有结果文件               |

### FR1.4 执行失败处理

- 测试命令执行失败（非用例失败，而是命令无法运行）时，必须给出明确诊断信息
- 不得生成空报告冒充成功
- 错误信息必须包含：exit code、stderr 摘要

## Acceptance Criteria

- **AC-FR1-1**: 在含 `jest.config.ts` 的 TS 项目中，不指定 `test_command` 时，Skill 自动识别并使用 Jest 执行测试
- **AC-FR1-2**: 在含 `vitest.config.ts` 的 TS 项目中，Skill 自动识别并使用 Vitest 执行测试
- **AC-FR1-3**: 提供 JUnit XML 文件路径走解析模式，不触发测试执行即可产出报告
- **AC-FR1-4**: 测试命令不存在时（如 `nonexistent-cmd`），Skill 返回明确错误信息，不生成空报告
- **AC-FR1-5**: 结果文件损坏或格式不符时，Skill 返回解析错误说明

## Edge Cases

- 项目同时存在多个框架特征文件时，按优先级选择第一个匹配的
- `package.json` 中 `scripts.test` 包含多个命令（如 `"test": "jest && vitest"`）时，仅执行第一个命令段
- 解析模式下结果文件不存在时，返回 `结果文件不存在: <path>` 错误
- 解析模式下结果文件路径为目录时，返回 `路径是目录，请指定具体文件: <path>` 错误