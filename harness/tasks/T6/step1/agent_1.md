# T6 Agent 1 (A1-Architect): Code Generator Architecture

## Convergence Score: 4/5

Research agents agree on all major decisions. One point deducted for unresolved MODEL_MAP extraction question (research_impl.md suggests extraction; research_arch.md accepts duplication). All three known bugs are confirmed and solutions are clear.

---

## 1. Five-File Decomposition

The plan's 5-file split is **correct and final**. Each file has a single responsibility with clear input/output types:

| File | Export | Input | Output |
|------|--------|-------|--------|
| `agents.ts` | `generateAgent(node: NodeDecl): string` | Single node declaration | Markdown string (agent .md content) |
| `hooks.ts` | `generateHook(edge: EdgeDecl): string \| null` | Single edge declaration | Bash script string, or null if no transforms |
| `orchestration.ts` | `generateOrchestration(program: Program, report: TokenReport): string` | Full program + token report | CLAUDE.md markdown string |
| `settings.ts` | `generateSettings(program: Program, sourceFile: string): GraftSettings` | Full program + source filename | Typed settings object (caller serializes) |
| `codegen.ts` | `generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[]` + `writeFiles(files: GeneratedFile[], outDir: string): void` | All inputs | Array of `{path, content}` pairs; disk writer |

This matches the established pattern (T5 has scope.ts, types.ts, estimator.ts). No barrel exports (T1-R08). Each generator is independently testable.

## 2. GeneratedFile[] Return Pattern

The `generate()` function returns `GeneratedFile[]` where:

```typescript
export interface GeneratedFile {
  path: string;   // relative path, e.g. ".claude/agents/researcher.md"
  content: string; // full file content
}
```

**Key design properties:**
- Pure function: no I/O, no side effects -- all file content computed in memory first.
- `writeFiles()` is the only function that touches disk (via `fs.mkdirSync` + `fs.writeFileSync`).
- Tests call `generate()` and assert on returned strings. No fs mocking needed.
- `graft check` calls the pipeline up through analysis but skips `generate()`/`writeFiles()`. `graft compile` calls both.

The `generate()` function orchestrates the four sub-generators in order: agents, hooks, orchestration, settings, then appends runtime scaffold files (`.graft/session/node_outputs/.gitkeep`, `.graft/token_log.txt`).

## 3. Template Patterns

All generators use TypeScript template literals (backtick strings). No template engine dependencies.

### 3.1 Agent Markdown (`agents.ts`)

Structure: YAML frontmatter (`---` delimited) + 5 sections (Context Loading, Output Contract, Token Discipline, Completion Protocol, Failure Protocol).

Key helpers:
- `resolveTools(tools: string[]): string[]` -- maps Graft tool names to Claude tool names via `TOOL_MAP`. Uses `Set` for dedup.
- `fieldsToJsonExample(fields: Field[]): Record<string, unknown>` -- recursively converts `TypeExpr` AST nodes to example JSON values via `typeToExample()`.
- `formatReads(node: NodeDecl): string` -- generates context loading instructions from `ContextRef[]`.
- `formatFailure(node: NodeDecl): string` -- switch on `FailureStrategy.type` to produce failure protocol text.

### 3.2 Hook Scripts (`hooks.ts`)

Bash scripts with `set -euo pipefail`, file existence check, jq invocation, and token accounting (byte-count logging). Returns `null` for edges without transforms or with conditional targets.

### 3.3 Orchestration (`orchestration.ts`)

Builds step-by-step execution plan from `graph.flow[]`. For each step after the first, determines input source by checking whether the preceding edge has transforms (uses edgeMap lookup). Includes budget section with `toLocaleString()` formatting and token tracking instructions.

### 3.4 Settings (`settings.ts`)

Returns a typed `GraftSettings` object. Caller (`codegen.ts`) serializes via `JSON.stringify(settings, null, 2)`. Default model is the first flow node's resolved model. Overrides map contains only nodes whose resolved model differs from the default.

## 4. jq Generation Correctness

The `transformsToJq()` function groups transforms by type before composing:

| Transform | jq Output | Example |
|-----------|-----------|---------|
| `select(field)` | `{field: .field}` | Multiple selects merge: `{a: .a, b: .b}` |
| `drop(field)` | `del(.field)` | Multiple drops chain with pipe |
| `filter(field, cond)` | `{field: [.field[] \| select(.cond_field op val)]}` | Wraps array filtering |
| `compact` | `-c` flag on jq | Toggles compact output |
| `truncate(n)` | No-op (best-effort, deferred) | Logged but not implemented in jq |

**Composition order:** select projections first, then del() for drops, then filter expressions. All joined with ` | ` (jq pipe). Compact flag prepends `-c` to the jq invocation, not inside the expression.

**Correctness note:** The plan's jq generation is sound for the v1 transform set. Field names are ASCII-constrained by the lexer (T2), so no quoting issues. The `filterToJq()` function correctly wraps the condition field reference as `.${condition.field}` (the condition's field, not the transform's field) with the operator and value.

## 5. MODEL_MAP Duplication Decision

**Decision: Keep duplicated in agents.ts and settings.ts.** Rationale:

- Both files need the map independently. Extracting to a shared module creates a new file that violates the 5-file plan boundary.
- The map is 3 entries and changes only when Anthropic releases new models (infrequent).
- No barrel exports (T1-R08) means a shared module would need explicit imports from two consumers for 3 lines of data.
- research_arch.md accepts this; research_impl.md suggests extraction but acknowledges it's optional.
- YAGNI wins again, consistent with T1-T5 pattern.

## 6. Known Bug Fixes

### Bug 1: Import path `analyzer/tokens.js` -> `analyzer/estimator.js`

**Affects:** `orchestration.ts` and `codegen.ts` (both import `TokenReport`).

**Fix:** Change all imports from:
```typescript
import { TokenReport } from '../analyzer/tokens.js';
```
to:
```typescript
import { TokenReport } from '../analyzer/estimator.js';
```

This is locked by T5-R02. The plan's file structure listing still shows `analyzer/tokens.ts` but the actual file is `analyzer/estimator.ts`.

### Bug 2: MODEL_MAP duplication

**Status:** Accepted as-is (see section 5). Not a bug -- a deliberate design choice.

### Bug 3: Parser constructor signature

**Affects:** `tests/codegen.test.ts` helper function.

The plan's `parse()` helper uses:
```typescript
return new Parser(tokens, source).parse();
```

But the actual Parser constructor (T4-R01, confirmed in source) takes `Token[]` only:
```typescript
constructor(private readonly tokens: Token[]) {}
```

**Fix:** Change to:
```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

This also affects `compiler.ts` in T7 which uses `new Parser(tokens, source)` -- flag for T7 implementer.

## 7. Testing Strategy

### Approach: Assertion-based (`toContain`), not snapshot-based.

Rationale:
- Snapshots are brittle to formatting changes and `compiled_at` timestamps.
- `toContain` verifies structural correctness without over-constraining whitespace/ordering.
- Consistent with existing test style across T2 (31 tests), T4 (64 tests), T5 (78 tests).
- common_memory.md notes "consider snapshot testing" but assertion testing is the established pattern.

### Test Structure

The plan defines 6 test cases across 4 `describe` blocks:

1. **`generateAgent`** (3 tests): basic markdown structure, tools in frontmatter, failure protocol.
2. **`generateHook`** (2 tests): edge with transforms produces bash script, edge without transforms returns null.
3. **`generateOrchestration`** (1 test): CLAUDE.md with execution plan, budget formatting, step numbering.
4. **`generateSettings`** (1 test): settings object shape, model routing, hooks.

### Additional Tests to Consider

The plan's 6 tests are minimal. Recommend adding:

- **`generateAgent`**: node with no reads (empty reads array), node with partial read (`Research.findings`), all failure strategy types (skip, abort, fallback, retry_then_fallback).
- **`generateHook`**: edge with `drop` transform (produces `del(.field)` jq), edge with `filter` transform, edge with multiple transforms composed via pipe.
- **`generateOrchestration`**: single-node graph (no input source for step 1).
- **`generateSettings`**: all nodes using same model (no overrides), custom model string pass-through.
- **`generate`** (codegen.ts): full pipeline producing correct number of GeneratedFile entries, runtime scaffold files included.
- **`compiled_at` handling**: assert `settings.graft.compiled_at` is a valid ISO string without asserting exact value.

Target: ~20-25 tests total, covering each jq transform type, each failure strategy, and edge cases.

### Test Helper Fix

The `parse()` helper must use the corrected Parser constructor (see Bug 3). All test cases in the plan use this helper, so the fix applies uniformly.

## 8. Import Graph

```
codegen.ts
  -> ../parser/ast.js       (Program, NodeDecl, EdgeDecl, etc.)
  -> ../analyzer/estimator.js (TokenReport)
  -> ./agents.js             (generateAgent)
  -> ./hooks.js              (generateHook)
  -> ./orchestration.js      (generateOrchestration)
  -> ./settings.js           (generateSettings)

agents.ts
  -> ../parser/ast.js        (NodeDecl, Field, TypeExpr)

hooks.ts
  -> ../parser/ast.js        (EdgeDecl, Transform)

orchestration.ts
  -> ../parser/ast.js        (Program)
  -> ../analyzer/estimator.js (TokenReport)

settings.ts
  -> ../parser/ast.js        (Program, EdgeDecl)
```

All imports use `.js` extensions (T1-R09). No circular dependencies. No barrel exports (T1-R08).

## 9. Summary of Deviations from Plan

| # | Plan Says | Correct Version | Severity |
|---|-----------|----------------|----------|
| 1 | `import { TokenReport } from '../analyzer/tokens.js'` | `'../analyzer/estimator.js'` | BLOCKER -- won't compile |
| 2 | `new Parser(tokens, source).parse()` | `new Parser(tokens).parse()` | BLOCKER -- won't compile |
| 3 | `MODEL_MAP` "should be extracted" | Keep duplicated | LOW -- design choice |
| 4 | 6 tests total | ~20-25 recommended | MEDIUM -- functional but thin coverage |

Items 1 and 2 are compile-time failures that must be fixed. Item 3 is accepted. Item 4 is a recommendation for the implementer.
