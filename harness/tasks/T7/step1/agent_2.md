# A2-Pragmatist Review: T7 Compiler Pipeline & CLI

## Convergence Score: 4/5

Both researchers agree on all material facts: the two known bugs (estimator import path, Parser constructor), the pipeline shape, the CLI structure, and the test strategy. Minor divergence only on framing. This is the most straightforward task so far -- the plan is solid, the bugs are known, and the surface area is small.

## Focus Area Responses

### 1. Is compiler.ts minimal?

**Yes.** The plan's `compiler.ts` is 35 lines of orchestration. It does exactly one thing: wire the pipeline stages together and return a discriminated `CompileResult`. No logic lives here that belongs elsewhere. The `compileAndWrite` wrapper is two lines. This is correct YAGNI.

One observation: the plan catches only `GraftError` and re-throws everything else. This is the right design -- unexpected errors (bugs) should crash, expected errors (bad source) should be reported. No change needed.

### 2. Can the CLI be simpler?

**Marginally, but not worth it.** The `compile` and `check` commands share ~20 lines of token analysis output formatting. You could extract a `printReport()` helper, but it would save maybe 5 lines and add an indirection. The plan's approach of inline formatting is fine for v1.

One real simplification: the `check` command description says "no generation" but `compile()` runs codegen in-memory anyway. Both researchers note this is intentional and acceptable. The codegen is pure (no side effects), so running it during `check` validates the full pipeline without disk writes. The only cost is a few microseconds of CPU. Keep as-is.

The `toLocaleString()` calls in the CLI output use the default locale (no `'en-US'` argument), while codegen's `orchestration.ts` uses `toLocaleString('en-US')`. This is fine -- CLI output is for humans in their locale; codegen output is for machine-consumed files that need deterministic formatting. No change needed.

### 3. Are integration tests over-testing?

**No.** The six success-path tests each verify a distinct layer:
1. `compiles hello.gft successfully` -- pipeline completes
2. `generates correct file set` -- codegen produces expected paths
3. `reports token analysis within budget` -- estimator integration
4. `generates valid JSON in settings` -- settings content correctness
5. `generates agent markdown with correct structure` -- agent content correctness
6. `generates hook script with jq transforms` -- hook content correctness

These are integration tests -- they're *supposed* to assert across layers. Each test catches a different class of regression. The failure test (test 7) covers the error path. This is the minimum set for a compiler integration suite.

One thing to watch: tests 4-6 assert on specific content strings (`claude-sonnet-4-20250514`, `===NODE_COMPLETE:researcher===`, `jq`). These are coupled to codegen output format, which is correct for integration tests but means codegen changes will break these tests. This is a feature, not a bug -- integration tests should break when the contract changes.

## Known Bugs (confirmed)

| # | Bug | Fix | Source |
|---|-----|-----|--------|
| 1 | `import ... from './analyzer/tokens.js'` | Change to `'./analyzer/estimator.js'` | Both researchers, T5-R02, common_memory |
| 2 | `new Parser(tokens, source)` | Change to `new Parser(tokens)` | Both researchers, T4-R01, common_memory |

Both are blockers. Both are the same stale-signature bugs seen in T5 and T6. The plan's test helper source also likely contains these if copied from the plan.

## Implementation Notes

- `writeFiles` is already exported from `codegen.ts` (line 59) -- no action needed (research_impl flagged this as CHECK, now confirmed).
- `TokenReport` and `TokenEstimator` live in `src/analyzer/estimator.ts` -- import path must use `estimator.js`.
- Commander v14 API is stable; plan's usage is standard.
- `process.exit(1)` only in CLI handlers, never in library code -- correct separation.
- The `readSource()` helper uses `fs.existsSync` + `fs.readFileSync` -- synchronous is fine for CLI entry points.

## Recommendation

**Implement as planned with the two bug fixes.** No structural changes needed. This task has the smallest creative surface of any task so far -- it's pure wiring. The plan got the architecture right; it just carried forward two stale constructor signatures that have been caught in every task since T5.

## Proposed Ratchet Locks

- [T7-R01] `compiler.ts` is pure orchestration -- no business logic
- [T7-R02] `CompileResult` discriminated type with `success` boolean
- [T7-R03] `process.exit` only in CLI handlers, not library code
- [T7-R04] integration tests use inline source strings, not filesystem reads
