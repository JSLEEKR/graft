# A3-Skeptic: v1.1 parallel + foreach + multi-field select

## Convergence Score: 4/10

The two research docs (research_arch.md and research_impl.md) agree on the broad strokes but diverge on critical details. Both disagree with each other AND with the benchmark files in ways that will produce bugs. Seven problems found, two of which are show-stoppers.

---

## Problem 1: `SecurityReviewer` duplicated in parallel_flow.gft (BUG in benchmark)

**File:** `benchmarks/correctness/parallel_flow.gft` lines 62-68

```
graph ParallelReview(input: CodeDiff, output: FinalReview, budget: 20k) {
  SecurityReviewer
  -> parallel {
    SecurityReviewer       <-- DUPLICATE
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

`SecurityReviewer` appears on line 62 as a sequential step AND on line 64 inside the parallel block. This is a bug in the benchmark file. The intent is clearly: run all three reviewers in parallel, then aggregate. The leading `SecurityReviewer` on line 62 would mean: run SecurityReviewer sequentially first, THEN run it again inside the parallel block along with the other two.

**Verdict:** Bug in benchmark. Fix: remove `SecurityReviewer` from line 62 so the flow reads `parallel { ... } -> Aggregator -> done`. Alternatively, if the intent is that the parallel block is the first step, the flow should start with `parallel { ... }` directly. The research_impl.md acknowledges this ("The first SecurityReviewer on line 63 inside the parallel block is redundant with line 62") but proposes treating line 62 as a preceding sequential node, which would mean the node runs TWICE. That doubles token cost and is almost certainly not the benchmark's intent.

**Impact:** HIGH. If we implement what the file literally says, the estimator counts SecurityReviewer twice and the orchestration plan runs it twice. The benchmark becomes a regression test for wrong behavior.

---

## Problem 2: Dot-chained foreach source `Planner.output.steps` -- parser has no support

**File:** `benchmarks/correctness/foreach_flow.gft` line 52

```
-> foreach(Planner.output.steps as step, max_iterations: 5) {
```

The current parser has `TokenType.Dot` and handles single-dot references in `parseContextRefList` (e.g., `Research.findings`). But `Planner.output.steps` is a THREE-part dotted path: `NodeName.output.FieldName`. The parser needs to:

1. Parse identifier `Planner`
2. Consume dot, parse `output` (which is a KEYWORD -- `TokenType.Output`)
3. Consume dot, parse `steps`

Problem: `output` is keyword token `TokenType.Output`. The existing `expectIdentifier()` rejects keywords -- it only accepts `TokenType.Identifier`. The parser would need `expectIdentifierOrKeyword()` for the middle segment. But both research docs describe the source as a single string `source: string` with a separate `field: string`. Neither addresses how to split a 3-part dotted path into the AST.

research_arch.md says: `{ source: string; field: string }` -- so `source = 'Planner'` and `field = 'steps'`? What happens to `.output.`? It's lost.

research_impl.md says the same: `source: string; field: string`. Neither doc accounts for the middle `.output.` segment.

**Verdict:** The AST representation needs either: (a) `source: string; qualifier: string; field: string` to capture all three parts, or (b) the `.output.` is a fixed literal that the parser expects and discards (it's always `.output.` for foreach since you iterate over a node's output). Option (b) is cleaner -- the parser expects the literal pattern `NodeName.output.FieldName` and stores only `source` and `field`.

**Impact:** HIGH. Without this, foreach cannot parse the benchmark file.

---

## Problem 3: `as step` binding variable -- scope checker is blind to it

**File:** `src/analyzer/scope.ts`

The foreach construct introduces a binding variable (`step`) that downstream body nodes presumably reference. But:

- The `ScopeChecker` has no concept of loop-scoped variables
- `NodeDecl.reads` contains `ContextRef` objects with `context` and optional `field` -- there's no way for body nodes to reference `step` through existing reads syntax
- The foreach body in the benchmark has `Implementer -> Verifier`. `Implementer` reads `[Plan.steps]` (the whole list), not `step` (the individual iteration variable)

This raises a design question: does the binding variable actually need scope checking at all in v1.1? Looking at the benchmark, body nodes read from the original produces output, not from the iteration variable. The `as step` binding may be purely for the orchestration plan's prose (so the generated markdown says "for each `step` in list").

**Verdict:** For v1.1, the binding variable is cosmetic/informational -- it goes into the AST and the orchestration output but the scope checker does NOT need to validate it beyond ensuring it's a valid identifier. No existing scope checking breaks, but the research docs should state this explicitly. If v1.2 wants body nodes to reference `step.action`, that's a future scope change.

**Impact:** MEDIUM. Wrong approach would be to add full scope validation for a feature that isn't wired up yet.

---

## Problem 4: `max_iterations: 5` -- keyword parameter, not a property

**File:** `src/lexer/tokens.ts`

The research docs propose adding `max_iterations` as a keyword (`TokenType.MaxIterations`). This is consistent with the existing `max_tokens` pattern -- `max_tokens` is already a keyword (`TokenType.MaxTokens`).

The syntax `max_iterations: 5` inside `foreach(...)` parallels `max_tokens: 1k` inside `context(...)`. The parser consumes it the same way: `expect(MaxIterations)`, `expect(Colon)`, `parseIntValue()`.

**Verdict:** Correct approach. No conflict. However, `max_iterations` uses underscore which means the lexer already handles underscored keywords (since `max_tokens`, `on_failure` exist). Confirmed: `KEYWORDS` map has `max_tokens` and `on_failure`. No lexer changes needed beyond the KEYWORDS entry.

**Impact:** LOW. This one is fine.

---

## Problem 5: Multi-field `select(vulnerabilities, risk)` vs `filter(field, condition)` -- AMBIGUITY

**File:** `src/parser/parser.ts` lines 258-269

Current `parseTransform`:
- `select(field)` -- one identifier, then `)`
- `filter(field, condition)` -- one identifier, comma, then condition (identifier + operator + value)

Proposed change: `select(field1, field2, ...)` -- one or more identifiers separated by commas.

The ambiguity question: `select(a, b)` -- is `b` a second select field or could it be confused with filter syntax? No: `filter` has its own keyword token (`TokenType.Filter`), so `select(...)` and `filter(...)` are dispatched by different keyword checks. Inside `select(...)`, after consuming `(`, every token before `)` is a field name. Inside `filter(...)`, after the first field, there's a condition with an operator.

**Verdict:** No syntactic ambiguity. The parser dispatches on the keyword token before entering the argument list. Multi-field select is safe.

However, there IS a downstream issue: the AST type `{ type: 'select'; field: string }` becomes `{ type: 'select'; fields: string[] }`. This is a breaking change that ripples through:
- `ast.ts`: Transform union member
- `parser.ts`: parseTransform
- `hooks.ts`: `transformsToJq` reads `t.field` (line 53) -- must change to `t.fields`
- `estimator.ts`: `applyTransformReductions` case `'select'` uses a flat `0.3` multiplier -- needs to scale with field count
- `tests/analyzer.test.ts`: TypeChecker tests that check `select` transforms reference `field` not `fields`
- `tests/parser.test.ts`: edge tests that assert `{ type: 'select', field: 'findings' }` must change to `{ type: 'select', fields: ['findings'] }`

research_arch.md says `0.3 * fields.length` capped at 1.0. research_impl.md says `0.3 * fields.length` capped at 0.9. They disagree on the cap. Use 1.0 (arch wins -- you can't reduce by more than the full output).

**Impact:** HIGH. Every test that touches `select` transforms will break. The change is correct but the blast radius is large and must be handled atomically.

---

## Problem 6: `flow: string[]` to `FlowNode[]` -- breaks ALL downstream consumers

**Files affected:**
- `src/parser/ast.ts` line 63: `flow: string[]`
- `src/analyzer/scope.ts` line 118: `for (const nodeName of graph.flow)`
- `src/analyzer/estimator.ts` line 51: `for (let i = 0; i < graph.flow.length; i++) { const nodeName = graph.flow[i]; }`
- `src/codegen/orchestration.ts` line 16: `for (let i = 0; i < graph.flow.length; i++) { const nodeName = graph.flow[i]; }`
- `tests/parser.test.ts` line 289: `expect(graph.flow).toEqual(['Researcher', 'Writer'])`
- `tests/analyzer.test.ts` lines 31, 68, 99: all graph flows are `string[]`

The research docs disagree on naming:
- research_arch.md: `FlowStep` union with kinds `'node'`, `'parallel'`, `'foreach'`
- research_impl.md: `FlowNode` union with kinds `'node'`, `'parallel'`, `'foreach'`

And on parallel member naming:
- research_arch.md: `nodes: string[]`
- research_impl.md: `branches: string[]`

And on foreach body type:
- research_arch.md: `body: FlowStep[]` (recursive -- body contains FlowStep objects)
- research_impl.md: `body: string[]` (flat -- body is just node name strings)

**Verdict:** Use `FlowNode` (matches existing naming conventions in the codebase -- `NodeDecl`, `EdgeTarget`). Use `branches` for parallel (clearer than `nodes` which collides with `NodeDecl`). Use `body: FlowNode[]` (recursive) to allow future nesting, even though v1.1 limits to depth 1.

Specific test breakage:
1. `parser.test.ts` "parses a basic graph" -- asserts `graph.flow` is `['Researcher', 'Writer']`. Must change to `[{ kind: 'node', name: 'Researcher' }, { kind: 'node', name: 'Writer' }]`.
2. `parser.test.ts` "parses hello.gft" -- same pattern.
3. `analyzer.test.ts` -- every `parse()` call that includes a graph will produce `FlowNode[]` instead of `string[]`, but the tests don't directly assert on flow structure beyond scope/estimator behavior, so they may pass IF scope.ts and estimator.ts are updated simultaneously.

**Impact:** CRITICAL. This is the single largest breaking change. It MUST be done atomically: ast.ts + parser.ts + scope.ts + estimator.ts + orchestration.ts + all tests in one task.

---

## Problem 7: `when(!passed)` retry loop -- NOT in scope for v1.1

The foreach_flow.gft benchmark has a simple `Implementer -> Verifier` body with no conditional retry loop. The original language spec mentions `when(!passed)` for retry semantics, but:

- Neither research doc mentions `when(!passed)` or retry loops inside foreach
- The benchmark file does not use it
- No negation operator `!` exists in the lexer (`BangEqual` is `!=`, but there's no unary `!`)

**Verdict:** Correctly out of scope. v1.1 implements only `parallel` and `foreach` with `max_iterations`. The `when(!passed)` retry loop would require: (a) unary negation in the lexer, (b) loop-conditional semantics in the AST, (c) orchestration plan changes for retry-within-foreach. This is v1.2+ work.

**Impact:** NONE for v1.1, but document the exclusion so it doesn't get accidentally half-implemented.

---

## Summary of Disagreements Between Research Docs

| Topic | research_arch.md | research_impl.md | Actual code/benchmark |
|-------|-----------------|-------------------|----------------------|
| Union name | `FlowStep` | `FlowNode` | N/A (new type) |
| Parallel member | `nodes: string[]` | `branches: string[]` | N/A (new type) |
| Foreach body type | `FlowStep[]` (recursive) | `string[]` (flat) | N/A (new type) |
| Select reduction cap | `0.3 * fields.length` capped at 1.0 | `0.3 * fields.length` capped at 0.9 | Currently flat 0.3 |
| Parallel estimation | Sum (same as sequential) | best=max, worst=sum | Currently sequential sum |
| Foreach source path | `source: string; field: string` | `source: string; field: string` | 3-part: `Planner.output.steps` |
| SecurityReviewer dup | Not mentioned | "redundant" but accepted | Runs node twice (bug) |

## Recommendations

1. **Fix parallel_flow.gft first** -- remove the duplicate `SecurityReviewer` before line 63's parallel block. The flow should be `parallel { ... } -> Aggregator -> done`.
2. **Foreach source parsing** -- parse `NodeName.output.FieldName` as a fixed 3-part pattern; store `source` (node name) and `field` (field name); discard `.output.` as syntactic sugar.
3. **Use `FlowNode`** name, `branches` for parallel, `body: FlowNode[]` for foreach (recursive).
4. **Atomic task** -- ast.ts + parser.ts + scope.ts + estimator.ts + orchestration.ts + hooks.ts + all tests must change in ONE task. Cannot be split.
5. **Multi-field select cap** -- use 1.0 (you can select all fields and get 100% of tokens back).
6. **Binding variable** -- store in AST, emit in orchestration, skip scope validation in v1.1.
7. **when(!passed)** -- explicitly out of scope, do not implement.
