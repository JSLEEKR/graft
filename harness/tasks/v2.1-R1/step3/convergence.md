# Convergence Report — v2.1-R1: Cleanup and Refactoring

## Summary

High consensus (both agents scored 8/10). Three disagreements resolved below. The task extracts duplicated constants, utilities, and memory functions into shared modules. No behavioral changes; 249 existing tests serve as regression coverage.

## Disagreement Resolutions

### 1. 0.3 at estimator.ts line 195 (select transform factor)

**Adopted: A2 — use PARTIAL_FIELD_FACTOR for ALL 0.3 occurrences including line 195.**

Reasoning: The 0.3 at line 195 (`Math.min(0.3 * t.fields.length, 1.0)`) represents the same concept as lines 165/170/184: "one field is approximately 30% of a data structure's token count." The select transform estimates per-field contribution identically to a partial field read. If this assumption were ever tuned, all four occurrences should change together. Using a single named constant enforces this coupling and makes the assumption explicit.

### 2. saveMemory dryRun parameter

**Adopted: A3 — standalone saveMemory always saves; dryRun guard stays at call site.**

Reasoning: A function called `saveMemory` that conditionally does not save is a code smell. The standalone function should have a single responsibility: save. The executor's `storeOutput` method already has access to `this.options.dryRun` and should guard the call:

```ts
// In storeOutput, change:
//   this.saveMemory(writeName, output);
// To:
//   if (!this.options.dryRun) { saveMemory(this.memoryDir, writeName, output, this.program); }
```

This also means the standalone `saveMemory` does not need the Program reference for lookup — it receives a `MemoryDecl` directly.

### 3. TOOL_MAP

**No disagreement — both agree TOOL_MAP stays in agents.ts.** Not duplicated, not a constant worthy of extraction.

## Implementation Spec

### New file: `src/constants.ts`

```ts
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

/** Fraction of tokens estimated for a single-field read (vs full context). */
export const PARTIAL_FIELD_FACTOR = 0.3;

/** Budget fraction at which to emit a warning. */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/** Budget fraction at which to emit a critical warning. */
export const BUDGET_CRITICAL_THRESHOLD = 0.9;
```

### New file: `src/utils.ts`

Extract `fieldsToJsonExample` and `typeToExample` from `src/codegen/agents.ts` (lines 116-151). Both functions are identical in agents.ts and executor.ts.

```ts
import { Field, TypeExpr } from './parser/ast.js';

export function fieldsToJsonExample(fields: Field[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = typeToExample(field.type);
  }
  return obj;
}

export function typeToExample(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return '<string>';
        case 'Int': return 0;
        case 'Float': return 0.0;
        case 'Bool': return false;
        default: return '<unknown>';
      }
    case 'primitive_range':
      return type.min;
    case 'list':
      return [typeToExample(type.element)];
    case 'map':
      return {};
    case 'optional':
      return typeToExample(type.inner);
    case 'token_bounded':
      return typeToExample(type.inner);
    case 'enum':
      return type.values.join('|');
    case 'struct':
      return fieldsToJsonExample(type.fields);
    case 'domain':
      return `<${type.name}>`;
  }
}
```

### New file: `src/runtime/memory.ts`

Extract `loadMemory` and `saveMemory` from `src/runtime/executor.ts`.

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryDecl } from '../parser/ast.js';

export function loadMemory(memoryDir: string, name: string): Record<string, unknown> | null {
  const filePath = path.join(memoryDir, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveMemory(memoryDir: string, mem: MemoryDecl, nodeOutput: unknown): void {
  fs.mkdirSync(memoryDir, { recursive: true });
  const filePath = path.join(memoryDir, `${mem.name.toLowerCase()}.json`);

  // Load existing memory
  let current: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      current = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  // Field-matching merge: only write fields declared in memory schema
  if (typeof nodeOutput === 'object' && nodeOutput !== null) {
    const output = nodeOutput as Record<string, unknown>;
    for (const field of mem.fields) {
      if (field.name in output) {
        current[field.name] = output[field.name];
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
}
```

### Modify: `src/codegen/agents.ts`

1. Remove local `MODEL_MAP` (lines 4-8). Import from `../constants.js`.
2. Remove local `fieldsToJsonExample` and `typeToExample` (lines 116-151). Import from `../utils.js`.
3. Keep `TOOL_MAP` (lines 10-18) — not duplicated.

```ts
// New imports at top:
import { MODEL_MAP } from '../constants.js';
import { fieldsToJsonExample } from '../utils.js';
```

### Modify: `src/codegen/settings.ts`

1. Remove local `MODEL_MAP` (lines 4-8). Import from `../constants.js`.
2. Replace literal `0.8` and `0.9` (lines 97-98) with imported constants.

```ts
import { MODEL_MAP, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD } from '../constants.js';

// In generateSettings, budget section:
budget: {
  total: graph?.budget || 0,
  warning_threshold: BUDGET_WARNING_THRESHOLD,
  critical_threshold: BUDGET_CRITICAL_THRESHOLD,
},
```

### Modify: `src/runtime/executor.ts`

1. Remove local `MODEL_MAP` (lines 9-13). Import from `../constants.js`.
2. Remove local `fieldsToJsonExample` and `typeToExample` (lines 482-517). Import from `../utils.js`.
3. Remove `loadMemory` method (lines 160-168). Import from `./memory.js`.
4. Remove `saveMemory` method (lines 170-199). Import from `./memory.js`.
5. Remove stale duplication comments (lines 8, 481).
6. Update `loadMemory` call sites (line 292) to use standalone: `loadMemory(this.memoryDir, ref.context)`.
7. Update `saveMemory` call site in `storeOutput` (line 416): add dryRun guard and pass MemoryDecl.

```ts
// New imports at top:
import { MODEL_MAP } from '../constants.js';
import { fieldsToJsonExample } from '../utils.js';
import { loadMemory, saveMemory } from './memory.js';

// In storeOutput, replace the memory save loop:
for (const writeName of nodeDecl.writes) {
  if (this.memoryNames.has(writeName)) {
    if (!this.options.dryRun) {
      const mem = this.program.memories.find(m => m.name === writeName);
      if (mem) {
        saveMemory(this.memoryDir, mem, output);
      }
    }
  }
}
```

### Modify: `src/analyzer/estimator.ts`

1. Import `PARTIAL_FIELD_FACTOR` from `../constants.js`.
2. Replace all four `0.3` occurrences (lines 165, 170, 184, 195) with `PARTIAL_FIELD_FACTOR`.

```ts
import { PARTIAL_FIELD_FACTOR } from '../constants.js';

// Line 165:
estimatedIn += ref.field ? Math.floor(ctx.maxTokens * PARTIAL_FIELD_FACTOR) : ctx.maxTokens;
// Line 170:
estimatedIn += ref.field ? Math.floor(mem.maxTokens * PARTIAL_FIELD_FACTOR) : mem.maxTokens;
// Line 184:
estimatedIn += ref.field ? Math.floor(upstreamTokens * PARTIAL_FIELD_FACTOR) : upstreamTokens;
// Line 195:
result = Math.floor(result * Math.min(PARTIAL_FIELD_FACTOR * t.fields.length, 1.0));
```

## Test Targets

No new test files needed. The 249 existing tests provide full regression coverage across all affected modules (estimator, agents, settings, executor). Run the full test suite to verify no regressions.

Verify specifically:
- Token estimation calculations remain numerically identical
- Agent generation output remains identical
- Settings generation output remains identical
- Executor dry-run and memory save/load behavior remains identical
- All import paths resolve correctly

## Ratchet-Locked Items

### Unlocked (2/2 budget used)
- [T6] `MODEL_MAP duplicated` — UNLOCKED. Now extracted to `src/constants.ts`, imported everywhere.
- [v1.2-R06] `MODEL_MAP duplicated in executor.ts` — UNLOCKED. Same resolution.

### New Ratchets
- [v2.1-R01] MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD in `src/constants.ts` — single source of truth — LOCKED
- [v2.1-R02] `fieldsToJsonExample` and `typeToExample` in `src/utils.ts` — single source of truth — LOCKED
- [v2.1-R03] `loadMemory` and `saveMemory` as standalone functions in `src/runtime/memory.ts` — LOCKED
- [v2.1-R04] saveMemory always saves; dryRun guard is caller's responsibility — LOCKED
- [v2.1-R05] PARTIAL_FIELD_FACTOR applies to all per-field fraction estimates (partial reads AND select transforms) — LOCKED
- [v2.1-R06] TOOL_MAP stays in `src/codegen/agents.ts` (not extracted) — LOCKED
