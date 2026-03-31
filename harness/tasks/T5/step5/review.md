# T5 Code Review: Analyzer (Scope, Type, Token Estimation)

## Verdict: PASS

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Clean, no errors |
| `npx vitest run` | 78/78 tests pass (14 analyzer, 33 parser, 26 lexer, 5 setup) |
| File named `estimator.ts` (not `tokens.ts`) | Confirmed: `src/analyzer/estimator.ts` |
| Parser constructor uses `Token[]` only | Confirmed: `new Parser(tokens).parse()` in test helper (line 13) |
| Graph input/output validation in ScopeChecker | Confirmed: `checkGraphFlow()` validates `graph.input` against `contextNames` and `graph.output` against `producesMap` |
| Error accumulation (returns `GraftError[]`, not throws) | Confirmed: `check(): GraftError[]` in both ScopeChecker and TypeChecker; `estimate()` returns `TokenReport` with `warnings: GraftError[]` |
| `.js` import extensions | Confirmed in all source and test files |
| Three-class decomposition | Confirmed: `scope.ts`, `types.ts`, `estimator.ts` |

## Convergence Requirements Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Three-class decomposition (ScopeChecker, TypeChecker, TokenEstimator) | Met | Separate files, separate concerns |
| Error accumulation pattern | Met | All checkers return `GraftError[]`, never throw |
| Rename to `estimator.ts` | Met | No `tokens.ts` in `src/analyzer/` |
| Parser constructor fix (T4-R01) | Met | `new Parser(tokens)` only |
| Graph input/output validation in ScopeChecker | Met | `checkGraphFlow()` method |
| Transform heuristics (select=0.3, filter=0.5, drop=0.85, compact=0.7, truncate=min) | Met | `applyTransformReductions()` in estimator.ts |
| Multi-error accumulation test | Met | "accumulates multiple errors" test asserts `>= 2` errors |
| Per-node budgetIn warning | Met | Warns when `estimatedIn > node.budgetIn` |
| retry_then_fallback fallback cost: TODO comment | Met | Line 95 of estimator.ts |
| Conditional edge estimation: TODO comment | Met | Line 36 of estimator.ts |
| V1: single graph (`graphs[0]`) | Met | Line 41 of estimator.ts |

## Implementation vs Convergence Diff

One minor deviation from the convergence spec, accepted as an improvement:

- **EdgeDecl import**: Convergence spec used inline `import('../parser/ast.js').EdgeDecl` type annotation for `edgeMap`. Implementation uses a standard named import (`import { Program, NodeDecl, EdgeDecl, Transform } from '../parser/ast.js'`). This is cleaner and passes `tsc --noEmit`, so it is preferred.

## Test Coverage Assessment

- **ScopeChecker**: 8 tests covering valid reads, undeclared context, invalid partial field, undeclared edge node, undeclared flow node, undeclared graph input, undeclared graph output, multi-error accumulation
- **TypeChecker**: 3 tests covering valid transforms, select on nonexistent field, drop on nonexistent field
- **TokenEstimator**: 3 tests covering basic estimation, worst-case budget warning, per-node budgetIn warning

Total: 14 analyzer tests, all passing.

## Ratchets Confirmed

- [T5-R01] Analyzer uses error accumulation (`GraftError[]`), not throw
- [T5-R02] File naming: `estimator.ts` not `tokens.ts`
- [T5-R03] Graph input/output validation in ScopeChecker
- [T5-R04] Per-node budgetIn warning in TokenEstimator
- [T5-R05] Three-class decomposition: `scope.ts`, `types.ts`, `estimator.ts`

## Issues Found

None. Implementation matches convergence spec faithfully. All tests pass, types check clean.
