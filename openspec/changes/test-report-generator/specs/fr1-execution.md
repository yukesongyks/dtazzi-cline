# Spec: 测试执行与结果收集 (FR1)

## 功能概述
Skill 自动识别项目测试框架，执行测试或解析已有结果文件，收集测试结果数据。

## 需求映射

### FR1.1 自动识别测试框架
- 优先级：用户显式 `test_command` > `package.json` scripts.test > 框架特征文件
- 支持特征文件：`vitest.config.*`、`jest.config.*`、`pytest.ini`（P1）

### FR1.2 首期支持框架（P0）
| 框架 | 结果格式 | 解析器 |
|------|---------|--------|
| Jest | JSON reporter | `jest-json.ts` |
| Vitest | JSON reporter | `vitest-json.ts` |
| JUnit XML | XML | `junit-xml.ts` |

### FR1.3 双模式工作
- **执行模式**：运行测试命令，收集 stdout + 结果文件
- **解析模式**：跳过执行，直接读取 `result_file` 解析

### FR1.4 执行失败诊断
- 命令不存在 → "未找到测试命令：<command>"
- 执行超时/崩溃 → 返回 exit code + stderr 摘要
- 结果文件为空 → "结果文件为空或格式异常"

## 验收标准
- 在含 Vitest 的项目中自动检测并执行 `npx vitest run --reporter=json`
- 指定 `result_file` 路径时跳过执行，直接解析
- 框架检测失败时给出明确提示