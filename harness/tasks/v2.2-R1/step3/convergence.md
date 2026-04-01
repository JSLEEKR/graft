# Convergence Report -- v2.2-R1: Tech Debt -- Double-Parse + Version + ProgramIndex

## Summary

Both agents agreed on the double-parse fix (change resolve() to accept Program) and version derivation (createRequire). For ProgramIndex, the converged design uses 5 maps (contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap) -- lean enough to avoid over-engineering but comprehensive enough to eliminate all Program-level .find() calls. TypeChecker migration skipped (verified: zero .find() calls). Codegen .find() calls migrated.

Cross-critique skipped: score range 8-7 = 1 (below R-PROC-01 threshold of 2).

## Disagreement Resolutions

| # | Issue | A2 | A3 | Adopted | Rationale |
|---|-------|----|----|---------|-----------|
| 1 | ProgramIndex scope | Lean (6 maps) | Comprehensive (10+ maps) | Middle (5 maps) | Field-level maps belong to individual analyzers, not shared index |
| 2 | Getter methods | No | Yes | No | Maps have .get()/.has(); wrappers add nothing |
| 3 | Version try-catch | No | Yes | Yes (A3) | One-line fallback prevents crash in edge cases |
| 4 | TypeChecker migration | Skip | Include | Skip (A2) | Verified zero .find() calls; pure churn |
| 5 | Codegen migration | Skip | Include | Include (A3) | Verified .find() calls exist in settings.ts and orchestration.ts |

## Implementation Spec

### New File: `src/version.ts`

```typescript
import { createRequire } from 'node:module';

let version: string;
try {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  version = pkg.version;
} catch {
  version = '0.0.0-unknown';
}

export const VERSION = version;
```

### New File: `src/program-index.ts`

```typescript
import { Program, ContextDecl, NodeDecl, MemoryDecl, EdgeDecl } from './parser/ast.js';

export class ProgramIndex {
  readonly contextMap: Map<string, ContextDecl>;
  readonly nodeMap: Map<string, NodeDecl>;
  readonly memoryMap: Map<string, MemoryDecl>;
  readonly edgesBySource: Map<string, EdgeDecl[]>;
  readonly producesNodeMap: Map<string, NodeDecl>;

  constructor(program: Program) {
    this.contextMap = new Map();
    for (const c of program.contexts) {
      this.contextMap.set(c.name, c);
    }

    this.nodeMap = new Map();
    this.producesNodeMap = new Map();
    for (const n of program.nodes) {
      this.nodeMap.set(n.name, n);
      this.producesNodeMap.set(n.produces.name, n);
    }

    this.memoryMap = new Map();
    for (const m of program.memories) {
      this.memoryMap.set(m.name, m);
    }

    this.edgesBySource = new Map();
    for (const e of program.edges) {
      const existing = this.edgesBySource.get(e.source) ?? [];
      existing.push(e);
      this.edgesBySource.set(e.source, existing);
    }
  }
}
```

### Modified: `src/resolver/resolver.ts`

Change resolve() signature to accept `Program` instead of `source: string`. Remove entry-file parse try-catch block. Keep parseSource() for imported files.

```typescript
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

  for (const c of entryProgram.contexts) ctx.declaredNames.set(c.name, absSourceFile);
  for (const n of entryProgram.nodes) ctx.declaredNames.set(n.name, absSourceFile);
  ctx.exportCache.set(absSourceFile, extractExportables(entryProgram));

  for (const importDecl of entryProgram.imports) {
    resolveImport(importDecl, absSourceFile, entryProgram, ctx);
  }

  return { program: entryProgram, resolvedFiles: ctx.resolvedFiles, errors: ctx.errors };
}
```

### Modified: `src/compiler.ts`

Pass program instead of source to resolve():

```typescript
const resolveResult = resolve(program, sourceFile);  // was: resolve(source, sourceFile)
```

### Modified: `src/index.ts`

```typescript
import { VERSION } from './version.js';
// ...
  .version(VERSION)  // was: .version('1.2.0')
```

### Modified: `src/codegen/settings.ts`

```typescript
import { VERSION } from '../version.js';
import { ProgramIndex } from '../program-index.js';
// ...
  const index = new ProgramIndex(program);
  // Replace: program.nodes.find(n => n.name === firstNodeName)?.model
  // With: index.nodeMap.get(firstNodeName)?.model
  // Replace: version: '0.1.0'
  // With: version: VERSION
```

### Modified: `src/codegen/orchestration.ts`

```typescript
import { ProgramIndex } from '../program-index.js';
// Create index at top of generateOrchestration, pass index.nodeMap to generateSteps
// Replace: program.nodes.find(n => n.name === step.name)
// With: nodeMap.get(step.name)
```

### Modified: `src/analyzer/scope.ts`

```typescript
import { ProgramIndex } from '../program-index.js';
// Add: private index: ProgramIndex; in constructor
// Replace line 98: this.program.contexts.find(c => c.name === ref.context)!
// With: this.index.contextMap.get(ref.context)!
// Replace line 224: this.program.nodes.find(n => n.name === step.source)
// With: this.index.nodeMap.get(step.source)
```

### Modified: `src/analyzer/estimator.ts`

```typescript
import { ProgramIndex } from '../program-index.js';
// Add: private index: ProgramIndex; in constructor
// Reuse: this.nodeMap = this.index.nodeMap;
// Replace line 164: this.program.contexts.find(c => c.name === ref.context)
// With: this.index.contextMap.get(ref.context)
// Replace line 170: this.program.memories.find(m => m.name === ref.context)
// With: this.index.memoryMap.get(ref.context)
// Replace line 176: this.program.nodes.find(n => n.produces.name === ref.context)
// With: this.index.producesNodeMap.get(ref.context)
```

### Modified: `src/runtime/executor.ts`

```typescript
import { ProgramIndex } from '../program-index.js';
// Add: private index: ProgramIndex; in constructor
// Reuse: this.nodeMap = this.index.nodeMap; this.edgeMap = this.index.edgesBySource;
// Replace line 407: this.program.memories.find(m => m.name === writeName)
// With: this.index.memoryMap.get(writeName)
```

### Modified: `tests/resolver.test.ts`

Update testResolve helper to parse source first, then pass Program to resolve():

```typescript
function testResolve(source: string, files: Record<string, string> = {}) {
  const sourceFile = path.resolve('/project/main.gft');
  const absFiles: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    absFiles[path.resolve('/project', key)] = value;
  }
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const program = new Parser(tokens).parse();
  return resolve(program, sourceFile, mockReader(absFiles));
}
```

Remove the "handles entry file parse error gracefully" test (dead code path).

### New Tests

**tests/version.test.ts** (~3 tests): semver format, non-empty, matches package.json
**tests/program-index.test.ts** (~6 tests): contextMap, nodeMap, producesNodeMap, edgesBySource, memoryMap, empty program

### Expected Test Count

288 existing - 1 removed (resolver entry parse error) + 3 version + 6 program-index = ~296 tests

## Ratchet Items

- [v2.2-R01] resolve() accepts Program, not source string -- LOCKED
- [v2.2-R02] VERSION from package.json via createRequire with try-catch fallback -- LOCKED
- [v2.2-R03] ProgramIndex: 5 maps (contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap) -- LOCKED
- [v2.2-R04] ProgramIndex: no getter methods, direct map access -- LOCKED
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex (zero .find() calls) -- LOCKED
