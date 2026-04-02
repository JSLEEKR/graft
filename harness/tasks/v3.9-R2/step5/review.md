# Code Review — v3.9-R2: Estimator Polish + TD-01 (DIRECT)

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 880 passed, 0 failed

## R-PROC-17 Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| BUDGET_CHAIN_CYCLE in GraftErrorCode | MET | Added to BudgetErrorCode union in diagnostics.ts:33 |
| BUDGET_CHAIN_DEPTH in GraftErrorCode | MET | Added to BudgetErrorCode union in diagnostics.ts:34 |
| Cycle warnings use BUDGET_CHAIN_CYCLE | MET | estimator.ts:207 — conditional cycle detection emits BUDGET_CHAIN_CYCLE |
| Depth warnings use BUDGET_CHAIN_DEPTH | MET | estimator.ts:185 — depth limit exceeded emits BUDGET_CHAIN_DEPTH |
| BUDGET_EXCEEDED unchanged for actual budget | MET | estimator.ts:69 — graph budget exceeded still uses BUDGET_EXCEEDED |
| retry_then_fallback includes fallback cost | MET | getFallbackCost() at estimator.ts:306-311, added to worst-case at lines 136, 153 |
| Import-path regex replaced with AST-based check | MET | getImportPathRanges() + isInImportPath() in rename.ts:169-204, no regex for import paths |
| Existing test updated (v38-r2) | MET | v38-r2.test.ts:161 checks BUDGET_CHAIN_CYCLE instead of old code |

## Code Quality Check

### estimator.ts
- getFallbackCost correctly resolves fallback node by name and computes full node cost (input + output). Only activates for `retry_then_fallback` type. Returns 0 for missing node or non-fallback failure types. Sound logic.
- getRetryMultiplier for `retry_then_fallback` returns `1 + max` (retry attempts), correctly excluding the fallback from the multiplier since fallback cost is added separately.
- BUDGET_CHAIN_CYCLE and BUDGET_CHAIN_DEPTH are distinct from BUDGET_EXCEEDED, maintaining backward compatibility.

### rename.ts (TD-01)
- getImportPathRanges parses via Lexer+Parser, iterates program.imports, locates the `from "..."` string in source text by offset searching. This is AST-based (uses parsed import declarations) rather than regex-based pattern matching.
- isInImportPath performs correct overlap check: match must be fully contained within a path range.
- Graceful degradation: parse failure returns empty ranges, so rename still works without import filtering.
- No regex used for import path detection (the remaining regex is for word-boundary matching of the identifier name, which is correct).

### Tests (v39-r2.test.ts)
- 6 tests covering all requirements: cycle code, depth code, budget exceeded unchanged, fallback cost arithmetic, import path skip, import path non-skip.
- Test 4 (fallback cost) verifies exact arithmetic: bestCase=300, worstCase=1300, confirming fallback node cost (400) is correctly added.
- Tests 5-6 verify AST-based import path filtering with realistic import syntax.

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none

## Fix Instructions
N/A — verdict is PASS.
