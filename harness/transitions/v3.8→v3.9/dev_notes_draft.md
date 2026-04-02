# v3.8 Dev Notes Draft

## Section 1: Append to GraftDevNotes/graft-v1-development-notes.md

---

## v3.8: Estimator-Runtime Parity (April 2026)

### What Changed

v3.8 is a cleanup and parity version — flow-runner extraction, estimator alignment, and error message enrichment. 4 rounds, ~10 agent calls, 32 new tests (864 total). Zero NEEDS_CHANGES across all rounds — the first clean sweep since v3.5 (7 rounds ago). Three tech debt items closed in a single version, including TD-03 (estimator-runtime parity), which had been carried through 5 consecutive retros since v3.3.

**R1: Flow-runner extraction (DIRECT).** The 66-line `case 'node'` block in flow-runner.ts — the densest block in the codebase — was reduced to 9 lines. Two functions extracted: `applyFallbackAlias(name, result, ctx)` eliminates fallback alias duplication (TD-04), and `executeConditionalChain(flowNodeName, result, ctx, nodeResults, errors)` encapsulates the multi-hop routing logic. Both are mechanical extractions with zero behavioral change. This is the largest single-round size reduction in the v3.x series. TD-02 (flow-runner density) and TD-04 (fallback alias duplication) closed together via R-PROC-12 (merge small items, 8th application).

**R2: Multi-hop conditional chain estimation (MEDIUM).** The estimator previously treated conditional edges as single-hop: pick the cheapest or most expensive branch target. The runtime, since v3.7-R3, follows chains up to 10 hops. v3.8-R2 aligns the estimator. A2-Pragmatist proposed a recursive `getConditionalBranchCosts` approach (score 8) that handled straightforward cases cleanly. A3-Skeptic (score 6) caught the diamond path edge case: when two branches converge to the same node (A->B, A->C, B->D, C->D), per-branch visited set copies (`new Set(visited)`) are needed to avoid counting D's cost only once. Without this, the second branch sees D as "visited" and skips its cost, producing incorrect estimates. Both approaches merged: A2's recursive structure with A3's per-branch set copying.

The implementation includes cycle detection (warning + finite cost, not error), depth limiting at `MAX_CONDITIONAL_HOPS=10` (warning), retry multiplier propagation through chain hops, and `done` as zero-cost terminal. `MAX_CONDITIONAL_HOPS` moved to `src/constants.ts` as the single source of truth, re-exported from flow-runner.ts. `conditionalEdges` map changed from storing target strings to `ConditionalBranch[]` for direct branch access. TD-03 (estimator-runtime parity, carried 5 retros) finally closed.

**R3: Foreach iteration context in errors (DIRECT).** Error messages within foreach body execution now include `(foreach iteration N of M)` suffix. The implementation uses a post-hoc annotation pattern: errors are collected normally during body execution, then only new errors (tracked via `errorsBefore` index) are suffixed. Three lines of code, significant debugging value.

**R4: Integration tests (TEST-ONLY).** 11 tests covering cross-feature interactions (estimator chain estimation + foreach, extracted executeConditionalChain with failure strategies), regressions (single-hop backward compat, flow-runner extraction behavioral equivalence, foreach error messages with iteration context), and R2 error paths (cycle estimation finite values, depth-limited chains).

### R-PROC-17: The Convergence Checklist

R-PROC-17 (convergence spec as implementation checklist) was proposed in the v3.7 retro after R3's NEEDS_CHANGES — three items from the convergence spec were absent from the implementation. The rule is simple: the implementer must verify each requirement in the convergence spec before submitting for review.

v3.8 was its first application. Combined with R-PROC-18 (error path test requirement, also first application), the result was zero NEEDS_CHANGES. R-PROC-18 ensured the convergence spec explicitly listed 4 error path tests for R2 (cycle estimation, depth limit estimation, empty chain, warnings emission). R-PROC-17 ensured the implementer checked them off. All 4 were implemented and passed.

One application is insufficient for causal confirmation — v3.8's scope was narrower than v3.7-R3's. But the structural prevention is clear: the exact failure mode from v3.7 (missing error paths that were specified in convergence) is no longer possible when both rules are applied.

### Forced Dissenter Highlights

v3.8-R2 continues the pattern where A3's lower-confidence analysis contains the key insight. A2 proposed the recursive structure (score 8, high confidence) but did not consider diamond paths. A3 proposed per-branch visited set copies (score 6, lower confidence) specifically because diamond graphs are the adversarial case for shared visited sets. R-PROC-14 (wait for all analyses before convergence, 5th application) ensured the finding was captured. Running total: 5 findings across 4 rounds in 3 versions, zero latency cost.

### Process Evolution

- **R-PROC-19 proposed (tech debt carry limit)**: any tech debt item carried for 3+ retros must be explicitly prioritized in the next version's plan, with prerequisites stated. Items at 5+ retros without a stated prerequisite are escalated to mandatory inclusion. Motivated by TD-03's 5-retro carry — the carry was justified (multi-hop routing was a prerequisite) but the justification was implicit in each retro.
- **R-PROC-17 + R-PROC-18**: first application, zero failures. Continue applying.
- **R-PROC-15 (A3 backlog)**: idle for 3rd consecutive version. R-PROC-14 continues to prevent the need for backlog entries.

### Stats

| Metric | v3.7 | v3.8 | Delta |
|--------|------|------|-------|
| Tests | 832 | 864 | +32 |
| Ratchet decisions | ~225 | ~230 | +5 |
| Agent calls | ~12 | ~10 | -2 |
| Rounds | 4 | 4 | 0 |
| NEEDS_CHANGES | 1 | 0 | -1 |
| Debated rounds | 2 | 1 | -1 |
| Direct rounds | 1 | 2 | +1 |
| Bugs caught (debate) | 3 | 1 | -2 |
| Tech debt items closed | 0 | 3 | +3 |

Budget exact match for 2nd consecutive version (~10/~10 calls, 864/862-864 tests). The estimator-runtime parity gap, carried since v3.3, is fully closed.

---

## Section 2: Blog post (graft-v3-8-estimator-parity.mdx)

```mdx
---
title: "Graft v3.8: Estimator-Runtime Parity"
date: "2026-04-02"
description: "Closing the longest-running tech debt, extracting the densest code block, and the first clean sweep in 7 rounds. 864 tests, ~10 agent calls, 0 NEEDS_CHANGES."
tags: ["graft", "compiler", "adversarial-debate", "tech-debt"]
---

Graft is a domain-specific language for defining LLM agent pipelines — contexts, nodes, edges, and graphs compiled from `.gft` files into executable orchestration structures. It is built entirely through an adversarial debate harness where multiple AI agents independently analyze, cross-critique, and converge before any code is written.

## What v3.8 Adds

v3.8 is a cleanup and parity version with three themes: flow-runner extraction, estimator alignment, and error message enrichment.

### Flow-Runner Extraction

The `case 'node'` block in `flow-runner.ts` had grown to 66 lines — the densest block in the codebase, handling failure strategies, fallback aliasing, conditional chain routing, and depth limits. R1 extracted two functions:

- `applyFallbackAlias(name, result, ctx)` — shared helper for fallback output aliasing
- `executeConditionalChain(flowNodeName, result, ctx, nodeResults, errors)` — multi-hop routing logic

The block is now 9 lines. The largest single-round size reduction in the v3.x series.

### Multi-Hop Conditional Chain Estimation

Since v3.7, the runtime follows conditional edge chains up to 10 hops. But the estimator only looked one hop ahead — `best = cheapest branch, worst = most expensive branch`. v3.8 aligns the estimator with a recursive `getConditionalBranchCosts` that walks chains, handles cycles (warning + finite cost), respects depth limits, and propagates retry multipliers through hops.

The key design insight came from A3-Skeptic: diamond-shaped graphs (A branches to B and C, both converge to D) require per-branch visited set copies. Without `new Set(visited)` per branch, the second path sees D as "already visited" and skips its cost. A3 scored this analysis at 6/10 confidence — lower than A2's 8/10 — but it contained the critical edge case.

### Foreach Iteration Context

Error messages within foreach bodies now include `(foreach iteration N of M)` — three lines of code that identify exactly which iteration failed.

## The 5-Retro Tech Debt

TD-03 (estimator-runtime parity for conditional chains) was first identified in the v3.3 retro. It was carried through v3.4, v3.5, v3.6, and v3.7 — five consecutive retros. The carry was justified: multi-hop routing itself (v3.7-R3) was a prerequisite for multi-hop estimation. You cannot align the estimator with runtime behavior that does not yet exist.

v3.8-R2 resolved it. The sequencing was correct but the justification was implicit — each retro simply noted "carried." This motivated R-PROC-19 (tech debt carry limit): items carried 3+ retros must state their prerequisite and expected resolution version.

In total, v3.8 closed three tech debt items: TD-02 (flow-runner density), TD-03 (estimator parity), and TD-04 (fallback alias duplication). The most tech debt closed in any v3.x version.

## The Convergence Checklist

v3.7-R3 had a NEEDS_CHANGES verdict because three items from the convergence spec were absent from the implementation. The implementer completed the core logic but missed error paths and edge-case tests.

Two process rules were proposed in response:
- **R-PROC-17**: The implementer verifies each convergence requirement before submitting for review.
- **R-PROC-18**: MEDIUM rounds introducing new error conditions must explicitly list error path tests in the convergence spec.

v3.8 was their first application. R2's convergence spec listed 4 error path tests (cycle estimation, depth limit, empty chain, warnings). All 4 were implemented. All 4 passed. Zero NEEDS_CHANGES across all 4 rounds — the first clean sweep since v3.5.

One application is not proof. But the structural prevention is clear: the failure mode (missing specified items) cannot occur when the implementer checks them off.

## Forced Dissenter Highlights

A3-Skeptic's diamond path finding (R2) continues the pattern where the lower-confidence agent contributes the key insight. A2 proposed the recursive structure at score 8. A3 proposed per-branch visited set copies at score 6. The diamond edge case — invisible to the higher-confidence approach — was the difference between correct and incorrect estimation for branching conditional chains.

R-PROC-14 (wait for all analyses before convergence) ensured the finding was captured. Fifth application, fifth finding, zero latency cost.

## Stats

| Metric | Value |
|--------|-------|
| Tests | 864 (32 new) |
| Ratchet decisions | ~230 |
| Rounds | 4 (2 DIRECT, 1 MEDIUM, 1 TEST-ONLY) |
| Agent calls | ~10 |
| NEEDS_CHANGES | 0 (first clean sweep since v3.5) |
| Bugs caught (debate) | 1 (A3: diamond path edge case) |
| Tech debt items closed | 3 (TD-02, TD-03, TD-04) |
| Budget accuracy | Exact match (2nd consecutive version) |

## Try It

```bash
npm install @graft-lang/graft
npx graft compile your-pipeline.gft
npx graft check your-pipeline.gft   # token estimation with multi-hop chain support
npx graft run your-pipeline.gft --input '{"query": "hello"}'
```

The estimator now walks conditional chains recursively — `graft check` produces accurate token estimates for pipelines with multi-hop conditional routing.
```
