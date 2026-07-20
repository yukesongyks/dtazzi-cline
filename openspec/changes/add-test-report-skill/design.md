# Design: add-test-report-skill

> Architecture, data model, parser contract, and failure-handling for the `test-report`
> skill. Implementation language: TypeScript (Node 22 ESM), consistent with the host
> monorepo. Reuse existing deps `fast-xml-parser` (JUnit XML) and `zod` (schema).

## 1. Directory layout

```
skills/test-report/
  SKILL.md                  # frontmatter + bounded guidance (activation, intents, config)
  src/
    index.ts                # skill entry: parse intent → mode → run
    config.ts               # defaults + resolution (CAP-7), zod-validated
    detect.ts               # framework/command detection (CAP-1)
    runner.ts               # execution-mode runner (background-task aware, R2)
    models.ts               # normalized TestRunResult + zod schemas
    report/
      render.ts             # orchestrates section renderers in fixed order (CAP-4)
      markdown.ts           # default renderer
      html.ts               # P1 renderer
      sections/
        header.ts           # §1 report header
        summary.ts          # §2 result summary (+ fail_threshold verdict, S9)
        failures.ts         # §3 failure analysis (truncation, secret filter)
        detail.ts           # §4 case detail (200-case truncation)
        coverage.ts         # §5 coverage (未获取 fallback)
        appendix.ts         # §6 appendix
    parsers/
      registry.ts           # parser registry + discriminator
      jest-json.ts          # CAP-3 Jest JSON
      vitest-json.ts        # CAP-3 Vitest JSON
      pytest-junit.ts       # CAP-3 pytest JUnit XML
      pytest-json.ts        # CAP-3 pytest JSON
      junit-xml.ts          # CAP-3 cross-language fallback
    security/
      redact.ts             # NFR3 secret/path filtering
    io.ts                   # write report, return path + summary (CAP-5)
  templates/
    markdown.hbs            # optional template; renderer may be code-only
    html.hbs                # P1
  fixtures/                 # sample result files per parser (goldens for tests)
  __tests__/                # vitest tests per scenario in scenarios.md
```

No host product code is touched. The skill is fully self-contained under
`skills/test-report/`.

## 2. Normalized data model (`models.ts`)

All parsers reduce their framework-specific shape into one `TestRunResult`. This is the
single contract the reporter depends on, which is what makes the plugin model safe
(NFR5) and idempotency achievable (NFR4).

```ts
// zod-validated; every field optional-aware for NFR2 degradation
export const TestCaseSchema = z.object({
  name: z.string(),
  file: z.string().optional(),          // owning file; "未获取" when absent
  status: z.enum(["passed","failed","skipped","todo"]),
  durationMs: z.number().nonnegative().optional(),
  errorMessage: z.string().optional(),
  stackLines: z.array(z.string()).default([]),   // pre-truncated, pre-redacted
});
export const CoverageRowSchema = z.object({
  file: z.string(),
  statements: z.number().optional(),
  branches: z.number().optional(),
  functions: z.number().optional(),
  lines: z.number().optional(),
});
export const TestRunResultSchema = z.object({
  framework: z.string(),
  frameworkVersion: z.string().optional(),
  command: z.string().optional(),
  env: z.string().optional(),            // sanitized summary only
  totals: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
    durationMs: z.number().nonnegative().optional(),
  }),
  cases: z.array(TestCaseSchema),
  coverage: z.object({
    overall: CoverageRowSchema.partial().optional(),
    byFile: z.array(CoverageRowSchema).default([]),
    belowThreshold: z.array(z.string()).default([]),
    obtained: z.boolean(),               // false → render "未获取"
  }).optional(),
  sourceFiles: z.array(z.string()).default([]),  // for appendix
  sourceArtifactPaths: z.array(z.string()).default([]),
});
export type TestRunResult = z.infer<typeof TestRunResultSchema>;
```

Missing numeric/optional fields never crash the reporter; they render as "未获取"
(S5, NFR2).

## 3. Parser registry & contract (`parsers/registry.ts`)

```ts
export interface TestResultParser {
  readonly id: string;                  // "vitest-json" | "jest-json" | ...
  readonly displayName: string;
  /** cheap discriminator: does this parser claim the given file/shape? */
  canDetect(input: ParserInput): boolean;
  /** parse to normalized model; MUST throw ParseError on hard corruption */
  parse(input: ParserInput): Promise<TestRunResult>;
}
export interface ParserInput {
  rawText: string;
  filePath?: string;
  frameworkHint?: string;              // from detect.ts
}
```

- Selection order: explicit hint → `canDetect` votes → junit-xml fallback last.
- Adding a parser = registering one file; no existing parser edited (S8).
- Hard corruption (unparseable JSON / XML) throws `ParseError` → surfaces as the AC4
  diagnostic; partial data is filled and flagged "未获取", never crashes (NFR2).

## 4. Mode selection (`src/index.ts`)

```
intent → config resolution (defaults + overrides) →
  if result_file provided or user says "把…转成报告" → parse-only mode
  else → execution mode (detect → run → parse inline output)
```

Execution mode hands the test command to the runtime's background-task capability and
polls (R2); it never blocks the agent turn synchronously on long suites. Parse-only
mode is fully synchronous and bounded by NFR1.

## 5. Report rendering (`report/render.ts`)

Fixed section order (CAP-4): header → summary → (failures if any) → detail →
(coverage if obtained) → appendix. Each section is a pure function of
`TestRunResult` + `config`; no section mutates the model. This is what makes the body
byte-identical across runs except the timestamp in the header (NFR4, S7).

Truncation rules:
- Stack lines: keep first N meaningful frames (default 8), cap line length (default
  240 chars). Truncation marker appended.
- Detail over 200 cases: render first 200 + a "已截断，共 N 条" note (CAP-4 §4).
- Error message: length-capped; multi-line preserved up to a cap.

## 6. Security filtering (`security/redact.ts`) — NFR3, S10

- Input denylist: env var values, `*_TOKEN`/`*_KEY`/`*_SECRET` patterns, file paths
  under common credential dirs (`~/.ssh`, `~/.aws`, `.env*`).
- Stack lines pass through `redactStackLine`: credentials → `[REDACTED]`,
  credential-bearing paths → path replaced with a neutral label, surrounding context
  preserved.
- The report header's `env` field is a *sanitized summary* (e.g. "Node 22, Linux
  x64"), never raw `process.env`.

## 7. Failure-handling matrix

| Situation                                  | Behavior                                              | Spec     |
|--------------------------------------------|-------------------------------------------------------|----------|
| Test command not found / cannot run         | diagnostic, NO report written                         | CAP-6, AC4, S4 (run-side) |
| Result file corrupted (bad JSON/XML)        | `ParseError` diagnostic, NO empty report              | CAP-6, AC4, S4 |
| Field missing in a *parseable* file         | render "未获取", rest of report intact                 | NFR2, S5 |
| Coverage absent                            | §5 renders "未获取"                                    | AC5, S5  |
| Pass rate < fail_threshold                 | verdict marked 不达标 (in addition to ✅/❌)            | S9       |
| Stack contains secret/credential path       | redacted before render                                | NFR3, S10|
| > 200 cases                                | detail truncated with note                            | CAP-4 §4|

## 8. Performance strategy (NFR1, S6)

- Parse is a single pass per file; no re-reads.
- Report render is O(n) in cases; detail truncation short-circuits at 200 emitted
  rows.
- For 1000 cases the hot path is parse + render only (execution excluded by spec);
  budget 5s is comfortable given pure-string operations.

## 9. Idempotency strategy (NFR4, S7)

- All renderers are pure functions of `(TestRunResult, config)`.
- Timestamp is the only non-deterministic field and is confined to the header; it is
  excluded from any byte-equality assertion.
- No random IDs, no `Date.now()` outside the header, no environment-dependent strings
  in the body.

## 10. Test plan (maps scenarios.md → vitest cases)

- One `__tests__/<scenario>.test.ts` per scenario S1–S12, using committed
  `fixtures/<parser>/*.json|.xml` goldens.
- S6 uses a 1000-case fixture synthesized from a template.
- S7 asserts byte-equality of the body minus the timestamp line via a regex strip.
- S10 asserts the denylist patterns do not appear in rendered output.
