# Implementation Research — v2.2-R4: LSP Server

## Packages Required
```
npm install vscode-languageserver vscode-languageserver-textdocument
```
- `vscode-languageserver@9.0.1` — CJS but imports cleanly from ESM via Node's CJS interop
- `vscode-languageserver-textdocument@1.0.12` — TextDocument implementation
- Import path: `'vscode-languageserver/node'` (uses package `exports` map, works with NodeNext)
- No `.js` extension needed for node_modules imports

## Key API Patterns

### Connection Setup
```typescript
import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
```

### Capabilities
```typescript
connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    hoverProvider: true,
    definitionProvider: true,
  }
}));
```

### Diagnostics
- DiagnosticSeverity: Error=1, Warning=2
- Range: 0-based (subtract 1 from SourceLocation)
- Point diagnostic when lacking end position

### Hover: Return `{ contents: { kind: MarkupKind.Markdown, value: string } }`
### Definition: Return `{ uri, range }` — use sourceFile for cross-file navigation

### Lifecycle
```typescript
documents.listen(connection);
connection.listen();
```

## ESM Compatibility: LOW risk
- `esModuleInterop: true` already set
- `moduleResolution: "NodeNext"` handles `exports` field
- Well-trodden path

## Testing Strategy
- Unit test pure handler functions with vitest (no mock connection)
- Extract: `getDiagnostics()`, `getHoverInfo()`, `getDefinition()` as pure functions

## Warnings
- URI vs file path conversion needed
- SourceLocation lacks end position — use name length heuristic
- compile() does full pipeline including codegen — consider using it and ignoring files output
- compile() catches lex/parse errors but LSP should still wrap in try-catch
