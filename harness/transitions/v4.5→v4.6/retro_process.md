# v4.6 Process Retrospective

## Summary

v4.6 ran 3 rounds: R1 (DIRECT), R2 (DIRECT), R3 (TEST-ONLY). ~6 agent calls total. 36 new tests (17 + 7 + 12), 1,166 -> 1,202 total. 9 new ratchets, 0 unlocked. All 3 rounds PASS on first try -- 27 consecutive rounds without NEEDS_CHANGES (v4.0-R1 through v4.6-R3). Feature release: logical operators and conditional branch type mismatch warnings.

## 1. Tier Assessment: Were Complexity Ratings Correct?

All three tiers were correct.

**R1 Logical Operators (DIRECT):** Correct. `&&` and `||` follow the same additive pattern as v4.5's comparison operators -- new token types, new precedence level in the parser, new binary expression cases in the evaluator, new type checker rules. The expression system's extension pattern (lexer -> parser -> expr-eval -> scope-checker -> type-checker -> codegen) is now exercised enough that additive operators are mechanical. 17 tests, ratchets for short-circuit semantics and precedence.

**R2 Conditional Type Mismatch Warnings (DIRECT):** Correct. This added a new diagnostic category (warnings) rather than new syntax. The analyzer already had the branch-walking infrastructure from conditional expressions in v4.5. The new logic compares types across `if`/`else` branches and emits a warning when they diverge. No structural ambiguity -- a single reasonable implementation exists. 7 tests.

**R3 Integration Tests (TEST-ONLY):** Correct by definition. Cross-feature validation of logical operators combined with conditionals, nested expressions, and existing features. 12 tests, 0 new production code.

## 2. The Warnings vs Errors Separation

R2 tests initially checked `result.errors` for type mismatch warnings. The compiler separates warnings from errors in its output -- warnings do not appear in the errors array. Tests had to be corrected to check `result.warnings`.

**Was this a real issue?** Yes, but minor. The fix was mechanical once identified. The root cause: warnings as a distinct output channel were introduced (or became prominent) in this version, and the test author defaulted to the familiar `result.errors` path.

**Why was it caught quickly?** The tests failed immediately -- checking `result.errors` returned an empty array, making the assertion failure obvious. There was no subtle pass-by-accident risk.

**Process implication:** This is analogous to v4.5's comma-separated produces syntax -- test authors assume interfaces based on habit rather than checking the actual API surface. The pattern recurs (v2.0-R2 stale helpers, v4.4 template literal escaping, v4.5 produces syntax, now v4.6 warnings channel). A comment in the test utilities documenting the `errors` vs `warnings` split would help, but realistically these are caught within minutes and do not warrant heavyweight prevention.

## 3. TextMate Grammar: Learned Lesson Applied

v4.5 found that new keywords (`if`, `then`) were missing from the TextMate grammar, caught only in R3. v4.6 proactively updated the grammar for logical operator tokens. No TextMate bugs in R3.

This confirms the v4.5 retro recommendation worked: awareness of the grammar as a parallel artifact to update alongside the lexer prevents the bug class. The derived keyword test (asserting all lexer keywords appear in the grammar) remains worth adding but is less urgent now that the manual habit is established.

## 4. Three-Round Structure Efficiency

| Round | Tier | Tests | Agent Calls | Bugs Found |
|-------|------|-------|-------------|------------|
| R1 | DIRECT | 17 | 2 | 0 |
| R2 | DIRECT | 7 | 2 | 1 (warnings/errors separation) |
| R3 | TEST-ONLY | 12 | 2 | 0 |
| **Total** | | **36** | **~6** | **1** |

Efficient. The 3-round structure was correct for this scope:

- R1 and R2 were independent features. Logical operators do not depend on type mismatch warnings and vice versa. Separate rounds kept changes isolated and reviewable.
- R2 was smaller (7 tests vs R1's 17) because the warning infrastructure was narrow in scope -- it adds diagnostics, not new syntax or runtime behavior. This validates that not all DIRECT rounds need to be equal in size; the tier reflects design complexity, not test count.
- R3 found no new bugs, which is noteworthy. v4.5-R3 found 3 bugs; v4.6-R3 found 0. The proactive TextMate update and the clean warnings API likely contributed. Integration rounds with zero bugs are still valuable -- they confirm correctness and add regression coverage.

Compare to v4.5 (3 rounds, ~6 calls, 43 tests, 3 bugs) and v4.4 (4 rounds, ~6 calls, 46 tests). v4.6 has fewer tests than v4.5 but the same call count, yielding 6.0 tests per agent call. The lower per-call ratio reflects R2's smaller scope, not inefficiency.

## 5. DIRECT-Only Versions: Pattern Validation

v4.6 is the second consecutive version where all production rounds were DIRECT tier (v4.5 was the first). The expression system's extension patterns are now stable enough that:

- New operators (arithmetic v4.0, comparison v4.5, logical v4.6) are mechanical additions.
- New analyzer diagnostics (type mismatch warnings v4.6) follow established patterns.
- No round required design debate to resolve ambiguity.

Reserve MEDIUM tier for features that introduce new structural concepts (new AST node categories, new pipeline stages, new runtime execution modes). Additive features that slot into existing patterns should remain DIRECT.

## 6. Process Improvements to Carry Forward

1. **Warnings channel documentation.** Add a brief note in test utilities or common_memory that compiler output separates `errors` and `warnings`. Prevents the same mistake in future versions that add new warning categories.

2. **TextMate proactive update habit is working.** Continue updating the grammar alongside lexer changes. The derived keyword test is still worth adding when convenient but is no longer blocking.

3. **Integration rounds remain essential even when they find zero bugs.** The 12 tests from R3 add permanent regression coverage for logical-operator-plus-conditional combinations. Zero bugs found does not mean the round was wasted.

4. **DIRECT tier is validated for additive expression features.** Two consecutive versions (v4.5, v4.6) confirm the pattern. The threshold for MEDIUM should be structural novelty, not feature count.

5. **27 consecutive PASS rounds.** No NEEDS_CHANGES since v3.6-R3. The process is stable.

## Streak and Efficiency Stats

- PASS streak: 27 rounds (v4.0-R1 through v4.6-R3)
- Agent calls this version: ~6
- Tests per agent call: 6.0 (36 / 6)
- Ratchets per round: 3.0 (9 / 3)
- Total tests: 1,202
- Total ratchets: ~284
