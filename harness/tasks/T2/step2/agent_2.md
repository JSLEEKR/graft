# A2-Pragmatist Cross-Critique — T2

## Critique of Other Agents

### On A1-Architect
- **Agree**: `GraftError` should use `SourceLocation` in `Token` interface rather than inlining the shape. Structural typing means it works either way in TypeScript, but a single import prevents drift. I already adopted this in my Step 1.
- **Agree**: ASCII in `format()` instead of emoji. Same conclusion I reached independently.
- **Agree**: `SINGLE_CHAR` should be module-level. Same conclusion.
- **Disagree**: `LexResult { tokens, errors }` return type — this is premature.
  - Over-abstraction detected: **Yes** — The spec says "all errors collected," but for v1 the lexer will realistically encounter one fatal error (unterminated string, unexpected char) and stop. Multi-error recovery in a lexer requires skip-and-continue logic that is non-trivial to get right (where do you resume after an unterminated string?). A1's `readString` pushes a partial `StringLiteral` token on error, which pollutes the token stream and forces every downstream consumer to handle garbage tokens. The throw-on-first-error approach is simpler, correct, and sufficient for v1. The upgrade path to `LexResult` later is straightforward (change return type, wrap errors). Building it now adds API surface that nobody consumes.
  - Basis: YAGNI. The parser (T4) won't be designed to handle partial token streams from a lexer that encountered errors. If the lexer errors, the pipeline halts. There is no v1 consumer that benefits from `LexResult`.
- **Disagree**: `CompilerPhase` type and `phase` field on `GraftError`. Adding an optional `phase` field costs one line, yes, but it also means every `new GraftError(...)` call site gains a fourth argument. In v1 there is only one phase that creates errors (the lexer). The field will always be `'lexer'` or omitted. This is textbook YAGNI. Add it in T4 when the parser actually needs it.
  - Over-abstraction detected: **Yes** — mild, but unnecessary for T2.
- **Agree**: `GraftError` not extending `Error` is a bug in the plan. A1 did not call this out explicitly (their `GraftError` is still a plain class, not extending `Error`). This is a real issue — see A3's analysis.
- **Agree**: D7 (string value without quotes) is correct and worth noting.
- **Agree**: D8 (dependency DAG: diagnostics -> tokens -> lexer) is clean. Though I merged tokens into lexer, the DAG still holds: diagnostics -> lexer.

### On A3-Skeptic
- **Agree**: Issue #1/#8 (float without trailing digits) is a genuine HIGH bug. Input `42.}` would produce `FloatLiteral("42.")` which violates the spec grammar `[0-9]+ '.' [0-9]+`. The fix is to peek for a digit after the dot before entering float mode. All four agents converge on this fix — it is unambiguous.
- **Agree**: Issue #11 (`GraftError` must extend `Error`) is HIGH. Without it, `toThrow(/pattern/)` in vitest may not match correctly, stack traces are lost, and `instanceof Error` checks fail. My Step 1 already proposed this fix with the same rationale.
- **Agree**: Issue #9 (`SINGLE_CHAR` re-created per call) — minor but free to fix. Already in my Step 1.
- **Disagree**: Issue #3 (escape sequences in strings) is labeled MEDIUM but should be LOW/deferred. The spec explicitly defines `string := '"' [^"]* '"'` — no escape sequences. Adding `\\` and `\"` handling is scope creep for T2. If the spec changes, we change the lexer. The error message is already clear enough ("unterminated string literal") even when a user tries to use escapes.
- **Disagree**: Issue #6 (error collection vs throwing) — A3 correctly identifies the mismatch between spec/research and implementation. However, A3 then recommends adding `errors: GraftError[]` to the Lexer, which is the same `LexResult` pattern A1 proposes. For v1, throwing is simpler and sufficient. See my critique of A1 above.
- **Agree**: Issue #5 (`format()` crash on column 0) is worth a defensive guard. The `Math.max(0, this.location.column - 1)` fix is one line and prevents a `RangeError`. Cheap insurance.
- **Agree**: Issue #7 (bare `=`, `!`, `-`) — correct behavior, poor error message. But better error messages are nice-to-have, not v1 requirements. Defer.
- **Agree**: The additional test cases A3 proposes are excellent. Specifically: empty input, whitespace-only, comment-only, `42.}` (the float bug), `0..1` range, empty string `""`, keyword prefix (`nodeType`), CRLF, and `Float(0..1)` pattern. These should be adopted. They test real edge cases without redundancy.
- **Disagree**: The CRLF test expects `offset: 6` for `node\r\nedge`. Let me verify: `n`=0, `o`=1, `d`=2, `e`=3, `\r`=4, `\n`=5, `e`=6. Yes, offset 6 is correct. Actually I agree with the test, I just wanted to verify.

### On A4-Specialist
- **Agree**: The float digit-guard fix is the right approach. A4's code is the clearest expression of the fix — combining `this.peek(1) !== '.'` and `this.isDigit(this.peek(1)!)` into a single conditional. Clean and correct.
- **Agree**: All domain analysis points are sound. k-suffix is unambiguous, `Float(0..1)` disambiguation is correct, bare `-`/`=`/`!` behavior is correct per grammar, `const enum` rejection is right.
- **Agree**: TokenType completeness check against spec Section 3.2 is valuable validation. No missing types.
- **Agree**: "accept throw-on-first-error for v1, upgrade to error collection later" matches my position exactly.
- **Agree**: The `Token[]` return type (not `TokenStream` wrapper) is the right call. The parser uses array indexing directly.
- **Minor disagreement**: A4 says "all other plan code should be adopted as-is," but the plan's `GraftError` does not extend `Error`. This needs fixing. A4 did not catch this bug (it was A3 and me who flagged it).
- **Agree**: A4's convergence score of 9 is justified. The plan is fundamentally sound; only the float fix and `Error` inheritance are real issues.

## Revised Approach

After reviewing all agents, my revised approach incorporates these changes from my Step 1:

### Confirmed (keeping from my Step 1)
1. **`GraftError extends Error`** — all agents who addressed this agree it is a bug fix, not a preference. Unanimous.
2. **Remove `severity` field from `GraftError`** — v1 has no warnings. A1 wants to keep it (with `CompilerPhase`); A3 keeps it; A4 does not comment. I maintain this is YAGNI. One-line addition later if needed.
3. **Throw on first error, not `LexResult`** — A2 (me) and A4 agree. A1 wants `LexResult`. A3 recommends collection but acknowledges throwing is simpler. Pragmatic choice: throw for v1.
4. **`SINGLE_CHAR` at module scope** — all agents agree.
5. **ASCII in `format()` output** — A1 and A2 agree. Others do not object.

### Changed (incorporating critiques)
1. **Keep `tokens.ts` as a separate file** — I proposed merging into `lexer.ts` in Step 1. On reflection, A1's DAG argument (`diagnostics -> tokens -> lexer`) is cleaner with separate files. The parser (T4) will import `Token` and `TokenType` from `tokens.ts` — it should not need to import from `lexer.ts`. Two small files with clear responsibilities is better than one 200-line file when there are multiple downstream consumers. I retract the merge.
2. **Add the float digit-guard fix** — adopt A4's conditional: require `isDigit(peek(1))` before entering float mode. This fixes the `42.}` bug that A3 identified and A4 provided the cleanest fix for.
3. **Add `format()` defensive guard** — adopt A3's `Math.max(0, column - 1)` guard. One line, prevents a crash on invalid locations.
4. **Adopt A3's additional test cases** — specifically: empty input, whitespace-only, comment-only, `42.}` float guard, `0..1` range, empty string, keyword prefix, CRLF, `Float(0..1)` pattern. These cover real edge cases the plan's tests miss.

### Rejected
1. **`LexResult` return type** (A1) — YAGNI for v1. No consumer benefits.
2. **`CompilerPhase` on `GraftError`** (A1) — YAGNI for T2. Add in T4.
3. **Escape sequence handling** (A3) — spec says no escapes. Defer.
4. **Better error messages for bare operators** (A3) — nice-to-have, not v1. Defer.
5. **Merge `tokens.ts` into `lexer.ts`** (my own Step 1) — retracted per A1's DAG argument.

### Summary of final position
- Three files: `diagnostics.ts`, `tokens.ts`, `lexer.ts`
- `GraftError extends Error`, no `severity`, no `phase`
- `Token.location` typed as `SourceLocation` (imported)
- `tokenize()` returns `Token[]`, throws `GraftError` on errors
- Float parsing guarded with digit check after dot
- `SINGLE_CHAR` at module scope
- `format()` with defensive column guard
- ~20 tests covering happy path + edge cases + error cases
