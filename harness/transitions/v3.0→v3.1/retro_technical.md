# Retro-Technical: v3.0 Codebase Evaluation

## 1. Tech Debt Introduced or Deferred

### TD-01: Executor duplicates ProgramIndex state
`src/runtime/executor.ts:74-76` — Executor copies `this.nodeMap = this.index.nodeMap` and `this.edgeMap = this.index.edgesBySource` into own fields, then uses both interchangeably. This creates a confusing dual-access pattern where the same data is reachable via `this.nodeMap` and `this.index.nodeMap`. Should use `this.index.*` exclusively.

### TD-02: ScopeChecker duplicates ProgramIndex state
`src/analyzer/scope.ts:8-10` — ScopeChecker maintains its own `contextNames`, `nodeNames`, `memoryNames` Sets that duplicate data already available in ProgramIndex maps. These should derive from `this.index.contextMap.has()` etc.

### TD-03: CLI output formatting duplicated across compile/check commands
`src/index.ts:47-70` and `src/index.ts:90-107` — The compile and check commands have nearly identical token report printing logic. Should be extracted to a shared `formatTokenReport()` function.

### TD-04: Parallel branches skip failure strategies
`src/runtime/flow-runner.ts:81-84` — Parallel execution uses raw `ctx.executeNode()`, bypassing `executeWithFailureStrategy()`. If a node in a parallel block has `on_failure: retry(3)`, it is silently ignored.

### TD-05: Foreach nesting restriction is a parser-enforced v1.1 limitation
`src/parser/parser.ts:619-623` — The error message says "not supported in v1.1" but we are at v3.0. Either lift the restriction or update the error message.

### TD-06: Condition type compatibility TODO still open
`src/analyzer/types.ts:54` — `// TODO: condition type compatibility -- e.g., >= on String fields (v2)`. This has been deferred since v1.0. Conditions like `severity >= "medium"` would pass type checking without validation.

### TD-07: Conditional edge token estimation TODO
`src/analyzer/estimator.ts:38` — `// TODO: store conditional edge branches for token estimation (v2)`. Conditional edges contribute zero to token estimates, which means budget warnings undercount for programs using conditional routing.

## 2. Patterns That Should Be Formalized

### P-01: Optional ProgramIndex with fallback construction
ScopeChecker, TypeChecker, TokenEstimator, Executor, and `generate()` all accept `index?: ProgramIndex` with `?? new ProgramIndex(program)` fallback. This pattern is consistent but creates a risk: if any caller forgets to pass the index, a redundant ProgramIndex is silently constructed. Consider making it required on all analyzer/runtime constructors (only optional on public API boundaries).

### P-02: Field map lookup pattern
`this.index.producesFieldsMap.get(name)` is used across ScopeChecker, TypeChecker, and TokenEstimator with identical null-guard patterns. This works but the dual-keying strategy (by node name AND produces name) in ProgramIndex:50-52 is undocumented and potentially confusing.

### P-03: Error accumulation vs throw
Parser and lexer throw on first error. Analyzer accumulates errors. Resolver accumulates errors. This is deliberate (ratchet v2.2-R10, now unlocked) but the parser could benefit from error recovery for LSP scenarios where partial ASTs would improve the editing experience.

## 3. Ratchet Decisions to Revisit

### R-01: Single graph execution (v1.0 assumption)
The codebase assumes `program.graphs[0]` everywhere: `executor.ts:98`, `estimator.ts:42`, `codegen.ts` (implicit). The multi-graph warning (GRAPH_MULTIPLE) exists but there is no mechanism to select which graph to run. As pipelines grow, graph selection will be needed.

### R-02: Memory storage is file-only (v2.0-R04)
`MemoryDecl.storage` is typed as `'file'` literal. The parser rejects anything other than `'file'`. If other storage backends (SQLite, Redis) are on the roadmap, the type system and parser will need updates.

### R-03: `done` as a magic string in flow
`flow-runner.ts:74` and `flow-runner.ts:83` filter out `done` by string comparison. The `done` token is not represented in the AST as a distinct flow node kind. This is fragile: a user declaring a node named `done` would silently be skipped in execution.

### R-04: ClaudeCodeBackend as module-level singleton
`src/codegen/codegen.ts:14` — `const defaultBackend = new ClaudeCodeBackend()`. This is fine now but would break if backends ever need configuration or state.

## 4. Edge Cases and Failure Modes

### E-01: Race condition in parallel memory writes (runtime)
`SCOPE_PARALLEL_WRITES` is a warning, not an error. If two parallel nodes write to the same memory, `saveMemory` does read-modify-write (`loadMemory` then `writeFileSync`) without locking. Last writer wins, potentially losing data.

### E-02: Foreach source can be graph input, but not validated
`flow-runner.ts:108` — `ctx.outputs.get(flowNode.source) ?? ctx.input`. The fallback to `ctx.input` happens silently if the source node name happens to not be in outputs. ScopeChecker validates the source exists as a node, but doesn't handle the case where the source node failed (output missing at runtime).

### E-03: LSP import dependency tracking is one-level only
`src/lsp/server.ts:44-55` — When file A imports file B and file B imports file C, changing file C will re-validate B (if B is open) but won't re-validate A. The invalidation at line 71-77 only checks direct dependents.

### E-04: `storeOutput` writes transformed files only for direct edges
`executor.ts:333` — `edge.target.kind === 'direct'` guard means conditional edge transforms never produce intermediate files. Combined with the fact that transforms on conditional edges already produce a warning (SCOPE_TRANSFORM_CONDITIONAL), this is internally consistent but the transform files won't exist if someone ignores the warning.

### E-05: No validation of `on_failure: fallback(X)` for circular fallback
A node can declare `on_failure: fallback(self)` or mutual fallback cycles (A falls back to B, B falls back to A). ScopeChecker validates the fallback node exists but doesn't detect cycles.

## 5. Performance and Quality Issues

### Q-01: ProgramIndex constructed up to 3 times per compilation
In `compileToProgram`, ProgramIndex is built once at line 70. But if any caller of ScopeChecker/TypeChecker/TokenEstimator omits the index parameter, a redundant one is built. This is O(n) per construction where n is the number of declarations. Not a problem for small programs but worth preventing.

### Q-02: LSP recompiles entire file on every change (after debounce)
`src/lsp/server.ts:62-79` — Full `compileToProgram()` on every edit. For large `.gft` files, this includes lexing, parsing, resolving imports (file I/O), and running all analyzers. Incremental parsing would improve responsiveness.

### Q-03: Memory files read on every node execution
`executor.ts:192-199` — For nodes that read memory, the file is loaded from disk on every execution, even within a foreach loop. If the memory file is large and unchanged, this is wasteful I/O.

### Q-04: 32 source files, 27 test files, 477 tests
Test-to-source ratio is healthy (14.9 tests per source file). Coverage is broad across all pipeline stages. The test file naming is inconsistent: `v30-r2.test.ts` through `v30-r8.test.ts` exist alongside `pipeline.test.ts` and `v22-integration.test.ts`. Consider consolidating version-specific test files into feature-area test files in future versions.

## 6. Extension Points Needed

### X-01: Backend registry for `--backend` flag
`src/index.ts:8` — `KNOWN_BACKENDS` is a hardcoded Set. `src/codegen/codegen.ts:14` — defaultBackend is a hardcoded singleton. Adding a new backend requires editing both files. A backend registry (map from name to factory) in one location would make this extensible.

### X-02: Plugin/hook system for runtime events
The Executor has no event system. Users cannot observe node start/end, memory writes, or errors programmatically. A minimal event emitter (or callback interface) on Executor would enable monitoring, logging, and custom dashboards.

### X-03: Source map or AST position tracking for runtime errors
Runtime errors from `executeNode` contain only the node name and error string. There is no connection back to the source `.gft` file position. For debugging failed pipelines, mapping runtime errors back to source locations would be valuable.

### X-04: Multi-file program support beyond imports
Currently only `import` pulls in external definitions. There is no concept of a "workspace" or "project" that combines multiple `.gft` files with shared configuration. The LSP tracks open documents independently.

### X-05: Programmatic API surface
`src/compiler.ts` exports `compileToProgram`, `compileAndGenerate`, `compile`, `compileAndWrite`. The runtime is accessed only through `src/runner.ts`. There is no way to construct an Executor with a pre-compiled Program from the public API without importing from `src/runtime/executor.js` directly. The `exports` field in `package.json` only exposes `./` and `./ast`.

---

**Summary**: v3.0 is architecturally clean with strong test coverage. The main technical risks are: parallel execution bypassing failure strategies (TD-04), race conditions in parallel memory writes (E-01), and accumulating version-specific test files that will become hard to navigate. The highest-value improvements for v3.1 would be fixing TD-04 (parallel + failure strategies), adding a backend registry (X-01), and exposing a programmatic API (X-05).
