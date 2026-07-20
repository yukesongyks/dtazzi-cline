# Proposal: add-test-report-skill

## Summary

Add a new managed skill `test-report` (v1.0, milestone T3) that lets an agent, after
running tests (or receiving existing result files), automatically parse the results and
emit a structured, human-readable standard test report (Markdown by default).

The skill standardizes the report into four fixed sections — summary, detail, failure
analysis, coverage — and supports the P0 frameworks used in this monorepo: Vitest/Jest
(JSON reporter), pytest (JUnit XML / JSON), and JUnit XML as a cross-language fallback.

## Motivation

Today test results are scattered across terminal output, CI logs, and framework-native
artifacts (JUnit XML, `coverage/`). Concrete pain points:

- Manual collection and summarization of results is slow and error-prone.
- No unified report format → cross-project / cross-team communication is expensive.
- Failed cases require manual backtracking of error messages, stacks, and source files.
- Quality metrics (pass rate, coverage) are not captured as trackable history.

## Goals

- **G1** One instruction (e.g. "生成测试报告") drives: run tests → collect results →
  generate report.
- **G2** Report is standardized: report header, result summary, failure analysis
  (when failures exist), case detail, coverage (when available), appendix — fixed order.
- **G3** Support mainstream test frameworks in P0: Jest, Vitest (JSON reporter);
  pytest (JUnit XML / JSON); JUnit XML as cross-language fallback.
- **G4** Multiple output formats; Markdown is the default. HTML (P1) and JSON (optional
  companion) are planned.

## Non-Goals

- No automatic test case generation or auto-fix — reporting only.
- No online hosting / web-service rendering of the report.
- No trend comparison across multiple runs (candidate for a later iteration).
- No aggregation of non-test quality reports (lint, security scans).
- No IM / email push of the report (explicitly out of scope).

## Affected Areas

- `skills/test-report/` (new managed skill directory) — `SKILL.md`, parser plugins,
  reporter templates, fixtures, tests.
- No changes to existing product code paths. The skill is additive and self-contained.
- Optional companion: a thin runtime helper for invoking the test command and parsing
  artifacts; lives entirely under the skill directory.

## Design Sketch

- **Plugin-based parser architecture** (NFR5): one parser per framework / format,
  registered against a discriminator (file shape or framework hint). Adding a new
  framework never touches existing parsers.
- **Two operating modes**: execution mode (skill triggers the run) and parse-only mode
  (user points at an existing result file → no test execution).
- **Degradation contract** (NFR2): missing/abnormal fields render as "未获取" and never
  crash the run; a corrupted result file produces a clear diagnostic instead of an empty
  success report.
- **Security** (NFR3): report never echoes env vars / secrets; stack traces are
  filtered to remove credential-bearing paths.
- **Idempotency** (NFR4): same input file → same report body (timestamp fields excepted).

See `design.md` for the data model, parser contract, and failure-handling table.

## Risks

- **R1** Framework reporter outputs vary widely → mitigated by the plugin abstraction
  (NFR5) and a shared normalized `TestRunResult` intermediate model.
- **R2** Test execution latency is unbounded → the skill must defer to the runtime's
  background-task capability (run + poll), never block the agent turn synchronously on
  long suites.
- **R3** Coverage data shape differs per tool → coverage is best-effort; when absent the
  section renders "未获取" and the rest of the report stays valid (AC5).

## Rollout / Rollback

- **Rollout**: ship as a managed skill (opt-in). No existing agent behavior changes
  unless the user explicitly invokes "生成测试报告". Discovery happens via the skills
  registry; no migration needed.
- **Rollback**: remove the `skills/test-report/` directory and its registry entry. No
  persistent state, no database, no shared config to revert. A generated report file on
  disk is a plain artifact the user may delete.

## Open Questions (resolved for this proposal)

- **Q1** First-iteration target stack is TypeScript/Node (this monorepo uses Vitest on
  Node 22). P0 scope is set accordingly. → *Resolved: yes, TS/Node first.*
- **Q2** Report template language: Chinese only. The request and all user-facing copy
  are Chinese; no bilingual template is required for v1.0. → *Resolved: Chinese only.*
- **Q3** Auto-push to IM / email: explicitly a non-goal. → *Resolved: no push.*
