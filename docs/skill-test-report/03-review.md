# Skill 2.0 T2 · 测试报告 Skill · 代码评审报告 (Review)

> 阶段: review | 采用技能: /code-review-skill | 产物性质: 编码实现的质量门禁结论
> 生成时间: 2026-07-20 (UTC) | SSOT: `docs/skill-test-report/01-clarify.md` + `02-plan.md`
> 评审对象: `docs/skill-test-report/skill/src/**` (TypeScript 实现)

---

## 0. 评审范围与结论速览

### 0.1 审查范围
| 模块 | 路径 | 审查深度 |
| --- | --- | --- |
| IM 契约层 | `src/types.ts` (136L) | 完整深读 |
| 框架识别 | `src/detector.ts` (140L) | 完整深读 |
| 运行器/编排/渲染 | `src/runner.ts` (355L) | 完整深读 |
| 解析器插件接口 | `src/parsers/interface.ts` (22L) | 完整深读 |
| 解析层共享工具 | `src/parsers/shared.ts` (110L) | 完整深读 |
| 错误类型 | `src/errors.ts` (31L) | 完整深读 |
| `src/parsers/{jest,vitest,junit}-parser.ts`、`registry.ts` | — | 仅见接口契约与 runner 侧调用，**待复核** |
| `src/{index,config,i18n}.ts` | — | 仅见摘要，**待复核** |

### 0.2 总体结论
| 维度 | 评级 | 关键依据 |
| --- | --- | --- |
| 功能正确性 (AC1-AC5) | ❌ 不通过 | Jest 执行模式基本不可用 (F1)；未识别框架执行模式必败 (F4) |
| 类型安全 | ⚠️ 有缺陷 | `"auto" \| string` 类型吞没 (F10)；`{} as SkillConfig` 类型逃逸 (F11) |
| 健壮性 (NFR2) | ⚠️ 有缺陷 | 命令失败判定逻辑错误 (F2)；guessed 文件读取未防护 (F8) |
| 安全 (NFR3) | ⚠️ 有缺陷 | diagnostic 含未脱敏 stderr (F14)；敏感词表覆盖不全 (F13) |
| 幂等 (NFR4) | ✅ 基本通过 | 时间戳字段除外，内容一致 |
| 可维护性 (NFR5) | ⚠️ 有缺陷 | runner.ts 单文件 355L 承担 6 职责 (F16)；顶层注册副作用 (F17) |
| 性能 (NFR1) | ⚠️ 有风险 | execSync 30 分钟同步阻塞 (F7) |

**门禁结论：❌ 不通过，须修复 P0/P1 后复审。**

---

## 1. P0 级问题（阻断发布，必修）

### F1 · Jest 执行模式产出报告失败，违反 AC1
- **位置**: `src/runner.ts:142`、`src/runner.ts:116-123`
- **现象**: `wrapForJUnit` 对 Jest 注入 `--json --outputFile=test-results.json`，但 `runExecuteMode` 在 stdout 为空时仅扫描 `["test-results.xml","junit.xml","reports/junit.xml","coverage/test-results.xml"]`，**不含 `test-results.json`**。Jest JSON reporter 默认写文件不写 stdout，导致 stdout 为空 → guessed 落空 → 抛 `RESULT_FILE_EMPTY`。
- **影响**: AC1（在含 Jest 的 TS 项目执行"生成测试报告"产出报告）无法满足；Jest 执行模式基本不可用。
- **修复建议**:
  1. guessed 列表按检测到的框架动态补充：Jest → `test-results.json`、Vitest → `test-results.xml`；
  2. 或统一让 `wrapForJUnit` 把两种框架都导向 `test-results.xml`（JUnit XML 作为通用桥接，与 runner.ts:84 注释一致），Jest 用 `--reporter=jest-junit` 而非 `--json`。

### F2 · 测试命令"无法运行"判定逻辑错误，违反 FR1.4 / AC4
- **位置**: `src/runner.ts:105`
- **代码**:
  ```ts
  if (exitCode !== 0 && stdout.trim() === "" && stderr.trim() !== "") {
    throw new TestReportError("TEST_COMMAND_FAILED", ...);
  }
  ```
- **缺陷**: 条件要求 **stderr 非空** 才判为"命令无法运行"。但命令不存在（如 `npx` 未安装、拼写错误）时 stderr 可能为空，stdout 也为空，此时不抛 `TEST_COMMAND_FAILED`，而继续走到 `runner.ts:125` 抛 `RESULT_FILE_EMPTY`，错误码语义错误。
- **影响**: FR1.4"测试执行失败须给出明确诊断"落空；AC4 误报为"结果文件空"而非"命令无法运行"，诊断误导用户。
- **修复建议**: 改为 `if (exitCode !== 0 && stdout.trim() === "")` 即判命令无法运行；stderr 为空时 diagnostic 标注"无 stderr 输出"。

### F3 · `looksUserSpecified` 运算符优先级 bug，导致命令参数重复注入
- **位置**: `src/runner.ts:137`
- **代码**:
  ```ts
  return cmd.includes("--") || cmd.includes(" ") && !cmd.startsWith("npx vitest run") && !cmd.startsWith("npx jest");
  ```
- **缺陷**: `&&` 优先于 `||`，实际等价 `A || (B && C && D)`。对 `npx vitest run`（含空格，非 `--`）→ `(true && true && true)=true`，被判为"用户已指定"→ 不注入参数（恰好正确）；但对 `npx vitest run --reporter=json`（含 `--`）→ `A=true` 直接判用户指定，跳过注入（也正确）。但语义混乱依赖偶然巧合，且对 `npm test`（含空格、无 `--`、不以 npx 开头）→ `false || (true && true && true)=true`，判为"用户已指定"→ 不注入 reporter，**npm test 模式无法产出结构化结果**。
- **影响**: 执行模式默认路径（npm test）无法生成报告。
- **修复建议**: 显式加括号并重构判定：`const hasUserFlags = cmd.includes("--"); const looksBareRunner = cmd.startsWith("npx vitest run") || cmd.startsWith("npx jest") || cmd === "npm test"; return hasUserFlags || !looksBareRunner;`（语义：含用户标志或非裸 runner 命令视为用户指定）。或更稳妥：让用户显式标志只在 `opts.testCommand` 非空时生效，detector 返回的命令一律走 wrap。

### F4 · 未识别框架时执行模式必然失败，缺乏降级路径
- **位置**: `src/detector.ts:44-48`（兜底 `unknown` + `npm test`）、`src/runner.ts:83-86`
- **现象**: detector 兜底返回 `framework="unknown"`、`testCommand="npm test"`。`wrapForJUnit("npm test")` 不匹配 vitest/jest 正则 → 原样执行 → `npm test` 输出多为 TAP 或人类可读文本，非 JUnit XML / Jest JSON → `parseContent` 全部 parser `sniff` 返回 false → 抛 `PARSE_FORMAT_INVALID`。
- **影响**: 用户在未配置测试框架特征文件的项目执行"生成测试报告"会得到格式错误，而非"请指定 resultFile 走解析模式"的引导。
- **修复建议**: `resolveContext` 在 `det.framework === "unknown"` 且未提供 `resultFile` 时，抛 `FRAMEWORK_NOT_DETECTED` 并在 diagnostic 提示用户显式指定 `--result-file` 或 `--test-command`。

---

## 2. P1 级问题（应修复，影响 NFR/AC）

### F5 · detector 违反 FR1.1 识别优先级，丢弃用户显式命令
- **位置**: `src/detector.ts:67-114`（`detectByConfigFiles`）
- **需求**: FR1.1 优先级 a（用户显式命令）> b（配置）> c（特征文件）。
- **缺陷**: `detectByConfigFiles` 命中 vitest/jest 配置后，**硬编码**返回 `testCommand: "npx vitest run"` / `"npx jest"`，完全忽略 `opts.userTestCommand`。仅当 `userFramework` 显式指定时（`detector.ts:31`）才尊重用户命令。
- **影响**: 用户传入 `--test-command="npm test -- --coverage"` 时，若项目有 `vitest.config.ts`，命令被覆盖为 `npx vitest run`，用户意图丢失。
- **修复建议**: `detectByConfigFiles` 接收 `userTestCommand`，命中框架后 `testCommand: opts.userTestCommand ?? defaultCommandFor(framework)`。

### F6 · `resolveContext` 二次调用 detectFramework，重复 IO 且语义不一致
- **位置**: `src/runner.ts:59` 与 `src/runner.ts:150-152`（`assembleReport` 内再次调用）
- **缺陷**: `resolveContext` 已调一次 `detectFramework` 拿到 `det`，但只取 `det.testCommand` 丢弃 `frameworkVersion`；`assembleReport` 又调一次 `detectFramework` 仅为取 `frameworkVersion`。两次磁盘 IO（读 package.json / 探测特征文件），违反 NFR1（5 秒内 1000 用例）。
- **修复建议**: `resolveContext` 返回时携带 `det`（或至少 `frameworkVersion`），传入 `assembleReport` 复用。

### F7 · execSync 30 分钟同步阻塞，违反 R2 / NFR1
- **位置**: `src/runner.ts:91-97`
- **代码**: `timeout: 30 * 60 * 1000`，且用 `execSync` 同步阻塞。
- **缺陷**: 需求 R2 明确"测试执行耗时不可控，长任务需交由后台执行并轮询"。`execSync` 阻塞 Agent 运行时主线程，无法轮询、无法取消，超时前整个进程冻结。
- **影响**: 长测试套件会触发 Agent 运行时超时；NFR1"解析+生成 5 秒内"虽不含执行，但执行阻塞会导致后续解析无法启动。
- **修复建议**: 改用 `child_process.spawn` 异步 + Promise，或暴露 `runAsync` 入口供 Agent 后台调度；timeout 缩短为可配置（默认 10 分钟）并支持中断。

### F8 · guessed 结果文件读取未 try-catch，违反 NFR2
- **位置**: `src/runner.ts:121`
- **代码**: `parseSrc = readFileSync(guessed, "utf8");`（无 try-catch）
- **缺陷**: `existsSync` 与 `readFileSync` 之间存在竞态（文件被删除/权限变更），`readFileSync` 抛原始 `Error` 未被封装为 `TestReportError`，违反 NFR2"不得崩溃"。
- **修复建议**: 包裹 try-catch，失败时跳过该 guessed 文件继续尝试下一个，或抛 `RESULT_FILE_NOT_FOUND` 带 diagnostic。

### F9 · detector pytest 检测遗漏 frameworkVersion，数据不一致
- **位置**: `src/detector.ts:104-106`
- **缺陷**: vitest/jest 经 package.json scripts 检测时调用 `pickDepVersion` 取版本，但 pytest 分支（`detector.ts:104`）未调用，`frameworkVersion` 缺失，与 vitest/jest 不一致。
- **影响**: 报告头"测试框架"列对 pytest 缺版本号，数据口径不统一。
- **修复建议**: pytest 分支补充 `frameworkVersion: pickDepVersion(pj, "pytest")`（虽 pytest 通常不在 package.json，但保持调用一致性，缺失返回 undefined 即可）。

### F10 · `SkillConfig.testCommand` 类型设计错误，"auto" 字面量被吞没
- **位置**: `src/types.ts:97`
- **代码**: `testCommand: "auto" | string;`（`resultFile` 同理）
- **缺陷**: `"auto" | string` 中 `string` 是 `"auto"` 的超集，联合类型归约为 `string`，"auto" 字面量在类型层不可区分。`config.testCommand !== "auto"` 这类判断（`runner.ts:59`）失去类型层面的保护，且无法阻止任意字符串混入。
- **修复建议**: `testCommand: "auto" | (string & {});` 用空对象交叉类型保留字面量区分（agents.md: 无 any，优先类型）。

### F11 · `renderHtmlFallback` 用 `{} as SkillConfig` 类型逃逸
- **位置**: `src/runner.ts:347`
- **代码**: `renderMarkdown(report, { ...({} as SkillConfig), outputFormat: "markdown" });`
- **缺陷**: `{} as SkillConfig` 等价 `any` 级别的类型逃逸，违反 agents.md "No any types"。且 `failThreshold` 等字段 undefined，HTML 模式下 `failThreshold` 不达标提示逻辑丢失。
- **影响**: M3 HTML 输出时 fail_threshold 行为不一致。
- **修复建议**: HTML 渲染应复用传入的 `config`（`renderHtmlFallback` 应接收 `config` 参数），而非构造空对象。

### F12 · `statusLabel` 参数为 `string` 而非 `TestStatus`，丢失类型安全
- **位置**: `src/runner.ts:329`
- **缺陷**: `function statusLabel(s: string)` 接收任意字符串，switch default 兜底"❓ 未知"。应使用 `TestStatus` 类型，让编译期穷尽性检查保证所有枚举值覆盖。
- **修复建议**: `function statusLabel(s: TestStatus): string`，并移除 default 分支或改为 never 断言。

---

## 3. P2 级问题（改进项，不阻断）

### F13 · 敏感信息过滤覆盖不全且过宽
- **位置**: `src/parsers/shared.ts:5-22`
- **缺陷**:
  - **不全**: `SECRET_PATTERNS` 未覆盖 GitLab token (`glpat-`)、Slack token (`xox[baprs]-`)、JWT (`eyJ...`)、PEM 私钥块 (`-----BEGIN ... PRIVATE KEY-----`)。
  - **过宽**: `/\b[A-Za-z0-9+/]{40,}\b/g` 会误过滤 commit sha、长 hash、堆栈中的合法长 token，破坏堆栈可读性（违反 NFR2"不得静默丢数据"精神）。
  - **误伤**: `^(?:[A-Z][A-Z0-9_]*)=(.+)$` 会过滤测试断言消息中的 `KEY=value` fixture 数据。
- **修复建议**: 收紧长 base64 正则为 `/^[\w+/]{40,}={0,2}$/`（锚定行首/独立 token）；补充 gitlab/slack/jwt 模式；环境变量过滤限定 KEY 在敏感词表内才过滤。

### F14 · `TEST_COMMAND_FAILED` diagnostic 含未脱敏 stderr，违反 NFR3
- **位置**: `src/runner.ts:106-110`、`src/runner.ts:125-130`
- **缺陷**: diagnostic 直接拼接 `stderr.slice(0, 300)`，**未走 `defaultSanitize`**。stderr 可能含环境变量值、token、路径型凭据。
- **影响**: NFR3"错误堆栈须过滤敏感路径外的凭据信息"违反；报告/错误输出可能泄露密钥。
- **修复建议**: `diagnostic: defaultSanitize(stderr.slice(0, 300))`，`runParseMode`/`assembleReport` 所有拼入 diagnostic 的外部文本均过 sanitize。

### F15 · `wrapForJUnit` 命令拼接无转义，存在命令注入面
- **位置**: `src/runner.ts:140-145`
- **缺陷**: `${cmd} --reporter=junit --outputFile=test-results.xml` 直接字符串拼接，若 `cmd` 含 `;` / `&&` / `` ` ``（用户传入），参数注入会变成命令注入。虽 `cmd` 来自用户显式指定或 detector 内部常量，但用户显式 `--test-command` 路径无校验。
- **修复建议**: 用 `execFileSync` 数组参数形式，或对 `cmd` 做 shell 元字符白名单校验。

### F16 · runner.ts 单文件 355 行承担 6 职责，违反 NFR5 / agents.md 单一职责
- **位置**: `src/runner.ts` 全文
- **职责**: 编排 + 执行模式 + 解析模式 + 报告组装 + 落盘 + Markdown 渲染 + HTML 渲染 + 工具函数（`statusLabel`/`fmtDur`/`escapeHtml`/`resolveDirOf`）。
- **影响**: 违反 agents.md "Break components into small, single-responsibility files"；新增 HTML/JSON 渲染、新增执行策略会持续膨胀。
- **修复建议**: 拆分为 `runner/orchestrator.ts`、`runner/execute-mode.ts`、`runner/parse-mode.ts`、`renderer/markdown.ts`、`renderer/html.ts`、`renderer/json.ts`、`utils.ts`。

### F17 · 顶层 `registerParser` 模块副作用，测试/多次 import 风险
- **位置**: `src/runner.ts:23-26`
- **缺陷**: 模块顶层执行 `registerParser(new VitestParser())` 等 3 次。若 `registry` 未做幂等（去重），重复 import（测试场景常见）会重复注册；且副作用耦合，import `runner` 即触发注册，无法单独测试 runner 编排逻辑而不加载解析器。
- **修复建议**: 改为显式 `initParsers()` 函数，由 `index.ts` 入口调用一次；`registry.registerParser` 对同 id 幂等去重（**待复核 registry 实现**）。

### F18 · `resolveDirOf` 手写路径分割，未用 `node:path`
- **位置**: `src/runner.ts:227-230`
- **缺陷**: 用 `lastIndexOf("/")` / `lastIndexOf("\\")` 手写分割目录，已 `import { join, resolve } from "node:path"` 却不用 `dirname`。
- **修复建议**: `import { dirname } from "node:path"; return dirname(p);` 跨平台更稳。

### F19 · `readProjectName` 与 `detector.readPackageJson` 重复读 package.json
- **位置**: `src/runner.ts:187-197` 与 `src/detector.ts:126-136`
- **缺陷**: 同一 `package.json` 在一次 `run` 中被读 2-3 次（detector + readProjectName + assembleReport 内 detector 二次调用）。违反 NFR1 性能精神。
- **修复建议**: `resolveContext` 一次读取 `package.json` 解析结果，透传给 detector 与 readProjectName。

---

## 4. 验收标准 (AC) 覆盖核查

| AC | 状态 | 依据 |
| --- | --- | --- |
| **AC1** Jest/Vitest TS 项目执行"生成测试报告"产出符合 4.2 结构的 Markdown | ❌ | F1：Jest 执行模式 `test-results.json` 不在 guessed 列表，必抛 `RESULT_FILE_EMPTY` |
| **AC2** 失败用例报告含用例名、文件路径、错误信息 | ✅ | `runner.ts:262-275` 失败分析板块渲染 `f.name`/`f.filePath`/`f.error.message`/`f.error.stack` |
| **AC3** JUnit XML 解析模式不触发执行即可产出报告 | ✅ | `resolveContext`（`runner.ts:50-57`）`resultFile` 非 auto 即走 `runParseMode`，不调 `execSync` |
| **AC4** 结果文件损坏返回明确错误而非空报告 | ⚠️ 待复核 | 依赖 `parsers/*.parse` 抛 `PARSE_FORMAT_INVALID`；F2 导致命令失败误报为 `RESULT_FILE_EMPTY`；registry/parser 实现未深读 |
| **AC5** 覆盖率存在时呈现，不存在时标注"未获取" | ⚠️ 待复核 | `runner.ts:300-302` 无覆盖率时输出"未获取。" ✓；但 JUnit XML 无覆盖率字段，junit-parser 是否填充 `hasCoverage=false` 待复核 |

---

## 5. 类型安全与代码风格核查（对照 agents.md）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 无 `any` | ⚠️ | F11 `{} as SkillConfig` 等价 any 逃逸；F12 `statusLabel(s: string)` 应为 `TestStatus` |
| 无内联 import | ✅ | 均为顶层 `import`，无 `await import()` |
| SDK 类型优先 | ✅ | `@types/node` 已安装，`execSync`/`readFileSync` 类型来自 node 类型定义 |
| 单一职责 | ❌ | F16 runner.ts 355L 六职责 |
| 错误信息/标识符保留 | ✅ | 评审中错误码、字段名均保留原文 |
| 不降级代码修类型错误 | ✅ | 未发现为修类型错误而删除逻辑的情况 |

---

## 6. 健壮性 (NFR2) 专项

| 边界场景 | 状态 | 说明 |
| --- | --- | --- |
| 结果文件格式异常 | ⚠️ 待复核 | 依赖 parser 实现，registry 无匹配时是否抛 `PARSE_FORMAT_INVALID` 待确认 |
| 字段缺失降级标注"未获取" | ✅ | `readProjectName`/`fmtDur`/`f.error?.message ?? "(未获取错误信息)"` 等降级完备 |
| 命令无法运行 | ❌ | F2 判定逻辑错误 |
| 文件读取竞态 | ❌ | F8 guessed 读取未防护 |
| JSON.parse 失败 | ✅ | `readProjectName`/`readPackageJson` 均 try-catch |

---

## 7. 安全 (NFR3) 专项

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 报告不泄露环境变量/密钥 | ⚠️ | F14 diagnostic 含未脱敏 stderr；F13 过滤不全 |
| 堆栈过滤凭据 | ⚠️ | `defaultSanitize` 已用于 `buildError`（`shared.ts:32-38`），但 diagnostic 路径未过 sanitize |
| 不泄露环境变量值 | ✅ | `buildEnvSummary` 仅输出 Node 版本/platform/arch |
| 命令注入面 | ⚠️ | F15 `wrapForJUnit` 字符串拼接无转义 |

---

## 8. 必修修复清单（按优先级）

| ID | 优先级 | 模块 | 修复点 | 关联 AC/NFR |
| --- | --- | --- | --- | --- |
| F1 | P0 | runner.ts:116-123 | guessed 列表按框架补充 `test-results.json`，或 Jest 统一用 jest-junit | AC1 |
| F2 | P0 | runner.ts:105 | 命令失败判定改为 `stdout.trim()===""` | FR1.4/AC4 |
| F3 | P0 | runner.ts:137 | `looksUserSpecified` 加括号并重构 | 执行模式默认路径 |
| F4 | P0 | runner.ts:49-65 | unknown 框架未提供 resultFile 时抛 `FRAMEWORK_NOT_DETECTED` | FR1.1 |
| F5 | P1 | detector.ts:67-114 | `detectByConfigFiles` 尊重 `userTestCommand` | FR1.1 |
| F6 | P1 | runner.ts:150-152 | 复用 `det`，消除二次 detect | NFR1 |
| F7 | P1 | runner.ts:91-97 | `execSync` → 异步 spawn，timeout 可配置 | R2/NFR1 |
| F8 | P1 | runner.ts:121 | guessed 读取 try-catch | NFR2 |
| F10 | P1 | types.ts:97 | `"auto" \| (string & {})` | 类型安全 |
| F11 | P1 | runner.ts:347 | HTML 渲染复用 config，移除 `{} as SkillConfig` | 类型安全/M3 |
| F12 | P1 | runner.ts:329 | `statusLabel(s: TestStatus)` | 类型安全 |
| F14 | P1 | runner.ts:106-130 | diagnostic 走 `defaultSanitize` | NFR3 |
| F13 | P2 | shared.ts:5-22 | 补 gitlab/slack/jwt，收紧长 base64 正则 | NFR3 |
| F15 | P2 | runner.ts:140-145 | 命令拼接改数组参数或校验 | 安全 |
| F16 | P2 | runner.ts 全文 | 拆分 renderer/executor 模块 | NFR5 |
| F17 | P2 | runner.ts:23-26 | `registerParser` 改显式 init + 幂等 | NFR5 |
| F9 | P2 | detector.ts:104-106 | pytest 补 frameworkVersion | 数据一致性 |
| F18 | P2 | runner.ts:227-230 | 用 `node:path.dirname` | 跨平台 |
| F19 | P2 | runner.ts/detector.ts | package.json 单次读取透传 | NFR1 |

---

## 9. 复审建议

1. **P0 修复后必须重新跑 AC1/AC4 验收**：构造 Jest 项目 + 损坏 junit.xml 两个场景。
2. **parsers/registry 待复核项**：需补充阅读 `src/parsers/{jest,vitest,junit}-parser.ts`、`src/registry.ts`，确认：
   - `sniff` 互斥性（避免误判 JSON 为 JUnit）；
   - 无匹配时抛 `PARSE_FORMAT_INVALID`（AC4）；
   - JUnit parser 填充 `coverage.totals.hasCoverage=false`（AC5）；
   - `registry.registerParser` 幂等去重（F17）。
3. **index.ts 待复核**：CLI 参数解析是否用 `process.argv` 手写（建议改 `yargs`/`commander` 或至少类型化），错误退出码是否区分 `TEST_COMMAND_FAILED`/`PARSE_FORMAT_INVALID`。
4. **i18n.ts 待复核**：Q2 首期 zh-CN，确认 `formatGeneratedAt` 时区处理（types.ts:69 注释 ISO8601 UTC，渲染转 zh-CN，需确认 `formatGeneratedAt` 实现）。

---

## 10. 评审结论

**门禁：❌ 不通过。**

P0 问题 F1-F4 直接导致 AC1 不满足、执行模式默认路径不可用，须修复后方可进入下一阶段。P1 问题 F5-F8/F10-F12/F14 影响类型安全、健壮性、安全，建议同批修复。P2 为架构与可维护性改进，可在后续迭代落地。

修复 P0+P1 后，**需复审 parsers/registry/index/i18n 四个未深读模块**，并补跑 AC1-AC5 五个验收场景，方可放行。

---

> 评审报告冻结。下游 apply 阶段须以本报告 §8 修复清单为执行基线，P0 全部修复 + P1 至少修复 F5/F7/F8/F10/F14 后方可复审。
