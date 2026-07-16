# test-report-generator

测试报告生成器 Skill — 自动执行测试并生成结构化测试报告。

## 触发意图

- "生成测试报告"
- "跑一下测试并出报告"
- "把这个 junit.xml 转成测试报告"

## 功能

- 自动识别项目测试框架（Vitest / Jest / pytest / JUnit XML）
- 双模式：执行测试并收集结果 / 直接解析已有结果文件
- 生成标准化 Markdown 报告（含摘要、失败分析、明细、覆盖率）
- 支持 HTML / JSON 输出格式

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `test_command` | 自动检测 | 测试执行命令 |
| `result_file` | 自动检测 | 解析模式下的结果文件路径 |
| `output_format` | `markdown` | `markdown` / `html` / `json` |
| `output_path` | `reports/` | 报告输出目录 |
| `coverage` | `auto` | `auto` / `on` / `off` |
| `fail_threshold` | 无 | 通过率低于该值时报告结论标记为不达标 |

## 使用方式

```typescript
import { generateReport } from './src/index';

const result = await generateReport({
  // 解析模式：直接解析已有结果文件
  result_file: './test-results/junit.xml',
  // 或执行模式：自动检测并运行测试
  // test_command: 'npx vitest run --reporter=json',
  output_format: 'markdown',
  output_path: 'reports/',
});

console.log(result.report_path);
console.log(result.summary);
```

## 目录结构

```
src/
├── index.ts                # 主入口
├── types.ts                # 核心类型
├── config.ts               # 配置解析
├── framework-detector.ts   # 框架检测
├── coverage.ts             # 覆盖率处理
├── parsers/
│   ├── base.ts             # 解析器抽象
│   ├── jest-json.ts        # Jest JSON
│   ├── vitest-json.ts      # Vitest JSON
│   ├── junit-xml.ts        # JUnit XML
│   └── pytest-junit.ts     # pytest JUnit XML
└── report/
    ├── builder.ts          # 报告构建器
    ├── sections.ts         # 章节生成
    └── formatters/
        ├── markdown.ts     # Markdown
        ├── html.ts         # HTML
        └── json.ts         # JSON
```