# Spec: Parsing (结果解析)

## Overview
定义测试结果解析器的行为规范，包括各框架解析器的输入/输出格式、错误处理、以及插件注册机制。

## Supported Formats (P0)

| 格式 | 解析器模块 | 输入 |
|------|-----------|------|
| Jest JSON | `jest-json.ts` | `jest --json --outputFile=<path>` 产物 |
| Vitest JSON | `vitest-json.ts` | `vitest run --reporter=json --outputFile=<path>` 产物 |
| pytest JUnit XML | `pytest-junit.ts` | `pytest --junitxml=<path>` 产物 |
| pytest JSON | `pytest-json.ts` | `pytest --json-report` 产物 |
| 通用 JUnit XML | `junit-xml.ts` | 标准 JUnit XML 格式（兜底） |

## Unified Output Schema

所有解析器输出统一的数据结构：

```typescript
interface ParsedTestResults {
  framework: string;                    // 框架名称
  frameworkVersion?: string;            // 框架版本
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;                   // 0-100
    durationMs: number;
  };
  suites: TestSuite[];                  // 测试套件列表
  failures: TestFailure[];              // 失败用例详情
  coverage?: CoverageData;              // 覆盖率数据（可选）
}

interface TestSuite {
  file: string;                         // 源文件路径
  name: string;                         // 套件名称
  tests: TestCase[];
  durationMs: number;
}

interface TestCase {
  name: string;                         // 用例名称
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}

interface TestFailure {
  name: string;                         // 用例名称
  file: string;                         // 所属文件路径
  message: string;                      // 错误信息
  stack: string[];                      // 堆栈关键行（截断至可读长度）
}

interface CoverageData {
  statements: { covered: number; total: number; pct: number };
  branches: { covered: number; total: number; pct: number };
  functions: { covered: number; total: number; pct: number };
  lines: { covered: number; total: number; pct: number };
  files: CoverageFileEntry[];
}

interface CoverageFileEntry {
  file: string;
  statements: { covered: number; total: number; pct: number };
  branches: { covered: number; total: number; pct: number };
  functions: { covered: number; total: number; pct: number };
  lines: { covered: number; total: number; pct: number };
}
```

## Parser Interface (插件契约)

```typescript
interface TestResultParser {
  /** 解析器唯一标识 */
  readonly id: string;
  /** 支持的框架名称 */
  readonly framework: string;
  /** 判断是否能处理该结果文件 */
  canHandle(resultFile: string): boolean;
  /** 解析结果文件，返回统一格式 */
  parse(resultFile: string): Promise<ParsedTestResults>;
}
```

### Scenario: Jest JSON 解析
- **Given** 结果文件为 Jest 的 `--json` 输出格式
- **When** `jest-json` 解析器执行 `parse()`
- **Then** 返回 `ParsedTestResults`，其中 `framework = "jest"`
- **And** `summary` 数据与 Jest 原始输出一致
- **And** 失败用例的 `stack` 数组截断至前 10 行

### Scenario: Vitest JSON 解析
- **Given** 结果文件为 Vitest 的 `--reporter=json` 输出格式
- **When** `vitest-json` 解析器执行 `parse()`
- **Then** 返回 `ParsedTestResults`，其中 `framework = "vitest"`
- **And** 正确映射 Vitest 的 `assertionResults` 到 `TestCase` 结构

### Scenario: 通用 JUnit XML 解析（兜底）
- **Given** 结果文件为标准 JUnit XML 格式
- **And** 无特定框架解析器匹配
- **When** `junit-xml` 解析器执行 `parse()`
- **Then** 返回 `ParsedTestResults`，其中 `framework = "junit"`
- **And** 从 `<testsuite>` 元素提取 `summary` 数据
- **And** 从 `<testcase>` + `<failure>` 子元素提取失败详情

### Scenario: 解析器匹配 - 优先级
- **Given** 结果文件可被多个解析器处理（如 pytest JUnit XML 同时匹配 `pytest-junit` 和 `junit-xml`）
- **When** 解析器注册表进行匹配
- **Then** 优先使用特定框架解析器（`pytest-junit` 优先于 `junit-xml`）
- **And** 匹配顺序：注册顺序即优先级顺序

## NFR2: 降级处理

### Scenario: 字段缺失
- **Given** 结果文件缺少 `durationMs` 字段
- **When** 解析器解析
- **Then** `durationMs` 设为 0
- **And** 报告中对应字段标注"未获取"

### Scenario: 部分套件解析失败
- **Given** 结果文件中有 3 个套件，其中 1 个格式异常
- **When** 解析器解析
- **Then** 成功解析 2 个正常套件，跳过异常套件
- **And** 报告中标注"部分套件解析失败: <套件名>"

## NFR3: 安全过滤

### Scenario: 堆栈中的环境变量脱敏
- **Given** 失败用例的错误堆栈包含 `API_KEY=sk-abc123`
- **When** 解析器处理堆栈
- **Then** 脱敏为 `API_KEY=***`
- **And** 不修改原始结果文件

### Scenario: 密钥模式过滤
- **Given** 错误信息包含 `-----BEGIN RSA PRIVATE KEY-----`
- **When** 解析器处理
- **Then** 替换为 `[PRIVATE KEY REDACTED]`