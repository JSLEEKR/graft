# A4-Specialist Evaluation: T4 Recursive Descent Parser

## Role: Compiler Domain Expert (Forced Dissenter per common_memory pattern)

## Convergence Score: 4/5

The plan is solid and production-ready. The issues below are real but none are blocking -- they are refinements an implementer should address during Step 3 rather than plan revisions.

---

## 1. Grammar LL(k) Analysis

**Claim: LL(1) except inline structs. Verdict: Correct, with one unmentioned LL(2) point.**

The grammar is LL(1) at the top level (dispatch on `context`/`node`/`edge`/`graph` keywords) and within all declaration bodies. The two LL(2) points are:

1. **Inline structs** (documented): `Identifier LBrace` vs `Identifier` inside `List<>` and `Optional<>`. Handled correctly via `parseTypeOrInlineStruct()` with `peekType(1)`.

2. **Float vs Float(min..max)** (documented in research_arch but not formally flagged as LL(2)): After consuming `Float`, the parser checks for `LParen`. This is technically LL(1) *after* consuming the `Float` token -- it is a one-token lookahead from the post-Float position, not from the initial type-dispatch position. So the research is correct: this is LL(1) in practice.

**No additional LL(2+) ambiguities found.** Edge dispatch (`LBrace` vs `Identifier` after `Arrow`) is also resolved by one-token lookahead at the branch point.

## 2. Method Decomposition vs Grammar Productions

The parser methods map 1:1 to grammar productions. This is clean and correct:

| Grammar Production | Parser Method |
|---|---|
| program | `parse()` |
| context_decl | `parseContext()` |
| node_decl | `parseNode()` |
| node_body_clause | while-loop in `parseNode()` |
| produces_block | `parseProduces()` |
| edge_decl | `parseEdge()` |
| conditional_target | `parseConditionalTarget()` |
| graph_decl | `parseGraph()` |
| type_expr | `parseType()` |
| type_or_inline_struct | `parseTypeOrInlineStruct()` |
| field_list | `parseFields()` |
| transform | `parseTransform()` |
| condition | `parseCondition()` |
| failure_strategy | `parseFailureStrategy()` |

**No missing methods.** Each non-terminal has exactly one parsing method. The decomposition is textbook recursive descent.

## 3. Ambiguous Parse Points the Plan Does Not Handle

### 3a. `parseFields()` infinite loop on non-Identifier tokens (ISSUE - MEDIUM)

`parseFields()` loops `while (!this.check(TokenType.RBrace))` and immediately calls `this.expectIdentifier()`. If the current token is neither `RBrace` nor `Identifier`, `expectIdentifier()` throws. This is *correct behavior* under throw-on-first-error (T2-R02), so it is not a bug. However, the error message will say `Expected identifier, got '...'` which does not tell the user they are inside a field list. A contextual message like `Expected field name or '}', got '...'` would be more helpful.

**Verdict: Not a bug, but a missed opportunity for better diagnostics. Low priority.**

### 3b. Trailing commas in lists -- consistently rejected (CORRECT)

`parseContextRefList()` and `parseIdentifierList()` both use the pattern `if (refs.length > 0) this.expect(TokenType.Comma)` before each element. This means trailing commas (e.g., `reads: [A, B,]`) will cause an error when `expectIdentifier()` hits `]`. This is consistent with the spec, which shows no trailing commas. **No issue.**

### 3c. Graph parameter order is fixed (OBSERVATION)

`parseGraph()` expects `input`, `output`, `budget` in exactly that order. Similarly `parseNode()` expects `model` then `budget`. The spec examples always use this order. This is a deliberate simplification for v1 and is fine -- but it means `graph G(budget: 5k, input: X, output: Y)` is a parse error. The error message would say `Expected 'Input', got 'Budget'`, which is clear enough.

### 3d. No ambiguity in conditional edges (CORRECT)

`parseConditionalTarget()` correctly handles the `when`/`else` dispatch. The `else` branch has `condition: undefined` per T3-R11 / the AST definition. The plan correctly avoids requiring a trailing comma or separator between branches -- the `when`/`else` keywords are sufficient delimiters.

## 4. `parseType()` vs `parseTypeOrInlineStruct()` Distinction

**This is correct and well-placed.** The distinction is:

- `parseType()`: Handles all type expressions but does NOT handle inline structs. Used in `Map<K,V>` (neither key nor value can be inline structs), `TokenBounded<T, max>` (inner type, not struct), and as the fallback in `parseTypeOrInlineStruct()`.

- `parseTypeOrInlineStruct()`: Adds the `Identifier + LBrace` lookahead check. Used in `List<T>`, `Optional<T>`, and `parseFields()` (field types can be inline structs).

**One subtle correctness point:** `parseFields()` calls `parseTypeOrInlineStruct()`, which means a top-level field could have type `Issue { ... }` (an inline struct not wrapped in List/Optional). This is valid per the spec ("Inline struct types: Issue { ... } defines a struct in-place") and the AST supports it. Good.

**However:** `Map<K, V>` calls `parseType()` for both key and value, which means `Map<String, Issue { ... }>` would fail. The value position of a Map should arguably support inline structs. This is a minor gap -- the spec does not show Map with inline struct values, and it would be unusual, so deferring is fine for v1.

## 5. `parseFields()` Robustness

### Missing field type (HANDLED)

If a user writes `name:` with no type, `parseTypeOrInlineStruct()` -> `parseType()` will throw with `Expected type, got '...'`. The error message is adequate.

### Missing colon (HANDLED)

If a user writes `name String`, `this.expect(TokenType.Colon)` throws with `Expected ':', got 'String'`. Clear enough.

### Empty struct body (HANDLED)

`parseFields()` with zero iterations returns `[]`. Then `expect(RBrace)` succeeds. An empty struct (`produces Foo { }`) parses to `fields: []`. Whether this should be a semantic error is a T5 concern.

### Duplicate field names (NOT HANDLED -- CORRECT FOR v1)

Duplicate fields are a semantic concern, not a parse concern. The analyzer (T5) should catch these.

## 6. Graft-Specific Syntax Handling

### k-suffix (CORRECT)

`parseTokenValue()` handles both `IntegerLiteral` and `KIntegerLiteral`. Used for `max_tokens`, `budget` (in/out), and graph `budget`. The `parseIntValue()` helper (used for retry count and TokenBounded max) correctly rejects k-suffix -- `retry(2k)` would be nonsensical.

**One edge case:** `truncate()` calls `parseTokenValue()`, which means `truncate(1k)` is valid (producing `tokens: 1000`). This seems intentional and reasonable.

### Budget shorthand (CORRECT)

`budget: 5k/2k` is parsed as `parseTokenValue() / Slash / parseTokenValue()`. The `Slash` is a dedicated token. No ambiguity with any other construct. The plan correctly uses `Slash` (not some ad-hoc division).

### Pipe transforms (CORRECT)

The `while (this.check(TokenType.Pipe))` loop in `parseEdge()` correctly greedily consumes transforms. Since `Pipe` cannot start a top-level declaration, there is no ambiguity about when the edge ends. The transform dispatch covers all five operations (select, filter, drop, compact, truncate).

### Conditional edges + transforms (POTENTIAL ISSUE - LOW)

The plan does not support transforms on conditional edges. After `parseConditionalTarget()` returns, the code immediately returns the `EdgeDecl` without checking for `Pipe`. The spec examples do not show transforms on conditional edges. Whether `edge A -> { when ... } | compact` should be valid is a design question, but for v1 this omission is fine. The parser would error naturally if someone tried (the `Pipe` would be hit by the top-level `parse()` loop and throw "Unexpected token '|'").

## 7. Error Message Quality

**Generally good.** Specific observations:

- **Good:** `Expected identifier, got '...' (TokenType)` includes the token type, which helps debugging.
- **Good:** `Expected failure strategy (retry, fallback, skip, abort)` lists all valid options.
- **Good:** `Unexpected token '...' in node body` is contextual.
- **Adequate:** `Expected type, got '...'` could list valid type keywords but is acceptable for v1.
- **Missing context:** `parseFields()` errors do not indicate whether the user is inside a context body, produces block, or inline struct. This is a polish concern, not a correctness concern.
- **Location accuracy:** All errors use `this.current().location`, which points to the *unexpected* token. This is the right choice -- pointing to what the parser found, not what it expected.

## 8. Issues Not Found (Confirming Correctness)

- **EOF handling:** `current()` returns `tokens[pos]`, and the lexer always emits an EOF token at the end. `isAtEnd()` checks for EOF. No risk of out-of-bounds access.
- **Identifier vs keyword collision:** The lexer's identifier-then-lookup strategy means `sonnet`, `haiku`, `opus` are `Identifier` tokens (not keywords). `expectIdentifier()` correctly accepts only `TokenType.Identifier`. No collision.
- **`done` in graph flow:** The parser correctly breaks from the arrow loop when it sees `Done`, and does NOT add it to `flow[]`. This matches T3-R10.
- **`produces` enforcement:** The parser throws if `produces` is undefined after the node body loop. Correct.

## 9. Summary of Findings

| Finding | Severity | Action |
|---|---|---|
| `Map` value position does not support inline structs | Low | Document as v1 limitation or change `parseType()` to `parseTypeOrInlineStruct()` for Map value |
| `parseFields()` error message lacks context (which block) | Low | Improve during implementation if easy |
| Conditional edges cannot have transforms | Low | Document as v1 limitation; spec does not show this pattern |
| Graph/node parameter order is fixed | Low | Document; clear error messages suffice |

## 10. Recommendation

**Proceed with implementation as planned.** The parser design is sound, the method decomposition is clean, and the LL(1)/LL(2) analysis is correct. The issues identified are polish-level and can be addressed opportunistically during Step 3 without changing the plan structure. No architectural changes needed.
