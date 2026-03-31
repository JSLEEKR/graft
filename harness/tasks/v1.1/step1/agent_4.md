# A4-Specialist Analysis: parallel + foreach + multi-field select (v1.1)

## Convergence Score: 7/10

The two research docs (research_arch.md, research_impl.md) agree on the broad strokes but diverge on meaningful details: naming (`FlowStep` vs `FlowNode`, `nodes` vs `branches`, `body: string[]` vs `body: FlowStep[]`), parallel estimation semantics, and multi-field select reduction formula. These divergences require authoritative resolution before implementation. Analysis below.

---

## Q1: FlowNode as a discriminated union — right pattern?

**Yes, discriminated union is correct. A separate CFG is not needed.**

Rationale:
- Graft flow is *declared structure*, not computed control flow. The programmer writes `parallel { A B C }` explicitly -- there is no need for the compiler to *discover* the control flow graph via basic block analysis.
- A CFG representation adds indirection (separate node/edge tables, entry/exit blocks) that would complicate the estimator and codegen with no benefit. The estimator needs to walk the flow and sum/multiply costs; the codegen needs to emit step labels. Both are trivially recursive over a discriminated union.
- The union is recursive (`body: FlowStep[]` in foreach), which handles nesting naturally. A CFG would require loop-header / back-edge annotations to represent the same thing.
- TypeScript's type narrowing on `kind` discriminants makes the union ergonomic for all consumers (estimator, scope checker, codegen).

**Divergence flag:** research_arch.md names it `FlowStep` with `body: FlowStep[]` (recursive). research_impl.md names it `FlowNode` with `body: string[]` (flat). The recursive form is correct -- it's needed for future `foreach` containing `parallel` and for the v1.1 nesting-depth-1 constraint to be enforced at the checker level rather than baked into the type. However, for v1.1, `body: FlowNode[]` where `FlowNode` only contains `kind: 'node'` entries is sufficient. **Recommendation: Use `FlowNode` (matches the existing codebase convention where AST types are nouns, not `Step`), with `body: FlowNode[]` recursive type, but validate max depth = 1 in scope checker.**

Current AST in `ast.ts` line 63: `flow: string[]`. The migration to `flow: FlowNode[]` is a breaking change that touches estimator, scope, codegen, and all tests. The research correctly identifies this as an atomic change.

---

## Q2: Does foreach introduce a new scope?

**Yes. The `step` binding variable introduces a lexical scope, but it is a *codegen-time* scope, not a *compile-time type-checked* scope.**

Analysis:
- The binding in `foreach(Planner.output.steps as step, max_iterations: 5)` creates a name `step` that body nodes can reference. However, looking at the benchmark `foreach_flow.gft`, the body nodes (`Implementer`, `Verifier`) do NOT reference `step` directly in their `reads` -- they still `reads: [Plan.steps]`. The binding name is for the *orchestration plan* (codegen), telling the runtime "iterate over this list, bind each element to `step`".
- At the compiler level (scope checker), the binding name should be recorded but does not affect `reads` validation in v1.1. The scope checker validates that `Planner.output.steps` is a valid dotted reference (node produces name + field), not the binding variable.
- At the codegen level, the binding name appears in the orchestration markdown: "For each `step` in Planner.output.steps".
- **No new type-checking scope is created in v1.1.** The binding is purely a label for the orchestration output. If v1.2 adds `reads: [step]` syntax in body nodes, THEN a proper scope with type inference would be needed.

**Recommendation:** Store `binding: string` in the AST node. Validate it is a valid snake_case identifier. Do not add it to the scope checker's symbol table in v1.1. Document it as a future extension point.

---

## Q3: Token estimator — foreach handling

**Best case = 1 iteration of body cost. Worst case = max_iterations * body cost * retry multiplier.**

Both research docs agree on this. The formula:

```
bestCase += bodyBestCase * 1
worstCase += bodyWorstCase * maxIterations
```

Where `bodyBestCase` and `bodyWorstCase` are computed by recursively walking the foreach body's `FlowNode[]` with the same estimation logic.

**Critical detail the research docs miss:** The body may contain nodes with `on_failure: retry(N)`. The retry multiplier should apply *per body node within each iteration*, not to the entire body. The current estimator already handles this per-node (line 94 in estimator.ts: `worstCase += nodeTokens * retryMultiplier`). When we refactor to walk `FlowNode[]` recursively, this per-node multiplier must be preserved.

Concrete example from `foreach_flow.gft`:
- Implementer: budgetIn ~2000 (Plan.steps partial read), budgetOut 3000 = 5000 tokens. retry(2) = multiplier 3.
- Verifier: budgetIn ~900 (files_changed partial), budgetOut 500 = 1400 tokens. No retry = multiplier 1.
- Body best case: 5000 + 1400 = 6400
- Body worst case: 5000*3 + 1400*1 = 16400
- Foreach best case: 6400 * 1 = 6400
- Foreach worst case: 16400 * 5 = 82000

This means the IterativeImpl graph (budget 40k) would trigger a worst-case budget warning at 82000 > 40000 -- which is correct behavior and useful feedback.

---

## Q4: Parallel semantics — what input do branches receive?

**Each branch receives the output of the node BEFORE the parallel block, not "the same input."**

Looking at `parallel_flow.gft`:
```
SecurityReviewer
-> parallel {
  SecurityReviewer
  PerformanceReviewer
  StyleReviewer
}
-> Aggregator -> done
```

There is a problem with this benchmark: `SecurityReviewer` appears both as the sequential node before `parallel` AND inside the parallel block. This is either: (a) a benchmark error, or (b) intentional to show that `SecurityReviewer` runs twice -- once sequentially, once in parallel.

**Looking at the node declarations:** All three parallel nodes `reads: [CodeDiff]` -- they read the *context*, not the output of the previous node. So in this particular example, each parallel branch gets its input from the shared context, not from the preceding sequential node.

**The general semantic rule should be:** Parallel branches each independently resolve their `reads` references against the current scope (contexts + upstream produces outputs). Branches are NOT passed the "output of the previous node" as an implicit input -- that would conflict with the explicit `reads` declarations. The "previous node" relationship only matters for edge transform application.

**Edge transform implication for parallel:** Edges declared as `SecurityReviewer -> Aggregator` apply when the parallel block's outputs feed into the next sequential node. The edges are per-source-node, not per-parallel-block. This is already natural because edges are declared between specific named nodes.

**Recommendation:** The estimator should sum all parallel branch costs (since all branches execute). For best-case/worst-case, parallel does not change the calculation vs sequential -- all branches run regardless. The only difference is wall-clock time (parallel = max latency, not sum latency), which is outside the token estimator's scope.

---

## Q5: Does the grammar remain LL(1) with parallel/foreach?

**Yes, LL(1) is preserved. No additional lookahead needed.**

Proof: After consuming `->` in the graph flow, the parser checks the *current* token:
- `TokenType.Identifier` -> sequential node step
- `TokenType.Parallel` -> parallel block
- `TokenType.Foreach` -> foreach block
- `TokenType.Done` -> flow termination

These four cases are distinguished by a single token of lookahead (the token after `->` or at flow-start). `parallel` and `foreach` are reserved keywords, so they cannot collide with PascalCase node identifiers.

**Inside parallel block:** After `{`, the parser reads whitespace-separated or comma-separated identifiers until `}`. No ambiguity -- identifiers are PascalCase node names, `}` terminates.

**Inside foreach arguments:** `(` followed by a dotted reference, `as` keyword, binding name, `,`, `max_iterations`, `:`, integer, `)`. Every position is unambiguous:
- Dotted reference: `Identifier.output.Identifier` -- three identifiers separated by dots
- `as` is a new keyword, distinguished from identifiers
- `max_iterations` is a new keyword

**Inside foreach body:** `{` followed by a sub-flow (`Identifier -> Identifier -> ... }`). Recursive call to flow parsing with `}` as terminator instead of `done`. Ambiguity question: could a `}` be confused with a nested struct? No -- in flow position, the parser is in "flow mode" where it expects node names, `parallel`, `foreach`, or `done`, never type expressions.

**One nuance:** The parser currently uses `LL(1)+LL(2)` (common_memory.md, T4 ratchet). The `LL(2)` usage is for inline struct detection (`Identifier {` in type position). Flow parsing does not encounter this ambiguity because flow context only expects flow constructs, not type expressions.

---

## Q6: `when(!passed)` retry inside foreach — v1.1 scope or defer?

**Defer to v1.2.**

Rationale:
- The benchmark files do NOT include `when(!passed)` retry syntax. This is an inferred feature from the spec's `when` keyword, but the spec only defines `when` for conditional edge routing (`when risk_score > 0.7 -> DetailedReviewer`), not for loop control flow.
- Implementing retry-on-condition inside foreach requires:
  1. A new AST node for conditional re-iteration
  2. Negation operator (`!`) in conditions -- not in the current condition grammar
  3. The estimator would need to model "retry probability" which is speculative
  4. The codegen would need to emit conditional loop-continuation instructions
- This is a significant scope expansion beyond what the benchmarks test.
- The `on_failure: retry(N)` strategy on individual nodes already provides retry semantics at the node level. Foreach loop-level retry is a separate concern.

**Recommendation:** v1.1 foreach supports a fixed `max_iterations` count. Early termination happens when the list is exhausted (runtime behavior, not compiler concern). Conditional re-iteration (`when(!passed)`) is tracked as a v1.2 feature.

---

## Additional Findings

### Multi-field select divergence

The two research docs disagree on the reduction formula:
- research_arch.md: `result * 0.3 * fields.length` (capped at 1.0)
- research_impl.md: `0.3 * fields.length` capped at `0.9`

**Neither is quite right.** Current estimator (line 123): `select` applies `result * 0.3` (keep ~one field). With multi-field:
- 1 field: keep 30% -- current behavior, correct
- 2 fields: keep 60% -- `result * 0.3 * 2 = result * 0.6`
- 3 fields: keep 90% -- `result * 0.3 * 3 = result * 0.9`
- 4+ fields: cap at 100% (selecting almost everything)

**Recommendation:** `result * Math.min(0.3 * fields.length, 1.0)`. Cap at 1.0, not 0.9 -- if you select all fields, you keep all tokens.

### The `SecurityReviewer` duplication in parallel_flow.gft

Line 62-63 of `parallel_flow.gft`:
```
  SecurityReviewer
  -> parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
```

`SecurityReviewer` appears as both the first sequential step AND inside the parallel block. research_impl.md notes this but doesn't resolve it. Two interpretations:
1. **Benchmark error:** SecurityReviewer should not appear before `parallel`. The flow should start with `parallel { ... }`.
2. **Intentional:** SecurityReviewer runs first sequentially (producing output), then runs again in parallel with others (using that output).

Interpretation 2 is bizarre -- running the same node twice with different inputs is confusing. **This is almost certainly a benchmark error.** The scope checker should NOT prevent a node from appearing multiple times in a flow (valid for retry/loop scenarios), but the benchmark should be fixed to remove the leading `SecurityReviewer`.

### Naming: `FlowNode` vs `FlowStep`

The current AST uses interface names that are nouns (`NodeDecl`, `EdgeDecl`, `GraphDecl`). `FlowNode` follows this convention. `FlowStep` implies imperative execution. **Use `FlowNode`** for consistency.

However, note the existing `FlowStep` type in the spec (Section 4.2, line 366-368):
```ts
type FlowStep = {
  node: string
} // v1: sequential only
```
This was the v1 placeholder. The v1 code in `ast.ts` line 63 uses `flow: string[]` instead, so `FlowStep` was never actually implemented. No migration conflict.

### `output` in foreach source reference

The foreach syntax `Planner.output.steps` uses a three-part dotted reference: `NodeName.output.FieldName`. The `.output.` segment is syntactic sugar indicating "the produces output of this node." The parser needs to handle this three-part form. The current `ContextRef` parsing only handles two parts (`Context.field`). The foreach source parsing is a distinct grammar production, not a reuse of `parseContextRefList`.
