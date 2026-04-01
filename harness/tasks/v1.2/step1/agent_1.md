# A1-Architect Independent Analysis — v1.2

## Convergence Score: 7

## Proposed File Structure
```
src/
  models.ts           # Extracted MODEL_MAP (shared by agents.ts, settings.ts, executor.ts)
  runner.ts           # Top-level run() function: compile + validate + execute
  runtime/
    executor.ts       # FlowNode[] walker, orchestrates node execution
    transforms.ts     # Pure functions: select, filter, drop, compact, truncate
    spawner.ts        # Spawner interface + ClaudeSpawner + DryRunSpawner
    validate.ts       # Input JSON validation against ContextDecl schema
    types.ts          # Runtime types: NodeResult, RunResult, RunOptions, etc.
```

## Key Design Decisions
1. Walk FlowNode[] from compiled AST directly, never parse generated markdown
2. 4 runtime modules with clear dependency direction: runner -> executor -> spawner, executor -> transforms
3. Extract MODEL_MAP into shared src/models.ts (currently duplicated in agents.ts and settings.ts)
4. Edge transforms as pure TypeScript functions (no jq dependency)
5. Spawner is an interface enabling dry-run and testing via mock
6. Input validation against ContextDecl.fields before any node execution

## Key Interfaces
- `Spawner` interface with `ClaudeSpawner` and `DryRunSpawner` implementations
- `RunOptions`: sourceFile, inputFile, workDir, dryRun, verbose
- `RunResult`: success, graph, nodeResults[], totalCostUsd, totalTokensIn/Out, totalDurationMs, errors
- `NodeResult`: node, output, costUsd, tokensIn, tokensOut, durationMs

## Implementation Highlights
- Executor class with nodeMap/edgeMap for O(1) lookups
- executeFlow() walks FlowNode[] with switch on kind
- executeWithFailureStrategy() handles retry/fallback/skip/abort
- buildNodeInput() resolves reads from contexts and upstream outputs
- applyEdgeTransforms() writes transformed outputs to session dir
- Windows spawn handled with `shell: process.platform === 'win32'`

## Trade-offs
- Spawner interface enables testing but adds indirection
- File-based data passing has I/O overhead (acceptable for LLM-speed operations)
- No streaming: stdout fully buffered before JSON parsing
- Prompt construction is basic (JSON dump), YAGNI for v1.2
- Truncate approximation (1 token ~ 4 chars)

## Potential Issues
1. Windows spawn needs shell:true
2. Claude CLI JSON output format may vary across versions
3. foreach with large maxIterations spawns many sequential processes
4. Conditional edges not handled in executor (defer to v1.3)
5. models.ts extraction changes import paths in agents.ts and settings.ts
