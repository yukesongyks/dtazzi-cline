# Design: test-report-skill

## Architecture Overview

```
skills/test-report/
├── index.ts                    # Skill 入口，意图识别与路由
├── config.ts                   # 默认配置与类型定义
├── executor.ts                 # 测试执行器（执行模式）
├── parser/
│   ├── registry.ts             # 解析器注册表（插件式）
│   ├── base.ts                 # 解析器基类/接口
│   ├── jest-json.ts            # Jest JSON reporter 解析器
│   ├── vitest-json.ts          # Vitest JSON reporter 解析器
│   ├── pytest-junit.ts         # pytest JUnit XML 解析器
│   ├── pytest-json.ts          # pytest JSON report 解析器
│   └── junit-xml.ts            # 通用 JUnit XML 解析器（兜底）
├── generator/
│   ├── markdown.ts             # Markdown 报告生成器
│   ├── html.ts                 # HTML 报告生成器（P1）
│   └── json.ts                 # JSON 伴随产物生成器（P1）
├── coverage/
│   └── parser.ts               # 覆盖率数据解析（istanbul/lcov/cobertura）
├── types.ts                    # 共享类型定义
└── utils.ts                    # 工具函数（路径、时间格式化、安全过滤）
```

## Key Design Decisions

### D1: 插件式解析器架构
- **决策**: 每个测试框架对应一个独立解析器模块，通过 `registry.ts` 注册
- **理由**: 满足 NFR5（可维护性），新增框架支持不影响既有解析器
- **实现**: 解析器实现统一接口 `TestResultParser`，包含 `canHandle(resultFile)` 和 `parse(resultFile)` 方法

### D2: 框架自动检测优先级
- **优先级**: 用户显式指定 > package.json scripts > pyproject.toml/Cargo.toml > 框架特征文件推断
- **特征文件映射**:
  - `jest.config.*` → Jest
  - `vitest.config.*` → Vitest
  - `pytest.ini` / `pyproject.toml` [tool.pytest] → pytest
  - `pom.xml` / `build.gradle` → JUnit (Java)

### D3: 双模式设计
- **执行模式**: Skill 触发 `test_command` → 收集 stdout/stderr + 结果文件 → 解析 → 生成报告
- **解析模式**: 跳过执行，直接读取 `result_file` → 解析 → 生成报告
- **模式判定**: 若用户指定了 `result_file` 且文件存在，走解析模式；否则走执行模式

### D4: 报告结构标准化
报告固定六章结构，不可变更顺序：
1. 报告头（项目名、生成时间、执行命令、框架/版本、执行环境）
2. 结果摘要（用例总数、通过/失败/跳过数、通过率、总耗时、✅/❌ 结论）
3. 失败用例分析（条件渲染：有失败时必选，含用例名、文件、错误信息、堆栈关键行）
4. 用例明细（按文件分组，超 200 条截断并注明）
5. 覆盖率（条件渲染：可获取时展示语句/分支/函数/行覆盖率，低于阈值文件清单）
6. 附录（原始结果文件路径、生成工具版本）

### D5: 安全过滤
- 错误堆栈中检测并脱敏环境变量值（`process.env.*` 模式）
- 过滤常见密钥模式（AWS key、private key header、token 等）
- 报告路径限制在 workspace 内

### D6: 降级策略
- 结果文件格式异常 → 标注"格式异常"并尽可能提取已有字段
- 字段缺失 → 标注"未获取"，不崩溃
- 覆盖率数据不可获取 → 标注"未获取"，其余章节正常渲染
- 测试命令执行失败 → 返回明确诊断信息，不生成空报告

## Data Flow

```
用户指令 → [意图识别] → 判定模式
                          ├── 执行模式: [框架检测] → [执行测试] → [收集结果文件]
                          └── 解析模式: [读取结果文件]
                                          ↓
                                    [解析器匹配] → [解析结果]
                                          ↓
                                    [覆盖率收集] (可选)
                                          ↓
                                    [报告生成器] → 写入磁盘
                                          ↓
                                    返回: 报告路径 + 摘要
```

## Configuration Schema

```typescript
interface TestReportConfig {
  test_command?: string;       // 默认: 自动检测
  result_file?: string;        // 默认: 自动检测（解析模式）
  output_format: 'markdown' | 'html' | 'json';  // 默认: markdown
  output_path: string;         // 默认: reports/
  coverage: 'auto' | 'on' | 'off';  // 默认: auto
  fail_threshold?: number;     // 默认: 无（通过率低于该值时标记不达标）
}
```

## Milestones

| 阶段 | 范围 | 优先级 |
|------|------|--------|
| M1 | Jest/Vitest JSON + JUnit XML 解析、Markdown 报告、执行/解析双模式 | P0 |
| M2 | pytest 支持、覆盖率章节、fail_threshold | P1 |
| M3 | HTML 输出、JSON 伴随产物 | P1 |
| M4 | 历史趋势对比、更多框架（Go test / cargo test） | P2（后续迭代） |