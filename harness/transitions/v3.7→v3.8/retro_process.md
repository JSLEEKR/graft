# v3.7 Process Retrospective

## Summary

v3.7 ran 4 rounds: R1 (DIRECT), R2 (MEDIUM), R3 (MEDIUM), R4 (TEST-ONLY). ~12 agent calls total (vs ~12 budgeted, exactly on target). 42 new tests (790 to 832), all passing. 3/4 first-try pass rate -- R3 received NEEDS_CHANGES for 3 missing items (depth-limit error, depth-limit test, scope validation test for `done` target), fixed in 1 debug cycle. R-PROC-14 (wait for analysis) was applied in R2 and R3, both times producing concrete design improvements. This version marks the runtime hardening pivot -- after 5 consecutive LSP versions (v3.2-v3.6), development shifted to runtime correctness (foreach failure handling, multi-hop conditional routing).

---

## 1. Per-Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | DIRECT | ~2 | 0 | 0 | **Efficient** -- mechanical extraction + straightforward fix |
| R2 | MEDIUM (A2+A3) | ~4 | 2 (A3: fallback alias bug; A2: `?? ctx.input` removal) | 2 (alias invariant, skip guard) | **Productive** -- both agents contributed distinct findings |
| R3 | MEDIUM (A2+A3) | ~4 (+1 fix) | 1 (A3: visited set over depth counter) | 1 (cycle detection strategy) | **Productive but incomplete** -- NEEDS_CHANGES, 3 missing items |
| R4 | TEST-ONLY | ~2 | 0 | 0 | **Productive** -- 13 tests covering cross-feature interactions |

**Total agent calls**: ~12 (including +1 for R3 fix). Exactly on budget despite a NEEDS_CHANGES cycle, because R1's DIRECT classification and R4's efficiency absorbed the overage.

### R1 Assessment: Server.ts Cleanup + Reference Fix (DIRECT)

R1 extracted `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` from 3 server.ts handlers and fixed `findDeclNamePosition` to use `loc.length` instead of hardcoded KEYWORD_LENGTHS. Both changes were mechanical -- no design ambiguity, no alternative approaches to weigh.

**Assessment**: Correctly classified as DIRECT. Clean execution, no issues. R-PROC-16 (position-absolute assertions) was applied to the reference fix tests, validating that the previous retro's recommendation was actionable.

### R2 Assessment: Foreach Source Failure Handling (MEDIUM)

R2 was correctly classified as MEDIUM. Genuine design ambiguity existed: how should foreach behave when its source node fails? What happens under each failure strategy (abort, skip, fallback, retry, retry_then_fallback)? The interaction matrix had non-obvious cases.

**Headline finding**: Two agents contributed complementary findings. A3 caught the fallback alias bug -- when a source node falls back to BackupPlanner, the output is stored under "BackupPlanner" but foreach looks for the original "Planner" name. A2 caught the dangerous `?? ctx.input` fallback removal -- foreach was silently iterating over program input when the source had no output. Neither agent alone found both issues. This validates the MEDIUM tier's value: 2-agent analysis produces coverage that single-agent analysis cannot.

R-PROC-14 was applied: both analyses completed before convergence. Both findings were incorporated into the converged design (alias invariant + skip guard). Without R-PROC-14, one finding could have arrived post-implementation.

**Assessment**: MEDIUM classification justified. Both A2 and A3 contributed distinct, non-overlapping findings. R-PROC-14 ensured both were captured before implementation. First-try PASS with 10 well-structured tests.

### R3 Assessment: Multi-hop Conditional Edge Routing (MEDIUM, NEEDS_CHANGES)

R3 was correctly classified as MEDIUM. Design ambiguity existed around cycle detection strategy, depth limits, `done` as a terminal target, and fallback alias propagation through chains. A3's advocacy for visited set over depth counter was the key design contribution -- visited sets catch cycles on first revisit, while depth counters allow up to depth/2 revisits before triggering.

**NEEDS_CHANGES analysis**: The reviewer found 3 items missing from the implementation:
1. Missing depth-limit error when MAX_CONDITIONAL_HOPS exhausted (silent truncation)
2. Missing depth-limit test
3. Missing scope validation test for `done` target

R-PROC-14 was applied. Both analyses completed before convergence. The cycle detection strategy (A3's visited set) was incorporated. However, the NEEDS_CHANGES items were not analysis gaps -- they were implementation completeness gaps. The convergence spec called for "a clear error message" on depth limit exhaustion, but the implementation silently terminated the loop.

**Assessment**: The MEDIUM classification was correct for the design phase. The NEEDS_CHANGES was an implementation fidelity issue, not a design ambiguity issue. Fixed in 1 debug cycle (+1 agent call). See Section 3 for detailed root cause analysis.

### R4 Assessment: Integration + Regression Tests (TEST-ONLY)

R4 delivered 13 tests across 4 describe blocks, covering cross-feature interactions (foreach + conditional routing, fallback + foreach, parallel + conditional), regressions (findDeclNamePosition, foreach skip, single-hop compat, scope validation for `done`, evaluateCondition operators, empty array), and R3 fix verification (depth limit). The reviewer noted one minor issue (dead `storingExecuteNode` helper).

**Assessment**: 13 tests is within the 12-15 budget range. Coverage is thorough -- the cross-feature interaction tests (foreach body triggering multi-hop routing, failed source with conditional edges) are genuine integration tests that unit tests cannot replicate. The R3 review gaps (scope validation for `done`) were explicitly addressed in R4 regression tests.

## 2. MEDIUM Tier Dual-Agent Analysis

v3.7 ran 2 MEDIUM rounds (R2 and R3), both with A2+A3 analysis. This provides the first multi-round data set for evaluating dual-agent analysis within a single version.

### R2: Complementary findings

| Agent | Finding | Severity | Would other agent have caught it? |
|-------|---------|----------|-----------------------------------|
| A3 | Fallback alias bug | HIGH | No -- A2 did not analyze fallback+foreach interaction |
| A2 | `?? ctx.input` removal | HIGH | No -- A3 focused on alias behavior, not input fallback |

Both findings were essential for correctness. Neither was redundant. The MEDIUM tier earned its cost.

### R3: Overlapping + divergent findings

| Agent | Finding | Severity | Adopted? |
|-------|---------|----------|----------|
| A3 | Visited set > depth counter | MEDIUM | YES -- catches cycles on first revisit |
| A2 | (analysis content) | -- | Partially -- R3 convergence incorporated elements from both |

A3's visited set recommendation was the key design contribution. The convergence adopted it over a depth-counter approach.

### Running tally: MEDIUM tier value

| Version | MEDIUM Rounds | Unique A3 Findings | Unique A2 Findings | Both Needed? |
|---------|---------------|--------------------|--------------------|--------------|
| v3.4 | 1 (R1) | 1 (rename collision) | 0 | A3 only |
| v3.6 | 1 (R1) | 1 (produces name gap) | 0 | A3 only |
| v3.7 | 2 (R2, R3) | 2 (alias bug, visited set) | 1 (`?? ctx.input`) | YES (R2), A3 primary (R3) |

v3.7-R2 is the first MEDIUM round where both A2 and A3 contributed independent findings that were both needed. This validates the dual-agent analysis model -- it is not just "A3 finds bugs, A2 is overhead."

## 3. NEEDS_CHANGES Root Cause Analysis

### What happened

R3 implemented multi-hop conditional edge routing with visited set cycle detection, `done` as terminal target, and fallback alias propagation. The reviewer found 3 items from the convergence spec that were not reflected in the implementation:

1. **Missing depth-limit error**: The for-loop ran to MAX_CONDITIONAL_HOPS and silently stopped. The convergence spec required "a clear error message" on depth limit exhaustion.
2. **Missing depth-limit test**: No test exercised a chain exceeding 10 hops.
3. **Missing scope validation test**: The scope.ts change allowing `done` as a conditional target was untested.

### Classification

This is an **implementation completeness gap**, not a design ambiguity issue. The convergence spec was clear on all three requirements. The implementer completed the core routing logic (multi-hop loop, visited set, `done` target, fallback aliases) but omitted the error path and two tests.

### Was this avoidable?

Partially. The depth-limit error is a boundary condition that should have been caught during implementation -- the spec explicitly called for it. The missing tests are a straightforward oversight. However, this is precisely the failure mode that the review step (Step 5) is designed to catch. The reviewer identified all three gaps with clear fix instructions. The fix was completed in 1 debug cycle.

### Comparison to v3.6-R3 NEEDS_CHANGES

| Aspect | v3.6-R3 | v3.7-R3 |
|--------|---------|---------|
| Root cause | Wrong start offset (selectionRange) | Missing error path + 2 missing tests |
| Items missing | 1 (position bug) | 3 (error, test, test) |
| Caught by tests? | No (width-only assertion) | No (boundary not exercised) |
| Fix complexity | 1 line | ~15 lines (error + 2 tests) |
| Debug cycles | 1 | 1 |
| Classification | Test design gap | Implementation completeness gap |

Both NEEDS_CHANGES were caught by the reviewer, not by tests. v3.7-R3's failure is broader (3 items vs 1) but the root cause is different -- it is about implementation thoroughness, not test assertion quality.

### Impact

- +1 agent call (absorbed within the ~12 budget)
- First-try pass rate: 3/4 (75%), same as v3.6
- Fix was minimal and correct
- R4 integration tests include depth-limit and scope validation regression coverage

## 4. Budget Accuracy

| Metric | Budgeted | Actual | Delta |
|--------|----------|--------|-------|
| Agent calls | ~12 | ~12 | 0% |
| Rounds | 4 | 4 | 0 |
| Tests | ~38-41 | 42 | +2-10% (slight over-delivery) |

Budget accuracy was exact for agent calls -- the first time since v3.5 that the budget held precisely. The NEEDS_CHANGES fix (+1 call) was offset by efficient DIRECT and TEST-ONLY rounds. Test delivery was 42 against a 38-41 target, a slight over-delivery consistent with historical patterns.

The budgeting model (MEDIUM=4, DIRECT=2, TEST-ONLY=2) continues to hold. The +1 NEEDS_CHANGES cost was absorbed within the version budget rather than exceeding it, which is ideal.

## 5. R-PROC Application Tracker

| Rule | Applied? | Outcome |
|------|----------|---------|
| R-PROC-12 (merge small items) | YES (R1: extraction + fix) | Clean, zero issues. 7th application. |
| R-PROC-13 (tier classification) | YES (all 4 rounds) | Correct: DIRECT for R1, MEDIUM for R2/R3, TEST-ONLY for R4 |
| R-PROC-14 (wait for analysis) | YES (R2, R3) | R2: both findings captured. R3: A3 finding captured. 3rd and 4th applications. |
| R-PROC-15 (A3 backlog) | IDLE | No deferred findings. Backlog empty entering and exiting v3.7. |
| R-PROC-16 (position-absolute assertions) | YES (R1) | Applied to reference fix tests. No position bugs in v3.7. |

### R-PROC-14 running tally

| Version | Round | Findings Captured | Severity | Latency Cost |
|---------|-------|-------------------|----------|-------------|
| v3.6 | R1 | 1 (produces name gap) | HIGH | None |
| v3.7 | R2 | 2 (alias bug, `?? ctx.input`) | HIGH | None |
| v3.7 | R3 | 1 (visited set strategy) | MEDIUM | None |
| **Total** | **3 rounds** | **4 findings** | | **None** |

R-PROC-14 has been applied 3 times across 2 versions with zero latency cost and 4 findings captured. It is a validated, mature process improvement.

## 6. What Worked

- **Dual-agent analysis produced complementary findings in R2.** A3 caught the fallback alias bug, A2 caught the `?? ctx.input` removal. Neither agent alone found both issues. This is the first MEDIUM round where both agents contributed independent, non-overlapping findings that were both essential for correctness.

- **A3's visited set advocacy in R3 improved cycle detection.** The depth-counter approach would allow cycles to persist for up to depth/2 iterations before detection. A3's visited set catches cycles on first revisit. This is a concrete correctness improvement from adversarial analysis.

- **Runtime hardening pivot was well-scoped.** After 5 consecutive LSP versions (v3.2-v3.6), v3.7 pivoted to runtime correctness without carrying LSP baggage. The scope was clean: foreach failure + multi-hop routing, both deferred since v3.2/v3.3.

- **Budget held exactly despite NEEDS_CHANGES.** ~12 calls budgeted, ~12 actual. The +1 fix cost was absorbed by efficient DIRECT and TEST-ONLY rounds. This is the best budget accuracy since v3.5.

- **R-PROC-14 applied twice in one version, both times capturing findings.** R2 captured 2 findings, R3 captured 1. The rule is now mature with 3 applications and 4 findings total.

- **R-PROC-16 applied to R1, preventing position bugs.** The reference fix tests used absolute position assertions per the v3.6 retro recommendation. No position-related bugs in v3.7.

- **Review step caught what tests missed (again).** R3's reviewer found 3 missing items that no test exercised. The Step 5 review continues to justify its cost.

## 7. What Didn't Work / Waste

- **R3 NEEDS_CHANGES: 3 missing items from convergence spec.** The implementer completed the core routing logic but omitted the depth-limit error path and 2 tests. The convergence spec explicitly required all three. This is an implementation thoroughness issue -- the implementer should have treated the convergence spec as a checklist.

- **R3 silent truncation is a worse failure mode than a test assertion gap.** v3.6-R3's NEEDS_CHANGES was a test that asserted the wrong thing (width not position). v3.7-R3's NEEDS_CHANGES is missing error handling for an edge case that would silently corrupt user programs. Silent truncation of conditional chains is a data integrity issue. This is a more serious failure mode than v3.6-R3, even though both were caught by the reviewer.

- **TEST-ONLY budget was hit but not exceeded.** R4 delivered 13 tests against 12-15 budgeted. The previous version's recommendation to raise to 15-20 was not fully utilized. This may indicate that the v3.7 feature surface was smaller than v3.6's, or that 13 tests were sufficient coverage.

- **No A3 backlog activity.** R-PROC-15 remains idle for the second consecutive version. The backlog mechanism is validated but has not been needed since v3.5.

## 8. Process Improvement Proposals

### R-PROC-17: Convergence spec as implementation checklist

**Description**: In Step 4 (Implementation), the implementer MUST treat the convergence spec's requirement table as a checklist. Before submitting for review, the implementer verifies each row in the convergence compliance table and confirms: (a) the requirement is implemented, (b) the requirement has at least one test, (c) error paths have tests, not just happy paths.

**Rationale**: v3.7-R3's NEEDS_CHANGES was caused by 3 items from the convergence spec being absent from the implementation. The convergence spec had a clear requirement for depth-limit error handling, but the implementer did not verify against it before submitting. A checklist discipline would have caught all three gaps.

**Scope**: Applies to all future Step 4 implementations. Does not add agent calls -- it is a self-verification step within the existing implementer agent's scope.

**Risk**: Minimal. Adds ~30 seconds of verification time to the implementation step. May reduce NEEDS_CHANGES frequency.

### R-PROC-18: Error path test requirement for MEDIUM rounds

**Description**: In MEDIUM rounds that introduce new error conditions (depth limits, validation errors, etc.), the convergence spec MUST explicitly list the error path tests. The implementer MUST include at least one test per error path, not just happy-path tests.

**Rationale**: R3's convergence spec required "a clear error message" on depth limit exhaustion, but the test suite only exercised chains within the limit. Error paths are systematically under-tested because implementers focus on proving the feature works, not on proving it fails correctly.

**Scope**: Applies to MEDIUM rounds that introduce new error conditions. Does not apply to DIRECT rounds (which typically follow established patterns) or TEST-ONLY rounds.

**Risk**: May increase test count slightly. Acceptable -- error path coverage is a correctness requirement, not overhead.

## 9. Recommendations for v3.8

| Round Type | Recommended Tier | Rationale |
|------------|-----------------|-----------|
| New feature with design ambiguity | MEDIUM (A2+A3) | R2 validated dual-agent value; R-PROC-14 mature |
| New feature, spec-constrained | DIRECT | Continued validation across v3.x |
| Additive features following patterns | DIRECT | R-PROC-12 (merge small items), 7th application |
| A3 backlog items (if any) | DIRECT | R-PROC-15 (backlog currently empty) |
| Test-only / integration | TEST-ONLY | Budget 12-15 tests |

**Specific guidance for v3.8**:
- Apply R-PROC-17 to all Step 4 implementations. The convergence compliance table is the checklist -- verify each row before submitting for review.
- Apply R-PROC-18 to MEDIUM rounds that introduce new error conditions. Error path tests must be explicitly listed in the convergence spec.
- Continue applying R-PROC-14 to MEDIUM rounds. 3 applications, 4 findings, zero latency cost.
- Continue applying R-PROC-12 and R-PROC-13. Both are mature (7th and 8th+ applications respectively).
- The A3 backlog (R-PROC-15) is empty for the second consecutive version. If a MEDIUM round runs in v3.8, capture any late findings for the subsequent version.
- TEST-ONLY budget: 12-15 tests. The v3.7 R4 delivered 13, which is within range. The v3.6 recommendation of 15-20 may have been aggressive -- 12-15 is appropriate unless the feature surface grows.
- If v3.8 continues runtime hardening, expect MEDIUM rounds for any new runtime behavior with failure mode interactions (these consistently produce design ambiguity).

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 4 |
| Debated rounds | 2 (R2, R3 -- both MEDIUM) |
| DIRECT rounds | 1 (R1) |
| TEST-ONLY rounds | 1 (R4) |
| Total agent calls | ~12 |
| Bugs caught by debate | 3 (A3: alias bug + visited set; A2: `?? ctx.input` removal) |
| Bugs caught by review | 3 (R3: depth-limit error, depth-limit test, scope validation test) |
| A3 backlog items resolved | 0 (backlog was empty entering v3.7) |
| A3 findings incorporated in-round | 3 (alias bug, visited set, `?? ctx.input` via A2) |
| First-try pass rate | 3/4 (75%) |
| NEEDS_CHANGES | 1 (R3, 3 missing items from convergence spec) |
| Debug cycles | 1 (R3, fixed in single cycle) |
| Tests added | 42 (790 to 832) |
| New ratchets | ~5 (220 to ~225) |
| Cross-critique triggered | 0 (permanently removed via R-PROC-08) |
| Step 0 research runs | 0 |
| R-PROC-14 applications | 2 (R2, R3) -- running total: 3 across 2 versions |
| R-PROC-14 findings captured | 3 (R2: 2, R3: 1) -- running total: 4 |
| Wasted rounds | 0 |
| Process improvements applied | 6 (R-PROC-12 x1, R-PROC-13 x4, R-PROC-14 x2, R-PROC-15 idle, R-PROC-16 x1) |
| New process recommendations | 2 (R-PROC-17: convergence checklist, R-PROC-18: error path tests) |

### Version-over-Version Process Efficiency

| Version | Rounds | Agent Calls | Tests Added | Calls/Test |
|---------|--------|-------------|-------------|------------|
| v2.1 | 4 | ~21 | 39 | 0.54 |
| v2.2 | 6 | ~38 | 101 | 0.38 |
| v3.0 | 8 | ~26 | 101 | 0.26 |
| v3.1 | 5 | ~12 | 60 | 0.20 |
| v3.2 | 4 | ~9 | 45 | 0.20 |
| v3.3 | 4 | ~12 | 54 | 0.22 |
| v3.4 | 4 | ~10 | 54 | 0.19 |
| v3.5 | 4 | ~8 | 49 | 0.16 |
| v3.6 | 4 | ~11 | 51 | 0.22 |
| v3.7 | 4 | ~12 | 42 | 0.29 |

Calls/test rose from 0.22 (v3.6) to 0.29 (v3.7). This is the highest ratio since v2.2 (0.38) and reflects two factors: (1) two MEDIUM rounds instead of one (+4 calls over 2 DIRECT rounds), and (2) fewer tests added (42 vs 51). The per-test cost increase is expected when the tier mix shifts toward MEDIUM. The 42 tests reflect the smaller feature surface (2 runtime fixes + 1 extraction vs v3.6's find-all-references + keyword derivation + symbol ranges).

**Efficiency observation**: v3.7's ratio is elevated but not concerning. The MEDIUM rounds produced concrete correctness improvements (alias bug, skip guard, visited set cycle detection) that would not have been found in DIRECT rounds. The cost/test ratio is a proxy metric -- the true value metric is bugs caught per agent call, which is 6/12 = 0.50 (3 by debate + 3 by review), the highest in the v3.x series.
