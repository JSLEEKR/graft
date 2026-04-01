# Convergence Report — v1.2: `graft run` Execution Engine

## Summary
Tree-walking interpreter over FlowNode[] from compiled AST. 4 source files: runner.ts entry point + 3 modules in src/runtime/ (executor, transforms, subprocess). Abort-on-failure MVP. Promise.allSettled for parallel. SpawnerFn for mock injection. Session cleanup. Do NOT reuse generateAgent().

## Forced Dissent Rulings
- generateAgent() reuse: REJECTED (A4 self-retracted)
- Full failure strategies: REJECTED (abort-only MVP)
- ExecutionContext class: REJECTED (plain fields)
- Missed stdin.end(): ACCEPTED (A3 caught)

## Ratchet-Locked Items (12)
- [v1.2-R01] Walk FlowNode[] from AST, never parse markdown — LOCKED
- [v1.2-R02] Do NOT reuse generateAgent(); separate runtime prompt — LOCKED
- [v1.2-R03] Promise.allSettled for parallel — LOCKED
- [v1.2-R04] Edge transforms as pure TS functions, no jq — LOCKED
- [v1.2-R05] File-based data passing via .graft/session/ — LOCKED
- [v1.2-R06] MODEL_MAP duplicated (T6 ratchet) — LOCKED
- [v1.2-R07] Abort-on-failure MVP; retry/fallback deferred — LOCKED
- [v1.2-R08] SpawnerFn function type for mock injection — LOCKED
- [v1.2-R09] stdin.end() immediately after spawn — LOCKED
- [v1.2-R10] Session cleanup before run (preserve .gitkeep) — LOCKED
- [v1.2-R11] nodeMap from Program.nodes (not FlowNode[]) — LOCKED
- [v1.2-R12] Windows: shell: process.platform === 'win32' — LOCKED

## Files to Create/Modify
1. CREATE: src/runtime/transforms.ts — pure edge transform functions
2. CREATE: src/runtime/subprocess.ts — Claude CLI subprocess wrapper
3. CREATE: src/runtime/executor.ts — DAG walker, prompt builder, types
4. CREATE: src/runner.ts — top-level run() entry
5. MODIFY: src/index.ts — add run subcommand
6. CREATE: tests/runner.test.ts — tests

## Deferred
- Conditional edge routing → v1.3
- Full failure strategies → future
- Token budget enforcement (tokens vs dollars) → approximation only
- foreach concurrency limit → sequential only
