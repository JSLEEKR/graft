# v3.9 Dev Notes Draft

## Section 1: Append to graft-v1-development-notes.md

> Append after the v3.8 section, before the closing `*Built with Claude Opus 4.6...* ` line.

---

## v3.9: Quality Polish (April 2026)

### What Changed

v3.9 is the final v3.x release — a quality polish version that closes the last feature gap and the last tracked tech debt item before the v4.0 major version boundary. 3 rounds, ~9 agent calls, 26 new tests (890 total). One NEEDS_CHANGES in R1 (2 missing tests, fixed in 1 debug cycle). Two long-standing items resolved: SCOPE_TRANSFORM_CONDITIONAL (documented since v3.3-R2, 7 versions) and TD-01 (import-path regex, carried 4 retros). R-PROC-19 (tech debt carry limit) applied for the first time, mandating TD-01 inclusion.

**R1: Edge transforms on conditional edges (MEDIUM).** Transforms (select, filter, drop, compact, truncate) declared on conditional edges were previously blocked with a SCOPE_TRANSFORM_CONDITIONAL warning. v3.9 applies them after condition evaluation, before target execution. The `ConditionalEdgeInfo` interface bundles branches and transforms together, replacing the bare `ConditionalBranch[]` return from `getConditionalEdge`. Multi-hop chains apply transforms per-hop independently. `done` target and cycle detection paths skip transform application (no output to transform). A3-Skeptic (score 7) caught the transform-before-condition ordering risk — transforms must run after the condition determines the branch, not before. A2-Pragmatist (score 8) proposed the `ConditionalEdgeInfo` interface design. The reviewer found 2 missing tests: transform-on-cycle interaction and transform+fallback alias interaction. Fixed in 1 debug cycle (test-only, runtime code was already correct).

**R2: Estimator polish + TD-01 (DIRECT).** Three items merged via R-PROC-12 (9th application): (1) `BUDGET_CHAIN_CYCLE` and `BUDGET_CHAIN_DEPTH` diagnostic codes replace the overloaded `BUDGET_EXCEEDED` for chain-specific warnings, (2) `getFallbackCost()` now included in worst-case estimation for `retry_then_fallback` strategies, and (3) TD-01 resolved — `collectRenameLocations` import-path regex replaced with AST-based `getImportPathRanges()`/`isInImportPath()`. TD-01 had been carried through v3.5, v3.6, v3.7, and v3.8 retros. R-PROC-19 mandated its inclusion at the 4-retro threshold.

**R3: Integration tests (TEST-ONLY).** 10 tests covering cross-feature interactions: conditional edge transform + multi-hop chain, conditional edge transform + foreach source, estimator with new diagnostic codes, backward compatibility regressions, and TD-01 rename/references validation. Hit the upper bound of the 8-10 test target.

### Forced Dissenter Highlights

A3's transform-before-condition ordering risk (R1) is a subtle correctness concern: if transforms ran before condition evaluation, the condition would evaluate against transformed data rather than the original node output. The converged design places transform application after condition evaluation and before target execution — the only correct position in the pipeline. A2's ConditionalEdgeInfo interface (score 8) was the adopted design. A3's ordering analysis (score 7) confirmed the design was correct for the right reason. R-PROC-14 sixth application, sixth finding.

### Process Evolution

- **R-PROC-19 validated on first application**: TD-01, carried 4 retros, was mandated for inclusion and resolved cleanly in a DIRECT round. The carry-limit mechanism works as designed.
- **R-PROC-17/18 gap exposed**: R1's NEEDS_CHANGES revealed a plan-to-convergence-spec gap. R-PROC-17 (implementer checklist) and R-PROC-18 (error path tests) protect the implementer-to-spec link, but the convergence spec itself was incomplete relative to the plan. Two test targets from the plan were absent from the convergence spec's test list.
- **R-PROC-20 proposed (plan test target cross-reference)**: The convergence spec's test list must cross-reference the plan's per-round test targets, with explicit exclusion reasons for omissions.
- **R-PROC-21 proposed (R-PROC-15 retirement threshold)**: If R-PROC-15 (A3 backlog) remains idle for 6 consecutive versions, retire it from the active R-PROC list. Idle for 4th consecutive version.

### v3.x Series Summary

v3.9 concludes the v3.x series: 10 versions (v3.0 through v3.9), 44 rounds, ~119 agent calls, 514 tests added (477 to 890), ~60 ratchets added (175 to ~235). 88.6% first-try pass rate (39/44 rounds). All tracked tech debt (TD-01 through TD-04) resolved. 19 R-PROC rules accumulated (12 active, 2 idle/dormant). The codebase enters v4.0 at 6,086 source lines, 1,336 LSP lines, 30+ error codes, 8 LSP features, zero MEDIUM/HIGH tech debt.

### Stats

| Metric | v3.8 | v3.9 | Delta |
|--------|------|------|-------|
| Tests | 864 | 890 | +26 |
| Ratchet decisions | ~230 | ~235 | +5 |
| Agent calls | ~10 | ~9 | -1 |
| Rounds | 4 | 3 | -1 |
| NEEDS_CHANGES | 0 | 1 | +1 |
| Tech debt items closed | 3 | 1 (TD-01) | -2 |
| Feature gaps closed | 0 | 1 (SCOPE_TRANSFORM_CONDITIONAL) | +1 |

R-PROC-19 first application, validated. The v3.x tech debt backlog enters v4.0 clean — 6 LOW items with explicit deferral justification, zero MEDIUM/HIGH.

---

## Section 2: Blog Post

> Save as `graft-v3-9-quality-polish.mdx` in `jslee-homepage/content/blog/`

```mdx
---
title: "Graft v3.9: Quality Polish"
date: "2026-04-02"
description: "Final v3.x release — 890 tests, conditional edge transforms, tech debt zero. 3 rounds, ~9 agent calls."
tags: ["graft", "compiler", "llm", "adversarial-debate", "claude"]
---

Graft is a domain-specific language for defining LLM agent pipelines. The compiler takes `.gft` files and generates Claude Code harness structures — contexts, agents, hooks, and orchestration files. Development uses an adversarial debate harness where multiple AI agents independently analyze, critique, and converge before implementation.

v3.9 is the final v3.x release. Three rounds, ~9 agent calls, 26 new tests (890 total). Two long-standing items closed, zero MEDIUM/HIGH tech debt remaining. The v3.x series is complete.

## What This Version Adds

**Edge transforms on conditional edges.** Since v3.3, transforms on conditional edges produced a `SCOPE_TRANSFORM_CONDITIONAL` warning — the compiler acknowledged them but didn't apply them. v3.9 implements full support. Transforms run after condition evaluation, before target execution:

```
edge Planner -> Router
  when "needs_research" -> Researcher
    select: [findings, confidence]
  when "ready" -> Writer
    filter: quality > 0.8
  else -> Fallback
```

The `ConditionalEdgeInfo` interface bundles branches and transforms together. Multi-hop chains apply transforms per-hop independently — each hop evaluates its condition, then applies its transforms before passing data to the next hop.

**Estimator diagnostic specialization.** `BUDGET_CHAIN_CYCLE` and `BUDGET_CHAIN_DEPTH` replace the overloaded `BUDGET_EXCEEDED` code for chain-specific warnings. IDE tooling can now distinguish between actual budget violations and chain estimation diagnostics.

**Fallback cost in worst-case estimation.** For `retry_then_fallback` strategies, the worst-case estimate now includes the fallback node's cost. Previously, the estimate was `cost * (1 + retries)` — now it's `cost * (1 + retries) + fallbackCost`.

**TD-01 resolved: AST-based import-path filtering.** The `collectRenameLocations` function used a `from\s+"([^"]*)"` regex to identify import paths and exclude them from rename operations. This regex had been flagged as fragile across 4 consecutive retros (v3.5 through v3.8). v3.9 replaces it with `getImportPathRanges()` / `isInImportPath()`, which parse the document and extract import path ranges from the AST. Parse failure gracefully degrades to empty ranges (no false renames).

## The Debate That Mattered

**R1: Transform ordering (A3-Skeptic, score 7).** The critical question for conditional edge transforms is: when do transforms run relative to condition evaluation? If transforms run *before* the condition, the condition evaluates transformed data — wrong. If transforms run *after* target execution, the target receives untransformed data — also wrong. A3 flagged this ordering risk at score 7 (lower confidence), while A2 proposed the `ConditionalEdgeInfo` interface at score 8. The converged design places transforms after condition evaluation and before target execution — the only correct position.

The reviewer then found 2 missing tests: transform-on-cycle (what happens when a conditional chain cycles back and transforms should not apply on the cycle edge?) and transform+fallback alias interaction (does the fallback alias mechanism propagate correctly when transforms modify the output shape?). Both were test-only gaps — the runtime handled these cases correctly. Fixed in 1 debug cycle.

## R-PROC-19: Tech Debt Carry Limit

R-PROC-19 was proposed in the v3.8 retro: items carried across 3+ retros must be explicitly prioritized. TD-01 hit the 4-retro threshold and was mandated for inclusion in v3.9.

Result: TD-01 was resolved in a DIRECT round, merged with 2 other small items via R-PROC-12. Without R-PROC-19, TD-01 would likely have been deferred to v4.0 — its fifth deferral. The carry-limit mechanism works: it escalates items that have been repeatedly deferred without justification.

This also exposed a process gap: R-PROC-17 (convergence checklist) and R-PROC-18 (error path tests) protect the implementer-to-spec link, but v3.9-R1's NEEDS_CHANGES came from the convergence spec being incomplete relative to the plan. R-PROC-20 (plan test target cross-reference) was proposed to close this gap for v4.0.

## v3.x Series: By the Numbers

10 versions. 44 rounds. ~119 agent calls. 514 tests added.

| Metric | v3.0 Start | v3.9 End | Delta |
|--------|-----------|----------|-------|
| Tests | 477 | 890 | +413 |
| Ratchets | ~175 | ~235 | +60 |
| Source lines | ~4,200 | 6,086 | +1,886 |
| LSP features | 0 | 8 | +8 |
| Error codes | 18 | 30+ | +12 |
| Tech debt (HIGH/MED) | 0 | 0 | 0 |
| First-try pass rate | -- | 88.6% | 39/44 |

The v3.x series transformed Graft from a functional compiler into a production tool with comprehensive LSP support, multi-hop conditional routing, failure strategies, field-level operations, and npm distribution. The process accumulated 19 R-PROC rules — each one motivated by a specific failure and validated in subsequent versions.

## Stats

| Metric | Value |
|--------|-------|
| Tests | 890 (26 new) |
| Ratchets | ~235 |
| Rounds | 3 (1 MEDIUM, 1 DIRECT, 1 TEST-ONLY) |
| Agent calls | ~9 |
| NEEDS_CHANGES | 1 (R1: 2 missing tests) |
| First-try pass | 2/3 |
| Tech debt closed | TD-01 (carried 4 retros) |
| Feature gaps closed | SCOPE_TRANSFORM_CONDITIONAL (since v3.3) |
| R-PROC applied | 7 rules |
| R-PROC proposed | 2 (R-PROC-20, R-PROC-21) |

## Try It

```bash
npm install -g @graft-lang/graft
graft compile myflow.gft
graft run myflow.gft
```

*Built with Claude Opus 4.6 via Claude Code. April 2026.*
```
