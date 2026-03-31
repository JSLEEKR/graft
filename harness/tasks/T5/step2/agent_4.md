# A4-Specialist Cross-Critique (Forced Dissenter)

## Why I Am the Forced Dissenter

I gave a convergence score of 4/5 (8/10) in Step 1, tied for highest with A1 and A2. I declared the plan "solid and implementable as-is" and identified only two real bugs plus one spec gap. A3, scoring 6/10, found two additional medium-severity bugs (retry_then_fallback worst-case undercount, conditional edge estimation failure) that I explicitly did not catch. I must now account for that blind spot and revise.

---

## Critique of A1-Architect (Step 1 Score: 4/5)

**Strengths:** Thorough structural analysis. The three-class decomposition justification is the best articulated of all agents. The observation that ScopeChecker and TypeChecker share no mutable state and have no ordering dependencies is architecturally precise. The `producesMap` vs `producesFieldsMap` key distinction (Section 7b) is a subtle point that A1 correctly resolved and clearly explained.

**Weakness 1: Dismissed the retry_then_fallback estimation bug.** A1 wrote: "Retry multiplier logic is correct: `1 + max` for retry and retry_then_fallback. Skip/abort/fallback correctly return 1. The fallback node's own cost would be counted separately if it appears in the graph flow." This last sentence is wrong. The fallback node does NOT necessarily appear in the graph flow -- it is referenced only from the `onFailure` strategy. If the fallback node is not in `graph.flow`, its cost is never counted in the estimation loop. A3's Bug #3 is correct: the worst case for retry_then_fallback must include the fallback node's cost as an additive term, not just the retry multiplier on the primary node.

**Weakness 2: Treated conditional edge handling as resolved.** A1 wrote that ScopeChecker correctly handles conditional edges (true), but did not examine whether TokenEstimator handles them. A3's Bug #4 shows it does not -- the `edgeMap` constructor only stores `direct` edges. A1's review of TokenEstimator (Section 3) focused entirely on heuristic multipliers and never examined the edgeMap construction.

**Weakness 3: "No architectural changes needed" is too strong.** The retry_then_fallback fix requires changing `getRetryMultiplier()` from returning a single multiplier to returning either (a) a multiplier plus an additive fallback cost, or (b) being inlined so the caller can add the fallback cost directly. This is a small but real architectural change to the estimation API.

---

## Critique of A2-Pragmatist (Step 1 Score: 4/5)

**Strengths:** Good practical assessment. The observation that `edgeMap` with string keys is a minor smell but not worth changing is the right pragmatic call. The recommendation to add a multi-error accumulation test is useful and unique to A2 -- no other agent suggested testing `errors.length === 2` for two distinct scope failures.

**Weakness 1: Missed both estimation bugs entirely.** A2's review of TokenEstimator (Q3, Q4) focused exclusively on whether the class was "over-designed" and whether heuristics could be simpler. A2 never examined the estimation *correctness* -- whether the retry multiplier accounts for fallback cost, or whether conditional edges participate in estimation. The pragmatist lens ("is this over-designed?") is the wrong lens for a component whose purpose is numerical estimation. The right question is "does it estimate correctly?"

**Weakness 2: "No test cuts recommended" without examining test adequacy for estimation.** A2 reviewed the 8 tests and found none redundant, but did not identify that the TokenEstimator tests only cover the happy path (simple linear flow with budget warning). There is no test for retry_then_fallback estimation, no test for conditional edge estimation, and no test for a node that reads from a produces type routed through a conditional edge. These are the exact code paths where the bugs live.

**Weakness 3: Overly deferential to the plan on TypeChecker.** A2 noted the duplicate logic for select/filter/drop as a "style call" and the missing graph input/output validation as belonging in ScopeChecker. Both observations are correct, but A2 did not push hard enough on the graph input/output gap. It is not a minor placement question -- it is a missing validation that lets invalid programs pass silently.

---

## Critique of A3-Skeptic (Step 1 Score: 6/10)

**Strengths:** A3 found the most important bugs in this review cycle. Bug #3 (retry_then_fallback worst-case ignores fallback node cost) and Bug #4 (conditional edges dropped from edgeMap) are both real medium-severity issues that all three other agents missed. A3 also correctly identified that Bug #4 is architecturally nontrivial: you cannot just store conditional edge branches with the same key format because conditional edges may have different transforms per branch (or no transforms), and the estimation logic needs to account for branching probability.

A3 also showed good discipline by marking verified-correct items explicitly (Bug #6 verified correct, Bug #8 verified correct). This prevents future reviewers from re-investigating closed questions.

**Weakness 1: Bug #3 fix suggestion is incomplete.** A3 proposes "check if `node.onFailure?.type === 'retry_then_fallback'` and add the fallback node's estimated cost." But what is the fallback node's estimated cost? It depends on the fallback node's own reads, transforms, and budgets -- which means the estimation loop would need to either (a) process the fallback node inline, duplicating the per-node estimation logic, or (b) restructure the loop to estimate nodes independently first, then compose. A3 identified the bug correctly but underestimated the fix complexity.

**Weakness 2: Bug #4 fix has a semantic problem.** A3's fix stores each conditional branch target as a separate edgeMap entry:
```typescript
this.edgeMap.set(`${edge.source}->${branch.target}`, edge);
```
But this stores the *same edge object* for all branches, meaning `applyTransformReductions()` would apply the edge's transforms identically to all branch targets. Conditional edges may have different transforms per branch (the AST `ConditionalTarget.branches` contains `EdgeBranch` objects which have their own structure). The fix needs to be branch-aware, not just target-aware.

**Weakness 3: Score of 6/10 may be slightly generous to itself.** A3 identified 7 confirmed bugs, but 4 are LOW severity (missing tests, duplicate edge overwrite, multiple graph warning). The 3 real bugs (Parser constructor, graph input/output, retry_then_fallback) and 1 medium (conditional edges) are genuine, but the overall plan architecture is sound. A3's score implies "moderate rework needed" which is fair given the estimation bugs.

---

## Self-Rebuttal (A4-Specialist, Step 1 Score: 4/5)

### What I Got Wrong

**I missed the retry_then_fallback estimation bug that A3 found.** In my Step 1 Section 3, I reviewed the TokenEstimator heuristics and wrote about multiplier interactions, select stacking, and the missing per-node budgetIn warning. I never examined `getRetryMultiplier()` for semantic correctness. I took the retry logic at face value: "1 + max seems right for retry count." But `retry_then_fallback` is not just retry -- it is retry THEN fallback. The word "fallback" in the strategy name should have triggered me to ask: "where is the fallback node's cost accounted for?" I did not ask this question.

This is the same class of error I made in T4: reviewing the *form* of the code without tracing the *semantics* end-to-end. A multiplier-only return type from `getRetryMultiplier()` cannot express an additive fallback cost. This is not a heuristic inaccuracy -- it is a structural limitation of the method's API that causes a systematic undercount.

**I missed the conditional edge estimation gap that A3 found.** In my Step 1 Section 4, I wrote: "One subtlety: the edge map only stores `direct` edges, not `conditional` edges. For conditional edges, the upstream tokens would flow to multiple possible targets with no transform reduction applied. This is acceptable for v1." I actually identified the problem and then dismissed it as acceptable. A3 correctly escalated this to MEDIUM severity. My reasoning was wrong: "acceptable for v1" is not the right framing when the behavior is *silently incorrect*. If a conditional edge has `select(field)` transforms, the estimator will report inflated token counts for the downstream node with no indication of why. Users relying on the estimator for budget planning will get wrong numbers with no warning. At minimum, a warning should be emitted when a conditional edge is encountered and cannot be estimated.

**My per-node budgetIn warning finding was correct but overshadowed my misses.** I found one spec gap (per-node budgetIn check) that A3 did not flag. But A3 found two estimation bugs that I missed. Net: A3's analysis of TokenEstimator was more thorough than mine despite my specialist domain.

### What I Got Right

- The graph input/output validation gap (Sections 1 and 5) was correctly identified and the TypeChecker placement recommendation is sound.
- The observation that TypeChecker silently skips condition type compatibility checking and that this is acceptable for v1 (Section 2) remains correct.
- The per-node budgetIn warning gap (Section 3) is a real spec omission that no other agent caught.
- The error accumulation vs throw analysis (Section 6) is thorough and correctly grounded in the spec.

### Why This Happened

As a compiler specialist, I focused on the *semantic analysis* aspects (scope rules, type checking completeness, spec compliance) and treated TokenEstimator as a heuristic component where "close enough" was acceptable. This led me to review estimation code for reasonableness rather than correctness. A3 applied the same rigor to TokenEstimator that I applied to ScopeChecker and TypeChecker, and found real bugs as a result. My domain bias -- treating estimation as a lesser concern than type checking -- caused the gap.

---

## Revised Assessment

### Revised Convergence Score: 3/5 (6/10)

The analyzer architecture (three-class split, error accumulation, heuristic estimation) is correct. But the TokenEstimator has two medium-severity bugs that produce silently wrong results, and graph input/output validation is missing from both checkers. These are not polish issues; they are correctness gaps.

### Revised Recommendations

**Must Fix (blocking implementation):**

1. **Parser constructor signature (Bug #1).** Remove `source` param. Trivial, universally agreed.

2. **Graph input/output validation (Bug #2).** Add to TypeChecker (per spec Section 4.3 Pass 2). Verify `graph.input` resolves to a declared context, `graph.output` resolves to a declared produces name. ~10 lines.

3. **retry_then_fallback worst-case estimation (A3 Bug #3).** Refactor `getRetryMultiplier()` to either return a `{ multiplier: number, additiveCost: number }` tuple, or inline the logic so the caller can add the fallback node's estimated cost. The fallback node's cost should be computed using the same per-node estimation logic (reads resolution + transform reduction + budgetOut).

4. **Conditional edge estimation (A3 Bug #4).** At minimum, emit a warning when a conditional edge is encountered during estimation. For a proper fix, store each branch target separately in the edgeMap with branch-specific transform data, and use `worstCase` semantics (take the max-cost branch for worst case, min-cost for best case).

**Should Fix:**

5. **Per-node budgetIn warning.** Add `if (estimatedIn > node.budgetIn)` check inside the flow loop per spec.

6. **Multi-error accumulation test (A2's suggestion).** Add one test verifying `errors.length === 2` for two distinct scope failures.

7. **Conditional edge scope checking test (A3 Bug #9).** Add a test with a conditional edge referencing an undeclared node.

8. **Rename `tokens.ts` to `estimator.ts`.** Universally agreed.

**Deferred (v1 acceptable):**

9. Condition type compatibility in TypeChecker (known gap, needs runtime type system).
10. Multiple graph support in TokenEstimator (v1 is single-graph).
11. Duplicate edge overwrite in edgeMap (unlikely in practice).
