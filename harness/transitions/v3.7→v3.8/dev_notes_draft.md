# v3.7 Dev Notes Draft

## Section 1: Append to GraftDevNotes/graft-v1-development-notes.md

---

## v3.7: Runtime Hardening (April 2026)

### What Changed

v3.7 is the first non-LSP version since v3.1 — after five consecutive LSP-focused releases (v3.2-v3.6), development pivoted to runtime correctness. 4 rounds, ~12 agent calls, 42 new tests (832 total).

**R1: Server.ts cleanup + reference fix (DIRECT).** Two mechanical changes: `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` extracted from 3 duplicated server.ts handlers, and `findDeclNamePosition` rewritten to use `loc.length` instead of a hardcoded `KEYWORD_LENGTHS` map. The extraction reduced server.ts from 394 to 383 lines — the first time the LSP line count has decreased since its introduction in v2.2. Both items resolved tech debt from the v3.6 retro (TD-02 and TD-04).

**R2: Foreach source failure handling (MEDIUM).** When a foreach's source node fails and falls back to a different node, the output is stored under the fallback node's name — but foreach looks for the original name. A3-Skeptic caught this fallback alias bug. Separately, A2-Pragmatist found that foreach silently fell back to `ctx.input` (the program's input) when the source produced no output, via a dangerous `?? ctx.input` expression. Both fixes were essential: the alias invariant (`if (result.node !== flowNode.name) ctx.outputs.set(flowNode.name, result.output)`) and the skip guard (`if (sourceData === undefined) { break; }`).

**R3: Multi-hop conditional edge routing (MEDIUM).** Conditional edges (`when`/`else` branches) previously followed only one hop. v3.7 extends this to chains of up to 10 hops with `MAX_CONDITIONAL_HOPS=10`. A3-Skeptic advocated for a visited set over a depth counter for cycle detection — visited sets catch cycles on first revisit, while depth counters allow up to depth/2 revisits. The convergence adopted A3's approach. `done` was added as a valid conditional target (terminates the chain). The fallback alias pattern from R2 was reused for alias propagation through chains — its first cross-feature reuse.

**R4: Integration tests (TEST-ONLY).** 13 tests across 4 describe blocks covering cross-feature interactions: foreach body triggering multi-hop routing, failed source with conditional edges, parallel branches with conditional chains, and regression tests for all R1-R3 fixes.

### The Bugs That Mattered

**Fallback alias impedance mismatch (R2, A3-Skeptic).** When `on_failure: fallback(BackupPlanner)` triggers on a source node named `Planner`, the executor stores output under `BackupPlanner`. But foreach iterates over `Planner`'s output. Without the alias, foreach silently gets `undefined` and skips — no error, just missing data. This is the same class of silent data corruption that A3 caught in v3.0 (WriteRef `.join()` on objects).

**The `?? ctx.input` time bomb (R2, A2-Pragmatist).** When a source node produces no output, `ctx.outputs.get(sourceName) ?? ctx.input` would silently iterate over the program's raw input JSON. If the input happened to be an array, foreach would process completely unrelated data. If it was an object, the `forEach` call would fail with an uninformative error. A2 identified this as a remnant from early v1.2 development that should have been removed when failure strategies were added in v3.0.

**Silent chain truncation (R3, reviewer).** The initial R3 implementation followed conditional chains correctly but silently stopped when exceeding MAX_CONDITIONAL_HOPS — no error, no indication. The reviewer caught 3 missing items: the depth-limit error message, a depth-limit test, and a scope validation test for `done` as a conditional target. Fixed in 1 debug cycle.

### Forced Dissenter Highlights

Forced dissent was formally replaced by the adversarial checklist (R-PROC-04) back in v3.1. A3-Skeptic continues to provide adversarial value through systematic analysis. In v3.7, A3 contributed 3 distinct findings across R2 and R3:

1. **Fallback alias bug (R2)**: A3 analyzed the interaction matrix between failure strategies and foreach iteration — A2 did not examine this cross-feature path. A3's finding was essential for correctness.
2. **Visited set over depth counter (R3)**: A3 argued that depth counters are strictly weaker than visited sets for cycle detection. A depth counter of 10 allows a cycle of length 5 to execute twice before triggering. A visited set catches it on the first revisit. The convergence adopted A3's approach unanimously.
3. **`?? ctx.input` removal (R2, A2-Pragmatist)**: While not A3's finding, this validates the MEDIUM tier's dual-agent model. A2 caught what A3 missed, and A3 caught what A2 missed. v3.7-R2 is the first MEDIUM round where both agents contributed independent, non-overlapping findings that were both essential.

### Process Evolution

v3.7 proposed two new process improvements:

- **R-PROC-17 (convergence spec as implementation checklist)**: The implementer must verify each row in the convergence compliance table before submitting for review. Motivated by R3's NEEDS_CHANGES — 3 items from the convergence spec were absent from the implementation. A self-verification step, no additional agent calls.
- **R-PROC-18 (error path test requirement)**: MEDIUM rounds introducing new error conditions must explicitly list error path tests in the convergence spec. Motivated by R3's missing depth-limit test — implementers focus on proving features work, not on proving they fail correctly.

R-PROC-14 (wait for analysis before convergence) was applied twice (R2 and R3), capturing 3 findings. Running total: 4 findings across 3 applications in 2 versions. The rule is now mature.

Budget accuracy was exact: ~12 calls budgeted, ~12 actual. The +1 NEEDS_CHANGES fix was absorbed by efficient DIRECT and TEST-ONLY rounds. This is the first exact budget hit since v3.5.

### Stats

| Metric | v3.6 | v3.7 | Delta |
|--------|------|------|-------|
| Tests | 790 | 832 | +42 |
| Ratchet decisions | ~220 | ~225 | +5 |
| Agent calls | ~11 | ~12 | +1 |
| Rounds | 4 | 4 | 0 |
| NEEDS_CHANGES | 1 | 1 | 0 |
| Debated rounds | 1 | 2 | +1 |
| Direct rounds | 2 | 1 | -1 |
| Bugs caught (debate) | 1 | 3 | +2 |
| Bugs caught (review) | 1 | 3 | +2 |

The fallback alias pattern emerged as a cross-feature pattern — designed in R2 for foreach, reused in R3 for conditional chains without modification. flow-runner.ts grew from ~145 lines (v3.6) to 208 lines, approaching extraction threshold.

---

## Section 2: Blog Post — graft-v3-7-runtime-hardening.mdx

---

```mdx
---
title: "Graft v3.7: Runtime Hardening"
date: "2026-04-02"
description: "Foreach failure handling and multi-hop conditional routing. 832 tests, 3 bugs caught by dual-agent debate, first runtime-focused version since v3.1."
tags: ["graft", "compiler", "adversarial-debate", "runtime", "claude-code"]
---

Graft is a graph-native language for AI agent harness engineering — you write `.gft` files that declare contexts, nodes, edges, and graphs, and the compiler generates a Claude Code harness structure with orchestration files. Development uses an adversarial debate harness where multiple AI agents independently analyze, critique, and converge on each implementation.

## What v3.7 Adds

After five consecutive LSP-focused versions (v3.2-v3.6), v3.7 pivots back to the runtime. Two correctness gaps that had been deferred since v3.2-v3.3 are now closed: foreach source failure handling and multi-hop conditional edge routing.

### Foreach Source Failure

When a foreach's source node fails and a fallback fires, the output gets stored under the fallback node's name. But foreach looks for the original name:

```gft
node Planner(model: sonnet, max_tokens: 2k) {
  on_failure: fallback(BackupPlanner)
  produces { steps: list }
}

graph Pipeline {
  Planner
  foreach(Planner.output.steps as step) {
    Executor  // looks for "Planner" output, finds nothing
  }
}
```

v3.7 adds a **fallback output alias**: when a fallback fires, the output is stored under both the fallback name and the original name. The foreach also gains a **skip guard** — if the source produced no output at all, the body is skipped rather than iterating over undefined data.

### Multi-Hop Conditional Routing

Conditional edges can now chain through up to 10 hops:

```gft
edge Router -> Analyzer {
  when(Router.output.type == "code"): CodeReview
  when(Router.output.type == "text"): TextReview
  else: GeneralReview
}

edge CodeReview -> Output {
  when(CodeReview.output.severity == "high"): DeepAnalysis
  else: done
}
```

The runtime follows the chain with cycle detection via a visited set (not a depth counter — visited sets catch cycles on first revisit). `done` terminates the chain. The fallback alias pattern propagates through the chain, ensuring downstream nodes find outputs under expected names regardless of fallback invocations.

## The Debate Outcomes

### R2: Two Agents, Two Bugs, Zero Overlap

v3.7-R2 is the first MEDIUM round where both agents contributed independent findings that were both essential:

- **A3-Skeptic** found the fallback alias bug. A2 did not analyze the fallback+foreach interaction.
- **A2-Pragmatist** found the dangerous `?? ctx.input` fallback — foreach was silently iterating over program input when the source had no output. A3 focused on alias behavior, not input fallback.

Neither agent alone found both issues. This validates the dual-agent analysis model: it is not just "A3 finds bugs, A2 is overhead."

### R3: Visited Set Over Depth Counter

A3-Skeptic advocated for a visited set over a depth counter for cycle detection in conditional chains. The argument: a depth counter of 10 allows a cycle of length 5 to execute twice before triggering. A visited set catches it on the first revisit. The convergence adopted A3's approach.

The reviewer then caught 3 items missing from the implementation: a depth-limit error (the chain was silently truncated at 10 hops), a depth-limit test, and a scope validation test for `done` as a target. Fixed in 1 debug cycle.

### The Fallback Alias Pattern

The alias pattern (`if (result.node !== requestedName) ctx.outputs.set(requestedName, result.output)`) was designed in R2 for foreach and reused in R3 for conditional chains without modification. This organic cross-feature reuse — same pattern, different execution contexts — is a sign that the abstraction is at the right level.

## Server.ts Extraction

R1 extracted `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` from 3 duplicated server.ts handlers and fixed `findDeclNamePosition` to use `loc.length` instead of a hardcoded keyword-length map. Result: server.ts dropped from 394 to 383 lines — the first time the LSP line count has decreased since its introduction in v2.2.

## Process

Two new process improvements proposed:

- **R-PROC-17**: Treat the convergence spec as an implementation checklist. Verify each requirement before submitting for review.
- **R-PROC-18**: MEDIUM rounds introducing new error conditions must explicitly list error path tests. Implementers focus on proving features work; this forces them to also prove features fail correctly.

Budget accuracy was exact: ~12 calls budgeted, ~12 actual — the first exact hit since v3.5. The +1 NEEDS_CHANGES fix was absorbed by efficient DIRECT and TEST-ONLY rounds.

## Stats

| Metric | Value |
|--------|-------|
| Tests | 832 (42 new) |
| Ratchet decisions | ~225 |
| Rounds | 4 (1 DIRECT, 2 MEDIUM, 1 TEST-ONLY) |
| Agent calls | ~12 |
| Bugs caught by debate | 3 |
| Bugs caught by review | 3 |
| NEEDS_CHANGES | 1 (R3, fixed in 1 cycle) |
| First-try pass rate | 75% (3/4) |
| New process rules | 2 (R-PROC-17, R-PROC-18) |

## Try It

```bash
npm install -g @graft-lang/graft
graft compile myfile.gft
graft check myfile.gft
graft run myfile.gft --input '{"query": "hello"}'
```

Source: [github.com/JSLEEKR/graft](https://github.com/JSLEEKR/graft)

*Built with Claude Opus 4.6 via Claude Code's adversarial debate harness. ~12 agent calls across 4 rounds.*
```
