# v3.6 Process Retrospective

## Summary

v3.6 ran 4 rounds: R1 (MEDIUM), R2 (DIRECT), R3 (DIRECT), R4 (TEST-ONLY). ~11 agent calls total (vs ~10 budgeted, +10% due to R3 NEEDS_CHANGES). 51 new tests (739 to 790), all passing. 3/4 first-try pass rate — R3 received NEEDS_CHANGES for a selectionRange bug, ending the 24-round first-try streak that had run since v3.1-R1. This is the first NEEDS_CHANGES since v3.1 (when the streak began) and the first debated round (MEDIUM) since v3.4-R1. R-PROC-14 (enforce analysis completion before convergence) received its first real test in R1: A3-Skeptic completed before convergence and its HIGH-severity finding (produces name gap in isRenameable) was incorporated into the converged design. R-PROC-14 is now validated.

---

## 1. Per-Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | MEDIUM (A2+A3) | ~4 | 1 (A3: produces name gap) | 1 (isReferable broader than isRenameable) | **Productive** — R-PROC-14 validated, A3 finding incorporated |
| R2 | DIRECT | ~2 | 0 | 0 | **Efficient** — R-PROC-12 applied (keyword derivation + parse-based conflicts merged) |
| R3 | DIRECT | ~3 | 1 (reviewer: selectionRange bug) | 0 | **Productive but flawed** — NEEDS_CHANGES, bug in implementation not caught by tests |
| R4 | TEST-ONLY | ~2 | 0 | 0 | **Productive** — 20 tests, above the 12-15 budget |

**Total agent calls**: ~11. One over budget (10 budgeted). The overage is entirely from R3's NEEDS_CHANGES cycle (+1 fix call). Without the R3 bug, this version would have been exactly on budget at ~10.

### R1 Assessment: Find All References (MEDIUM)

R1 was correctly classified as MEDIUM per R-PROC-13 — genuine design ambiguity existed around whether to build a separate reference finder or reuse collectRenameLocations, how to handle includeDeclaration, whether to scan all workspace files or only importers, and whether produces names should be referable (they are not renameable). The debate resolved all four questions.

The headline event: **R-PROC-14's first real test**. A3-Skeptic completed analysis before convergence began, and its HIGH-severity finding — that `isRenameable` excludes produces names but find-all-references should include them — was directly incorporated. The converged design introduced `isReferable` as a superset of `isRenameable`, checking 5 ProgramIndex maps instead of 4. Without R-PROC-14 enforcement, this finding could have arrived after implementation (as happened in v3.4-R1), creating another deferred backlog item.

**Assessment**: The MEDIUM classification was justified. The debate produced a concrete design change (isReferable vs isRenameable). R-PROC-14 ensured the adversarial finding was captured before implementation, not after. This round demonstrates the value of the MEDIUM tier when genuine ambiguity exists.

### R2 Assessment: Keyword Unification + Conflict Fix (DIRECT)

R2 merged two spec-constrained items: deriving GRAFT_KEYWORDS from the lexer's KEYWORDS constant (eliminating hardcoded duplication) and replacing regex-based cross-file conflict detection with Parser+ProgramIndex-based detection. Both items had clear specifications with no multiple viable approaches.

**Assessment**: R-PROC-12 (merge small items) and R-PROC-13 (DIRECT=no ambiguity) both correctly applied. The reviewer noted "clean derivation pattern" and "robust cross-file conflict detection." Zero issues found. Sixth successful application of R-PROC-12.

### R3 Assessment: Symbol Range + Rename Polish (DIRECT, NEEDS_CHANGES)

R3 is the version's process failure. The implementation set selectionRange to start at the keyword position instead of the name position. The tests checked width and containment but not absolute position, so they passed despite the bug. The reviewer caught the discrepancy between the convergence requirement ("selectionRange is name only") and the implementation.

**Root cause analysis**: The test was insufficient — it verified that `selectionRange.end.character - selectionRange.start.character === name.length` (width correct) but did not assert that `selectionRange.start.character` was at the name's offset, not the keyword's offset. This is a test design gap, not an implementation complexity gap.

**Why DIRECT classification was still correct**: The bug was not caused by design ambiguity — the spec clearly stated "selectionRange = name only." It was a mechanical implementation error (using the wrong start offset) combined with a weak test assertion. A MEDIUM tier debate would not have prevented this; the fix was a one-line change. The NEEDS_CHANGES cycle cost 1 extra agent call, which is the correct remediation cost for a single implementation error.

**Assessment**: The NEEDS_CHANGES verdict was correct and the fix was minimal. The 24-round streak ending here is not a process failure — it is the review step working as designed. The deeper lesson is about test assertion quality (see Section 7).

### R4 Assessment: Integration + Regression Tests (TEST-ONLY)

R4 delivered 20 tests against a 12-15 budget (33-67% over-delivery). The tests covered cross-feature consistency (findReferences count matches rename edit count), cross-file operations, and R3 fix verification. The reviewer noted "No duplication with R1-R3 unit tests" and praised the shared FULL_GFT fixture.

**Assessment**: R4 continues the pattern of TEST-ONLY rounds over-delivering. The 20-test output reflects the larger surface area from R1-R3 features. The 12-15 budget (raised from 10 per v3.5 retro recommendation) is still conservative.

## 2. R-PROC-14 Validation Analysis

R-PROC-14 was proposed in the v3.4 retro after A3-Skeptic's analysis completed after implementation in v3.4-R1, causing 4 findings to be deferred to v3.5's backlog. The rule: in MEDIUM rounds, wait for all analysis agents to complete before starting convergence+implementation.

**v3.6-R1 test results**:

| Aspect | Outcome |
|--------|---------|
| A3 completed before convergence? | YES |
| A3 finding severity | HIGH (produces name gap) |
| Finding incorporated into converged design? | YES (isReferable function) |
| Would finding have been lost without R-PROC-14? | LIKELY — same failure mode as v3.4-R1 |
| Extra latency from waiting? | NONE observed |

**Counterfactual**: Without R-PROC-14, the produces name gap could have been discovered post-implementation, requiring either a fix cycle (like R3's NEEDS_CHANGES) or deferral to a future version's backlog (like v3.4-R1's A3 findings deferred to v3.5). Instead, the finding was incorporated into the initial implementation at zero additional cost.

**Verdict**: R-PROC-14 is validated. It prevented the exact failure mode it was designed to address. The rule should remain active for all future MEDIUM rounds.

**Running tally**: R-PROC-14 applied 1 time (v3.6-R1), 1 HIGH finding captured. No latency cost.

## 3. NEEDS_CHANGES Root Cause Analysis

### What happened

R3 implemented `makeSymbol` with selectionRange starting at the keyword position (same as range.start) instead of the name position (keyword + space). The requirement was clear: "selectionRange is name only." The implementation used `character` (keyword start) for both range and selectionRange, when selectionRange should have used `character + loc.length + 1`.

### Why the tests didn't catch it

The selectionRange test asserted:
```
sr.end.character - sr.start.character === name.length
```

This checks **width** but not **position**. Since the selectionRange had the correct width (name.length characters), the test passed. The missing assertion was:
```
sr.start.character === loc.length + 1  // after keyword + space
```

### Classification

This is a **test design gap**, not an implementation complexity issue. The bug is a one-line fix. The test was technically correct (selectionRange did have the right width) but did not fully verify the convergence requirement (selectionRange must start at the name, not the keyword).

### Impact

- 1 extra agent call (+1 to version total, ~10 -> ~11)
- 24-round first-try streak broken
- Fix was minimal and correct
- R4 integration tests include explicit position verification as regression coverage

### Prevention

Test assertions for position-sensitive LSP features (ranges, selectionRange, locations) should verify absolute position, not just relative width. This is a new pattern to watch for in future position-aware implementations. See Section 7 for a proposed process improvement.

## 4. Budget Accuracy

| Metric | Budgeted | Actual | Delta |
|--------|----------|--------|-------|
| Agent calls | ~10 | ~11 | +10% (R3 NEEDS_CHANGES) |
| Rounds | 4 | 4 | 0 |
| Tests | ~42-45 | 51 | +13-21% (over-delivery) |

Budget accuracy was +10% for agent calls, breaking the four-version streak of 0% variance (v3.2-v3.5). The entire overage is attributable to R3's NEEDS_CHANGES (+1 call). Without the bug, the version would have been at exactly 10 calls.

The budgeting model itself remains correctly calibrated: MEDIUM=4, DIRECT=2, TEST-ONLY=2. The +1 for a NEEDS_CHANGES fix is inherent variance, not a model flaw. Test delivery exceeded budget by 13-21%, consistent with the historical pattern of over-delivery.

**Observation**: The budget model does not account for NEEDS_CHANGES remediation. Adding a +1 contingency per DIRECT round would over-budget (most DIRECT rounds pass first try). The correct approach is to accept ~10% variance as the expected range when a NEEDS_CHANGES occurs.

## 5. Tier Calibration

### DIRECT tier streak: broken at 24, restarted

The 24-round first-try streak (spanning v3.0-R5 through v3.6-R2) ended at R3. This is the first NEEDS_CHANGES since v3.1 (where the streak began).

| Version | DIRECT Rounds | TEST-ONLY Rounds | MEDIUM Rounds | Failures |
|---------|---------------|-------------------|---------------|----------|
| v3.0 | R5, R6, R7, R8 | -- | -- | 0 |
| v3.1 | R2, R3, R4 | R5 | -- | 0 |
| v3.2 | R2, R3 | R4 | -- | 0 |
| v3.3 | R3 | R4 | -- | 0 |
| v3.4 | R2, R3 | R4 | -- | 0 |
| v3.5 | R1, R2, R3 | R4 | -- | 0 |
| v3.6 | R2 | -- | -- | 0 |
| **Streak end** | **R3** | | | **1 (selectionRange)** |
| **New streak** | R4 | R4 | R1 | **0** |

The streak ending is not a process concern. A 24-round streak was unusually long and its continuation was not a goal in itself. The review step caught a real bug — this is the system working correctly.

**New streak**: 2 rounds (R1 MEDIUM PASS, R4 TEST-ONLY PASS after R3 fix). R2 also passed first try. Only R3 failed first try.

### MEDIUM tier: first use since v3.4-R1

R1 was the first MEDIUM round since v3.4-R1 (3 versions ago). It produced 1 design change (isReferable) and validated R-PROC-14. The MEDIUM tier remains correctly calibrated for rounds with genuine design ambiguity.

### Is the streak break a classification concern?

No. R3 was correctly classified as DIRECT — the bug was a mechanical implementation error, not a design ambiguity issue. A MEDIUM debate would not have prevented a wrong start offset. The fix was one line. The classification system is working correctly; the failure was in test assertion quality.

## 6. What Worked

- **R-PROC-14 validated on first application.** A3-Skeptic's HIGH-severity finding (produces name gap) was captured before implementation because analysis was enforced to complete before convergence. This prevented the exact failure mode that occurred in v3.4-R1. R-PROC-14 is now a validated process improvement.

- **MEDIUM tier produced concrete value after two DIRECT-only versions.** R1's debate resolved genuine design ambiguity (isReferable vs isRenameable, includeDeclaration semantics, cross-file scope) and generated fresh adversarial analysis. The v3.5 retro's concern about "two consecutive versions without adversarial analysis" was addressed.

- **R-PROC-12 applied again (6th application, zero issues).** R2 merged keyword derivation and parse-based conflict detection. R3 merged symbol range fix and rename field collision guard. Both merges were appropriate.

- **R-PROC-13 correctly classified all 4 rounds.** R1 was MEDIUM (genuine ambiguity). R2 and R3 were DIRECT (spec-constrained). R4 was TEST-ONLY. No under- or over-classification.

- **Review step caught a real bug.** R3's NEEDS_CHANGES verdict identified the selectionRange position error that tests missed. The review step's value is demonstrated precisely by failures like this — it catches what tests don't.

- **TEST-ONLY budget increase worked.** R4 delivered 20 tests against the raised 12-15 budget. The v3.5 retro's recommendation to raise from 10 was correct. Future versions should continue budgeting 15-20.

- **Cross-feature consistency tests.** R4's test 14 (findReferences count matches rename edit count) is a genuine integration test that unit tests cannot replicate. This pattern should be repeated for future cross-feature interactions.

## 7. What Didn't Work / Waste

- **selectionRange test assertion gap.** The R3 test verified width but not absolute position for selectionRange. This allowed a bug to pass testing and be caught only by review. The root cause is that position-sensitive LSP features require position-absolute assertions, not just relative/width assertions.

- **NEEDS_CHANGES broke the 24-round streak.** While the streak ending is not inherently bad (the review caught a real bug), the bug was preventable with a stronger test. The cost was +1 agent call and a process blemish.

- **A3 backlog is empty but no new deferred findings.** R1 generated 1 A3 finding that was immediately incorporated (no deferral needed). R2-R4 had no adversarial analysis. The R-PROC-15 backlog mechanism was not exercised. It remains validated from v3.5 but idle.

- **TEST-ONLY budget still conservative.** R4 delivered 20 tests against 12-15 budgeted. Three consecutive versions of over-delivery (v3.4: 12/12, v3.5: 15/10, v3.6: 20/15) suggest the TEST-ONLY budget should be 15-20.

## 8. Process Improvement Proposals

### R-PROC-16: Position-absolute assertions for LSP range tests

**Description**: When testing LSP features that produce ranges or positions (selectionRange, diagnostic ranges, location ranges, reference locations), tests MUST assert absolute position values, not just width or containment. Specifically:
- Assert `start.character` against the expected column
- Assert `start.line` against the expected line
- Width/containment assertions are additional, not sufficient

**Rationale**: v3.6-R3 demonstrated that width-only assertions pass when the start position is wrong. The selectionRange had correct width (name.length) but started at the keyword instead of the name. The reviewer caught this; the test did not.

**Scope**: Applies to all future LSP test implementations. Existing tests should be audited opportunistically (not a dedicated round).

**Risk**: Slightly more brittle tests (absolute positions change if test fixtures change). Mitigated by using computed expectations (e.g., `keyword.length + 1`) rather than hardcoded column numbers.

### No other new R-PROC items proposed

The existing process improvements (R-PROC-11 through R-PROC-15) are all either validated and active or trivially satisfied. R-PROC-16 is the only new proposal, directly motivated by v3.6-R3's failure mode.

## 9. Recommendations for v3.7

| Round Type | Recommended Tier | Rationale |
|------------|-----------------|-----------|
| New feature with design ambiguity | MEDIUM (A2+A3) | R-PROC-14 validated; apply it |
| New feature, spec-constrained | DIRECT | 24+2 rounds of validation |
| Additive features following patterns | DIRECT | Apply R-PROC-12 (merge small items) |
| A3 backlog items (if any) | DIRECT | R-PROC-15 pattern (backlog currently empty) |
| Test-only / integration | TEST-ONLY | Budget 15-20 tests |

**Specific guidance for v3.7**:
- Apply R-PROC-16 to any round that produces LSP range/position output. Audit R3's selectionRange test as a template for what to avoid.
- Continue applying R-PROC-14 to MEDIUM rounds. Its first test was successful; it should be standard practice.
- Continue applying R-PROC-12 and R-PROC-13. Both are mature and reliable.
- The A3 backlog (R-PROC-15) is empty. If a MEDIUM round runs in v3.7, capture any late findings for the subsequent version.
- Raise TEST-ONLY budget to 15-20 (from 12-15). Three consecutive over-deliveries justify the increase.
- The NEEDS_CHANGES in R3 was an implementation error, not a scoping problem. No change to tier classification rules is needed.

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 4 |
| Debated rounds | 1 (R1, first since v3.4-R1) |
| DIRECT rounds | 2 (R2, R3) |
| TEST-ONLY rounds | 1 (R4) |
| Total agent calls | ~11 |
| Bugs caught by debate | 1 (A3: produces name gap, HIGH) |
| Bugs caught by review | 1 (selectionRange position, R3) |
| A3 backlog items resolved | 0 (backlog was empty entering v3.6) |
| A3 findings incorporated in-round | 1 (produces name gap, via R-PROC-14) |
| First-try pass rate | 3/4 (75%) |
| NEEDS_CHANGES | 1 (R3, selectionRange bug) |
| Tests added | 51 (739 to 790) |
| New ratchets | ~8 (210 to ~220) |
| Cross-critique triggered | 0 (permanently removed via R-PROC-08) |
| Step 0 research runs | 0 |
| Previous DIRECT streak | 24 rounds (broken at R3) |
| New streak | 2 rounds (R1, R4 after R3 fix) |
| Wasted rounds | 0 |
| Process improvements applied | 5 (R-PROC-14 validated, R-PROC-13 x4, R-PROC-12 x2, R-PROC-15 idle, R-PROC-11 trivial) |
| New process recommendations | 1 (R-PROC-16: position-absolute LSP test assertions) |

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

Calls/test rose from 0.16 (v3.5, all-DIRECT) to 0.22 (v3.6), returning to v3.3 levels. This is expected: v3.6 included 1 MEDIUM round (+2 calls over DIRECT) and 1 NEEDS_CHANGES cycle (+1 call). The 0.22 ratio is within the normal range for versions with mixed tiers. The 0.16 floor from v3.5 represents the theoretical minimum for all-DIRECT versions and is not a sustainable baseline when MEDIUM rounds are scoped.

**Efficiency trajectory**: The calls/test ratio has ranged from 0.16 to 0.26 across the v3.x series, with the variation driven entirely by tier mix (MEDIUM count) and NEEDS_CHANGES occurrences. The per-round call cost is at minimum for each tier (MEDIUM=4, DIRECT=2, TEST-ONLY=2). Further efficiency gains require either increasing test output per round or reducing the number of rounds per version.
