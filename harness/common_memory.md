# Common Memory — Graft Compiler v1
## Last updated: v1.2 completed

## Ratchet-Locked Decisions (58 total)

### T1-T6 (abbreviated — all LOCKED)
T1: tsc-only, ESM, NodeNext, explicit vitest, shebang, strict, no barrels, .js extensions
T2: GraftError extends Error, throw-on-first, separate tokens/lexer, diagnostics leaf, float guard, ASCII errors
T3: single ast.ts, SourceLocation import, interfaces+unions, narrowed names, mutable, no visitor
T4: Parser(Token[]), expectIdentifierOrKeyword, parseProduces consumes keyword, done required, LL(1)+LL(2)
T5: error accumulation, estimator.ts, graph input/output in ScopeChecker, per-node warning, 3-class
T6: estimator.js import, toLocaleString('en-US'), MODEL_MAP duplicated, bash hooks Windows deferred

### T7 Ratchets
- [T7-R01] compiler.ts import from ./analyzer/estimator.js — LOCKED
- [T7-R02] Parser constructor: new Parser(tokens) only — LOCKED
- [T7-R03] compile() catches GraftError from lexer/parser, accumulates from analyzer — LOCKED
- [T7-R04] CLI: toLocaleString('en-US') for all number formatting — LOCKED
- [T7-R05] Graph-existence guard: program.graphs.length === 0 → error — LOCKED
- [T7-R06] writeFiles wrapped in try-catch in CLI — LOCKED

### v1.2 Ratchets
- [v1.2-R01] Walk FlowNode[] from AST, never parse markdown — LOCKED
- [v1.2-R02] Do NOT reuse generateAgent(); separate runtime prompt builder — LOCKED
- [v1.2-R03] Promise.allSettled for parallel execution — LOCKED
- [v1.2-R04] Edge transforms as pure TS functions, no jq dependency — LOCKED
- [v1.2-R05] File-based data passing via .graft/session/node_outputs/ — LOCKED
- [v1.2-R06] MODEL_MAP duplicated in executor.ts (T6 ratchet) — LOCKED
- [v1.2-R07] Abort-on-failure MVP; retry/fallback/skip deferred — LOCKED
- [v1.2-R08] SpawnerFn function type for mock injection — LOCKED
- [v1.2-R09] stdin.end() immediately after spawn — LOCKED
- [v1.2-R10] Session cleanup before run (preserve .gitkeep) — LOCKED
- [v1.2-R11] nodeMap from Program.nodes (not FlowNode[]) — LOCKED
- [v1.2-R12] Windows: shell: process.platform === 'win32' — LOCKED

## Review Feedback
- T1-T7: ALL PASS. Test progression: 5 → 31 → 31 → 64 → 78 → 101 → 110
- v1.2: PASS. 171 tests (135 existing + 36 new). All 12 ratchet items compliant.

## Recurring Patterns
- A3-Skeptic: critical bugs every task (T2-T7 consecutively)
- v1.2: A3 caught stdin.end() showstopper, Promise.allSettled requirement, generateAgent() reuse problem
- A4-Specialist as forced dissenter self-retracted 3 of 4 positions (effective mechanism)
- Plan's test helpers consistently have stale signatures (T5, T6, T7)
- Convergence agents write code directly from T3 onwards
- YAGNI wins but A3's "silent failure" bugs are always worth fixing

## Notes for Future
- Conditional edge routing: deferred to v1.3
- Full failure strategies (retry/fallback/skip): deferred, code structured for future addition
- Token budget enforcement (Graft tokens vs Claude CLI dollars): approximation only
- fieldsToJsonExample duplicated from agents.ts; consider extracting if agents.ts exports it
- All 171 tests currently passing
