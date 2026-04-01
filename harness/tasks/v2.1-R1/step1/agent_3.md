# A3-Skeptic: v2.1-R1 Cleanup Analysis

## Edge Cases and Risks

### 1. Ratchet Conflict: MODEL_MAP duplication was explicitly ratchet-locked

The plan says "Move MODEL_MAP to single source." But ratchet items [T6] and [v1.2-R06] explicitly locked MODEL_MAP duplication:

- T6: "MODEL_MAP duplicated"
- v1.2-R06: "MODEL_MAP duplicated in executor.ts (T6 ratchet) -- LOCKED"

This refactoring **unlocks two ratchet items**. The max unlocks per task is 2, so this is exactly at the limit. This must be explicitly acknowledged in convergence. If any other ratchet needs unlocking, we are over budget.

### 2. saveMemory references `this.program.memories` -- hidden dependency

`saveMemory` (executor.ts:170-199) accesses `this.program.memories` to find the memory schema for field-matching merge (line 173: `const mem = this.program.memories.find(m => m.name === name)`). It also accesses `this.options.dryRun` (line 171) and `this.memoryDir` (line 161, 176, 178).

To extract saveMemory as a standalone function, you need to pass:
- `memoryDir: string`
- `dryRun: boolean`
- `memories: MemoryDecl[]` (the program's memory declarations)
- `name: string`
- `nodeOutput: unknown`

The plan says "Convert from methods to standalone functions with explicit parameters" but doesn't enumerate what those parameters are. If the implementer misses `dryRun`, memory saves will happen during dry runs, breaking ratchet [v2.0-R28].

### 3. loadMemory is simpler but still has a hidden dependency

`loadMemory` (executor.ts:160-168) only uses `this.memoryDir`. Parameters needed:
- `memoryDir: string`
- `name: string`

This one is clean. No risk.

### 4. fieldsToJsonExample and typeToExample are IDENTICAL between the two copies

Verified by comparing agents.ts:116-151 with executor.ts:482-517. They are character-for-character identical (both function bodies, all switch cases, all return values). Safe to extract.

### 5. The 0.3 magic number appears in TWO different semantic contexts in estimator.ts

The plan says extract `PARTIAL_FIELD_FACTOR = 0.3` from estimator.ts lines 165, 170, 184. But 0.3 also appears at line 195 in `applyTransformReductions`:

```typescript
result = Math.floor(result * Math.min(0.3 * t.fields.length, 1.0));
```

This 0.3 is the `select` transform factor -- semantically DIFFERENT from the partial-field-read factor. If someone naively replaces all `0.3` occurrences in estimator.ts with `PARTIAL_FIELD_FACTOR`, the select transform logic changes meaning. The constant should only be applied to lines 165, 170, 184 -- NOT line 195.

### 6. BUDGET_WARNING_THRESHOLD and BUDGET_CRITICAL_THRESHOLD are only used in settings.ts

These values (0.8 and 0.9) appear at settings.ts lines 96-97 inside `generateSettings`. They are NOT used anywhere else in the codebase. Extracting them to constants.ts is technically fine but provides no deduplication benefit -- it's purely for readability. Low risk, low reward.

### 7. Import cycle risk: src/utils.ts importing from parser/ast.ts

`fieldsToJsonExample` and `typeToExample` depend on `Field` and `TypeExpr` from `../parser/ast.js`. If `src/utils.ts` imports from `src/parser/ast.js`, that's fine -- ast.ts has no imports from codegen or runtime. No cycle.

But the NAME `utils.ts` is generic. If future code in parser/ or lexer/ ever imports from utils.ts, we could get a cycle. Consider naming it `src/schema-utils.ts` or placing it at `src/codegen/schema-utils.ts` to make the dependency direction clear.

### 8. Import cycle risk: src/constants.ts is safe

`constants.ts` would only export primitive values (strings, numbers). No imports needed. No cycle possible.

### 9. Import cycle risk: src/runtime/memory.ts importing from parser/ast.ts

`saveMemory` needs `MemoryDecl` (or at least its `fields` property) from ast.ts. `src/runtime/memory.ts` -> `src/parser/ast.ts` is fine (ast.ts doesn't import from runtime/). No cycle.

### 10. TOOL_MAP in agents.ts is NOT mentioned in the plan

The plan doesn't touch TOOL_MAP. Confirming it stays in agents.ts. No issue.

### 11. Test files import directly from agents.ts, settings.ts, executor.ts

From `tests/codegen.test.ts`:
- `import { generateAgent } from '../src/codegen/agents.js'`
- `import { generateSettings } from '../src/codegen/settings.js'`

From `tests/runner.test.ts`:
- `import('../src/runtime/executor.js')`

None of these tests import `fieldsToJsonExample`, `typeToExample`, `MODEL_MAP`, `loadMemory`, or `saveMemory` directly (they're all private/unexported or module-scoped). So tests should NOT need changes for this refactoring. The extracted functions are internal plumbing.

### 12. executor.ts comment says "Duplicated from agents.ts (not exported there) per convergence spec"

Line 481: `// Duplicated from agents.ts (not exported there) per convergence spec`. This comment should be removed when extracting, otherwise it becomes a lie.

## Hidden Dependencies

### saveMemory's dryRun guard
As noted above, `saveMemory` checks `this.options.dryRun` before doing anything. The extracted function signature MUST include a dryRun parameter, or the Executor must guard before calling.

**Recommendation**: Keep the dryRun guard in the Executor's call site, not in the standalone function. The standalone `saveMemory` should always save. This is cleaner separation of concerns -- the function does I/O, the caller decides whether to call it.

### saveMemory's mkdirSync call
Line 176: `fs.mkdirSync(this.memoryDir, { recursive: true })`. This is defensive (memoryDir is already created in the constructor's `execute()` method). The standalone function should keep this defensive mkdir because it can no longer rely on the Executor's constructor having run.

### The 'memory' type from ast.ts
`saveMemory` needs `mem.fields` which comes from `MemoryDecl`. The standalone function must import `MemoryDecl` from ast.ts, or accept `fields: Field[]` directly. Importing `MemoryDecl` is cleaner.

## Proposed Implementation

### File: `src/constants.ts`
```typescript
// Model name shorthand -> full Claude model identifier
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

// Token estimation: fraction of total tokens attributed to a single field read
export const PARTIAL_FIELD_FACTOR = 0.3;

// Budget thresholds for settings generation
export const BUDGET_WARNING_THRESHOLD = 0.8;
export const BUDGET_CRITICAL_THRESHOLD = 0.9;
```

### File: `src/utils.ts`
```typescript
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

### File: `src/runtime/memory.ts`
```typescript
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

export function saveMemory(
  memoryDir: string,
  name: string,
  nodeOutput: unknown,
  memory: MemoryDecl,
): void {
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
    for (const field of memory.fields) {
      if (field.name in output) {
        current[field.name] = output[field.name];
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
}
```

### Changes to `src/codegen/agents.ts`
- Remove `MODEL_MAP` constant, import from `../constants.js`
- Remove `fieldsToJsonExample` and `typeToExample`, import from `../utils.js`
- Keep `TOOL_MAP`, `resolveTools`, `formatReads`, `formatWrites`, `formatFailure` as-is

### Changes to `src/codegen/settings.ts`
- Remove `MODEL_MAP` constant, import from `../constants.js`
- Replace literal `0.8` and `0.9` with imported constants

### Changes to `src/runtime/executor.ts`
- Remove `MODEL_MAP` constant, import from `../constants.js`
- Remove `fieldsToJsonExample` and `typeToExample`, import from `../utils.js`
- Remove `loadMemory` and `saveMemory` methods, import from `./memory.js`
- Update `loadMemory` call: `loadMemory(this.memoryDir, ref.context)`
- Update `saveMemory` call: add dryRun guard at call site, pass `(this.memoryDir, writeName, output, mem)`
- Remove stale duplication comments

### Changes to `src/analyzer/estimator.ts`
- Import `PARTIAL_FIELD_FACTOR` from `../constants.js`
- Replace `0.3` at lines 165, 170, 184 with `PARTIAL_FIELD_FACTOR`
- Do NOT replace `0.3` at line 195 (different semantic meaning: select transform factor)

## Potential Issues

1. **Ratchet unlock budget**: Unlocking [T6] (MODEL_MAP duplicated) and [v1.2-R06] (MODEL_MAP duplicated in executor.ts) consumes both allowed unlocks. No other ratchet can be modified in this task.

2. **The 0.3 at estimator.ts:195 trap**: Any implementer who does a find-and-replace for `0.3` in estimator.ts will silently change the select transform reduction factor. This is a semantic bug that passes all existing tests (because the select transform test probably uses specific values that happen to work either way). Must be explicitly called out in convergence.

3. **saveMemory MemoryDecl lookup**: The Executor currently does `this.program.memories.find(m => m.name === name)` inside saveMemory. After extraction, the Executor must do this lookup BEFORE calling the standalone saveMemory, and pass the found MemoryDecl. If the find returns undefined, the Executor should skip the call (current behavior: early return on line 174). This is a behavior-preservation edge case -- if the implementer moves the find inside the standalone function, they need to pass `program.memories` instead of a single `MemoryDecl`.

4. **Import path depth**: `src/utils.ts` will be imported as `../utils.js` from codegen/ and `../utils.js` from runtime/. `src/constants.ts` will be imported as `../constants.js` from codegen/, runtime/, and analyzer/. These are all one level up, consistent with existing import patterns (e.g., `../parser/ast.js`).

5. **No test changes needed**: All extracted functions are currently private/unexported or module-scoped. Tests import public APIs (generateAgent, generateSettings, Executor). Existing tests provide regression coverage without modification.

6. **Zero new features**: The scope is clean refactoring. No behavioral changes. The risk is exclusively in breaking existing behavior through incorrect extraction, not in introducing new bugs from new features.

## Convergence Score: 8/10

The task is well-scoped and the plan is mostly correct. I give 8 instead of higher because:
- The 0.3 semantic trap in estimator.ts is a real risk that the plan doesn't mention
- The ratchet unlock accounting needs explicit acknowledgment
- saveMemory's parameter design has a subtle choice (pass MemoryDecl vs program.memories) that the plan glosses over
- The dryRun guard placement (caller vs callee) needs a decision

The refactoring itself is straightforward -- the complexity is in NOT introducing bugs.
