# A3-Skeptic: Bug Report for T4 Parser

## Convergence Score: 4/10

The plan's parser has several real bugs that will cause failures on valid Graft programs, plus structural gaps in test coverage. The code is mostly well-structured but has enough issues to warrant careful fixes before implementation.

---

## BUG 1 (CRITICAL): `parseProduces()` reads location AFTER `produces` keyword is already consumed

**Location:** `parseProduces()` (plan line ~1449)

In `parseNode()`, when `produces` is encountered, the code does:
```typescript
} else if (this.check(TokenType.Produces)) {
  this.advance();  // consumes 'produces'
  produces = this.parseProduces();
}
```

Then `parseProduces()` does:
```typescript
private parseProduces(): ProducesDecl {
  const loc = this.current().location;  // <-- this is now the produces NAME, not 'produces' keyword
  const name = this.expectIdentifier();
  ...
}
```

The location captured is the produces name token (e.g., "Research"), not the `produces` keyword itself. This is inconsistent with every other declaration where `loc` points to the opening keyword. Not a crash bug, but produces incorrect `SourceLocation` for error reporting against the ProducesDecl.

**Fix:** Capture location before advancing in the node body, pass it to `parseProduces(loc)`.

---

## BUG 2 (CRITICAL): `parseFields()` infinite loop on non-Identifier tokens before `RBrace`

**Location:** `parseFields()` (plan line ~1809)

```typescript
private parseFields(): Field[] {
  const fields: Field[] = [];
  while (!this.check(TokenType.RBrace)) {
    const loc = this.current().location;
    const name = this.expectIdentifier();  // throws on non-Identifier
    ...
  }
  return fields;
}
```

This is NOT an infinite loop per se -- `expectIdentifier()` will throw on a non-Identifier token before RBrace. But the real issue is: **what if the file ends (EOF) without a closing `RBrace`?** The `while (!this.check(TokenType.RBrace))` loop will spin forever because `isAtEnd()` is never checked, and `expectIdentifier()` will throw on EOF, which IS the correct behavior (throw-on-first-error). Actually, `this.check(TokenType.RBrace)` returns false when current is EOF, then `expectIdentifier()` throws. So this is safe for EOF.

**Revised severity:** LOW. The EOF case is handled by throwing. No actual infinite loop.

---

## BUG 3 (REAL BUG): `parseType()` does not handle `Identifier` tokens (user-defined types in struct fields)

**Location:** `parseType()` (plan line ~1708-1791)

The `parseType()` method handles: List, Map, Optional, TokenBounded, Float, Enum, String, Int, Bool, FilePath, FileDiff, TestFile, IssueRef. That is all 9 TypeExpr variants from ast.ts.

However, consider this scenario: `parseTypeOrInlineStruct()` delegates to `parseType()` when the current token is NOT `Identifier + LBrace`. But what if a field has a user-defined type name like `UserRequest` (which lexes as `Identifier`)? There is NO `Identifier` case in `parseType()`. It will throw: `Expected type, got 'UserRequest'`.

Wait -- looking at the ast.ts TypeExpr union, there is no "reference" or "named" variant. The AST has no way to represent a reference to a user-defined type. This means the grammar intentionally does not support bare type references in v1 -- all types must be built-in primitives, domains, or inline structs. This is consistent with the design.

**Revised severity:** NOT A BUG in parser -- but a language limitation worth noting. The `parseTypeOrInlineStruct()` path handles `Identifier + LBrace` as inline struct. A bare `Identifier` without `{` is correctly rejected.

---

## BUG 4 (REAL BUG): `truncate` transform uses `parseTokenValue()` which accepts k-suffix, but `Transform.tokens` is typed as `number`

**Location:** `parseTransform()` for truncate (plan line ~1605)

```typescript
if (this.check(TokenType.Truncate)) {
  this.advance();
  this.expect(TokenType.LParen);
  const tokens = this.parseTokenValue();  // accepts KIntegerLiteral (e.g., 1k -> 1000)
  this.expect(TokenType.RParen);
  return { type: 'truncate', tokens };
}
```

This is actually correct behavior -- `truncate(1k)` should mean 1000 tokens. The type is `number`, which is what `parseTokenValue()` returns. NOT A BUG.

---

## BUG 5 (REAL BUG): `parseConditionValue()` handles `KIntegerLiteral` -- is this intentional?

**Location:** `parseConditionValue()` (plan line ~1639)

```typescript
if (token.type === TokenType.KIntegerLiteral) {
  this.advance();
  return parseInt(token.value, 10) * 1000;
}
```

A condition like `count >= 2k` would be parsed as `count >= 2000`. This seems like a valid use case. NOT A BUG.

---

## BUG 6 (REAL BUG): Graph flow does NOT handle single-node graphs correctly

**Location:** `parseGraph()` (plan line ~1691-1701)

```typescript
const flow: string[] = [];
flow.push(this.expectIdentifier());  // first node
while (this.check(TokenType.Arrow)) {
  this.advance();
  if (this.check(TokenType.Done)) {
    this.advance();
    break;
  }
  flow.push(this.expectIdentifier());
}
this.expect(TokenType.RBrace);
```

For `A -> done`, this works: pushes "A", sees Arrow, advances, sees Done, breaks. `flow = ['A']`. Then expects RBrace. This is correct.

For `A -> B -> done`, this works: pushes "A", sees Arrow, advances, sees "B" (not Done), pushes "B", sees Arrow, advances, sees Done, breaks. `flow = ['A', 'B']`. Correct.

For just `A` with no arrow (theoretical single-node graph ending with just `}`), this also works: pushes "A", while loop sees no Arrow, falls through. `flow = ['A']`. Expects RBrace. Correct but unusual.

**What about `done` alone?** `this.expectIdentifier()` on the first call would throw on `Done` since `Done` is a keyword token, not `Identifier`. This correctly prevents `graph Foo(...) { done }` with no nodes. NOT A BUG.

---

## BUG 7 (REAL BUG, MEDIUM): `parseFields()` calls `parseTypeOrInlineStruct()` -- but inline structs should NOT be valid at all field positions

**Location:** `parseFields()` (plan line ~1815)

```typescript
const type = this.parseTypeOrInlineStruct();
```

`parseTypeOrInlineStruct` checks for `Identifier + LBrace`, which means an inline struct can appear at any field position: inside a context, inside produces, or nested. This seems intentional per the design, but it means `context Foo(max_tokens: 500) { bar: Baz { x: Int } }` would parse an inline struct at the context level. Whether this should be allowed is a semantic question for the analyzer, not the parser. NOT A BUG in the parser.

---

## BUG 8 (REAL BUG, HIGH): Tool names that are keywords will fail in `parseIdentifierList()`

**Location:** `parseIdentifierList()` (plan line ~1476-1485)

```typescript
private parseIdentifierList(): string[] {
  this.expect(TokenType.LBracket);
  const ids: string[] = [];
  while (!this.check(TokenType.RBracket)) {
    if (ids.length > 0) this.expect(TokenType.Comma);
    ids.push(this.expectIdentifier());
  }
  ...
}
```

The test case has `tools: [file_read, file_write, terminal]`. These lex as `Identifier` tokens because they are not in the KEYWORDS map. This works fine.

BUT: what if a tool were named `filter`, `select`, `drop`, `input`, `output`, `model`, `budget`, or any other keyword? For example, `tools: [read]` -- wait, "read" is not a keyword. `tools: [compact]` -- "compact" IS a keyword (`TokenType.Compact`). So `tools: [compact]` would fail because `compact` lexes as `TokenType.Compact`, not `Identifier`, and `expectIdentifier()` only accepts `TokenType.Identifier`.

This same issue affects:
- **Field names** in `parseFields()`: `name: String` -- "name" is not a keyword, fine. But `input: String` would fail because `input` is a keyword (`TokenType.Input`).
- **Context ref names** in `parseContextRefList()`: e.g., `reads: [Input]` -- wait, "Input" starts uppercase. The KEYWORDS map has `input` (lowercase) mapping to `TokenType.Input`. Since the lexer does identifier-then-lookup, `Input` (uppercase I) would lex as `Identifier`. So PascalCase names are safe. But `reads: [input]` (lowercase) would fail.
- **Enum values** in `parseType()`: `enum(low, medium, high)` -- none of these are keywords, so it works. But `enum(true, false)` would fail (they are keywords).

**This is a real design tension.** The lexer's keyword map converts lowercase identifiers that match keywords into keyword tokens. The parser's `expectIdentifier()` only accepts `TokenType.Identifier`. Any position where a keyword-like string might appear as an identifier will break.

**Concrete failing case from the spec:** Consider a field named `input` in a produces block: `input: String`. The `input` token lexes as `TokenType.Input` (keyword), and `parseFields()` calls `expectIdentifier()` which throws.

**Severity: HIGH** -- this is a real limitation that could bite users. The fix would be either (a) make `expectIdentifier()` accept keyword tokens in addition to `Identifier` (a "contextual keyword" approach), or (b) accept this as a v1 limitation and document that field/tool names must not collide with keywords.

---

## BUG 9 (MEDIUM): No test for `on_failure: fallback(NodeName)` alone (without retry wrapper)

**Location:** Tests (plan line ~1066-1079)

The tests cover `retry(2)` and `retry(2, fallback(Simple))` but not standalone `fallback(NodeName)`, `skip`, or `abort`. The `parseFailureStrategy()` code handles all four, but only two are tested. Missing test coverage for `skip` and `abort` paths.

**Severity: MEDIUM** -- the code looks correct, but untested code is untrustworthy.

---

## BUG 10 (MEDIUM): No test for `Map`, `TokenBounded`, or `enum` types in the context of node produces

All type tests use context declarations. No test verifies that these types work inside a `produces` block. While the code path is the same (`parseFields` -> `parseTypeOrInlineStruct` -> `parseType`), this is a coverage gap.

---

## BUG 11 (LOW): `parseEdge()` allows transforms on conditional edges syntactically but the grammar probably shouldn't

**Location:** `parseEdge()` (plan line ~1525-1549)

When the target is conditional (LBrace branch), `transforms` stays as `[]` -- the code never parses transforms after a conditional block. This is correct behavior. NOT A BUG.

---

## BUG 12 (LOW): `parseGraph()` does not validate that `done` was actually reached

**Location:** `parseGraph()` (plan line ~1691-1701)

If a graph body is `{ A -> B }` (no `done` terminator), the parser happily accepts it. The while loop exits because there's no Arrow after B, and then `expect(RBrace)` succeeds. The flow is `['A', 'B']`, but there's no indication that the flow didn't terminate with `done`.

Per T3-R10, `GraphDecl.flow` excludes `done`. But should the parser require `done`? The examples always use it. If `done` is mandatory, this is a bug -- the parser should throw when the Arrow loop ends without seeing `Done`. If `done` is optional, this is fine.

**Severity: LOW-MEDIUM** -- depends on spec intent. Recommend validating in the analyzer if not in the parser.

---

## Summary of Confirmed Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | MEDIUM | `parseProduces()` captures location of name token, not `produces` keyword |
| 8 | HIGH | Keyword-identifier collision: field/tool/enum names that match keywords will crash |
| 9 | MEDIUM | Missing test coverage for `fallback`, `skip`, `abort` failure strategies |
| 10 | MEDIUM | Missing test coverage for types inside produces blocks |
| 12 | LOW-MEDIUM | Graph flow does not require `done` terminator |

## Items Verified as Correct

- `parseConditionValue()` correctly handles bare identifiers (e.g., "medium") via the Identifier branch at line ~1660
- `parseType()` covers all 9 TypeExpr variants from ast.ts
- `parseEdge()` handles edges with no transforms (just `edge A -> B`) -- test exists at line ~1123
- Single-node graph flow (`A -> done`) works correctly
- Narrowed literal unions (T3-R05, R06, R07) are correctly used -- primitive names are string literals matching the union, domain names are string literals matching the union, primitive_range name is 'Float'
- EOF in the middle of a declaration throws via `expect()` or `expectIdentifier()` since `current()` returns EOF token
- `parseFields()` terminates correctly -- fields are parsed until RBrace, no separator needed

## Recommendations

1. **Fix Bug #8** by either making `expectIdentifier()` accept contextual keywords (safest approach: accept all keyword tokens and return their value) or by explicitly documenting reserved words as a v1 limitation.
2. **Fix Bug #1** by passing the location captured before `this.advance()` into `parseProduces()`.
3. **Fix Bug #12** by adding a check after the flow loop: if the loop exited without seeing `Done`, throw an error.
4. **Add tests** for all failure strategies and for types in produces blocks.
