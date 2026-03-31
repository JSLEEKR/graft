# T4 Research: Recursive Descent Parser Implementation

## 1. Token Consumption Patterns

The plan defines six core helpers on the `Parser` class:

- `current()`: returns `this.tokens[this.pos]` (never advances)
- `advance()`: returns current token, then increments `pos` (guards with `isAtEnd()`)
- `expect(type)`: asserts `current().type === type`, advances, returns token; throws `GraftError` on mismatch
- `check(type)`: returns `boolean` without advancing (lookahead-0)
- `peekType(offset)`: returns `TokenType` at `this.pos + offset`, or `undefined` if OOB
- `isAtEnd()`: `current().type === TokenType.EOF`
- `error(message)`: creates `GraftError` with `current().location`

Key: `expect` both asserts AND advances. `check` only peeks. This is the standard recursive descent contract.

## 2. K-Suffix Expansion

The lexer emits `KIntegerLiteral` as a distinct token type (value is the numeric part as string). The parser's `parseTokenValue()` handles both:
- `IntegerLiteral` -> `parseInt(token.value, 10)`
- `KIntegerLiteral` -> `parseInt(token.value, 10) * 1000`

This applies to: context `max_tokens`, node `budget` (in/out), graph `budget`. The `parseIntValue()` helper does NOT accept k-suffix (used for retry count, TokenBounded max).

## 3. Testing Patterns

- Helper: `function parse(source: string)` chains Lexer -> Parser -> `Program`
- Assertion-based, not snapshot: direct `expect(...).toBe()` and `expect(...).toEqual()` for AST nodes
- Tests organized by declaration type: `describe('context')`, `describe('node')`, etc.
- Error tests use `expect(() => parse(...)).toThrow()`
- No snapshot tests for the parser (reserved for codegen in T6)

## 4. Edge Syntax Parsing

`parseEdge()` after consuming `edge <Identifier> ->` uses one-token lookahead:
- `check(TokenType.LBrace)` -> conditional routing (`parseConditionalTarget`)
- Otherwise -> `expectIdentifier()` for direct target, then `while(check(Pipe))` for transforms

Conditional branches: loop parsing `when <condition> -> <Identifier>` or `else -> <Identifier>` until `RBrace`.

## 5. Recursive Type Expressions

`parseType()` dispatches on the current token's type keyword:
- `List<T>`, `Optional<T>`: consume keyword, `<`, recurse via `parseTypeOrInlineStruct()`, `>`
- `Map<K,V>`: consume keyword, `<`, `parseType()`, `,`, `parseType()`, `>`
- `TokenBounded<T, max>`: consume keyword, `<`, `parseType()`, `,`, `parseIntValue()`, `>`
- `Float(min..max)`: consume `Float`, then optionally `(`, numeric, `..`, numeric, `)`

`parseTypeOrInlineStruct()` adds struct lookahead: if `current() == Identifier && peekType(1) == LBrace`, parse as inline struct. This enables `List<Issue { file: FilePath }>`.

## 6. Model Names as Identifiers

`expectIdentifier()` ONLY accepts `TokenType.Identifier`. The KEYWORDS map does NOT include `sonnet`, `haiku`, `opus` -- they are not keywords. The lexer's identifier-then-lookup produces `Identifier` for these names. This means `model: sonnet` works correctly: `expect(Colon)` then `expectIdentifier()` returns `"sonnet"`.

Verified: KEYWORDS in tokens.ts contains no model names. No risk of conflict.

## Critical Implementation Notes

- Constructor takes `Token[]` and `source: string` (source needed for error context)
- `parse()` returns `Program` with four arrays; dispatches on top-level keyword tokens
- Node body is order-independent: while-loop checking for `reads`, `tools`, `on_failure`, `produces`
- `produces` is mandatory; parser throws if missing after body parse
- GraphDecl.flow excludes `done`: parser breaks from arrow loop when it sees `TokenType.Done`
- DAG: `diagnostics.ts -> tokens.ts -> lexer.ts -> ast.ts -> parser.ts`
