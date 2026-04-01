#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileToProgram } from '../compiler.js';
import type { Program } from '../parser/ast.js';
import type { ProgramIndex } from '../program-index.js';
import { toDiagnostics, getHoverInfo, getDefinitionLocation, getWordAtPosition, getCompletions } from './features.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const cache = new Map<string, { program: Program; index: ProgramIndex }>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Track import dependencies: importedFile → Set of URIs that import it
const importDeps = new Map<string, Set<string>>();

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Full,
    hoverProvider: true,
    definitionProvider: true,
    completionProvider: {
      triggerCharacters: ['.', '[', '{'],
    },
  },
}));

function validateDocument(doc: TextDocument): void {
  const uri = doc.uri;
  const filePath = fileURLToPath(uri);

  try {
    const result = compileToProgram(doc.getText(), filePath);

    const diagnostics = toDiagnostics(result.errors, result.warnings);
    connection.sendDiagnostics({ uri, diagnostics });

    if (result.program && result.index) {
      cache.set(uri, { program: result.program, index: result.index });
      // Track import dependencies
      for (const imp of result.program.imports) {
        if (imp.resolvedPath) {
          const depUri = pathToFileURL(imp.resolvedPath).toString();
          let dependents = importDeps.get(depUri);
          if (!dependents) {
            dependents = new Set();
            importDeps.set(depUri, dependents);
          }
          dependents.add(uri);
        }
      }
    }
  } catch {
    connection.sendDiagnostics({ uri, diagnostics: [] });
  }
}

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  const existing = debounceTimers.get(uri);
  if (existing) clearTimeout(existing);
  debounceTimers.set(uri, setTimeout(() => {
    debounceTimers.delete(uri);
    const doc = documents.get(uri);
    if (doc) {
      validateDocument(doc);
      // Invalidate dependents of this file
      const dependents = importDeps.get(uri);
      if (dependents) {
        for (const depUri of dependents) {
          const depDoc = documents.get(depUri);
          if (depDoc) validateDocument(depDoc);
        }
      }
    }
  }, 200));
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

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const state = cache.get(params.textDocument.uri);
  return getCompletions(
    doc.getText(),
    params.position.line,
    params.position.character,
    state ?? null,
  );
});

documents.listen(connection);
connection.listen();
