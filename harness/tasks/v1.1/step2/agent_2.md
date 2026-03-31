# A2-Pragmatist: v1.1 Step 2 -- Revised Position

## Updated Convergence Score: 8.5/10

Strong convergence across all four agents on the core shape: discriminated union, 4 keywords, recursive parser, multi-field select. The remaining divergences are small and resolvable. A3's benchmark bug finding and 3-part path analysis are valuable. I revise two positions based on new evidence.

---

## Position Changes from Step 1

### REVISED: `body: FlowNode[]` (recursive) -- was `body: string[]` (flat)

I concede this to A1 and A3. My Step 1 YAGNI argument was wrong in kind, not in spirit. The cost difference between `body: string[]` and `body: FlowNode[]` is near zero:

1. **Parser change:** Replace `while (Arrow) { body.push(expectIdentifier()) }` with `body = parseFlowSteps(insideBlock: true)`. The recursive call already exists for top-level flow parsing. Reusing it for the body is *less* code than a separate flat loop.
2. **Scope checker change:** `walkFlowNodes` is already recursive for top-level flow. With `body: string[]`, we'd need a second code path (`for (const name of step.body) { validateNodeName(...) }`). With `body: FlowNode[]`, the existing recursive walk handles it with zero extra code.
3. **Estimator change:** Same pattern -- recursive `computeFlowCosts` handles `body: FlowNode[]` naturally. A flat body needs a separate loop.

The flat version actually requires *more* special-casing than the recursive version. A1's point about avoiding a v1.2 breaking change is valid but secondary -- the primary reason is that `body: FlowNode[]` produces simpler code today. YAGNI cuts both ways: don't add complexity to avoid future complexity, but also don't add complexity to avoid a type that's simpler to consume.

**Enforcement:** A4's suggestion to validate max nesting depth = 1 in the scope checker is the right approach. The type allows recursion; the checker constrains it. This is the standard pattern (the type system is permissive, the analyzer enforces rules).

### REVISED: Type name `FlowNode` -- was `FlowStep`

A3 and A4 are right that the codebase convention uses nouns: `NodeDecl`, `EdgeDecl`, `EdgeTarget`, `ContextRef`. `FlowNode` fits this convention. `FlowStep` implies imperative semantics. Additionally, `EdgeTarget` already uses `kind` as its discriminant -- `FlowNode` with `kind` follows the exact same pattern. Changed.

### HELD: `branches: string[]` for parallel

All four agents agree. `branches` wins over `nodes` -- no further discussion needed.

### HELD: Parallel estimation = sum (not max)

All four agents agree. Token budget is about total consumption, not wall-clock. Sum is correct for both best-case and worst-case.

### HELD: Binding variable is cosmetic in v1.1

A3 and A4 both independently concluded that `as step` is for orchestration prose, not compile-time scope. A1 stores it in the AST but doesn't scope-check it. I agree. No agent dissents.

---

## A3's Benchmark Bug -- My Assessment

A3 flagged `SecurityReviewer` appearing both as a sequential step (line 62) AND inside the parallel block (line 64) in `parallel_flow.gft`. A3 calls it a bug. A1 calls it intentional.

**I side with A3: this is a benchmark bug.** Here's why:

1. The file's own comment says "Three reviewers run in parallel, then aggregate." Not "SecurityReviewer runs first, then all three run in parallel."
2. Running the same node twice doubles its token cost with no stated purpose. The benchmark file is a correctness test -- accidental double-execution would make it test the wrong thing.
3. The graph flow would make more sense as `parallel { SecurityReviewer PerformanceReviewer StyleReviewer } -> Aggregator -> done`.

**However, the parser should NOT prevent this.** A node appearing multiple times in a flow is valid in general (consider a retry loop, or a node that genuinely runs at two different stages). The benchmark should be fixed separately; the parser and scope checker should accept it.

**Action item:** Fix `parallel_flow.gft` to remove the leading `SecurityReviewer` before the parallel block. The flow becomes:

```
graph ParallelReview(input: CodeDiff, output: FinalReview, budget: 20k) {
  parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

This matches the file's documented intent and eliminates the double-count in estimation.

---

## A3's 3-Part Path -- Confirmed Correct

A3 identified that `Planner.output.steps` is a 3-part dotted path where `.output.` is a keyword token (`TokenType.Output`). Both research docs store `source: string` and `field: string` but neither explicitly handles the middle `.output.` segment in the parser.

A1's Step 1 code handles this correctly in `parseForeachStep`:

```ts
const source = this.expectIdentifier();       // "Planner"
this.expect(TokenType.Dot);
const outputKw = this.expectIdentifierOrKeyword(); // "output"
if (outputKw !== 'output') { throw ... }
this.expect(TokenType.Dot);
const field = this.expectIdentifierOrKeyword();    // "steps"
```

My Step 1 code had it slightly different:

```ts
this.expect(TokenType.Output);  // expects keyword token directly
```

**A1's approach is more robust.** Using `expectIdentifierOrKeyword()` and checking the string value handles the case where `output` might be tokenized differently in future lexer changes. But `this.expect(TokenType.Output)` is simpler and correct given the current lexer (which does tokenize `output` as `TokenType.Output`).

**My revised call:** Use `this.expect(TokenType.Output)` directly. It's the simplest code that works. The lexer already has `output` in the KEYWORDS map -- it will always produce `TokenType.Output`. Checking the string value of a keyword you already know the token type of is unnecessary indirection.

The AST representation is correct as both research docs propose: `source: string` (node name) + `field: string` (field name). The `.output.` segment is syntactic sugar -- always literal, always discarded. No need to store it.

---

## Remaining Disagreements and Resolutions

### Select reduction cap: 1.0 vs 0.9 vs Math.min

A1 proposes `Math.min(result, tokens)` where `tokens` is the original input. A3 proposes `Math.min(0.3 * fields.length, 1.0)` as the multiplier. Both are correct -- they express the same constraint differently.

**My call:** `result = Math.floor(result * Math.min(0.3 * fields.length, 1.0))`. This is clearest: the multiplier is `0.3 per field, capped at 1.0`. No need for a separate `Math.min(result, tokens)` guard because the multiplier never exceeds 1.0.

### Foreach body termination

A1's `parseFlowSteps(insideBlock: true)` stops when there are no more arrows (the next token should be `RBrace`). Inside a foreach body, `done` is an error. This is correct -- `done` terminates the graph, not a sub-flow.

A1 also throws if `done` appears inside a block. Good. No agent disagrees.

### Parallel minimum branches

A1 enforces `branches.length >= 2`. This is correct -- a parallel block with one branch is just a sequential node with extra syntax. No agent disagrees.

### Comma tolerance in parallel blocks

My Step 1 proposed accepting optional commas between parallel branch names. A1 also includes this. The benchmark uses whitespace-separated names (no commas), but tolerating commas prevents user confusion at zero cost. Held.

---

## Final Consolidated AST

```ts
export type FlowNode =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: FlowNode[] };

export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  flow: FlowNode[];  // was: string[]
  location: SourceLocation;
}

export type Transform =
  | { type: 'select'; fields: string[] }  // was: field: string
  | { type: 'filter'; field: string; condition: Condition }
  | { type: 'drop'; field: string }
  | { type: 'compact' }
  | { type: 'truncate'; tokens: number };
```

**All four agents agree on this shape.** The only difference from Step 1 is `body: FlowNode[]` instead of `body: string[]`, and `FlowNode` instead of `FlowStep`.

---

## Implementation Order (unchanged from Step 1)

1. `src/lexer/tokens.ts` -- 4 enum values + 4 KEYWORDS entries (additive, safe)
2. `src/parser/ast.ts` -- `FlowNode` type, `GraphDecl.flow` type change, `select.fields`
3. `src/parser/parser.ts` -- `parseFlowSteps`, `parseFlowStep`, `parseParallelStep`, `parseForeachStep`, update `parseGraph`, update `parseTransform`
4. Update existing tests to use `FlowNode[]` and `fields: string[]`
5. `src/analyzer/scope.ts` -- recursive `walkFlowNodes`, nesting depth validation
6. `src/analyzer/estimator.ts` -- recursive `computeFlowCosts`, multi-field select scaling
7. `src/codegen/orchestration.ts` -- `FlowNode`-aware step generation
8. `src/codegen/hooks.ts` -- multi-field jq select
9. New tests for parallel/foreach/multi-field
10. Fix `parallel_flow.gft` benchmark

Atomic task -- cannot be split.

---

## Scope Checker Addition: Nesting Depth Validation

Per A4's recommendation, add to `walkFlowNodes`:

```ts
private walkFlowNodes(nodes: FlowNode[], location: SourceLocation, errors: GraftError[], depth: number = 0): void {
  for (const step of nodes) {
    // ... existing validation ...
    if (step.kind === 'foreach') {
      if (depth >= 1) {
        errors.push(new GraftError(
          'Nested foreach/parallel inside foreach is not supported in v1.1',
          location,
        ));
      }
      this.walkFlowNodes(step.body, location, errors, depth + 1);
    }
  }
}
```

This enforces "type allows recursion, checker constrains it" cleanly.

---

## What We Are NOT Doing (YAGNI -- unchanged)

- No parallel-inside-foreach (v1.2 -- type supports it, checker blocks it)
- No foreach-inside-foreach (v1.2 -- same)
- No dynamic iteration count
- No `break`/`continue` in foreach
- No `when(!passed)` retry loops
- No conditional routing inside parallel branches
- No named parallel groups or join strategies
- No scope validation of the `binding` variable beyond identifier check
