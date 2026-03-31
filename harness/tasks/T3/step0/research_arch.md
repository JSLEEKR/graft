# T3 Research: AST Type Definitions

## 1. Interfaces vs Classes vs Discriminated Unions

**Recommendation: Interfaces + discriminated unions (as specified in the plan).**

- **Interfaces** for named declaration nodes (ContextDecl, NodeDecl, EdgeDecl, GraphDecl, Field, ProducesDecl, ContextRef). These have fixed shapes and carry `location`. Interfaces are zero-cost at runtime (erased by tsc), align with T1-R07 strict mode, and are the TypeScript convention for data-only structures.
- **Discriminated unions** for polymorphic types (TypeExpr, Transform, FailureStrategy, EdgeTarget). The `kind`/`type` discriminant field enables exhaustive `switch` narrowing, which is the standard TypeScript pattern for AST variants. TypeScript's control flow analysis handles these well.
- **Classes rejected**: AST nodes are plain data, not behavior-bearing. Classes add prototype overhead, complicate serialization, and conflict with the immutable-data philosophy. The spec and plan both use type/interface, not class.

## 2. Source Location Attachment

**Recommendation: Location on all declaration-level and reference nodes (as plan specifies).**

The plan attaches `location: SourceLocation` to: ContextDecl, NodeDecl, ProducesDecl, EdgeDecl, GraphDecl, Field, ContextRef. This covers every construct the analyzer needs to point errors at. Program (root) has no location -- correct, it spans the whole file.

TypeExpr, Transform, Condition, and FailureStrategy omit location. This is acceptable for v1 because errors on these will be reported via their parent node's location. If finer-grained error pointing is needed later, location can be added without breaking changes (additive).

Reuse `SourceLocation` from `src/errors/diagnostics.ts` per common_memory note and T2-R08.

## 3. TypeExpr Representation

**Recommendation: Discriminated union with `kind` field (9 variants as specified).**

The `kind` discriminant covers: `primitive`, `primitive_range`, `list`, `map`, `optional`, `token_bounded`, `enum`, `struct`, `domain`. This maps 1:1 to the v1 type system (spec section 3.7). Recursive structure (list/map/optional/token_bounded contain inner TypeExpr) is natural with discriminated unions. The `struct` variant embeds `Field[]`, enabling inline struct definitions.

Note: Transform uses `type` as discriminant (not `kind`). This is fine -- different union, no ambiguity -- but worth being aware of for visitor/switch code.

## 4. Immutability

**Recommendation: Mutable (no `readonly`) for v1.**

The plan defines plain interfaces without `readonly`. Rationale:
- The parser builds AST nodes incrementally (e.g., accumulating fields in a loop). Readonly would require spreading/copying at each step.
- No concurrent access in v1 (single-threaded, single-pass pipeline).
- Adding `readonly` later is a non-breaking refactor if immutability becomes valuable.
- YAGNI pattern from T1/T2 common memory supports this.

## 5. Visitor Pattern

**Recommendation: Defer. Design is visitor-compatible but do not implement a visitor now.**

The AST structure (discriminated unions with `kind`/`type` fields) is inherently visitor-friendly -- any future visitor can switch on discriminants. However:
- V1 analyzer does 3 passes as direct recursive traversals over the Program arrays. No generic visitor needed.
- CodeGen similarly walks specific node types directly.
- Adding an accept/visit interface now would be premature (YAGNI).

The `Program` type with its four top-level arrays (contexts, nodes, edges, graphs) makes simple iteration trivial. Discriminated unions on TypeExpr/Transform/FailureStrategy/EdgeTarget make recursive dispatch ergonomic via `switch`.

## 6. Key Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Node representation | Interfaces | Zero-cost, data-only, strict-mode friendly |
| Polymorphic types | Discriminated unions | Exhaustive switch, TS-idiomatic |
| Location attachment | Declaration + reference nodes | Sufficient for v1 error reporting |
| SourceLocation source | Import from diagnostics.ts | T2-R08, avoid redefinition |
| Mutability | Mutable (no readonly) | Parser builds incrementally, YAGNI |
| Visitor pattern | Defer | Direct traversal sufficient for v1 |
| EdgeTarget shape | Discriminated union (direct/conditional) | Cleaner than string|array from spec |
| GraphDecl.flow | string[] (node names) | v1 sequential only, no complex flow nodes |
