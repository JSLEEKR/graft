# A1-Architect Independent Analysis — v2.2-R4: LSP Server

## Convergence Score: 8/10

## Key Design Decisions

- **Two-file architecture**: `src/lsp/server.ts` (thin wiring ~60 lines) + `src/lsp/features.ts` (pure functions)
- **Intermediate result types**: LspDiagnostic, HoverResult, DefinitionResult — plain objects with no vscode-languageserver dependency in features.ts
- **Per-document cache**: `Map<string, { program, index }>` — cache on successful compile, serve stale data for hover/definition when current edit has errors
- **`getWordAtPosition(text, line, character)`**: Shared regex utility for both hover and definition
- **`formatType(TypeExpr): string`**: Exhaustive switch for human-readable type display (distinct from typeToExample)
- **Hand-rolled URI conversion**: Avoid vscode-uri dependency. Simple encode/decode.

## File Structure
```
src/lsp/
  server.ts      — entry point, connection wiring, URI conversion
  features.ts    — pure functions: toDiagnostics, getHoverInfo, getDefinition, getWordAtPosition, formatType
```

## Pure Functions in features.ts
- `sourceLocationToRange(loc, length)` — 1-based → 0-based conversion
- `toDiagnostics(errors, warnings)` → LspDiagnostic[]
- `getWordAtPosition(text, line, character)` → WordAtPosition | null
- `getHoverInfo(index, sourceText, line, character)` → HoverResult | null
- `getDefinition(index, sourceText, line, character)` → DefinitionResult | null
- `formatType(type)` → string

## Hover Content
- Context: fields with types, max_tokens
- Node: model, budget, reads, writes, produces
- Memory: fields with types, max_tokens, storage
- Produces: fields from producer node

## Potential Issues
- P1: URI encoding edge cases on Windows (spaces, Unicode)
- P2: compile() requires OS path — uriToFilePath must produce correct format
- P3: Point-range diagnostics (SourceLocation lacks end position)
- P4: MemoryDecl lacks sourceFile (not importable per v2.0-R13)
- P5: No cross-file cache invalidation
- P6: `as any` cast for diagnostics (intermediate types vs LSP types)

## Trade-offs
- Pro: 100% unit testable without LSP mocking
- Pro: Cache-on-success means hover works during syntax errors
- Con: compile() runs full pipeline including codegen on every keystroke (fast enough for MVP)
- Con: Hand-rolled URI conversion may have edge cases
