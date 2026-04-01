# A4-Specialist Independent Analysis — v1.2

## Convergence Score: 8

## Domain Analysis
- This is a **tree-walking interpreter** over the FlowNode[] schedule
- Program AST serves as IR between compiler and runtime (like LLVM IR)
- FlowNode[] is already topologically sorted by parser — runtime just executes the schedule
- Edge transforms are inter-procedural data transformations (pure dataflow pipeline)
- FailureStrategy maps to structured exception handling

## Architecture
```
src/runtime/
  executor.ts      — DAG walker, main execution loop (tree-walking interpreter)
  transforms.ts    — Pure transform functions
  subprocess.ts    — Claude CLI process spawning + output collection
  types.ts         — Runtime types
```

## Key Design: Compile-Execute Separation
- Runtime reads Program AST directly — NOT generated markdown
- Codegen artifacts remain for "manual Claude Code mode"
- graft run is the automated path
- Same IR, multiple backends (standard compiler architecture)

## Implementation Highlights
- Executor class with ExecutionContext for state threading
- gatherNodeInput() resolves reads from contexts and upstream outputs, checks for transformed versions
- buildPrompt() reuses generateAgent() from codegen + appends actual input data
- executeWithFailureStrategy() implements full retry/fallback/skip/abort
- applyOutgoingTransforms() writes transformed output to session files
- validateInput() against ContextDecl with primitive type checking
- Dynamic import of executor in CLI to keep compile-only path lightweight

## Transforms Implementation
- select: pick specified fields
- filter: filter array items by condition
- drop: remove field
- compact: remove nulls, empty strings, empty arrays (recursive)
- truncate: approximate 1 token ~ 4 chars, proportional string truncation
- Transforms are composable, not commutative (pipeline order matters)

## Trade-offs
- Tree-walking interpreter: no optimization, but negligible vs LLM latency
- generateAgent() reuse: couples runtime to codegen, but avoids drift
- File-based session: disk I/O overhead, but gives crash recovery + debuggability
- Mock outputs in dry-run: downstream nodes get fake data, sufficient for plan validation

## Graft-Specific Considerations
- Token-bounded types: truncate enforces at data-passing layer, output validation is best-effort
- Pipe transforms execute left-to-right matching | syntax
- Conditional edges stored in edgeMap but runtime evaluation deferred
- k-suffix values already resolved by parser to raw numbers
