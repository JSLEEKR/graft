# v4.5 Process Retrospective

## Summary

v4.5 ran 3 rounds: R1 (DIRECT), R2 (DIRECT), R3 (TEST-ONLY). ~6 agent calls total. 43 new tests (1,123->1,166), 13 new ratchets, 0 unlocked. All 3 rounds PASS on first try -- 24 consecutive rounds without NEEDS_CHANGES (v4.0-R1 through v4.5-R3). Pure feature release: two new expression capabilities + integration testing.

## 1. Tier Assessment: Were Complexity Ratings Correct?

All three tiers were correct.

**R1 Comparison Operators (DIRECT):** Correct. The pattern was identical to arithmetic operators from v4.0-R1 -- new tokens, new precedence level, new binary ops, new evaluator cases, new type checker rules. Every file touched followed an established template. No design ambiguity. 17 tests, 6 ratchets.

**R2 Conditional Expressions (DIRECT):** Correct. This could have been argued as MEDIUM (new keywords, new Expr kind, parser change in parsePrimary, runtime truthy semantics, type inference branch logic). However, the design was unambiguous: `if <expr> then <expr> else <expr>` has exactly one reasonable parsing and evaluation strategy. No debate would have surfaced alternatives. 11 tests, 7 ratchets.

**R3 Integration Tests (TEST-ONLY):** Correct by definition. No new production code beyond bug fixes. 15 tests, 0 ratchets.

The v4.4 retro recommended comparison operators and conditional expressions as next features. Both landed cleanly with DIRECT execution, validating that the expression system's extension patterns are now mature enough to skip debate for additive features.

## 2. TextMate Grammar Bug: Packaging Test as Safety Net

The TextMate grammar omitted `if` and `then` from the keyword highlighting pattern. This was caught by the packaging/integration test suite in R3, not during R2 implementation.

**Was this a real issue?** Yes. Users of the VS Code extension would see `if` and `then` unhighlighted in `.gft` files while every other keyword was highlighted. This is a visible polish defect that erodes trust in the tooling.

**Was the packaging test a good safety net?** Excellent. This is exactly the type of cross-cutting concern that falls through cracks during focused feature implementation. R2 focused on parser/runtime/analyzer -- the TextMate grammar is a separate artifact maintained in `syntaxes/graft.tmLanguage.json`, easy to forget. The test caught it mechanically. This validates the pattern of having packaging tests that verify grammar completeness against the keyword list.

**Process implication:** New keywords should trigger a checklist item for TextMate grammar. Alternatively, a test that derives expected keywords from the lexer's KEYWORDS map and asserts they all appear in the TextMate grammar would make this class of bug impossible. Consider adding such a derived test.

## 3. Stale Lexer Constructor Bug

The template parsing code from v4.4-R2 used `new Lexer(substring, filename)` (2-arg constructor). At some point during v4.5, the Lexer constructor signature changed, making the 2-arg call a TypeScript compile error. This was caught in R3 integration testing.

**Was this significant?** Moderately. It was a compile error, not a runtime bug -- TypeScript caught it. But it indicates a gap: the template parsing code path was not exercised by R1 or R2 tests that would have triggered recompilation of the affected file.

**How was it not caught in v4.4?** It was valid in v4.4. The staleness was introduced during v4.5 development. The real question is why R1 and R2 did not catch it -- the answer is that comparison operators and conditional expressions do not interact with template strings, so those test suites never triggered the template parsing path. Only R3's cross-feature integration tests exercised the combination.

**Process implication:** This reinforces the value of integration rounds (R3/R4 TEST-ONLY). Unit tests for individual features are necessary but insufficient; cross-feature regression testing catches interface drift. The current pattern of ending each version with a TEST-ONLY round is validated.

## 4. Test Authoring: Comma-Separated Produces Blocks

Test files initially used comma-separated single-line `produces` blocks (e.g., `produces { field1, field2 }`), which the parser does not support. Tests were fixed to use multi-line format.

This is the third instance of test authoring syntax errors (v4.4 had JS template literal escaping, v2.0-R2 had stale helper signatures). The pattern: test authors assume syntax features that do not exist in the DSL because they are familiar from other languages.

**Recommendation:** A brief "test authoring gotchas" section in common_memory or a test utility that validates `.gft` snippets before assertion would reduce this recurring friction. Low priority -- the errors are always caught immediately.

## 5. Three-Round Structure Efficiency

| Round | Tier | Tests | Agent Calls | Bugs Found |
|-------|------|-------|-------------|------------|
| R1 | DIRECT | 17 | 2 | 0 |
| R2 | DIRECT | 11 | 2 | 0 |
| R3 | TEST-ONLY | 15 | 2 | 3 (TextMate, Lexer ctor, test syntax) |
| **Total** | | **43** | **~6** | **3** |

Highly efficient. 6 agent calls for 43 tests and 13 ratchets. The 3-round structure was correct for this scope:

- R1 and R2 were independent features with no cross-dependency (comparison operators do not require conditional expressions, and vice versa). They could theoretically have been a single round, but separation kept diffs clean and reviewable.
- R3 caught all 3 bugs. Merging R3 into R1/R2 would have missed the cross-feature regressions.

Compare to v4.4 (4 rounds, ~6 calls, 46 tests) and v4.3 (3 rounds, ~6 calls, 29 tests). v4.5 matches v4.4's test output with one fewer round, because both features were DIRECT-tier with no prerequisite refactoring needed. The v4.4 retro's recommendation to do comparison + conditional was well-calibrated.

## 6. Process Improvements to Carry Forward

1. **TextMate keyword derivation test.** A test that asserts all lexer keywords appear in the TextMate grammar would eliminate this bug class permanently. Worth adding in the next version that touches keywords.

2. **Integration rounds remain essential.** R3 found 3 bugs that R1+R2 missed. The TEST-ONLY final round pattern is validated across 8 consecutive versions (v3.3-v4.5).

3. **DIRECT tier for additive expression features is validated.** The expression system (tokens -> parser -> evaluator -> scope checker -> type checker -> codegen) now has a stable enough pattern that new operators and expression kinds can skip debate. Reserve MEDIUM tier for features that introduce new structural concepts.

4. **Extraction-before-feature continues to pay off.** v4.4-R1 extracted evaluateExpr before v4.4-R2 added templates. v4.5 benefited from this -- comparison and conditional evaluation landed in a clean, focused file (expr-eval.ts). Future expression features should continue targeting this file.

5. **24 consecutive PASS rounds.** No NEEDS_CHANGES since v3.6-R3 (which was a minor selectionRange bug). The process is stable. No changes to the review/implementation pipeline are needed.

## Streak and Efficiency Stats

- PASS streak: 24 rounds (v4.0-R1 through v4.5-R3)
- Agent calls this version: ~6
- Tests per agent call: 7.2 (above v4.4's 7.7, well above historical average of ~4)
- Ratchets per round: 4.3 (13 ratchets / 3 rounds)
- Total tests: 1,166
- Total ratchets: ~275
