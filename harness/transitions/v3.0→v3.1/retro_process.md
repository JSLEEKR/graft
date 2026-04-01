# v3.0 Process Retrospective

## Summary

v3.0 ran 8 rounds (R1-R8). R1-R4 used the full debate harness (MEDIUM/HIGH tiers). R5-R8 were direct implementation after context window overflow forced session recovery from a summary. All 8 rounds passed review on the first attempt. 101 new tests, 17 new ratchets, 4 unlocked.

---

## 1. Debate Round Productivity

| Round | Tier | Agent Calls | Bugs Found | Design Changes | Verdict |
|-------|------|-------------|------------|----------------|---------|
| R1 | MEDIUM | 5 | 0 | 0 | Low ROI — mechanical threading |
| R2 | MEDIUM | 5 | 2 critical | 0 | **High ROI** — A3 caught silent runtime bugs |
| R3 | HIGH | 7 | 0 | 1 (dead import cleanup) | Moderate ROI — interface design benefited from 4 perspectives |
| R4 | MEDIUM | 5 | 0 | 1 (deduplication approach) | Moderate ROI — ProgramIndex migration needed alignment |
| R5 | Direct | 1 | 0 | 0 | Sufficient — well-defined runtime feature |
| R6 | Direct | 1 | 0 | 0 | Sufficient — cleanup with clear scope |
| R7 | Direct | 1 | 0 | 0 | Sufficient — incremental LSP + runtime |
| R8 | Direct | 1 | 0 | 0 | Sufficient — test-only |

**Total agent calls**: ~26 (vs ~56 if all 8 rounds used MEDIUM, ~112 if all used HIGH).

**Key finding**: Only R2 produced bugs that debate actually caught. R1, R3, R4 passed cleanly — the debate confirmed designs but didn't change them. R5-R8 also passed cleanly with zero debate. The natural experiment of R5-R8 proves that well-scoped rounds with established patterns do not need multi-agent debate.

## 2. Complexity-Adaptive Scaling Assessment

**What worked**:
- MEDIUM tier (2 agents + convergence) is the right default. It catches enough without 4x overhead.
- Cross-critique skip on high consensus (score range < 2) continued to save calls with no quality loss.
- TEST-ONLY tier (R8) correctly identified that test rounds need zero design debate.

**What didn't work**:
- R1 was rated MEDIUM but was purely mechanical (threading ProgramIndex through existing code). It should have been LOW/Direct.
- R3 was rated HIGH (4 agents) but found no bugs. A CodegenBackend interface is a well-understood pattern (Strategy pattern) that didn't need 4 independent proposals.
- The tier system has no "skip debate entirely" option for rounds where the implementation plan already specifies exact code changes.

**Recommendation**: Add a DIRECT tier for rounds where (a) no new abstractions are introduced, (b) the change is additive to an established pattern, or (c) the round is primarily mechanical refactoring. R5-R8 accidentally validated this tier.

## 3. Forced Dissenter Effectiveness

Only R2-R4 had enough agents for forced dissent (R1 had only 2 agents).

- **R2**: A3-Skeptic found 2 critical silent runtime bugs (writes.join producing `[object Object]`, string iteration on `ref.field` array). This was the single highest-value debate contribution in all of v3.0. However, A3 found these as part of normal analysis, not as the forced dissenter role.
- **R3**: Cross-critique was skipped due to high consensus, so forced dissent didn't activate.
- **R4**: No forced dissent needed — the round was about migrating TypeChecker to ProgramIndex, a mechanical change.

**Assessment**: Forced dissent had zero measurable impact in v3.0. The bugs that were caught came from A3-Skeptic's natural adversarial tendency, not from the forced dissenter mechanism. This is consistent with v2.2 where cross-critique was increasingly skipped.

**Recommendation**: Replace forced dissent with a permanent "adversarial checklist" given to all agents in Step 1. The checklist should include: (1) silent data corruption paths, (2) type coercion traps, (3) backward compatibility breaks, (4) missing error paths. This captures A3's value without the overhead of a separate cross-critique step.

## 4. Process Bottlenecks and Waste

### Context window overflow (R4 → R5 boundary)
The single largest process failure in v3.0. After R4, the context window was exhausted, forcing recovery from a session summary. This lost all accumulated debate context. Despite this, R5-R8 all passed first try — which raises the question of how much of the accumulated context was actually being used.

### Step 0 (Research) was never run
All v3.0 rounds skipped Step 0 research. The codebase is mature enough that research adds no value — the agents already know the patterns from common_memory.md and existing code. This has been true since v2.1.

### Convergence reports as implementation specs
By v3.0, convergence reports had evolved into detailed implementation specs with exact code. This means Step 4 (implementation) was largely copy-paste from Step 3. The two-step split (converge then implement) is overhead for a single-implementer model.

### Artifact accumulation
Each round produces 5-7 markdown files in `harness/tasks/`. For v3.0, R1-R4 produced artifacts; R5-R8 did not. The R5-R8 rounds were equally successful. The artifacts serve as audit trail but are rarely referenced after convergence.

## 5. Recommendations for Next Version

### R-PROC-01: Formalize the DIRECT tier
Add explicit criteria for when to skip debate entirely:
- Mechanical refactoring (threading a parameter, extracting a function)
- Test-only rounds
- Rounds where the plan specifies exact code (no design decisions)
- Additive features following an established pattern (e.g., "add another strategy to the existing strategy handler")

### R-PROC-02: Merge Steps 3 and 4
When using MEDIUM or higher tier, the convergence agent should also implement. The current split (one agent converges, a different agent implements) loses context and adds latency. The convergence agent already writes implementation-ready code.

### R-PROC-03: Kill Step 0 permanently
Step 0 (Research) has not been run since v2.0. Remove it from the process definition or make it opt-in for genuinely novel subsystems (e.g., if a future version adds WASM compilation).

### R-PROC-04: Adversarial checklist replaces forced dissent
Embed A3-Skeptic's patterns as a standard checklist in all Step 1 prompts:
- Silent data corruption (wrong types flowing through, `.join()` on objects)
- Backward compatibility (does this break existing callers?)
- Error path coverage (what happens on null/undefined/empty?)
- Concurrency hazards (parallel writes, stale reads)

### R-PROC-05: Context window budget
Allocate a maximum of 4 debated rounds per version. If more rounds are needed, they must be DIRECT tier. This prevents the R4 → R5 overflow that forced session recovery.

## 6. What R5-R8 Proves About Debate Necessity

R5-R8 completed without any debate: no multi-agent analysis, no cross-critique, no convergence step. All 4 rounds passed review first try, produced 37 new tests, and added 15 ratchet items.

**What made this possible**:
1. **Established patterns**: By R5, the codebase had strong conventions (ProgramIndex threading, error code sub-unions, CodegenBackend interface). New features followed these patterns.
2. **Common memory as specification**: The ratchet decisions and recurring patterns in common_memory.md provided enough design context without live debate.
3. **Well-scoped rounds**: Each round had a narrow, well-defined scope (one feature or one quality pass).
4. **Mature test suite**: 430+ existing tests provided a safety net that caught regressions without needing adversarial review.

**The implication**: Debate is most valuable when (a) introducing new abstractions, (b) the design space has multiple viable approaches, or (c) the change touches many subsystems simultaneously. For additive features within an established architecture, direct implementation with test coverage is sufficient.

**Decision rule for future versions**: Use debate when the round introduces a new *concept* (interface, subsystem, data structure). Skip debate when the round applies an existing concept to new inputs.

---

## Stats

| Metric | Value |
|--------|-------|
| Total rounds | 8 |
| Debated rounds | 4 (R1-R4) |
| Direct rounds | 4 (R5-R8) |
| Total agent calls | ~26 |
| Bugs caught by debate | 2 (both in R2, both by A3-Skeptic) |
| First-try pass rate | 8/8 (100%) |
| Tests added | 101 (376 → 477) |
| Ratchets added | 17 |
| Ratchets unlocked | 4 |
| Context overflow incidents | 1 (after R4) |
| Step 0 research runs | 0 |
| Cross-critique runs | 0 (skipped in all eligible rounds) |
| Forced dissent impact | 0 measurable interventions |
