# A3-Skeptic Independent Analysis — v2.2-R4: LSP Server

## Convergence Score: 7/10

## Critical Finding: GRAPH_MISSING blocks library files
compile() returns `{ success: false, errors: [GRAPH_MISSING] }` WITHOUT program when file has no graph. Library files (shared.gft per v2.0-R32) have no graph by design. The LSP cannot provide hover/definition without the Program.

Proposes `lspCompile()` that duplicates compile pipeline without graph check.

## Other Issues Found
- URI-to-path: Must use `fileURLToPath()` from node:url (Windows drive letter issues)
- Path-to-URI: Must use `pathToFileURL()` (handles backslashes, spaces, unicode)
- compile() throws non-GraftError: Wrap in try-catch-all
- MemoryDecl lacks sourceFile (correct per v2.0-R13)
- Unsaved imported files: LSP compiles from buffer, resolver reads from disk (MVP limitation)
- Position on `.` in `Research.findings`: Splits correctly, but field-level definition out of scope

## Key Positions
- Two files: server.ts + handlers.ts
- `lspCompile()` instead of `compile()` to handle library files
- Node stdlib for URI conversion
- Regex word extraction matching lexer's identifier pattern
- Cache per-URI with stale-on-error behavior
- formatType exhaustive switch
