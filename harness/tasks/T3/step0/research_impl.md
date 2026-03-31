# T3 Research: AST Type Definitions

## 1. Discriminated Union Pattern for TypeExpr

The plan uses `kind` as discriminant for `TypeExpr` and `EdgeTarget`, and `type` as discriminant for `Transform` and `FailureStrategy`. This is correct TypeScript practice -- the compiler narrows types in switch/case on the discriminant field. Keep both discriminant names (`kind` vs `type`) as specified; they distinguish "what shape this is" from "what operation this performs."

No changes needed. The plan's union definitions are idiomatic.

## 2. Readonly vs Mutable Interfaces

**Decision: mutable (no `readonly`).** The analyzer (T5) will annotate/modify AST nodes during analysis passes (e.g., resolved references, estimated token counts). Making fields readonly would require either: (a) a separate "annotated AST" type hierarchy duplicating every interface, or (b) extensive use of type assertions. Both are worse than mutable interfaces for a v1 compiler. TypeScript's own AST uses mutable nodes.

## 3. TypeScript Compiler's ts.Node Pattern

TypeScript's AST uses: a base `Node` interface with `kind: SyntaxKind` enum, then specific interfaces extending it. This is heavier than what Graft needs. With ~15 types total, flat interfaces + discriminated unions (as the plan specifies) are simpler and sufficient. No base `ASTNode` interface needed -- `SourceLocation` on each declaration type serves the same purpose without inheritance.

## 4. Testing Strategy for Type-Only Files

Since `ast.ts` exports only types and interfaces (no runtime code), there is nothing to unit test. The verification is:
- **Compile check:** `npx tsc --noEmit` confirms the file is valid TypeScript and the import from `diagnostics.ts` resolves.
- **Consumer tests:** T4 (parser) tests will exercise AST construction. T5/T6 tests will exercise AST consumption. These provide full coverage.

No test file for T3. This matches the plan (Step 2 is compile-only verification).

## 5. File Organization

**Decision: single `src/parser/ast.ts`.** With ~15 type definitions totaling ~100 lines, splitting across files adds import overhead with no readability benefit. The plan, the design spec (Section 5), and the dependency DAG all specify a single file. The parser will import directly: `import { Program, ... } from './ast.js'`.

## 6. Key Implementation Notes

- Import `SourceLocation` from `../errors/diagnostics.js` (T2-R08, common_memory note). Do NOT redefine it.
- Use `.js` extensions in imports (T1-R09).
- Every declaration-level interface (`ContextDecl`, `NodeDecl`, `EdgeDecl`, `GraphDecl`, `ProducesDecl`, `Field`, `ContextRef`) gets a `location: SourceLocation` field for error reporting.
- `TypeExpr` variants do NOT get location fields -- the containing `Field` carries the location. This keeps the recursive union clean.
- `GraphDecl.flow` is `string[]` (node names), not `FlowStep[]` objects. Simpler for v1 sequential-only flows.
- `EdgeTarget` uses `kind` discriminant with `'direct'` | `'conditional'` -- cleaner than the spec's `string | ConditionalTarget[]` union.

## 7. Risks

None significant. This is a straightforward types-only file with clear spec coverage. The only execution risk is a typo causing tsc failure, caught immediately by Step 2.
