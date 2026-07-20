# spec: test-report skill (v1.0, T3)

> Normative requirements for the `test-report` skill. Each requirement maps to a
> scenario in `scenarios.md` and an acceptance criterion in the original request (AC1–AC5).

## Overview

A managed skill that, given a project root or an existing test-result artifact,
produces a standardized test report. The skill must be safely invocable by an agent
without human hand-holding, degrade gracefully on partial data, and never fabricate
success.

## Capabilities

### CAP-1  Framework & command detection

- The skill detects the project's test framework and run command using a fixed priority:
  1. explicit user-supplied command (highest);
  2. project config scripts — `package.json` `scripts.test`, `pyproject.toml`,
     `Cargo.toml`;
  3. framework feature files — `jest.config.*`, `vitest.config.*`, `pytest.ini`.
- When detection is ambiguous, the skill surfaces the candidates and picks the
  highest-priority match; it must not silently pick an unrelated framework.

### CAP-2  Two operating modes

- **Execution mode**: the skill triggers the test run and collects results.
- **Parse-only mode**: the skill skips execution and parses a user-specified existing
  result file. Satisfies US4 (CI reuse without re-running tests).
- The active mode is chosen from inputs: an explicit `result_file` ⇒ parse-only; an
  explicit `test_command` or auto-detected command ⇒ execution mode.

### CAP-3  P0 parser coverage

Parsers MUST exist for, at minimum:

- JavaScript/TypeScript — Jest JSON reporter output.
- JavaScript/TypeScript — Vitest JSON reporter output.
- Python — pytest JUnit XML and pytest JSON report.
- Cross-language — JUnit XML (fallback for any project).

### CAP-4  Report structure (fixed order)

The generated report MUST contain, in this exact order:

1. **Report header** — project name, generation time, executed command, framework /
   version, execution environment summary.
2. **Result summary** — total / passed / failed / skipped counts, pass rate, total
   duration; overall verdict marked ✅ / ❌.
3. **Failure analysis** (mandatory when any failure exists) — per failed case: case
   name, owning file, error message, key stack lines (truncated to a readable length).
4. **Case detail** — cases grouped by test file, with per-case duration. Default shows
   all; when count > 200 the section truncates and notes the truncation.
5. **Coverage** (when obtainable) — statement / branch / function / line coverage table
   plus a list of files below threshold.
6. **Appendix** — original result file path(s), generator tool + version.

Sections 1, 2, 4, 6 are always present. Section 3 is present iff failures exist.
Section 5 is present iff coverage data is obtainable; otherwise the slot renders
"未获取" and the remaining sections stay valid (AC5).

### CAP-5  Output format & landing

- Default output: Markdown (`.md`). P1 adds HTML. JSON is an optional structured
  companion.
- Default path: `reports/test-report-<YYYYMMDD-HHmmss>.md`; user may override the
  directory / filename.
- After generation the skill returns: report path + result summary (pass rate, failed
  count); on failure appends the 1–3 most critical failure reasons.

### CAP-6  Failure diagnostics (no false success)

- If the test command cannot run at all (not a case failure — the command itself fails
  to execute), the skill MUST emit a clear diagnostic and MUST NOT produce an empty
  report that masquerades as success (AC4).
- A corrupted / unparseable result file triggers the same diagnostic contract.

### CAP-7  Configurability (all items have defaults; user may override)

| config          | default        | notes                                                |
|-----------------|----------------|------------------------------------------------------|
| `test_command`  | auto-detect    | test execution command                               |
| `result_file`   | auto-detect    | result file path in parse-only mode                  |
| `output_format`| `markdown`     | `markdown` / `html` / `json`                        |
| `output_path`   | `reports/`     | report output directory                               |
| `coverage`      | `auto`         | `auto` / `on` / `off`                                 |
| `fail_threshold`| none           | when pass rate < threshold, verdict is marked 不达标 |

### CAP-8  Intent surface

Recognized trigger intents include: "生成测试报告", "跑一下测试并出报告",
"把这个 junit.xml 转成测试报告".

## Non-Functional Requirements (binding)

- **NFR1 Performance**: parse + report generation (excluding test execution itself) ≤ 5s
  at the 1000-case scale.
- **NFR2 Robustness**: abnormal / missing fields degrade to "未获取"; no crash, no
  silent data loss.
- **NFR3 Security**: never leak env vars / secrets; filter credential-bearing paths
  from stacks.
- **NFR4 Idempotency**: same input file → byte-identical report body except timestamp
  fields.
- **NFR5 Maintainability**: framework parsers are plugin-shaped; adding a framework
  does not modify existing parsers.

## Out of Scope (explicit)

- Test case generation / auto-fix.
- Report web hosting / online rendering.
- Multi-run trend comparison (later iteration).
- Non-test quality reports (lint, security) aggregation.
- IM / email push.
