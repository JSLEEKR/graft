# A4-Specialist Cross-Critique -- T2

## Critique of Other Agents

### On A1-Architect

**Strengths:**

- The `LexResult` return type (`{ tokens, errors }`) is architecturally sound and follows production compiler patterns (Roslyn, rustc, TypeScript). A1 correctly identifies that this matches the spec's "all errors collected and reported together" requirement.
- Shared `SourceLocation` type imported into `Token` is the right call for type-safety across compiler phases.
- The `CompilerPhase` discriminator on `GraftError` is a low-cost addition that pays off in T4-T5.

**Weaknesses:**

- **Over-engineering error recovery for v1**: A1 proposes emitting partial `StringLiteral` tokens on unterminated strings and continuing lexing. From a compiler theory perspective, this is correct for mature compilers, but for v1 it introduces a significant downstream burden: the parser must handle tokens that are semantically invalid. If an unterminated string appears mid-declaration, every subsequent token is likely garbage context. The error recovery gains minimal user-visible benefit (one extra error message) at the cost of parser complexity. The pragmatic choice is throw-on-first-error for v1.
- **`CompilerPhase` is forward-looking but adds coupling**: Every phase now imports and sets this field. For v1 with only lexer errors, this is dead code in 3 of 4 phases. The cost is genuinely small, but A2 is right that it is speculative.
- **Did not catch the float-without-trailing-digits bug explicitly**: A1 mentions "core scanning logic is correct as-is" but the `readNumber` float branch has the `42.}` bug that A3 identified. This is a blind spot -- high convergence without catching a real correctness issue.

### On A2-Pragmatist

**Strengths:**

- Correctly identifies the critical bug: `GraftError` must extend `Error` for `toThrow()` to work in vitest. This is the single highest-impact fix across all proposals.
- Merging `tokens.ts` into `lexer.ts` is defensible for v1. The module is small enough that a single file does not hurt readability.
- Hoisting `SINGLE_CHAR` to module scope is a correct micro-optimization.
- `matchTwoChar()` extraction is clean separation of two-char operator logic.

**Weaknesses:**

- **Merging tokens.ts violates separation of concerns for the parser**: When T4 arrives, the parser needs `Token`, `TokenType`, and `KEYWORDS` but NOT the `Lexer` class. Importing from `lexer.ts` creates a false dependency -- the parser appears to depend on the lexer implementation, not just its output types. This makes refactoring harder. A separate `tokens.ts` is 30 lines and costs nothing. The import path argument ("fewer .js extensions to get wrong") is trivially solved by IDE auto-imports and is not a real maintenance burden.
- **Removing `severity` is premature optimization of the API surface**: The field costs one optional parameter. The analyzer (T5) may legitimately want to issue warnings (e.g., "unused context field" or "budget exceeds typical limits"). Removing it now means a breaking API change later. The cost of keeping it (one field, one default value) is lower than the cost of re-adding it.
- **Throw-on-first-error is correct for v1 but the justification is wrong**: A2 says "the plan already throws" as if the plan's behavior is normative. The plan's behavior is a bug relative to the spec. The correct justification is "v1 pragmatism accepts this deviation from spec." The distinction matters because it affects whether the decision is ratchet-locked.
- **Did not address the float-without-trailing-digits bug**: Same blind spot as A1. The `readNumber` function will emit `FloatLiteral("42.")` for input `42.}`, which violates the spec grammar `[0-9]+ '.' [0-9]+`.

### On A3-Skeptic

**Strengths:**

- **Found the critical float bug** (issue #1/#8): `42.}` producing `FloatLiteral("42.")` is a real correctness violation. The proposed fix (peek for digit after dot before entering float mode) is exactly right. This is the most important finding across all Step 1 analyses.
- **Correctly identified `GraftError extends Error` necessity** (issue #11): Same finding as A2, independently arrived at.
- **Thorough edge case enumeration**: Issues #7 (bare `=`/`!`/`-`), #4 (CRLF in block comments), #13 (Unicode surrogate pairs), #15 (`\r\n` in strings) demonstrate systematic boundary analysis.
- **Proposed defensive `format()` guard** against invalid `SourceLocation` is good defensive programming.

**Weaknesses:**

- **Issue #3 (escape sequences) overstates severity as MEDIUM**: The spec explicitly defines strings as `'"' [^"]* '"'` -- no escape sequences. This is a deliberate language design choice, not a bug. Users writing `\"` will get an error, which is correct behavior per spec. Implementing escape sequences would be a spec deviation. The right action is: document that Graft v1 strings do not support escapes, and consider it for v2. Marking this MEDIUM implies it should be fixed now, which is wrong.
- **Issue #6 (error collection) retreats to "recommendation" without commitment**: A3 identifies the spec/implementation mismatch correctly but then hedges: "for unterminated strings and block comments, continuing is hard -- these should still abort." This undermines the recommendation. Either commit to error collection (with the complexity it entails) or accept throw-on-first-error for v1. The middle ground of "collect some errors but abort on others" is the worst option -- it creates inconsistent behavior.
- **Too many issues dilute focus**: 12 numbered issues, several of which are NON-ISSUE (issues #4 final verdict, #8 duplicate, #12 explicitly not-a-bug). The signal-to-noise ratio could be improved. The convergence agent must spend time triaging rather than implementing.
- **Edge case tests are excellent but some test for behavior that is correct and obvious**: Testing empty input, whitespace-only input, and comment-only input is good practice but low marginal value given the main loop structure already handles these trivially. The high-value tests are `42.}`, `0..1`, `.5`, and `Float(0..1)`.

## Revised Approach

After reviewing all proposals, I revise my position on three points:

1. **Error handling: accept throw-on-first-error for v1.** My Step 1 analysis said "pragmatically acceptable" and I now commit to this fully. A2's argument is right in substance even if the justification was incomplete. The `LexResult` pattern can be adopted in T4 or later if multi-error reporting becomes a priority. For v1, simpler control flow wins.

2. **`GraftError` must extend `Error`.** A2 and A3 both identified this independently. It is a correctness bug -- vitest's `toThrow(/pattern/)` relies on the `message` property from the `Error` prototype chain. My Step 1 analysis missed this because I focused on the compiler theory aspects (token classification, grammar properties) rather than the TypeScript runtime behavior. This is a genuine blind spot of domain-focused analysis.

3. **Keep `tokens.ts` as a separate file.** Despite A2's argument for merging, the parser (T4) needs token types without depending on the lexer class. Separation costs nothing and prevents false coupling. My Step 1 position on this stands.

4. **Float fix confirmed.** My Step 1 proposal for guarding float parsing with a digit check after dot is validated by A3's independent finding of the same bug. The fix is: check `isDigit(peek(1))` before entering float mode, not just `peek(1) !== '.'`.

5. **Severity field: keep it.** A2 argues to remove it. I argue to keep it as optional with a default of `'error'`. The cost is one field. The benefit materializes in T5 (analyzer warnings). This is not YAGNI -- the spec mentions warning-level diagnostics in the analyzer phase.

6. **SINGLE_CHAR hoisted to module scope.** All agents agree on this. Confirmed.

### Revised Implementation Summary

- `diagnostics.ts`: `GraftError extends Error`, keep `severity` field (optional, default `'error'`), keep `format()` with A3's defensive guard for invalid locations. No `CompilerPhase` field for v1 (revisit in T4).
- `tokens.ts`: separate file, `Token.location` typed as `SourceLocation` (imported). Full enum as in plan.
- `lexer.ts`: throw-on-first-error, `SINGLE_CHAR` at module scope, float fix with digit guard, `readString` unchanged (spec says no escapes).
- Tests: plan's 16 tests plus A3's high-value additions (`42.}`, `0..1`, `Float(0..1)`, `.5`, empty input, CRLF). `GraftError extends Error` makes `toThrow()` tests work correctly.

## [If Forced Dissenter]

### Self-Rebuttal

My Step 1 analysis gave a convergence score of 9/10, stating the plan is "well-designed and follows standard compiler engineering practices" with "only a targeted fix needed." I now argue against this high confidence:

1. **Over-reliance on domain knowledge masked a practical bug.** I correctly identified every compiler-theory aspect (context-free lexing, maximal munch, keyword-identifier separation, k-suffix unambiguity) but missed that `GraftError` not extending `Error` would break the test suite. This is a TypeScript runtime concern, not a compiler theory concern, and my domain lens filtered it out. A 9/10 confidence score that misses a test-breaking bug is miscalibrated. **The correct score should have been 7/10.**

2. **"Only a targeted fix needed" understates the scope of decisions.** My analysis treated the error handling question (throw vs. collect) as a minor pragmatic choice. But this decision affects the entire compiler pipeline API surface. If we collect errors in the lexer but throw in the parser, the API is inconsistent. If we collect everywhere, every phase needs a result-object pattern. This is a cross-cutting architectural decision that deserves more weight than "pragmatically acceptable for v1." I dismissed it too quickly because the scanning logic itself was correct.

3. **Theoretical completeness was assumed to equal practical completeness.** I verified the TokenType enum against the spec's Section 3.2, confirmed all 60+ token types, checked k-suffix unambiguity, verified `..` vs `.` disambiguation. This theoretical completeness gave me high confidence. But theoretical completeness is necessary, not sufficient. The float bug (which I did catch) and the `GraftError` bug (which I did not catch) show that correctness requires both domain analysis AND integration testing perspective. My 9/10 implicitly weighted domain analysis too heavily.

4. **"All other aspects are correct" was too strong a claim.** I wrote "the core scanning logic is correct as-is" -- but I had not verified that the scanning logic would produce correct results for all edge cases like `42.}`, `3.x`, or bare `=`. I verified the *algorithm* was correct in theory but did not trace through specific inputs. A3's systematic edge case analysis found issues I should have found myself.

5. **My recommendation to accept the plan "with one targeted fix" was too conservative.** The plan has at least three issues: (a) float without trailing digits, (b) `GraftError` not extending `Error`, (c) `SINGLE_CHAR` allocation per call. Calling this "one targeted fix" minimized the scope of needed changes to maintain my high convergence score. This is confirmation bias -- I wanted to confirm the plan was good, so I downplayed the issues.

- **Rebuttal strength: 7/10** -- The self-criticism is valid. My domain expertise correctly identified the structural properties of the lexer but created a false sense of security about implementation details. The highest-confidence agent should be the most cautious about what their lens does NOT see.
