# Test Report Skill — Implementation Plan

> **Plan:** `2026-07-16-test-report-skill` | **Status:** Ready | **Design Doc:** `docs/plans/test-report-skill-design.md`

---

## 1. Goal

Build a managed agentix skill (`test-report`) that automatically discovers the test framework, runs tests (or parses existing results), and generates a structured Markdown test report with summary, failure analysis, case details, coverage, and appendix — all triggered by a single natural-language instruction like "生成测试报告".

## 2. Architecture

The skill follows a **plugin-based parser → unified IR → multi-format reporter** pipeline. A mode router dispatches between **execute** (run tests + collect + parse + report) and **parse** (skip execution, parse existing result files). Each test framework gets a dedicated parser file in `parsers/`, auto-discovered by the registry. All parsers produce a shared `TestReportIR` intermediate representation, which the reporter renders into Markdown/HTML/JSON. The skill is a standalone managed skill under `/root/.agentix/skills/managed/test-report/` — it does not modify Kanban project source.

## 3. Tech Stack

- **Runtime:** Node.js / TypeScript (compiled with `tsx` or `ts-node` for skill execution)
- **Parsing:** `xml2js` (JUnit XML), native JSON (Vitest/Jest reporters)
- **Templating:** Handlebars (`report.md.hbs`, `report.html.hbs`)
- **Testing:** Vitest (skill self-tests with fixture files)
- **Deployment:** `dtcoder skill_manage install` or manual deploy to `~/.agentix/skills/managed/test-report/`

## 4. File Structure

```
/root/.agentix/skills/managed/test-report/
├── SKILL.md                    # Skill entry point (Agent loads via skill_load)
├── package.json                # Dependencies
├── tsconfig.json               # TS config for skill compilation
├── src/
│   ├── index.ts                # Main entry: mode router (execute/parse)
│   ├── ir.ts                   # TestReportIR + all sub-types
│   ├── detector.ts             # Framework auto-detection (FR1.1)
│   ├── runner.ts               # Test execution wrapper (background exec)
│   ├── reporter.ts             # Report generator (orchestrates format-specific renderers)
│   ├── config.ts               # Configuration defaults + override logic
│   ├── utils.ts                # Shared utilities (stack truncation, path filtering, env sanitization)
│   ├── errors.ts               # Structured error codes + messages
│   ├── reporters/
│   │   ├── markdown.ts         # Markdown report renderer
│   │   ├── html.ts             # HTML report renderer (P1)
│   │   └── json.ts             # JSON report renderer (P1)
│   ├── parsers/
│   │   ├── registry.ts         # Parser discovery + auto-registration
│   │   ├── vitest.ts           # Vitest JSON reporter parser
│   │   ├── jest.ts             # Jest JSON reporter parser (P1)
│   │   ├── pytest.ts           # pytest JUnit XML / JSON parser (P1)
│   │   └── junit-xml.ts        # Generic JUnit XML parser (fallback)
│   └── templates/
│       ├── report.md.hbs       # Markdown template
│       └── report.html.hbs     # HTML template (P1)
└── test/
    ├── fixtures/
    │   ├── vitest-pass.json
    │   ├── vitest-fail.json
    │   ├── vitest-coverage.json
    │   ├── vitest-corrupt.json
    │   ├── junit-pass.xml
    │   ├── junit-fail.xml
    │   └── junit-corrupt.xml
    ├── parsers/
    │   ├── vitest.test.ts
    │   ├── jest.test.ts        (P1)
    │   └── junit-xml.test.ts
    ├── reporters/
    │   └── markdown.test.ts
    ├── detector.test.ts
    ├── runner.test.ts
    └── integration.test.ts
```

### Responsibility Map

| File | Responsibility | Key Dependencies |
|------|---------------|------------------|
| `SKILL.md` | Agent-facing interface: trigger words, config schema, usage instructions | None |
| `src/index.ts` | Mode router: dispatch `execute` vs `parse`, orchestrate full pipeline | `detector`, `runner`, `registry`, `reporter` |
| `src/ir.ts` | All TypeScript interfaces: `TestReportIR`, `FailureDetail`, `TestSuiteResult`, `TestCaseResult`, `CoverageData` | None (pure types) |
| `src/detector.ts` | Framework detection: check explicit config → `package.json` scripts → feature files → fallback | `fs`, project root |
| `src/runner.ts` | Execute test command, capture JSON/XML output, handle command failure diagnostics | `child_process` / `exec` |
| `src/reporter.ts` | Accept `TestReportIR`, route to format-specific renderer, write to disk | `reporters/*` |
| `src/config.ts` | Resolve config from user overrides + defaults | None |
| `src/utils.ts` | Stack truncation (≤20 lines), env path sanitization, credential filtering | None |
| `src/errors.ts` | Structured error codes: `PARSE_ERROR`, `EXEC_FAILED`, `FILE_NOT_FOUND`, `CORRUPT_RESULT` | None |
| `src/parsers/registry.ts` | Discover parsers via file system, match by file extension or framework name | `parsers/*` |
| `src/parsers/vitest.ts` | Parse Vitest `--reporter=json` output → `TestReportIR` | `ir.ts` |
| `src/parsers/junit-xml.ts` | Parse JUnit XML → `TestReportIR` (cross-language fallback) | `xml2js`, `ir.ts` |
| `src/reporters/markdown.ts` | Render `TestReportIR` → Markdown string using `report.md.hbs` | `templates/report.md.hbs` |

## 5. Implementation Tasks

### Phase 1: Skill Skeleton & IR (Foundation)

- [ ] **Task 1.1: Create skill directory structure & package.json**
  - Create all directories under `/root/.agentix/skills/managed/test-report/`
  - Write `package.json` with dependencies: `xml2js`, `handlebars` (dev: `vitest`, `@types/xml2js`)
  - Write `tsconfig.json` targeting `ES2022` / `NodeNext`
  - **Files:** `package.json`, `tsconfig.json`, directory tree
  - **Verify:** `ls -R` shows correct structure; `npm install` succeeds

- [ ] **Task 1.2: Define IR types (ir.ts)**
  - Implement `TestReportIR`, `FailureDetail`, `TestSuiteResult`, `TestCaseResult`, `CoverageData` interfaces per design §3.2
  - Export all types from a barrel
  - **Files:** `src/ir.ts`
  - **Verify:** `tsc --noEmit` passes; no imports fail

- [ ] **Task 1.3: Implement structured errors (errors.ts)**
  - Define error codes: `PARSE_ERROR`, `EXEC_FAILED`, `FILE_NOT_FOUND`, `CORRUPT_RESULT`, `FRAMEWORK_NOT_DETECTED`
  - Each code maps to a user-facing Chinese error message
  - **Files:** `src/errors.ts`
  - **Verify:** `tsc --noEmit` passes

- [ ] **Task 1.4: Write SKILL.md entry point**
  - Document trigger words: "生成测试报告", "跑测试并出报告", "解析测试结果"
  - Document config schema: `test_command`, `result_file`, `output_format`, `output_path`, `coverage`, `fail_threshold`
  - Document expected output: report path + summary (pass rate, failure count, top 3 failures)
  - **Files:** `SKILL.md`
  - **Verify:** Manual review of SKILL.md for completeness

### Phase 2: Core Pipeline (M1 P0)

- [ ] **Task 2.1: Framework detector (detector.ts)**
  - Implement priority chain: 1) explicit config → 2) `package.json` `scripts.test` → 3) feature files (`vitest.config.*`, `jest.config.*`, `pytest.ini`, `pyproject.toml`) → 4) `*.junit.xml` fallback
  - Use non-interactive PATH detection (no `zsh -i`)
  - Return detected framework name + suggested command
  - **Files:** `src/detector.ts`
  - **Test:** `test/detector.test.ts` — mock `package.json` and feature files, assert correct detection

- [ ] **Task 2.2: Test runner wrapper (runner.ts)**
  - Execute test command via `child_process.exec`, capture stdout/stderr
  - Handle: command not found → `EXEC_FAILED` error; test failures (non-zero exit) → still capture output
  - Support `run_in_background` + `background_exec` protocol for long-running tests
  - Return: raw result file paths (JSON/XML)
  - **Files:** `src/runner.ts`
  - **Test:** `test/runner.test.ts` — mock exec, assert error handling

- [ ] **Task 2.3: Vitest parser (parsers/vitest.ts)**
  - Implement `TestResultParser` interface
  - Parse Vitest `--reporter=json` output → `TestReportIR`
  - Extract: `numTotalTests`, `numPassedTests`, `numFailedTests`, `numPendingTests`, `testResults[].assertionResults[]`, `testResults[].startTime/endTime`
  - Map: `assertionResults[].ancestorTitles` + `title` → `testName`; `status` → `passed|failed|skipped`; `duration` → `durationMs`; `failureMessages[]` → `errorMessage` + `stackTrace` (truncated ≤20 lines)
  - Coverage: extract from `coverageMap` if present; else set `coverage` to `undefined`
  - **Files:** `src/parsers/vitest.ts`
  - **Test:** `test/parsers/vitest.test.ts` — use fixtures `vitest-pass.json`, `vitest-fail.json`, `vitest-coverage.json`, `vitest-corrupt.json`; assert IR fields match expected values

- [ ] **Task 2.4: JUnit XML parser (parsers/junit-xml.ts)**
  - Implement `TestResultParser` interface
  - Parse JUnit XML → `TestReportIR` using `xml2js`
  - Extract: `<testsuite>` attributes (`tests`, `failures`, `errors`, `skipped`, `time`); `<testcase>` elements (`name`, `classname`, `time`, `<failure>` children)
  - Map: `classname + name` → `testName`; `time` → `durationMs`; `<failure message="">` → `errorMessage` + `stackTrace`
  - Coverage: always `undefined` (JUnit XML has no coverage data)
  - **Files:** `src/parsers/junit-xml.ts`
  - **Test:** `test/parsers/junit-xml.test.ts` — use fixtures `junit-pass.xml`, `junit-fail.xml`, `junit-corrupt.xml`

- [ ] **Task 2.5: Parser registry (parsers/registry.ts)**
  - Auto-discover parsers in `parsers/` directory
  - Match by: file extension (`.json` → vitest/jest, `.xml` → junit-xml) or framework name
  - Return the first matching parser; error if none found
  - **Files:** `src/parsers/registry.ts`
  - **Test:** `test/parsers/registry.test.ts` — verify discovery and matching

- [ ] **Task 2.6: Config resolver (config.ts)**
  - Default values: `output_format=markdown`, `output_path=reports/`, `coverage=auto`, `fail_threshold=undefined`
  - Merge user overrides with defaults
  - Validate: `output_format` must be one of `markdown|html|json`; `output_path` must be writable
  - **Files:** `src/config.ts`
  - **Test:** `test/config.test.ts` (optional, simple enough to inline-verify)

- [ ] **Task 2.7: Utilities (utils.ts)**
  - `truncateStack(stack: string, maxLines: number): string` — keep first N and last 3 lines
  - `sanitizePath(path: string): string` — strip sensitive env vars / credentials
  - `formatDuration(ms: number): string` — human-readable (e.g., "12.4s", "45ms")
  - `getEnvironment(): string` — `node <version> / <os> <arch>`
  - **Files:** `src/utils.ts`
  - **Test:** `test/utils.test.ts` (optional)

### Phase 3: Report Generation

- [ ] **Task 3.1: Markdown template (templates/report.md.hbs)**
  - Implement template per design §4.3 — 6 sections: header, summary, failures, case details, coverage, appendix
  - Use Handlebars syntax: `{{meta.projectName}}`, `{{#each failures}}`, `{{#if coverage}}`
  - Handle edge cases: no failures → skip section; no coverage → "未获取"; >200 cases → truncate with note
  - **Files:** `src/templates/report.md.hbs`
  - **Verify:** Render with sample IR, compare output to design §4.3 template

- [ ] **Task 3.2: Markdown reporter (reporters/markdown.ts)**
  - Load `report.md.hbs`, compile with Handlebars, render with `TestReportIR`
  - Write to `reports/test-report-<YYYYMMDD-HHmmss>.md`
  - Return: file path + summary (pass rate, failure count, top 3 failures)
  - **Files:** `src/reporters/markdown.ts`
  - **Test:** `test/reporters/markdown.test.ts` — render with fixture IR, assert key sections present

- [ ] **Task 3.3: Report orchestrator (reporter.ts)**
  - Accept `TestReportIR` + `config`, route to correct format renderer
  - Ensure output directory exists (`mkdir -p`)
  - **Files:** `src/reporter.ts`

### Phase 4: Main Entry & Integration

- [ ] **Task 4.1: Main entry point (index.ts)**
  - Implement `execute` mode: detect → run → collect → parse → report
  - Implement `parse` mode: detect parser by file extension → parse → report
  - Handle all error paths: framework not detected → `FRAMEWORK_NOT_DETECTED`; corrupt result → `CORRUPT_RESULT`; exec failure → `EXEC_FAILED`
  - Return structured result to Agent: `{ reportPath, summary: { passRate, failedCount, topFailures[] } }`
  - **Files:** `src/index.ts`
  - **Test:** `test/integration.test.ts` — full pipeline with Vitest fixture

### Phase 5: Verification & Installation

- [ ] **Task 5.1: Run skill self-tests**
  - `cd /root/.agentix/skills/managed/test-report && npx vitest run`
  - All tests must pass (parsers, reporters, integration)
  - **Verify:** `vitest run` exit code 0

- [ ] **Task 5.2: Install skill via dtcoder**
  - `dtcoder skill_manage install /root/.agentix/skills/managed/test-report`
  - Verify: `dtcoder skill_manage list` shows `test-report`
  - **Verify:** Skill appears in managed skills list

- [ ] **Task 5.3: End-to-end validation in Kanban project**
  - Execute mode: Agent triggers "生成测试报告" → skill runs `npx vitest run --reporter=json` → generates `reports/test-report-*.md`
  - Parse mode: Agent triggers "解析这个 junit.xml 成测试报告" → skill parses only, no execution
  - Corrupt file: Agent provides corrupt JSON → skill returns `CORRUPT_RESULT` error, no empty report
  - No coverage: Run without `--coverage` → report shows "未获取" in coverage section
  - **Verify:** All 5 ACs from design §7 pass

## 6. Verification

| AC | Description | Verification Command / Method |
|----|------------|-------------------------------|
| AC1 | Vitest project produces standard Markdown report | Run skill in Kanban → `cat reports/test-report-*.md`, check 6 sections |
| AC2 | Failures include test name, file path, error message | Inject failure fixture → assert 3 fields per failure |
| AC3 | JUnit XML parse mode triggers no test execution | Provide `junit.xml` → verify no `vitest run` or `npx` call |
| AC4 | Corrupt result file returns clear error | Provide `vitest-corrupt.json` → assert error message, no `.md` file |
| AC5 | No coverage → "未获取" annotation | Run without `--coverage` → assert coverage section says "未获取" |

## 7. Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Vitest JSON output format changes between versions | Parser is version-agnostic: extract by known keys, fallback to defaults for missing fields |
| Large test suites (>1000 cases) exceed 5s parse budget | Stream JSON parsing (if needed) or paginate; measure in M1 early |
| `xml2js` is async-only, complicates sync pipeline | Wrap in async/await throughout; skill entry is async |
| Background exec timeout on slow test suites | Use `run_in_background` + `background_exec.wait` with configurable timeout |
| Skill directory permissions prevent Agent access | Install under `/root/.agentix/skills/managed/` as managed skill |

## 8. Milestone Summary

| Phase | Scope | Tasks |
|-------|-------|-------|
| **Phase 1** | Skeleton + IR | 1.1–1.4 |
| **Phase 2** | Core Pipeline (M1 P0) | 2.1–2.7 |
| **Phase 3** | Report Generation | 3.1–3.3 |
| **Phase 4** | Main Entry + Integration | 4.1 |
| **Phase 5** | Verification + Install | 5.1–5.3 |
| **M2 (P1)** | Jest parser, coverage chapter, fail_threshold | (future) |
| **M3 (P1)** | pytest, HTML output, JSON companion | (future) |
| **M4 (P2)** | History trends, Go/cargo test | (future) |