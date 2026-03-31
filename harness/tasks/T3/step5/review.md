# Code Review — T3: AST Type Definitions

## Verdict: PASS

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Clean — zero errors |
| `npx vitest run` | 31/31 tests pass (2 test files) |
| ast.ts matches convergence spec | Exact match — see details below |
| SourceLocation imported from diagnostics.ts | Yes — `import { SourceLocation } from '../errors/diagnostics.js'` (line 1). `SourceLocation` is exported from `src/errors/diagnostics.ts` and is not redefined in ast.ts. Satisfies T3-R02. |
| `.js` import extension (T1-R09) | Yes — `'../errors/diagnostics.js'` uses `.js` extension |
| Narrowed literal unions (T3 debate resolution) | Yes — `primitive.name`: `'String' \| 'Int' \| 'Float' \| 'Bool'` (T3-R05); `domain.name`: `'FilePath' \| 'FileDiff' \| 'TestFile' \| 'IssueRef'` (T3-R06); `primitive_range.name`: `'Float'` (T3-R07) |
| JSDoc on `ConditionalBranch.condition` | Yes — `/** When undefined, this branch represents the \`else\` case (default target). */` present on line 52 |

## Convergence Spec Diff

The implementation in `src/parser/ast.ts` is a character-for-character match with the convergence spec code block. Every interface, type alias, discriminant, field name, field type, comment, and JSDoc annotation is identical. No additions, no omissions, no deviations.

## Ratchet Compliance

| Ratchet | Status |
|---------|--------|
| T3-R01 — Single file `src/parser/ast.ts` | Compliant |
| T3-R02 — Import SourceLocation from diagnostics.js | Compliant |
| T3-R03 — Interfaces for declarations, discriminated unions for polymorphic types | Compliant |
| T3-R04 — `kind` discriminant on TypeExpr/EdgeTarget, `type` discriminant on Transform/FailureStrategy | Compliant |
| T3-R05 — `primitive.name` narrowed to literal union | Compliant |
| T3-R06 — `domain.name` narrowed to literal union | Compliant |
| T3-R07 — `primitive_range.name` narrowed to `'Float'` | Compliant |
| T3-R08 — Mutable interfaces (no `readonly`) | Compliant |
| T3-R09 — No visitor pattern | Compliant |
| T3-R10 — `GraphDecl.flow` as `string[]` | Compliant |
| T3-R11 — `EdgeTarget` as discriminated union with `kind` | Compliant |
| T3-R12 — No test file for types-only module | Compliant |

## Cross-task Ratchet Compliance

| Ratchet | Status |
|---------|--------|
| T1-R09 — `.js` extension in relative imports | Compliant |

## Issues Found

None.

## Notes for common_memory.md

- [T3-REVIEW] PASS — ast.ts matches convergence spec exactly, `tsc --noEmit` clean, 31/31 tests pass
