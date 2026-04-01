# A2-Pragmatist Independent Analysis — v2.2-R4: LSP Server

## Convergence Score: 8/10

## Key Positions

- **Two files only**: `src/lsp/server.ts` (wiring ~55 lines) + `src/lsp/features.ts` (pure functions ~120 lines)
- **Node stdlib for URI**: `fileURLToPath`/`pathToFileURL` from `node:url` — no vscode-uri dependency
- **features.ts uses LSP types directly**: Import `Diagnostic`, `Hover`, `Location` from vscode-languageserver. No intermediate types.
- **Point diagnostics**: start === end range (no end-position heuristic)
- **getWordAtPosition returns string only** (not a struct with start/end)
- **Go-to-definition returns null for no sourceFile** (graceful degradation)

## Deferred
- Cross-file invalidation
- Completion provider
- Go-to-definition for produces names (producesNodeMap lacks sourceFile)
- Diagnostic end-position heuristics

## Trade-offs
- Pro: ~180 lines total, pure functions trivially testable
- Pro: Node stdlib URI conversion (no extra dep)
- Con: Point diagnostics (minor UX)
- Con: features.ts coupled to vscode-languageserver types (but simplifies code)
