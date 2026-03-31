# A1-Architect: T4 Parser Design Review

## Convergence Score: 4/5

The plan's parser is well-structured and largely correct. I propose targeted improvements rather than structural changes. The core recursive descent approach, method decomposition, and helper API are sound. My concerns center on a few correctness gaps, one missing extensibility hook, and a test coverage gap for the T3 ratchet contracts.

---

## 1. Parser Class API Design

### Constructor: `new Parser(tokens: Token[], source: string)`

**Verdict: ACCEPT.** Clean, minimal. `source` is needed only for `GraftError.format()` in the caller -- the parser itself does not use it, but passing it through is pragmatic. The alternative (removing it and requiring callers to format errors) would split error responsibility across modules for no gain.

### `parse(): Program`

**Verdict: ACCEPT.** Returns a fully constructed `Program`. The top-level switch dispatching on keyword token types is idiomatic recursive descent and directly mirrors the grammar. The `while (!this.isAtEnd())` guard with EOF sentinel from the lexer is correct.

**One concern:** The `default` case in the switch throws immediately. This is correct per T2-R02 (throw-on-first-error). But the error message says `expected 'context', 'node', 'edge', or 'graph'` -- this will need updating when v2 adds `import`. This is acceptable for v1 but worth noting: the error message is a string literal, not derived from a set of valid top-level keywords. Minor, not blocking.

### Error handling: throw-on-first-error via `GraftError`

**Verdict: ACCEPT.** Consistent with T2-R02. The `error()` helper always attaches `current().location`, which is correct -- errors should point to the token that caused the failure, not a previously consumed token.

---

## 2. Method Decomposition

The plan provides one method per grammar production, which is the standard recursive descent contract:

| Grammar Production | Method |
|---|---|
| program | `parse()` |
| context_decl | `parseContext()` |
| node_decl | `parseNode()` |
| edge_decl | `parseEdge()` |
| graph_decl | `parseGraph()` |
| produces_decl | `parseProduces()` |
| context_ref_list | `parseContextRefList()` |
| identifier_list | `parseIdentifierList()` |
| failure_strategy | `parseFailureStrategy()` |
| conditional_target | `parseConditionalTarget()` |
| transform | `parseTransform()` |
| condition | `parseCondition()` |
| condition_value | `parseConditionValue()` |
| type_expr | `parseType()` |
| type_or_inline_struct | `parseTypeOrInlineStruct()` |
| fields | `parseFields()` |
| token_value | `parseTokenValue()` |
| int_value | `parseIntValue()` |
| numeric_value | `parseNumericValue()` |

**Verdict: ACCEPT.** This is clean and each method is small (5-25 lines). No method exceeds 40 lines. The naming convention (`parse<Production>`) is consistent. The helper trio (`parseTokenValue`, `parseIntValue`, `parseNumericValue`) is well-motivated -- each has a distinct acceptance set:

- `parseTokenValue`: IntegerLiteral | KIntegerLiteral (budget, max_tokens)
- `parseIntValue`: IntegerLiteral only (retry count, TokenBounded max)
- `parseNumericValue`: IntegerLiteral | FloatLiteral (Float range bounds)

This is a good separation that prevents accidental k-suffix acceptance in retry counts.

---

## 3. Helper Methods Assessment

### `current()`, `advance()`, `isAtEnd()`

**Verdict: ACCEPT.** Standard cursor pattern. `current()` returns `this.tokens[this.pos]` without bounds checking because the lexer always appends EOF, so `this.pos` always points to a valid token. `advance()` returns the current token then increments, guarded by `isAtEnd()`. The EOF sentinel makes this safe.

### `expect(type: TokenType): Token`

**Verdict: ACCEPT with one note.** Asserts and advances in one call. Returns the consumed token, which is important for callers that need the token value. The error message format `Expected '${type}', got '${token.value}' (${token.type})` is adequate for v1.

### `check(type: TokenType): boolean`

**Verdict: ACCEPT.** Pure lookahead, no side effects. Used correctly throughout for optional elements (tools, on_failure, pipe transforms).

### `peekType(offset: number): TokenType | undefined`

**Verdict: ACCEPT.** Used only in `parseTypeOrInlineStruct()` for LL(2) lookahead (`Identifier LBrace` = inline struct). Returns `undefined` for out-of-bounds, which is safe because `undefined !== TokenType.LBrace`. The offset parameter is clean.

### `expectIdentifier(): string`

**Verdict: ACCEPT.** Returns the string value directly, not the token. This is correct because callers only need the name, not the location (locations are captured separately at the start of each declaration). Strictly accepts `TokenType.Identifier` only, which means `String`, `Int`, etc. (keywords) are rejected -- this is correct because node/context/graph names must be user identifiers, not type keywords.

---

## 4. Correctness Issues

### Issue 1: `parseProduces()` location capture is wrong

```typescript
private parseProduces(): ProducesDecl {
    const loc = this.current().location;  // <-- captures AFTER "produces" was already consumed
    const name = this.expectIdentifier();
```

In `parseNode()`, the `produces` keyword is consumed by `this.advance()` before calling `parseProduces()`. So `loc` here points to the `Identifier` token (the produces name), not the `produces` keyword. This is inconsistent with how `parseContext()`, `parseNode()`, `parseEdge()`, and `parseGraph()` all capture location at their leading keyword.

**Recommendation:** Either capture the location in `parseNode()` before advancing past `produces` and pass it as an argument, or restructure so `parseProduces()` consumes the keyword itself. The simplest fix: change the `parseNode` body to NOT advance past `produces`, and have `parseProduces()` consume it:

```typescript
// In parseNode body:
} else if (this.check(TokenType.Produces)) {
    produces = this.parseProduces();  // don't advance here
}

// In parseProduces:
private parseProduces(): ProducesDecl {
    const loc = this.current().location;
    this.expect(TokenType.Produces);  // consume it here
    const name = this.expectIdentifier();
    ...
}
```

### Issue 2: `KIntegerLiteral` value includes the 'k' suffix

The lexer's `readNumber()` does `value += 'k'` before emitting `KIntegerLiteral`. So `token.value` for `5k` is `"5k"`, not `"5"`. The parser does `parseInt(token.value, 10)` which in JavaScript will parse `"5k"` as `5` (parseInt stops at the first non-digit). This works by accident but is fragile.

**Recommendation:** Either (a) have the lexer strip the 'k' from the value (emit `"5"` not `"5k"`), or (b) add a comment in the parser acknowledging the parseInt behavior. Option (a) is cleaner but would be a change to the lexer which is already locked. Option (b) is sufficient -- a clarifying comment noting that `parseInt("5k", 10)` returns `5` per the JS spec.

### Issue 3: No test for `skip` and `abort` failure strategies

The tests cover `retry(2)` and `retry(2, fallback(Simple))`, but not `skip`, `abort`, or standalone `fallback(Node)`. These are simple but should be tested for completeness.

---

## 5. T3 Ratchet Compliance

The most critical question: does the parser construct AST nodes with the narrowed literal unions from T3?

### T3-R05: `primitive.name` narrowed to `'String' | 'Int' | 'Float' | 'Bool'`

**Verdict: CORRECT.** The parser uses string literals directly:
```typescript
return { kind: 'primitive', name: 'String' };
return { kind: 'primitive', name: 'Int' };
return { kind: 'primitive', name: 'Float' };
return { kind: 'primitive', name: 'Bool' };
```
TypeScript will infer these as the literal types, satisfying the union. No issues.

### T3-R06: `domain.name` narrowed to `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'`

**Verdict: CORRECT.** Same pattern:
```typescript
return { kind: 'domain', name: 'FilePath' };
```
All four domain types are handled with literal string values.

### T3-R07: `primitive_range.name` narrowed to `'Float'`

**Verdict: CORRECT.** Only one case: `return { kind: 'primitive_range', name: 'Float', min, max };`

### T3-R04: TypeExpr uses `kind`, Transform/FailureStrategy use `type`

**Verdict: CORRECT.** All TypeExpr nodes use `kind`, all Transform nodes use `type`, all FailureStrategy nodes use `type`. Consistent with the AST definitions.

### T3-R10: GraphDecl.flow as string[]

**Verdict: CORRECT.** `flow` is `string[]` and `done` is excluded (the parser breaks from the loop on `TokenType.Done`).

### T3-R11: EdgeTarget as discriminated union with `kind`

**Verdict: CORRECT.** Direct targets use `{ kind: 'direct', node }`, conditional uses `{ kind: 'conditional', branches }`.

---

## 6. Extensibility for v2 (foreach/parallel/import)

### `import` declarations

Adding `import` requires: (1) a new `TokenType.Import` keyword in the lexer, (2) a new case in `parse()`'s switch, (3) a new `parseImport()` method, (4) an `imports` array on `Program`. This is fully additive -- no existing methods change.

**Verdict: extensible.**

### `foreach` / `parallel` in graph flow

This is the harder case. Currently `parseGraph()` parses flow as a flat `Identifier -> Identifier -> done` chain. Adding `foreach` and `parallel` would require:

1. Changing `flow: string[]` to a richer type (e.g., `FlowStep[]` with `kind: 'sequential' | 'foreach' | 'parallel'`)
2. Replacing the simple identifier loop in `parseGraph()` with a recursive `parseFlowStep()` method

The current flat loop would need to be replaced, but the rest of `parseGraph()` (parameter parsing, brace matching) remains unchanged. The method decomposition makes this localized.

**Verdict: extensible with localized changes.** The flat `string[]` representation is correct for v1 per T3-R10 and YAGNI. When v2 needs it, the change is confined to `parseGraph()` body + AST type.

### `on_complete` hooks

Would require a new case in the node body while-loop. Fully additive.

**Verdict: extensible.**

---

## 7. Test Coverage Assessment

The plan provides ~24 test cases across 6 describe blocks. Coverage is good but has gaps:

**Well covered:**
- Context: basic, k-suffix, multiple fields with collection types
- Node: basic, k-suffix budget, partial reads, tools + on_failure, inline structs, retry_then_fallback
- Edge: simple, pipe transforms, filter, truncate, conditional routing
- Graph: basic with flow
- Types: Optional, Map, TokenBounded, Float range
- Errors: missing brace, unexpected token

**Missing tests (should add):**
1. `skip` and `abort` failure strategies
2. Standalone `fallback(Node)` strategy
3. `enum` type in a field (tested only inside inline struct)
4. Nested generic types (e.g., `List<Optional<String>>`)
5. Multiple edges and graphs in one program
6. Edge with no transforms followed by another declaration (ensure greedy pipe consumption stops correctly)
7. `Bool` and `Int` as standalone field types
8. Context ref with multiple items and partial reads mixed: `reads: [A, B.field, C]`

The full-program test (`hello.gft`) provides integration coverage but only checks array lengths, not deep structure. This is acceptable since the unit tests cover individual constructs.

---

## 8. Specific Recommendations

### Must Fix (before implementation)

1. **Fix `parseProduces()` location capture** -- Have it consume the `Produces` keyword itself rather than relying on the caller to pre-advance. This is a consistency fix and ensures `ProducesDecl.location` points to the `produces` keyword, not the produces name.

2. **Add comment about `parseInt` and k-suffix** -- Document that `parseInt("5k", 10)` returns `5` by the JS spec. This prevents future maintainers from "fixing" it.

### Should Fix (high value, low cost)

3. **Add tests for `skip`, `abort`, `fallback` strategies** -- Three simple test cases, ~15 lines total.

4. **Add test for nested generics** -- `List<Optional<String>>` exercises recursive type parsing.

5. **Add test for mixed context refs** -- `reads: [A, B.field, C]` exercises the comma-separated partial read logic.

### Won't Fix (YAGNI or cosmetic)

6. LAngle/RAngle naming: The plan reuses `Less` and `Greater` tokens for `<` and `>` in generic syntax. This works but reads oddly (`expect(TokenType.Less)` when parsing `List<...>`). A type alias `const LAngle = TokenType.Less` could improve readability, but this is cosmetic and not worth a ratchet.

7. Source location on `Program` itself: Not needed -- `Program` is a container, not a source construct.

---

## 9. Architecture Summary

The parser design follows established recursive descent patterns correctly:

- **One class, one entry point** (`parse()`), private methods for each production
- **Six helper methods** (`current`, `advance`, `expect`, `check`, `peekType`, `isAtEnd`) form a clean token-consumption API
- **LL(1) with LL(2) only for inline structs** -- minimal lookahead, easy to reason about
- **Throw-on-first-error** -- simple, consistent with T2-R02
- **Order-independent node body** -- while-loop with check-and-dispatch is extensible
- **T3 ratchets fully satisfied** -- narrowed literal unions constructed correctly
- **~350 lines** -- appropriately sized for the grammar complexity
- **Extensible** -- v2 additions (import, foreach, parallel) require only additive changes

The plan is ready for implementation with the `parseProduces()` location fix and the additional test cases noted above.
