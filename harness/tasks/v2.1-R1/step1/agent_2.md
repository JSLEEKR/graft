# A2-Pragmatist: v2.1-R1 Cleanup Analysis

## Proposed Implementation

### 1. Extract `src/constants.ts`

The simplest approach: one flat file, named exports, no classes, no abstractions.

```typescript
// src/constants.ts

export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

export const TOOL_MAP: Record<string, string[]> = {
  file_read: ['Read'],
  file_write: ['Write', 'Edit'],
  terminal: ['Bash'],
  ast_parse: ['Bash'],
  test_run: ['Bash'],
  lint: ['Bash'],
  browser: ['Bash'],
};

export const PARTIAL_FIELD_FACTOR = 0.3;
export const BUDGET_WARNING_THRESHOLD = 0.8;
export const BUDGET_CRITICAL_THRESHOLD = 0.9;
```

**Changes to consumers:**
- `agents.ts`: Delete local `MODEL_MAP` and `TOOL_MAP`, add `import { MODEL_MAP, TOOL_MAP } from '../constants.js';`
- `settings.ts`: Delete local `MODEL_MAP`, add `import { MODEL_MAP, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD } from '../constants.js';` Replace `0.8` and `0.9` literals in the settings output with the constants.
- `executor.ts`: Delete local `MODEL_MAP`, add `import { MODEL_MAP } from '../constants.js';`
- `estimator.ts`: Replace all `0.3` magic numbers with `PARTIAL_FIELD_FACTOR`. Add `import { PARTIAL_FIELD_FACTOR } from '../constants.js';`

**Why TOOL_MAP goes in constants too:** It's currently only in `agents.ts`, but it's a static mapping that logically belongs with `MODEL_MAP`. Moving it keeps `constants.ts` as the single source for all configuration-like maps. However, if the scope says "zero new features, pure refactoring," we could leave TOOL_MAP in `agents.ts` since it's not duplicated. I'd lean toward moving it since it's free and keeps the pattern clean, but it's optional.

### 2. Extract `src/utils.ts`

`fieldsToJsonExample` and `typeToExample` are identical in `agents.ts` (lines 116-151) and `executor.ts` (lines 482-517). Character-for-character duplicates.

```typescript
// src/utils.ts
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

**Changes to consumers:**
- `agents.ts`: Delete both functions (lines 116-151), add `import { fieldsToJsonExample } from '../utils.js';` (only `fieldsToJsonExample` is called directly; `typeToExample` is internal to the pair).
- `executor.ts`: Delete both functions (lines 482-517), add `import { fieldsToJsonExample } from '../utils.js';`

**Note:** `typeToExample` should also be exported from `utils.ts` since it's a useful utility, even though current consumers only call `fieldsToJsonExample` directly. Export it for completeness -- costs nothing, prevents future re-duplication.

### 3. Extract `src/runtime/memory.ts`

Currently `loadMemory` and `saveMemory` are private methods on `Executor` (lines 160-200). They access `this.memoryDir`, `this.options.dryRun`, and `this.program.memories`. Convert to standalone functions with explicit parameters.

```typescript
// src/runtime/memory.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MemoryDecl, Field } from '../parser/ast.js';

export function loadMemory(memoryDir: string, name: string): Record<string, unknown> | null {
  const filePath = path.join(memoryDir, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveMemory(
  memoryDir: string,
  name: string,
  nodeOutput: unknown,
  memoryDecl: MemoryDecl,
  dryRun: boolean,
): void {
  if (dryRun) return;

  fs.mkdirSync(memoryDir, { recursive: true });
  const filePath = path.join(memoryDir, `${name.toLowerCase()}.json`);

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
    for (const field of memoryDecl.fields) {
      if (field.name in output) {
        current[field.name] = output[field.name];
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
}
```

**Changes to `executor.ts`:**
- Delete `loadMemory` and `saveMemory` methods (lines 160-200)
- Add `import { loadMemory, saveMemory } from './memory.js';`
- At call sites:
  - `this.loadMemory(ref.context)` becomes `loadMemory(this.memoryDir, ref.context)`
  - `this.saveMemory(writeName, output)` becomes:
    ```typescript
    const mem = this.program.memories.find(m => m.name === writeName);
    if (mem) saveMemory(this.memoryDir, writeName, output, mem, !!this.options.dryRun);
    ```
    Wait -- the current `saveMemory` already does the `find` internally. To keep the call site clean, we have two options:
    - Option A: Pass `memoryDecl` (requires caller to find it). Cleaner function signature, no program dependency.
    - Option B: Pass `memories: MemoryDecl[]` and let the function find. Matches current behavior.

    I'll go with **Option A** because it's simpler and the caller already knows if `writeName` is a memory (it checks `this.memoryNames.has(writeName)`). The `find` is trivial to add at the call site.

**Check:** `executor.ts` line 414 already has `if (this.memoryNames.has(writeName))` guard. We need to add the `find` + null check there.

**AST check:** Need to verify `MemoryDecl` has a `fields` property. Looking at executor line 191: `for (const field of mem.fields)` -- yes, `MemoryDecl` has `fields`.

### Implementation Order

1. Create `src/constants.ts` -- no consumers change yet, zero risk
2. Create `src/utils.ts` -- no consumers change yet, zero risk
3. Create `src/runtime/memory.ts` -- no consumers change yet, zero risk
4. Update `agents.ts` imports (delete locals, add imports)
5. Update `settings.ts` imports
6. Update `executor.ts` imports (all three: constants, utils, memory)
7. Update `estimator.ts` imports
8. Run tests -- every existing test must pass unchanged

## Trade-off Analysis

**Gains:**
- MODEL_MAP: 3 copies -> 1 copy. No drift risk. The comment "Keep in sync with agents.ts" can die.
- `fieldsToJsonExample`/`typeToExample`: exact duplicate eliminated (35 lines x 2 -> 35 lines x 1)
- Memory functions: testable in isolation without constructing an Executor
- Magic numbers `0.3`, `0.8`, `0.9` become named constants

**Risks:**
- Import path changes: `.js` extension required for ESM. Must use `../constants.js` from `codegen/` and `analyzer/`, `../utils.js` from `codegen/` and `runtime/`, `./memory.js` from `runtime/`.
- Circular dependency: None. `constants.ts` and `utils.ts` import only from `parser/ast.js`. `memory.ts` imports from `parser/ast.js`. No cycles.

**What I'm NOT doing:**
- Not moving `TOOL_MAP` (only one copy exists -- not duplicated, not in scope)
- Not refactoring `Executor` class beyond replacing `loadMemory`/`saveMemory` calls
- Not adding new exports to existing modules
- Not changing any test files (tests should pass as-is since public APIs don't change)

## Potential Issues

1. **`MemoryDecl` type availability:** Need to verify it's exported from `parser/ast.ts`. If not, we need to add an export. Quick check: `executor.ts` uses `this.program.memories` which returns `MemoryDecl[]` per the `Program` type. The type must exist in ast.ts. But is it exported? If not, that's a one-word change (`export interface MemoryDecl`).

2. **`estimator.ts` uses `0.3` in `applyTransformReductions` too (line 196):** `0.3 * t.fields.length` in the `select` transform case. This is a different semantic use of 0.3 -- it means "each selected field is ~30% of the total," not "a partial field read is 30%." Should this share the same constant? Semantically yes -- both represent "one field is ~30% of the whole." But pragmatically, they could diverge. I'd use `PARTIAL_FIELD_FACTOR` for all of them since they share the same meaning. If someone changes the factor, they'd want it to change everywhere.

3. **`saveMemory` call site change:** The current `saveMemory` method does a `this.program.memories.find(m => m.name === name)` with an early return if not found. The new standalone function requires the caller to pass the `MemoryDecl`. The call site in `storeOutput` already guards with `if (this.memoryNames.has(writeName))`, but now needs to also find the declaration. This is a minor code change but must be done correctly to avoid null reference.

4. **Test coverage for memory functions:** Currently tested only through `Executor` integration tests. After extraction, the standalone functions are testable directly, but we should NOT add new tests in this task (scope is "zero new features"). Existing tests cover the behavior through the Executor path.

## Convergence Score: 8/10

This is a mechanical refactoring with clear inputs and outputs. The only judgment calls are:
- Whether to move `TOOL_MAP` (I say no -- not duplicated)
- Whether `0.3` in `applyTransformReductions` shares the constant (I say yes)
- Whether `saveMemory` takes `MemoryDecl` or `MemoryDecl[]` (I say `MemoryDecl` -- simpler)

High confidence because the code is already working, tests exist, and the changes are purely structural. The risk is only in getting import paths wrong, which tests will catch immediately.
