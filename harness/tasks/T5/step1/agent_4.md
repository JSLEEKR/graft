# A4-Specialist Analysis: T5 Analyzer (Scope, Type, Token Estimation)

## Convergence Score: 4/5

The plan is solid and implementable as-is. There are two real bugs, one spec gap the plan silently omits, and a few minor issues. None require a redesign.

---

## 1. Scope Checking Rules: Completeness Assessment

**Verdict: Almost complete -- one spec rule is missing from the plan.**

The spec (Section 4.3, Pass 2) explicitly states:

> Graph `input` must reference a declared context. Graph `output` must reference a declared produces type.

The research_arch.md acknowledges this ("currently in the plan's TypeChecker") but the plan's TypeChecker implementation does NOT include this check. The `TypeChecker.check()` method only calls `checkEdgeTransforms()` -- there is no `checkGraphInputOutput()` method.

This validation must exist somewhere. It belongs in TypeChecker (as the spec places it in Pass 2), not ScopeChecker, because it is a type-level constraint (input must be a context TYPE, output must be a produces TYPE), not just name resolution.

**Recommendation:** Add a `checkGraphInputOutput(errors)` method to TypeChecker that:
- Verifies `graph.input` is in `contextNames` (build a Set from `program.contexts`)
- Verifies `graph.output` is in `producesNames` (build a Set from `program.nodes.map(n => n.produces.name)`)

This is 10-15 lines of code, easy to add.

The ScopeChecker's three checks (reads references, edge source/target, graph flow nodes) are complete per the spec's Pass 1 description.

---

## 2. Type Checking for Edge Transforms: Semantic Correctness

**Verdict: Correct for the subset implemented, but one spec item is silently dropped.**

The spec says:

> `select(field, condition)` -- condition field must be comparable with the given operator and value.

The plan's TypeChecker only validates field existence for select/filter/drop. It does not check condition compatibility (e.g., that `>=` is used with a numeric field, not a String). This is defensible for v1 -- the AST `Condition` type stores `op` and `value` but there is no runtime type system to verify compatibility against. A deep type check would require tracking field types through transforms, which is beyond "field-existence-only checking."

**Recommendation:** Accept the omission for v1 but add a comment in the code noting this is a known gap. The spec phrase "condition field must be comparable" implies future work.

The plan's approach of silently skipping edges with unknown source nodes (`if (!sourceFields) continue; // scope checker will catch this`) is correct -- it avoids cascading errors.

---

## 3. TokenEstimator Heuristics: Reasonableness

**Verdict: Reasonable for v1. One heuristic interaction is worth noting.**

The multipliers (select=0.3x, filter=0.5x, drop=0.85x, compact=0.7x, truncate=min) are applied sequentially via a reduce loop. This means `select | compact` would produce `0.3 * 0.7 = 0.21x`, which is aggressive but not unreasonable for selecting one field then compressing it.

One concern: multiple `select` transforms in sequence. `select(a) | select(b)` would produce `0.3 * 0.3 = 0.09x`. Semantically, selecting field `a` and then selecting field `b` from the result of that -- if `b` does not exist in `{a}`, the data is empty. The estimator does not model this; it just multiplies. This is fine for v1 heuristics -- exact accounting would require a type-flow analysis.

The spec also says:

> Compare each node's estimated input against its declared `budgetIn`. Warn if estimated > declared.

The plan does NOT implement this per-node budget check. The plan only checks `worstCase > graph.budget`. The per-node `estimatedIn > budgetIn` warning is missing from the implementation.

**Recommendation:** Add a per-node check inside the flow loop:
```typescript
if (estimatedIn > node.budgetIn) {
  warnings.push(new GraftError(
    `Node '${nodeName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
    node.location,
    'warning',
  ));
}
```

---

## 4. Dependency Handling: Upstream Produces to Downstream Reads

**Verdict: Correct and well-designed.**

The TokenEstimator correctly models the dependency chain:
1. For context reads: uses `ctx.maxTokens` directly (or 0.3x for partial reads)
2. For produces reads: finds the source node by matching `produces.name`, uses `sourceNode.budgetOut`, then applies edge transform reductions

The `edgeMap` keyed by `"source->target"` enables O(1) lookup of transforms between connected nodes. This correctly handles the "upstream produces, downstream reads" pattern.

One subtlety: the edge map only stores `direct` edges, not `conditional` edges. For conditional edges, the upstream tokens would flow to multiple possible targets with no transform reduction applied. This is acceptable for v1 (sequential flow only, conditional edges are rare in the v1 subset).

---

## 5. Graph Input/Output Validation

**Verdict: Should be validated, and it is missing.**

As noted in Section 1, this is a spec requirement that the plan omits. To restate clearly:
- `graph.input` must reference a declared context name (it is the entry point data)
- `graph.output` must reference a declared produces name (it is the final output type)

This belongs in TypeChecker per the spec's placement in Pass 2.

---

## 6. Error Accumulation vs Throw

**Verdict: Plan is correct. Accumulation for all three passes.**

The research correctly identifies the key distinction:
- **Parser (T4):** throw-on-first-error (T4-R06) because parser recovery is hard and the AST would be malformed
- **Analyzer (T5):** accumulate all errors because the AST is already well-formed

All three analyzer classes return `GraftError[]`. The `TokenEstimator.estimate()` returns warnings inside `TokenReport.warnings` rather than as a separate return value -- this is correct because token warnings are part of the report, not standalone errors.

The spec (Section 7) says: "All errors are collected and reported together (not fail-on-first) to maximize feedback per compile." This directly supports error accumulation in the analyzer.

No exceptions should be thrown in the analysis path. The `continue` guards (e.g., `if (!node) continue` in TokenEstimator) correctly handle cascading from upstream scope errors without throwing.

---

## 7. Bugs in the Plan

### Bug 1: Parser Constructor Signature (CONFIRMED)
The test helper uses `new Parser(tokens, source)` but T4-R01 locks the constructor to `Token[]` only. The research_impl.md already identified this. Fix:
```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

### Bug 2: Missing Graph Input/Output Validation
Spec requires it (Section 4.3 Pass 2), plan omits it. See Sections 1 and 5 above.

### Bug 3 (minor): Missing Per-Node Budget Warning
Spec says "Warn if estimated > declared" for per-node budgetIn. Plan only warns at graph level.

---

## 8. File Naming

The research recommends renaming `analyzer/tokens.ts` to `analyzer/estimator.ts` to avoid collision with `lexer/tokens.ts`. This is a good call -- the import paths are different (`analyzer/tokens.js` vs `lexer/tokens.js`) so there is no technical collision, but developer confusion is real. The common_memory note endorses this rename.

**Recommendation:** Apply the rename during implementation. The export name `TokenEstimator` already works with `estimator.ts`.

---

## Summary of Required Changes

| Item | Severity | Action |
|------|----------|--------|
| Parser constructor in test helper | Bug | Remove `source` param from `new Parser(tokens)` |
| Graph input/output validation | Missing spec rule | Add `checkGraphInputOutput()` to TypeChecker |
| Per-node budgetIn warning | Missing spec rule | Add check in TokenEstimator flow loop |
| Rename tokens.ts to estimator.ts | Cleanup | Apply during implementation |
| Condition type compatibility | Known gap | Accept for v1, add TODO comment |
