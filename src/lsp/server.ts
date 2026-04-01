#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  CodeActionKind,
} from 'vscode-languageserver/node';
import type { CodeAction } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compileToProgram } from '../compiler.js';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import type { Program } from '../parser/ast.js';
import type { ProgramIndex } from '../program-index.js';
import { toDiagnostics, getHoverInfo, getDefinitionLocation, getWordAtPosition, getCompletions, extractUndefinedName, buildAutoImportEdit, computeRelativeImportPath, getDocumentSymbols, isRenameable, collectRenameLocations } from './features.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const MAX_CACHE_SIZE = 50;
const cache = new Map<string, { program: Program; index: ProgramIndex; lastAccess: number }>();

function evictIfNeeded(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  let oldestKey = '';
  let oldestTime = Infinity;
  for (const [key, val] of cache) {
    if (val.lastAccess < oldestTime) {
      oldestTime = val.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

function touchCache(uri: string): { program: Program; index: ProgramIndex } | undefined {
  const entry = cache.get(uri);
  if (entry) {
    entry.lastAccess = Date.now();
    return entry;
  }
  return undefined;
}
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Track import dependencies: importedFile → Set of URIs that import it
const importDeps = new Map<string, Set<string>>();

// Workspace export cache for auto-import code actions
const workspaceExports = new Map<string, string[]>();
let workspaceRoot: string | null = null;
let workspaceScanDone = false;

connection.onInitialize((params) => {
  const folders = params.workspaceFolders;
  if (folders && folders.length > 0) {
    workspaceRoot = fileURLToPath(folders[0].uri);
  } else if (params.rootUri) {
    workspaceRoot = fileURLToPath(params.rootUri);
  }
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: {
        triggerCharacters: ['.', '[', '{'],
      },
      documentSymbolProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
      renameProvider: {
        prepareProvider: true,
      },
    },
  };
});

function validateDocument(doc: TextDocument): void {
  const uri = doc.uri;
  const filePath = fileURLToPath(uri);

  try {
    const result = compileToProgram(doc.getText(), filePath);

    const diagnostics = toDiagnostics(result.errors, result.warnings);
    connection.sendDiagnostics({ uri, diagnostics });

    if (result.program && result.index) {
      cache.set(uri, { program: result.program, index: result.index, lastAccess: Date.now() });
      evictIfNeeded();
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
      // Update workspace export cache for changed file
      if (uri.startsWith('file:')) {
        const changedPath = fileURLToPath(uri);
        if (changedPath.endsWith('.gft')) parseAndCacheExports(changedPath);
      }
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
  const state = touchCache(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word) return null;

  return getHoverInfo(word, state.index);
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = touchCache(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word) return null;

  return getDefinitionLocation(word, state.index, params.textDocument.uri);
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const state = touchCache(params.textDocument.uri);

  const resolveImportNames = (importPath: string): string[] => {
    try {
      const currentFilePath = fileURLToPath(params.textDocument.uri);
      let resolved = path.resolve(path.dirname(currentFilePath), importPath);
      if (!resolved.endsWith('.gft')) resolved += '.gft';
      const source = fs.readFileSync(resolved, 'utf-8');
      const tokens = new Lexer(source).tokenize();
      const result = new Parser(tokens).parse();
      return [
        ...result.program.contexts.map(c => c.name),
        ...result.program.nodes.map(n => n.name),
      ];
    } catch {
      return [];
    }
  };

  return getCompletions(
    doc.getText(),
    params.position.line,
    params.position.character,
    state ?? null,
    resolveImportNames,
  );
});

connection.onDocumentSymbol((params) => {
  const state = touchCache(params.textDocument.uri);
  if (!state) return [];
  return getDocumentSymbols(state.program, state.index);
});

// --- Workspace Export Scanning ---

function scanWorkspaceExports(rootDir: string, excludeFile?: string): void {
  try { scanDir(rootDir, excludeFile); } catch { /* best-effort */ }
}

function scanDir(dir: string, excludeFile?: string): void {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) scanDir(full, excludeFile);
    else if (entry.endsWith('.gft') && full !== excludeFile) parseAndCacheExports(full);
  }
}

function parseAndCacheExports(filePath: string): void {
  try {
    // Prefer open document buffer over disk
    const uri = pathToFileURL(filePath).toString();
    const openDoc = documents.get(uri);
    const source = openDoc ? openDoc.getText() : fs.readFileSync(filePath, 'utf-8');
    const tokens = new Lexer(source).tokenize();
    const { program } = new Parser(tokens).parse();
    workspaceExports.set(filePath, [
      ...program.contexts.map(c => c.name),
      ...program.nodes.map(n => n.name),
    ]);
  } catch { /* skip unparseable files */ }
}

// --- Code Actions ---

connection.onCodeAction((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !params.textDocument.uri.startsWith('file:')) return [];

  const currentFilePath = fileURLToPath(params.textDocument.uri);

  // Lazy workspace scan
  if (!workspaceScanDone && workspaceRoot) {
    scanWorkspaceExports(workspaceRoot, currentFilePath);
    workspaceScanDone = true;
  }

  if (!workspaceRoot) return [];

  const actions: CodeAction[] = [];
  const docText = doc.getText();

  // Collect already-imported names
  const importedNames = new Set<string>();
  for (const line of docText.split('\n')) {
    const m = line.match(/^\s*import\s+\{([^}]+)\}/);
    if (m) {
      for (const n of m[1].split(',')) importedNames.add(n.trim());
    }
  }

  for (const diag of params.context.diagnostics) {
    if (diag.code !== 'SCOPE_UNDEFINED_REF') continue;

    const name = extractUndefinedName(diag.message, docText, diag.range.start.line, diag.range.start.character);
    if (!name || importedNames.has(name)) continue;

    for (const [filePath, exports] of workspaceExports) {
      if (filePath === currentFilePath || !exports.includes(name)) continue;

      const relPath = computeRelativeImportPath(currentFilePath, filePath);
      const edit = buildAutoImportEdit(name, relPath, docText);

      actions.push({
        title: `Import '${name}' from "${relPath}"`,
        kind: CodeActionKind.QuickFix,
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: { start: { line: edit.insertLine, character: 0 }, end: { line: edit.insertLine, character: 0 } },
              newText: edit.newText,
            }],
          },
        },
      });
    }
  }

  return actions;
});

// --- Rename ---

connection.onPrepareRename((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = touchCache(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word || !isRenameable(word, state.index)) return null;

  // Return the range of the word under cursor
  const lines = doc.getText().split('\n');
  const lineText = lines[params.position.line] ?? '';
  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (params.position.character >= start && params.position.character < end) {
      return {
        start: { line: params.position.line, character: start },
        end: { line: params.position.line, character: end },
      };
    }
  }
  return null;
});

connection.onRenameRequest((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = touchCache(params.textDocument.uri);
  if (!doc || !state) return null;

  const word = getWordAtPosition(doc.getText(), params.position.line, params.position.character);
  if (!word || !isRenameable(word, state.index)) return null;

  const newName = params.newName;

  // Check for conflicts in current file
  if (word !== newName && (
    state.index.contextMap.has(newName) ||
    state.index.nodeMap.has(newName) ||
    state.index.memoryMap.has(newName) ||
    state.index.graphMap.has(newName)
  )) {
    return null; // conflict with existing declaration
  }

  const changes: Record<string, import('vscode-languageserver/node').TextEdit[]> = {};

  // Collect locations in current file
  const currentLocs = collectRenameLocations(doc.getText(), word);
  if (currentLocs.length > 0) {
    changes[params.textDocument.uri] = currentLocs.map(range => ({
      range,
      newText: newName,
    }));
  }

  // Cross-file rename via workspace exports cache
  if (workspaceRoot) {
    // Lazy workspace scan
    if (!workspaceScanDone) {
      const currentFilePath = fileURLToPath(params.textDocument.uri);
      scanWorkspaceExports(workspaceRoot, currentFilePath);
      workspaceScanDone = true;
    }

    // Find all files that might reference this name
    for (const [filePath, exports] of workspaceExports) {
      const fileUri = pathToFileURL(filePath).toString();
      if (fileUri === params.textDocument.uri) continue;

      // Check if this file imports the renamed name
      const openDoc = documents.get(fileUri);
      let fileText: string;
      try {
        fileText = openDoc ? openDoc.getText() : fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      // Check if the file contains import of this name
      const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^}]*\\}`);
      if (!importPattern.test(fileText)) continue;

      const locs = collectRenameLocations(fileText, word);
      if (locs.length > 0) {
        changes[fileUri] = locs.map(range => ({
          range,
          newText: newName,
        }));
      }
    }
  }

  return { changes };
});

documents.listen(connection);
connection.listen();
