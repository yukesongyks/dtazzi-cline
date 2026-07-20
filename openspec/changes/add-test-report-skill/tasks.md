# Tasks: add-test-report-skill

> Ordered, checkbox-tracked tasks for implementing the `test-report` skill. Grouped by
> milestone from the original request (M1 P0, M2 P1, M3 P1, M4 P2-out-of-scope-here).
> Tests live next to the code they verify (per openspec-propose artifact standards).
> Do not check boxes during propose; `openspec-apply` checks them as work completes.

## M1 — P0: Vitest/Jest JSON + JUnit XML, Markdown, dual mode

### Skeleton & config

- [ ] Create `skills/test-report/SKILL.md` with frontmatter (name, description,
      activation, intents from CAP-8, config table from CAP-7).
- [ ] Add `skills/test-report/src/config.ts`: default config + zod schema + override
      resolution. Test: `__tests__/config.test.ts` (defaults win / override wins).
- [ ] Add `skills/test-report/src/models.ts`: `TestCaseSchema`, `CoverageRowSchema`,
      `TestRunResultSchema` (see design §2). Test: invalid/missing fields parse to
      optional, never throw.

### Detection & modes

- [ ] Add `skills/test-report/src/detect.ts` (CAP-1 priority chain). Test fixtures:
      `package.json` (vitest), `pyproject.toml` (pytest), `jest.config.*`.
- [ ] Add `skills/test-report/src/index.ts` mode selection (design §4): parse-only vs
      execution. Test: explicit `result_file` ⇒ parse-only; explicit `test_command` ⇒
      execution.
- [ ] Add `skills/test-report/src/runner.ts` execution runner delegating to the
      runtime's background-task capability (R2). No synchronous long-run blocking.

### Parsers (plugin registry)

- [ ] Add `parsers/registry.ts`: `TestResultParser` interface + selection order
      (hint → canDetect → junit-xml fallback). Test: S8 isolation — adding a stub
      parser does not touch existing ones.
- [ ] Add `parsers/junit-xml.ts` (cross-language fallback; use `fast-xml-parser`).
      Fixture: `fixtures/junit-xml/*.xml`. Maps to `TestRunResult`.
- [ ] Add `parsers/vitest-json.ts` (Vitest JSON reporter). Fixture:
      `fixtures/vitest-json/*.json`.
- [ ] Add `parsers/jest-json.ts` (Jest JSON reporter). Fixture:
      `fixtures/jest-json/*.json`.
- [ ] Hard-corruption path: parsers throw `ParseError`; `index.ts` surfaces diagnostic
      and writes NO report (AC4, S4). Test: corrupted fixture → diagnostic, no file.

### Report rendering (Markdown, fixed order)

- [ ] Add `report/render.ts` orchestrating §1→§6 in fixed order (CAP-4). Each section
      is a pure function of `(TestRunResult, config)`.
- [ ] Add `report/sections/header.ts` (§1): project, time, command, framework/version,
      sanitized env summary.
- [ ] Add `report/sections/summary.ts` (§2): counts, pass rate, duration, ✅/❌.
- [ ] Add `report/sections/failures.ts` (§3, only when failures): name, file, error,
      truncated stack. Calls `security/redact.ts`.
- [ ] Add `report/sections/detail.ts` (§4): grouped by file; >200-case truncation
      with note.
- [ ] Add `report/sections/coverage.ts` (§5): "未获取" when `obtained=false`.
- [ ] Add `report/sections/appendix.ts` (§6): source artifact paths, tool version.
- [ ] Add `report/markdown.ts`: composes sections to a single `.md` string.
- [ ] Add `src/io.ts`: writes to `reports/test-report-<YYYYMMDD-HHmmss>.md`, returns
      `{ path, summary }` (CAP-5).

### M1 acceptance (scenarios S1, S2, S3, S4, S5, S7, S8, S10)

- [ ] `__tests__/s1-vitest-execution.test.ts` — full execution-mode run on a Vitest
      sample project; asserts counts equal framework output (AC1).
- [ ] `__tests__/s2-failure-content.test.ts` — failure section has name/file/error
      (AC2); no secret in output (S10).
- [ ] `__tests__/s3-parse-only-junit.test.ts` — parse-only from `junit.xml`, no run
      (AC3, US4).
- [ ] `__tests__/s4-corrupted-file.test.ts` — corrupted input → diagnostic, no report
      (AC4).
- [ ] `__tests__/s5-missing-coverage.test.ts` — §5 renders "未获取", rest intact (AC5).
- [ ] `__tests__/s7-idempotent-body.test.ts` — two runs byte-equal except timestamp
      (NFR4).
- [ ] `__tests__/s8-plugin-isolation.test.ts` — add stub parser, existing unchanged.
- [ ] `__tests__/s10-no-secret-leak.test.ts` — denylist absent from rendered report.

## M2 — P1: pytest, coverage section, fail_threshold

- [ ] Add `parsers/pytest-junit.ts` (pytest JUnit XML). Fixture:
      `fixtures/pytest-junit/*.xml`.
- [ ] Add `parsers/pytest-json.ts` (pytest JSON report). Fixture:
      `fixtures/pytest-json/*.json`.
- [ ] Wire coverage parsing into each applicable parser → `coverage` block in
      `TestRunResult`.
- [ ] Implement `coverage.ts` below-threshold file list (CAP-4 §5).
- [ ] Implement `fail_threshold` verdict in `summary.ts` (S9: 不达标 marker).
- [ ] `__tests__/s9-fail-threshold.test.ts`, `__tests__/s11-pytest-parse-only.test.ts`.
- [ ] NFR1 perf gate: `__tests__/s6-perf-1000.test.ts` using a 1000-case synthesized
      fixture; parse+render ≤ 5s.

## M3 — P1: HTML output, JSON companion

- [ ] Add `report/html.ts` (P1). Same section contract; same data (S12).
- [ ] Add optional JSON companion output (`output_format=json`): emit the normalized
      `TestRunResult` JSON.
- [ ] `__tests__/s12-html-output.test.ts` — HTML file at configured path, same data
      as Markdown equivalent.

## M4 — P2 (later iteration, out of scope here)

- [ ] Trend comparison across runs (non-goal for v1.0).
- [ ] Additional parsers: Go test JSON, cargo test.
