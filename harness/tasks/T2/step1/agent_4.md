# A4-Specialist Independent Analysis -- T2

## Domain Analysis

### Compiler Theory Context for This Task

- **Context-free lexing**: A lexer should classify every token without parser context. The plan's grammar is fully context-free -- no token requires knowledge of surrounding syntactic structure. This is the correct property for a hand-written recursive descent parser, where the lexer is a pure preprocessing stage.
- **Maximal munch**: The plan correctly applies maximal munch for multi-character operators (`->`, `>=`, `..`, `==`, `!=`). One character of lookahead is sufficient for all Graft operators. No ambiguity exists.
- **Keyword/identifier separation**: The identifier-then-lookup pattern is the standard approach (used by virtually all production compilers: Go, Rust, TypeScript itself). It avoids reserving keywords at the character level and handles snake_case keywords (`on_failure`, `max_tokens`) naturally.

### Domain Fitness of Implementation Plan Code

**Appropriate parts:**

1. **Class-based single-pass scanner** -- correct for Graft's grammar, which has no context-dependent lexing (no string interpolation, no significant whitespace, no heredocs). The mutable cursor state (`pos`, `line`, `column`) is the standard approach.

2. **String enum for TokenType** -- readable debug output, good TypeScript ergonomics. The ~60 members are well within the range where string enums are appropriate. `const enum` was correctly rejected (breaks `isolatedModules`).

3. **`peek(offset)` method** -- clean abstraction for lookahead. The plan uses `peek(1)` consistently. The implementation is correct: `source[pos + offset]` returns `undefined` past end-of-string, which fails all equality checks safely.

4. **Number lexing with double-peek for `..` vs `.`** -- this is the critical disambiguation. When the scanner sees `0.`, it must distinguish `0.7` (float) from `0..1` (integer, range operator, integer). The plan checks `peek(1) === '.'` after seeing `.` -- if the next character after the dot is another dot, it emits `IntegerLiteral` and leaves the `..` for the symbol scanner. This is correct.

5. **CRLF handling in `skipWhitespace`** -- Option B (treat `\r` as part of line ending, preserve original offsets) is the correct choice per the research. The implementation handles `\r\n` as a single line break and lone `\r` as a line break. Offset integrity is maintained.

6. **KEYWORDS record** -- plain object with O(1) lookup via V8 hidden classes. Appropriate for ~40 entries.

**Issues identified:**

1. **Type keywords in the KEYWORDS map create a semantic ambiguity** (MINOR, but worth documenting).

   The plan places `String`, `Int`, `Float`, `Bool`, `List`, `Map`, `Optional`, `TokenBounded`, `FilePath`, `FileDiff`, `TestFile`, `IssueRef` in the KEYWORDS map. This means a user cannot name a context, node, or produces block `String`, `Map`, etc. This is actually *correct* behavior -- these are reserved type names in the Graft language. However, the spec's identifier convention says PascalCase is for "types, nodes, graphs, contexts." If someone writes `node String(...)`, the lexer emits `TokenType.String` instead of `TokenType.Identifier`, and the parser must handle this. Since the parser expects `TokenType.Identifier` after `node`, this would produce a parse error -- which is the desired behavior (you should not name a node `String`).

   **Verdict**: correct as-is. The type keywords being reserved prevents name collisions. No change needed.

2. **Error recovery is inconsistent** (MODERATE concern).

   The spec says "all errors collected and reported together." The research (`research_arch.md`) recommends skip-and-continue with error collection. But the plan's lexer implementation uses `throw` for errors:
   - `throw new GraftError('Unexpected character...')` (line 575-578)
   - `throw new GraftError('Unterminated string literal...')` (line 645, 652)
   - `throw new GraftError('Unterminated block comment...')` (line 635)

   The tests also expect `throw`: `expect(() => lexer.tokenize()).toThrow(...)`.

   This means the lexer fails on the *first* error rather than collecting all errors. For v1, throwing on first error is pragmatically acceptable (simpler implementation, and users typically fix one error at a time). However, the spec explicitly states "all errors collected and reported together." This is a deviation.

   **Recommendation**: For v1, accept throw-on-first-error. The `GraftError` class already has `SourceLocation`, so upgrading to error collection later is straightforward (accumulate into `this.errors: GraftError[]`, skip bad characters, return errors alongside tokens). Document this as a known v1 limitation. Do not over-engineer now.

3. **Float literal without trailing digits** (MINOR edge case).

   The `readNumber` method, after consuming the `.`, enters a while loop for digits. If there are no digits after the dot (e.g., `42.` followed by a non-digit), the method emits a `FloatLiteral` with value `"42."`. The spec defines float as `[0-9]+ '.' [0-9]+` (requiring digits on both sides). The lexer should either:
   - (a) Check that at least one digit follows the `.` before entering float mode (peek for digit, not just for non-`.`), or
   - (b) Accept `42.` as a valid float (but this contradicts the spec).

   The plan's code currently checks `peek(1) === '.'` to detect `..`, but does NOT check that `peek(1)` is a digit before entering float mode. If the input is `42.abc`, the lexer will emit `FloatLiteral("42.")` -- which is wrong per the spec.

   **Recommendation**: After confirming the next char is NOT `.` (ruling out `..`), also check that the next char IS a digit before consuming the decimal point. If not a digit, emit `IntegerLiteral` and leave the `.` for the symbol scanner. Concretely:

   ```typescript
   // Current (problematic):
   if (this.pos < this.source.length && this.source[this.pos] === '.') {
     if (this.peek(1) === '.') {
       // DotDot case -- correct
     }
     // Falls through to float parsing even if no digit follows

   // Fixed:
   if (this.pos < this.source.length && this.source[this.pos] === '.') {
     if (this.peek(1) === '.') {
       this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
       return;
     }
     if (this.peek(1) !== undefined && this.isDigit(this.peek(1)!)) {
       // Consume decimal and fractional digits
     } else {
       this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
       return;
     }
   }
   ```

4. **k-suffix lexical ambiguity** (NON-ISSUE, confirmed safe).

   The `k` suffix only applies after a digit sequence. Since identifiers cannot start with digits (`isAlpha` requires `[a-zA-Z_]`), there is no ambiguity. `4k` is always a k-integer, never an identifier. The token `k` by itself (as an identifier) is handled correctly: it starts with a letter, goes through `readIdentifierOrKeyword`, and emits `Identifier("k")`. No collision.

5. **`-` as standalone token** (NON-ISSUE for v1).

   The plan's symbol scanner handles `-` only as part of `->`. A bare `-` (e.g., negative numbers, subtraction) falls through to the "unexpected character" error. The v1 grammar has no subtraction or negative literals, so this is correct. Negative numbers in the grammar (if needed) would be handled as unary operators in the parser, not the lexer -- which is the standard approach.

6. **Single-char `=` and `!`** (CORRECT as error).

   Bare `=` and bare `!` are not in the Graft grammar. The lexer correctly does not handle them as single-character symbols. `=` will fall through to "unexpected character" if not followed by `=`. Same for `!` not followed by `=`. This is correct.

## Proposed Implementation

### Domain-Optimized Code

The plan's code is fundamentally sound. I propose adopting it with one targeted fix:

**Fix: guard float parsing with digit check after dot.**

In `readNumber()`, replace the float detection logic:

```typescript
private readNumber(): void {
  const loc = this.location();
  let value = '';
  while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
    value += this.source[this.pos];
    this.pos++;
    this.column++;
  }

  // Check for k-suffix
  if (this.pos < this.source.length && this.source[this.pos] === 'k') {
    value += 'k';
    this.pos++;
    this.column++;
    this.tokens.push({ type: TokenType.KIntegerLiteral, value, location: loc });
    return;
  }

  // Check for float (requires digit after dot; dot-dot is range operator)
  if (
    this.pos < this.source.length &&
    this.source[this.pos] === '.' &&
    this.peek(1) !== '.' &&
    this.peek(1) !== undefined &&
    this.isDigit(this.peek(1)!)
  ) {
    value += '.';
    this.pos++;
    this.column++;
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }
    this.tokens.push({ type: TokenType.FloatLiteral, value, location: loc });
    return;
  }

  this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
}
```

The key change: float parsing now requires `this.isDigit(this.peek(1)!)` in addition to `this.peek(1) !== '.'`. This ensures `42.` (no trailing digit) emits `IntegerLiteral("42")` + `Dot`, matching the spec's `[0-9]+ '.' [0-9]+` definition.

All other plan code (tokens.ts, diagnostics.ts, tests) should be adopted as-is.

### Graft-Specific Considerations

- **k-suffix parsing**: Handled correctly by the plan. Digit-first scan, then check for trailing `k`. Lexically unambiguous because identifiers cannot start with digits. The value stored is `"4k"` (the raw text); conversion to `4000` happens in the parser or analyzer, not the lexer. This is the correct separation of concerns.

- **Budget shorthand `4k/2k`**: Lexes as three tokens: `KIntegerLiteral("4k")`, `Slash`, `KIntegerLiteral("2k")`. The parser interprets the slash as budget separator contextually. This is clean -- the lexer does not need to understand budget semantics.

- **`Float(0..1)` range type**: Lexes as `Float`, `LParen`, `IntegerLiteral("0")`, `DotDot`, `IntegerLiteral("1")`, `RParen`. The double-peek correctly distinguishes `0..1` (integer + range) from `0.1` (float). This is the trickiest lexing case in Graft and the plan handles it correctly.

- **Pipe transforms**: The `|` is a simple single-character token (`Pipe`). No ambiguity with any other operator. The parser chains pipe expressions.

- **Source locations**: `(line, column, offset)` is sufficient for all downstream needs -- error messages, source maps, editor integration. Line/column are 1-based (human-friendly), offset is 0-based (machine-friendly). Snapshots taken at token start. This is standard.

- **Token stream**: `Token[]` is sufficient for a recursive descent parser. The parser maintains its own cursor index into the array. A `TokenStream` wrapper would add an abstraction layer that is unnecessary for v1 -- the parser can use `tokens[pos]`, `tokens[pos + 1]` for lookahead. If the parser grows complex enough to need `expect()`, `match()`, `advance()` helpers, those can be methods on the `Parser` class itself rather than a separate `TokenStream`.

- **TokenType completeness**: The enum covers all spec grammar elements. Cross-checking against the spec's Section 3.2:
  - All 30 keywords present (including `on_failure`, `max_tokens` as snake_case keywords)
  - All 12 type keywords present (`String`, `Int`, `Float`, `Bool`, `List`, `Map`, `Optional`, `TokenBounded`, `FilePath`, `FileDiff`, `TestFile`, `IssueRef`)
  - All 4 literal types present (`IntegerLiteral`, `KIntegerLiteral`, `FloatLiteral`, `StringLiteral`)
  - Note: `BooleanLiteral` is not needed because `true`/`false` are keywords (`TokenType.True`, `TokenType.False`). This is the standard approach.
  - All 18 symbols present (6 brackets/delimiters + 6 two-char operators + 6 single-char operators)
  - `EOF` sentinel present
  - No missing token types identified

### Additional Test Recommendations

The plan's 16 tests cover the core cases well. A few additional tests to consider (but not strictly required for v1):

1. **`Float(0..1)` disambiguation**: `new Lexer('0..1')` should produce `IntegerLiteral("0")`, `DotDot`, `IntegerLiteral("1")`.
2. **`42.` without trailing digit** (if the fix above is adopted): should produce `IntegerLiteral("42")`, `Dot`.
3. **Empty input**: `new Lexer('')` should produce just `[EOF]`.
4. **Consecutive comments**: verify line tracking across multiple comment types.

## Self-Assessment

- Convergence score: **9**
- Basis: The plan's lexer implementation is well-designed and follows standard compiler engineering practices. The only substantive issue is the missing digit-guard on float parsing (issue #3), which is a real bug that would produce incorrect tokens for edge-case inputs like `42.abc`. All other aspects -- token classification, keyword handling, k-suffix, `..` vs `.` disambiguation, source location tracking, CRLF handling -- are correct. The error recovery deviation from spec (throw vs collect) is pragmatically acceptable for v1. The TokenType enum is complete for the v1 grammar. High convergence because the plan is already well-engineered; only a targeted fix is needed.
