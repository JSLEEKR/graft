# A2-Pragmatist: T7 Step 2 -- Triage of A3's New Bugs

## Convergence Assessment

A1, A2 (me), and A4 all scored convergence at 4/5 and agreed: the plan is solid, fix the two known blockers, implement as-is. A3 scored 5/10 and raised 9 new bugs (bugs 3-11). The question is whether any of those new bugs are v1 must-fix or whether they can be deferred.

I am evaluating each on its own merits, not dissenting for the sake of it.

---

## A3's New Bugs: Verdict

### BUG 5 (No graph declaration = silent success) -- V1 MUST-FIX

**Agree with A3.** This is the only new bug that genuinely matters for v1. A compiler that silently succeeds on incomplete input and produces degenerate output is a real correctness bug. The fix is 3 lines in `compile()` -- check `program.graphs.length === 0` and return failure. The cost is trivial, the benefit is preventing silent bad output, which is the worst failure mode a compiler can have.

This is worth doing because it catches a realistic user mistake (forgetting the `graph` block or having a partial file) and the fix is cheap.

### BUG 4 (check command description misleading) -- V1 MUST-FIX (trivially)

**Agree with A3.** Changing a string from "no generation" to "no file output" is a zero-cost fix. It takes 5 seconds. No reason to ship a misleading description when the fix is a single string edit.

### BUG 6 (No lexer error test case) -- V1 SHOULD-FIX

**Agree with A3.** Adding one 4-line test case for the lexer error path costs nothing and catches a real gap -- the `catch (e) { if (e instanceof GraftError)` path in `compile()` is never exercised by the existing tests. This is the kind of thing that pays for itself the first time someone refactors error handling.

### BUG 3 (CRLF misaligns error pointer) -- DEFER

**Disagree on severity.** A3 calls this "High" but it is a cosmetic issue in `diagnostics.ts` (a pre-existing file from T2), not a T7 bug. The error caret is off by one character on Windows CRLF files. Annoying but not incorrect -- the error message, line number, and column are all still correct. The pointer just has extra whitespace. This should be filed and fixed, but it is not a T7 blocker. T7 should not be patching T2's `diagnostics.ts`.

### BUG 7 (compileAndWrite doesn't catch write errors) -- DEFER

**Disagree on severity.** The raw Node.js error for invalid paths (ENOENT, EPERM) is informative enough. Users who pass null bytes in paths or try to write to locked files will see a stack trace, but these are developer-error edge cases, not normal user flows. A v1 CLI can surface raw errors for filesystem failures. Polish later.

### BUG 8 (toLocaleString locale pinning) -- DEFER

**Disagree on severity.** A2's Step 1 analysis already addressed this: CLI output is for humans in their locale, codegen output is for machine-consumed files. The CLI showing `6.000` on a German machine is actually correct behavior for a CLI tool -- it respects the user's locale. The codegen files pin to `en-US` because they produce deterministic machine-readable output. These are different contexts with different requirements. No change needed.

### BUG 9 (Integration test fixture too narrow) -- DEFER

**Disagree this is a bug at all.** The integration test covers the happy path end-to-end. It is not supposed to exhaustively test every codegen feature -- that is what T6's unit tests do. Integration tests verify the pipeline wiring works. The current fixture (context, two nodes, edge with transforms, graph) is sufficient for that purpose. Adding on_failure, tools, conditionals, etc. would make the test fixture harder to maintain without catching any bugs that T6's unit tests don't already catch.

### BUG 10 (readSource permission errors) -- DEFER

**Agree this is low.** The raw EPERM error is fine for v1. Users almost never hit file permission errors, and when they do, the Node.js error message is clear enough.

### BUG 11 (Multiple graphs silently ignored) -- DEFER

**Agree this is low.** The language spec is single-graph for v1. A warning would be nice but is not a correctness issue. If someone declares two graphs, they are already outside the spec.

---

## Summary

| Bug | A3 Severity | My Verdict | Rationale |
|-----|-------------|------------|-----------|
| 1 (import path) | Critical | **V1 MUST-FIX** | Known blocker, all agents agree |
| 2 (Parser constructor) | Critical | **V1 MUST-FIX** | Known blocker, all agents agree |
| 5 (no graph = silent success) | High | **V1 MUST-FIX** | Real correctness bug, 3-line fix |
| 4 (check description) | Medium | **V1 MUST-FIX** | Zero-cost string edit |
| 6 (lexer error test) | Medium | **V1 SHOULD-FIX** | 4-line test, covers real gap |
| 3 (CRLF pointer) | Medium | **DEFER** | Pre-existing T2 bug, cosmetic |
| 7 (write error handling) | Medium | **DEFER** | Edge case, raw error is fine |
| 8 (locale pinning) | Medium | **DEFER** | Different context, current behavior is correct |
| 9 (test fixture breadth) | Low | **DEFER** | Unit tests cover this, integration test scope is right |
| 10 (readSource permissions) | Low | **DEFER** | Rare, error message is clear enough |
| 11 (multiple graphs) | Low | **DEFER** | Single-graph spec for v1 |

## Implementation Scope for T7

Fix bugs 1, 2, 4, 5. Add test case for bug 6. Defer the rest. Total additional work beyond the original plan: ~10 lines of code.

## Ratchet Locks (carried from Step 1)

- [T7-R01] `compiler.ts` is pure orchestration -- no business logic
- [T7-R02] `CompileResult` discriminated type with `success` boolean
- [T7-R03] `process.exit` only in CLI handlers, not library code
- [T7-R04] Integration tests use inline source strings, not filesystem reads
- [T7-R05] Compiler rejects programs with zero graph declarations (Bug 5 fix)
