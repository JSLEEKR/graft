# A1-Architect: T5 Step 2 -- Synthesis and Architectural Decisions

## Convergence Score: 4/5

All four agents agree on the core architecture (three-class decomposition, error accumulation, heuristic-based estimation). The score is not 5 because there are two substantive gaps that all agents found but none resolved with a single agreed-upon fix: (1) where graph input/output validation belongs, and (2) how to account for retry_then_fallback fallback node cost. Both are tractable and resolved below.

---

## Consensus Items (No Debate Needed)

These items have unanimous agreement across all four agents. They are locked for implementation.

### C1: Three-Class Decomposition
ScopeChecker, TypeChecker, TokenEstimator remain as separate classes in separate files. Each is under 80 lines, they share no mutable state, and they answer fundamentally different questions. All four agents explicitly endorse this split.

### C2: Error Accumulation Pattern
All three checkers use `check(): GraftError[]` (or `estimate(): TokenReport` with embedded `warnings`). This is the correct pattern for the analyzer phase -- the AST is well-formed, checks are independent, and collecting all errors provides better UX than fail-on-first. This does NOT contradict T4-R06, which applies to the parser only.

### C3: File Rename -- tokens.ts to estimator.ts
Rename `analyzer/tokens.ts` to `analyzer/estimator.ts`. All four agents agree. Avoids confusion with `lexer/tokens.ts`. The export is `TokenEstimator`, so the filename matches. Import paths update to `../src/analyzer/estimator.js`.

### C4: Parser Constructor Bug Fix
The test helper `parse()` must use `new Parser(tokens).parse()`, not `new Parser(tokens, source).parse()`. The `source` parameter was removed in T4-R01. All four agents confirm this. Applies to both the analyzer and codegen test helpers.

### C5: Transform Heuristics Are Adequate for V1
The five multipliers (select=0.3, filter=0.5, drop=0.85, compact=0.7, truncate=min) are reasonable order-of-magnitude estimates. Multiple select stacking (0.3 * 0.3 = 0.09) is theoretically aggressive but acceptable for v1. No agent proposed changes to these values.

### C6: No Barrel Exports, .js Extensions
Per T1-R08 and T1-R09. Each analyzer file exports its class directly. All imports use `.js` extensions.

---

## Resolved Disagreements

### R1: Graph Input/Output Validation -- Placement Decision

**The issue:** The spec (Section 4.3, Pass 2) requires that `graph.input` references a declared context and `graph.output` references a declared produces type. The plan omits this check entirely. All four agents flagged this gap.

**The disagreement:** A1 and A2 lean toward ScopeChecker (it already has both `contextNames` and `producesMap`). A4 argues for TypeChecker (spec places it in "Pass 2" and it is a type-level constraint).

**Decision: ScopeChecker.** Rationale:
1. This is name resolution -- "does this name exist in the declared set?" -- which is exactly what ScopeChecker does. TypeChecker answers a different question ("does this field exist on this output?").
2. ScopeChecker already has both `contextNames` (Set) and `producesMap` (Map keyed by produces name). Adding two `has()` checks is 8-10 lines with no new data structures.
3. TypeChecker would need a new `contextNames` set it currently does not build. Adding a cross-concern dependency for two checks is worse than keeping ScopeChecker self-contained.
4. The spec's "Pass 2" label is organizational, not architectural. The important thing is that the check exists and runs before codegen.

**Implementation:** Add to `ScopeChecker.checkGraphFlow()`:
```typescript
if (!this.contextNames.has(graph.input)) {
  errors.push(new GraftError(
    `Graph input '${graph.input}' is not a declared context`,
    graph.location,
  ));
}
if (!this.producesMap.has(graph.output)) {
  errors.push(new GraftError(
    `Graph output '${graph.output}' is not a declared produces type`,
    graph.location,
  ));
}
```

**Tests required:** One test with a graph referencing a nonexistent input context, one with a nonexistent output produces type.

---

### R2: retry_then_fallback Worst-Case Cost

**The issue:** A3 identified that `getRetryMultiplier()` returns `1 + max` for `retry_then_fallback`, but this only accounts for the primary node's retries. The fallback node's cost is never added to `worstCase`. Example: Node A with `on_failure: retry(2, fallback(B))` should have worst case = `A_cost * 3 + B_cost`, not just `A_cost * 3`.

**The disagreement:** A1 said the retry multiplier logic "is correct" because "the fallback node's own cost would be counted separately if it appears in the graph flow." A3 disagrees -- the fallback node may NOT appear in the main flow (it is an error-handling path, not the happy path).

**Decision: A3 is correct. Fix required.** The fallback node is an alternate execution path triggered by failure. It does not appear in `graph.flow` (which is the happy path). The worst-case estimate must add the fallback node's cost when `retry_then_fallback` fires.

**Implementation:** In `TokenEstimator.estimate()`, after computing `worstCase += nodeTokens * retryMultiplier`, add:
```typescript
if (node.onFailure?.type === 'retry_then_fallback') {
  const fallbackNode = nodeMap.get(node.onFailure.node);
  if (fallbackNode) {
    const fallbackOut = fallbackNode.budgetOut ?? 0;
    // Fallback node runs once in worst case
    worstCase += fallbackNode.budgetIn + fallbackOut;
  }
}
```

This adds at most 6 lines. The `nodeMap` lookup is already available (or trivially built from `program.nodes`). The fallback node's input reads are harder to estimate without recursion, so using its declared `budgetIn` is the pragmatic v1 approach.

---

### R3: Conditional Edges in TokenEstimator edgeMap

**The issue:** A3 flagged that the `edgeMap` constructor only stores `direct` edges. Conditional edges are silently dropped, meaning nodes receiving data through conditional edges get no transform reduction applied (inflated estimates).

**Decision: Fix for v1.** Conditional edges carry the same transform pipeline as direct edges. Store one entry per branch target:
```typescript
for (const edge of program.edges) {
  if (edge.target.kind === 'direct') {
    this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
  } else {
    for (const branch of edge.target.branches) {
      this.edgeMap.set(`${edge.source}->${branch.target}`, edge);
    }
  }
}
```

This is 3 additional lines and ensures transform reductions apply regardless of edge routing. The transforms are on the edge, not the branch, so all branches share the same transform pipeline -- storing the same edge reference for each branch target is correct.

---

## Accepted V1 Limitations

These items were raised by one or more agents but are explicitly deferred. They are not bugs -- they are scope boundaries.

### L1: Condition Type Compatibility (A4)
The spec mentions "condition field must be comparable with the given operator and value." Implementing this requires a type-flow analysis that tracks field types through transforms. Out of scope for v1. Add a `// TODO: condition type compatibility (v2)` comment in TypeChecker.

### L2: Per-Node budgetIn Warning (A4)
A4 noted the spec says "Warn if estimated > declared" for per-node `budgetIn`. The plan only warns at graph level. This is a useful enhancement but not a correctness issue. Add it during implementation if it fits within the 80-line class budget; otherwise defer to v2.

### L3: Multiple Graphs (A3)
`TokenEstimator.estimate()` processes only `program.graphs[0]`. Multiple graphs are silently ignored. This is fine for v1 (single graph). No warning needed -- the parser itself may not even produce multiple graphs in v1.

### L4: Duplicate Edge Overwrite (A3)
If two edges share the same `source->target` key, the last one wins in `edgeMap`. This is unlikely in practice and would arguably be a semantic error in the source program. Not worth validating in v1.

---

## Test Additions Required

Beyond the plan's existing tests, the following are required based on agent findings:

| Test | Rationale | Agent Source |
|------|-----------|--------------|
| Multiple error accumulation (two undeclared nodes produce two errors) | Locks the defining behavioral difference from the parser | A2 |
| Graph input referencing nonexistent context | Validates R1 fix | All |
| Graph output referencing nonexistent produces type | Validates R1 fix | All |
| Conditional edge with undeclared target node | Tests the conditional branch path in ScopeChecker | A3 |

Optional but cheap to add:
- Filter transform on nonexistent field (A2, A3 -- same code path as select/drop, so coverage value is marginal)

---

## Final Architecture Summary

```
analyzer/
  scope.ts      -- ScopeChecker: name resolution + graph input/output validation
  types.ts      -- TypeChecker: field-existence checks on edge transforms
  estimator.ts  -- TokenEstimator: heuristic budget math with retry + fallback costing
```

Data flow:
1. ScopeChecker receives `Program`, builds `contextNames` (Set), `nodeNames` (Set), `producesMap` (Map). Validates reads refs, edge source/targets (direct + conditional), graph flow nodes, graph input/output.
2. TypeChecker receives `Program`, builds `producesFieldsMap` (Map from node name to field set). Validates select/filter/drop field references against source node produces schema.
3. TokenEstimator receives `Program`, builds `nodeMap`, `edgeMap` (including conditional branches). Walks graph flow, estimates per-node input/output, applies transform reductions, handles retry multipliers + fallback node cost, compares worst case against graph budget.

All three return `GraftError[]` (or `TokenReport` with embedded warnings). No exceptions thrown. Independent execution -- no ordering dependency between scope and type checks. TokenEstimator gracefully skips missing nodes (scope checker will catch those).

---

## Implementation Checklist

1. Fix `parse()` test helper: `new Parser(tokens).parse()`
2. Rename `tokens.ts` to `estimator.ts`, update imports
3. Add graph input/output validation to `ScopeChecker.checkGraphFlow()`
4. Store conditional edge branches in `edgeMap`
5. Add fallback node cost to `worstCase` for `retry_then_fallback`
6. Add required tests (multiple error accumulation, graph input/output, conditional edge scope)
7. Add `// TODO: condition type compatibility (v2)` comment in TypeChecker
