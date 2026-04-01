# Convergence Report — v3.0-R1: Pipeline Split + ProgramIndex Threading

## Summary
Split compile() into compileToProgram() (lex→parse→resolve→analyze) and compileAndGenerate() (+ codegen). compile() becomes thin alias. GRAPH_MISSING moves to compileAndGenerate() only. ProgramIndex constructed once after resolve, threaded via optional index? params with fallback. RuntimeState in prompt-builder.ts.

## Rulings
- GRAPH_MISSING: A3 wins — move to compileAndGenerate() only
- RuntimeState location: A2 wins — in prompt-builder.ts, no new file
- TypeChecker: NOT touched (ratchet v2.2-R05 LOCKED)

## Ratchet Items
- [v3.0-R01] compileToProgram() does NOT check GRAPH_MISSING — LOCKED
- [v3.0-R02] ProgramIndex optional param with ?? fallback pattern — LOCKED
- [v3.0-R03] RuntimeState in prompt-builder.ts, not new file — LOCKED

## Files to change
1. src/compiler.ts — full rewrite
2. src/analyzer/scope.ts — constructor (program, index?)
3. src/analyzer/estimator.ts — constructor (program, index?)
4. src/runtime/executor.ts — constructor (program, options, index?)
5. src/runtime/prompt-builder.ts — add RuntimeState, PromptContext extends it
6. src/runtime/flow-runner.ts — FlowContext extends RuntimeState
7. src/lsp/server.ts — use compileToProgram, drop GRAPH_MISSING filter
8. tests/pipeline.test.ts — new, 8 tests

## Test targets: 384 total (376 existing + 8 new)
