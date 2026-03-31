# A3-Skeptic Independent Analysis -- T2

## Potential Issues in Implementation Plan Code

1. **BUG: `readNumber` produces invalid FloatLiteral `"42."` when a dot follows digits but no digits follow the dot**: Trigger: input `42.}` or `42.)`. The code enters the float branch when it sees a `.` whose next char is not `.` (so not `..`), consumes the `.`, then the while-loop for digits finds zero digits. Result: `FloatLiteral` with value `"42."`. The spec says `float := [0-9]+ '.' [0-9]+` -- at least one trailing digit is required. -- **Severity: HIGH**

2. **BUG: `readNumber` treats `0k` as a valid `KIntegerLiteral`**: Trigger: input `0k`. The code happily emits `KIntegerLiteral` with value `"0k"` (0 * 1000 = 0). Whether this is a bug depends on spec intent -- `0k` is semantically meaningless. More importantly, `00` is accepted as `IntegerLiteral` "00" and `007` as "007" -- leading zeros are never rejected. -- **Severity: LOW** (semantics, not crash)

3. **BUG: `readString` does not handle escape sequences**: Trigger: input `"say \"hello\""`. The lexer sees `"say \"` as a complete string (matching on the backslash-escaped quote as a closing quote), then `hello` as an identifier, then `\"` as an unterminated string starting with backslash. The spec says `string := '"' [^"]* '"'` which technically excludes escapes, but real users will write them. At minimum, `\\` and `\"` should be handled or the error message should say escapes are unsupported. -- **Severity: MEDIUM**

4. **BUG: CRLF handling in `skipWhitespace` increments line but does NOT properly interact with `skipLineComment`**: Trigger: a file with CRLF line endings containing `// comment\r\n`. The `skipLineComment` method scans until `\n`, so it stops at `\r`, leaves `\r` unconsumed, and returns. Then the main loop calls `skipWhitespace`, which sees `\r` followed by `\n` and increments `line` and resets `column`. This happens to work correctly for line tracking. However, the `column` counter in `skipLineComment` is wrong: it counts `\r` as a regular character (incrementing column), which is harmless since the column resets on the next iteration. No actual bug here after careful analysis, but the `skipBlockComment` has the same non-issue -- it does NOT handle `\r` at all. If a block comment contains `\r\n`, the `\r` increments column but does not trigger a line break. The `\n` on the next iteration does. Result: the line tracking is correct but `column` is off by 1 for every line inside a CRLF block comment (the `\r` adds 1 to column before the `\n` resets it). Wait -- no, the `\r` increments column, then the loop hits `\n` which increments line and resets column to 1. The column for the `\r` itself is wrong but no token starts there. **The real bug**: `skipBlockComment` does not handle bare `\r` (old Mac line endings). If a block comment contains `\r` without `\n`, line count is wrong. -- **Severity: LOW** (bare `\r` is extremely rare)

5. **BUG: `GraftError.format()` produces wrong pointer when `location.column` is 0 or `location.line` is 0**: Trigger: if any code path constructs a `SourceLocation` with `line: 0` or `column: 0`. `lines[0 - 1]` = `lines[-1]` = `undefined`, so `line` becomes `''` (via `|| ''`). `' '.repeat(0 - 1)` = `' '.repeat(-1)` throws a `RangeError: Invalid count value: -1`. This is a **crash in the error formatter**. While the lexer always starts at line 1, column 1, if any future code creates a SourceLocation with column 0, `format()` will throw. -- **Severity: MEDIUM**

6. **BUG: `GraftError` is used both as a thrown exception and as a collected error, but the plan only throws**: The research notes say "all errors collected and reported together" and the architecture research recommends skip-and-continue. But the actual code throws `GraftError` on unexpected character and unterminated strings -- it does NOT collect errors and continue. The first error terminates lexing. -- **Severity: MEDIUM** (design intent mismatch, not a crash)

7. **BUG: bare `=`, bare `!`, and bare `-` are not handled**: Trigger: input `x = 5`. The `=` is not in `SINGLE_CHAR` and is not `==`, so `readSymbol` returns false, and the main loop throws "unexpected character '='". Same for `!` alone and `-` alone. This is arguably correct (these are not in the grammar) but the error message is poor -- it should say "expected '==' but found '='" or similar. Bare `-` is more problematic because `-` appears in no token at all except as part of `->`. -- **Severity: LOW** (correct behavior, poor error message)

8. **BUG: `peek(1)` in `readNumber` checks `this.source[this.pos + 1]` but calls it as `this.peek(1)`, which is `this.source[this.pos + 1]`**: This is correct. But in the float branch, after consuming the `.`, the code does NOT double-check via peek -- it just enters the while-loop. If the next character after `.` is not a digit (e.g., input `3.x`), zero digits are consumed and `FloatLiteral` "3." is emitted. This is the same as issue #1. -- **Severity: HIGH** (duplicate of #1)

9. **BUG: `SINGLE_CHAR` record is re-created on every call to `readSymbol`**: Trigger: any input with symbols. The object literal `{ '{': TokenType.LBrace, ... }` is allocated on every invocation. This is a performance issue, not a correctness bug. Should be a module-level constant or a class field. -- **Severity: LOW** (performance only, not correctness)

10. **BUG: String concatenation in `readString` and `readNumber` via `value += ch`**: For very long strings or numbers (thousands of characters), repeated string concatenation creates O(n^2) behavior in some JS engines. In practice, strings in Graft source files will be short, so this is theoretical. -- **Severity: LOW**

11. **BUG: The test `'reports error on unexpected character'` expects `toThrow(/unexpected character/i)` but `GraftError` is thrown, not a plain `Error`**: `GraftError` does not extend `Error`. It has a `message` property but `toThrow` with a regex matches against the error's `message` property. Vitest's `toThrow` checks: if the thrown value has a `message` property, it matches the regex against it. Since `GraftError` has `public readonly message: string`, this should work. But `GraftError` is NOT an instance of `Error`, so `toThrow()` without arguments would fail, and stack traces will be missing. -- **Severity: HIGH** (GraftError should extend Error)

12. **BUG: `readIdentifierOrKeyword` uses `isAlphaNumeric` which includes `_`, so identifiers like `__init__` or `_` are valid**: This is correct per the grammar (`[a-zA-Z_][a-zA-Z0-9_]*`). Not a bug. -- **Severity: NONE**

## Edge Case List

1. **Empty input `""`**: Expected: `[EOF]`. Current: the while-loop body is skipped, EOF is appended. Correct.

2. **Input with only whitespace `"   \n\t  "`**: Expected: `[EOF]`. Current: `skipWhitespace` consumes all, loop exits, EOF appended. Correct.

3. **Input with only comments `"// just a comment"`**: Expected: `[EOF]`. Current: `skipLineComment` consumes to end, loop continues, `pos >= length`, exits. EOF appended. Correct.

4. **Input `"// comment"` (no trailing newline)**: Expected: `[EOF]`. Current: `skipLineComment` scans to end of source without finding `\n`, exits. Correct.

5. **Unterminated block comment `"/* never closed"`**: Expected: error. Current: `skipBlockComment` throws `GraftError`. Correct.

6. **Nested block comments `"/* outer /* inner */ still outer */"`**: Expected: either error or treat as nested. Current: the lexer finds the FIRST `*/` (after "inner") and closes the comment. Then ` still outer ` is lexed as tokens, and `*/` is lexed as `*` (unexpected char error) and `/` (Slash). **The lexer does not support nested block comments**. This matches most languages but should be documented. -- Behavior: incorrect lex but not a crash.

7. **Number `0.0.0`**: Expected: error or `FloatLiteral("0.0")` then `Dot(".")` then `IntegerLiteral("0")`. Current: `readNumber` consumes `0`, sees `.`, peeks next char `0` (not `.`), enters float branch, consumes `.0`, emits `FloatLiteral("0.0")`. Then main loop sees `.`, `readSymbol` emits `Dot(".")`. Then `0` emits `IntegerLiteral("0")`. Result: `[FloatLiteral("0.0"), Dot("."), IntegerLiteral("0"), EOF]`. This is actually reasonable.

8. **Number `4k5`**: Expected: `KIntegerLiteral("4k")` then `IntegerLiteral("5")`. Current: `readNumber` consumes `4`, sees `k`, consumes it, emits `KIntegerLiteral("4k")`. Then main loop sees `5`, calls `readNumber`, emits `IntegerLiteral("5")`. Correct separation.

9. **Leading dot `.5`**: Expected: `Dot(".")` then `IntegerLiteral("5")`. Current: `.` is not a digit, so `readNumber` is not called. `readSymbol` checks `.` -- peeks next char `5`, which is not `.`, so emits `Dot(".")`. Then `5` emits `IntegerLiteral("5")`. Correct -- `.5` is not a valid float in Graft.

10. **Range after int `1..2`**: Expected: `IntegerLiteral("1"), DotDot(".."), IntegerLiteral("2")`. Current: `readNumber` consumes `1`, sees `.`, peeks next char `.`, enters the `if (this.peek(1) === '.')` branch, emits `IntegerLiteral("1")`. Then main loop handles `..` as `DotDot`. Then `2` as `IntegerLiteral`. Correct.

11. **Empty string `""`**: Expected: `StringLiteral("")`. Current: `readString` skips opening `"`, immediately sees closing `"`, emits `StringLiteral` with value `""`. Correct.

12. **Keyword prefix: `"nodeType"`**: Expected: `Identifier("nodeType")`. Current: `readIdentifierOrKeyword` consumes all alphanumeric chars including `T`, `y`, `p`, `e`. Looks up `"nodeType"` in KEYWORDS -- not found -- emits `Identifier`. Correct.

13. **Unicode in string: `"hello "`**: Expected: `StringLiteral("hello ")`. Current: the lexer reads byte by byte using bracket indexing. JavaScript strings are UTF-16. The emoji is read character by character. The `!== '"'` check works because emoji chars are not `"`. However, `column` tracking will be wrong for characters outside BMP (surrogate pairs count as 2 positions in JS string indexing but should be 1 column). -- Minor issue.

14. **Unicode in identifier: `"cafe"`**: Expected: error on non-ASCII character. Current: `isAlpha` only accepts `a-z`, `A-Z`, `_`. An accented character would fall through to "unexpected character". This is correct but means Unicode identifiers are not supported.

15. **`\r\n` in string literal**: Expected: error (unterminated string). Current: `readString` checks for `\n` but NOT for `\r`. Input `"hello\r\nworld"` -- the lexer sees `\r` (not `\n`, not `"`), adds it to value, advances. Then sees `\n`, throws unterminated string. The value would contain `\r`. But more importantly, the error location's line number would be wrong since `\r` was not counted as a line break in `readString`. -- **Severity: LOW**

## Proposed Implementation

### Defensive Implementation Points

- **`readNumber` -- validate trailing digits after decimal point**:
```typescript
// After consuming '.', verify at least one digit follows
if (this.pos < this.source.length && this.source[this.pos] === '.') {
  if (this.peek(1) === '.') {
    // DotDot case -- emit integer
    this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
    return;
  }
  const nextAfterDot = this.peek(1);
  if (nextAfterDot === undefined || !this.isDigit(nextAfterDot)) {
    // Dot not followed by digit -- emit integer, leave dot for symbol handling
    this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
    return;
  }
  // Consume dot and digits
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
```

- **`GraftError` -- extend `Error`**:
```typescript
export class GraftError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
  ) {
    super(message);
    this.name = 'GraftError';
  }
  // format() stays the same
}
```

- **`GraftError.format()` -- guard against invalid location**:
```typescript
format(source: string): string {
  const lines = source.split('\n');
  const lineIdx = this.location.line - 1;
  const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
  const col = Math.max(0, this.location.column - 1);
  const pointer = ' '.repeat(col) + '^';
  // ... rest unchanged
}
```

- **`SINGLE_CHAR` -- hoist to module level or class static**:
```typescript
const SINGLE_CHAR: Record<string, TokenType> = {
  '{': TokenType.LBrace,
  // ... etc
};
```

### Additional Test Cases

```typescript
it('handles empty input', () => {
  const tokens = new Lexer('').tokenize();
  expect(tokens).toEqual([{ type: TokenType.EOF, value: '', location: { line: 1, column: 1, offset: 0 } }]);
});

it('handles whitespace-only input', () => {
  const tokens = new Lexer('   \n\t\n  ').tokenize();
  expect(tokens.map(t => t.type)).toEqual([TokenType.EOF]);
});

it('handles comment-only input', () => {
  const tokens = new Lexer('// just a comment').tokenize();
  expect(tokens.map(t => t.type)).toEqual([TokenType.EOF]);
});

it('handles single-line comment without trailing newline', () => {
  const tokens = new Lexer('node // trailing').tokenize();
  expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.EOF]);
});

it('rejects unterminated block comment', () => {
  expect(() => new Lexer('/* never closed').tokenize()).toThrow(/unterminated block comment/i);
});

it('does not treat integer followed by dot-non-digit as float', () => {
  // 42.} should be IntegerLiteral(42), Dot, RBrace -- NOT FloatLiteral(42.)
  const tokens = new Lexer('42.}').tokenize();
  expect(tokens[0]).toMatchObject({ type: TokenType.IntegerLiteral, value: '42' });
  expect(tokens[1]).toMatchObject({ type: TokenType.Dot, value: '.' });
  expect(tokens[2]).toMatchObject({ type: TokenType.RBrace, value: '}' });
});

it('correctly lexes range expression 0..1', () => {
  const tokens = new Lexer('0..1').tokenize();
  expect(tokens.map(t => t.type)).toEqual([
    TokenType.IntegerLiteral, TokenType.DotDot, TokenType.IntegerLiteral, TokenType.EOF,
  ]);
});

it('handles empty string literal', () => {
  const tokens = new Lexer('""').tokenize();
  expect(tokens[0]).toMatchObject({ type: TokenType.StringLiteral, value: '' });
});

it('does not treat keyword prefix as keyword', () => {
  const tokens = new Lexer('nodeType edgeCase').tokenize();
  expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'nodeType' });
  expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: 'edgeCase' });
});

it('handles CRLF line endings', () => {
  const tokens = new Lexer('node\r\nedge').tokenize();
  expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
  expect(tokens[1].location).toEqual({ line: 2, column: 1, offset: 6 });
});

it('rejects bare = as unexpected character', () => {
  expect(() => new Lexer('x = 5').tokenize()).toThrow(/unexpected character/i);
});

it('handles Float(0..1) pattern from spec', () => {
  const tokens = new Lexer('Float(0..1)').tokenize();
  expect(tokens.map(t => t.type)).toEqual([
    TokenType.Float, TokenType.LParen,
    TokenType.IntegerLiteral, TokenType.DotDot, TokenType.IntegerLiteral,
    TokenType.RParen, TokenType.EOF,
  ]);
});

it('handles leading-dot as Dot + Integer, not float', () => {
  const tokens = new Lexer('.5').tokenize();
  expect(tokens[0]).toMatchObject({ type: TokenType.Dot });
  expect(tokens[1]).toMatchObject({ type: TokenType.IntegerLiteral, value: '5' });
});
```

### Error Handling Improvements

1. **`GraftError` must extend `Error`**: Without this, stack traces are lost, `instanceof Error` checks fail, and some test frameworks may not catch it properly with `toThrow`. This is the single most impactful fix.

2. **Error collection instead of throwing**: The plan throws on the first error, but the spec and research both say errors should be collected. Recommendation: add an `errors: GraftError[]` field to the Lexer, push errors there, and only throw at the end if `errors.length > 0` (or return errors alongside tokens). This allows the user to see multiple errors at once. However, for unterminated strings and block comments, continuing is hard -- these should still abort.

3. **Better error messages for bare operators**: Instead of `Unexpected character '='`, say `Unexpected character '='. Did you mean '=='?`. Similarly for `!` (suggest `!=`) and `-` (suggest `->`).

4. **`format()` should handle empty source gracefully**: If `source` is `""`, `lines` is `[""]`, `lines[0]` is `""`. With `line: 1, column: 1`, pointer is `"^"`. This is actually fine. But `source` being `undefined` or `null` would crash on `.split()`. Add a guard: `const lines = (source || '').split('\n');`.

## Self-Assessment
- Convergence score: 7
- Basis: Found one genuine HIGH bug (float without trailing digits, issue #1/#8) and one design issue that is arguably HIGH (GraftError not extending Error, issue #11). The error collection vs. throwing mismatch (issue #6) is a design decision that other agents may disagree on. The CRLF and edge case analysis is thorough. The `SINGLE_CHAR` allocation issue is real but low impact. Score is 7 rather than higher because some issues (nested comments, bare `\r`, Unicode columns) are edge cases that may be deferred, and other agents may present compelling counter-arguments for the error-collection approach.
