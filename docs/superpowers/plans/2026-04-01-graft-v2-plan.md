# Graft v2.0 Implementation Plan

## Overview

Add `import` and `memory` to the Graft language. 8 tasks, full adversarial debate.

## Task Breakdown

### T1: Lexer — New Keywords & Tokens

**New keywords**: `import`, `from`, `memory`, `writes`, `storage`
**New token types**: `Import`, `From`, `Memory`, `Writes`, `Storage`

```typescript
// In tokens.ts TokenType enum, add:
Import = 'Import',
From = 'From',
Memory = 'Memory',
Writes = 'Writes',
Storage = 'Storage',

// In KEYWORDS map, add:
import: TokenType.Import,
from: TokenType.From,
memory: TokenType.Memory,
writes: TokenType.Writes,
storage: TokenType.Storage,
```

**Tests**: lexer tokenizes `import { X } from "./file.gft"` and `memory M(max_tokens: 1k, storage: file) { ... }` correctly.

**Estimated size**: ~20 lines changed, ~15 test lines added.

---

### T2: AST — New Type Definitions

Add to `ast.ts`:

```typescript
export interface ImportDecl {
  names: string[];
  path: string;
  resolvedPath?: string;
  location: SourceLocation;
}

export interface MemoryDecl {
  name: string;
  maxTokens: number;
  storage: 'file';
  fields: Field[];
  location: SourceLocation;
}
```

Update `Program`:
```typescript
export interface Program {
  imports: ImportDecl[];     // NEW
  memories: MemoryDecl[];   // NEW
  contexts: ContextDecl[];
  nodes: NodeDecl[];
  edges: EdgeDecl[];
  graphs: GraphDecl[];
}
```

Update `NodeDecl`:
```typescript
export interface NodeDecl {
  // ... existing ...
  writes: string[];          // NEW: memory names
}
```

**Impact**: All code that constructs `Program` or `NodeDecl` objects must be updated.

---

### T3: Parser — Import & Memory Parsing

Add to `parser.ts`:

```typescript
// At top of parse(), before other declarations:
private parseImportDecl(): ImportDecl { ... }

// New declaration parser:
private parseMemoryDecl(): MemoryDecl { ... }

// In parseNodeDecl(), add writes: parsing after reads/tools
```

**Import parsing**:
```
'import' '{' Identifier (',' Identifier)* '}' 'from' StringLiteral
```

**Memory parsing**:
```
'memory' Identifier '(' params ')' '{' fields '}'
params: max_tokens: <int> (',' storage: 'file')?
```

**Writes parsing** (inside node):
```
'writes' ':' '[' Identifier (',' Identifier)* ']'
```

**Tests**: parse import declarations, memory declarations, node with writes, error cases.

---

### T4: Import Resolver

New file: `src/resolver/resolver.ts`

```typescript
export interface ResolveResult {
  program: Program;
  resolvedFiles: string[];
  errors: GraftError[];
}

export function resolve(source: string, sourceFile: string): ResolveResult;
```

**Algorithm**:
1. Parse source file → get Program with imports
2. For each ImportDecl:
   - Resolve path relative to sourceFile
   - Check circular import set
   - Parse target file (lexer + parser only)
   - Recursively resolve target's imports
   - Extract named declarations
   - Merge into main Program
3. Return merged Program

**Circular detection**: `Set<string>` of absolute paths currently being resolved.

**Error cases**:
- File not found
- Name not found in target (suggest available names)
- Circular import
- Importing a graph (not allowed)
- Duplicate name across files

**Tests**: basic import, multi-file, circular detection, missing name, missing file.

---

### T5: Analyzer Updates

**Scope checker**:
- Memory names in `reads` are valid references
- Memory names in `writes` are valid references
- Imported declarations are in scope

**Type checker**:
- `writes` target schema must be compatible with node's produces schema
- Memory fields follow same type rules as context fields

**Token estimator**:
- Memory in `reads` → add memory.maxTokens to node input estimate
- Memory in `writes` → note in estimation report (no budget impact)

**Tests**: invalid memory references, type mismatches, token estimates with memory.

---

### T6: CodeGen Updates

**Agent files**: When a node reads memory, add loading instructions:
```markdown
## Memory Loading
Load memory from `.graft/memory/<name>.json` before processing.
```

When a node writes memory, add saving instructions:
```markdown
## Memory Saving
After producing output, write updated memory to `.graft/memory/<name>.json`
```

**Orchestration**: Memory load/save steps in execution plan.

**Settings**: No changes needed.

**Tests**: generated agent files contain memory instructions.

---

### T7: Runtime — Memory Integration

**Executor changes**:
- Before node execution: load memory files for reads references
- After node execution: if node has writes, save output to memory dir
- Memory dir: `.graft/memory/` (NOT cleaned by session cleanup)
- Memory files: `<name_lowercase>.json`

```typescript
private loadMemory(name: string): unknown {
  const file = path.join(this.options.workDir, '.graft', 'memory', `${name.toLowerCase()}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return null; // first run, no memory yet
}

private saveMemory(name: string, data: unknown): void {
  const memDir = path.join(this.options.workDir, '.graft', 'memory');
  fs.mkdirSync(memDir, { recursive: true });
  fs.writeFileSync(
    path.join(memDir, `${name.toLowerCase()}.json`),
    JSON.stringify(data, null, 2),
  );
}
```

**Runner changes**: resolver step before compile when running.

**Tests**: memory load/save, first run (no memory file), persistence across runs.

---

### T8: Integration Tests + Examples

**Example files**:
- `examples/shared.gft` — reusable contexts
- `examples/chatbot.gft` — imports shared + uses memory
- `examples/hello.gft` — updated (no changes needed, backward compatible)

**Integration tests**:
- Compile pipeline with imports
- Compile pipeline with memory
- Run pipeline with memory (mock spawner)
- Import + memory combined
- Error cases: circular import, missing file

**Verification**: all existing 171 tests still pass + new tests.

## Execution Order

```
T1 (lexer) + T2 (AST) — can be done as single debate round (small scope)
    ↓
T3 (parser) — depends on T1 + T2
    ↓
T4 (resolver) — depends on T3
    ↓
T5 (analyzer) — depends on T4
    ↓
T6 (codegen) + T7 (runtime) — can be done as single debate round
    ↓
T8 (integration) — depends on all above
```

**Grouping for debate rounds**:
- Round 1: T1 + T2 + T3 (lexer + AST + parser — tightly coupled)
- Round 2: T4 (resolver — new standalone module, needs careful design)
- Round 3: T5 (analyzer — cross-cutting changes)
- Round 4: T6 + T7 (codegen + runtime — output side)
- Round 5: T8 (integration — verification)

5 debate rounds × ~14 agents each = ~70 agent calls estimated.
