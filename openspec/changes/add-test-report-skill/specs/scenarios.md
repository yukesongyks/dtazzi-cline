# Scenarios: test-report skill

> Given/When/Then coverage for the capabilities in `spec.md`. Each scenario cites the
> capability and acceptance criterion it verifies.

## S1  Execution mode on a Vitest project (AC1, AC3, CAP-2, CAP-3, CAP-4)

- **Given** a TypeScript project whose `package.json` `scripts.test` runs `vitest run`
  with the JSON reporter enabled, and the project has passing and failing cases.
- **When** the user says "生成测试报告" without any explicit command.
- **Then** the skill auto-detects `vitest` (CAP-1), runs it, parses the JSON output
  (CAP-3), and produces a Markdown report at
  `reports/test-report-<YYYYMMDD-HHmmss>.md`.
- **And** the report contains sections 1, 2, 3, 4, 6 in the fixed order; section 3 is
  present because failures exist (CAP-4).
- **And** the summary counts (total / passed / failed / skipped) equal the framework's
  own counts (AC1).

## S2  Failure analysis content (AC2, CAP-4 §3)

- **Given** the run from S1 with at least one failed case.
- **When** the report is generated.
- **Then** the failure-analysis section lists, for each failed case: case name, owning
  file path, error message, and key stack lines truncated to a readable length.
- **And** no stack line contains secret material or credential-bearing paths (NFR3).

## S3  Parse-only mode from JUnit XML (AC3, US4, CAP-2)

- **Given** a pre-existing `junit.xml` file produced by any framework, and no test
  command is requested.
- **When** the user says "把这个 junit.xml 转成测试报告".
- **Then** the skill enters parse-only mode, does NOT execute any test command, parses
  the JUnit XML via the cross-language fallback parser (CAP-3), and emits the standard
  report.

## S4  Corrupted / unparseable result file (AC4, CAP-6)

- **Given** a result file that is syntactically invalid (e.g. truncated JSON or
  malformed XML).
- **When** the skill attempts to parse it.
- **Then** the skill returns a clear diagnostic message identifying the problem.
- **And** the skill does NOT write an empty report that could be mistaken for success.

## S5  Missing coverage degrades gracefully (AC5, CAP-4 §5, NFR2)

- **Given** a run that produced no coverage data (coverage off or unsupported tool).
- **When** the report is generated.
- **Then** the coverage section renders "未获取".
- **And** all other sections (header, summary, detail, appendix; and failure analysis
  if failures exist) render normally.

## S6  Performance at scale (NFR1)

- **Given** a result file with 1000 test cases.
- **When** the skill parses the file and renders the Markdown report (execution mode's
  test run excluded from the clock).
- **Then** parse + render completes within 5 seconds.

## S7  Idempotent body (NFR4, CAP-5)

- **Given** the same result file and the same config (output path, format, thresholds).
- **When** the skill generates the report twice.
- **Then** the two report bodies are byte-identical except for the timestamp fields in
  the report header.

## S8  Plugin isolation when adding a framework (NFR5, CAP-3)

- **Given** the existing parsers (Jest, Vitest, pytest, JUnit XML) are in place.
- **When** a new parser (e.g. Go test JSON) is added under the parser registry.
- **Then** no existing parser file is modified, and the existing parsers still produce
  identical output for their respective inputs.

## S9  Fail-threshold verdict (CAP-7)

- **Given** `fail_threshold` is set to a pass-rate value and the run's pass rate is
  below that value.
- **When** the report is generated.
- **Then** the summary's overall verdict is marked 不达标 (in addition to the ✅/❌
  pass/fail marker).

## S10  No secret leakage (NFR3)

- **Given** a failing case whose stack trace or error message contains a credential or
  a credential-bearing path.
- **When** the report is generated.
- **Then** the rendered failure-analysis section does not contain the credential or the
  credential-bearing path; the surrounding context is preserved.

## S11  Parse-only mode from pytest output (CAP-3, US4)

- **Given** a pre-existing pytest JUnit XML or pytest JSON report file.
- **When** the user points the skill at it in parse-only mode.
- **Then** the skill selects the pytest parser and emits the standard report without
  running pytest.

## S12  HTML output (P1 milestone, CAP-5)

- **Given** `output_format=html`.
- **When** the report is generated.
- **Then** the skill writes an `.html` file at the configured path in addition to (or
  instead of) Markdown, with the same section structure and the same data as the
  Markdown equivalent.
