# T4 Architecture Research: Recursive Descent Parser

## Pattern: Token-Stream Recursive Descent

The parser is a class holding `Token[]`, a position cursor, and helper methods (`current`, `advance`, `expect`, `check`, `peekType`). The top-level `parse()` loop dispatches on the current token's type to declaration-specific methods. Each method mirrors one grammar production.

## Lookahead Strategy: LL(1) with LL(2) for Inline Structs

The grammar is LL(1) everywhere except one case: inside `List<...>` (and `Optional<...>`), an Identifier could be a domain type OR an inline struct name. Disambiguation requires LL(2) lookahead: `Identifier LBrace` means inline struct, otherwise delegate to `parseType()`. The plan's `parseTypeOrInlineStruct()` handles this with `peekType(1)`.

`Float` vs `Float(0..1)` is also resolved by one-token lookahead (check for `LParen` after consuming `Float`).

## Edge Parsing: No Block Delimiter

Edges have no braces. `edge A -> B` is complete on one line; pipe transforms (`| select(...)`) follow on subsequent lines. The parser greedily consumes `Pipe` tokens after the target identifier. This works because `Pipe` cannot start any other top-level declaration, so there is no ambiguity -- the while-loop in `parseEdge` simply checks `this.check(TokenType.Pipe)`.

Conditional edges (`edge A -> { when ... }`) are disambiguated by `LBrace` after `Arrow`.

## Inline Structs Inside Generics

`List<Issue { file: FilePath, severity: ... }>` nests a struct definition inside angle brackets. The `parseTypeOrInlineStruct` method handles this by checking `Identifier + LBrace`. The closing `>` of the generic follows after `RBrace` of the struct. `parseFields()` collects fields until `RBrace`, so nesting is bounded by brace matching.

## Error Strategy: Throw-on-First-Error

Per T2-R02, v1 uses throw-on-first-error via `GraftError`. No synchronization or panic-mode recovery. The `error()` helper constructs a `GraftError` with the current token's `SourceLocation`. This is simple and sufficient for v1; error collection can be added later without changing the parser structure.

## Key Implementation Decisions

1. **Constructor**: `new Parser(tokens: Token[], source: string)` -- source kept for error messages.
2. **k-suffix expansion**: `parseTokenValue()` handles both `IntegerLiteral` and `KIntegerLiteral` (multiply by 1000). Used for budget and max_tokens.
3. **Node body parsing**: Unordered -- while-loop checks for `reads`, `tools`, `on_failure`, `produces` in any order until `RBrace`. Mandatory `produces` validated after loop.
4. **Graph flow**: Collects identifiers separated by `Arrow`, stops when `Done` is encountered. `done` is excluded from `flow[]` per T3-R10.
5. **Condition values**: Accepts literals (int, float, string, bool) and bare identifiers (e.g., `severity >= medium` where `medium` is a string).
6. **Failure strategies**: Parsed by checking the leading keyword (`retry`, `fallback`, `skip`, `abort`). Composite `retry(N, fallback(Node))` detected by comma after the retry count.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `expectIdentifier` fails on PascalCase type keywords (e.g., `UserRequest` is an Identifier token, but `String` is a `TokenType.String` keyword) | Lexer already distinguishes: PascalCase user types are `Identifier`, built-in types are keywords. Node/context/graph names must be `Identifier` tokens. |
| Missing EOF guard in helpers | `isAtEnd()` checks for `TokenType.EOF`; `current()` always returns EOF at end. |
| Field parsing has no separator | Fields are newline-separated in source but the lexer strips whitespace. `parseFields` loops until `RBrace`, parsing `identifier : type` repeatedly. No comma needed. |
