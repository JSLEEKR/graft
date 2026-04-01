#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'node:url';
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

    // Filter GRAPH_MISSING for LSP -- library files are valid
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
