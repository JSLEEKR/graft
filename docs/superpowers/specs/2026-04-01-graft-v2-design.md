# Graft v2.0 — Design Spec: Import System + Memory

## 1. Goals

Two new language features for `.gft` files:

1. **`import`** — reuse context/node/edge declarations across `.gft` files
2. **`memory`** — persistent state between pipeline runs

These unlock modular pipeline composition and stateful multi-turn workflows.

## 2. Lessons from v1.0–v1.2 (applied to this design)

| Lesson | Source | How applied in v2.0 |
|--------|--------|---------------------|
| A3-Skeptic catches critical bugs every task | v1.0–v1.2 recurring | Keep 4-agent debate (HIGH complexity) |
| Plan test helpers have stale signatures | T5, T6, T7 | Convergence spec must include exact function signatures |
| Don't reuse across boundaries (generateAgent reuse disaster) | v1.2-R02 | Import resolver is standalone module, not bolted onto compiler.ts |
| YAGNI wins but edge cases matter | All rounds | MVP import (no re-export, no circular, no namespacing) |
| Forced dissenter self-retracts when wrong | v1.2 A4 | Mechanism works, keep it |
| MODEL_MAP duplication per ratchet | T6, v1.2-R06 | Don't try to extract shared modules yet |
| stdin.end() class of bugs (silent hangs) | v1.2-R09 | Memory persistence must handle write failures explicitly |
| Session cleanup prevents stale data | v1.2-R10 | Memory lives outside session dir (persists across runs) |

## 3. Feature 1: Import System

### 3.1 Syntax

```graft
import { TaskSpec, Analyzer } from "./shared.gft"
import { CodeReview } from "../reviews/code.gft"
```

Grammar:
```
import_decl := 'import' '{' identifier_list '}' 'from' string_literal
identifier_list := Identifier (',' Identifier)*
```

Rules:
- Import must appear at top of file, before any other declarations
- Only top-level declarations can be imported: `context`, `node`, `edge`
- Graphs cannot be imported (they are entry points, not reusable components)
- Path is relative to the importing file, must end with `.gft`
- No circular imports (A imports B, B imports A → error)
- No transitive re-export (if A imports X from B, C cannot get X by importing A)
- No wildcard imports (`import * from`)
- No aliasing (`import { X as Y }`)
- Duplicate name across files → error (no shadowing)

### 3.2 Resolution Algorithm

```
1. Parse the current file (get import declarations)
2. For each import:
   a. Resolve path relative to current file
   b. If already parsed (cache hit), skip parsing
   c. Parse the imported file (lexer + parser only, no full compile)
   d. Extract requested declarations by name
   e. If name not found → error with available names suggestion
3. Merge imported declarations into current Program
4. Continue with analyze + codegen on merged Program
```

### 3.3 Circular Import Detection

```
Maintain a Set<absolutePath> of files currently being resolved.
Before parsing an import target:
  - If target path is in the set → GraftError("Circular import detected: A → B → A")
  - Add target to set
  - Parse
  - Remove from set
```

### 3.4 Import Resolver Module

New file: `src/resolver/resolver.ts`

```typescript
export interface ResolveResult {
  program: Program;       // merged program with all imports resolved
  resolvedFiles: string[]; // list of all files that were parsed
  errors: GraftError[];
}

export function resolve(
  source: string,
  sourceFile: string,
): ResolveResult;
```

This is a standalone module. The compiler pipeline becomes:

```
Source (.gft)
  │
  ▼
Resolver ──→ Merged Program (imports resolved)
  │           (Lexer + Parser per file, merge declarations)
  ▼
Analyzer ──→ (scope, type, token checks on merged program)
  │
  ▼
CodeGen ──→ .claude/ directory
```

### 3.5 Impact on Existing Code

- **Lexer**: add `Import` and `From` keywords
- **Parser**: add `parseImportDecl()` at top of `parse()`
- **AST**: add `ImportDecl` type, add `imports: ImportDecl[]` to `Program`
- **Compiler**: insert resolver step between parse and analyze
- **CLI**: no changes needed (same compile/check/run commands)
- **Runtime (executor)**: no changes (works on merged Program)

### 3.6 AST Addition

```typescript
export interface ImportDecl {
  names: string[];          // imported identifiers
  path: string;             // relative path string
  resolvedPath?: string;    // absolute path (set by resolver)
  location: SourceLocation;
}

// Program becomes:
export interface Program {
  imports: ImportDecl[];    // NEW
  contexts: ContextDecl[];
  nodes: NodeDecl[];
  edges: EdgeDecl[];
  graphs: GraphDecl[];
}
```

## 4. Feature 2: Memory

### 4.1 Concept

Memory is persistent state that survives across pipeline runs. Use cases:
- Conversation history accumulation
- Learned preferences from previous runs
- Cross-run context (e.g., "what did we decide last time?")

### 4.2 Syntax

```graft
memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn {
    role: String
    content: String
    timestamp: String
  }>
  summary: Optional<String>
}
```

Grammar:
```
memory_decl := 'memory' Identifier '(' memory_params ')' '{' field_list '}'
memory_params := 'max_tokens' ':' integer (',' 'storage' ':' storage_type)?
storage_type := 'file'    // v2.0: file only. future: sqlite, redis, etc.
```

### 4.3 Memory Semantics

- Memory is a typed data store with a schema (like context)
- Nodes can `reads` and `writes` memory:
  ```graft
  node Chatbot(model: sonnet, budget: 4k/2k) {
    reads: [UserMessage, ConversationLog]
    writes: [ConversationLog]
    ...
  }
  ```
- `reads` a memory → load from `.graft/memory/<name>.json` before execution
- `writes` a memory → save node output to `.graft/memory/<name>.json` after execution
- Memory files persist across runs (NOT in session dir which gets cleaned)
- `max_tokens` on memory → truncation strategy when memory exceeds limit
  - Oldest entries dropped first (FIFO for list fields)
  - Summary field preserved (if exists)

### 4.4 New Keyword: `writes`

```graft
node SummaryWriter(model: haiku, budget: 2k/1k) {
  reads: [ConversationLog]
  writes: [ConversationLog]

  produces UpdatedLog {
    turns: List<Turn>
    summary: String
  }
}
```

- `writes` references a declared `memory` by name
- After node execution, the runtime merges node output into the memory file
- A node can both read and write the same memory

### 4.5 Memory Storage

```
.graft/
├── memory/                  ← NEW: persistent across runs
│   ├── conversationlog.json
│   └── preferences.json
├── session/                 ← cleaned each run (existing)
│   └── node_outputs/
└── token_log.txt
```

### 4.6 Impact on Existing Code

- **Lexer**: add `Memory`, `Writes`, `Storage` keywords
- **Parser**: add `parseMemoryDecl()`, update `parseNodeDecl()` for `writes`
- **AST**: add `MemoryDecl`, add `writes` field to `NodeDecl`, add `memories` to `Program`
- **Analyzer (scope)**: validate memory references in reads/writes
- **Analyzer (types)**: validate writes schema compatibility with memory schema
- **Analyzer (tokens)**: include memory token estimates
- **CodeGen**: generate memory loading/saving instructions in agent files
- **Runtime (executor)**: load memory before node, save memory after node

### 4.7 AST Additions

```typescript
export interface MemoryDecl {
  name: string;
  maxTokens: number;
  storage: 'file';          // v2.0: only file storage
  fields: Field[];
  location: SourceLocation;
}

// NodeDecl updated:
export interface NodeDecl {
  // ... existing fields ...
  writes: string[];         // NEW: memory names this node writes to
}

// Program updated:
export interface Program {
  imports: ImportDecl[];    // NEW (import feature)
  memories: MemoryDecl[];   // NEW (memory feature)
  contexts: ContextDecl[];
  nodes: NodeDecl[];
  edges: EdgeDecl[];
  graphs: GraphDecl[];
}
```

## 5. Implementation Tasks

| Task | Description | Scope |
|------|-------------|-------|
| T1 | Lexer: add import/memory keywords | 5 new keywords + tokens |
| T2 | Parser: import + memory declarations | parseImportDecl, parseMemoryDecl, writes |
| T3 | AST: new types | ImportDecl, MemoryDecl, Program changes |
| T4 | Import resolver | resolver.ts, circular detection, merge |
| T5 | Analyzer updates | scope/type/token for imports + memory |
| T6 | CodeGen updates | memory load/save in agent files |
| T7 | Runtime updates | executor memory integration |
| T8 | Integration tests + examples | end-to-end import + memory pipelines |

### Complexity Assessment: HIGH

Rationale:
- Import resolver is a new module with file I/O and path resolution
- Memory touches every stage of the pipeline (lexer → runtime)
- Circular import detection requires careful graph traversal
- Memory persistence across runs is a new class of state management

→ Full 4-agent adversarial debate for all tasks.

## 6. Example: Full v2.0 Pipeline

### shared.gft
```graft
context UserMessage(max_tokens: 500) {
  content: String
  user_id: String
}

context SystemConfig(max_tokens: 200) {
  persona: String
  temperature: Float(0..1)
}
```

### chatbot.gft
```graft
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 4k, storage: file) {
  turns: List<Turn {
    role: String
    content: String
  }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog]
  
  produces Response {
    reply: String
    updated_turns: List<Turn {
      role: String
      content: String
    }>
    summary: Optional<String>
  }
}

edge Responder -> done

graph Chat(input: UserMessage, output: Response, budget: 8k) {
  Responder -> done
}
```

## 7. Non-Goals (deferred)

- Wildcard imports (`import * from`)
- Import aliasing (`import { X as Y }`)
- Transitive re-export
- Graph imports (graphs are entry points)
- Non-file memory storage (sqlite, redis)
- Memory eviction policies beyond FIFO
- Memory encryption
- Memory versioning/migration
