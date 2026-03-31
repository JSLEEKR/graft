# A3-Skeptic Cross-Critique -- T2

## Critique of Other Agents

### On A1-Architect

- **LexResult return type creates a partial-token problem that A1 does not fully address**: A1's error recovery for unterminated strings emits a partial `StringLiteral` token into the token stream alongside the error. A1 acknowledges this ("downstream phases must tolerate") and dismisses it as low risk because "the compiler will typically halt before parsing." But this is a design contradiction -- the entire point of `LexResult` with error collection is to enable continued processing. If the compiler halts on errors anyway, `LexResult` offers no advantage over throwing. If it does NOT halt, the parser receives a malformed token stream containing partial string literals. A1 needs to pick one: either commit to full error recovery (and define what partial tokens look like so the parser can skip them) or accept throw-on-first-error for v1 and drop the `LexResult` wrapper. The middle ground is the worst of both worlds.

- **CompilerPhase on GraftError is premature**: A1 adds `phase?: CompilerPhase` to `GraftError`. In v1, only the lexer produces `GraftError`. The parser (T4) and analyzer (T5) will also produce them, but adding `phase` now forces all three phases to set it correctly or risk leaving it `undefined`. The optional nature means consumers cannot rely on it being present. This is a textbook case of "optional field that is sometimes set" -- the most bug-prone pattern in TypeScript. Better to add `phase` in T4 when there are actually multiple phases producing errors, and make it required at that point.

- **ASCII error formatting is correct but the location is stored on the class wrong**: A1's `GraftError` is NOT extending `Error`. A1 copied the plan's standalone class design. This means `throw new GraftError(...)` throws an object that is not an `instanceof Error`, has no stack trace, and may not be caught by generic `catch (e: Error)` patterns. A2 correctly identified this as a bug. A1 missed it entirely despite focusing on "architecture."

### On A2-Pragmatist

- **Merging tokens.ts into lexer.ts creates an unnecessary refactoring burden for T4**: A2 argues "fewer files = fewer import paths to get wrong." But when T4 arrives, the parser needs `TokenType` and `Token`. If these are exported from `lexer.ts` (a 200+ line file), the parser imports from the lexer -- creating a conceptual dependency where the parser "depends on the lexer" rather than both depending on shared types. The conventional compiler architecture keeps type definitions separate precisely so the parser and lexer share a vocabulary without depending on each other's implementation. The plan's `tokens.ts` is ~60 lines and serves as this shared vocabulary. Merging it saves one file at the cost of a worse dependency graph. This is false economy.

- **Removing severity from GraftError is reasonable for v1 but creates a gratuitous diff in T4/T5**: When warnings are needed (e.g., "unused context field" in the analyzer), someone must add `severity` back. A2 says "two-line change to add it back." True, but adding it also requires updating every existing `new GraftError(...)` call site if the constructor signature changes. Keeping `severity` with a default of `'error'` costs nothing now and avoids the future change. This is not YAGNI -- it is a defaulted parameter that documents intent.

- **A2 correctly identified the `Error` inheritance bug**: This is the most important single fix across all proposals. A2's `GraftError extends Error` with `this.name = 'GraftError'` is the right pattern. Credit where due.

- **A2's throw-on-first-error is pragmatically correct for v1**: The error collection debate (A1 vs A2) tilts in A2's favor for v1. Collecting errors requires defining recovery strategies for every error type. For unterminated strings, what tokens does the lexer emit? For unexpected characters, does it skip one byte or try to resync? These are non-trivial design decisions that slow down T2 for marginal user benefit. Throw-on-first-error is simple, testable, and sufficient. Error collection can be added in a future iteration when the full compiler pipeline exists and the recovery strategies can be tested end-to-end.

### On A4-Specialist

- **A4 dismissed the `GraftError extends Error` issue entirely**: A4's analysis does not mention that `GraftError` is a plain class that doesn't extend `Error`. A4 assessed convergence at 9 ("only a targeted fix is needed") but missed the highest-impact bug that A2 and I both identified. This is a blind spot from focusing too narrowly on compiler theory and not enough on TypeScript runtime semantics.

- **A4's float fix is correct but the condition is overly defensive**: A4 writes `this.peek(1) !== '.' && this.peek(1) !== undefined && this.isDigit(this.peek(1)!)`. The `!== '.'` check is redundant when `isDigit` is also checked -- no digit is a dot. The condition should simply be: if `peek(1)` exists and is a digit, enter float mode; otherwise emit integer. Two conditions, not three. Minor, but unnecessary conditions are places where bugs hide.

- **A4's claim that the TokenType enum is "complete" deserves scrutiny**: A4 cross-checked against "Section 3.2" but did not verify whether there are edge cases in the spec that introduce new symbols or keywords not in the enum. For example, does the spec mention `@` for annotations, `#` for directives, or `$` for variables? If any of these appear later, the enum needs extending. A4's high confidence (9/10) assumes the spec is fully enumerated, which is a risky assumption for a v1 spec. That said, missing enum members is easy to add -- this is LOW severity.

- **A4 correctly validated the `..` vs `.` disambiguation**: A4's analysis of `Float(0..1)` confirms the plan handles the trickiest lexing case correctly. This is valuable domain expertise that the other agents referenced but did not verify as carefully.

## Revised Approach

After reviewing all four analyses, I revise my Step 1 position as follows:

### Changes adopted from other agents

1. **`GraftError extends Error`** (from A2): Adopt. This is a correctness fix. Without it, `toThrow()` matchers, `instanceof Error` checks, and stack traces all break. My Step 1 already flagged this (issue #11) but A2 provided the cleanest implementation.

2. **Throw-on-first-error for v1** (from A2, supported by A4): Adopt. My Step 1 hedged on error collection vs throwing (issue #6). After seeing A2's argument and A4's pragmatic acceptance, I agree: throw for v1, collect for v2. The `LexResult` wrapper (A1) is premature.

3. **Keep `tokens.ts` as a separate file** (against A2): Maintain the plan's two-file structure. The parser in T4 should import `Token` and `TokenType` from `tokens.ts`, not from `lexer.ts`. This is the standard compiler architecture and avoids the conceptual dependency A2 would create.

4. **Keep `severity` on `GraftError`** (against A2, with A1): Keep the field with a default value. Cost is zero. Benefit materializes in T5. Not YAGNI -- it is a defaulted constructor parameter.

5. **Float digit-guard fix** (from A4, matching my issue #1): Adopt A4's fix but simplify the condition to remove the redundant `!== '.'` check.

### Changes maintained from my Step 1

6. **`readNumber` must validate trailing digits after `.`** (my issue #1): This remains the highest-impact bug. All agents except A2 identified it. A2's code has the bug.

7. **`SINGLE_CHAR` hoisted to module scope** (my issue #9, also A2): All agents agree. Trivial fix.

8. **`format()` guard against invalid column** (my issue #5): Still valid. `Math.max(0, column - 1)` prevents `RangeError` on `' '.repeat(-1)`. No other agent addressed this.

9. **Additional test cases**: My Step 1 tests for `42.}` (float without trailing digits), empty input, CRLF, `Float(0..1)`, and `.5` remain valuable. Several overlap with A4's recommendations, confirming their importance.

### Items I am dropping

10. **Error collection / `LexResult`**: Dropped for v1 per revised position #2 above. Will return in a future iteration.

11. **Better error messages for bare operators** ("Did you mean '=='?"): Nice-to-have but YAGNI for v1. The generic "unexpected character" message is sufficient. Dropping to avoid scope creep.

12. **`\r` handling in `readString`** (my issue #15 in edge cases): Bare `\r` in string literals is extremely rare. The current behavior (treating `\r` as string content until `\n` is hit) is acceptable for v1. Not worth the code complexity to handle.

### Final position on error handling API

```typescript
// v1: throw on first error
tokenize(): Token[]  // throws GraftError

// v2 (future): collect errors
tokenize(): LexResult  // { tokens: Token[]; errors: GraftError[] }
```

This is simpler, testable with `toThrow()`, and matches A2's approach. The upgrade path to `LexResult` is straightforward when error collection is actually needed.
