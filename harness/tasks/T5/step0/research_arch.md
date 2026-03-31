# T5 Architecture Research: Analyzer (Scope, Type, Token Estimation)

## 1. Multi-Pass Analysis Pattern

The spec defines three ordered passes: ScopeChecker, TypeChecker, TokenEstimator. This is a standard **symbol-table-then-check** pattern:

- **Pass 0 (implicit):** Build lookup tables in each checker's constructor -- context names, node names, produces-to-fields maps. This is the "symbol table construction" phase, but since the AST is flat (no nested scopes), a simple Map/Set per checker suffices. No shared symbol table needed.
- **Pass 1-3:** Each pass walks the AST independently, accumulating errors.

Key decision: passes are **independent classes**, not a shared visitor. This aligns with T3-R09 (no visitor pattern). Each class owns its own index structures.

## 2. Error Accumulation

The plan specifies `check(): GraftError[]` -- collect all errors, return array. This contradicts T4-R06 (throw-on-first-error) but is correct for the analyzer: the parser throws on first error because recovery is hard, but static analysis can and should report all problems in one pass.

GraftError already supports `severity: 'error' | 'warning'` (diagnostics.ts line 10). TokenEstimator uses `'warning'` severity for budget overruns; scope/type errors use default `'error'`.

Pattern: each private method takes `errors: GraftError[]` and pushes to it. No exceptions in the analysis path.

## 3. Scope Checking

Three validation targets, all name-resolution against flat sets:

1. **reads references** -- `ContextRef.context` must match a `ContextDecl.name` OR a `ProducesDecl.name`. If `ContextRef.field` is present, that field must exist in the resolved schema.
2. **edge source/target** -- must reference declared `NodeDecl.name`. Handles both `direct` and `conditional` EdgeTarget kinds.
3. **graph flow** -- each string in `GraphDecl.flow` must be a declared node name.

No nested scopes, no shadowing, no forward-reference issues. Flat namespace lookup via `Set.has()`.

## 4. Type Checking

Structural, field-existence-only checking for v1. The TypeChecker validates edge transforms against the source node's `produces` schema:

- `select(field)` / `drop(field)` / `filter(field, cond)` -- field must exist in source node's produces fields.
- `compact` / `truncate` -- no field validation needed.

The plan also specifies: graph `input` must reference a declared context, graph `output` must reference a declared produces type. This is currently in the plan's TypeChecker but could also be scope -- implementation should follow the plan's placement.

No deep structural type compatibility in v1. No subtyping. Just "does this field name exist."

## 5. Token/Cost Estimation

Heuristic-based, not exact. Key design:

- **Per-node input estimate:** sum of `max_tokens` for each context read + `budgetOut` of upstream nodes (reduced by edge transforms).
- **Transform reduction heuristics:** select=0.3x, filter=0.5x, drop=0.85x, compact=0.7x, truncate=min(tokens, cap).
- **Partial reads:** 0.3x multiplier for field-level references.
- **Retry multiplier:** `1 + max` for retry/retry_then_fallback strategies.
- **Graph totals:** bestCase (no retries) vs worstCase (all retries). Warn if worstCase > budget.

Returns `TokenReport` with per-node breakdown + warnings array.

## 6. Naming Decision

Common memory note: rename `analyzer/tokens.ts` to `analyzer/estimator.ts` to avoid collision with `lexer/tokens.ts`. The plan uses `tokens.ts` but the export is `TokenEstimator` -- renaming to `estimator.ts` is cleaner. Apply this during implementation.

## 7. Key Constraints

- Import from `parser/ast.js` (not `.ts`) per T1-R09
- Mutable AST interfaces per T3-R08
- No barrel exports per T1-R08
- GraftError extends Error per T2-R01
- `GraphDecl.flow` is `string[]` per T3-R10
