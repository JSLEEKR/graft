# Code Review — v3.6-R1: LSP Find All References

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 753 passed, 0 failed
- Type check (tsc --noEmit): clean, no errors

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| `isReferable` checks all 5 ProgramIndex maps | MET | contextMap, nodeMap, memoryMap, graphMap, producesNodeMap — all checked (references.ts:5-12) |
| `isReferable` is broader than `isRenameable` | MET | `isRenameable` checks 4 maps (rename.ts:87-94), `isReferable` adds producesNodeMap |
| `findReferences` reuses `collectRenameLocations` | MET | Imported from rename.ts, inherits comment/string/import-path filtering |
| `includeDeclaration` filtering | MET | `findDeclNamePosition` computes name position from keyword location + keyword length; declaration skipped when flag is false |
| Cross-file scanning scans ALL workspace files (not just importers) | MET | Server handler iterates all workspaceExports entries, not filtered by import pattern (unlike rename handler) |
| Fast pre-filter with `includes()` | MET | `fileText.includes(word)` check before calling `collectRenameLocations` (server.ts:375) |
| `referencesProvider: true` in capabilities | MET | server.ts:76 |
| Server handler follows established patterns (thin wrapper, lazy workspace scan) | MET | Same pattern as rename handler: touchCache, getWordAtPosition, isReferable gate, lazy scan, null on empty results |
| 14 tests covering key scenarios | MET | 7 isReferable tests + 7 findReferences tests |
| Exports in features/index.ts | MET | `isReferable` and `findReferences` exported (index.ts:8) |

## A3-Skeptic Findings Verification
| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| `isRenameable` excludes produces names, need `isReferable` | HIGH | ADDRESSED | New `isReferable` function includes producesNodeMap |
| `referencesProvider: true` in capabilities | HIGH | ADDRESSED | Present at server.ts:76 |
| `includeDeclaration` support | MEDIUM | ADDRESSED | Full implementation with keyword-length-based position computation |
| Cross-file scope: scan all workspace files, not just importers | MEDIUM | ADDRESSED | Handler uses plain `includes()` filter, not import-pattern filter |

## Issues Found
### Critical (must fix)
None.

### Minor (observations, no fix needed)
1. **KEYWORD_LENGTHS hardcoded in references.ts**: The keyword-to-length mapping (`context:7, node:4, memory:6, graph:5, produces:8`) is hardcoded rather than derived. This is acceptable since these are language keywords that will not change, and the alternative (computing from AST) would add complexity without benefit.
2. **Produces declaration position**: The `findDeclNamePosition` for produces names uses `prodNode.produces.location` (the `produces` keyword position) + 9 chars ("produces" + space). This is correct assuming standard formatting. If the source had multiple spaces between `produces` and the name, the declaration would not be correctly identified for `includeDeclaration=false`. This is a known limitation shared with the same approach used elsewhere in the LSP, and is acceptable for the current scope.

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none
- New ratchet candidates from this round:
  - `isReferable` checks 5 maps (superset of `isRenameable`'s 4 maps)
  - `findReferences` reuses `collectRenameLocations` (no duplicated filtering logic)
  - Cross-file references scan ALL workspace files with `includes()` pre-filter

## Summary
Clean implementation. The `isReferable`/`findReferences` pair correctly extends the existing rename infrastructure for the broader find-all-references use case. The server handler follows established patterns. All 14 new tests pass alongside the existing 739 tests. No regressions, no type errors.
