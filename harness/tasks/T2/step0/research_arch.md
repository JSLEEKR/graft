# T2 Architecture Research: Token Types & Lexer

## 1. Lexer Architecture Pattern

**Recommendation: Class-based, single-pass scanner** -- Confidence: HIGH

A class wrapping mutable cursor state (`pos`, `line`, `col`) with a `tokenize(): Token[]` method. Single-pass is sufficient because Graft has no context-dependent lexing (no template literals, no significant indentation).

Why class over functional: the lexer maintains ~5 pieces of mutable state (position, line, column, source ref, error list). A class groups these naturally. The plan already specifies `new Lexer(source).tokenize()` -- follow it.

Why single-pass: no token depends on future tokens. All ambiguities (`..` vs `.`, `->` vs `-`, `>=` vs `>`) resolve with 1 character of lookahead.

## 2. Token Representation

**Recommendation: String enum + interface** -- Confidence: HIGH

```typescript
enum TokenType { Node = 'Node', ... }
interface Token { type: TokenType; value: string; location: SourceLocation; }
```

String enums give readable debug output. The plan already specifies this exact pattern -- no reason to deviate. Tagged unions (discriminated by `type` field) are better for AST nodes where each variant carries different data; tokens are uniform.

## 3. Multi-Character Operators & Lookahead

**Recommendation: `peek()` + maximal munch** -- Confidence: HIGH

Strategy: when the scanner hits `-`, peek at the next char. If `>`, consume both and emit `Arrow`. Otherwise emit a standalone `-` (not currently in the grammar, so this would be an error). Same pattern for:

- `.` -> peek for `.` -> `DotDot` or `Dot`
- `>` -> peek for `=` -> `GreaterEqual` or `Greater`
- `<` -> peek for `=` -> `LessEqual` or `Less`
- `=` -> peek for `=` -> `EqualEqual` (bare `=` is an error)
- `!` -> peek for `=` -> `BangEqual` (bare `!` is an error)
- `/` -> peek for `/` or `*` -> comment, otherwise `Slash`

One char of lookahead is sufficient for all Graft operators. Implement as `peek(): string` that reads `source[pos + 1]` without advancing.

## 4. Number Lexing (k-suffix)

**Recommendation: Lex digits first, then check suffix** -- Confidence: HIGH

When a digit is encountered: consume all digits. Then:
1. If next char is `k` -> emit `KIntegerLiteral`, consume `k`
2. If next char is `.` AND char after is a digit -> consume `.` + digits, emit `FloatLiteral`
3. If next char is `.` AND char after is `.` -> emit `IntegerLiteral` (the `..` is a separate token for ranges)
4. Otherwise -> emit `IntegerLiteral`

Case 3 is the subtle one: `Float(0..1)` must lex as `Float`, `(`, `0`, `..`, `1`, `)`. The double-peek at `.` distinguishes float decimal from range operator.

## 5. Error Recovery

**Recommendation: Skip-and-continue with error collection** -- Confidence: HIGH

The spec requires "all errors collected and reported together." On an unexpected character:
1. Record a `GraftError` with source location
2. Skip the offending character (advance by 1)
3. Continue lexing

For unterminated strings: consume to EOL or EOF, emit error, continue. This maximizes diagnostic density per compile. The `diagnostics.ts` module stays dependency-free per ratchet T1-R08/common_memory.

## 6. Source Location Tracking

**Recommendation: Track line/column/offset incrementally** -- Confidence: HIGH

Maintain `line` (1-based), `column` (1-based), and `offset` (0-based byte offset) as the scanner advances. On `\n`, increment line and reset column. Snapshot location at the *start* of each token. Store in every `Token`.

This is the standard approach. The `SourceLocation` interface is already defined in the plan. No need for a separate source map -- locations embedded in tokens propagate to AST nodes and error messages.

## 7. Keyword Recognition

**Recommendation: Lex as identifier, then lookup in keyword map** -- Confidence: HIGH

Lex any `[a-zA-Z_][a-zA-Z0-9_]*` as an identifier. Then check against `KEYWORDS` record. This handles `on_failure` and `max_tokens` (snake_case keywords) naturally, and keeps type-name keywords (`String`, `Int`, `List`, etc.) in the same path.

## Summary

| Decision | Choice | Confidence |
|----------|--------|------------|
| Architecture | Class-based single-pass scanner | HIGH |
| Token repr | String enum + Token interface | HIGH |
| Multi-char ops | peek() + maximal munch, 1 char lookahead | HIGH |
| k-suffix numbers | Digit-first, then suffix/decimal check | HIGH |
| Error recovery | Skip bad char, collect errors, continue | HIGH |
| Location tracking | Incremental line/col/offset in scanner state | HIGH |
| Keyword recognition | Lex as identifier, lookup in map | HIGH |

All recommendations align with the implementation plan. No deviations needed.
