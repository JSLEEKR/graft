# v3.4 Process Retrospective

## Summary

v3.4 ran 4 rounds: R1 (MEDIUM, A2+A3 debate), R2 (DIRECT), R3 (DIRECT), R4 (TEST-ONLY). ~10 agent calls total (vs 10 budgeted). 54 new tests (636 to 690), all passing. 100% first-try pass rate (4/4). No NEEDS_CHANGES verdicts. This version applied R-PROC-13 (tighten MEDIUM criteria to require design ambiguity), R-PROC-12 (merge small rounds), and R-PROC-11 (pre-round tech debt verification). R-PROC-13 was directly validated: R2 and R3 introduced new behavior but were correctly classified as DIRECT because the spec constrained the design, saving ~4 agent calls vs MEDIUM classification.

---

## 1. Per-Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | MEDIUM (A2+A3) | ~4 | 0 | 3 (word-boundary regex, workspace cache cross-file, conflict detection) | **Productive** — design ambiguity in cross-file rename justified debate |
| R2 | DIRECT | ~2 | 0 | 0 | **Efficient** — R-PROC-12 validated, two items merged (estimator fix + features split) |
| R3 | DIRECT | ~2 | 0 | 0 | **Efficient** — R-PROC-12 validated again, two items merged (hierarchical symbols + code action extraction) |
| R4 | TEST-ONLY | ~2 | 0 | 0 | Sufficient — 12 cross-cutting integration tests |

**Total agent calls**: ~10. Exactly on budget. The leanest 4-round version with one MEDIUM debate, matching the theoretical minimum (4 + 2 + 2 + 2).

### R1 Debate Value Assessment

R1 introduced LSP rename support — a feature that required design decisions around how to locate references across files, how to handle name conflicts, and what symbols are renameable. This was correctly classified as MEDIUM because:

- Multiple viable approaches existed for reference finding (AST-based vs text-based vs hybrid)
- Cross-file rename required deciding how to leverage the existing workspace export cache vs building new infrastructure
- Conflict detection semantics were not fully prescribed by the spec

The debate converged on text-based word-boundary regex (`\b`) for reference finding, reuse of the workspace export cache for cross-file discovery, and explicit conflict detection against existing declarations. These were reasonable design choices that resolved genuine ambiguity.

**However**: A3-Skeptic's analysis completed late (after implementation had already proceeded) and identified several issues that were not incorporated:
1. Comment and string matching — `\b` regex matches names inside comments and string literals
2. CRLF handling — potential line ending issues in text scanning
3. newName validation — insufficient validation of the replacement name
4. Import path matching — regex could match names within import path strings

**Assessment**: The debate was productive for the core design, but the late A3 completion meant its adversarial value was partially lost. This is a process gap — see Section 6.

### R2 Efficiency Validation

R2 merged conditional edge estimation (min/max branch cost in TokenEstimator) with the features.ts split into 8 modules. Both items were spec-constrained: the estimation formula was prescribed (best=min, worst=max), and the split was mechanical refactoring following the existing module pattern.

**Assessment**: R-PROC-13 correctly classified this as DIRECT despite introducing new estimator behavior. The spec left no design ambiguity. R-PROC-12 correctly merged two items that would have been wasteful as separate rounds. Zero quality issues.

### R3 Efficiency Validation

R3 merged hierarchical document symbols (fields as SymbolKind.Field, flow nodes as SymbolKind.Function) with code action extraction (buildAutoImportActions pure function). Both followed established LSP patterns.

**Assessment**: Both R-PROC-12 and R-PROC-13 validated again. The hierarchical symbols followed the existing getDocumentSymbols pattern, and the code action extraction was mechanical refactoring. No debate needed.

## 2. Process Improvements Applied

### R-PROC-13: Tighten MEDIUM criteria — require design ambiguity

First full application in v3.4. R2 (new estimator behavior) and R3 (new symbol hierarchy) would have been MEDIUM under the old criteria ("new subsystem interaction triggers MEDIUM"). Under R-PROC-13, both were classified as DIRECT because the spec tightly constrained the design.

**Result**: Savings of ~4 agent calls (2 rounds x 2 saved calls each). Zero quality issues in either round. Both implementations passed review on first try.

**Running tally**: R-PROC-13 applied to 2 rounds (v3.4-R2, v3.4-R3) with positive outcomes in both. The refinement question — "Does this round have more than one viable implementation approach?" — was answered "no" for both, and that answer was correct.

**Verdict**: R-PROC-13 is validated. The design ambiguity criterion is a reliable discriminator between rounds that benefit from debate and those that do not.

### R-PROC-12: Merge single-item rounds

Applied to both R2 and R3, each combining two items that would previously have been separate rounds.

**Running tally**: R-PROC-12 has now been applied 3 times (v3.3-R3, v3.4-R2, v3.4-R3) with zero quality issues across all applications. Cumulative savings: ~6 agent calls.

**Verdict**: R-PROC-12 is a mature, validated optimization. No further refinement needed.

### R-PROC-11: Pre-round tech debt verification

No tech debt round was scoped for v3.4, so R-PROC-11 was trivially satisfied (same as v3.3). The orchestrator verified the backlog before scoping and found no outstanding items requiring a dedicated round.

**Verdict**: R-PROC-11 remains untested under pressure. It has been trivially satisfied for 2 consecutive versions. This is not a concern — it simply means the codebase is not accumulating tech debt faster than it is resolved through normal development.

## 3. Budget Accuracy

| Metric | Budgeted | Actual | Delta |
|--------|----------|--------|-------|
| Agent calls | 10 | ~10 | 0% |
| Rounds | 4 | 4 | 0 |
| Tests | ~50-60 | 54 | On target |

Budget accuracy was exact for the third consecutive version (v3.2: -10%, v3.3: 0%, v3.4: 0%). The budgeting model is well-calibrated: 4 calls for MEDIUM, 2 calls for DIRECT, 2 calls for TEST-ONLY.

## 4. Tier Calibration

### DIRECT tier streak: 17 consecutive no-debate rounds, 0 failures

| Version | DIRECT Rounds | TEST-ONLY Rounds | Failures |
|---------|---------------|-------------------|----------|
| v3.0 | R5, R6, R7, R8 | — | 0 |
| v3.1 | R2, R3, R4 | R5 | 0 |
| v3.2 | R2, R3 | R4 | 0 |
| v3.3 | R3 | R4 | 0 |
| v3.4 | R2, R3 | R4 | 0 |
| **Total** | **12** | **5** | **0** |

The no-debate streak extends to 17 rounds across 5 versions. R-PROC-13 added 2 rounds to the streak that would have been MEDIUM under the old criteria, with no quality loss.

### MEDIUM tier analysis

v3.4 ran one MEDIUM round (R1), down from two in v3.3. R-PROC-13 correctly prevented R2 and R3 from being classified as MEDIUM. R1's debate was productive — it resolved genuine design ambiguity around reference finding approach and cross-file rename mechanics.

**Observation**: The MEDIUM tier is now reserved for rounds with genuine design ambiguity. This is the correct calibration. The one concern is A3-Skeptic completing after implementation (see Section 6).

## 5. What Worked

- **R-PROC-13 validated on first full application.** Two rounds correctly classified as DIRECT despite introducing new behavior. ~4 agent calls saved with zero quality cost. The "multiple viable approaches?" question is an effective discriminator.
- **R-PROC-12 applied twice in one version.** Both R2 and R3 merged two items each. Zero quality issues across both. The merge criterion is reliable and should be applied by default during round scoping.
- **Budget accuracy at 0% variance for third time.** The MEDIUM=4, DIRECT=2, TEST-ONLY=2 formula is precisely calibrated. No adjustment needed.
- **100% first-try pass rate extends to 17/17** across v3.2-v3.4. No NEEDS_CHANGES verdicts in 3 consecutive versions (and 4 if including v3.1).
- **features.ts split was correctly scoped as DIRECT.** An 8-module split is substantial refactoring, but it was mechanical (no design decisions) and passed cleanly. This validates that mechanical complexity alone does not warrant debate — only design ambiguity does.
- **Cross-file rename leveraged existing infrastructure.** The workspace export cache (introduced in v3.3 for code actions) was reused for rename cross-file discovery, demonstrating good architectural layering from prior versions.

## 6. What Didn't Work / Waste

- **A3-Skeptic completed after implementation in R1.** The late completion meant A3's analysis of collectRenameLocations — identifying comment/string matching, CRLF handling, newName validation, and import-path matching issues — was not incorporated into the implementation. These are real concerns:
  - `\b` regex matches names inside comments (`// rename this_name here`) and strings (`"name"`)
  - No validation that `newName` is a legal Graft identifier
  - Import path strings could contain matches (`import { name } from "./name.gft"` — the path `"./name.gft"` contains `name`)

  **Root cause**: The MEDIUM tier runs A2 and A3 in parallel with the merged convergence+implementation step. If A3 takes longer to complete, implementation proceeds without its findings. The current process assumes both agents complete before convergence begins, but does not enforce this.

  **Impact**: The unaddressed A3 findings represent latent bugs in the rename feature. They are not critical (rename is an editor convenience, not a compilation correctness issue), but they are real.

- **No mechanism to surface late-arriving analysis.** When A3 completes after implementation, its findings are recorded in harness artifacts but not fed back into the implementation. There is no "late findings" feedback loop.

- **17-round first-try streak may mask conservative scoping.** The same concern raised in v3.3 continues. A 100% pass rate across 4 versions (17 rounds) could mean the process avoids scope that would challenge the no-debate tiers. This is efficient but may leave value on the table.

## 7. Process Improvement Proposals

### R-PROC-14: Enforce analysis completion before convergence in MEDIUM rounds

**Description**: In MEDIUM rounds, the orchestrator must wait for all analysis agents (A2 and A3) to complete before starting the convergence+implementation step. If an agent has not completed within a reasonable window, the orchestrator proceeds but logs the gap and creates a follow-up item for the next round.

**Rationale**: v3.4-R1 demonstrated that late A3 completion causes adversarial findings to be lost. The entire purpose of the MEDIUM tier is to get A3-Skeptic's analysis before implementation. If A3 completes after implementation, the debate cost (~2 extra agent calls) is spent without the debate benefit.

**Implementation**: The merged Step 3+4 agent is not dispatched until both Step 1 agents have returned their outputs. This is how the process was designed (Step 1 outputs feed into Step 3), but the orchestrator must enforce the dependency rather than allowing parallel execution of analysis and implementation.

**Risk**: Adds latency if A3 is slow. Mitigated by the fact that A2+A3 analysis typically completes quickly (the bottleneck is usually convergence+implementation, not analysis).

**Follow-up mechanism**: If A3 findings arrive late and identify real issues, those issues are added to the next version's backlog as targeted fixes. This prevents findings from being silently dropped.

### R-PROC-15: Late-analysis backlog for unaddressed A3 findings

**Description**: When A3-Skeptic findings are identified but not incorporated (due to timing or scope), they are explicitly recorded in common_memory under a "Deferred A3 Findings" section with the originating round. These items are reviewed during the next version's round scoping and either addressed in an early round or explicitly deprioritized with justification.

**Rationale**: v3.4-R1 produced 4 specific A3 findings (comment/string matching, CRLF, newName validation, import-path matching) that were not incorporated. Without an explicit tracking mechanism, these findings exist only in harness artifacts and may be forgotten.

**Known items to seed the backlog**:
- v3.4-R1-A3-01: collectRenameLocations matches names inside comments and strings
- v3.4-R1-A3-02: CRLF line ending handling in text-based scanning
- v3.4-R1-A3-03: newName validation (legal Graft identifier check)
- v3.4-R1-A3-04: Import path string false matches in rename

## 8. Recommendation for v3.5 Tier Assignments

Based on v3.4 outcomes, R-PROC-13 validation, and the late-analysis finding:

| Round Type | Recommended Tier | Rationale |
|------------|-----------------|-----------|
| New subsystem with design ambiguity | MEDIUM (A2+A3) | Debate needed; enforce analysis completion (R-PROC-14) |
| New feature, spec-constrained | DIRECT | R-PROC-13 validated across 2 rounds, 0 failures |
| Additive features following patterns | DIRECT | 17-round streak validates no-debate approach |
| Multi-item small features | DIRECT (merged) | R-PROC-12 validated across 3 applications |
| Targeted fixes for deferred A3 findings | DIRECT | R-PROC-15: address rename edge cases from v3.4-R1 |
| Mechanical refactoring / tech debt | DIRECT | Verify items exist first (R-PROC-11) |
| Test-only / integration | TEST-ONLY | Confirmed as closing round |

**Specific guidance for v3.5**:
- Consider an early DIRECT round to address the 4 deferred A3 findings from v3.4-R1 rename (R-PROC-15). These are small, targeted fixes that follow the existing implementation pattern.
- If v3.5 introduces a new LSP feature with design ambiguity (e.g., refactoring support, workspace-wide analysis), classify as MEDIUM and apply R-PROC-14 (wait for A3 before convergence).
- If v3.5 adds LSP features following the established features/ module pattern, classify as DIRECT.
- Continue applying R-PROC-12 to merge small items. Both R2 and R3 in v3.4 demonstrate that two-item DIRECT rounds work reliably.
- Continue applying R-PROC-13. The spec-ambiguity question is a reliable gate.

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 4 |
| Debated rounds | 1 (R1) |
| DIRECT rounds | 2 (R2, R3) |
| TEST-ONLY rounds | 1 (R4) |
| Total agent calls | ~10 |
| Bugs caught by debate | 0 |
| Late A3 findings (not incorporated) | 4 (comment/string matching, CRLF, newName validation, import-path matching) |
| First-try pass rate | 4/4 (100%) |
| NEEDS_CHANGES | 0 |
| Tests added | 54 (636 to 690) |
| New ratchets | 10 (200 total, 0 unlocked) |
| Cross-critique triggered | 0 (permanently removed via R-PROC-08) |
| Step 0 research runs | 0 |
| DIRECT tier streak | 17 consecutive no-debate rounds, 0 failures |
| Wasted rounds | 0 |
| Process improvements applied | 3 (R-PROC-13 validated, R-PROC-12 x2, R-PROC-11 trivial) |
| New process recommendations | 2 (R-PROC-14, R-PROC-15) |

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

Calls/test dropped to 0.19, a new floor. This validates R-PROC-13: by correctly classifying R2 and R3 as DIRECT instead of MEDIUM, the version achieved the same test output with fewer agent calls. The previous 0.20 floor (v3.1, v3.2) was set before R-PROC-13 existed. The 0.19 ratio is likely near the theoretical minimum for a version that includes at least one MEDIUM round (4 calls minimum for design debate + 2 per additional round).
