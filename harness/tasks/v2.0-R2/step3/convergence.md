# Convergence Report -- v2.0-R2: Import Resolver

## Summary

All 4 agents converged on A1-Architect's ExportableNames snapshot approach. The resolver is a single exported `resolve()` function using a `ResolveCtx` closure. Critical invariant: `extractExportables(targetProgram)` is called and cached BEFORE recursing into the target's imports, preventing transitive re-export structurally.

## Forced Dissent Ruling
- A2 (forced dissenter) self-rebutted: "YAGNI applies to features, not correctness mechanisms." ExportableNames is a correctness mechanism. Rebuttal strength: 9/10. ACCEPTED.
- Split decision (targeted graph/memory errors): RESOLVED as YAGNI for v2.0. Generic "not found" + available names is sufficient.

## Implementation Code

### `src/resolver/resolver.ts` (NEW)

```typescript
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
  source: string,
  sourceFile: string,
  readFile: FileReader = (p) => fs.readFileSync(p, 'utf-8'),
): ResolveResult {
  const absSourceFile = path.resolve(sourceFile);
  const errors: GraftError[] = [];

  // Parse entry file with try-catch (A3's fix)
  let entryProgram: Program;
  try {
    entryProgram = parseSource(source);
  } catch (e) {
    if (e instanceof GraftError) {
      errors.push(e);
      return { program: emptyProgram(), resolvedFiles: [absSourceFile], errors };
    }
    throw e;
  }

  const ctx: ResolveCtx = {
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
    ));
    return;
  }

  // Circular import detection
  if (ctx.ancestors.has(targetPath)) {
    ctx.errors.push(new GraftError(
      `Circular import detected: "${importDecl.path}"`,
      importDecl.location,
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
      ));
      continue;
    }

    // Duplicate detection
    if (ctx.declaredNames.has(name)) {
      const existingFile = ctx.declaredNames.get(name)!;
      ctx.errors.push(new GraftError(
        `Duplicate name "${name}": already declared in ${path.basename(existingFile)}`,
        importDecl.location,
      ));
      continue;
    }

    ctx.declaredNames.set(name, targetPath);
    if (context) importingProgram.contexts.push(context);
    if (node) importingProgram.nodes.push(node);
  }
}
```

### `src/compiler.ts` (MODIFIED)

Add `import { resolve } from './resolver/resolver.js';` at top.

Insert between Parse and "Guard: no graph declaration":
```typescript
  // Resolve imports
  if (program.imports.length > 0) {
    const resolveResult = resolve(source, sourceFile);
    if (resolveResult.errors.length > 0) {
      errors.push(...resolveResult.errors);
      return { success: false, program, errors, warnings };
    }
    program = resolveResult.program;
  }
```

### Tests

17 test cases covering:
1. No imports passthrough
2. Import context from file
3. Import node from file
4. Import multiple names
5. resolvedPath set (v2.0-R05)
6. Transitive re-export prevention (CRITICAL)
7. Self-import circular detection
8. A -> B -> A circular detection
9. Diamond imports no duplicate errors
10. Diamond parse-once verification
11. File not found
12. Name not found with suggestions
13. Empty file (no importable declarations)
14. Local + imported name conflict
15. Same name from two files
16. .gft extension validation
17. Parse error in imported file
18. Entry file parse error
19. Error accumulation
20. resolvedFiles tracking

## Ratchet-Locked Items

- [v2.0-R11] ExportableNames snapshot extracted BEFORE recursion — LOCKED
- [v2.0-R12] resolve() is pure function; FileReader injection via parameter — LOCKED
- [v2.0-R13] Only ContextDecl and NodeDecl importable — LOCKED
- [v2.0-R14] DFS ancestor set (add/delete) for circular detection — LOCKED
- [v2.0-R15] Error accumulation, never throw for recoverable import errors — LOCKED
- [v2.0-R16] No auto-extension, no Levenshtein, no normalizePath — LOCKED
- [v2.0-R17] Import path must end with .gft — LOCKED
- [v2.0-R18] Targeted graph/memory rejection deferred; generic "not found" sufficient — LOCKED
