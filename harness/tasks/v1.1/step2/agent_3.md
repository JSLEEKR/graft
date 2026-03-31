# A3-Skeptic: Step 2 — Peer Review of Step 1 Responses

## My Step 1 Position (recap)

I identified seven problems, two show-stoppers:
1. **SecurityReviewer duplication in parallel_flow.gft** -- benchmark bug, node runs twice
2. **3-part dotted path `Planner.output.steps`** -- parser has no support for the `.output.` middle segment; `output` is a keyword token, not an identifier
3. Binding variable `step` is cosmetic in v1.1 (no scope checking needed)
4. `max_iterations` keyword is fine (matches `max_tokens` pattern)
5. Multi-field select has no syntactic ambiguity but is a high-blast-radius breaking change
6. `flow: string[]` to `FlowNode[]` is the single largest breaking change, must be atomic
7. `when(!passed)` correctly out of scope

The two critical issues were (1) and (2). Let me evaluate whether the other agents addressed them.

---

## Agent 1 (Architect) — Evaluation

### On the 3-part path (Problem 2): ADDRESSED

A1 explicitly handles this in section 3f (`parseForeachStep`). The parser does:
```
source = expectIdentifier()       // "Planner"
expect(Dot)
outputKw = expectIdentifierOrKeyword()  // "output"
expect(Dot)
field = expectIdentifierOrKeyword()     // "steps"
```

A1 uses `expectIdentifierOrKeyword()` for the `output` segment, which avoids the keyword-vs-identifier trap. This is correct. A1 also explicitly states "The `.output.` segment is syntactic sugar (always 'output'), so we don't store it." Good -- the design intent is documented.

However, A1 does NOT call `this.expect(TokenType.Output)`. Instead they use `expectIdentifierOrKeyword()` and then manually check `if (outputKw !== 'output')`. This is subtly different from what A2 proposes (see below). Both work, but A1's approach is more resilient -- if a future version changes `output` to not be a keyword, A1's code still works. Minor preference: A1's approach is better.

### On the benchmark bug (Problem 1): ACKNOWLEDGED but not flagged as a bug

A1 section 3e says: "The benchmark file has `SecurityReviewer` both as a preceding sequential node AND as the first entry inside `parallel { ... }`. This is intentional -- the first `SecurityReviewer` on line 62 is a separate sequential step..."

A1 declares it "intentional" without evidence. This is the weakest part of A1's analysis. Running SecurityReviewer twice -- once sequentially, once in parallel -- doubles its token cost for no clear benefit. All three parallel nodes read from `CodeDiff` (the context), not from SecurityReviewer's output. The sequential SecurityReviewer before the parallel block produces `SecurityReport`, but then SecurityReviewer runs AGAIN inside the parallel block, also producing `SecurityReport`. The second run overwrites the first. This is waste, not intent.

That said, A1's parser handles it correctly in a mechanical sense -- the parser does not deduplicate, and the scope checker does not prevent duplicate names. So the implementation is not wrong, just the characterization. If the benchmark is left as-is, the compiler will faithfully produce a plan that runs the node twice. Whether that is a bug depends on whether someone fixes the benchmark file.

### Overall assessment of A1

Thorough, well-structured. Covers all files with concrete code. The recursive `FlowNode[]` with `body: FlowNode[]` is the right call. The `computeFlowCosts` recursive cost calculator cleanly separates display reports from budget calculation. The migration path (section 9) correctly identifies the atomic ordering.

One concern: A1's estimator has two separate traversals (`computeFlowCosts` for budget calculation and `estimateFlowNodes` for display reports). This is correct but adds complexity -- the two functions must stay in sync. A single traversal that returns both would be simpler but A1 may have separated them deliberately for clarity.

**Grade: Strong. Correctly handles the 3-part path. Incorrectly dismisses the benchmark duplication as intentional.**

---

## Agent 2 (Pragmatist) — Evaluation

### On the 3-part path (Problem 2): ADDRESSED, differently

A2 section `parseForeachStep` uses:
```
this.expect(TokenType.Output);  // "output" is a keyword token
```

A2 explicitly calls out: "the `output` in `Planner.output.steps` is the keyword `TokenType.Output`. The parser must expect it as a keyword token, not an identifier. This is consistent with how the lexer works." A2 then warns: "This will be a bug if missed."

This is correct and A2 deserves credit for flagging the keyword-token issue explicitly. The approach (using `expect(TokenType.Output)`) is more rigid than A1's `expectIdentifierOrKeyword()` -- it will reject `Planner.foo.steps` at parse time, which is appropriate since `.output.` is the only valid qualifier. Slightly better for v1.1 since it enforces the grammar tightly.

### On the benchmark bug (Problem 1): ACKNOWLEDGED

A2 section `parseParallelStep` says: "The first `SecurityReviewer` on line 62 is a preceding sequential step. Then `-> parallel { ... }` is the next step. The SecurityReviewer appears in both the sequential and parallel positions -- this is the benchmark's structure."

A2 describes what the benchmark says but does not call it a bug or recommend a fix. Similar to A1 -- accepts it at face value.

### On recursive vs flat FlowNode: DISAGREES (YAGNI)

A2 explicitly rejects recursive `body: FlowNode[]` in favor of `body: string[]`. The reasoning is YAGNI -- the benchmarks don't nest, so don't build for it. A2 names the type `FlowStep` instead of `FlowNode`.

I disagree with the flat body. The cost of `body: FlowNode[]` vs `body: string[]` is near-zero at implementation time (the parser returns `{ kind: 'node', name }` objects instead of bare strings), but the cost of migrating from `string[]` to `FlowNode[]` later is a full repeat of the atomic breaking change we are already doing. A1 and A4 get this right. The recursive type is free insurance.

The `FlowStep` naming is a minor style preference. Both work, but the codebase convention leans toward nouns (`NodeDecl`, `EdgeDecl`), making `FlowNode` more consistent.

### Overall assessment of A2

Clear, practical, correct on the 3-part path. The YAGNI stance on recursion is reasonable but wrong -- the incremental cost of recursion is tiny, and the migration cost of adding it later is high. A2's flat `body: string[]` would force a THIRD type change to `GraphDecl.flow` in v1.2 (from `FlowStep[]` with `body: string[]` to `FlowStep[]` with `body: FlowStep[]`), which is exactly the kind of churn YAGNI is supposed to prevent.

**Grade: Solid. Good on the 3-part path (explicitly flagged keyword issue). Wrong on body recursion. Does not flag benchmark bug.**

---

## Agent 4 (Specialist) — Evaluation

### On the 3-part path (Problem 2): ADDRESSED in depth

A4 section "output in foreach source reference" (end of document) says: "The foreach syntax `Planner.output.steps` uses a three-part dotted reference: `NodeName.output.FieldName`. The `.output.` segment is syntactic sugar indicating 'the produces output of this node.' The parser needs to handle this three-part form. The current `ContextRef` parsing only handles two parts (`Context.field`). The foreach source parsing is a distinct grammar production, not a reuse of `parseContextRefList`."

A4 correctly identifies that this is a new grammar production, not a reuse of existing infrastructure. A4 also validates that LL(1) is preserved (Q5), which is a useful structural analysis.

### On the benchmark bug (Problem 1): FLAGGED

A4 section Q4 says: "There is a problem with this benchmark: `SecurityReviewer` appears both as the sequential node before `parallel` AND inside the parallel block. This is either: (a) a benchmark error, or (b) intentional to show that `SecurityReviewer` runs twice -- once sequentially, once in parallel." A4 then says: "Interpretation 2 is bizarre -- running the same node twice with different inputs is confusing."

A4 is the only other agent besides me (A3) who explicitly calls out the duplication as problematic. However, A4 stops short of recommending a benchmark fix, saying only that the scope checker "should NOT prevent a node from appearing multiple times."

### On foreach scope (Q2): GOOD ANALYSIS

A4's Q2 analysis of the binding variable scope is the most thorough. A4 correctly concludes that `step` is a codegen-time label, not a compile-time type-checked scope. This matches my Problem 3 finding.

### On retry multiplier inside foreach (Q3): UNIQUE FINDING

A4 raises a point no other agent flagged: "The retry multiplier should apply per body node within each iteration, not to the entire body." This is correct and important for accurate estimation. A4 provides a concrete worked example (Implementer with retry(2) = multiplier 3, Verifier with no retry = multiplier 1) showing foreach worst case of 82,000 tokens vs a 40k budget. This is the kind of detail that catches real bugs in the estimator.

### Overall assessment of A4

Deep technical analysis. Best treatment of the foreach estimation math. Correctly flags the benchmark duplication as suspicious. The LL(1) proof (Q5) is useful for confidence but not strictly necessary. A4 does not provide complete parser pseudocode the way A1 does -- it is more analytical than prescriptive.

**Grade: Strong. Best estimator analysis. Flags benchmark bug (without recommending fix). Good on 3-part path and scope semantics.**

---

## Cross-Agent Consensus Check

### Issue: SecurityReviewer duplication in parallel_flow.gft

| Agent | Position |
|-------|----------|
| A1 | "Intentional" -- accepts it |
| A2 | Describes it, does not judge |
| A3 (me) | Bug in benchmark, should be fixed |
| A4 | "Bizarre" -- flags as problematic, does not recommend fix |

**My updated position:** I still believe this is a benchmark bug. However, I acknowledge that the parser and scope checker should NOT prevent duplicate node references in flow -- that would be over-constraining (valid in retry/loop scenarios). The correct action is: fix the benchmark file, AND ensure the compiler handles duplicates gracefully (no crash, no dedup). The fix is to remove line 62's `SecurityReviewer` so the flow starts with `parallel { ... }`.

I am NOT changing my position just because other agents disagree. The evidence supports "bug": all three nodes read from `CodeDiff` (the shared context), not from SecurityReviewer's output. Running SecurityReviewer sequentially before the parallel block produces output that nothing consumes before it runs again.

### Issue: 3-part dotted path

| Agent | Position |
|-------|----------|
| A1 | `expectIdentifierOrKeyword()` for middle segment |
| A2 | `expect(TokenType.Output)` for middle segment |
| A3 (me) | Flagged the problem, proposed two options (a) or (b) |
| A4 | New grammar production, not reuse of parseContextRefList |

**Consensus: all four agents address this.** A2's `expect(TokenType.Output)` is the tightest grammar. A1's `expectIdentifierOrKeyword()` is more flexible. For v1.1, A2's approach is better -- `.output.` is always literal, so enforce it.

### Issue: Recursive vs flat body

| Agent | Position |
|-------|----------|
| A1 | `body: FlowNode[]` (recursive) |
| A2 | `body: string[]` (flat, YAGNI) |
| A3 (me) | `body: FlowNode[]` (recursive) |
| A4 | `body: FlowNode[]` (recursive, depth-limited) |

**3-to-1 for recursive.** A2 is outnumbered. The cost argument is clear: recursive costs nothing extra now, flat costs a full migration later.

### Issue: Naming

| Agent | `FlowStep` vs `FlowNode` | `branches` vs `nodes` |
|-------|--------------------------|----------------------|
| A1 | `FlowNode` | `branches` |
| A2 | `FlowStep` | `branches` |
| A3 (me) | `FlowNode` | `branches` |
| A4 | `FlowNode` | (not specified) |

**Consensus: `FlowNode` with `branches`.** A2 is alone on `FlowStep`.

### Issue: Multi-field select cap

| Agent | Cap |
|-------|-----|
| A1 | `Math.min(result, original)` |
| A2 | `Math.min(result, original)` |
| A3 (me) | `Math.min(0.3 * fields.length, 1.0)` applied to result |
| A4 | `Math.min(0.3 * fields.length, 1.0)` |

All four converge on capping at 1.0 (100% of tokens). The formula `result * Math.min(0.3 * fields.length, 1.0)` is equivalent across all proposals.

---

## Summary: What Matters for Step 3

1. **Benchmark bug is real.** parallel_flow.gft should be fixed. The compiler should handle duplicates gracefully, but the test file should not encode wrong behavior. Two of four agents flagged it; two did not.

2. **3-part path is solved.** All agents handle it. A2's tight `expect(TokenType.Output)` is the cleanest approach for v1.1.

3. **Recursive body wins 3-to-1.** Use `body: FlowNode[]`.

4. **`FlowNode` with `branches` wins consensus.** Use these names.

5. **A4's retry-in-foreach estimator detail is important.** Per-node retry multipliers must be preserved inside foreach body cost calculation. No other agent flagged this explicitly.

6. **Atomic migration is universally agreed.** All four agents independently conclude that ast.ts + parser.ts + scope.ts + estimator.ts + orchestration.ts + tests must change in one task.

## Convergence Score: 7/10

High agreement on structure and approach. Remaining divergences are the benchmark bug interpretation (which I maintain is a bug) and the flat-vs-recursive body type (which is resolved by majority). No blocking disagreements remain for implementation.
