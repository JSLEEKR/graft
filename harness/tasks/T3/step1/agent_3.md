# A3-Skeptic: AST Type Definitions Review

## Convergence Score: 7/10

The proposed types are mostly sound and will work for v1. However, several type-level issues could cause bugs, parser awkwardness, or incomplete spec coverage. The score reflects that the structure is correct but details need tightening.

---

## Issues Found

### ISSUE 1: `TypeExpr` `primitive` variant is too loose (MEDIUM)

`{ kind: 'primitive'; name: string }` accepts any string for `name`. Valid primitive names are only `String`, `Int`, `Float`, `Bool`. There is nothing preventing `{ kind: 'primitive', name: 'Banana' }` from entering the AST.

**Same problem with `domain` variant**: `{ kind: 'domain'; name: string }` should be constrained to `'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef'`.

**Recommendation:** Use string literal union types:
```typescript
| { kind: 'primitive'; name: 'String' | 'Int' | 'Float' | 'Bool' }
| { kind: 'domain'; name: 'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef' }
```

This makes exhaustive switch in codegen safer and prevents the parser from constructing bogus primitives. The parser already identifies these via `TokenType.String`, `TokenType.Int`, etc., so the literal union maps naturally.

**Counterargument:** The plan's research_arch.md says 9 variants map 1:1 to spec section 3.7. Narrowing `name` is additive and doesn't change the variant count. This is a refinement, not a restructuring.

### ISSUE 2: `primitive` vs `primitive_range` ambiguity for `Float` (MEDIUM)

`Float` is a primitive. `Float(0..1)` is a `primitive_range`. But `primitive_range` has `name: string` -- could it be `Int(0..100)`? The spec only shows `Float(min..max)`. If `Int` ranges are invalid, the type should enforce that.

**Recommendation:** Either:
- Constrain `primitive_range` to `{ kind: 'primitive_range'; name: 'Float'; min: number; max: number }`, or
- Document that the parser only constructs `primitive_range` for `Float` and the analyzer validates this.

Prefer the type-level constraint. It is zero-cost and eliminates a class of bugs.

### ISSUE 3: `model` field is `string` -- no validation at type level (LOW)

`NodeDecl.model: string` accepts anything. Spec section 3.4 says valid model values for v1 are `sonnet`, `opus`, `haiku`. A string literal union `'sonnet' | 'opus' | 'haiku'` would catch invalid models at parse time.

**Counterargument:** Model names may expand in future milestones. Using `string` is forward-compatible. Acceptable for v1 if the analyzer validates model names.

**Verdict:** Keep as `string` -- the analyzer should validate, not the AST type. This is one of those cases where forward compatibility wins.

### ISSUE 4: `GraphDecl.flow` is `string[]` but spec shows `FlowStep[]` (LOW)

The spec (section 4.2) defines `flow: FlowStep[]` with `FlowStep = { node: string }`. The plan simplifies to `flow: string[]`. The research_arch.md explicitly decided this: "v1 sequential only, no complex flow nodes."

**Risk:** When v2 adds `foreach`/`parallel`, `string[]` must become a discriminated union. This will be a breaking change for every consumer of `GraphDecl.flow`.

**Verdict:** Acceptable for v1 YAGNI. Document the known migration cost.

### ISSUE 5: `Condition.value` type is too broad for parser construction (LOW)

`value: string | number | boolean` is fine semantically but the parser must decide which variant to produce. The lexer produces `IntegerLiteral`, `FloatLiteral`, `StringLiteral`, `True`/`False` tokens. The parser must map:
- `IntegerLiteral` / `KIntegerLiteral` / `FloatLiteral` -> `number`
- `StringLiteral` -> `string`
- `True` / `False` -> `boolean`

This is straightforward. No issue with constructability.

However, `KIntegerLiteral` (e.g., `4k`) should map to `number` (4000). The parser must expand k-suffixed values. This is implicit in the type but worth noting for the parser implementer.

### ISSUE 6: `EdgeTarget` discriminant mismatch with `ConditionalBranch` (LOW)

`ConditionalBranch.condition` is `Condition | undefined`. When `condition` is `undefined`, it is the `else` branch. But there is no type-level guarantee that exactly one branch has `condition === undefined`, or that it is the last one.

**Risk:** Parser could construct a `ConditionalBranch[]` with zero else branches (valid -- spec says `when`/`else` syntax) or multiple else branches (invalid). The type permits both.

**Recommendation:** This is acceptable. The analyzer should validate conditional completeness. Encoding "exactly one else, at end" in the type system would require tuple types or branded types -- over-engineering for v1.

### ISSUE 7: `SourceLocation` lacks end position (OBSERVATION)

`SourceLocation` has `line`, `column`, `offset` -- all start positions. There is no end position. This means error messages can only point to the start of a construct, not highlight a span.

**Impact:** Adequate for v1 "throw on first error" with caret (`^`) pointing. If future versions want squiggly underlines or range-based error display, `SourceLocation` needs `endLine`, `endColumn`, `endOffset`.

**Verdict:** Not a T3 issue. `SourceLocation` is owned by T2 (diagnostics.ts), already shipped and locked. Note for future milestones.

### ISSUE 8: `Transform` and `FailureStrategy` use `type` discriminant, `TypeExpr` and `EdgeTarget` use `kind` (OBSERVATION)

Two different discriminant field names in the same AST file. This is noted in research_arch.md and research_impl.md as intentional ("what shape" vs "what operation"). It is not a bug, but any generic AST visitor or utility function must handle both discriminant names.

**Verdict:** Acceptable. The plan explicitly chose this. Consistency would be nice but renaming now would diverge from the spec.

### ISSUE 9: No `TypeExpr` variant for bare identifiers used as types (POTENTIAL BUG)

In the spec example (section 3.4):
```graft
issues: List<Issue {
  file: FilePath
  ...
}>
```

`Issue` here is an inline struct name. But what if a field type references a produces type by name? E.g., a hypothetical `results: AnalysisResult` -- is that a `domain` type, a `primitive`, or something else?

Looking at the spec, v1 does NOT support type references to other produces blocks. Types are either primitives, domain types, or inline definitions. So this is not a gap.

**But:** The `struct` variant requires `name: string` -- what if the struct is anonymous? E.g., a nested struct without a name. The spec always shows named inline structs (`Issue { ... }`). If the parser encounters a struct without a name, the type still requires `name: string`.

**Verdict:** No anonymous structs in the v1 spec. The `name` field is always populated from the identifier before `{`. Not a bug.

### ISSUE 10: `reads` is non-optional on `NodeDecl` (CORRECT)

Every node must read from something. The spec requires `reads: [...]` in every node. An empty `reads: []` is semantically questionable but type-valid. The analyzer should flag nodes with empty reads (except perhaps the entry node that reads graph input).

**Verdict:** Correct as-is. `ContextRef[]` allows empty array, which the analyzer can catch.

---

## Can the AST represent `hello.gft`?

Walking through `examples/hello.gft`:

1. **`context UserRequest(max_tokens: 500) { question: String }`** -> `ContextDecl` with `name: "UserRequest"`, `maxTokens: 500`, `fields: [{ name: "question", type: { kind: "primitive", name: "String" } }]`. **Yes.**

2. **`node Researcher(model: sonnet, budget: 2k/1k) { reads: [UserRequest] produces Research { findings: List<String>, confidence: Float(0..1) } }`** -> `NodeDecl` with `model: "sonnet"`, `budgetIn: 2000`, `budgetOut: 1000`, `reads: [{ context: "UserRequest" }]`, `produces: { name: "Research", fields: [{ name: "findings", type: { kind: "list", element: { kind: "primitive", name: "String" } } }, { name: "confidence", type: { kind: "primitive_range", name: "Float", min: 0, max: 1 } }] }`. **Yes.**

3. **`node Writer(model: haiku, budget: 1500/800) { reads: [Research.findings] produces Answer { response: String } }`** -> `NodeDecl` with partial read `{ context: "Research", field: "findings" }`. **Yes.**

4. **`edge Researcher -> Writer | select(findings) | compact`** -> `EdgeDecl` with `target: { kind: "direct", node: "Writer" }`, `transforms: [{ type: "select", field: "findings" }, { type: "compact" }]`. **Yes.**

5. **`graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) { Researcher -> Writer -> done }`** -> `GraphDecl` with `flow: ["Researcher", "Writer"]`, `budget: 6000`. **Yes.**

All constructs representable. No gaps for `hello.gft`.

## Can the AST represent the complex spec example (section 3.4 Analyzer node)?

The Analyzer example uses:
- Nested inline struct: `List<Issue { file: FilePath, line: Int, severity: enum(...), description: String }>`
- Inline enum: `enum(low, medium, high, critical)`
- Float range: `Float(0..1)`
- Tools: `[file_read, ast_parse]`
- Failure strategy: `retry(2)`
- Conditional edge routing (section 3.5)

All representable with the proposed types. `List<Issue { ... }>` becomes `{ kind: 'list', element: { kind: 'struct', name: 'Issue', fields: [...] } }`. **Yes.**

## Can the AST represent INVALID programs?

Yes, extensively:
- `primitive` with `name: "Banana"` (see Issue 1)
- `primitive_range` with `name: "String"` (see Issue 2)
- Multiple `else` branches in conditional edges (see Issue 6)
- Empty `fields: []` on a context (semantically invalid)
- `flow: []` empty graph flow
- `budgetIn: -1` (negative budget)
- `model: "gpt-4"` (non-Graft model)

Most of these are correctly deferred to the analyzer. Issues 1 and 2 are worth fixing at the type level since they are zero-cost constraints.

---

## Summary of Recommendations

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | `primitive.name` too loose | MEDIUM | Narrow to string literal union |
| 2 | `primitive_range.name` too loose | MEDIUM | Narrow to `'Float'` |
| 3 | `model` is `string` | LOW | Keep -- analyzer validates |
| 4 | `flow: string[]` vs `FlowStep[]` | LOW | Keep -- YAGNI, document migration |
| 5 | `Condition.value` k-expansion | LOW | Parser responsibility, not type issue |
| 6 | Multiple else branches possible | LOW | Analyzer responsibility |
| 7 | No end position in SourceLocation | N/A | T2 owned, future milestone |
| 8 | Mixed discriminant names | N/A | Intentional, keep |
| 9 | No anonymous structs | N/A | Not in spec, no issue |
| 10 | `reads` non-optional | N/A | Correct |

**Items 1 and 2 are the only ones I would argue should change.** Everything else is either correct, intentionally deferred, or owned by another task.

## Convergence Assessment

The plan's AST types are well-designed. They cover all v1 spec constructs, the parser can construct them without intermediate states, and codegen can traverse them via exhaustive switch on discriminants. The two medium-severity issues (primitive/domain name looseness) are refinements that improve type safety at zero runtime cost. No structural changes needed.

**Convergence: 7/10** -- would be 9/10 with Issues 1 and 2 addressed.
