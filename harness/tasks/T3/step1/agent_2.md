# T3 Proposal: A2-Pragmatist — AST Type Definitions

## Position: The plan's types are 95% correct; a few YAGNI trims possible

### 1. TypeExpr Variants: Which are used in hello.gft?

hello.gft uses these TypeExpr kinds:
- `primitive` — `String`, `Int`, `Bool`
- `primitive_range` — `Float(0..1)`
- `list` — `List<String>`

NOT used in hello.gft:
- `map` — not in hello.gft but in the v1 type system (spec 3.7)
- `optional` — not in hello.gft but in the v1 type system
- `token_bounded` — `TokenBounded<T, max>` in spec 3.7
- `enum` — `enum(low, medium, high)` in spec 3.4 example
- `struct` — `Issue { file: FilePath, ... }` in spec 3.4 example
- `domain` — `FilePath`, `FileDiff`, etc. in spec 3.7

**Verdict: Keep all 9 variants.** Even though hello.gft only uses 3, the spec explicitly defines all 9 as v1 scope (section 3.7), and the parser (T4) must parse all of them. Removing variants now would mean adding them back immediately when T4 hits the spec's more complex examples. The cost of defining them is ~10 lines; the cost of re-debating and adding them later is higher. This is not YAGNI — they are in the v1 spec, so we need them.

### 2. Transform/FailureStrategy: Can they be simpler?

**Transform — keep as-is.** All 5 transform types (`select`, `filter`, `drop`, `compact`, `truncate`) are in the v1 spec (section 3.5). hello.gft uses `select` and `compact`. The discriminated union with `type` field is already the minimal representation. No simplification possible without removing spec-defined features.

**FailureStrategy — keep as-is.** The 5 variants (`retry`, `fallback`, `retry_then_fallback`, `skip`, `abort`) map 1:1 to spec section 3.4. `retry_then_fallback` is the composite case `retry(2, fallback(Backup))` from the spec. hello.gft doesn't use `on_failure` at all, but the parser must handle it. No simplification available — the discriminated union is already the minimal representation.

One possible YAGNI challenge: could `retry_then_fallback` be deferred and represented as just two separate fields? No — the grammar syntax `retry(2, fallback(NodeName))` is a single construct, not a sequence. The parser needs a single AST node for it.

### 3. ProducesDecl: Separate type or inline in NodeDecl?

**Keep ProducesDecl as a separate interface.** Reasons:

1. **It has its own location.** `produces` is a distinct syntactic construct with its own keyword and position. Error messages like "invalid field in produces block at line 12" need the ProducesDecl's location, not the parent NodeDecl's location.

2. **The analyzer references it independently.** The scope checker (T5) needs to look up produces declarations by name to validate `reads` references and edge source types. Having it as a named interface makes this lookup type-safe.

3. **It has its own name.** `produces Research { ... }` — the name `Research` is separate from the node name `Researcher`. This is not redundant data that could be collapsed.

4. **Cost is ~5 lines.** Not worth the coupling risk to save 5 lines.

### 4. Testing a types-only module?

**No test file needed.** Both research documents agree on this (research_impl.md section 4). The verification is:

- `npx tsc --noEmit` confirms the file compiles and the import from `diagnostics.ts` resolves.
- T4 parser tests will exercise AST construction.
- T5/T6 tests will exercise AST consumption.

Creating a test file for a module with zero runtime code would be pure ceremony.

### 5. Minor observations

**EdgeTarget vs spec's string | ConditionalTarget[]:** The plan improves on the spec here by using a discriminated union `{ kind: 'direct'; node: string } | { kind: 'conditional'; branches: ConditionalBranch[] }` instead of the spec's raw `string | ConditionalTarget[]`. This is better because it avoids `typeof` checks and makes the target type self-documenting. Keep it.

**GraphDecl.flow as string[]:** The plan simplifies the spec's `FlowStep[]` to just `string[]` (node names). This is correct for v1 since flow is sequential-only. `FlowStep` with its single `node: string` field is pointless wrapping. Good YAGNI call by the plan.

**Condition type:** The plan inlines `Condition` as a simple interface (`field`, `op`, `value`). This is used in both `Transform` (filter) and `ConditionalBranch`. Sharing the type is correct — same syntax, same semantics.

### 6. What I would change (minor)

Nothing structural. The plan's types are well-designed. If forced to nitpick:

- The `Condition.value` type is `string | number | boolean`. This is correct per the spec (conditions can compare against any literal type).
- All the right nodes have `location: SourceLocation`. TypeExpr variants correctly omit it (parent Field carries location).

### 7. Summary

| Question | Answer |
|---|---|
| Remove any TypeExpr variants? | No — all 9 are v1 spec scope |
| Simplify Transform? | No — already minimal |
| Simplify FailureStrategy? | No — already minimal |
| Inline ProducesDecl into NodeDecl? | No — separate location, separate name, analyzer needs it |
| Test file for types? | No — compile check only |
| Any structural changes? | No — plan types are correct |

## Convergence Score: 9/10

Near-full agreement with the plan. The plan's AST types are the right types at the right level of abstraction. The only reason this is not 10/10 is that the question of whether all 9 TypeExpr variants are needed was worth asking — but the answer is clearly yes, they are all in v1 scope. I agree with research_arch.md and research_impl.md on every point.

**Proposed implementation: use the plan's types verbatim.**
