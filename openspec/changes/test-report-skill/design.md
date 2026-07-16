# Design: test-report-skill

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    test-report Skill                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Test Runner   │  │ Result Parser │  │ Report Generator │  │
│  │ (执行模式)     │  │ (解析层)      │  │ (生成层)         │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│  ┌──────┴─────────────────┴────────────────────┴─────────┐  │
│  │                  Plugin Registry                       │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │  │
│  │  │  Jest   │ │ Vitest  │ │ pytest  │ │ JUnit XML   │  │  │
│  │  │ Parser  │ │ Parser  │ │ Parser  │ │ Parser      │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. 插件式解析器架构

新增框架支持只需实现 `TestResultParser` 接口并注册，不修改既有代码。

```typescript
interface TestResultParser {
  /** 解析器支持的结果格式标识 */
  readonly formatId: string;
  /** 判断是否能解析给定的结果内容 */
  canParse(content: string, filePath?: string): boolean;
  /** 解析结果内容为标准 TestReport 结构 */
  parse(content: string, options?: ParseOptions): TestReport;
}
```

### 2. 双模式设计

| 模式   | 触发条件                          | 行为                           |
| ------ | --------------------------------- | ------------------------------ |
| 执行模式 | 用户未指定 `result_file`          | 自动检测框架 → 执行测试 → 收集结果 → 解析 |
| 解析模式 | 用户指定 `result_file` 路径       | 跳过执行 → 直接解析已有结果文件 |

### 3. 框架自动检测策略

按优先级依次尝试：

1. 用户显式指定的 `test_command`
2. `package.json` → `scripts.test`（Node 项目）
3. `pyproject.toml` → `[tool.pytest.ini_options]`（Python 项目）
4. 框架特征文件：`jest.config.*`、`vitest.config.*`、`pytest.ini`、`tox.ini`
5. 默认回退：`npx jest --json --outputFile=<tmp>`（P0 默认）

### 4. 报告数据结构

```typescript
interface TestReport {
  meta: {
    projectName: string;
    generatedAt: string;        // ISO 8601
    command: string;
    framework: string;
    frameworkVersion: string;
    environment: string;        // OS / Node version / Python version
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;           // 0-100
    durationMs: number;
    verdict: 'pass' | 'fail';   // ✅ / ❌
  };
  failures: FailureDetail[];
  suites: TestSuiteDetail[];
  coverage?: CoverageReport;
  appendix: {
    resultFiles: string[];
    toolVersion: string;
  };
}
```

### 5. 覆盖率获取策略

- `coverage=auto`（默认）：检测项目是否配置了覆盖率工具，有则收集
- `coverage=on`：强制收集，若不可用则报错
- `coverage=off`：跳过覆盖率章节

覆盖率来源：
- Jest: `--coverage` + `coverage/coverage-summary.json`
- Vitest: `--coverage` + `coverage/coverage-summary.json`
- pytest: `pytest-cov` → `coverage.xml` 或终端输出解析

### 6. 失败降级策略

| 场景                     | 行为                                       |
| ------------------------ | ------------------------------------------ |
| 结果文件不存在           | 报错：`结果文件不存在: <path>`              |
| 结果文件格式异常/损坏    | 报错：`无法解析结果文件: <reason>`          |
| 部分字段缺失             | 标注"未获取"，其余字段正常输出              |
| 测试命令执行失败         | 报错：`测试执行失败: <exit code> <stderr>`  |
| 覆盖率数据不可用         | 覆盖率章节标注"未获取"                      |

### 7. 输出路径约定

```
reports/test-report-<YYYYMMDD-HHmmss>.md    # 默认
reports/test-report-<YYYYMMDD-HHmmss>.html  # HTML 输出
reports/test-report-<YYYYMMDD-HHmmss>.json  # JSON 伴随产物
```

### 8. 安全与隐私

- 报告中不包含环境变量值
- 错误堆栈中过滤 `AWS_SECRET`、`TOKEN`、`PASSWORD`、`PRIVATE_KEY` 等敏感字段
- 文件路径中过滤用户主目录外的敏感路径模式

## Component Interaction

```
User: "帮我跑测试并生成报告"
  │
  ▼
Skill Entry (skill.ts)
  ├─ Config Resolution (config.ts)
  │   ├─ resolveTestCommand()
  │   └─ resolveOutputPath()
  │
  ├─ Mode: execute
  │   ├─ TestRunner (runner.ts)
  │   │   ├─ detectFramework() → "jest" | "vitest" | "pytest"
  │   │   ├─ buildCommand()
  │   │   └─ exec() → resultFilePath
  │   └─ ResultParser (parser.ts)
  │       └─ PluginRegistry.get(formatId).parse()
  │
  ├─ Mode: parse
  │   └─ ResultParser (parser.ts)
  │       └─ PluginRegistry.detectAndParse(filePath)
  │
  ├─ ReportGenerator (generator.ts)
  │   ├─ MarkdownGenerator
  │   ├─ HtmlGenerator (P1)
  │   └─ JsonGenerator (P1)
  │
  └─ Output
      ├─ write report file
      └─ return summary to user
```

## File Structure

```
src/skills/test-report/
├── skill.ts              # Skill 入口，Skill 注册与生命周期
├── config.ts             # 配置解析（test_command, result_file, output_* 等）
├── runner.ts             # 测试执行器（框架检测 + 命令构建 + 执行）
├── parser.ts             # 解析器注册表与调度
├── parsers/
│   ├── types.ts          # TestResultParser 接口 + TestReport 类型
│   ├── jest.ts           # Jest JSON reporter 解析器
│   ├── vitest.ts         # Vitest JSON reporter 解析器
│   ├── pytest.ts         # pytest JUnit XML / JSON 解析器（P1）
│   └── junit-xml.ts      # JUnit XML 通用解析器
├── generator.ts          # 报告生成器调度
├── generators/
│   ├── markdown.ts       # Markdown 报告模板
│   ├── html.ts           # HTML 报告模板（P1）
│   └── json.ts           # JSON 结构化输出（P1）
├── coverage.ts           # 覆盖率数据收集
├── sanitize.ts           # 安全过滤（敏感信息清理）
└── types.ts              # 公共类型定义
```