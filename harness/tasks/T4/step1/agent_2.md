# A2-Pragmatist: T4 Parser Evaluation

## Convergence Score: 4/5

The plan is solid and well-scoped for v1. I have minor simplification suggestions but no structural objections. The parser correctly handles hello.gft and all documented edge cases.

---

## 1. Is the parser over-engineered for v1?

**Verdict: No. It is appropriately scoped.**

Every method in the parser corresponds to a grammar production that appears in the spec or hello.gft. There are no speculative features, no error recovery machinery, no visitor hooks. The throw-on-first-error strategy (T2-R02) keeps it simple. The order-independent node body loop is the right call -- it avoids brittle ordering requirements for a tiny cost in code.

One minor simplification candidate: `parseConditionValue()` accepts `KIntegerLiteral` in conditions. I cannot construct a realistic Graft condition where `severity >= 2k` makes sense. However, removing it would create an inconsistency (k-suffix works everywhere else with numbers), and it is 3 lines. **Leave it.**

## 2. Are all 20+ test cases necessary? Are any redundant?

**22 tests total across 6 describe blocks. Assessment:**

- **No redundant tests.** Each test targets a distinct grammar production or AST shape.
- The "basic context" and "context with k-suffix" tests look similar but test different branches in `parseTokenValue()` (IntegerLiteral vs KIntegerLiteral). Both needed.
- The "full program" (hello.gft) test is an integration test that verifies multi-declaration parsing works. It overlaps with unit tests but at a different level. Keep it.
- Two error tests is the minimum. Could argue for more (e.g., missing `produces`), but per YAGNI, two is fine for v1 -- the throw-on-first-error behavior is uniform.

**One gap:** No test for `skip` or `abort` failure strategies. The plan tests `retry(2)`, `retry(2, fallback(Simple))`, and implicitly `fallback` is covered in retry_then_fallback. A standalone `on_failure: skip` test would be cheap and worthwhile. Not blocking.

**One gap:** No test for `fallback(NodeName)` as a standalone strategy (without retry). The `parseFailureStrategy` code handles it but no test exercises that path. Minor.

## 3. Can the type parsing be simpler?

**Current approach is already near-minimal.** The dispatch in `parseType()` is a flat if-chain on token type -- no table-driven dispatch, no type registry, no abstraction layers. Each branch is 3-8 lines.

The primitive/domain type lines (1781-1789) could theoretically be collapsed into a lookup table:

```typescript
const PRIMITIVE_MAP: Partial<Record<TokenType, TypeExpr>> = {
  [TokenType.String]: { kind: 'primitive', name: 'String' },
  // ...
};
```

But this saves no lines, adds indirection, and obscures the control flow. **The current flat approach is correct for 7 types. Leave it.**

The `parseTypeOrInlineStruct()` method is the only place requiring LL(2) lookahead. It is clean, well-motivated (inline structs in generics), and minimal. No simplification possible.

## 4. Is the parse helper function in tests the right pattern?

**Yes.** `function parse(source: string)` chaining Lexer -> Parser -> Program is the standard integration-style helper for parser tests. It:

- Avoids duplicating token creation in every test
- Tests the actual pipeline (lexer + parser together), catching integration issues
- Is used consistently in every test case
- Matches the pattern established in T2 lexer tests (direct function call, assertion-based)

No snapshot tests -- correct per the research notes (snapshots reserved for codegen T6).

## 5. Does the plan handle all edge cases in hello.gft and test inputs?

**hello.gft coverage: Complete.** Walking through hello.gft line by line:

| hello.gft feature | Parser method | Test coverage |
|---|---|---|
| `context UserRequest(max_tokens: 500)` | `parseContext` | "basic context" test |
| `question: String` | `parseFields` + `parseType` | same test |
| `node Researcher(model: sonnet, budget: 2k/1k)` | `parseNode` | "k-suffix budget" test |
| `reads: [UserRequest]` | `parseContextRefList` | "basic node" test |
| `List<String>` | `parseType` List branch | "collection types" test |
| `Float(0..1)` | `parseType` Float branch | "Float with range" test |
| `reads: [Research.findings]` | `parseContextRefList` with dot | "partial reads" test |
| `edge Researcher -> Writer` | `parseEdge` direct | "simple edge" test |
| `| select(findings) | compact` | `parseTransform` | "pipe transforms" test |
| `graph SimpleQA(...)` | `parseGraph` | "basic graph" test |
| `Researcher -> Writer -> done` | flow parsing loop | same test, verifies `done` excluded |

**All hello.gft constructs are covered.**

**Other edge cases verified:**
- Inline structs in generics: tested ("inline struct type" test)
- Conditional edge routing: tested with multiple `when` + `else`
- `filter` transform with condition: tested
- `truncate` transform: tested
- Composite failure strategy: tested (`retry_then_fallback`)
- `Optional<T>`, `Map<K,V>`, `TokenBounded<T,N>`: each tested
- `enum(...)` type: tested implicitly via inline struct test (contains `enum(low, medium, high)`)

## 6. Specific observations

### 6a. `source` parameter -- needed?

The constructor takes `source: string` but it is never used in the implementation. The `error()` method uses `this.current().location`, which already contains line/column from the lexer. The `source` string is not referenced anywhere.

**Recommendation:** Remove the `source` parameter from the constructor. It is dead code. If error formatting later needs source context, `formatError()` in diagnostics.ts already accepts source as a parameter -- it does not need to live on the Parser.

### 6b. `parseFields` uses `parseTypeOrInlineStruct` -- correct?

Yes. Fields at the top level (in context body, produces body) should support inline structs. The plan correctly delegates to `parseTypeOrInlineStruct` rather than `parseType` in `parseFields()`. This means `context Foo(max_tokens: 500) { data: MyStruct { x: Int } }` would parse. Whether that is semantically valid is the analyzer's job (T5).

### 6c. No EOF safety in `current()`

`current()` does `this.tokens[this.pos]` without bounds checking. This is safe IF the lexer always appends an EOF token (which it does per T2). But if someone constructs a Parser with an empty array, it would throw a runtime error on `undefined.type`. Not a v1 concern -- the lexer guarantees EOF -- but worth a comment.

## Summary

The parser is well-scoped, minimal, and correctly handles the full hello.gft grammar. The test suite is comprehensive with no redundancy. Two minor gaps (standalone `skip`/`abort`/`fallback` failure strategy tests) are non-blocking. One dead parameter (`source`) should be removed. No structural changes needed.

**Convergence with A1 research: HIGH.** The implementation matches the architecture and implementation research documents exactly. No deviations from the AST types (T3). No violations of ratchet decisions.
