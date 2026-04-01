# v3.1 Process Retrospective

## Summary

v3.1 ran 5 rounds: R1 (MEDIUM, debated with A2+A3), R2-R4 (DIRECT), R5 (TEST-ONLY). ~12 agent calls total. 60 new tests (477 to 537), all passing. 100% first-try pass rate (5/5). No NEEDS_CHANGES verdicts. No cross-critique triggered.

This was the first version to apply all four process improvements recommended by the v3.0 retrospective (R-PROC-01 through R-PROC-04), plus two new ones (R-PROC-06 score-gated critique, R-PROC-07 TEST-ONLY tier).

---

## 1. Per-Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | MEDIUM (A2+A3) | ~6 | 1 critical (produces-names-in-reads) | 0 | **High ROI** — adversarial checklist caught a real bug |
| R2 | DIRECT | ~1 | 0 | 0 | Sufficient — established pattern |
| R3 | DIRECT | ~1 | 0 | 0 | Sufficient — established pattern |
| R4 | DIRECT | ~1 | 0 | 0 | Sufficient — established pattern |
| R5 | TEST-ONLY | ~1 | 0 | 0 | Sufficient — integration confirmation |

**Total agent calls**: ~12 (vs ~26 in v3.0, ~21 in v2.1). This is the leanest version yet.

**Key finding**: The single debated round (R1) was the only one that needed debate. R2-R4 followed established patterns (DIRECT tier) and R5 was pure test writing. The tier system is now correctly calibrated.

## 2. DIRECT Tier Validation

R2-R4 all passed first try with zero issues. Combined with v3.0 R5-R8 (also all first-try pass), the DIRECT tier now has **8 consecutive rounds with zero failures**.

| Version | DIRECT Rounds | Failures | Notes |
|---------|---------------|----------|-------|
| v3.0 | R5, R6, R7, R8 | 0 | Accidental validation (context overflow forced it) |
| v3.1 | R2, R3, R4 | 0 | Intentional DIRECT tier |
| v3.1 | R5 (TEST-ONLY) | 0 | Intentional TEST-ONLY tier |
| **Total** | **8 rounds** | **0** | |

**Assessment**: The DIRECT tier is validated. The criteria from R-PROC-01 are correct:
- Mechanical refactoring: no design decisions needed
- Additive features following established patterns: convention handles design
- Test-only rounds: zero design surface

**Risk check**: Could the streak be survivorship bias? Unlikely. These rounds were deliberately scoped to avoid novel abstractions. The test suite (477+ tests before v3.1 started) provides regression coverage. The pattern is: debate handles novelty, DIRECT handles convention.

**Recommendation**: DIRECT tier is confirmed as the default. Reserve debate (MEDIUM/HIGH) for rounds introducing new concepts or touching 3+ subsystems simultaneously.

## 3. Merged Step 3+4 Evaluation

R-PROC-02 merged convergence (Step 3) and implementation (Step 4) for R1. The convergence agent both decided the design and implemented it.

**What worked**:
- Zero context loss between design and implementation. In previous versions, the implementation agent sometimes misinterpreted the convergence spec (e.g., v2.0-R2's entryFile guard deviation). With a single agent, the design intent flows directly into code.
- Reduced agent calls: 1 agent instead of 2 for these steps.
- The convergence agent already wrote implementation-ready code in v2.2 and v3.0 — the merge formalized what was already happening in practice.

**What didn't work**:
- Nothing. No deviations, no misinterpretations, no quality issues.

**Assessment**: Step 3+4 merge is validated. The two-step split was a legacy of the original harness design when convergence reports were prose documents. Now that convergence agents write exact code, the split is pure overhead.

**Recommendation**: Make merged Step 3+4 the permanent default for all tiers. Separate convergence and implementation only if the convergence result is genuinely ambiguous (no such case has occurred since v2.1).

## 4. Adversarial Checklist Evaluation

R-PROC-04 replaced forced dissent with a permanent adversarial checklist in Step 1. In R1, A3-Skeptic used this checklist to identify 10 potential issues:

1. Block comment detection
2. CRLF handling
3. String literal suppression
4. **Produces-names-in-reads bug** (critical — names from `produces:` clauses were missing from completion candidates when used in `reads:`)
5. Various edge cases in LSP completion context detection

**Assessment**: The adversarial checklist is strictly better than forced dissent for this project:

| Dimension | Forced Dissent (v2.0-v3.0) | Adversarial Checklist (v3.1) |
|-----------|---------------------------|------------------------------|
| Bugs found | 0 measurable in v3.0 | 1 critical in R1 |
| Mechanism | Self-rebuttal of own approach | Systematic edge-case scan |
| Agent cost | Requires Step 2 (4 agents) | Runs inside Step 1 (0 extra agents) |
| Activation | Only when cross-critique triggers | Always active |
| Coverage | Depends on dissenter's focus | Covers checklist categories systematically |

The forced dissent mechanism produced diminishing returns because (a) cross-critique was increasingly skipped due to high consensus, and (b) A3-Skeptic's natural adversarial analysis was always more productive than the formal dissenter role. The checklist captures A3's patterns without the overhead.

**Recommendation**: Adversarial checklist is confirmed as the permanent replacement. Update the checklist categories based on v3.1 findings:
- Silent data corruption (type coercion, .join() on objects)
- Missing data sources (produces names, memory names, context names in scope lookups)
- Encoding/platform issues (CRLF, Unicode, Windows paths)
- Backward compatibility breaks
- Error path coverage

## 5. Score-Gated Cross-Critique (R-PROC-06)

In R1, A2-Pragmatist and A3-Skeptic scored within 2 points of each other (threshold for triggering cross-critique). Cross-critique was not triggered.

**Assessment**: Correct decision. A3's adversarial checklist already surfaced the critical bug in Step 1. Cross-critique would have added ~2 agent calls for no additional findings. This is consistent with v2.2 and v3.0 where cross-critique was skipped in all eligible rounds with zero quality loss.

**Running tally**: Cross-critique has been skipped in every eligible round since v2.1-R3 (roughly 15 consecutive skips) with no missed bugs attributable to the skip.

**Recommendation**: Raise the threshold or remove cross-critique entirely. If scores are within 3 points AND the adversarial checklist produced no critical findings, skip cross-critique. Consider removing the mechanism in v3.2 to simplify the process.

## 6. TEST-ONLY Tier (R5)

R5 ran as TEST-ONLY (R-PROC-07), writing integration tests to confirm all v3.1 features work together.

**Did R5 catch any issues?** No new bugs were found. All integration tests passed on the first run. This is the expected outcome — R5 confirms that individually-tested features compose correctly. If R5 had found issues, it would indicate gaps in per-round testing.

**Assessment**: TEST-ONLY is validated as a closing round. Its value is not bug-finding but confidence-building: the integration test suite serves as a regression net for future versions.

## 7. Step 0 (Research) — Permanently Killed

R-PROC-03 killed Step 0 (Research). It was not run in v3.1, continuing the streak from v2.1 onward (~20 rounds without Step 0).

**Assessment**: Correct. The codebase is mature, patterns are established, and common_memory.md provides sufficient context. Research adds value only for genuinely novel subsystems (e.g., adding WASM compilation or a new target platform).

## 8. Recommendations for v3.2

### R-PROC-01 (continued): DIRECT tier as default
DIRECT is now the default tier. The criteria remain:
- No new abstractions introduced
- Additive feature following established pattern
- Mechanical refactoring or test-only

Debate (MEDIUM) reserved for:
- New subsystem introduction
- Design space with multiple viable approaches
- Changes touching 3+ pipeline stages simultaneously

### R-PROC-02 (continued): Merged Step 3+4 as permanent default
No further action needed. The merge is validated.

### R-PROC-05: Context window budget (unchanged)
Maximum 4 debated rounds per version. DIRECT rounds are unlimited. No overflow occurred in v3.1 (only 1 debated round), validating this budget.

### R-PROC-08: Remove cross-critique from process
Cross-critique has been skipped in ~15 consecutive rounds with zero quality cost. The adversarial checklist in Step 1 has replaced its function. Formally remove cross-critique (Step 2) from the process for MEDIUM tier. For HIGH tier (4 agents), retain it as optional but gate on score gap > 3.

### R-PROC-09: Streamline artifact generation
R2-R4 (DIRECT) and R5 (TEST-ONLY) produce no harness artifacts — only code and tests. This is correct. For debated rounds (R1), the only artifacts that matter post-round are the convergence report and the review result. Consider reducing Step 1 artifacts to a single structured analysis per agent (not a full markdown document).

### R-PROC-10: Adversarial checklist expansion
Add the following categories based on v3.1 findings:
- Missing data sources in scope lookups (produces names, memory fields, imported names)
- Platform-specific encoding (CRLF, BOM, path separators)
- LSP-specific edge cases (cursor position, partial tokens, document sync timing)

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 5 |
| Debated rounds | 1 (R1) |
| DIRECT rounds | 3 (R2-R4) |
| TEST-ONLY rounds | 1 (R5) |
| Total agent calls | ~12 |
| Bugs caught by debate | 1 (produces-names-in-reads, R1, A3-Skeptic) |
| First-try pass rate | 5/5 (100%) |
| NEEDS_CHANGES | 0 |
| Tests added | 60 (477 to 537) |
| Cross-critique triggered | 0 |
| Step 0 research runs | 0 |
| DIRECT tier streak | 8 consecutive rounds, 0 failures |
| Process improvements applied | 6 (R-PROC-01 through R-PROC-04, R-PROC-06, R-PROC-07) |
| New process recommendations | 3 (R-PROC-08 through R-PROC-10) |

### Version-over-Version Process Efficiency

| Version | Rounds | Agent Calls | Tests Added | Calls/Test |
|---------|--------|-------------|-------------|------------|
| v2.1 | 4 | ~21 | 39 | 0.54 |
| v2.2 | 6 | ~38 | 101 | 0.38 |
| v3.0 | 8 | ~26 | 101 | 0.26 |
| v3.1 | 5 | ~12 | 60 | 0.20 |

Agent calls per test is decreasing each version, confirming that process improvements are compounding. The DIRECT tier and merged Step 3+4 are the primary drivers.
