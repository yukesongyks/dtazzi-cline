# 技术设计：测试报告生成器

## 架构概览

```
skills/test-report-generator/
├── SKILL.md                    # Skill 入口定义
├── src/
│   ├── index.ts                # 主入口：编排流水线
│   ├── framework-detector.ts   # 框架自动检测
│   ├── parsers/
│   │   ├── base.ts             # 解析器抽象接口
│   │   ├── jest-json.ts        # Jest JSON reporter 解析
│   │   ├── vitest-json.ts      # Vitest JSON reporter 解析
│   │   └── junit-xml.ts        # JUnit XML 解析
│   ├── report/
│   │   ├── builder.ts          # 报告构建器（组装章节）
│   │   ├── sections.ts         # 各章节生成函数
│   │   └── formatters/
│   │       ├── markdown.ts     # Markdown 输出
│   │       ├── html.ts         # HTML 输出（P1）
│   │       └── json.ts         # JSON 伴随产物（P1）
│   ├── coverage.ts             # 覆盖率提取与解析
│   ├── config.ts               # 配置项解析与默认值
│   └── types.ts                # 核心类型定义
```

## 核心类型

```typescript
interface TestReportConfig {
  test_command?: string;        // 用户显式指定
  result_file?: string;         // 解析模式输入
  output_format: "markdown" | "html" | "json";
  output_path: string;          // 默认 reports/
  coverage: "auto" | "on" | "off";
  fail_threshold?: number;      // 0-100
}

interface TestResult {
  suite: string;
  file: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  error?: { message: string; stack: string };
}

interface CoverageSummary {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  files: CoverageFile[];
}

interface TestReport {
  header: ReportHeader;
  summary: ReportSummary;
  failures: FailureDetail[];
  details: TestDetail[];
  coverage: CoverageSection;
  appendix: Appendix;
}
```

## 关键设计决策

### 1. 解析器插件式架构
- 所有解析器实现 `TestResultParser` 接口
- 通过 `ParserRegistry` 按优先级匹配：用户指定 → 框架特征 → 文件扩展名
- 新增框架仅需添加一个解析器文件 + 注册

### 2. 框架检测优先级
1. 用户显式指定的 `test_command`
2. `package.json` 的 `scripts.test` 字段
3. 配置文件检测：`vitest.config.*` → Vitest，`jest.config.*` → Jest
4. 通用兜底：`.xml` 扩展名 → JUnit XML 解析器

### 3. 双模式切换
- 若 `result_file` 指定：进入解析模式，跳过测试执行
- 否则：执行模式，按检测到的框架运行测试并收集输出

### 4. 报告章节渲染
- 采用 Builder 模式，每个章节独立生成后拼接
- Markdown 渲染器使用模板字符串构建
- 超过 200 条用例时自动截断并注明

### 5. 错误处理策略
- 解析器异常：降级输出，缺失字段标注 "未获取"
- 测试执行失败：返回明确诊断信息，不生成空报告
- 覆盖率不可用：标注 "未获取"，其余章节正常

## 数据流

```
用户指令 → 配置解析 → 框架检测 → [执行测试 | 解析文件]
    → 结果聚合 → 报告构建 → 格式化输出 → 落盘 + 摘要返回
```