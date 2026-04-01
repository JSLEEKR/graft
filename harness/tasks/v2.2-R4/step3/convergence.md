# Convergence Report — v2.2-R4: LSP Server

## Summary

High consensus (score range 8-7=1). Cross-critique skipped. All agents agreed on: two-file structure, pure functions, full document sync, regex word extraction, ProgramIndex lookups, per-URI cache, formatType helper. A3 found critical GRAPH_MISSING issue (compile() drops program for library files). Resolved by including program in GRAPH_MISSING return + filtering in LSP.

## Disagreement Resolutions

| # | Issue | Positions | Adopted | Rationale |
|---|-------|-----------|---------|-----------|
| 1 | GRAPH_MISSING library files | A3: build lspCompile(). A1/A2/A4: use compile() directly | Fix compile() to return program + filter in LSP | One-line fix vs pipeline duplication. A3 identified the real bug; resolution differs. |
| 2 | File count | A1/A2/A3: 2 files. A4: 5 files | 2 files (A1/A2/A3) | ~200 lines total doesn't justify 5 files |
| 3 | URI conversion | A1: hand-rolled. A2/A3: Node stdlib | Node stdlib (A2/A3) | `fileURLToPath`/`pathToFileURL` handle Windows edge cases correctly |
| 4 | Intermediate types | A1: custom types (no LSP dep in features). A2/A3/A4: LSP types | LSP types directly (A2) | vitest can import vscode-languageserver. Indirection adds no value. |
| 5 | getWordAtPosition return | A1: struct with start/end. A2: string only | string only (A2) | Server only needs the word for ProgramIndex lookup. Range computed from word position. |

## Implementation Spec

### Package Installation

```
npm install vscode-languageserver vscode-languageserver-textdocument
```

### Modified: `src/compiler.ts`

Add `program` to the GRAPH_MISSING return (line 59-65):

```typescript
if (program.graphs.length === 0) {
    return {
      success: false,
      program,  // ADD: return program even when no graph
      errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING')],
      warnings,
    };
  }
```

This ensures the LSP always has the Program for hover/definition, even on library files.

### New File: `src/lsp/server.ts`

```typescript
#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from '../compiler.js';
import { ProgramIndex } from '../program-index.js';
import type { Program } from '../parser/ast.js';
import { toDiagnostics, getHoverInfo, getDefinitionLocation, getWordAtPosition } from './features.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const cache = new Map<string, { program: Program; index: ProgramIndex }>();

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    hoverProvider: true,
    definitionProvider: true,
  },
}));

documents.onDidChangeContent((change) => {
  const doc = change.document;
  const uri = doc.uri;
  const filePath = fileURLToPath(uri);

  try {
    const result = compile(doc.getText(), filePath);

    // Filter GRAPH_MISSING for LSP — library files are valid
    const errors = result.errors.filter(e => e.code !== 'GRAPH_MISSING');
    const diagnostics = toDiagnostics(errors, result.warnings);
    connection.sendDiagnostics({ uri, diagnostics });

    if (result.program) {
      cache.set(uri, { program: result.program, index: new ProgramIndex(result.program) });
    }
  } catch {
    connection.sendDiagnostics({ uri, diagnostics: [] });
  }
});

documents.onDidClose((e) => {
  cache.delete(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = cache.get(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word) return null;

  return getHoverInfo(word, state.index);
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = cache.get(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word) return null;

  return getDefinitionLocation(word, state.index, params.textDocument.uri);
});

documents.listen(connection);
connection.listen();
```

### New File: `src/lsp/features.ts`

```typescript
import type { Diagnostic, Hover, Location } from 'vscode-languageserver/node';
import { DiagnosticSeverity, MarkupKind } from 'vscode-languageserver/node';
import { pathToFileURL } from 'node:url';
import type { GraftError, SourceLocation } from '../errors/diagnostics.js';
import type { TypeExpr } from '../parser/ast.js';
import type { ProgramIndex } from '../program-index.js';

// --- Diagnostics ---

export function toDiagnostics(errors: GraftError[], warnings: GraftError[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const e of errors) {
    result.push(makeDiagnostic(e, DiagnosticSeverity.Error));
  }
  for (const w of warnings) {
    result.push(makeDiagnostic(w, DiagnosticSeverity.Warning));
  }
  return result;
}

function makeDiagnostic(e: GraftError, severity: DiagnosticSeverity): Diagnostic {
  const line = Math.max(0, e.location.line - 1);
  const character = Math.max(0, e.location.column - 1);
  return {
    range: {
      start: { line, character },
      end: { line, character },
    },
    severity,
    message: e.message,
    source: 'graft',
    ...(e.code ? { code: e.code } : {}),
  };
}

// --- Word Extraction ---

export function getWordAtPosition(text: string, line: number, character: number): string | null {
  const lines = text.split('\n');
  if (line < 0 || line >= lines.length) return null;
  const lineText = lines[line];
  if (character < 0 || character > lineText.length) return null;

  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return match[0];
    }
  }
  return null;
}

// --- Hover ---

export function getHoverInfo(word: string, index: ProgramIndex): Hover | null {
  const ctx = index.contextMap.get(word);
  if (ctx) {
    const fields = ctx.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**context** ${ctx.name} (max_tokens: ${ctx.maxTokens})\n\`\`\`\n${fields}\n\`\`\``);
  }

  const node = index.nodeMap.get(word);
  if (node) {
    const reads = node.reads.map(r => r.field ? `${r.context}.${r.field}` : r.context).join(', ');
    const writes = node.writes.length > 0 ? `\nwrites: ${node.writes.join(', ')}` : '';
    const producesFields = node.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(
      `**node** ${node.name}\n` +
      `- model: ${node.model}\n` +
      `- budget: ${node.budgetIn}/${node.budgetOut}\n` +
      `- reads: ${reads}${writes}\n` +
      `- produces: ${node.produces.name}\n\`\`\`\n${producesFields}\n\`\`\``
    );
  }

  const mem = index.memoryMap.get(word);
  if (mem) {
    const fields = mem.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**memory** ${mem.name} (max_tokens: ${mem.maxTokens}, storage: ${mem.storage})\n\`\`\`\n${fields}\n\`\`\``);
  }

  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    const fields = producerNode.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**produces** ${word} (from node ${producerNode.name})\n\`\`\`\n${fields}\n\`\`\``);
  }

  return null;
}

// --- Go-to-Definition ---

export function getDefinitionLocation(word: string, index: ProgramIndex, currentUri: string): Location | null {
  // Try context
  const ctx = index.contextMap.get(word);
  if (ctx) return declLocation(ctx.location, ctx.sourceFile, word.length, currentUri);

  // Try node
  const node = index.nodeMap.get(word);
  if (node) return declLocation(node.location, node.sourceFile, word.length, currentUri);

  // Try produces
  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    return declLocation(producerNode.produces.location, producerNode.sourceFile, word.length, currentUri);
  }

  // Try memory (no sourceFile — memories can't be imported, v2.0-R13)
  const mem = index.memoryMap.get(word);
  if (mem) return declLocation(mem.location, undefined, word.length, currentUri);

  return null;
}

function declLocation(loc: SourceLocation, sourceFile: string | undefined, nameLength: number, currentUri: string): Location {
  const uri = sourceFile ? pathToFileURL(sourceFile).toString() : currentUri;
  const line = Math.max(0, loc.line - 1);
  const character = Math.max(0, loc.column - 1);
  return {
    uri,
    range: {
      start: { line, character },
      end: { line, character: character + nameLength },
    },
  };
}

// --- Type Formatting ---

export function formatType(type: TypeExpr): string {
  switch (type.kind) {
    case 'primitive': return type.name;
    case 'primitive_range': return `Float(${type.min}..${type.max})`;
    case 'list': return `List<${formatType(type.element)}>`;
    case 'map': return `Map<${formatType(type.key)}, ${formatType(type.value)}>`;
    case 'optional': return `${formatType(type.inner)}?`;
    case 'token_bounded': return `${formatType(type.inner)}(max: ${type.max})`;
    case 'enum': return type.values.join(' | ');
    case 'struct': return `{ ${type.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')} }`;
    case 'domain': return type.name;
  }
}

// --- Helpers ---

function mkHover(value: string): Hover {
  return { contents: { kind: MarkupKind.Markdown, value } };
}
```

### Modified: `package.json`

```json
{
  "bin": {
    "graft": "./dist/index.js",
    "graft-lsp": "./dist/lsp/server.js"
  },
  "dependencies": {
    "commander": "^14.0.0",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  }
}
```

### Test Targets

**tests/lsp.test.ts** (~20 tests):

1. **toDiagnostics** (~4 tests):
   - Error maps to severity Error with 0-based position
   - Warning maps to severity Warning
   - Error code included when present
   - Empty arrays produce empty diagnostics

2. **getWordAtPosition** (~5 tests):
   - Returns identifier at cursor position
   - Returns null for punctuation
   - Returns null for out-of-bounds line
   - Returns null for whitespace position
   - Handles multi-line text

3. **getHoverInfo** (~5 tests):
   - Context: shows fields, max_tokens
   - Node: shows model, budget, reads, produces
   - Memory: shows fields, storage
   - Produces: shows fields, parent node name
   - Unknown word returns null

4. **getDefinitionLocation** (~4 tests):
   - Context: returns location with correct 0-based position
   - Node with sourceFile: returns cross-file URI
   - Unknown name: returns null
   - Memory (no sourceFile): returns currentUri

5. **formatType** (~3 tests):
   - Primitive: returns name
   - List<String>: nested formatting
   - Complex nested type (optional list, struct)

6. **compile() GRAPH_MISSING fix** (~1 test):
   - Library file (no graph) returns program in CompileResult

### Expected Test Count

337 existing + ~22 new = ~359 tests

## Ratchet Items

- [v2.2-R16] LSP: 2-file structure (server.ts + features.ts), pure functions for all handlers — LOCKED
- [v2.2-R17] LSP: Node stdlib URI conversion (fileURLToPath/pathToFileURL), no vscode-uri — LOCKED
- [v2.2-R18] LSP: GRAPH_MISSING filtered from LSP diagnostics; compile() returns program on no-graph — LOCKED
- [v2.2-R19] LSP: Full document sync (TextDocumentSyncKind.Full), compile-on-change — LOCKED
- [v2.2-R20] LSP: Per-URI cache of { program, index }, stale data for hover/definition on error — LOCKED
- [v2.2-R21] LSP: formatType exhaustive switch over TypeExpr, distinct from typeToExample — LOCKED
