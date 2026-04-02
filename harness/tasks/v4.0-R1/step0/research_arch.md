# Architecture Research -- v4.0-R1: Lexer + AST + Expression Parser

## Patterns Found

### 1. Recursive Descent with Precedence Levels -- Confidence: HIGH
One function per precedence level: `parseExpr()` -> `parseAdditive()` -> `parseUnary()` -> `parsePrimary()`. Each level calls the next-higher precedence level and loops on its own operators. Left-associative via `while` loop. Consistent with existing parser style (LL(1)/LL(2)). Directly maps to the grammar in the spec.

### 2. Pratt Parsing (Top-Down Operator Precedence) -- Confidence: HIGH
Single `parseExpr(minPrecedence)` function with binding power table. Elegant for large operator sets but fundamentally different from Graft's existing parser. Overkill for 3 operators.

### 3. TypeScript Discriminated Union with Location -- Confidence: HIGH
`type Expr = { kind: 'literal'; ... } | { kind: 'binary'; ... } | ...` with `location: SourceLocation` on every variant. Already the established pattern in Graft (ratchet T3).

### 4. Atomic Breaking Change via Type-Driven Migration -- Confidence: MEDIUM
Change the type definition first (`Condition.field` -> `Condition.left: Expr`), then let `tsc` report every broken callsite. Fix all callsites in one pass.

### 5. LL(1) Lookahead for Graph Call Disambiguation -- Confidence: HIGH
After consuming an Identifier, check `this.check(TokenType.LParen)` to decide: `(` follows = graph call; otherwise = node reference. Existing `peekType(offset)` supports this.

### 6. Inline Expression Parser -- Confidence: MEDIUM
For a 906-line parser gaining ~100-150 lines, keeping expression parsing inline avoids splitting parser state. Plan defers split until >1050 lines.

## Recommended Pattern

**Recursive Descent with Precedence Levels** for expression parsing. The grammar has exactly 3 precedence levels (additive > unary > primary). Four small functions map 1:1 to the grammar.

**Discriminated Union with `kind` tag** for `Expr` AST. Every variant gets `location: SourceLocation`.

**Type-driven atomic migration** for `Condition.field` -> `Condition.left`. Change type first, fix all tsc errors.

**Inline in parser.ts** for expression parser placement. Defer split to post-R1 evaluation.

## Warnings

1. **Condition migration ordering**: Change `Condition` type FIRST, before writing expression parser code.
2. **FieldAccess segments with keywords**: `parsePrimary` should use `expectIdentifierOrKeyword()` for dot-separated segments.
3. **Division token reuse**: `Slash` already exists for budget syntax. Only interpret as division in `parseAdditive`, which is naturally scoped.
4. **Unary minus vs. negative literals**: `-3` → `unary(-, literal(3))`. Do NOT special-case negative literals.
5. **`let` as keyword collision**: Verify no existing test uses `let` as a node/context/field name.
