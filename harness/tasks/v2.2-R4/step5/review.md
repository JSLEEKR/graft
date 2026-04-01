# Code Review — v2.2-R4: LSP Server

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 359 passed, 0 failed (337 existing + 22 new)
- TypeScript type check: clean (tsc --noEmit produces no errors)

## Convergence Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| 2-file structure (server.ts + features.ts) | MET | `src/lsp/server.ts` (77 lines) + `src/lsp/features.ts` (151 lines) |
| Node stdlib URI conversion | MET | `fileURLToPath` in server.ts, `pathToFileURL` in features.ts. No vscode-uri dependency. |
| GRAPH_MISSING filtered in LSP + program returned | MET | server.ts:37 filters by error code; compiler.ts:68 returns `program` in GRAPH_MISSING branch |
| Full document sync (TextDocumentSyncKind.Full) | MET | server.ts:23 |
| Per-URI cache of { program, index } | MET | server.ts:18, populated on change (line 42), cleared on close (line 49) |
| Stale data for hover/definition on error | MET | Cache only updated when `result.program` exists (line 41); catch block clears diagnostics but leaves cache intact (line 44) |
| formatType exhaustive switch | MET | features.ts:133-144 covers all 9 TypeExpr kinds (primitive, primitive_range, list, map, optional, token_bounded, enum, struct, domain) |
| Pure functions in features.ts | MET | All exported functions (toDiagnostics, getWordAtPosition, getHoverInfo, getDefinitionLocation, formatType) are pure — no side effects, no module-level state |
| getWordAtPosition returns string only | MET | features.ts:38 returns `string | null` |
| Regex word extraction | MET | features.ts:44 uses `/[A-Za-z_][A-Za-z0-9_]*/g` |
| Hover: context, node, memory, produces, null | MET | features.ts:58-92 covers all 5 cases |
| Definition: context, node, produces, memory, null | MET | features.ts:96-116 covers all 5 cases |
| Memory definition uses currentUri (no sourceFile) | MET | features.ts:112-113 passes `undefined` for sourceFile |
| package.json bin entry + dependencies | MET | graft-lsp bin entry, vscode-languageserver ^9.0.1, vscode-languageserver-textdocument ^1.0.12 |
| compiler.ts returns program on GRAPH_MISSING | MET | compiler.ts:68 includes `program` in return object |
| onDidClose clears cache and diagnostics | MET | server.ts:49-51 |
| ~22 tests | MET | Exactly 22 tests in tests/lsp.test.ts |
| makeDiagnostic 1-to-0-based conversion | MET | features.ts:22-23 subtracts 1 from both line and column |
| declLocation 1-to-0-based conversion | MET | features.ts:120-121 subtracts 1 from both line and column |
| shebang on server.ts | MET | server.ts:1 `#!/usr/bin/env node` |

## Deviations from Convergence Spec

1. **Minor (positive)**: server.ts only imports `fileURLToPath` from `node:url`, not `{ fileURLToPath, pathToFileURL }` as shown in convergence spec. This is correct — `pathToFileURL` is only used in features.ts. The implementation correctly avoids unused imports.

2. **Minor (cosmetic)**: Comment in server.ts:36 uses `--` instead of em dash `—` from spec. No functional impact.

Both deviations are improvements over the spec. No negative deviations found.

## Issues Found

### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All 122 existing locked decisions respected: YES
- New ratchet items (6) correctly formulated in convergence report
- Violations: none

### New Ratchet Items Verified

| Ratchet | Verification |
|---------|-------------|
| [v2.2-R16] 2-file structure, pure functions | server.ts + features.ts, all feature functions are pure |
| [v2.2-R17] Node stdlib URI conversion | fileURLToPath (server.ts:9), pathToFileURL (features.ts:3) |
| [v2.2-R18] GRAPH_MISSING filtered + program returned | server.ts:37, compiler.ts:68 |
| [v2.2-R19] Full document sync, compile-on-change | server.ts:23, server.ts:28 |
| [v2.2-R20] Per-URI cache, stale on error | server.ts:18, server.ts:41-42, catch preserves cache |
| [v2.2-R21] formatType exhaustive switch | features.ts:133-144, all 9 TypeExpr kinds covered |

## Test Coverage Assessment

| Category | Spec Target | Actual | Coverage |
|----------|-------------|--------|----------|
| toDiagnostics | ~4 tests | 4 tests | Full |
| getWordAtPosition | ~5 tests | 5 tests | Full |
| getHoverInfo | ~5 tests | 5 tests | Full |
| getDefinitionLocation | ~4 tests | 4 tests | Full |
| formatType | ~3 tests | 3 tests (last test covers 7 sub-assertions) | Full — all 9 TypeExpr kinds exercised |
| compile() GRAPH_MISSING | ~1 test | 1 test | Full |
| **Total** | **~22** | **22** | **Exact match** |

## Memory Update Preparation

### New ratchet items (6):
- [v2.2-R16] LSP: 2-file structure (server.ts + features.ts), pure functions for all handlers — LOCKED
- [v2.2-R17] LSP: Node stdlib URI conversion (fileURLToPath/pathToFileURL), no vscode-uri — LOCKED
- [v2.2-R18] LSP: GRAPH_MISSING filtered from LSP diagnostics; compile() returns program on no-graph — LOCKED
- [v2.2-R19] LSP: Full document sync (TextDocumentSyncKind.Full), compile-on-change — LOCKED
- [v2.2-R20] LSP: Per-URI cache of { program, index }, stale data for hover/definition on error — LOCKED
- [v2.2-R21] LSP: formatType exhaustive switch over TypeExpr, distinct from typeToExample — LOCKED

### Review feedback line:
- v2.2-R4: PASS. 359 tests (337 existing + 22 new). 6 new ratchet items. Zero negative deviations. MEDIUM tier (2 agents, cross-critique skipped).

### Debate ROI line:
- v2.2-R4 (MEDIUM): 5 agent calls. A3 found GRAPH_MISSING library file bug (program dropped for files without graph). Clean implementation with exact test count match.

### Notes for future:
- v2.2-R4 complete: LSP server with diagnostics, hover, go-to-definition for contexts/nodes/memories/produces
- LSP currently supports full document sync only; incremental sync deferred
- LSP tests exercise pure functions only; server.ts integration (connection lifecycle) not directly tested
- tsconfig.json paths added for vscode-languageserver module resolution
