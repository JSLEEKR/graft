# T3 Agent 4 Analysis: AST Type Definitions (Compiler Domain Specialist)

## Convergence Score: 4.5 / 5

The plan's AST definitions are well-designed and faithfully map the v1 grammar. I have a small number of substantive observations but no blocking disagreements with the research or plan.

---

## 1. Grammar-to-AST Faithfulness

**Verdict: Complete coverage. Every v1 grammar production has an AST representation.**

Mapping check:
| Grammar Production | AST Node | Faithful? |
|---|---|---|
| `context <Name>(max_tokens: N) { fields }` | `ContextDecl` | Yes |
| `node <Name>(model: M, budget: I/O) { ... }` | `NodeDecl` | Yes |
| `produces <Name> { fields }` | `ProducesDecl` | Yes |
| `edge <Src> -> <Tgt> \| transforms` | `EdgeDecl` | Yes |
| `edge <Src> -> { when ... }` | `EdgeDecl` + `EdgeTarget(conditional)` | Yes |
| `graph <Name>(...) { flow }` | `GraphDecl` | Yes |
| All 9 TypeExpr variants (3.7) | `TypeExpr` discriminated union | Yes |
| `on_failure: strategy` | `FailureStrategy` | Yes |
| Transform ops (select/filter/drop/compact/truncate) | `Transform` | Yes |
| `ContextRef` with partial read | `ContextRef` with optional `field` | Yes |

No grammar production is unrepresentable. The AST is a faithful, lossless projection of the concrete syntax tree minus punctuation/whitespace tokens (which is correct for an AST).

## 2. EdgeTarget Discriminated Union

**Verdict: Agree -- superior to the spec's `string | ConditionalTarget[]`.**

The plan refines the spec's `target: string | ConditionalTarget[]` into:
```typescript
EdgeTarget =
  | { kind: 'direct'; node: string }
  | { kind: 'conditional'; branches: ConditionalBranch[] }
```

This is the right decomposition for three reasons:
1. **Exhaustive switch narrowing** -- downstream code (analyzer, codegen) can `switch (target.kind)` with TypeScript ensuring all branches are handled.
2. **Self-documenting** -- the `kind` field makes the intent explicit at each usage site; a bare `string | ConditionalTarget[]` requires `typeof` or `Array.isArray` checks which are less readable.
3. **Extensible** -- if v2 adds `parallel` or `foreach` routing, a new discriminant variant is additive. A union of `string | array` would require a breaking change to add a third case.

No concerns.

## 3. GraphDecl.flow as string[]

**Verdict: Sufficient for v1, with one minor observation.**

The plan uses `flow: string[]` (node names, `done` excluded) instead of the spec's `FlowStep[]` wrapper objects. This is the correct YAGNI call -- `FlowStep` with a single `node: string` field is pure overhead for sequential-only flow.

**Observation:** The plan comment says "ending with 'done' excluded." This is correct. The `done` keyword is a grammar terminator, not a semantic node. Excluding it from the AST means the parser consumes it (for syntax validation) but the AST only carries meaningful node references. The analyzer and codegen iterate `flow` knowing every entry is a real node name.

When v2 adds `foreach`/`parallel`, `string[]` becomes a discriminated union of flow steps. This is a clean, planned evolution -- not a refactor.

## 4. Condition: field/op/value vs Nested Expressions

**Verdict: field/op/value is sufficient for v1.**

The grammar (spec 3.5) only supports flat conditions: `when risk_score > 0.7`, `filter(issues, severity >= medium)`. There is no `AND`/`OR`/parenthesized expression syntax in v1. The AST's `Condition` type:

```typescript
{ field: string; op: '>=' | '>' | '<' | '<=' | '==' | '!='; value: string | number | boolean }
```

...maps 1:1 to what the grammar can express. Adding nested expression support now would be premature -- the grammar literally cannot produce nested conditions, so the AST should not represent them.

**Future note:** If v2 adds boolean combinators (`AND`/`OR`), `Condition` becomes a recursive discriminated union (`{ kind: 'comparison', ... } | { kind: 'and', left: Condition, right: Condition } | ...`). This is additive.

## 5. ContextRef.field as Optional String

**Verdict: Sufficient for v1's single-level partial reads.**

The spec (3.4) explicitly states: "V1: partial references support one level only (e.g. `Research.findings`, not `Research.findings.name`)." A single optional string field correctly represents this constraint.

If v2 needs multi-level paths, `field?: string` becomes `path?: string[]`. This is a minor interface change, well-isolated to `ContextRef` consumers.

## 6. Semantic Invariants the AST Should Enforce

The question of whether the AST types should encode semantic constraints via the type system:

| Invariant | Should AST enforce? | Verdict |
|---|---|---|
| `enum` values must be non-empty | No -- analyzer responsibility | Correct |
| `ContextDecl.fields` must be non-empty | No -- analyzer responsibility | Correct |
| `GraphDecl.flow` must be non-empty | No -- analyzer responsibility | Correct |
| `ConditionalBranch[]` must have at least one branch | No -- analyzer responsibility | Correct |
| `retry.max` must be > 0 | No -- analyzer responsibility | Correct |
| `Condition.op` restricted to 6 operators | **Yes -- via literal union type** | Already done |

The plan correctly places semantic validation in the analyzer (T5), not the type system. TypeScript interfaces cannot express "non-empty array" without branded types or tuples, both of which add complexity disproportionate to v1's needs. The `op` field uses a literal union, which is the one case where TypeScript can cheaply enforce a constraint -- and the plan already does this.

## 7. Minor Observations (Non-Blocking)

### 7a. Transform discriminant is `type`, TypeExpr/EdgeTarget use `kind`

The research already notes this. Two different discriminant field names in a single AST file is mildly unusual but not problematic. `kind` describes "what shape of data this is" (TypeExpr, EdgeTarget), `type` describes "what operation this performs" (Transform, FailureStrategy). This semantic distinction is reasonable. No change needed.

### 7b. Location on TypeExpr Variants

TypeExpr variants omit `location`. The research correctly identifies that the containing `Field` carries location, so errors on types can point to the field line. For v1 where type errors are like "unknown type name" or "invalid range bounds," the field-level location is adequate. If v2 needs to point at a specific part of a complex nested type like `List<Map<String, Optional<Int>>>`, locations can be added to TypeExpr variants without breaking changes.

### 7c. `model` as `string` in NodeDecl

The spec lists exactly three model values: `sonnet`, `opus`, `haiku`. The AST stores `model: string` rather than a literal union `'sonnet' | 'opus' | 'haiku'`. This is correct -- model validation is the analyzer's job, and keeping it as `string` means the parser is forward-compatible with new model names without AST changes.

### 7d. Budget fields as `number`

`budgetIn`, `budgetOut`, `maxTokens`, and `budget` are all `number` (post k-suffix expansion). The parser handles `4k` -> `4000` conversion. This is correct -- the AST stores the semantic value, not the lexical representation. The lexer already distinguishes `KIntegerLiteral` from `IntegerLiteral`, giving the parser what it needs.

## 8. Agreement with Research

Both research documents (arch and impl) converge on the same design decisions. I agree with all of them:

- Interfaces + discriminated unions (not classes) -- **agree**
- Location on declaration/reference nodes, not on TypeExpr/Transform -- **agree**
- Import SourceLocation from diagnostics.ts -- **agree**
- Mutable (no `readonly`) for v1 -- **agree**
- Defer visitor pattern -- **agree**
- Single file `src/parser/ast.ts` -- **agree**
- No test file for types-only module -- **agree**

## 9. Summary

The plan's AST type definitions are sound from a compiler domain perspective. They faithfully represent the v1 grammar, use idiomatic TypeScript patterns for discriminated unions, correctly separate parser concerns (structure) from analyzer concerns (semantics), and leave clean extension points for v2 features. No changes recommended.

**Convergence: 4.5/5** -- Deducting 0.5 only because I want to flag that the team should be explicit in documentation/comments that `GraphDecl.flow` excludes `done` and that `ConditionalBranch` with absent `condition` represents the `else` branch. These are non-obvious conventions that future readers need to understand. The plan already includes a comment for `flow`; a similar comment for the `else` semantics of `condition?: Condition` would be valuable. Both are already present or nearly present in the plan code.
