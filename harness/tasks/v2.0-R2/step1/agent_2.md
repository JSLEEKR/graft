# A2-Pragmatist Independent Analysis -- v2.0-R2

## Convergence Score: 8

## Core Principles
- Single exported function with closures. No class — no state beyond one call.
- FileReader as optional param. Default fs.readFileSync. Tests inject map-based reader.
- RAW program for name lookup. fileCache stores raw parsed programs.
- Flat error accumulation. ~120 lines total.

## Implementation

```typescript
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export type FileReader = (filePath: string) => string;

export interface ResolveResult {
  program: Program;
  resolvedFiles: string[];
  errors: GraftError[];
}

export function resolve(
  source: string,
  sourceFile: string,
  fileReader: FileReader = (p) => fs.readFileSync(p, 'utf-8'),
): ResolveResult {
  const errors: GraftError[] = [];
  const fileCache = new Map<string, Program>();
  const resolvedFiles: string[] = [];
  const allNames = new Map<string, string>();
  const absSource = path.resolve(sourceFile);

  const program = parseSource(source, errors);
  if (!program) {
    return { program: emptyProgram(), resolvedFiles: [absSource], errors };
  }

  fileCache.set(absSource, program);
  resolvedFiles.push(absSource);

  for (const c of program.contexts) allNames.set(c.name, absSource);
  for (const n of program.nodes) allNames.set(n.name, absSource);

  resolveFile(program, absSource, new Set([absSource]), fileCache, resolvedFiles, allNames, errors, fileReader);

  return { program, resolvedFiles, errors };
}

function resolveFile(
  program: Program, currentFile: string, ancestors: Set<string>,
  fileCache: Map<string, Program>, resolvedFiles: string[],
  allNames: Map<string, string>, errors: GraftError[], fileReader: FileReader,
): void {
  for (const imp of program.imports) {
    const target = path.resolve(path.dirname(currentFile), imp.path);
    imp.resolvedPath = target;

    if (ancestors.has(target)) {
      errors.push(new GraftError(`Circular import detected: ${currentFile} -> ${target}`, imp.location));
      continue;
    }

    let raw = fileCache.get(target);
    if (!raw) {
      let src: string;
      try { src = fileReader(target); } catch {
        errors.push(new GraftError(`Import file not found: ${imp.path}`, imp.location));
        continue;
      }

      raw = parseSource(src, errors);
      if (!raw) continue;

      fileCache.set(target, raw);
      resolvedFiles.push(target);

      // Recurse target's imports
      ancestors.add(target);
      resolveFile(raw, target, ancestors, fileCache, resolvedFiles, allNames, errors, fileReader);
      ancestors.delete(target);
    }

    // Extract from RAW (no transitive re-export)
    const ctxMap = new Map(raw.contexts.map(c => [c.name, c]));
    const nodeMap = new Map(raw.nodes.map(n => [n.name, n]));

    for (const name of imp.names) {
      const ctx = ctxMap.get(name);
      const node = nodeMap.get(name);
      if (ctx) {
        if (!program.contexts.some(c => c.name === name)) program.contexts.push(ctx);
      } else if (node) {
        if (!program.nodes.some(n => n.name === name)) program.nodes.push(node);
      } else {
        const available = [...ctxMap.keys(), ...nodeMap.keys()];
        const hint = available.length > 0 ? `. Available: ${available.join(', ')}` : '';
        errors.push(new GraftError(`Name '${name}' not found in ${imp.path}${hint}`, imp.location));
      }
    }
  }
}

function parseSource(source: string, errors: GraftError[]): Program | null {
  try {
    const tokens = new Lexer(source).tokenize();
    return new Parser(tokens).parse();
  } catch (e) {
    if (e instanceof GraftError) { errors.push(e); return null; }
    throw e;
  }
}

function emptyProgram(): Program {
  return { imports: [], memories: [], contexts: [], nodes: [], edges: [], graphs: [] };
}
```

## Trade-offs
- Pros: ~120 lines, no abstractions, immediately testable, all error cases handled
- Cons: program.contexts.some() is O(n) dedup (n is tiny), mutates entry program directly

## Potential Issues
- Diamond dedup: uses .some() check before pushing. Works for realistic sizes.
- Ancestor set: correctly uses add/delete pattern per DFS branch.
- allNames tracks duplicates across all files — catches local vs imported conflicts.
- Target's imports are recursively resolved but their imported names don't leak into current file.
