# Retrospective: Development Process (v2.1 -> v2.2)

## Executive Summary

v2.1 completed in 4 rounds (R1-R4), producing 39 new tests (288 total), 17 new ratchet decisions (107 total, 2 unlocked), with 21 agent calls -- a 42% reduction from the 36-call budget and 70% reduction from v2.0's ~70 calls. Every round passed review on the first attempt (zero NEEDS_CHANGES). The process improvements recommended by the v2.0 retrospective were the primary driver of this efficiency gain.

## Round-by-Round Productivity Assessment

### R1 (Cleanup and Refactoring) -- MEDIUM tier -- APPROPRIATE

**Agents used**: 6 (2 analysis, 1 cross-critique skipped in practice, 1 convergence, 1 implementation, 1 review)
**Bugs found by debate**: 0
**Design changes from debate**: 0
**ROI**: Correct for the task complexity.

R1 was pure mechanical refactoring: extract `constants.ts`, `utils.ts`, `runtime/memory.ts`. Both A2-Pragmatist and A3-Skeptic scored 8/10, indicating high pre-existing consensus. The debate surfaced two useful clarifications -- A3 identified the 0.3 semantic trap at `estimator.ts:195` (select transform vs partial field factor) and the ratchet unlock budget accounting -- but neither changed the fundamental approach. Both agents arrived at identical implementations; the convergence agent's only substantive work was adjudicating the `saveMemory` dryRun parameter placement (adopted A3's recommendation: caller guards, function always saves).

**Verdict**: MEDIUM tier was the right call. A 4-agent debate would have produced the same result with 8 wasted agent calls.

### R2 (Correctness Fixes) -- MEDIUM tier -- APPROPRIATE

**Agents used**: 6 (2 analysis, 1 cross-critique skipped in practice, 1 convergence, 1 implementation, 1 review)
**Bugs found by debate**: 1 critical (compiler.ts warning routing)
**Design changes from debate**: 1 (max_tokens placement: ScopeChecker vs TypeChecker)
**ROI**: High value per agent call. Both agents independently found the same critical bug.

The compiler.ts warning routing bug was the standout finding: both A3 (score 7/10) and A4 (score 8/10) independently identified that `compiler.ts` pushes all checker results into `errors[]` without filtering by severity, meaning warnings would block compilation. This bug was a prerequisite for the rest of R2's work (adding new warnings would have broken compilation). The one design disagreement -- whether max_tokens validation belongs in ScopeChecker or TypeChecker -- was resolved cleanly in convergence (adopted A4's ScopeChecker placement based on the "declaration constraint vs structural relationship" distinction).

**Verdict**: MEDIUM tier delivered excellent results. The critical bug was found by both agents, so 2-agent analysis was sufficient. Adding A1 and A2 would not have improved the outcome.

### R3 (Token Tracking Core) -- HIGH tier, reduced -- HIGHLY PRODUCTIVE

**Agents used**: 7 (4 analysis, cross-critique skipped, 1 convergence, 1 implementation, 1 review)
**Bugs found by debate**: 2 (CLI format uncertainty, mock spawner backward compat)
**Design changes from debate**: 1 (heuristic envelope detection)
**ROI**: High. The decision to skip cross-critique saved 4 agent calls without quality loss.

R3 was the most architecturally complex round -- new subsystem spanning subprocess parsing, executor orchestration, and file I/O. Four agents were justified: A1 identified the double-parse risk, A2 proposed the heuristic envelope detection that was adopted, A3 found the CLI format uncertainty (the `usage` field may not exist), and A4 provided domain patterns (PGO, JIT compiler, LLVM opt-record). Scores ranged 6-8, which is moderate consensus but with meaningful disagreements on CLI output parsing strategy.

The key process decision was **skipping cross-critique** (Step 2). With scores in the 6-8 range, the convergence agent had sufficient signal from Step 1 alone. The four agents' disagreements were clearly stated in their analyses: envelope detection strategy, estimate source (budgetIn/budgetOut vs TokenEstimator), token log clearing. Cross-critique would have amplified these points but not introduced new ones. This saved 4 agent calls.

A3-Skeptic's contribution was again the most valuable: their list of 7 findings (CLI format unverified, double-parse, executeNode discards SpawnResult, budget threading gap, token log not cleared, dry run estimates, mock spawner breakage) forced the convergence to address graceful degradation explicitly. Without A3, the happy-path implementation would have shipped without fallback behavior.

**Verdict**: HIGH tier was correct for complexity, but the cross-critique skip was the key efficiency win. Future HIGH rounds should adopt this pattern when Step 1 scores are in the 6-8 range (moderate consensus with clearly stated disagreements).

### R4 (Integration and Calibration) -- MEDIUM tier, further reduced -- APPROPRIATE

**Agents used**: 2 (1 combined analysis, 1 convergence/implementation/review compressed)
**Bugs found by debate**: 0
**Design changes from debate**: 0
**ROI**: Correct. Debate was unnecessary for test-only work.

R4 was the most aggressively streamlined round: debate was entirely skipped because R4 had no design decisions. A single combined agent (A2+A3) analyzed the test targets, convergence was pro-forma, and the implementer wrote 6 integration tests. The reviewer noted two minor coverage gaps (missing import pipeline test, dry-run log format assertion) but correctly passed because the underlying functionality was exercised through other tests.

**Verdict**: This is the new floor for test-only rounds. 2 agent calls (vs 8 budgeted) with no quality compromise.

## Process Improvement Assessment

### RP-01: MEDIUM complexity tier (2-agent analysis + convergence)

**Verdict: EFFECTIVE.** Used in R1, R2, R4. R1 and R2 each used 6 agent calls instead of 14. R4 went further to 2. No round required NEEDS_CHANGES retry. The MEDIUM tier correctly identified rounds where 4-agent debate adds cost without adding insight.

**Evidence**: R1 had both agents at 8/10 with identical proposals. R2 had both agents independently find the same bug. In neither case would additional agents have changed the outcome.

### RP-02: Skip Step 0 for incremental rounds

**Verdict: EFFECTIVE.** All 4 rounds skipped Step 0 (research). No round suffered from missing context. v2.1 rounds operated on existing codebase patterns (extraction, validation, integration), where Step 0's "explore prior art" role provides no value. Saved 8 agent calls (2 per round x 4 rounds).

**Caveat**: Step 0 should return for v2.2+ rounds that introduce genuinely novel concepts (e.g., a new compilation target, LSP integration, or runtime protocol). The skip rule is: "Skip when the round extends existing patterns; include when the round introduces a new domain."

### RP-03: General-purpose agents with persona prompts

**Verdict: NEUTRAL.** Agents performed their roles (A2 pragmatic, A3 skeptical, A4 specialist). However, the persona assignments are now so internalized that it is unclear whether the prompt prefixes add value or agents would self-differentiate regardless. No measurable change in output quality compared to v2.0.

### RP-04: Specs describe WHAT to test, not test helper code

**Verdict: EFFECTIVE.** The v2.0 retro flagged stale test helper signatures as a recurring pattern (T5, T6, T7). v2.1's plan listed test targets as descriptions ("Zero overlap: node produces {data}, memory has {history} -> warning") rather than code. The implementer wrote test code that matched actual APIs without fighting stale signatures. Zero test implementation issues across all 4 rounds.

### RP-05: Convergence code only for critical sections

**Verdict: EFFECTIVE.** Only R3 convergence wrote full code (subprocess parsing, TokenTracker class, executor changes). R1 and R2 convergence wrote targeted code snippets for disagreement resolutions. R4 convergence was prose-only. This reduced convergence agent workload and prevented the "spec drift" problem where convergence code diverges from actual APIs.

**Subtle benefit**: When convergence writes less code, the implementer has more latitude to adapt to the actual codebase state. R1 and R2 implementations matched convergence intent perfectly despite minor API differences. R3's full-code convergence was appropriate because the subprocess parsing logic had correctness subtleties that needed exact specification.

### RP-06: Forced dissenter only for HIGH rounds

**Verdict: EFFECTIVE.** Only R3 was eligible for forced dissenter. In practice, cross-critique was skipped entirely for R3 (moderate consensus), so the forced dissenter mechanism was not exercised. For MEDIUM rounds (R1, R2, R4), the absence of forced dissent caused no quality issues -- disagreements were resolved directly in convergence.

**Observation**: The forced dissenter mechanism's value has been demonstrated in v1.2 (A4 retracted 3/4 positions) and v2.0 (A2's "YAGNI applies to features, not correctness" reversal). But it requires cross-critique to function, and cross-critique was correctly skipped in v2.1. The mechanism remains valuable for HIGH rounds with low consensus (scores spread 4-8), where forced dissent would expose blind spots.

### RP-07: Reviewer proposes adversarial test

**Verdict: EFFECTIVE BUT UNDERUTILIZED.** All four reviews proposed adversarial tests:
- R1: `PARTIAL_FIELD_FACTOR` propagation to select transform (would catch hardcoded 0.3 reintroduction)
- R2: Three-or-more parallel branches grammar issue ("both" vs "all")
- R3: Object with `result` but no metadata treated as envelope (backward compat guard)
- R4: Zero-budget graph with actual token usage (division-by-zero through full pipeline)

All four proposals are valuable regression tests. However, none were actually implemented -- the reviewer proposes but implementation requires a follow-up. **Recommendation**: Either the implementer should add the adversarial test in the same round (append to Step 4), or the proposals should be tracked in common_memory for inclusion in the next version's test suite.

### RP-08: A3-Skeptic output reviewed first for HIGH rounds

**Verdict: NOT EXERCISED.** R3 was the only HIGH round, and the convergence report does not explicitly state reading order. However, the convergence adopted A3's graceful degradation concerns and A2's heuristic envelope detection -- both critical contributions -- suggesting that A3's concerns were given appropriate weight regardless of reading order.

### RP-09: Track debate ROI metrics

**Verdict: EFFECTIVE.** Common memory now contains per-round ROI data (agent calls, bugs found, design changes). This data directly informed this retrospective and will inform v2.2 planning. The metrics show a clear pattern: MEDIUM rounds with 6 calls find bugs as effectively as HIGH rounds with 14 calls when the task complexity is correctly assessed.

## Bottlenecks and Waste

### 1. Cross-critique consistently skipped (4 rounds, 0 used)

Cross-critique (Step 2) was budgeted for R1 and R2 (MEDIUM tier) but never produced meaningful artifacts. R1 and R2 had such high consensus that cross-critique would have been agents agreeing with each other. R3 explicitly skipped it. R4 skipped debate entirely. This suggests that **cross-critique should be opt-in, not opt-out** -- triggered only when Step 1 scores diverge significantly (e.g., range > 3 points).

**Proposed rule**: Skip cross-critique when all Step 1 scores are within 2 points of each other. Require cross-critique when any score diverges by 3+ points from the median.

### 2. Step 6 (Memory Update) is mechanical

Memory verification ran after every round but never caught corruption. The orchestrator writes memory correctly; the verifier confirms it. Over 4 rounds, this consumed 4 agent calls for zero corrections. Consider merging Step 6 into Step 5 (reviewer verifies memory update as part of review).

### 3. Test count estimates were inaccurate

The plan estimated ~50 new tests; actual was 39. Per-round estimates:
- R1: estimated ~8, actual 0 (pure refactoring, no new tests needed)
- R2: estimated ~12, actual 14 (close)
- R3: estimated ~20, actual 19 (close)
- R4: estimated ~10, actual 6 (integration tests consolidate more than expected)

R1's estimate was the most wrong: the plan anticipated new unit tests for extracted functions, but the convergence correctly decided that existing tests through public APIs provide sufficient regression coverage. This is not a process failure -- the convergence was right to override the plan -- but the plan's test estimates should account for the possibility that refactoring rounds may need zero new tests.

### 4. Two minor reviewer-identified gaps were accepted as PASS

The R4 reviewer identified two UNMET/PARTIAL convergence requirements (missing import pipeline test, dry-run log format assertion) but passed the review. This is the correct decision (underlying functionality was covered by other tests), but it sets a precedent: convergence requirements can be partially met if the reviewer judges the gap is minor. This should be explicitly documented as acceptable behavior in the harness rules.

## Recommendations for v2.2

### R-PROC-01: Make cross-critique score-gated

Replace the current "cross-critique for HIGH, skip for MEDIUM" rule with:
- **Score-gated trigger**: Run cross-critique only when Step 1 score range exceeds 2 points (e.g., scores of 6, 6, 7, 9 trigger it; scores of 7, 7, 8, 8 do not).
- **Rationale**: v2.1 showed that high-consensus HIGH rounds (R3, scores 6-8) do not benefit from cross-critique. The trigger should be consensus level, not task complexity.

### R-PROC-02: Merge Step 6 into Step 5

Have the reviewer verify the common_memory update as part of the review checklist, eliminating the separate memory verification agent. This saves 1 agent call per round (4 calls for a 4-round version).

### R-PROC-03: Implement adversarial test proposals

Add a rule: if the reviewer proposes an adversarial test in RP-07, the implementer must add it (as a follow-up commit if the round is already done, or as part of Step 4 if the review is NEEDS_CHANGES). This closes the gap between "proposed" and "implemented."

### R-PROC-04: Allow test-only rounds to collapse to 1 agent

R4 demonstrated that test-only rounds with no design decisions can run with 2 agent calls. Formalize this as a "TEST-ONLY" tier:
- **Criteria**: No production code changes, no design decisions, tests follow existing patterns.
- **Process**: 1 agent writes tests + 1 agent reviews. No analysis, no convergence, no cross-critique.
- **Agent calls**: 2.

### R-PROC-05: Accept partial convergence compliance in reviews

Explicitly allow reviewers to PASS with PARTIAL/UNMET items when:
1. The underlying functionality is tested through other code paths, AND
2. The gap is a coverage detail, not a functional omission, AND
3. The reviewer documents the rationale.

This codifies the R4 reviewer's behavior, which was correct but not formally authorized.

### R-PROC-06: Calibrate test count estimates by round type

| Round type | Test estimate heuristic |
|------------|------------------------|
| Refactoring | 0 new tests (existing tests are regression suite) |
| Correctness fixes | 2-3 tests per fix |
| New subsystem | 5-8 tests per component |
| Integration | 1-2 tests per cross-cutting concern |

### R-PROC-07: Track adversarial test proposals in common_memory

Maintain a "Proposed but Not Implemented" section in common_memory for RP-07 adversarial tests. Include them in the next version's test targets or explicitly close them with a rationale.

## Process Metrics

| Metric | v2.0 | v2.1 | Change |
|--------|------|------|--------|
| Rounds | 5 | 4 | -1 |
| Agent calls (actual) | ~70 | 21 | -70% |
| Agent calls (budgeted) | ~70 | 36 | -- |
| Under-budget | 0% | 42% | +42pp |
| NEEDS_CHANGES retries | 0 | 0 | -- |
| Tests added | 78 | 39 | -50% |
| Ratchets added | 34 | 17 | -50% |
| Ratchets unlocked | 0 | 2 | +2 |
| Critical bugs found | 2 | 1 | -1 |
| First-pass review rate | 100% | 100% | -- |
| Cross-critique rounds used | 4 of 5 | 0 of 4 | -4 |
| Step 0 rounds used | 2 of 5 | 0 of 4 | -2 |

## Forced Dissenter Assessment

The forced dissenter mechanism was not exercised in v2.1. Cross-critique was skipped in all 4 rounds: R1 and R2 due to MEDIUM tier (2-agent analysis, no forced dissent), R3 due to high consensus (cross-critique skipped), R4 due to debate skip.

**Assessment**: The mechanism is not obsolete -- it remains valuable for the specific scenario of HIGH-complexity rounds with low consensus (score range > 3). But v2.1's tasks did not trigger this scenario. If v2.2 includes rounds with genuinely competing design approaches (e.g., LSP protocol design, new runtime model), the forced dissenter will be relevant again.

## Conclusion

v2.1's process was the most efficient version to date, validating the v2.0 retrospective's recommendations. The MEDIUM tier, Step 0 skip, and cross-critique skip were responsible for the 70% agent call reduction. The remaining inefficiency is in Step 6 (memory verification, 4 wasted calls) and the gap between adversarial test proposals and implementation. The process is converging toward a mature state where the harness adapts its overhead to task complexity rather than applying uniform rigor to all rounds.
