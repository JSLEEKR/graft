# A1-Architect: v1.1 Step 2 — Forced Dissent

## Convergence Score: 8.5/10

All four agents agree on: discriminated union for flow, 4 keywords, `branches` for parallel, multi-field select as `fields: string[]`, parallel estimation = sum, foreach best=1x worst=Nx, `.output.` is syntactic sugar discarded by parser, `when(!passed)` out of scope, atomic change across all files.

Disagreements are narrow but structurally important: recursive vs flat body type, naming (`FlowNode` vs `FlowStep`), and how to handle the SecurityReviewer benchmark anomaly. This document dissents on the recursive body type and proposes resolution for the three real bugs found across agents.

---

## Self-Rebuttal: Recursive `body: FlowNode[]` Is Wrong for v1.1

**My Step 1 position:** `body: FlowNode[]` (recursive) because it "costs nothing extra today" and "avoids a v1.2 breaking change."

**Why I was wrong:**

1. **It does cost something.** A recursive body type forces the scope checker, estimator, and codegen to all implement recursive walks from day one. A2 correctly points out that neither benchmark nests anything: `parallel_flow.gft` has flat branch names, `foreach_flow.gft` has `Implementer -> Verifier` as a flat sequential chain. Recursive walking code is dead code in v1.1 -- it cannot be tested against any benchmark, which means it ships unverified.

2. **"Avoids a v1.2 breaking change" is speculative YAGNI.** The v1.2 change from `body: string[]` to `body: FlowNode[]` is a one-line type change in `ast.ts` plus mechanical updates to the three consumers (scope, estimator, codegen). That is a 30-minute migration, not a breaking change worth designing around today. Meanwhile, shipping recursive code we cannot test is a real risk today.

3. **A4 says no compile-time scope for the foreach binding.** If the binding variable is cosmetic in v1.1 (goes into orchestration prose, not into scope checking), then the body nodes are just names -- they do not reference the binding. This further argues that `body: string[]` is the honest representation of what v1.1 actually supports.

4. **Depth validation becomes unnecessary.** My Step 1 plan included "v1.1 limits depth to 1 via parser validation" -- but if the type is flat, there is no depth to validate. The parser simply reads identifiers separated by arrows inside the foreach body. Simpler parser, fewer error paths, fewer tests needed.

**Revised position:** `body: string[]` (flat). A2 wins on this point.

---

## Dissent 1: The SecurityReviewer Duplication Is NOT a Benchmark Bug

A3 calls this a bug (Problem 1, rated HIGH). I dissent.

**The benchmark file says:**
```
graph ParallelReview(...) {
  SecurityReviewer
  -> parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

**A3's argument:** "Running the same node twice is bizarre" and "almost certainly a benchmark error."

**My counter-argument:** The benchmark is intentional and tests an important edge case. Consider:

1. **The flow is syntactically valid.** `SecurityReviewer` is a declared node. Appearing in multiple flow positions is legal -- the scope checker validates that each name is a declared node, not that names are unique across the flow. A1-Step1 already stated: "The scope checker validates that all branch names are declared nodes; it does NOT deduplicate."

2. **The benchmark tests parser robustness.** If we "fix" the benchmark by removing the leading `SecurityReviewer`, we lose a test case for: a node appearing both as a sequential step and inside a parallel block. This is a valid user pattern (initial setup pass, then parallel deep analysis).

3. **Estimation is correct with the duplicate.** SecurityReviewer costs are counted twice -- once for the sequential step, once for the parallel branch. Total token cost reflects reality: the node runs twice, so tokens are consumed twice. The estimator is doing its job.

4. **If the benchmark is wrong, that is a separate fix.** The compiler's job is to faithfully compile what the user wrote. The scope checker should warn about duplicates if we want (future enhancement), but it should not reject valid syntax.

**Resolution:** Keep the benchmark as-is. The parser handles it correctly. The estimator counts it twice. Add a comment in the test noting this is intentional: "SecurityReviewer appears both sequentially and in parallel -- tests duplicate node handling."

**However:** If the team decides this IS a bug, the fix is trivial (remove line 62). The compiler implementation is identical either way -- the parser does not care about duplicates.

---

## Dissent 2: `output` Keyword in Foreach Source Path Is Simpler Than A2 Claims

A2 flags this as a risk: "`output` token is `TokenType.Output`, not an identifier. Parser must `this.expect(TokenType.Output)` there." A3 calls it Problem 2 (HIGH).

**This is correct but not risky.** Here is why:

The parser for `foreach(Planner.output.steps ...)` needs exactly this sequence:
```ts
const source = this.expectIdentifier();          // "Planner" -> TokenType.Identifier
this.expect(TokenType.Dot);                       // "."
this.expect(TokenType.Output);                    // "output" -> TokenType.Output (keyword)
this.expect(TokenType.Dot);                       // "."
const field = this.expectIdentifierOrKeyword();   // "steps" -> could be identifier or keyword
```

A2 is right that `this.expect(TokenType.Output)` is needed (not `expectIdentifier()`). But this is not a subtle bug -- it is the obvious implementation. The lexer emits `TokenType.Output` for the literal `output`. The parser expects that exact token. This is LL(1): after consuming the first dot, the next token is checked against `TokenType.Output`. If it is anything else, the parser throws a clear error: "Expected 'output' in foreach source."

The only real question is whether `field` (the third segment) could collide with a keyword. Example: `foreach(Planner.output.input as item, ...)` -- here `input` is `TokenType.Input`. The `expectIdentifierOrKeyword()` helper (which already exists per T4 ratchet) handles this: it accepts any keyword token's lexeme as a string. No special handling needed.

**Resolution:** Use `this.expect(TokenType.Output)` for the middle segment. Use `this.expectIdentifierOrKeyword()` for the field segment. Both already exist. No new parser infrastructure needed.

---

## Dissent 3: Naming Should Be `FlowNode`, Not `FlowStep`

A2 prefers `FlowStep` ("describes role not identity"). A3 and A4 prefer `FlowNode`. I side with `FlowNode`.

**Rationale:**
- Existing AST types are nouns: `NodeDecl`, `EdgeDecl`, `GraphDecl`, `EdgeTarget`, `ContextRef`. The pattern is `[Thing]` not `[Action]`.
- `FlowStep` implies sequential execution, which is misleading when the union includes `parallel` (not a step, it is a fan-out).
- `FlowNode` matches the discriminated union pattern: each variant is a node in the flow graph. The `kind` discriminant describes the node's execution semantics.
- A4 notes that a spec-era `FlowStep` placeholder was never implemented, so there is no migration conflict.

**Resolution:** `FlowNode` with kinds `'node'`, `'parallel'`, `'foreach'`.

---

## Revised Architecture (Incorporating All Agent Feedback)

### AST Type (`src/parser/ast.ts`)

```ts
export type FlowNode =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: string[] };  // CHANGED: body is flat

export interface GraphDecl {
  // ... existing fields ...
  flow: FlowNode[];  // was: string[]
}

// Transform select variant:
| { type: 'select'; fields: string[] }  // was: field: string
```

### Keywords (`src/lexer/tokens.ts`)

Four additions to `TokenType` enum and `KEYWORDS` map:
- `Parallel`, `Foreach`, `As`, `MaxIterations`
- Underscore in `max_iterations` is consistent with existing `max_tokens`, `on_failure`.
- No `lexer.ts` changes needed (KEYWORDS map auto-resolves).

### Parser (`src/parser/parser.ts`)

**parseGraph:** Replace flat string loop (lines 373-388) with `FlowNode`-aware parsing. Single loop: after each `->`, dispatch on token type (`Parallel` / `Foreach` / `Done` / `Identifier`). LL(1) preserved per A4's proof.

**parseParallelStep:** Consume `parallel {`, read identifiers until `}`. Accept optional commas between names for user convenience. Minimum 2 branches enforced.

**parseForeachStep:** Consume `foreach(`, parse 3-part dotted path (`Identifier.Output.IdentifierOrKeyword`), `as` binding, `,`, `max_iterations: Int`, `)`, then `{ body }`. Body is flat: read identifiers separated by `->` until `}`. No `done` inside body (error if found).

**parseTransform (select):** Comma-separated field list: `select(field1, field2, ...)`. Existing single-field selects become `fields: ['fieldName']`.

### Scope Checker (`src/analyzer/scope.ts`)

Walk `FlowNode[]` with a switch on `kind`:
- `node`: validate name is a declared node (existing check, restructured).
- `parallel`: validate each branch name is a declared node.
- `foreach`: validate source node exists, validate field exists in source node's produces, validate body node names. Binding variable is NOT added to scope -- it is cosmetic in v1.1 (A4's finding, A3 agrees).

No recursion needed since `body` is `string[]` -- just iterate the names.

### Estimator (`src/analyzer/estimator.ts`)

Walk `FlowNode[]` with a switch:
- `node`: existing per-node cost calculation (extract into helper).
- `parallel`: sum all branch costs (tokens consumed regardless of wall-clock parallelism). All four agents agree: best-case = sum, worst-case = sum with retry multipliers.
- `foreach`: body cost * 1 (best), body cost * maxIterations (worst). Body cost includes per-node retry multipliers (A4's critical detail).
- Multi-field select: `result * Math.min(0.3 * fields.length, 1.0)`. Cap at 1.0 (cannot select more than 100%).

### Codegen (`src/codegen/orchestration.ts`)

Walk `FlowNode[]` with a switch:
- `node`: existing sequential step formatting.
- `parallel`: emit `[parallel]` header, list all branches with token estimates, completion = all N signals.
- `foreach`: emit iteration header with source/field/max, sub-steps labeled with letter suffixes (a, b, c...).

### Hooks (`src/codegen/hooks.ts`)

Update jq select generation: `t.field` becomes `t.fields`. Multi-field jq: `.field1, .field2` wrapped in `{field1, field2}` to produce a JSON object subset.

---

## Files Modified (Dependency Order)

| # | File | Changes | Breaking |
|---|------|---------|----------|
| 1 | `src/lexer/tokens.ts` | +4 enum, +4 KEYWORDS | No |
| 2 | `src/parser/ast.ts` | +`FlowNode`, `flow: FlowNode[]`, `select.fields` | **Yes** |
| 3 | `src/parser/parser.ts` | +parseParallelStep, +parseForeachStep, rewrite parseGraph body, update parseTransform | **Yes** |
| 4 | `src/analyzer/scope.ts` | FlowNode walk, +validateForeachSource | No (internal) |
| 5 | `src/analyzer/estimator.ts` | FlowNode walk, +foreach/parallel cost, multi-field select | No (internal) |
| 6 | `src/codegen/orchestration.ts` | FlowNode-aware step generation | No (internal) |
| 7 | `src/codegen/hooks.ts` | `t.field` -> `t.fields`, multi-field jq | No (internal) |
| 8 | Tests (6+ files) | Update existing + add ~20 new | N/A |

**Atomic constraint:** Files 2-7 must change together. File 1 can land independently but gains nothing from doing so.

---

## Resolved Disagreements

| Topic | Resolution | Winner |
|-------|-----------|--------|
| `FlowNode` vs `FlowStep` | `FlowNode` | A3, A4 |
| `body: FlowNode[]` vs `body: string[]` | `body: string[]` (flat) | A2 |
| `branches` vs `nodes` | `branches` | A1, A2, A3 (unanimous except A3 who uses both) |
| SecurityReviewer duplicate | Keep benchmark as-is, not a bug | A1 (dissent from A3) |
| `output` keyword parsing | `this.expect(TokenType.Output)` -- straightforward | A2 (correctly identified), not high-risk |
| Select reduction cap | `Math.min(0.3 * fields.length, 1.0)` | A3, A4 (cap at 1.0) |
| Parallel estimation | Sum for both best and worst case | All agents agree |
| Foreach binding scope | Cosmetic in v1.1, no scope checking | A3, A4 |
| `when(!passed)` | Out of scope for v1.1 | All agents agree |
| Foreach body `done` | Error if `done` appears inside body | A1 (unchallenged) |

---

## Open Question for Convergence

**The SecurityReviewer benchmark:** I argue it is intentional and tests duplicate handling. A3 argues it is a bug. This affects no compiler code (the implementation is the same either way), but it affects whether we add a test comment explaining the duplicate or submit a benchmark fix. The convergence agent should decide: keep or fix?

---

## Test Strategy

~20 new tests, ~10-15 existing test updates (for `flow: string[]` -> `FlowNode[]` and `select.field` -> `select.fields`).

**New tests:**
- Lexer: 4 keyword tokenization tests
- Parser: parallel block (happy path), foreach block (happy path), multi-field select, single-field select backwards compat, parallel < 2 branches error, foreach missing max_iterations error, done-inside-foreach error, foreach max_iterations < 1 error
- Scope: undeclared node in parallel, undeclared foreach source, missing field in foreach source produces, foreach body with undeclared node
- Estimator: parallel cost = sum, foreach best=1x worst=Nx, multi-field select scaling
- Codegen: parallel orchestration output, foreach orchestration output
- Integration: compile `parallel_flow.gft` end-to-end, compile `foreach_flow.gft` end-to-end

**Updated tests:** Every test asserting `graph.flow` as `string[]` or `transform.field` as a string must update to `FlowNode[]` / `transform.fields: string[]`.

All 110 existing tests must continue passing after the migration.
