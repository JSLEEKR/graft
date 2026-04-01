# Implementation Research — v1.2: graft run execution engine

## Claude CLI Invocation Pattern
```typescript
spawn('claude', [
  '-p', prompt,
  '--output-format', 'json',
  '--model', resolvedModel,
  '--allowedTools', tools.join(','),
  '--max-turns', '10',
], { cwd: workDir, stdio: ['pipe', 'pipe', 'pipe'] })
```
- `--output-format json` returns `{ result, session_id, cost_usd }` 
- `--model` accepts aliases (sonnet, opus, haiku) or full IDs
- `--append-system-prompt-file` can load agent markdown
- `--max-turns` and `--max-budget-usd` for safety limits
- Use `spawn` with buffered stdout collection, parse JSON after process exits

## Edge Transforms in TypeScript
Reimplement `select`, `filter`, `drop`, `compact`, `truncate` as pure functions on JS objects (~50 lines). Eliminates jq dependency. The `hooks.ts` jq generation remains for compile-only mode.

## Graph Walker Pattern
Recursive async function over `FlowNode[]`:
- `node` → spawn claude, await result
- `parallel` → `Promise.all(branches.map(...))`  
- `foreach` → sequential iteration with binding substitution
Matches AST structure directly.

## Session Directory
Use `.graft/session/` with `node_outputs/{name}.json` after each node. Matches existing scaffold in `codegen.ts`.

## Input Validation
Simple runtime type checks against `ContextDecl.fields`. Validate field presence and primitive types. No schema library needed.

## Dry-run Mode
Skip `spawn`, print execution plan: node order, model, budget, input/output schemas. Reuse `TokenReport` data.

## Warnings
- **Windows**: `spawn('claude', ...)` may need `shell: true` or explicit `.cmd` extension
- **stdin**: Must close stdin after writing or use `{ input }` with `execFile`
- **Token budgets**: Claude CLI uses dollar-based limits, Graft uses token-based. Approximate or rely on estimates
- **stderr**: Claude CLI errors go to stderr. Capture and surface in `GraftError` format
- **Large foreach**: `maxIterations` caps loops, but each iteration spawns a process. Consider concurrency limit

## Key Files
- `src/compiler.ts` — `CompileResult` interface, `compile()` function
- `src/parser/ast.ts` — `FlowNode` union, `NodeDecl`, `Transform`
- `src/codegen/hooks.ts` — `transformsToJq()` shows transform logic to reimplement
- `src/codegen/agents.ts` — `MODEL_MAP`, `TOOL_MAP`, `generateAgent()`
- `src/index.ts` — CLI pattern to follow for `run` subcommand
