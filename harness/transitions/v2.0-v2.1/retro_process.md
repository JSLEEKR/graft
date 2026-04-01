# Retrospective: Development Process (v2.0 -> v2.1)

## Productive vs Overhead

### High-value rounds (debate was essential)

**R2 (Import Resolver) -- HIGHEST VALUE.** 2 of 4 agents (A2, A4) had the transitive re-export bug in Step 1. Without cross-critique, either could have been selected and shipped a broken resolver. A1's ExportableNames snapshot was the only correct approach, and the debate process ensured it was adopted. The implementer also discovered a latent bug in the convergence spec itself (diamond import scenario), demonstrating that even converged designs benefit from implementation-time scrutiny. This round justified the full 4-agent process.

**R4 (CodeGen + Runtime) -- HIGH VALUE.** A3 found the foreach memory staleness bug that all 3 other agents missed. A2's forced dissenter self-rebuttal was the most thorough in project history, reversing 3 of their own positions with clear reasoning. Without the debate, shallow merge (data pollution), foreach staleness (silent data loss), and empty scaffold files (ambiguous state) would have shipped.

### Moderate-value rounds

**R1 (Lexer + AST + Parser) -- MODERATE.** The flag-based ordering approach emerged through forced dissent, which was useful. However, the implementation was ultimately straightforward keyword/AST additions. The 4-agent debate produced 10 ratchet items for what was largely mechanical parser extension work. A 2-agent analysis + convergence would likely have reached the same result with fewer agent calls.

**R3 (Analyzer) -- MODERATE.** The forced dissenter reversal ("collision detection is correctness, not a feature") was productive and changed the design. But the core implementation (memory branch in reads, checkNodeWrites, estimator update) was consensus from the start. The debate overhead (4x analysis + 4x critique = 8 agents) produced ~10 lines of additional code (checkDuplicateNames). The collision detection was worth adding, but the 8-agent cost to get there was disproportionate.

### Low-value rounds (correctly streamlined)

**R5 (Integration Tests) -- CORRECTLY STREAMLINED.** Reduced to ~6 agents instead of 14. The only disagreement was 6 vs 8 tests, resolved trivially. Full 4-agent cross-critique would have been pure overhead here.

### Summary: debate ROI

| Round | Agents used | Bugs found by debate | Design changes from debate | ROI |
|-------|-------------|---------------------|---------------------------|-----|
| R1    | ~14         | 0 critical          | 1 (flag ordering)         | Low-Moderate |
| R2    | ~14         | 1 critical (re-export) | 1 (ExportableNames)    | High |
| R3    | ~14         | 0 critical          | 1 (collision detection)   | Low-Moderate |
| R4    | ~14         | 1 critical (foreach staleness) | 3 (merge, scaffold, dry run) | High |
| R5    | ~6          | 0                   | 0                         | Correct (minimal cost) |

Approximately 28 agent calls across R1 and R3 could have been reduced to ~12-16 without meaningful quality loss.

## Complexity Scaling Assessment

### The HIGH/LOW binary worked but was too coarse

v2.0 used two levels: HIGH (full 4-agent debate, ~14 agents) and LOW (streamlined, ~6 agents). R5 was correctly classified as LOW. The problem is that R1 and R3 were classified HIGH but fell into a MEDIUM zone: they had non-trivial implementation but low design ambiguity.

**Evidence for a MEDIUM tier:**
- R1 had no fundamental design disagreements -- only the import ordering mechanism was debated. The rest was mechanical (add keywords, add AST nodes, add parse methods).
- R3 had one real design question (collision detection) but the core changes were unanimous 4:0 consensus items.
- In both cases, cross-critique (Step 2) produced minimal new insights beyond what analysis (Step 1) already established.

**Proposed thresholds:**

| Level | Criteria | Process |
|-------|----------|---------|
| HIGH  | Novel algorithm, multiple valid approaches, correctness subtlety (R2, R4) | Full 7-step, 4 agents |
| MEDIUM | Non-trivial but pattern-following, 1-2 design questions (R1, R3) | 2-agent analysis + convergence + implementation + review (~8 agents) |
| LOW   | Mechanical, consensus expected, integration/wiring (R5) | Combined analysis + implementation + review (~4-6 agents) |

This would have saved ~12-16 agent calls in v2.0 with no quality loss.

### Complexity detection heuristics

Assign HIGH when any of:
- Multiple valid algorithmic approaches exist (resolver: DFS vs BFS vs topological)
- A correctness invariant must be structurally enforced (re-export prevention, foreach staleness)
- Cross-cutting changes span 3+ modules with interaction effects (codegen + runtime + executor)

Assign MEDIUM when:
- Adding to an existing pattern (new keyword, new AST node, new checker method)
- 1-2 design questions but core approach is obvious
- Changes touch 2-3 modules but interactions are well-defined

Assign LOW when:
- Wiring/integration with no new logic
- Test-only rounds
- All agents would produce near-identical output

## Forced Dissenter Effectiveness

### Mechanism assessment: EFFECTIVE, with qualification

The forced dissenter mechanism (highest self-assessed convergence score takes opposition) produced genuine design improvements in 4 of 5 rounds.

| Round | Dissenter | Self-rebuttal outcome | Design impact |
|-------|-----------|----------------------|---------------|
| R1    | A1        | Rebutted flag-based ordering, then adopted it | Moderate -- confirmed the approach |
| R2    | A2        | "YAGNI applies to features, not correctness mechanisms" | High -- reframed the discussion |
| R3    | A1        | Reversed own position on collision detection | High -- added correctness check |
| R4    | A2        | Self-rebutted all 3 positions (shallow merge, direct load, empty scaffold) | Very high -- most thorough in project history |
| R5    | A2        | Would have self-rebutted on test count | Low -- trivial disagreement |

### Which self-rebuttals actually changed the design?

**Changed the design (3):**
- R2: A2's reframing prevented YAGNI from being used to dismiss correctness mechanisms
- R3: A1's reversal added collision detection (~10 lines that prevent silent bugs)
- R4: A2's triple self-rebuttal rejected shallow merge, direct load, and empty scaffold -- all three would have been bugs

**Confirmed existing direction (1):**
- R1: A1 rebutted and then adopted flag-based ordering, which was already the consensus

**Ceremony (1):**
- R5: A2 would have self-rebutted on 6 vs 8 tests -- a trivial point

### Recommendation

Keep the forced dissenter mechanism for HIGH complexity rounds. For MEDIUM, a single forced-dissent question in the convergence step is sufficient (the convergence agent can play devil's advocate on the 1-2 design questions without a full critique round). For LOW, skip entirely.

## Process Bottlenecks

### 1. Agent type mismatch (R4)

Specialized agent types (architect/pragmatist/skeptic/specialist) cannot write files. In R4, this caused delays when analysis agents were launched instead of general-purpose agents for implementation. The analysis agent personas are useful for framing (A3-Skeptic consistently finds edge cases), but the persona should be a prompt instruction, not an agent type constraint.

**Fix:** All agents should be general-purpose with persona instructions in the prompt. Never use agent types that restrict tool access for any step that might need file operations.

### 2. Stale test helper signatures (persistent across versions)

The implementation plan's test helpers had stale signatures in T5, T6, T7, and this persisted into v2.0. Every round, the implementer had to adapt test helper signatures to match actual code. This is wasted time.

**Fix:** Stop including test helper code in implementation plans. The convergence spec should specify WHAT to test (inputs, expected outputs, edge cases) but not HOW (helper functions, assertion patterns). The implementer follows existing test patterns in the codebase.

### 3. Research step (Step 0) is low-value for incremental work

Step 0 (2 research agents) was skipped in v2.0 debug mode. But even for CREATE mode in an established codebase, the architecture/implementation research produces generic findings. By R3, the patterns are established. The research agents told us things we already knew from the existing code.

**Fix:** Skip Step 0 for any round that extends existing modules. Only use Step 0 when introducing a genuinely new concept (e.g., a new compilation target, a new language feature category).

### 4. Convergence agents writing full code

From T3 onwards, convergence agents write complete implementation code. This is productive (the implementer has exact code to follow) but creates a risk: the convergence spec becomes the implementation plan, and the implementer becomes a typist. When the convergence spec has a latent bug (R2 diamond import scenario), the implementer must deviate -- but the review process treats deviations as suspicious. The R2 reviewer correctly accepted the deviation, but the process incentivizes blind adherence.

**Fix:** Convergence specs should include code for complex/subtle sections only (algorithm core, tricky type signatures). Mechanical code (helper functions, test boilerplate) should be left to the implementer. This also reduces convergence report size.

### 5. Double parse in compiler pipeline (R2)

The reviewer noted that the compiler parses the source, then the resolver parses it again to maintain its pure-function contract. This is a known inefficiency. Not a bottleneck yet, but worth tracking.

### 6. All 5 reviews passed on first attempt

Zero NEEDS_CHANGES across all of v2.0. This is either evidence that the debate process produces high-quality convergence specs, or evidence that reviews are too lenient. Given that the R2 reviewer caught a deviation and correctly accepted it, and the R4 reviewer analyzed dry-run edge cases in detail, the reviews appear substantive. However, a 100% first-pass rate across 5 rounds suggests the review bar could be raised slightly -- e.g., requiring the reviewer to run mutation testing or propose adversarial inputs.

## Recommendations for v2.1

1. **Add a MEDIUM complexity tier.** Use 2-agent analysis (not 4) + convergence + implementation + review for rounds that extend existing patterns without algorithmic novelty. Expected savings: ~4-6 agents per MEDIUM round.

2. **Classify complexity before Step 0.** The orchestrator should evaluate complexity using the heuristics in the Complexity Scaling section BEFORE launching any agents. Document the classification and rationale in a `harness/tasks/{round}/complexity.md` one-liner.

3. **Skip Step 0 (Research) for incremental rounds.** Only invoke research agents when the round introduces a concept not already present in the codebase. For v2.1, this likely means: skip research for all rounds unless a new compilation target or language construct category is added.

4. **Use general-purpose agents with persona prompts for all steps.** Remove the dependency on specialized agent types. The persona (architect, pragmatist, skeptic, specialist) should be a system prompt prefix, not an agent type selection. All agents must have full tool access.

5. **Stop including test helper code in plans and convergence specs.** Specify test CASES (input, expected output, edge case description) but not test INFRASTRUCTURE (helper functions, mock patterns). The implementer matches existing test patterns. This eliminates the stale-signature problem that has persisted since T5.

6. **Reduce convergence spec code to critical sections only.** The convergence agent should write full code for: algorithm cores, tricky type signatures, and correctness-critical invariants. Mechanical code (boilerplate, helpers, simple methods) should be described in prose and left to the implementer.

7. **Keep forced dissenter for HIGH rounds, simplify for MEDIUM.** For MEDIUM rounds, the convergence agent asks one forced-dissent question per design decision instead of running a full 4-agent cross-critique. For LOW rounds, skip forced dissent entirely.

8. **Add a "reviewer adversarial test" requirement.** The reviewer must propose at least one adversarial input or mutation that is NOT in the test suite and verify the implementation handles it. This raises the review bar above "does it match the spec" to "does it actually work for cases nobody thought of."

9. **Track A3-Skeptic's bug-finding pattern explicitly.** A3 has found critical bugs in every round across v1 and v2 (T2-T7, v1.2, R1-R4). For HIGH complexity rounds, A3's output should be reviewed FIRST by the convergence agent. For MEDIUM rounds where only 2 agents are used, one of them should have the skeptic persona.

10. **Record debate ROI metrics in common_memory.** After each round, log: (a) number of agents used, (b) bugs found by debate, (c) design changes from debate. This makes future complexity classification data-driven rather than intuitive.
