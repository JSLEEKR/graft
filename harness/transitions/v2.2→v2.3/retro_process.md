# Process Retrospective -- Graft v2.2

## 1. Debate Round Productivity vs Overhead

| Round | Tier | Agent Calls | Tests Added | Ratchets | Bugs Found | Value Assessment |
|-------|------|-------------|-------------|----------|------------|------------------|
| R1 | MEDIUM | 5 | 8 (9 net) | 5 | 0 | PRODUCTIVE -- eliminated double-parse tech debt, added ProgramIndex used by 4 later modules. A3 caught 2 spec omissions (producesNodeMap, codegen .find() calls). |
| R2 | MEDIUM | 5 | 27 | 5 | 0 | PRODUCTIVE -- executor decomposed from ~475 to ~300 lines, 18 error codes on 34 call sites. Foundational for LSP error reporting in R4. |
| R3 | MEDIUM | 5 | 14 | 5 | 0 | PRODUCTIVE -- 5 correctness warnings + sourceFile tracking. sourceFile was prerequisite for R4 go-to-definition. Good sequencing. |
| R4 | HIGH | 11 | 22 | 6 | 1 | HIGH VALUE -- new LSP subsystem (228 lines across 2 files). A3 found GRAPH_MISSING bug (program dropped for library files). 4-agent analysis justified: URI conversion disagreement, file structure debate, GRAPH_MISSING discovery. |
| R5 | MEDIUM | 5 | 4 | 4 | 0 | PRODUCTIVE -- npm + VS Code config. A3 caught 3 correctness issues (comment syntax, escape sequences, k-integer priority). Without A3 these would have shipped broken. |
| R6 | TEST-ONLY | 2 | 13 | 0 | 0 | EFFICIENT -- 2 calls for 13 tests + 4 adversarial backlog items cleared. Correct tier assignment. |
| **Total** | | **33** | **88** | **25** | **1** | |

**Overhead assessment**: Zero wasted rounds. Every round produced material output. The 33 agent calls compare favorably to v2.0's ~70 calls for 5 rounds and v2.1's 21 calls for 4 rounds. Cost per test: 0.375 agent calls/test (v2.1: 0.54, v2.0: 0.90). The trend continues downward as process tuning compounds.

**Lowest ROI round**: R3 (correctness warnings). While all 5 warnings are legitimate, they are non-blocking (warning severity) and unlikely to be hit in practice. However, sourceFile tracking turned out to be critical for R4, so the round's value was partly deferred.

**Highest ROI round**: R4 (LSP). 11 calls for a complete LSP subsystem with hover, diagnostics, go-to-definition. A3's GRAPH_MISSING bug catch alone justified the 4-agent tier -- no other agent identified the issue.

## 2. Complexity-Adaptive Scaling Accuracy

| Round | Assigned Tier | Correct? | Rationale |
|-------|--------------|----------|-----------|
| R1 | MEDIUM (2 agents) | YES | Mechanical refactoring (change signatures, create maps). No architectural decisions. 2 agents sufficient; A3 still caught spec gaps. |
| R2 | MEDIUM (2 agents) | YES | Decomposition pattern well-established. Both agents scored 8/10 -- high consensus. Error code taxonomy was the only design question (18 vs 24 codes), resolved by YAGNI. |
| R3 | MEDIUM (2 agents) | YES | 5 independent correctness fixes with clear right answers. Only disagreement (C-02 placement: TypeChecker vs ScopeChecker) resolved cleanly. Score range 1. |
| R4 | HIGH (4 agents) | YES | New subsystem (LSP), new dependency (vscode-languageserver), multiple design decisions (file structure, URI handling, caching strategy). A3's GRAPH_MISSING bug required cross-agent analysis to resolve optimally. |
| R5 | MEDIUM (2 agents) | YES | Configuration-only round (package.json, TextMate grammar, extension manifest). No production code. But A3's 3 corrections were critical -- if this had been 1-agent, comment syntax and k-integer priority would have shipped wrong. |
| R6 | TEST-ONLY (1 impl + 1 review) | YES | Pure test authoring with no design decisions. 2 calls optimal. |

**Verdict**: All 6 tier assignments were correct. The heuristic (new subsystem = HIGH, modifications = MEDIUM, tests only = TEST-ONLY) works reliably. No round was over-staffed or under-staffed.

**Observation**: MEDIUM rounds with A3-Skeptic present caught spec-level issues in R1 (producesNodeMap omission), R3 (C-02 placement), and R5 (comment syntax, escape sequences, k-integer). A2-Pragmatist alone would not have caught these. The 2-agent MEDIUM tier with A3 as one of the agents is the sweet spot.

## 3. Forced Dissenter Effectiveness

Forced dissenter was not formally assigned in v2.2 rounds because cross-critique (Step 2) was skipped in all rounds. The score-gated mechanism (R-PROC-01) effectively replaced the forced dissenter role with natural disagreement surfacing in Step 1.

**Where dissent still occurred naturally (without forced assignment)**:

| Round | Agent | Dissent | Outcome |
|-------|-------|---------|---------|
| R1 | A3 vs A2 | ProgramIndex scope (10+ maps vs 6 maps) | Converged to 5 maps (middle ground). A3's producesNodeMap adopted, A3's field-level maps rejected. |
| R1 | A3 vs A2 | Getter methods vs direct map access | A2's position adopted (YAGNI). |
| R1 | A3 vs A2 | Codegen migration | A3's position adopted after verification of .find() calls. |
| R2 | A4 vs convergence | 24 error codes vs 18 | Trimmed to 18 (YAGNI). Later grew to 21 in R3 organically. |
| R3 | A3 vs A4 | C-02 in TypeChecker vs ScopeChecker | A4 adopted (structural warning, not type checking). |
| R4 | A3 vs all | GRAPH_MISSING bug | A3 identified the bug; resolution method (fix compile() vs lspCompile()) differed from A3's proposal but addressed the root cause. |
| R4 | A4 vs all | 5-file structure | 3-to-1 rejected (code volume too small). |
| R4 | A1 vs A2/A3 | Custom intermediate types vs LSP types | 3-to-1 rejected (unnecessary indirection). |

**Self-rebuttal instances**: None in v2.2 (no forced dissenter assigned). The mechanism was inactive but quality was not lost because cross-critique's main benefit -- exposing blind spots -- was achieved through 2-4 agents independently arriving at different conclusions in Step 1.

**Assessment**: In high-consensus rounds (score range 0-1), forced dissent would have been artificial overhead. The R-PROC-01 score gate correctly detected that natural disagreement in Step 1 was sufficient. For the one HIGH round (R4), natural disagreement across 4 agents was rich enough (5 distinct disagreements resolved in convergence) that forced dissent was unnecessary.

## 4. Score-Gated Cross-Critique (R-PROC-01, Threshold=2)

Cross-critique (Step 2) was skipped in ALL 5 rounds that had analysis agents:

| Round | Scores | Range | Skip Decision | Quality Impact |
|-------|--------|-------|---------------|----------------|
| R1 | A2: 8, A3: 7 | 1 | Skipped | No impact -- disagreements resolved in convergence from Step 1 artifacts |
| R2 | A2: 8, A4: 8 | 0 | Skipped | No impact -- full consensus |
| R3 | A3: 7, A4: 8 | 1 | Skipped | No impact -- only C-02 placement differed, resolved in convergence |
| R4 | A1: 8, A2: 8, A3: 7, A4: 8 | 1 | Skipped | No impact -- 5 disagreements all resolved from Step 1 data |
| R5 | A2: 8, A3: 7 | 1 | Skipped | No impact -- A3's corrections were clear from Step 1 analysis |

**Agent calls saved**: 14 (2+2+2+4+2 = 12 cross-critique agents, plus 2 forced dissenter self-rebuttals that would have occurred).

**Was quality lost?** No. Evidence:
- All 6 rounds received PASS on first review attempt (zero NEEDS_CHANGES)
- Zero bugs found in review that were missed by analysis
- All disagreements were resolved in convergence using Step 1 data
- A3's findings (producesNodeMap, GRAPH_MISSING, comment syntax) were all captured in Step 1

**Threshold assessment**: The threshold of 2 was never triggered in v2.2. This raises the question: is 2 too high? Looking at v2.1 data, scores ranged 6-8 (range 2) and cross-critique was also skipped in R3. The last time cross-critique actually ran was v2.0, where transitive re-export bugs were caught. Those were in a round with a genuinely novel algorithm (import resolution) where agents had fundamental design differences.

**Recommendation**: The threshold of 2 is appropriate. Cross-critique is most valuable when agents fundamentally disagree on approach (score range >= 2), not when they agree on approach but differ on details. Detail-level disagreements are well-handled by convergence alone.

## 5. Step 6 to Step 5 Merge (R-PROC-02)

In v2.2, the code reviewer (Step 5) also performed memory verification (previously Step 6). Evidence from review artifacts:

- R1 review: includes "Memory Verification (Step 6)" section with 7 specific updates needed
- R2 review: includes "Memory Verification (R-PROC-02)" section with ratchet items, review feedback line, debate ROI line
- R3 review: includes "Memory Verification (R-PROC-02)" section
- R4 review: includes "Memory Update Preparation" section
- R5 review: includes "Common Memory Update Readiness" section
- R6 review: no memory section (TEST-ONLY round, no new ratchets)

**Assessment**: The merge was successful. Benefits:
1. **Saved 5 agent calls** (one per non-TEST-ONLY round) compared to separate Step 6
2. **Better accuracy**: The reviewer already has full context from reviewing the code -- verifying ratchet items against actual implementation is a natural extension
3. **Consistent format**: All review artifacts include proposed ratchet items, review feedback lines, and debate ROI entries ready for common_memory.md

**Issues found**: R6 review noted that common_memory still showed "All 359 tests currently passing" when the actual count was 376 (S-01 suggestion). This was a stale-data problem from the orchestrator not updating between rounds, not a failure of the merged step. The reviewer correctly flagged it.

**Verdict**: R-PROC-02 is confirmed effective. No regressions from the merge.

## 6. Process Bottlenecks and Waste

### Minimal Waste Identified

1. **Step 0 (Research) in R4**: 2 agent calls for LSP research. The research artifacts (research_arch.md, research_impl.md) informed the analysis but did not surface anything the agents could not have derived from vscode-languageserver documentation. However, this was the only round with research, and it was a new subsystem, so it was defensible. Borderline waste.

2. **R5 test count (4 tests)**: For 5 agent calls, R5 produced only 4 tests (packaging.test.ts). The value was in configuration correctness (9 files), not test volume. This is not waste per se, but the agent-call-to-test ratio is the worst of any round.

3. **Adversarial test backlog deferred to R6**: The 4 adversarial test proposals from v2.1 were carried forward and implemented in R6. This is by design (R-PROC-03), but it means R5's review generated a proposal that was not implemented until R6. The one-round delay is acceptable.

### No Bottlenecks Found

- No round required NEEDS_CHANGES retry (zero debug mode activations)
- No round exceeded its agent call budget
- Common memory updates were smooth (orchestrator applied reviewer's prepared sections)
- Sequencing was correct: R1 (ProgramIndex) before R4 (LSP uses it), R3 (sourceFile) before R4 (go-to-definition uses it)

### Efficiency Gains Over Previous Versions

| Metric | v2.0 | v2.1 | v2.2 |
|--------|------|------|------|
| Rounds | 5 | 4 | 6 |
| Agent calls | ~70 | 21 | 33 |
| Calls/round | 14.0 | 5.25 | 5.5 |
| Tests added | 78 | 39 | 88 |
| Calls/test | 0.90 | 0.54 | 0.375 |
| Ratchets added | 34 | 17 | 25 |
| Debug retries | 0 | 0 | 0 |
| Cross-critique runs | 5 | 0 | 0 |

The call-per-test efficiency has improved 2.4x from v2.0. The main driver is skipping cross-critique (R-PROC-01) and the Step 6 merge (R-PROC-02).

## 7. Recommended Changes for v2.3 Harness

### Keep (working well)

1. **R-PROC-01 (score-gated cross-critique, threshold=2)**: 14 calls saved in v2.2, zero quality loss. Keep the threshold at 2.
2. **R-PROC-02 (Step 6 merged into Step 5)**: 5 calls saved, better accuracy. Confirmed effective.
3. **R-PROC-03 (adversarial test proposals)**: All 4 v2.1 proposals resolved in R6. The backlog mechanism works.
4. **TEST-ONLY tier**: R6 at 2 calls for 13 tests is the most efficient format.
5. **MEDIUM tier with A3**: A3-Skeptic continues to find spec-level issues even in "routine" rounds (R1: producesNodeMap, R5: comment syntax).

### Modify

1. **R-PROC-04 (proposed): Conditional Step 0 for HIGH rounds**. Step 0 research was borderline useful in R4 (LSP). For v2.3, only run Step 0 when the round introduces a dependency the codebase has never used before (e.g., new npm package, new protocol). Skip for rounds that extend existing patterns. This saves 2 calls per HIGH round when the technology is already familiar.

2. **R-PROC-05 (proposed): A3-Skeptic mandatory in all MEDIUM rounds**. v2.2 data shows A3 caught issues in 4 of 5 analysis rounds (R1, R3, R4, R5). The one round without A3 (R2, which used A2+A4) had zero bugs -- but that was executor decomposition where A3's edge-case focus was less relevant. Formalize: MEDIUM = A2 + A3 (not A2 + A4 or other combinations) unless the round is pure refactoring.

3. **R-PROC-06 (proposed): Adversarial backlog batch threshold**. R-PROC-03 currently accumulates proposals until a TEST-ONLY round. In v2.2, 4 proposals accumulated over 5 rounds before R6. If the backlog reaches 6+ proposals, trigger a TEST-ONLY round immediately rather than waiting for a natural break. This prevents backlog growth beyond one round's capacity.

### Consider

1. **Single-agent MEDIUM for config-only rounds**: R5 (npm + VS Code) was configuration files with zero production code changes. A single agent with A3's skeptic lens might have been sufficient (convergence was trivial -- no design decisions, just correctness checking). This would save 2 calls (from 5 to 3: analysis + impl + review). Risk: A3's 3 corrections in R5 would need to come from the same agent that wrote the config, which is less reliable than independent review. Defer evaluation to v2.3 if a similar config-only round occurs.

2. **Eliminate convergence step for 2-agent rounds with score range 0**: When both agents agree completely (R2: both 8/10), convergence adds minimal value beyond formatting. The implementer could work directly from Step 1 artifacts. Saves 1 call per perfect-consensus round. Risk: convergence also serves as a canonical reference for the reviewer. Keep for now.

### Process Stats Summary

| Metric | v2.2 Actual |
|--------|-------------|
| Total agent calls | 33 |
| Rounds | 6 (3 MEDIUM + 1 HIGH + 1 MEDIUM + 1 TEST-ONLY) |
| Tests: start to end | 288 to 376 (+88) |
| Ratchets: start to end | 107 to 132 (+25) |
| Bugs caught by debate | 1 (GRAPH_MISSING, A3 in R4) |
| Spec corrections by debate | 5 (R1: producesNodeMap + codegen migration; R5: comments + escapes + k-integer) |
| Debug retries | 0 |
| Cross-critique runs | 0 |
| First-pass PASS rate | 6/6 (100%) |
| Agent calls saved by R-PROC-01 | ~14 |
| Agent calls saved by R-PROC-02 | 5 |
| Total savings from process improvements | ~19 calls (37% of what v2.0's process would have cost) |
