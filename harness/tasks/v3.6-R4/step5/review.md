# Code Review — v3.6-R4: Integration/Regression Tests

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 790 passed, 0 failed
- Type check (tsc --noEmit): CLEAN
- R4 test file: 20 tests in tests/v36-r4.test.ts

## Convergence Compliance

This is a TEST-ONLY round with no convergence report. Requirements are derived from the v3.6 plan: integration/regression tests covering R1-R3 features (find-references, keyword derivation, symbol ranges, field collision).

| Requirement | Status | Notes |
|-------------|--------|-------|
| Cross-cutting integration tests (not unit test duplicates) | MET | All tests use full Lexer->Parser->ProgramIndex pipeline, not mocked units |
| R1 coverage: findReferences end-to-end | MET | Tests 1-6: context/node/produces references, includeDeclaration, cross-file, comment filtering |
| R2 coverage: GRAFT_KEYWORDS derivation | MET | Tests 7-10: subset of KEYWORDS, excludes types, excludes "output", contains core keywords |
| R2 coverage: parse-based conflict detection | MET | Tests 9-10: workspace conflict detection, comment-only names ignored |
| R3 coverage: symbol range containment | MET | Tests 11-12: selectionRange inside range for all kinds, keyword position verification |
| R3 coverage: field collision guard | MET | Tests 13: blocks rename to context field and produces field names |
| Cross-feature consistency test | MET | Test 14: findReferences count matches rename edit count |
| No false positives | MET | See analysis below |

## Integration Quality Analysis

### Strengths
1. **Shared fixture (FULL_GFT)**: A realistic multi-declaration source is reused across tests, exercising the full pipeline in a realistic scenario.
2. **Cross-feature test** (test 14): Verifies that findReferences and rename produce consistent counts -- a genuine integration concern that unit tests miss.
3. **Cross-file tests** (tests 4, 9, 10): Exercise workspace-level operations with multiple source files.
4. **No duplication with R1-R3 unit tests**: R1 tests test individual reference categories (edge source/target, graph input/output, foreach, fallback). R4 tests use end-to-end parse-to-reference pipelines with realistic source files. R2 tests test individual GRAFT_KEYWORDS properties. R4 tests additionally test the rename rejection path with multiple keywords in a loop. R3 tests test makeSymbol directly. R4 tests getDocumentSymbols with full parsed programs.

### Minor Observations
1. **String filtering test (test 6)**: The source does not actually contain "Alpha" inside a string literal, so the test validates correct behavior but does not stress the string-filtering path. This is acceptable since the unit test in v3.5-R1 covers that path directly.
2. **Comment filtering test (test 5)**: Correctly validates that returned references don't point to comment lines, which is a proper integration assertion.

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None. The string-filtering observation above is cosmetic and covered by existing unit tests.

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none

## R3 Fix Verification
The R3 review (NEEDS_CHANGES) identified that selectionRange started at keyword position instead of name position. The fix has been applied in `src/lsp/features/symbols.ts:69`: `const nameStart = loc.length != null ? character + loc.length + 1 : character`. Test 12 in R4 explicitly verifies that `selectionRange.start.character > 0` and `selectionRange width === name.length` for a "context MyCtx" declaration.
