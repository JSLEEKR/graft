# A3-Skeptic: Bug Report for T5 Analyzer

## Convergence Score: 6/10

The plan's analyzer code is structurally sound -- three independent checkers with error accumulation is the right pattern. The ScopeChecker handles the hardest cases (conditional edges, partial refs) correctly. But there are real gaps: missing validation of graph input/output references, a retry estimation bug for retry_then_fallback, the known Parser constructor bug, and several untested edge cases. None are architectural; all are fixable during implementation.

---

## BUG 1 (CRITICAL, KNOWN): `new Parser(tokens, source)` -- source parameter removed in T4

**Location:** Test helper `parse()` (plan line ~1946)

```typescript
return new Parser(tokens, source).parse();
```

The actual parser constructor (T4-R01) takes `Token[]` only. This will fail to compile.

**Fix:** `return new Parser(tokens).parse();`

**Status:** Already documented in research_impl.md. Confirmed real.

---

## BUG 2 (MEDIUM): Graph `input` and `output` references are never validated

**Location:** ScopeChecker and TypeChecker -- neither validates `GraphDecl.input` or `GraphDecl.output`.

The research_arch.md (section 4) explicitly states: "graph `input` must reference a declared context, graph `output` must reference a declared produces type." But looking at the plan code:

- `ScopeChecker.checkGraphFlow()` only validates `graph.flow` node names. It never checks `graph.input` against `contextNames` or `graph.output` against `producesMap`.
- `TypeChecker.check()` only calls `checkEdgeTransforms()`. No graph input/output validation.

A program with `graph G(input: NonexistentContext, output: NonexistentOutput, budget: 5k)` would pass both checkers silently.

**Fix:** Add to `checkGraphFlow()`:
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

---

## BUG 3 (MEDIUM): `retry_then_fallback` worst-case underestimates by ignoring fallback node cost

**Location:** `getRetryMultiplier()` (plan line ~2478-2488)

```typescript
case 'retry_then_fallback':
  return 1 + node.onFailure.max;
```

For `retry_then_fallback`, the worst case is: the node runs `1 + max` times (original + retries), and THEN the fallback node runs once. The current code multiplies only the current node's cost by `1 + max`. It never adds the fallback node's cost.

Example: Node A has `on_failure: retry(2, fallback(B))`. Worst case = A runs 3 times + B runs once. Current code: `A_cost * 3`. Missing: `+ B_cost`.

This is genuinely hard to fix in `getRetryMultiplier()` because the method only returns a multiplier, not an additive term. The architecture needs a small refactor to add the fallback node's `budgetIn + budgetOut` to `worstCase` when a `retry_then_fallback` strategy fires.

**Fix:** In `estimate()`, after computing `worstCase += nodeTokens * retryMultiplier`, check if `node.onFailure?.type === 'retry_then_fallback'` and add the fallback node's estimated cost.

---

## BUG 4 (MEDIUM): `edgeMap` silently drops conditional edges, breaking token estimation

**Location:** `TokenEstimator` constructor (plan line ~2380-2384)

```typescript
for (const edge of program.edges) {
  if (edge.target.kind === 'direct') {
    this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
  }
}
```

Conditional edges (kind='conditional') are completely ignored. If a node's output flows through a conditional edge with transforms, the `applyTransformReductions()` call in `estimate()` will never find the edge, and the upstream tokens will be unmodified. This means token estimates for nodes receiving data through conditional edges will be inflated.

For v1 this may be acceptable (conditional edges are rare in simple pipelines), but it should at minimum be documented or produce a warning.

**Fix:** For conditional edges, store an entry for each branch target:
```typescript
for (const branch of edge.target.branches) {
  this.edgeMap.set(`${edge.source}->${branch.target}`, edge);
}
```

---

## BUG 5 (MEDIUM): Multiple edges from the same source to different targets -- last one wins

**Location:** `TokenEstimator` constructor (plan line ~2381)

```typescript
this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
```

If there are two edges from source A: `edge A -> B | select(x)` and `edge A -> C | compact`, both store correctly since the keys differ (`A->B` vs `A->C`). This is fine.

BUT: if there are two edges from A to B (e.g., different transform pipelines for different conditions), the second overwrites the first. This is unlikely in practice but not validated.

**Severity revised:** LOW. The ScopeChecker does not flag duplicate edges either, but this is an edge case unlikely in v1.

---

## BUG 6 (LOW): Node with empty `reads` array -- no crash, but estimatedIn = 0

**Location:** `estimate()` (plan line ~2403-2423)

When `node.reads` is `[]` (which the parser allows -- reads is initialized to `[]`), the for loop over `node.reads` executes zero times, and `estimatedIn = 0`. The `nodeTokens = estimatedIn + estimatedOut = 0 + budgetOut`. This is correct behavior -- a node with no reads only produces output. No bug.

**Status:** Verified correct.

---

## BUG 7 (LOW): Node with empty `tools` array -- not validated anywhere

**Location:** All three checkers

No checker validates that `node.tools` exists or has entries. The parser allows `tools: []` and also omitting `tools:` entirely (defaults to `[]`). Neither the ScopeChecker nor the TypeChecker checks whether tool names are valid. This is fine for v1 -- tool validation is a runtime concern -- but worth noting.

**Status:** Not a bug, acceptable v1 limitation.

---

## BUG 8 (LOW): `producesMap` in ScopeChecker uses produces name as key, but `producesFieldsMap` in TypeChecker uses node name as key

**Location:** ScopeChecker constructor (plan line ~2186-2188) vs TypeChecker constructor (plan line ~2298-2300)

ScopeChecker:
```typescript
this.producesMap.set(node.produces.name, fieldNames);  // key = produces name (e.g., "Research")
```

TypeChecker:
```typescript
this.producesFieldsMap.set(node.name, fieldNames);  // key = node name (e.g., "Researcher")
```

This is actually correct -- ScopeChecker needs to resolve `reads: [Research.findings]` where `Research` is the produces name. TypeChecker needs to resolve `edge Researcher -> Writer | select(findings)` where `Researcher` is the node name. Different lookup requirements, different keys.

**Status:** Verified correct. The naming could be clearer (ScopeChecker uses produces-name-to-fields, TypeChecker uses node-name-to-fields).

---

## BUG 9 (LOW): No test for conditional edge scope checking

**Location:** Tests (plan line ~2009-2023)

The test for "undeclared node in edge" uses a direct edge (`edge A -> GhostNode`). There is no test for conditional edge targets. The ScopeChecker code correctly handles conditional edges (the `else` branch in `checkEdges` iterates `edge.target.branches`), but this path is untested.

**Fix:** Add a test with a conditional edge referencing an undeclared node.

---

## BUG 10 (LOW): No test for `filter` transform validation in TypeChecker

**Location:** Tests (plan line ~2041-2106)

The TypeChecker tests cover `select` and `drop` on non-existent fields, but there is no test for `filter` on a non-existent field. The code handles `filter` correctly (plan line ~2323-2329), but the test coverage gap means a regression could slip through.

**Fix:** Add a test: `edge A -> B | filter(ghost_field, score >= 0.5)`.

---

## BUG 11 (LOW): TokenEstimator.estimate() assumes program.graphs[0] exists

**Location:** `estimate()` (plan line ~2387-2389)

```typescript
const graph = this.program.graphs[0]; // v1: single graph
if (!graph) {
  return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
}
```

This handles the no-graph case, but silently ignores graphs[1], graphs[2], etc. For v1 this is acceptable (single graph), but there is no warning or error when multiple graphs exist. Multiple graphs would just be silently ignored.

**Status:** Acceptable v1 limitation, but should be documented or produce a warning.

---

## Summary of Confirmed Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | CRITICAL | `new Parser(tokens, source)` -- known T4 incompatibility |
| 2 | MEDIUM | Graph input/output references never validated against declarations |
| 3 | MEDIUM | `retry_then_fallback` worst-case ignores fallback node cost |
| 4 | MEDIUM | Conditional edges dropped from edgeMap, breaking token estimation |
| 5 | LOW | Duplicate source->target edges overwrite in edgeMap |
| 9 | LOW | No test for conditional edge scope checking |
| 10 | LOW | No test for filter transform type checking |

## Items Verified as Correct

- ScopeChecker handles conditional edge targets (iterates branches in the else clause)
- TypeChecker handles all three field-bearing transforms: select, filter, drop
- ScopeChecker correctly resolves reads against both contexts and produces names
- Nodes with empty reads/tools arrays do not crash any checker
- producesMap (keyed by produces name) vs producesFieldsMap (keyed by node name) use correct keys for their respective lookup needs
- GraftError constructor signature matches: `(message, location, severity?)` with optional severity defaulting to 'error'
- Error accumulation pattern (push to array, return array) is correct for the analyzer phase

## Recommendations

1. **Fix Bug #1** -- trivial, just remove `source` param from Parser constructor call.
2. **Fix Bug #2** -- add graph input/output validation to ScopeChecker.checkGraphFlow(). This is a real semantic gap.
3. **Fix Bug #3** -- refactor estimate() to add fallback node cost for retry_then_fallback worst case.
4. **Fix Bug #4** -- store conditional edge branches in edgeMap with one entry per branch target.
5. **Add tests** for conditional edge scope checking (Bug #9) and filter transform type checking (Bug #10).
6. **Rename** `analyzer/tokens.ts` to `analyzer/estimator.ts` per common_memory note.
