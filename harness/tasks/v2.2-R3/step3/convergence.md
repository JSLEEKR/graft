# Convergence Report — v2.2-R3: Correctness Fixes

## Summary

Both agents agreed on all 5 items with high consensus (score range 8-7=1). Cross-critique skipped per R-PROC-01. The only design disagreement was C-02 placement: A3 proposed TypeChecker, A4 proposed ScopeChecker. ScopeChecker adopted — the check is about edge routing semantics (structural), not type compatibility.

## Disagreement Resolutions

| # | Issue | A3 | A4 | Adopted | Rationale |
|---|-------|----|----|---------|-----------|
| 1 | C-02 placement | TypeChecker | ScopeChecker | ScopeChecker (A4) | Structural warning about edge semantics, not type checking. TypeChecker owns field existence; this is about routing structure. |
| 2 | sourceFile no-import case | compiler.ts guard | compiler.ts guard | compiler.ts guard (both) | Both agree. Set sourceFile unconditionally in compiler.ts, resolver also sets for imported decls. |

## Implementation Spec

### 1. GraftErrorCode Additions (`src/errors/diagnostics.ts`)

Add 3 new codes to the union type:

```typescript
export type GraftErrorCode =
  // ... existing 18 codes ...
  // Graph warnings
  | 'GRAPH_MULTIPLE'
  // Scope warnings (new)
  | 'SCOPE_BINDING_COLLISION'
  | 'TRANSFORM_ON_CONDITIONAL';
```

### 2. Foreach Binding Collision (`src/analyzer/scope.ts`)

Add in `walkFlowNodes`, case 'foreach', after `maxIterations` check and before body recursion:

```typescript
// C-01: Foreach binding name collision detection
const binding = step.binding;
if (this.nodeNames.has(binding)) {
  errors.push(new GraftError(
    `Foreach binding '${binding}' collides with declared node '${binding}'`,
    location,
    'warning',
    'SCOPE_BINDING_COLLISION',
  ));
} else if (this.producesMap.has(binding)) {
  errors.push(new GraftError(
    `Foreach binding '${binding}' collides with produces declaration '${binding}'`,
    location,
    'warning',
    'SCOPE_BINDING_COLLISION',
  ));
} else if (this.contextNames.has(binding)) {
  errors.push(new GraftError(
    `Foreach binding '${binding}' collides with declared context '${binding}'`,
    location,
    'warning',
    'SCOPE_BINDING_COLLISION',
  ));
} else if (this.memoryNames.has(binding)) {
  errors.push(new GraftError(
    `Foreach binding '${binding}' collides with declared memory '${binding}'`,
    location,
    'warning',
    'SCOPE_BINDING_COLLISION',
  ));
}
```

Uses else-if chain since names are unique across categories (enforced by existing duplicate-name checks).

### 3. Conditional Edge Transform Warning (`src/analyzer/scope.ts`)

Add in `checkEdges()`, inside the edge loop, after target validation:

```typescript
// C-02: Warn on transforms applied to conditional edges
if (edge.target.kind === 'conditional' && edge.transforms.length > 0) {
  errors.push(new GraftError(
    `Transforms on conditional edge from '${edge.source}' may not be applied at runtime`,
    edge.location,
    'warning',
    'TRANSFORM_ON_CONDITIONAL',
  ));
}
```

### 4. Multiple Graph Warning (`src/analyzer/scope.ts`)

Add new method `checkMultipleGraphs`, called from `check()` before `checkGraphFlow()`:

```typescript
private checkMultipleGraphs(errors: GraftError[]): void {
  if (this.program.graphs.length > 1) {
    errors.push(new GraftError(
      `Multiple graphs declared; only the first graph '${this.program.graphs[0].name}' will be executed`,
      this.program.graphs[1].location,
      'warning',
      'GRAPH_MULTIPLE',
    ));
  }
}
```

Update `check()` to call it:
```typescript
check(): GraftError[] {
  const errors: GraftError[] = [];
  this.checkDuplicateNames(errors);
  this.checkMaxTokens(errors);
  this.checkNodeReads(errors);
  this.checkNodeWrites(errors);
  this.checkEdges(errors);
  this.checkMultipleGraphs(errors);  // NEW
  this.checkGraphFlow(errors);
  return errors;
}
```

### 5. loadMemory Verbose Warning (`src/runtime/memory.ts`)

```typescript
export function loadMemory(
  memoryDir: string,
  name: string,
  options?: { verbose?: boolean },
): Record<string, unknown> | null {
  const filePath = path.join(memoryDir, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    if (options?.verbose) {
      console.warn(`[MEMORY] Warning: ${filePath} exists but contains invalid JSON — treating as empty`);
    }
    return null;
  }
}
```

Update executor.ts line 190 to pass verbose option:
```typescript
const memData = loadMemory(this.memoryDir, ref.context, { verbose: this.options.verbose });
```

### 6. Source File Tracking

**ast.ts** — Add `sourceFile?: string` to ContextDecl and NodeDecl:

```typescript
export interface ContextDecl {
  name: string;
  maxTokens: number;
  fields: Field[];
  location: SourceLocation;
  sourceFile?: string;
}

export interface NodeDecl {
  name: string;
  model: string;
  // ... existing fields ...
  location: SourceLocation;
  sourceFile?: string;
}
```

**compiler.ts** — Set sourceFile on all declarations after parsing, before import guard:

```typescript
import * as path from 'node:path';

// ... after parsing, before line 49 (import guard) ...
// Set sourceFile on all entry declarations
const absSourceFile = path.resolve(sourceFile);
for (const c of program.contexts) c.sourceFile = absSourceFile;
for (const n of program.nodes) n.sourceFile = absSourceFile;
```

**resolver.ts** — Set sourceFile on imported declarations when merging (lines 200-202):

```typescript
ctx.declaredNames.set(name, targetPath);
if (context) {
  context.sourceFile = targetPath;
  importingProgram.contexts.push(context);
}
if (node) {
  node.sourceFile = targetPath;
  importingProgram.nodes.push(node);
}
```

Note: Entry file declarations already have sourceFile set by compiler.ts. The resolver does NOT need to set sourceFile on entry file declarations (avoids redundancy with compiler.ts).

### Test Targets

**Foreach binding collision** (~5 tests):
- Binding matches node name → warning
- Binding matches produces name → warning
- Binding matches context name → warning
- Binding matches memory name → warning
- Unique binding → no warning

**Conditional edge transforms** (~2 tests):
- Conditional edge with transforms → warning
- Direct edge with transforms → no warning

**Multiple graphs** (~2 tests):
- 2 graphs → warning mentioning first graph name
- 1 graph → no warning

**loadMemory verbose** (~2 tests):
- Corrupt JSON with verbose=true → console.warn called
- Corrupt JSON with no options → console.warn not called

**Source file tracking** (~3 tests):
- Imported context has sourceFile set to target file path
- Entry file context has sourceFile set to entry file path
- No-import file: declarations still have sourceFile set

### Expected Test Count

323 existing + ~14 new = ~337 tests

## Ratchet Items

- [v2.2-R11] Foreach binding collision: else-if chain against nodeNames/producesMap/contextNames/memoryNames — LOCKED
- [v2.2-R12] C-02 in ScopeChecker.checkEdges(), not TypeChecker — LOCKED
- [v2.2-R13] Multiple graph warning in ScopeChecker, uses graphs[1].location — LOCKED
- [v2.2-R14] loadMemory options param: `options?: { verbose?: boolean }` — LOCKED
- [v2.2-R15] sourceFile set in compiler.ts (all decls) + resolver.ts (imported decls only) — LOCKED
