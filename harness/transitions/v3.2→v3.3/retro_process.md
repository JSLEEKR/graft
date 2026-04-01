# v3.2 Process Retrospective

## Summary

v3.2 ran 4 rounds: R1 (MEDIUM, A2+A3 debate), R2 (DIRECT), R3 (DIRECT), R4 (TEST-ONLY). ~9 agent calls total (vs 10 budgeted). 45 new tests (537 to 582), all passing. 100% first-try pass rate (4/4). No NEEDS_CHANGES verdicts. This was the first version to apply R-PROC-08 (formally removed cross-critique) and R-PROC-09 (streamlined artifacts for DIRECT rounds). The version delivered parser error recovery — a non-trivial change to a core subsystem — with fewer agent calls than any previous version except v1.0.

---

## 1. Per-Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | MEDIUM (A2+A3) | ~4 | 0 | 2 (brace-depth tracking, seenNonImport fix) | **High ROI** — debate surfaced two design insights for a complex parser change |
| R2 | DIRECT | ~2 | 0 | 0 | Sufficient — 4 additive LSP features |
| R3 | DIRECT | ~1 | 0 | 0 | **Partial waste** — TD-05 already implemented |
| R4 | TEST-ONLY | ~2 | 0 | 0 | Sufficient — 12 integration tests |

**Total agent calls**: ~9. This is the leanest non-trivial version yet, continuing the downward trend from v3.1 (~12).

### R1 Debate Value Assessment

R1 introduced parser error recovery — a change that modifies the core parse loop behavior (from throw-on-first to error accumulation with panic-mode synchronization). This was correctly classified as MEDIUM tier because:

- It introduced a new return type (`ParseResult` replacing `Program`)
- It required a novel synchronization algorithm (brace-depth tracking)
- It touched the parser-to-compiler interface

A3-Skeptic's brace-depth insight was valuable: without tracking brace depth in `synchronize()`, the recovery algorithm would falsely match keywords like `context` and `node` inside block bodies, producing cascading phantom errors. This is the kind of subtle correctness issue that the adversarial checklist is designed to catch.

A2-Pragmatist's seenNonImport fix caught a real gap: the `synchronize()` function needed to call `advance()` past the `seenNonImport` guard to avoid re-triggering import ordering errors during error recovery. This was not visible from the spec alone.

**Assessment**: The debate was productive. Both agents contributed non-obvious insights that would have required debug cycles to discover otherwise.

### R3 Waste Analysis

R3 was scoped to address tech debt items, but TD-05 (duplicate writes clause guard) was already implemented in a prior version. The round reduced to adding a single `./format` sub-path export.

- **Agent calls spent**: ~1 (orchestrator handled directly instead of spawning a full DIRECT round)
- **Value delivered**: 1 minor packaging improvement
- **Waste**: The round was unnecessary as a distinct round. The `./format` export could have been bundled into R2 or R4.

**Root cause**: The tech debt backlog was not verified against the codebase before round scoping. TD-05 was listed in the plan but had already been resolved by a prior change.

## 2. Process Improvements Applied

### R-PROC-08: Cross-critique formally removed

Cross-critique (Step 2) was formally removed from the MEDIUM tier in v3.2. In R1, only Step 1 (independent analysis with adversarial checklist) and merged Step 3+4 were run.

**Result**: No quality issues. The two design insights (brace-depth, seenNonImport) were both found in Step 1 analysis. Cross-critique would have added ~2 agent calls with no marginal value.

**Running tally**: Cross-critique has been skipped/removed in ~19 consecutive eligible rounds (since v2.1-R3) with zero attributable quality loss.

**Verdict**: R-PROC-08 is validated. Cross-critique removal is permanent.

### R-PROC-09: Streamlined artifacts

DIRECT rounds (R2, R3) produced no harness artifacts — only code and tests. No step1/step2/step3 markdown files were generated.

**Result**: No problems. The DIRECT tier's artifact-free approach is now validated over 11 consecutive rounds (v3.0 R5-R8, v3.1 R2-R4, v3.2 R2-R3) with zero failures.

**One concern**: With no artifacts, there is no paper trail for DIRECT rounds. This has not caused issues because common_memory.md records the ratchet decisions and review feedback. But if a future DIRECT round fails, diagnosis will rely entirely on git diffs and common_memory. This is acceptable for now.

**Verdict**: R-PROC-09 is validated. Artifact generation for DIRECT rounds remains eliminated.

### R-PROC-10: Expanded adversarial checklist

The adversarial checklist was expanded with platform encoding, missing data sources, and LSP edge case categories for R1.

**Result**: A3-Skeptic's brace-depth finding maps directly to the "error path coverage" category. The checklist is working as intended — it provides a systematic structure for A3's natural adversarial analysis rather than relying on ad-hoc skepticism.

**Verdict**: R-PROC-10 is validated. No further expansion needed for v3.3.

## 3. Budget Accuracy

| Metric | Budgeted | Actual | Delta |
|--------|----------|--------|-------|
| Agent calls | 10 | ~9 | -10% |
| Rounds | 4 | 4 | 0 |
| Tests | ~40-50 | 45 | On target |

The budget was accurate. The 1-call savings came from R3 being handled by the orchestrator directly instead of spawning a subagent (since TD-05 was already done).

## 4. Tier Calibration

### DIRECT tier streak: 11 consecutive rounds, 0 failures

| Version | DIRECT Rounds | Failures |
|---------|---------------|----------|
| v3.0 | R5, R6, R7, R8 | 0 |
| v3.1 | R2, R3, R4 | 0 |
| v3.2 | R2, R3 | 0 |
| **Total** | **9 rounds** | **0** |

Adding TEST-ONLY rounds (which follow the same no-debate pattern): v3.1-R5 and v3.2-R4, the total no-debate streak is **11 rounds**.

**Assessment**: The DIRECT tier criteria remain correct. The question is whether MEDIUM can be further streamlined.

### MEDIUM tier analysis

The MEDIUM tier now consists of:
1. Step 1: Two agents (A2+A3) do independent analysis with adversarial checklist
2. Step 3+4 (merged): One agent converges and implements
3. Step 5: One agent reviews

Total: 4 agent calls for a debated round.

This is already lean. The only potential savings would be merging Step 5 (review) into the convergence+implementation agent, but this would eliminate the independent quality check. Given that the review agent has caught deviations in earlier versions (v2.0-R2 entryFile guard), the independent review should remain.

**Verdict**: MEDIUM tier is at its optimal size. No further streamlining recommended.

## 5. What Worked

- **Tier system correctly identified R1 as the only round needing debate.** Parser error recovery was genuinely novel; R2-R4 followed established patterns.
- **A2+A3 debate format is efficient.** Two agents with complementary perspectives (pragmatic vs skeptical) consistently produce the key insights without the overhead of 4-agent analysis.
- **Merged Step 3+4 continues to prevent context loss.** Zero deviations between design and implementation in R1.
- **Adversarial checklist caught real design issues.** Brace-depth tracking would have been a post-implementation debugging session without it.
- **Budget accuracy improved.** 10 budgeted, 9 actual (10% variance vs historical 20-40% variance).
- **TEST-ONLY closing round (R4) added 12 integration tests** covering all R1-R3 features, extending the regression safety net.
- **100% first-try pass rate continues** (4/4 in v3.2, extending to 9/9 across v3.1-v3.2).

## 6. What Didn't Work / Waste

- **R3 was partially wasted.** TD-05 was already implemented. The round delivered only a minor packaging improvement (./format export) that could have been folded into R2 or R4. Root cause: stale tech debt backlog.
- **No pre-round verification of tech debt items.** The plan listed TD-05 as outstanding, but the codebase already had the guard in place. A simple grep before round scoping would have caught this.
- **Harness artifact gap for v3.2 rounds.** No step1/convergence artifacts exist for R1 because the MEDIUM tier with merged Step 3+4 goes directly from analysis to implementation. The common_memory entries are the only record. This is fine for now but means the retrospective relies on git commit messages and common_memory rather than detailed debate artifacts.

## 7. Process Improvement Proposals

### R-PROC-11: Pre-round tech debt verification

**Description**: Before scoping a tech debt round, verify each listed item against the codebase with a targeted search (grep/read). Remove items that are already resolved. If all items are resolved, skip the round entirely.

**Rationale**: R3's TD-05 was already implemented, wasting a round. A 30-second grep (`grep -r "duplicate writes" src/`) would have detected this. As the codebase matures, previously-listed tech debt items are increasingly likely to be resolved as side effects of other work.

**Implementation**: Add a "tech debt triage" step before any round tagged as TECH-DEBT or CLEANUP. The orchestrator runs targeted searches for each listed item and removes already-resolved items from the round scope. If no items remain, the round is merged into the TEST-ONLY closing round.

### R-PROC-12: Merge single-item DIRECT rounds into adjacent rounds

**Description**: If a DIRECT round's scope reduces to a single small item (e.g., one export addition), fold it into the preceding or following round instead of running it as a standalone round.

**Rationale**: R3 consumed ~1 agent call for a single `./format` export addition. This could have been a 2-line addition in R2 (LSP polish) or R4 (integration tests) with zero additional risk. Standalone rounds for single-item changes are overhead.

**Implementation**: During round scoping, if a round contains fewer than 2 substantive changes, merge its items into the nearest compatible round. Compatible means: same subsystem or same risk profile.

## 8. Recommendation for v3.3 Tier Assignments

Based on v3.2 outcomes and the established tier criteria:

| Round | Description | Recommended Tier | Rationale |
|-------|-------------|-----------------|-----------|
| New subsystem or novel algorithm | MEDIUM (A2+A3) | Debate needed for design space exploration |
| Additive features following patterns | DIRECT | 11-round streak validates no-debate approach |
| Mechanical refactoring / tech debt | DIRECT | But verify items exist first (R-PROC-11) |
| Test-only / integration | TEST-ONLY | Confirmed as closing round |

**Specific guidance**:
- If v3.3 introduces a new language feature (new keyword, new AST node type), classify as MEDIUM
- If v3.3 adds LSP features following the existing features.ts pattern, classify as DIRECT
- If v3.3 involves runtime changes to execution model, classify as MEDIUM
- Apply R-PROC-11 to any tech debt rounds before scoping

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 4 |
| Debated rounds | 1 (R1) |
| DIRECT rounds | 2 (R2-R3) |
| TEST-ONLY rounds | 1 (R4) |
| Total agent calls | ~9 |
| Bugs caught by debate | 0 (2 design insights: brace-depth, seenNonImport) |
| First-try pass rate | 4/4 (100%) |
| NEEDS_CHANGES | 0 |
| Tests added | 45 (537 to 582) |
| New ratchets | 7 (5 from R1 + 2 from R2), 1 unlocked |
| Cross-critique triggered | 0 (formally removed via R-PROC-08) |
| Step 0 research runs | 0 |
| DIRECT tier streak | 11 consecutive no-debate rounds, 0 failures |
| Wasted rounds | 0.5 (R3 partially wasted due to stale TD-05) |
| Process improvements applied | 3 (R-PROC-08, R-PROC-09, R-PROC-10) |
| New process recommendations | 2 (R-PROC-11, R-PROC-12) |

### Version-over-Version Process Efficiency

| Version | Rounds | Agent Calls | Tests Added | Calls/Test |
|---------|--------|-------------|-------------|------------|
| v2.1 | 4 | ~21 | 39 | 0.54 |
| v2.2 | 6 | ~38 | 101 | 0.38 |
| v3.0 | 8 | ~26 | 101 | 0.26 |
| v3.1 | 5 | ~12 | 60 | 0.20 |
| v3.2 | 4 | ~9 | 45 | 0.20 |

Calls/test held steady at 0.20, the floor reached in v3.1. This suggests the process is near optimal efficiency for the current project structure. Further efficiency gains will come from scope optimization (R-PROC-11, R-PROC-12) rather than process compression.
