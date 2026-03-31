# A2-Pragmatist Step 2: T5 Analyzer -- Convergence Evaluation

## Convergence Score: 4.5/5

All four Step 1 agents agree on architecture, file naming, error accumulation, and the Parser constructor bug. The only open items are A3's Bugs #3 and #4 (retry_then_fallback cost and conditional edge estimation), which I evaluate below as non-blocking for v1.

---

## Unanimous Agreement (No Further Discussion Needed)

These items have 4/4 agent consensus. Lock them in:

| Item | Decision | Agents |
|------|----------|--------|
| Three-class split (ScopeChecker / TypeChecker / TokenEstimator) | Keep | A1, A2, A3, A4 |
| Error accumulation (not throw) | Keep | A1, A2, A3, A4 |
| Parser constructor bug (`new Parser(tokens, source)`) | Fix: remove `source` param | A1, A2, A3, A4 |
| Rename `analyzer/tokens.ts` to `analyzer/estimator.ts` | Apply | A1, A2, A3, A4 |
| Graph input/output validation missing | Add to ScopeChecker or TypeChecker | A1, A2, A3, A4 |
| TokenEstimator heuristics (multipliers) | Sound for v1 | A1, A2, A3, A4 |

### Placement of Graph Input/Output Check

A1 and A2 lean toward ScopeChecker (it already has both `contextNames` and `producesMap`). A4 argues TypeChecker (spec places it in Pass 2). Either works. My pragmatic call: **ScopeChecker**, because the check is "does this name exist in the declared set?" -- that is scope resolution, not type compatibility. Adding it there avoids building redundant name sets in TypeChecker. 10 lines of code, no architectural consequence either way.

---

## A3's Bugs #3 and #4: Do They Matter for v1?

This is the key question for this step. A3 raised two medium-severity bugs that the other agents did not flag. Let me evaluate each against what v1 actually needs.

### Bug #3: `retry_then_fallback` worst-case ignores fallback node cost

**A3's claim:** When a node has `on_failure: retry(2, fallback(B))`, the worst case should be `A_cost * 3 + B_cost`, but the code returns `A_cost * (1 + max)` with no additive fallback term.

**Does it matter for v1?** No. Look at `hello.gft`:
- Neither `Researcher` nor `Writer` declares `on_failure`.
- The AST's `NodeDecl.onFailure` is optional (`onFailure?: FailureStrategy`).
- When `onFailure` is undefined, `getRetryMultiplier()` returns 1 (the default path).
- No retry or fallback logic is exercised at all.

**My call:** A3 is technically correct that the math is wrong for `retry_then_fallback`. But this is dead code for the v1 test surface. The fix requires refactoring `getRetryMultiplier()` from a pure multiplier to something that can add an offset, which touches the estimation loop structure. That is unnecessary churn for a code path that no v1 program exercises.

**Action:** Add a `// TODO: retry_then_fallback worst-case should include fallback node cost` comment in the implementation. Do not refactor for v1.

### Bug #4: Conditional edges dropped from edgeMap

**A3's claim:** The `edgeMap` constructor only stores `direct` edges. Conditional edges (kind='conditional') are silently skipped, so transforms on conditional edges are never applied to token estimates.

**Does it matter for v1?** No. Look at `hello.gft`:
- The only edge is `edge Researcher -> Writer | select(findings) | compact`, which is a direct edge.
- No conditional branching exists in the v1 example.
- The parser supports conditional edges in the AST, but the v1 test programs do not use them.

**My call:** Same as Bug #3. A3 correctly identified a real limitation, but it is inert for v1. The fix (iterating `edge.target.branches` and storing per-branch entries) is straightforward and can be added when conditional edge programs appear in the test suite.

**Action:** Add a `// TODO: store conditional edge branches for token estimation` comment. Do not implement for v1.

### Summary on A3's Bugs

A3's convergence score of 6/10 is too low. The bugs are real but dormant. The plan is implementing an analyzer for programs like `hello.gft` -- a linear two-node pipeline with direct edges, no retries, no fallbacks, no conditionals. A3 is stress-testing corner cases that are correct to document but wrong to block on.

---

## A4's Per-Node budgetIn Warning

A4 uniquely flagged that the spec says "Warn if estimated > declared" for per-node `budgetIn`, but the plan only warns at graph level (`worstCase > graph.budget`).

**Does it matter for v1?** Mildly. For `hello.gft`, Writer reads `Research.findings` (partial read), so the estimator would compute `estimatedIn` for Writer. If that exceeds Writer's `budgetIn: 1500`, a per-node warning is useful feedback. This is a 5-line addition inside the existing flow loop and does not require any structural changes.

**My call:** Include it. It is cheap, it exercises the warning severity path, and it matches the spec.

**Action:** Add per-node budgetIn check in the estimation loop.

---

## Test Coverage Gaps

A3 flagged two missing tests (conditional edge scope check, filter transform type check). A2-Step1 recommended a multi-error accumulation test.

**Pragmatic filter:**

| Test | Add for v1? | Rationale |
|------|-------------|-----------|
| Multi-error accumulation (2 errors -> length === 2) | Yes | This is the defining behavioral difference from the parser. 5 lines. |
| Conditional edge scope check | No | No conditional edges in v1 programs. The code handles it, but testing dead paths adds noise. |
| Filter transform type check | No | Same code path as select/drop. Two tests already cover it. Low marginal value. |

---

## Implementation Checklist (Ordered by Priority)

1. **Fix Parser constructor** in test helper: `new Parser(tokens)` not `new Parser(tokens, source)`.
2. **Rename** `analyzer/tokens.ts` to `analyzer/estimator.ts`.
3. **Add graph input/output validation** to ScopeChecker's `checkGraphFlow()`.
4. **Add per-node budgetIn warning** in TokenEstimator's flow loop.
5. **Add multi-error accumulation test** (two undeclared nodes -> two errors).
6. **Add TODO comments** for retry_then_fallback fallback cost and conditional edge estimation.

Items 1-5 are implementation work. Item 6 is documentation of known v1 limitations.

---

## What NOT to Do

- Do not refactor `getRetryMultiplier()` to handle additive fallback costs. Dead code for v1.
- Do not store conditional edge branches in `edgeMap`. Dead code for v1.
- Do not add condition type compatibility checking (A4's note about `>=` on numeric fields). Out of scope, no type system to check against.
- Do not add tests for conditional edges or filter transforms. Cover them when those features are exercised.
- Do not merge the three analyzer classes. The split is justified and unanimous.

---

## Verdict

The plan is ready for implementation with the six items above. The architecture is sound, the agents agree, and the v1 scope is well-defined. A3's findings are valuable documentation for post-v1 but should not delay or complicate the current implementation.
