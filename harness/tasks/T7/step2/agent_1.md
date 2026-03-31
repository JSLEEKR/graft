# T7 Step 2: A1-Architect Synthesis

## Consensus Summary

All four agents (A1-Architect, A2-Pragmatist, A3-Skeptic, A4-Specialist) converge on the core design: sequential pipeline in compiler.ts, discriminated CompileResult, Commander CLI with compile/check subcommands, and inline-source integration tests. Convergence scores are 4/5 (A1, A2, A4) and 5/10 (A3). The two known blockers (estimator import, Parser constructor) are unanimous. A3 raises several new bugs; the most important is the "no graph = silent success" gap, which is a real compiler correctness issue.

---

## Unanimous Fixes (All 4 Agents Agree)

### Fix 1: Import path `./analyzer/tokens.js` -> `./analyzer/estimator.js`

**Status: ACCEPTED -- all agents flag this as build-breaking.**

The plan imports `TokenEstimator` and `TokenReport` from `'./analyzer/tokens.js'`. The actual module is `./analyzer/estimator.js` (confirmed T5-R02, T6-R01, source). This is the same stale-path bug found in T5 and T6.

**Action:** `import { TokenEstimator, TokenReport } from './analyzer/estimator.js';` in compiler.ts.

### Fix 2: Parser constructor `new Parser(tokens, source)` -> `new Parser(tokens)`

**Status: ACCEPTED -- all agents flag this as build-breaking.**

T4-R01 locks Parser as taking `Token[]` only. The plan passes a second `source` argument. TypeScript strict mode rejects this.

**Action:** `new Parser(tokens)` in compiler.ts and any test helpers.

---

## Evaluated Issues with Decisions

### Issue 3: No `graph` declaration produces silent success (A3 Bug 5)

**Raised by:** A3 (High severity, new finding)
**Not raised by:** A1, A2, A4

A3 traces through the full pipeline for a `.gft` file with contexts, nodes, and edges but no `graph` declaration. The result: `compile()` returns `success: true` with degenerate output (empty CLAUDE.md, zero budget, default model). No error is emitted because ScopeChecker iterates `program.graphs` (empty array, no errors), TypeChecker has no graph dependency, and the error gate passes. TokenEstimator and codegen silently operate on `program.graphs[0]` which is undefined.

This is the worst failure mode for a compiler: silently producing incorrect output for invalid input. A `graph` declaration is what ties the Graft program together -- without it, the generated harness is useless.

**Decision: ACCEPTED -- add a graph-existence check.**

A3's suggested fix is clean and minimal:
```typescript
if (program.graphs.length === 0) {
  return { success: false, errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 })], warnings };
}
```

Place this check in `compile()` after parsing, before the analyzers run. This is a single guard clause -- zero architectural impact.

**Action:** Add `program.graphs.length === 0` check in compiler.ts after parse, returning `success: false` with a descriptive error.

### Issue 4: CRLF line endings misalign error caret in `GraftError.format()` (A3 Bug 3)

**Raised by:** A3 (Medium severity, new finding)
**Not raised by:** A1, A2, A4

`GraftError.format()` in `diagnostics.ts` splits on `'\n'`, which leaves trailing `\r` on Windows CRLF files. The caret pointer in error output will be misaligned by one position. T7 is the first time `format()` gets exercised via real file I/O (all prior tests used inline strings with `\n`).

**Decision: DEFERRED -- pre-existing bug in diagnostics.ts, not a T7 scope item.**

This is a real cosmetic bug, but it lives in `diagnostics.ts` (T2 scope), not in T7's new code. The CLI correctly passes `source` to `format()` -- the bug is in how `format()` processes that string. Fixing it in T7 would mean modifying a file owned by T2 without regression tests for that module. The fix is trivial (`source.split(/\r?\n/)` or `.replace(/\r\n/g, '\n')`) but should be done as a targeted fix with its own test, not as a side-effect of T7.

**Action:** No change for T7. Log as a known issue for a follow-up diagnostics fix.

### Issue 5: `check` command description says "no generation" but codegen runs in-memory (A3 Bug 4)

**Raised by:** A3 (Medium severity), A4 (observation)
**Noted by:** A1, A2 (both acknowledge as intentional)

The `.description()` string on the check command reads "no generation" but `compile()` runs the full pipeline including codegen in-memory. All four agents agree codegen is cheap and running it validates the full pipeline without disk side effects.

**Decision: ACCEPTED -- fix the description string only.**

The behavior is correct (validate full pipeline, no disk writes). Only the description is misleading.

**Action:** Change description to `'Check .gft source (parse + analyze, no file output)'` or `'Validate .gft source without writing files'`.

### Issue 6: CLI `toLocaleString()` without locale pinning (A3 Bug 8)

**Raised by:** A3 (Medium severity), A2 (low risk note)
**Not raised by:** A1, A4

The CLI formats token counts with `.toLocaleString()` (no locale argument), while codegen's orchestration.ts uses `.toLocaleString('en-US')` per T6-R02. On non-US machines, CLI output will format differently from generated files.

**Decision: ACCEPTED -- use `'en-US'` consistently.**

This is the same fix pattern applied in T6. The cost is zero and it prevents locale-dependent output inconsistency.

**Action:** Use `.toLocaleString('en-US')` for all number formatting in the CLI (src/index.ts).

### Issue 7: `compileAndWrite` does not catch `writeFiles` exceptions (A3 Bug 7)

**Raised by:** A3 (Medium severity)
**Not raised by:** A1, A2, A4

If `writeFiles()` throws (e.g., invalid path, permission denied, disk full), the exception propagates as a raw Node.js stack trace. The CLI compile action does not wrap `compileAndWrite()` in a try-catch.

**Decision: ACCEPTED -- add try-catch in CLI action handler.**

The fix belongs in the CLI action handler (not in the library function), consistent with T7-R03 (`process.exit` only in CLI handlers). Wrap the `compileAndWrite()` call in a try-catch that prints a clean error message and exits with code 1.

**Action:** Add try-catch around `compileAndWrite()` in the CLI compile action. Print `Error: ${e.message}` to stderr and `process.exit(1)`.

### Issue 8: Integration test missing lexer/parser error path (A3 Bug 6)

**Raised by:** A3 (Medium severity), A4 (observation, not flagged as bug)
**Not raised by:** A1, A2

The "rejects invalid programs" test uses a source with undefined references, which triggers scope errors but never exercises the `catch (e) { if (e instanceof GraftError) }` path in `compile()`. A lex/parse failure case would cover this critical error path.

**Decision: ACCEPTED -- add one test case.**

A3's suggestion is minimal: one additional test with `'@@@'` as source, asserting `success: false` and error is `GraftError`. This covers the try-catch path with near-zero cost.

**Action:** Add a `'catches lexer errors'` test case to integration.test.ts.

### Issue 9: `readSource` does not catch `readFileSync` permission errors (A3 Bug 10)

**Raised by:** A3 (Low severity)
**Not raised by:** A1, A2, A4

If a file exists but is not readable (locked, no permissions), `readFileSync` throws an uncaught exception producing a raw stack trace.

**Decision: DEFERRED -- rare edge case, low priority.**

The `existsSync` + `readFileSync` pattern is standard for CLI tools. Permission errors on Windows are rare in practice (file locking is more common but typically manifests as EBUSY, not EACCES). The raw stack trace is ugly but diagnostic. Not worth the code for v1.

**Action:** No change for T7.

### Issue 10: Integration test fixture coverage (A3 Bug 9)

**Raised by:** A3 (Low severity)
**Not raised by:** A1, A2, A4

The `HELLO_GFT` fixture does not test `on_failure`, `tools`, conditional edges, or `filter`/`drop`/`truncate` transforms. These are unit-tested in T6.

**Decision: DEFERRED -- unit tests cover the gaps.**

Integration tests verify the pipeline wiring, not every codegen feature. The current fixture exercises all pipeline stages (lex, parse, scope, type, estimate, codegen) with representative language features. Expanding the fixture adds test maintenance cost without catching new bug classes.

**Action:** No change for T7.

### Issue 11: Multiple `graph` declarations silently ignored (A3 Bug 11)

**Raised by:** A3 (Low severity)
**Not raised by:** A1, A2, A4

All codegen modules use `program.graphs[0]`. A second graph is silently ignored.

**Decision: DEFERRED -- spec says single graph for v1.**

If multi-graph support is added later, the compiler should warn or error on multiple graphs. For v1, single-graph is the spec.

**Action:** No change for T7.

### Issue 12: `CompileResult` uses `boolean` not true discriminated union (A4 observation)

**Raised by:** A4 (observation)
**Not raised by:** A1, A2, A3

TypeScript won't narrow optional fields after `result.success === true` without `!` assertions. A true discriminated union (`{ success: true; program: Program; ... } | { success: false; ... }`) would be more type-safe.

**Decision: DEFERRED -- acceptable trade-off for v1.**

The plan's own tests use `result.report!` and `result.files!`, confirming this is a known ergonomic cost. The simpler interface is easier to implement and understand. Can be tightened later if the assertion noise becomes excessive.

**Action:** No change for T7.

---

## Confirmed Design Decisions (No Disagreement)

These items received unanimous or near-unanimous agreement with no objections:

1. **Pipeline ordering is correct.** Lex -> Parse -> Scope -> Type -> Gate -> Estimate -> Codegen. (All 4 agents)
2. **Dual error-handling strategy.** Throw-on-first for lex/parse, accumulate for analyzers. (All 4 agents)
3. **`compiler.ts` is pure orchestration, no business logic.** (All 4 agents, proposed as T7-R01)
4. **`process.exit` only in CLI handlers, never in library code.** (All 4 agents, proposed as T7-R03)
5. **Integration tests use inline source strings, not filesystem reads.** (All 4 agents, proposed as T7-R04)
6. **`writeFiles` already exported from codegen.ts (line 59).** No new export needed. (A1, A2, A4 confirmed)
7. **`compileAndWrite` is a thin wrapper: compile() + writeFiles().** (All 4 agents)
8. **`check` runs full pipeline in-memory including codegen.** Intentional, validates full pipeline without disk side effects. (All 4 agents)
9. **`resolveJsonModule` avoided via hardcoded version string.** (A4 confirmed, correct choice)
10. **Non-GraftError exceptions re-throw.** Unexpected errors (bugs) should crash, not be swallowed. (A1, A2, A4)

---

## Proposed Ratchet Locks

| Lock | Description | Source |
|------|-------------|--------|
| T7-R01 | `compiler.ts` is pure orchestration -- no business logic | A1, A2 |
| T7-R02 | `CompileResult` discriminated type with `success` boolean | A1, A4 |
| T7-R03 | `process.exit` only in CLI handlers, not library code | A1, A2, A4 |
| T7-R04 | Integration tests use inline source strings, not filesystem reads | A1, A2 |
| T7-R05 | Programs without a `graph` declaration must fail compilation | A3 (new) |

---

## Final Implementation Checklist

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Fix `./analyzer/tokens.js` -> `./analyzer/estimator.js` | BLOCKER | Must fix |
| 2 | Fix `new Parser(tokens, source)` -> `new Parser(tokens)` | BLOCKER | Must fix |
| 3 | Add `program.graphs.length === 0` error check after parse | HIGH | Must fix |
| 4 | Fix `check` command description (no misleading "no generation") | LOW | Fix during implementation |
| 5 | Use `.toLocaleString('en-US')` in CLI number formatting | LOW | Fix during implementation |
| 6 | Add try-catch around `compileAndWrite()` in CLI action | LOW | Fix during implementation |
| 7 | Add lexer error test case to integration tests | LOW | Fix during implementation |
| 8 | CRLF caret misalignment in diagnostics.ts | DEFERRED | Not T7 scope |
| 9 | `readSource` permission error handling | DEFERRED | Not T7 scope |
| 10 | Integration test fixture breadth | DEFERRED | Unit tests cover |
| 11 | Multiple graph declarations warning | DEFERRED | Single-graph spec for v1 |
| 12 | `CompileResult` true discriminated union | DEFERRED | Acceptable for v1 |

---

## Files to Create/Modify

| File | Action | Lines (est.) |
|------|--------|-------------|
| `src/compiler.ts` | CREATE | ~60 |
| `src/index.ts` | OVERWRITE | ~100 |
| `tests/integration.test.ts` | CREATE | ~120 |

Total new/modified: ~280 lines. No architectural changes to existing modules.
