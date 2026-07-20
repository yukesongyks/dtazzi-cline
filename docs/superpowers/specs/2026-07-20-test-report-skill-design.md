# 测试报告生成 Skill 设计文档

> 需求来源: loop问题修复 2.0 T3 — 测试报告自动生成

## 背景

当前团队在完成测试执行后，测试结果散落在终端输出、CI 日志或框架原生产物（如 JUnit XML、coverage 目录）中，存在以下痛点：

- 测试结果需要人工收集、整理、汇总，耗时且易遗漏；
- 缺乏统一格式的测试报告，跨项目/跨团队沟通成本高；
- 失败用例的上下文（错误信息、堆栈、关联代码）需要人工回溯；
- 覆盖率、通过率等质量指标无法沉淀为可追踪的历史数据。

目标：提供一个 Skill，Agent 在执行测试后能够自动解析测试结果并生成结构化、可读性强的标准测试报告。

## 目标

1. **G1**：一条指令（如"生成测试报告"）即可自动完成：执行测试 → 收集结果 → 生成报告
2. **G2**：报告内容标准化，包含摘要、明细、失败分析、覆盖率四大板块
3. **G3**：支持主流测试框架的结果解析（Jest、Vitest、pytest、JUnit XML）
4. **G4**：报告支持多种输出格式，默认 Markdown

可量化成功标准：
- 在含 Jest/Vitest 的 TS 项目中执行"生成测试报告"，产出符合标准结构的 Markdown 报告
- 存在失败用例时，报告失败分析章节包含用例名、文件路径、错误信息
- 提供 JUnit XML 文件走解析模式，不触发测试执行即可产出报告
- 结果文件损坏时，Skill 返回明确错误说明而非空报告
- 覆盖率数据存在时正确呈现，不存在时标注"未获取"且其余章节正常

## 非目标（本期不做）

- 不做测试用例的自动生成或修复（仅报告）
- 不做报告的在线托管 / Web 服务化展示
- 不做多次运行结果的趋势对比分析（列为后续迭代候选）
- 不做非测试类质量报告（如 lint、安全扫描）的聚合
- 不做 IM/邮件推送（列为后续迭代候选）

## 设计方案

### 方案探索

**方案 A（采纳）：Skill 驱动 + 插件式解析器架构**

- Skill 入口负责：意图识别 → 模式判定（执行/解析）→ 框架检测 → 命令执行/文件读取 → 解析器调度 → 报告组装 → 落盘
- 解析器采用插件式注册：每个框架一个独立解析器模块，通过统一接口 `TestResultParser` 注册到 `ParserRegistry`
- 报告生成器采用模板渲染：Markdown 模板 + 数据模型 → 报告文件

优点：
- 解析器插件式隔离，新增框架不影响既有解析器（满足 NFR5）
- 执行/解析双模式自然分离，共用解析与报告生成管线
- 与 Kanban 现有 Skill 体系一致，可复用 Agent 运行时能力

**方案 B（弃用）：独立 CLI 工具**

- 单独发布一个 npm 包作为 CLI 工具，Skill 通过 shell 调用
- 缺点：增加发布/维护负担；与 Kanban Skill 体系割裂；无法复用 Agent 的上下文感知能力

**方案 C（弃用）：纯 Prompt 驱动**

- 直接通过 Prompt 让 LLM 解析终端输出并生成报告
- 缺点：解析准确性不可控；无法处理结构化数据（JSON/XML）；长输出易超 context window

→ 采纳方案 A

### 架构概览

```
用户指令
    │
    ▼
┌─────────────────────────────────────┐
│         Skill 入口层                 │
│  test-report-skill.ts               │
│  - 意图识别（执行 vs 解析模式）        │
│  - 框架自动检测                      │
│  - 参数校验与默认值填充               │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌──────────┐
│执行模式 │  │ 解析模式  │
│Executor│  │FileReader│
└───┬────┘  └────┬─────┘
    │            │
    └─────┬──────┘
          ▼
┌─────────────────────────────────────┐
│        解析器注册中心                 │
│  ParserRegistry                     │
│  ┌──────────┐ ┌──────────┐         │
│  │  Jest    │ │  Vitest  │  ...    │
│  │  Parser  │ │  Parser  │         │
│  └──────────┘ └──────────┘         │
│  接口: TestResultParser             │
│    parse(input) → TestReportData   │
└──────────┬──────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│        报告组装层                     │
│  ReportBuilder                      │
│  - 摘要计算（通过率、失败数等）        │
│  - 覆盖率数据提取                    │
│  - 章节排序与组装                    │
└──────────┬──────────────────────────┘
           ▼
┌─────────────────────────────────────┐
│        输出层                         │
│  - MarkdownRenderer (P0)            │
│  - HtmlRenderer (P1)                │
│  - JsonRenderer (P1)                │
│  输出路径: reports/test-report-*.md  │
└─────────────────────────────────────┘
```

### 核心接口设计

#### TestResultParser 接口

```typescript
interface TestSuiteResult {
  name: string;
  file: string;
  durationMs: number;
  status: "passed" | "failed" | "skipped";
  errorMessage?: string;
  stackTrace?: string;
  assertionResults?: TestAssertionResult[];
}

interface TestAssertionResult {
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  stackTrace?: string;
}

interface CoverageSummary {
  statements: number;    // 百分比 0-100
  branches: number;
  functions: number;
  lines: number;
}

interface CoverageFile {
  path: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface ParsedTestResult {
  framework: string;
  frameworkVersion?: string;
  suites: TestSuiteResult[];
  coverage?: {
    summary: CoverageSummary;
    files: CoverageFile[];
  };
  totalDurationMs: number;
  rawResultPath?: string;
}

interface TestResultParser {
  readonly framework: string;
  readonly supportedFormats: string[];
  parse(input: string | Buffer, options?: ParseOptions): ParsedTestResult;
  canParse(input: string | Buffer): boolean;
}
```

#### ParserRegistry

```typescript
class ParserRegistry {
  private parsers: Map<string, TestResultParser>;

  register(parser: TestResultParser): void;
  detectParser(input: string | Buffer, hint?: string): TestResultParser | null;
  getParser(framework: string): TestResultParser | undefined;
}
```

#### 报告数据模型

```typescript
interface TestReportData {
  // 报告头
  header: {
    projectName: string;
    generatedAt: Date;
    executionCommand?: string;
    framework: string;
    frameworkVersion?: string;
    environment: {
      node?: string;
      os: string;
      cpuCores?: number;
    };
  };

  // 结果摘要
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;        // 0-100
    totalDurationMs: number;
    conclusion: "passed" | "failed";  // ✅ / ❌
    failThresholdViolated?: boolean;
  };

  // 失败用例分析
  failures: FailureDetail[];

  // 用例明细（按文件分组）
  details: FileDetail[];

  // 覆盖率
  coverage?: {
    summary: CoverageSummary;
    lowCoverageFiles: CoverageFile[];  // < 阈值
  };

  // 附录
  appendix: {
    rawResultFiles: string[];
    generatorVersion: string;
  };
}

interface FailureDetail {
  suiteName: string;
  fileName: string;
  errorMessage: string;
  stackTrace: string;       // 截断至可读长度
}

interface FileDetail {
  file: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  suites: {
    name: string;
    status: "passed" | "failed" | "skipped";
    durationMs: number;
  }[];
}
```

### 解析器实现策略

#### P0 解析器

| 框架 | 输入格式 | 解析策略 | 关键文件 |
|------|---------|---------|---------|
| **Jest** | JSON (`--json --outputFile=`) | 解析 `testResults[].assertionResults[]`，提取 `status`/`failureMessages`/`duration` | `jest-result.json` |
| **Vitest** | JSON (`--reporter=json`) | 解析 `testResults[].assertionResults[]`，结构类似 Jest | `vitest-result.json` |
| **JUnit XML** | XML | 解析 `<testsuite>`/`<testcase>`/`<failure>` 元素，作为跨语言兜底 | `*.xml` |

#### P1 解析器

| 框架 | 输入格式 | 解析策略 |
|------|---------|---------|
| **pytest** | JUnit XML（`--junitxml=`）或 JSON（`--json-report`） | 优先 JSON，降级 JUnit XML |

#### 框架自动检测策略

检测优先级（从高到低）：

1. **用户显式指定**：`test_command` 或 `result_file` 参数
2. **项目配置文件**：
   - `package.json` → `scripts.test` 内容（含 `jest`/`vitest` 关键词）
   - `vitest.config.*` 文件存在 → Vitest
   - `jest.config.*` 文件存在 → Jest
   - `pyproject.toml` / `pytest.ini` 存在 → pytest
3. **结果文件推断**：根据文件扩展名和内容结构推断（`.json` → 尝试 Jest/Vitest 格式；`.xml` → 尝试 JUnit 格式）

### 报告模板（Markdown 结构）

```markdown
# 测试报告：{projectName}

> 生成时间：{generatedAt}
> 执行命令：{executionCommand}
> 测试框架：{framework} {frameworkVersion}
> 运行环境：Node.js {node} / {os}

---

## 📊 结果摘要

| 指标 | 数值 |
|------|------|
| 用例总数 | {total} |
| ✅ 通过 | {passed} |
| ❌ 失败 | {failed} |
| ⏭️ 跳过 | {skipped} |
| 通过率 | {passRate}% |
| 总耗时 | {totalDuration} |

**整体结论**：{conclusionIcon} {conclusionText}

---

## ❌ 失败用例分析

> 共 {failedCount} 条失败用例

### {suiteName}

- **文件**：`{fileName}`
- **错误信息**：{errorMessage}
- **堆栈摘要**：
  ```
  {stackTrace}
  ```

---

## 📋 用例明细

> 共 {total} 条用例，按文件分组

### {fileName}（{fileTotal} 条，{fileDuration}）

| 用例名 | 状态 | 耗时 |
|--------|------|------|
| {name} | {statusIcon} | {duration}ms |

---

## 📈 覆盖率

| 类型 | 覆盖率 |
|------|--------|
| 语句 (Statements) | {statements}% |
| 分支 (Branches) | {branches}% |
| 函数 (Functions) | {functions}% |
| 行 (Lines) | {lines}% |

### 低于阈值的文件

| 文件 | 语句 | 分支 | 函数 | 行 |
|------|------|------|------|-----|

---

## 附录

- 原始结果文件：{rawResultFiles}
- 生成工具：{generatorVersion}
```

### 输出路径规则

- 默认路径：`reports/test-report-<YYYYMMDD-HHmmss>.md`
- 用户可通过 `output_path` 参数指定目录，文件名仍自动生成
- 若用户指定完整路径（含 `.md`），则直接使用

### 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `test_command` | 自动检测 | 测试执行命令 |
| `result_file` | 自动检测 | 解析模式下的结果文件路径 |
| `output_format` | `markdown` | `markdown` / `html` / `json` |
| `output_path` | `reports/` | 报告输出目录 |
| `coverage` | `auto` | `auto` / `on` / `off` |
| `fail_threshold` | 无 | 通过率低于该值时报告结论标记为不达标 |

### 异常处理策略

| 场景 | 处理方式 |
|------|---------|
| 结果文件不存在 | 抛出明确错误：`结果文件不存在: {path}` |
| 结果文件格式损坏 | 抛出明确错误：`无法解析结果文件: {path}，格式异常: {reason}` |
| 无法识别框架 | 抛出明确错误，列出支持的框架与格式 |
| 测试命令执行失败 | 返回命令的 stderr，标注"测试执行失败"，不生成报告 |
| 覆盖率数据缺失 | 覆盖率章节标注"未获取"，其余章节正常 |
| 字段缺失 | 标注"未获取"，不崩溃 |
| 用例数 > 200 | 明细表截断，注明"共 {total} 条，仅展示前 200 条" |
| 环境变量/密钥泄露风险 | 堆栈中过滤 `AWS_*`、`NPM_TOKEN`、`DOCKER_PASSWORD` 等模式 |

### 文件结构（Skill 目录）

```
src/skills/test-report/
├── index.ts                    # Skill 入口 + 注册
├── types.ts                    # 所有类型定义
├── config.ts                   # 默认配置 + 配置解析
├── framework-detector.ts       # 框架自动检测
├── executor.ts                 # 测试执行（执行模式）
├── parser-registry.ts          # 解析器注册中心
├── parsers/
│   ├── jest-parser.ts          # Jest JSON 解析器
│   ├── vitest-parser.ts        # Vitest JSON 解析器
│   └── junit-xml-parser.ts     # JUnit XML 解析器（含 pytest 降级）
├── report-builder.ts           # 报告数据组装
├── renderers/
│   ├── markdown-renderer.ts    # Markdown 输出
│   ├── html-renderer.ts        # HTML 输出（P1）
│   └── json-renderer.ts        # JSON 伴随产物（P1）
├── sanitizer.ts                # 安全过滤（凭据/路径过滤）
└── utils.ts                    # 工具函数（时间格式化、截断等）
```

## 里程碑

| 阶段 | 范围 | 优先级 |
|------|------|--------|
| **M1** | Jest/Vitest JSON + JUnit XML 解析、Markdown 报告、执行/解析双模式、框架自动检测 | P0 |
| **M2** | pytest 支持、覆盖率章节、`fail_threshold` | P1 |
| **M3** | HTML 输出、JSON 伴随产物 | P1 |
| **M4** | 历史趋势对比、更多框架（Go test / cargo test） | P2（后续迭代） |

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 各框架 reporter 输出格式差异大 | 解析层复杂度高 | 插件式解析器架构（NFR5），每个框架独立模块 |
| 测试执行耗时不可控 | 长任务阻塞 Agent | 依赖 Agent 运行时的后台任务能力，轮询结果 |
| JUnit XML 格式方言多（不同工具生成略有差异） | 解析失败 | 宽松解析策略：缺失字段降级标注"未获取"而非抛错 |
| 覆盖率工具差异（istanbul/c8/v8） | 覆盖率数据提取不稳定 | 按优先级尝试多种覆盖率格式，失败则标注"未获取" |

## 开放问题（已决策）

| 问题 | 决策 | 依据 |
|------|------|------|
| Q1: 首期目标项目栈是否以 TS/Node 为主？ | ✅ 是 | 项目本身为 TS/Node，P0 范围按此假设 |
| Q2: 报告中文/英文双语还是仅中文？ | 仅中文（P0），架构预留 i18n | 面向国内团队，P1 扩展英文模板 |
| Q3: 是否需要 IM/邮件推送？ | ❌ 否 | 需求 2.2 已明确列为非目标 |