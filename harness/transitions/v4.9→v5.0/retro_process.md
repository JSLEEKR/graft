# v4.x Series Process Retrospective (v4.0-v4.9)

## Summary

The v4.x series ran across 10 minor versions (v4.0-v4.9), delivering a complete expression system: let bindings, arithmetic/comparison/logical/null-coalescing operators, conditional expressions, string interpolation, built-in functions (len/max/min/str/abs/round/keys), graph parameters and calls, and LSP intelligence for all expression constructs. Test count grew from 890 (end of v3.9) to 1,277 (end of v4.9) -- 387 new tests. Ratchet count grew from ~230 to ~326 -- ~96 new ratchets, 2 unlocked. Every single round across all 10 versions passed review on first try -- zero NEEDS_CHANGES across the entire v4.x series (33 rounds total, 0 failures).

The v4.x series also demonstrated a clear evolutionary trajectory in process efficiency: v4.0 used the full task-based harness (HIGH+MEDIUM+DIRECT), v4.1-v4.4 settled into a MEDIUM/DIRECT/TEST-ONLY pattern, and v4.5-v4.9 were implemented in rapid succession with predominantly DIRECT and TEST-ONLY tiers.

---

## 1. Debate Round Productivity

### Per-Version Round Summary

| Version | Rounds | Tier Mix | Tests Added | Ratchets Added | NEEDS_CHANGES |
|---------|--------|----------|-------------|----------------|---------------|
| v4.0 | 6 | 1 HIGH, 1 MEDIUM, 3 DIRECT, 1 TEST-ONLY | 90 | 33 | 0 |
| v4.1 | 4 | 1 MEDIUM, 2 DIRECT, 1 TEST-ONLY | 21 | 11 (1 unlock) | 0 |
| v4.2 | 4 | 1 MEDIUM, 2 DIRECT, 1 TEST-ONLY | 47 | 13 | 0 |
| v4.3 | 3 | 1 MEDIUM, 1 DIRECT, 1 TEST-ONLY | 29 | 10 (1 unlock) | 0 |
| v4.4 | 4 | 1 DIRECT, 1 MEDIUM, 1 DIRECT, 1 TEST-ONLY | 46 | 15 | 0 |
| v4.5 | 3 | 2 DIRECT, 1 TEST-ONLY | 43 | 13 | 0 |
| v4.6 | 3 | 2 DIRECT, 1 TEST-ONLY | 36 | 9 | 0 |
| v4.7 | 3 | 1 DIRECT, 2 TEST-ONLY | 38 | 6 | 0 |
| v4.8 | 3 | 2 DIRECT, 1 TEST-ONLY | 30 | 6 | 0 |
| v4.9 | 1 | 1 DIRECT | 7 | 3 | 0 |
| **Total** | **34** | -- | **387** | **~119** | **0** |

### Productive Rounds

**v4.0-R1 (HIGH, 4-agent debate)**: The most productive debate in the v4.x series. Introduced the Expr AST (5-kind discriminated union), precedence-based expression parsing, Condition.left migration (4 source files + 142 test occurrences across 15 files), and 2 new FlowNode kinds. A1-Architect as forced dissenter submitted 4 self-rebuttals; convergence accepted 2 (Node keyword handling, foreach graph_call consistency). This was the right round for a full 4-agent debate -- it established the foundational design that every subsequent v4.x version built upon.

**v4.0-R2 (MEDIUM, A2+A3)**: Found 3 critical edge cases not in the plan: variable-first resolution order, foreach body scoping (declaredVars clone), and Node-type graph param pre-population. All three became locked ratchets that held through v4.9.

**v4.2-R1 (MEDIUM)**: Expression functions introduced a new Expr kind ('call'), a BUILTIN_FUNCTIONS registry, parser disambiguation logic, scope/type checker extensions. The MEDIUM tier debate correctly identified the parser disambiguation approach (builtin name + LParen).

**v4.3-R1 (MEDIUM)**: Correctly identified that division precedence needed fixing (ratchet v4.0-R02 unlocked). The multiplicative precedence level established the correct operator hierarchy that v4.5-v4.7 then extended without further debate.

**v4.4-R2 (MEDIUM)**: String interpolation required a novel parsing strategy (TemplateString token detection, brace-depth counting, inner Lexer+Parser instantiation). The MEDIUM tier was justified -- template parsing is a non-trivial design decision with multiple viable approaches.

### Overhead / Low-Value Rounds

**v4.1-R1 (MEDIUM)**: The conditionFieldName multi-segment fix was essentially a known bug fix (deferred from v4.0-R2). The root cause was already identified: conditionFieldName bridge returned a dotted string for flat lookup. A DIRECT tier would have sufficed. The MEDIUM debate produced the same resolveNestedField solution both agents would have converged on independently. Evidence: 4 agent calls for a fix whose root cause was already documented.

**v4.1-R3 (DIRECT)**: Scope checker extraction was pure mechanical refactoring. 0 new tests, 0 behavioral changes. This was correctly classified DIRECT, but it raises a broader question: should pure refactoring rounds exist at all as separate rounds, or should they be folded into the preceding feature round?

### TEST-ONLY Rounds: Consistently Valuable

Every version from v4.0 through v4.8 included a TEST-ONLY integration/regression round. These consistently added 8-20 cross-feature tests that verified interactions between newly added operators and existing features. The v4.5-R3 round even caught a real bug (stale 2-arg Lexer constructor in template parsing). The TEST-ONLY tier at 2 agent calls per round is efficient and should continue.

---

## 2. Complexity-Adaptive Scaling

### Tier Distribution Across v4.x

| Tier | Round Count | Approx Agent Calls | Design Findings | Bugs Found |
|------|-------------|---------------------|-----------------|------------|
| HIGH (4-agent) | 1 | ~14 | 2 dissent-driven | 0 |
| MEDIUM (2-agent) | 7 | ~28 | ~8 | 1 |
| DIRECT (1-agent) | 17 | ~34 | 0 | 1 (stale constructor) |
| TEST-ONLY | 9 | ~18 | 0 | 0 |
| **Total** | **34** | **~94** | **~10** | **2** |

### Did the Tier System Work?

**YES, with a clear pattern**: Design findings concentrated entirely in HIGH and MEDIUM tiers. DIRECT tiers had zero design changes but reliably delivered features. The v4.x series validates a front-loading principle: invest in debate for foundational rounds, then ride ratchets for incremental additions.

**Correct tier assignments**:
- v4.0-R1 (HIGH): New AST category, 5 new tokens, 2 new FlowNode kinds, breaking migration. Correct.
- v4.2-R1 (MEDIUM): New Expr kind, registry pattern, parser disambiguation. Correct.
- v4.3-R1 (MEDIUM): Precedence hierarchy restructure, ratchet unlock. Correct.
- v4.4-R2 (MEDIUM): Template parsing (novel pattern). Correct.
- v4.5 through v4.9 (mostly DIRECT): Adding operators/expressions to an established pattern. Correct.

**Potentially over-tiered**:
- v4.1-R1 (MEDIUM): Known bug fix with documented root cause. Should have been DIRECT. Wasted ~2 agent calls.
- v4.3-R2 (DIRECT): str() null handling + division precedence test. Borderline -- could have been TEST-ONLY.

**Potentially under-tiered**: None identified. The v4.5-v4.9 rapid succession proves that once the expression system foundation was solid (Expr AST, precedence hierarchy, evaluator, scope/type checker recursion patterns), new operators could be added at DIRECT tier without design risk. Each new operator followed the exact same 5-file pattern: lexer token, parser precedence level, evaluator case, type checker case, scope checker case.

### The Operator Addition Pattern

Starting from v4.5, every new operator followed a mechanical template:
1. Add token(s) to lexer (1-2 lines in SINGLE_CHAR or multi-char matching)
2. Add precedence level to parser (new parseX function, 10-15 lines)
3. Add case to evaluateExpr (3-5 lines)
4. Add case to inferExprType (1-2 lines)
5. Add case to checkExprTypeErrors (2-5 lines)
6. Update TextMate grammar (1 line)

This pattern was so stable that v4.5 (comparison + conditional), v4.6 (logical), and v4.7 (null coalescing) each completed in 3 rounds with predominantly DIRECT tiers. This is evidence that the ratchet system works: once a pattern is locked, it can be replicated at low cost.

---

## 3. Forced Dissenter Effectiveness

### v4.x Forced Dissent Activity

Only v4.0-R1 triggered forced dissent (the only HIGH-tier 4-agent round in v4.x). All subsequent rounds used MEDIUM (2-agent, no forced dissent) or DIRECT (no debate).

**v4.0-R1 Results** (A1-Architect, highest confidence at 8/10):
- 4 self-rebuttals submitted
- 2 accepted (50% rate):
  - Node keyword check: prevented KEYWORDS map pollution. Still relevant at v4.9.
  - Foreach graph_call: fixed an inconsistency that would have required breaking change later. The foreach body allowing let+graph_call but rejecting parallel+foreach (ratchet v4.0-R09) held through all 10 versions.
- 2 rejected:
  - Flat division precedence: rejected at v4.0, but vindicated at v4.3 when division was moved to multiplicative precedence (v4.0-R02 unlocked). The dissenter was arguably right early.
  - conditionFieldName bridge: appropriate for incremental migration, bridge was later removed at v4.1.

### Assessment

The forced dissenter mechanism was only exercised once in v4.x, but that single exercise produced two design improvements that persisted through the entire series. The division precedence dissent is particularly noteworthy: it was rejected at v4.0 because the spec grammar was authoritative (flat precedence), but by v4.3 the real-world math semantics (`2 + 6/3 = 4` not `2.67`) forced a ratchet unlock. If the dissent had been accepted at v4.0, the ratchet unlock at v4.3 would have been unnecessary.

**Recommendation**: The forced dissenter mechanism remains valuable but is underutilized when most rounds are MEDIUM or DIRECT. For v5.0, consider a lightweight dissent mechanism for MEDIUM rounds: the second agent explicitly lists 1-2 "what could go wrong" scenarios instead of full self-rebuttal.

---

## 4. Process Bottlenecks and Waste

### 4.1 Context Compaction (CRITICAL -- recurring from v4.0 retro)

This was flagged in the v3.9-to-v4.0 retro and remained the primary source of waste in v4.x. Common memory reached ~684 lines by v4.9 (before archival reduced it). The v4.4 archival of T1-v2.2 ratchets to `harness/archived_ratchets.md` (~100 items, ~130 lines saved) was a step in the right direction but insufficient for long-running sessions.

**Evidence of impact**: v4.0 lost 30+ minutes to repeated work from context compaction. v4.5-v4.9 were implemented in rapid succession specifically to avoid session breaks and compaction losses.

### 4.2 Redundant Integration Rounds

Every version from v4.0 to v4.8 included a dedicated TEST-ONLY integration/regression round. While individually valuable (8-20 tests each, one real bug found), this represents 9 rounds and ~18 agent calls spent on testing alone. For incremental operator additions (v4.5-v4.7), the integration round added tests that verified predictable interactions (new operator + existing operators). These could potentially be folded into the feature round itself.

**Counter-argument**: The v4.5-R3 round found a real bug (stale Lexer constructor). Separate integration rounds catch issues that per-feature tests miss.

### 4.3 Harness Artifact Gaps (v4.3-v4.9)

v4.0 produced full harness artifacts (step0 research, step1 4-agent analysis, step2 cross-critique, step3 convergence, step5 review). v4.1-v4.2 produced step5 review artifacts. v4.3-v4.9 have review feedback in common_memory.md but no separate step artifact files. This is fine for process efficiency but makes retrospective analysis harder -- we rely on common_memory entries rather than detailed debate transcripts.

**Evidence**: The harness/tasks/ directory contains artifacts only for v4.0-R1 and v4.0-R2. All subsequent v4.x rounds exist only as common_memory entries and CHANGELOG entries.

### 4.4 Ratchet Accumulation

v4.x added ~96 new ratchets across 10 versions. Many of these follow mechanical patterns (e.g., "X token in lexer -- LOCKED", "parseX precedence level -- LOCKED") that are effectively implementation details rather than design decisions. The ratchet system was designed to lock design decisions, not implementation details. By v4.9, ~326 total ratchets exist, with perhaps 60-70% being implementation-detail ratchets that will never be contested.

### 4.5 The Diminishing Returns of Multi-Round Versions

| Version | Rounds | Tests/Round | Agent Calls (est) |
|---------|--------|-------------|-------------------|
| v4.0 | 6 | 15 | ~26 |
| v4.1 | 4 | 5.3 | ~10 |
| v4.2 | 4 | 11.8 | ~10 |
| v4.3 | 3 | 9.7 | ~6 |
| v4.4 | 4 | 11.5 | ~6 |
| v4.5 | 3 | 14.3 | ~4 |
| v4.6 | 3 | 12.0 | ~4 |
| v4.7 | 3 | 12.7 | ~4 |
| v4.8 | 3 | 10.0 | ~4 |
| v4.9 | 1 | 7.0 | ~2 |

Agent calls per version dropped from ~26 (v4.0) to ~2-4 (v4.7-v4.9) while tests per round remained stable at 10-15. This confirms the pattern: once the foundational design is established, incremental additions require minimal debate overhead.

---

## 5. Harness Recommendations for v5.0

### 5.1 Architecture-Appropriate Tier Assignments

v5.0 will tackle architectural features: memory importability, user-defined functions, runtime type checking, multi-file composition. These are fundamentally different from the v4.x operator additions.

**Recommendation**: Reset the tier baseline. v5.0 features touch multiple pipeline stages simultaneously (parser + analyzer + codegen + runtime + LSP). Apply:
- **HIGH (4-agent debate)**: Memory importability (cross-file state management, security implications), user-defined functions (new declaration type, scope rules, call semantics). These introduce new categories of correctness concerns.
- **MEDIUM (2-agent)**: Runtime type checking (existing pattern -- type checker already warns, this makes it enforce), multi-file composition changes.
- **DIRECT**: LSP updates for new constructs, codegen templates, integration rounds.
- **TEST-ONLY**: Continue per-version integration rounds.

### 5.2 Merge Integration Tests Into Feature Rounds

For DIRECT-tier rounds, fold 3-5 cross-feature integration tests into the feature round itself instead of deferring to a separate TEST-ONLY round. Reserve standalone TEST-ONLY rounds for version-level integration (after all feature rounds are complete). This could save 1-2 rounds per version.

**Exception**: Keep separate TEST-ONLY rounds when a version has 4+ feature rounds that interact in non-obvious ways.

### 5.3 Lightweight Dissent for MEDIUM Tier

Add a structured "risk register" to MEDIUM-tier analysis: each agent must list 2-3 specific failure scenarios (not generic concerns, but concrete "if X then Y breaks" predictions). This captures some dissent value without the full forced-dissenter overhead.

### 5.4 Ratchet Hygiene

Introduce a ratchet classification:
- **DESIGN ratchets**: Genuine design decisions (e.g., "Variable-first resolution order", "Expr 5-kind discriminated union"). These should be preserved and defended.
- **IMPL ratchets**: Implementation details (e.g., "Star token in lexer", "parseMultiplicative precedence level"). These can be bulk-archived between versions.

At the v4.9-to-v5.0 transition, archive all IMPL ratchets from v4.0-v4.9 to reduce common_memory pressure. Retain only DESIGN ratchets in active memory.

### 5.5 Common Memory Compression

The v4.4 archival experiment worked (T1-v2.2 ratchets moved to archived_ratchets.md, ~130 lines saved). Extend this pattern:
- Archive v3.x ratchets (v3.0-R01 through v3.9) -- these are stable and unlikely to be unlocked in v5.0
- Archive v4.0-v4.4 ratchets -- the expression foundation is locked; v4.5-v4.9 operator additions are mechanical
- Keep in active memory: v4.5-v4.9 ratchets (most recent), all DESIGN ratchets, all Review Feedback entries, Debate ROI, Recurring Patterns

Target: reduce common_memory.md from ~684 lines to ~300 lines before v5.0 starts.

### 5.6 Session Continuity as Default

The v4.5-v4.9 rapid implementation confirms that continuous execution mode (no session breaks between rounds) is strictly superior. Make this the default expectation for v5.0. Structure the plan so that HIGH/MEDIUM rounds come first (when context is fresh), DIRECT/TEST-ONLY rounds follow (when context pressure is highest).

### 5.7 Harness Artifact Policy

v4.x demonstrated that full harness artifacts (step0-step5 files) are only valuable for HIGH-tier rounds. For MEDIUM and DIRECT tiers, the common_memory entry + CHANGELOG entry provide sufficient audit trail.

**Recommendation for v5.0**:
- HIGH rounds: full artifacts (step0, step1, step2, step3, step5)
- MEDIUM rounds: convergence summary in common_memory (no separate files)
- DIRECT rounds: review feedback in common_memory only
- TEST-ONLY rounds: test count + findings in common_memory only

This eliminates artifact file creation overhead for 70%+ of rounds while preserving full documentation for the rounds where debate actually matters.

---

## Appendix: v4.x Series Statistics

| Metric | Value |
|--------|-------|
| Versions | 10 (v4.0-v4.9) |
| Total rounds | 34 |
| Total tests added | 387 (890 to 1,277) |
| Total ratchets added | ~96 |
| Ratchets unlocked | 2 (v4.0-R02 division precedence, v4.0-R04 conditionFieldName bridge) |
| NEEDS_CHANGES | 0 across all 34 rounds |
| Estimated total agent calls | ~94 |
| HIGH rounds | 1 (v4.0-R1) |
| MEDIUM rounds | 7 |
| DIRECT rounds | 17 |
| TEST-ONLY rounds | 9 |
| Forced dissent exercises | 1 (v4.0-R1, 2/4 accepted) |
| Harness artifact files created | 14 (all from v4.0-R1 and R2) |
