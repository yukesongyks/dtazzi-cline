# 测试报告 Skill 设计文档 (Test Report Skill Design)

> 版本: 1.0 | 日期: 2026-07-16 | 状态: 需求澄清 / 设计阶段

---

## 1. 需求澄清结论 (Clarification Decisions)

基于原始需求文档中的开放问题 (Q1-Q3) 及分析过程中的隐含歧义，以下为自主决策结果：

| # | 开放问题 | 决策 | 依据 |
|---|---------|------|------|
| Q1 | 首期目标项目栈？ | TypeScript/Node (Vitest) 为主 | Kanban 项目本身使用 Vitest，且需求文档已按此假设制定 P0 范围 |
| Q2 | 报告语言模板？ | 中文（默认），英文可选 | 需求文档为中文，团队沟通语言为中文；P1 可扩展双语 |
| Q3 | 自动推送 IM/邮件？ | 不做（本期非目标） | 需求文档已明确列为非目标 |
| D1 | Skill 实现形态？ | Managed Skill（agentix skill 系统） | 与项目现有 skill 体系一致，位于 `/root/.agentix/skills/managed/` |
| D2 | 报告输出目录？ | `reports/`（项目根目录下） | 需求文档 FR3.2 默认值 |
| D3 | 覆盖率工具？ | 复用框架自带（Vitest 内置 c8/istanbul） | 对齐 NFR1 性能要求，不引入额外工具 |
| D4 | 解析器插件注册方式？ | 文件系统发现 + 约定命名 | 每个框架一个解析器文件，放在 skill 目录下的 `parsers/` 子目录 |
| D5 | 错误处理策略？ | 降级输出 + 结构化错误码 | 对齐 NFR2：缺失字段标注"未获取"，格式异常返回明确错误说明 |

---

## 2. 项目上下文分析 (Project Context)

### 2.1 目标项目概况
- **项目**: Kanban (`@alipay/dtazzicloud`) — 智能开发工作台
- **测试框架**: Vitest（`vitest.config.ts`）
- **包管理**: npm workspaces (monorepo)
- **语言**: TypeScript
- **Skill 系统**: agentix managed skills (`/root/.agentix/skills/managed/`)

### 2.2 现有测试基础设施
- 根目录 `vitest.config.ts` 管理 `src/` 和 `test/` 的测试
- `packages/**` 和 `web-ui/**` 各有独立 vitest 配置
- CI 通过 `.github/workflows/test.yml` 编排
- 测试超时: 15s（单用例）

### 2.3 与现有 Skill 体系的关系
- Skill 以 SKILL.md 为入口，通过 `skill_load` / `skill_query` 供 Agent 调用
- 本 Skill 将作为独立 managed skill 安装，不修改项目源码
- 报告生成是纯数据处理流程，不涉及项目代码变更

---

## 3. 架构设计 (Architecture)

### 3.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Agent (调用方)                   │
│  触发: "生成测试报告" / "解析 junit.xml"           │
└────────────────────┬────────────────────────────┘
                     │ skill_load / skill_query
┌────────────────────▼────────────────────────────┐
│              Test Report Skill                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 模式路由  │  │ 解析器   │  │ 报告生成器     │  │
│  │ (execute │  │ 注册表   │  │ (Markdown/     │  │
│  │ /parse)  │  │          │  │  HTML/JSON)    │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │             │               │           │
│  ┌────▼─────┐  ┌────▼──────────┐    │           │
│  │ 命令检测  │  │ parsers/      │    │           │
│  │ (自动/   │  │ ├─ vitest.ts   │    │           │
│  │  显式)   │  │ ├─ jest.ts     │    │           │
│  └──────────┘  │ ├─ pytest.ts   │    │           │
│                │ └─ junit-xml.ts│    │           │
│                └───────────────┘    │           │
│                          │          │           │
│                ┌─────────▼──────────▼───────┐   │
│                │      统一结果模型 (IR)       │   │
│                │  TestReportSummary          │   │
│                │  TestCaseResult[]           │   │
│                │  CoverageData?              │   │
│                └─────────────┬──────────────┘   │
│                              │                   │
│                ┌─────────────▼──────────────┐   │
│                │       输出 (磁盘)            │   │
│                │  reports/test-report-*.md   │   │
│                │  reports/test-report-*.json │   │
│                └────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 3.2 核心数据模型 (IR - Intermediate Representation)

```typescript
// 统一中间表示，所有解析器输出此结构
interface TestReportIR {
  meta: {
    projectName: string;
    generatedAt: string;       // ISO 8601
    framework: string;          // "vitest" | "jest" | "pytest" | "junit"
    frameworkVersion: string;
    command: string;
    environment: string;        // "node v20.11.0 / linux x64"
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;           // 0-100
    durationMs: number;
    conclusion: "pass" | "fail"; // ✅ / ❌
  };
  failures: FailureDetail[];
  suites: TestSuiteResult[];    // 按文件分组
  coverage?: CoverageData;
  appendix: {
    sourceFiles: string[];      // 原始结果文件路径
    toolVersion: string;
  };
}

interface FailureDetail {
  testName: string;
  suitePath: string;            // 源文件路径
  errorMessage: string;
  stackTrace: string;           // 截断至可读长度 (≤20行)
}

interface TestSuiteResult {
  filePath: string;
  cases: TestCaseResult[];
}

interface TestCaseResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
}

interface CoverageData {
  statements: { covered: number; total: number; percent: number };
  branches: { covered: number; total: number; percent: number };
  functions: { covered: number; total: number; percent: number };
  lines: { covered: number; total: number; percent: number };
  lowCoverageFiles: { path: string; percent: number }[];
}
```

### 3.3 解析器插件接口

```typescript
interface TestResultParser {
  /** 解析器唯一标识 */
  id: string;
  /** 支持的框架名称 */
  framework: string;
  /** 支持的文件扩展名（解析模式） */
  supportedExtensions: string[];
  /** 检测当前项目是否可用此解析器 */
  detect(projectRoot: string): Promise<boolean>;
  /** 解析结果文件为 IR */
  parse(filePaths: string[]): Promise<TestReportIR>;
}
```

### 3.4 两种工作模式

```
模式1: 执行模式 (execute)
  Agent → 检测框架 → 运行测试 → 收集结果文件 → 解析 → 生成报告

模式2: 解析模式 (parse)
  Agent → 用户指定结果文件 → 解析 → 生成报告
```

---

## 4. 模块设计 (Module Design)

### 4.1 Skill 目录结构

```
/root/.agentix/skills/managed/test-report/
├── SKILL.md                 # Skill 入口，供 Agent 加载
├── package.json             # 依赖声明（如 xml2js, marked）
├── src/
│   ├── index.ts             # 主入口：模式路由
│   ├── ir.ts                # 统一数据模型 (IR)
│   ├── detector.ts          # 框架自动检测
│   ├── runner.ts            # 测试执行封装
│   ├── reporter.ts          # 报告生成器
│   │   ├── markdown.ts      # Markdown 格式
│   │   ├── html.ts          # HTML 格式 (P1)
│   │   └── json.ts          # JSON 格式
│   ├── parsers/             # 解析器注册表
│   │   ├── registry.ts      # 解析器发现与注册
│   │   ├── vitest.ts        # Vitest JSON reporter
│   │   ├── jest.ts          # Jest JSON reporter
│   │   ├── pytest.ts        # pytest JUnit XML / JSON (P1)
│   │   └── junit-xml.ts     # 通用 JUnit XML 兜底
│   ├── templates/           # 报告模板
│   │   ├── report.md.hbs    # Markdown 模板
│   │   └── report.html.hbs  # HTML 模板 (P1)
│   └── utils.ts             # 工具函数（路径过滤、堆栈截断等）
└── test/                    # Skill 自身测试
    ├── fixtures/            # 各框架的示例结果文件
    └── parsers/
        ├── vitest.test.ts
        ├── jest.test.ts
        └── junit-xml.test.ts
```

### 4.2 框架自动检测逻辑 (FR1.1)

优先级从高到低：

```
1. 用户显式指定的 test_command / result_file
2. package.json scripts.test 字段
3. 框架特征文件探测:
   - vitest.config.* → vitest
   - jest.config.*   → jest
   - pytest.ini / pyproject.toml [tool.pytest] → pytest
4. 目录中存在 *.junit.xml → 兜底 JUnit XML
```

### 4.3 Markdown 报告模板结构 (FR2)

```markdown
# 📊 测试报告 — <项目名>

> 生成时间: 2026-07-16 16:30:00
> 执行命令: npx vitest run --reporter=json
> 框架: Vitest 1.6.0
> 环境: Node.js v20.11.0 / linux x64

---

## 📈 结果摘要

| 指标 | 数值 |
|------|------|
| 用例总数 | 142 |
| ✅ 通过 | 138 |
| ❌ 失败 | 3 |
| ⏭️ 跳过 | 1 |
| 通过率 | 97.18% |
| 总耗时 | 12.4s |

**结论: ❌ 不通过** (失败 3 例)

---

## ❌ 失败用例分析

### 1. `should handle timeout correctly`
- **文件**: `test/cline-sdk/task-session.test.ts:245`
- **错误**: `Timeout - Async callback was not invoked within the 15000ms timeout`
- **堆栈**:
  ```
  at Timeout._onTimeout (test/cline-sdk/task-session.test.ts:245:5)
  at listOnTimeout (node:internal/timers:573:17)
  at processTimers (node:internal/timers:514:7)
  ```

---

## 📋 用例明细

### test/cline-sdk/task-session.test.ts (12 用例)
| 用例 | 状态 | 耗时 |
|------|------|------|
| should create session | ✅ | 45ms |
| should handle timeout | ❌ | 15000ms |
| ... | ... | ... |

> ⚠️ 用例总数超过 200 条，已截断显示前 200 条。完整明细见原始结果文件。

---

## 📊 覆盖率

| 类型 | 覆盖率 | 覆盖/总数 |
|------|--------|-----------|
| 语句 | 78.5% | 1234/1572 |
| 分支 | 65.2% | 432/662 |
| 函数 | 82.1% | 345/420 |
| 行 | 79.0% | 1180/1494 |

### 低于阈值 (80%) 的文件
- `src/cline-sdk/host.ts` — 45.2%
- `src/cline-sdk/protocol.ts` — 62.8%

---

## 📎 附录

- 原始结果文件: `test-results.json`
- 生成工具: test-report-skill v1.0.0
```

---

## 5. 里程碑与优先级 (Milestones)

| 阶段 | 范围 | 优先级 | 预估工时 |
|------|------|--------|----------|
| **M1** | Vitest JSON + JUnit XML 解析、Markdown 报告、执行/解析双模式 | P0 | 核心 |
| **M2** | Jest JSON 解析、覆盖率章节、fail_threshold 配置 | P1 | 扩展 |
| **M3** | pytest 支持、HTML 输出、JSON 伴随产物 | P1 | 扩展 |
| **M4** | 历史趋势对比、Go test / cargo test | P2 | 后续 |

---

## 6. 风险与缓解 (Risks & Mitigation)

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| R1: 各框架 reporter 输出格式差异大 | 中 | 插件式解析器 + 统一 IR，新增框架不影响既有解析器 (NFR5) |
| R2: 测试执行耗时不可控 | 中 | 执行模式使用 `run_in_background` + `background_exec` 轮询 |
| R3: 大项目结果文件解析 OOM | 低 | 流式解析 / 分页加载，限制单次内存占用 |
| R4: CI 环境无交互式 shell | 中 | 命令检测使用非交互式路径探测，不依赖 `zsh -i` |
| R5: 覆盖率数据格式不一致 | 低 | 对 Vitest 内置 coverage 做适配层，缺失时降级为"未获取" |

---

## 7. 验收标准映射 (Acceptance Criteria Mapping)

| AC | 描述 | 对应 FR | 验证方式 |
|----|------|--------|----------|
| AC1 | Vitest 项目产出标准 Markdown 报告 | FR1.1, FR2, FR3.1 | 在 Kanban 项目执行 `skill` → 检查 `reports/*.md` |
| AC2 | 失败用例含用例名、文件路径、错误信息 | FR2 §3 | 构造失败用例 → 断言报告包含三项 |
| AC3 | JUnit XML 解析模式不触发测试执行 | FR1.3, US4 | 提供 `junit.xml` → 验证无 `vitest run` 调用 |
| AC4 | 结果文件损坏时返回明确错误 | NFR2 | 提供损坏 JSON → 断言错误信息非空且非空报告 |
| AC5 | 无覆盖率数据时标注"未获取" | FR2 §5 | 运行不带 coverage 的测试 → 断言报告含"未获取" |

---

## 8. 下一步行动 (Next Steps)

1. **M1 实现**: 创建 `test-report` skill 骨架，实现 Vitest 解析器 + Markdown 报告生成器
2. **Skill 安装**: 通过 `dtcoder skill_manage` 或直接部署到 `~/.agentix/skills/managed/test-report/`
3. **集成测试**: 在 Kanban 项目中端到端验证 AC1-AC5
4. **M2 规划**: 完成 M1 后启动 Jest 和覆盖率章节

---

## 附录 A: 与现有 Skill 的交互约定

当 Agent 加载 `test-report` skill 后，SKILL.md 将提供如下指令：

- **触发词**: "生成测试报告"、"跑测试并出报告"、"解析测试结果"
- **配置项** (通过 skill_query 参数或环境变量):
  - `test_command` — 默认自动检测
  - `result_file` — 解析模式指定
  - `output_format` — 默认 `markdown`
  - `output_path` — 默认 `reports/`
  - `coverage` — 默认 `auto`
  - `fail_threshold` — 默认无
- **输出**: 生成后向 Agent 返回报告路径 + 摘要（通过率、失败数、关键失败原因 Top 3）

## 附录 B: 与反阻塞协议的兼容性

- 测试执行使用 `run_in_background=true` + `background_exec.wait`，避免阻塞 Agent 主会话
- 解析模式（纯文件处理）在 5 秒内完成，符合 NFR1
- 命令检测使用非交互式 PATH 探测，符合 `agents.md` 中对 `zsh -i` 的规避要求