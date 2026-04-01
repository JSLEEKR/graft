# Architecture Research — v2.2-R4: LSP Server

## Key Patterns

1. **Connection-Documents-Handlers**: `createConnection()` + `TextDocuments<TextDocument>` + request handlers. Universal pattern.
2. **Compile-on-Change with Diagnostic Push**: Hook `onDidChangeContent`, call `compile()`, push diagnostics. Maps directly to Graft's compile().
3. **Token-at-Position via Regex**: Extract identifier at cursor with regex `[A-Za-z_][A-Za-z0-9_]*`, look up in ProgramIndex. Simpler than re-lexing.
4. **Sans-IO Testing**: Extract logic into pure functions, test without mocking JSON-RPC.
5. **Full Document Sync**: TextDocumentSyncKind.Full — Graft files are small, incremental sync adds complexity with no benefit.
6. **Separate Entry Point**: `src/lsp/server.ts` with shebang, `graft-lsp` bin entry. LSP depends on compiler, not vice versa.

## Location Mapping
- Graft SourceLocation: 1-based line, 1-based column
- LSP Position: 0-based line, 0-based character
- Mapping: `{ line: loc.line - 1, character: loc.column - 1 }`
- SourceLocation lacks end position — use declaration name length for Range end

## Warnings
1. **URI vs file path**: LSP uses `file:///` URIs, compile() expects OS paths. Convert carefully (Windows `/C:/` issue).
2. **No end position in SourceLocation**: Use heuristic for diagnostic Range end.
3. **compile() error handling**: Wrap in try-catch to avoid crashing server on malformed input.
4. **No cross-file invalidation**: Editing imported file won't re-validate importer. Acceptable for MVP.

## Recommended Architecture
- Thin server.ts (~50 lines): connection wiring only
- Pure functions for features: `toDiagnostics(errors, warnings)`, `getHoverInfo(program, index, position)`, `getDefinition(program, index, position, sourceText)`
- Cache last successful `{ program, index }` per URI for hover/definition between edits
- Re-compile on every change (compile is <10ms for typical files)
