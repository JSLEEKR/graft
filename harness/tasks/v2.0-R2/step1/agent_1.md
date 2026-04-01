# A1-Architect Independent Analysis -- v2.0-R2

## Convergence Score: 7

## Key Design Decisions

1. Pure function `resolve(source, sourceFile, readFile?)` with FileReader injection
2. `ResolveCtx` object bundles: fileCache, ancestors, declaredNames, merged, resolvedFiles, errors, readFile
3. `ExportableNames` snapshot computed BEFORE recursive resolution (prevents transitive re-export)
4. Cache stores `ExportableNames` (not full Program) — semantically correct
5. Only `ContextDecl` and `NodeDecl` importable
6. Returns NEW merged Program, does not mutate parser output
7. Resolver re-parses entry source (safer than accepting pre-parsed Program)

## Implementation

```typescript
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

function extractExportables(program: Program): ExportableNames {
  const contexts = new Map<string, ContextDecl>();
  for (const c of program.contexts) contexts.set(c.name, c);
  const nodes = new Map<string, NodeDecl>();
  for (const n of program.nodes) nodes.set(n.name, n);
  return { contexts, nodes };
}

interface ResolveCtx {
  fileCache: Map<string, ExportableNames>;
  ancestors: Set<string>;
  declaredNames: Map<string, string>;
  merged: Program;
  resolvedFiles: string[];
  errors: GraftError[];
  readFile: FileReader;
}

export function resolve(
  source: string,
  sourceFile: string,
  readFile: FileReader = (p) => fs.readFileSync(p, 'utf-8'),
): ResolveResult {
  const absSourceFile = path.resolve(sourceFile);
  const entryProgram = parseSource(source);

  const merged: Program = {
    imports: [...entryProgram.imports],
    memories: [...entryProgram.memories],
    contexts: [...entryProgram.contexts],
    nodes: [...entryProgram.nodes],
    edges: [...entryProgram.edges],
    graphs: [...entryProgram.graphs],
  };

  const ctx: ResolveCtx = {
    fileCache: new Map(),
    ancestors: new Set([absSourceFile]),
    declaredNames: new Map(),
    merged,
    resolvedFiles: [absSourceFile],
    errors: [],
    readFile,
  };

  for (const c of entryProgram.contexts) ctx.declaredNames.set(c.name, absSourceFile);
  for (const n of entryProgram.nodes) ctx.declaredNames.set(n.name, absSourceFile);
  ctx.fileCache.set(absSourceFile, extractExportables(entryProgram));

  for (const importDecl of merged.imports) {
    resolveImport(importDecl, absSourceFile, ctx);
  }

  return { program: ctx.merged, resolvedFiles: ctx.resolvedFiles, errors: ctx.errors };
}

function parseSource(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function resolveImport(importDecl: ImportDecl, importingFile: string, ctx: ResolveCtx): void {
  const targetPath = path.resolve(path.dirname(importingFile), importDecl.path);
  importDecl.resolvedPath = targetPath;

  if (!targetPath.endsWith('.gft')) {
    ctx.errors.push(new GraftError(`Import path must end with .gft: "${importDecl.path}"`, importDecl.location));
    return;
  }

  if (ctx.ancestors.has(targetPath)) {
    ctx.errors.push(new GraftError(`Circular import detected: "${importDecl.path}"`, importDecl.location));
    return;
  }

  if (!ctx.fileCache.has(targetPath)) {
    let targetSource: string;
    try { targetSource = ctx.readFile(targetPath); } catch {
      ctx.errors.push(new GraftError(`Import file not found: "${importDecl.path}"`, importDecl.location));
      return;
    }

    let targetProgram: Program;
    try { targetProgram = parseSource(targetSource); } catch (e) {
      if (e instanceof GraftError) {
        ctx.errors.push(new GraftError(`Error parsing imported file "${importDecl.path}": ${e.message}`, importDecl.location));
      } else throw e;
      return;
    }

    const exportables = extractExportables(targetProgram);
    ctx.fileCache.set(targetPath, exportables);
    if (!ctx.resolvedFiles.includes(targetPath)) ctx.resolvedFiles.push(targetPath);

    ctx.ancestors.add(targetPath);
    for (const nestedImport of targetProgram.imports) {
      resolveImport(nestedImport, targetPath, ctx);
    }
    ctx.ancestors.delete(targetPath);
  }

  const exportables = ctx.fileCache.get(targetPath)!;
  const availableNames = [...exportables.contexts.keys(), ...exportables.nodes.keys()];

  for (const name of importDecl.names) {
    const context = exportables.contexts.get(name);
    const node = exportables.nodes.get(name);

    if (!context && !node) {
      const suggestion = availableNames.length > 0
        ? `. Available: ${availableNames.join(', ')}` : '. File has no importable declarations';
      ctx.errors.push(new GraftError(`Name '${name}' not found in "${importDecl.path}"${suggestion}`, importDecl.location));
      continue;
    }

    if (ctx.declaredNames.has(name)) {
      const existingFile = ctx.declaredNames.get(name)!;
      ctx.errors.push(new GraftError(`Duplicate declaration '${name}': already declared in ${path.basename(existingFile)}`, importDecl.location));
      continue;
    }

    ctx.declaredNames.set(name, targetPath);
    if (context) ctx.merged.contexts.push(context);
    if (node) ctx.merged.nodes.push(node);
  }
}
```

## Trade-offs

**Pros**: Clean ResolveCtx pattern, ExportableNames snapshot prevents transitive re-export structurally, FileReader follows SpawnerFn precedent, adding memory imports later is 3 lines of change.

**Cons**: Mutating importDecl.resolvedPath is side effect (required by v2.0-R05). Entry file re-parsed (safer but redundant). resolvedFiles uses Array.includes O(n).

## Potential Issues
1. Transitive re-export: Fixed by caching exportables BEFORE recursion
2. Windows paths: path.resolve normalizes consistently
3. Entry file re-parse: Redundant but safe
4. Cascading import errors: Acceptable — each import site gets its own error
