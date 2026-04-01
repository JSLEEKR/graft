# A2-Pragmatist Independent Analysis — v1.2

## Convergence Score: 7

## Core Principles
- One new file: src/runner.ts (~250 lines) contains ALL execution logic
- Zero new dependencies
- No classes, just async functions
- Deferred: retry/fallback strategies, conditional edge routing
- MODEL_MAP duplicated (3 lines) rather than refactoring existing modules

## File Structure (minimal)
```
src/runner.ts          ← NEW: ~250 lines, all execution logic
src/index.ts           ← MODIFIED: add `run` subcommand
tests/runner.test.ts   ← NEW: mock-based tests
```

## Key Functions
- run(source, options): Promise<RunResult> — main entry
- walkFlow() — recursive FlowNode[] walker
- executeNode() — spawn claude or dry-run mock
- spawnClaude() — subprocess wrapper with shell:true on Windows
- applyTransform() — pure transform functions inline
- buildPrompt() — constructs prompt from node reads + schema

## What's Cut (YAGNI)
- Executor class → plain functions
- Separate types file → interfaces inline in runner.ts
- EventEmitter/progress callbacks → console.log
- Retry/fallback strategies → abort-on-failure for MVP
- Input validation against schema → Claude handles malformed input
- Conditional edge routing → not needed yet

## What's Kept
- Edge transforms (critical for data passing)
- Dry-run mode (essential for testing without spending money)
- foreach (in AST, users expect it)
- parallel (trivial with Promise.all)
- Exported applyTransform/evalCondition for testing

## Potential Issues
1. Windows spawn needs shell:true — handled
2. Claude CLI JSON output may need double-parse (result is string)
3. Large foreach with no concurrency limit
4. Edge transform after parallel: prevNodeName is null, next node must use reads
5. stdin must be closed or claude hangs
