// src/resolver/resolver.ts
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Program, ImportDecl, ContextDecl, NodeDecl } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export type FileReader = (absolutePath: string) => string;

export interface ResolveResult {
  program: Program;
  resolvedFiles: string[];
  errors: GraftError[];
}

interface ExportableNames {
  contexts: Map<string, ContextDecl>;
  nodes: Map<string, NodeDecl>;
}

interface ResolveCtx {
  entryFile: string;
  exportCache: Map<string, ExportableNames>;
  ancestors: Set<string>;
  declaredNames: Map<string, string>; // name -> declaring file (absolute path)
  resolvedFiles: string[];
  errors: GraftError[];
  readFile: FileReader;
}

function extractExportables(program: Program): ExportableNames {
  const contexts = new Map<string, ContextDecl>();
  for (const c of program.contexts) contexts.set(c.name, c);
  const nodes = new Map<string, NodeDecl>();
  for (const n of program.nodes) nodes.set(n.name, n);
  return { contexts, nodes };
}

function parseSource(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function emptyProgram(): Program {
  return { imports: [], memories: [], contexts: [], nodes: [], edges: [], graphs: [] };
}

export function resolve(
  entryProgram: Program,
  sourceFile: string,
  readFile: FileReader = (p) => fs.readFileSync(p, 'utf-8'),
): ResolveResult {
  const absSourceFile = path.resolve(sourceFile);
  const errors: GraftError[] = [];

  const ctx: ResolveCtx = {
    entryFile: absSourceFile,
    exportCache: new Map(),
    ancestors: new Set([absSourceFile]),
    declaredNames: new Map(),
    resolvedFiles: [absSourceFile],
    errors,
    readFile,
  };

  // Register entry file's local names
  for (const c of entryProgram.contexts) ctx.declaredNames.set(c.name, absSourceFile);
  for (const n of entryProgram.nodes) ctx.declaredNames.set(n.name, absSourceFile);

  // Cache entry file's exportables (for diamond import scenarios)
  ctx.exportCache.set(absSourceFile, extractExportables(entryProgram));

  // Resolve all imports
  for (const importDecl of entryProgram.imports) {
    resolveImport(importDecl, absSourceFile, entryProgram, ctx);
  }

  return { program: entryProgram, resolvedFiles: ctx.resolvedFiles, errors: ctx.errors };
}

function resolveImport(
  importDecl: ImportDecl,
  importingFile: string,
  importingProgram: Program,
  ctx: ResolveCtx,
): void {
  const targetPath = path.resolve(path.dirname(importingFile), importDecl.path);
  importDecl.resolvedPath = targetPath; // v2.0-R05

  // Validate .gft extension
  if (!importDecl.path.endsWith('.gft')) {
    ctx.errors.push(new GraftError(
      `Import path must end with .gft: "${importDecl.path}"`,
      importDecl.location,
      'error',
      'IMPORT_INVALID_PATH',
    ));
    return;
  }

  // Circular import detection
  if (ctx.ancestors.has(targetPath)) {
    ctx.errors.push(new GraftError(
      `Circular import detected: "${importDecl.path}"`,
      importDecl.location,
      'error',
      'IMPORT_CIRCULAR',
    ));
    return;
  }

  // Parse and cache target file if not already cached
  if (!ctx.exportCache.has(targetPath)) {
    let targetSource: string;
    try {
      targetSource = ctx.readFile(targetPath);
    } catch {
      ctx.errors.push(new GraftError(
        `Import file not found: "${importDecl.path}"`,
        importDecl.location,
        'error',
        'IMPORT_NOT_FOUND',
      ));
      return;
    }

    let targetProgram: Program;
    try {
      targetProgram = parseSource(targetSource);
    } catch (e) {
      if (e instanceof GraftError) {
        ctx.errors.push(new GraftError(
          `Error parsing imported file "${importDecl.path}": ${e.message}`,
          importDecl.location,
          'error',
          'IMPORT_PARSE_ERROR',
        ));
      } else {
        throw e;
      }
      return;
    }

    // CRITICAL INVARIANT: Extract exportables BEFORE recursing.
    const exportables = extractExportables(targetProgram);
    ctx.exportCache.set(targetPath, exportables);

    if (!ctx.resolvedFiles.includes(targetPath)) {
      ctx.resolvedFiles.push(targetPath);
    }

    // Recurse into target's imports
    ctx.ancestors.add(targetPath);
    for (const nestedImport of targetProgram.imports) {
      resolveImport(nestedImport, targetPath, targetProgram, ctx);
    }
    ctx.ancestors.delete(targetPath);
  }

  // Only merge names into the importing program if this is the entry file.
  // Nested imports only need to parse and cache for transitive re-export prevention.
  if (importingFile !== ctx.entryFile) return;

  // Look up requested names from cached exportables
  const exportables = ctx.exportCache.get(targetPath)!;
  const availableNames = [...exportables.contexts.keys(), ...exportables.nodes.keys()];

  for (const name of importDecl.names) {
    const context = exportables.contexts.get(name);
    const node = exportables.nodes.get(name);

    if (!context && !node) {
      const suggestion = availableNames.length > 0
        ? `. Available: ${availableNames.join(', ')}`
        : '. File has no importable declarations';
      ctx.errors.push(new GraftError(
        `Name "${name}" not found in "${importDecl.path}"${suggestion}`,
        importDecl.location,
        'error',
        'IMPORT_NAME_NOT_FOUND',
      ));
      continue;
    }

    // Duplicate detection
    if (ctx.declaredNames.has(name)) {
      const existingFile = ctx.declaredNames.get(name)!;
      ctx.errors.push(new GraftError(
        `Duplicate name "${name}": already declared in ${path.basename(existingFile)}`,
        importDecl.location,
        'error',
        'IMPORT_DUPLICATE_NAME',
      ));
      continue;
    }

    ctx.declaredNames.set(name, targetPath);
    if (context) importingProgram.contexts.push(context);
    if (node) importingProgram.nodes.push(node);
  }
}
