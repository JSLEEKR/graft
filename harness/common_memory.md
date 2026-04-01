# Common Memory — Graft Compiler v1
## Last updated: v2.0-R5 completed (v2.0 DONE)

## Ratchet-Locked Decisions (92 total)

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

### v2.0-R1 Ratchets (Lexer + AST + Parser)
- [v2.0-R01] 5 new keywords: Import, From, Memory, Writes, Storage — LOCKED
- [v2.0-R02] writes: string[] required on NodeDecl, defaults to [] — LOCKED
- [v2.0-R03] Flag-based import ordering (seenNonImport) inside existing switch — LOCKED
- [v2.0-R04] storage param optional, defaults to 'file'; file parsed as identifier — LOCKED
- [v2.0-R05] ImportDecl.resolvedPath?: string, set by resolver, undefined after parse — LOCKED
- [v2.0-R06] No trailing commas in import lists — LOCKED
- [v2.0-R07] Program field order: imports, memories, contexts, nodes, edges, graphs — LOCKED
- [v2.0-R08] Duplicate writes clause detection via hasWrites boolean guard — LOCKED
- [v2.0-R09] Empty import list and empty import path produce parser errors — LOCKED
- [v2.0-R10] max_tokens > 0 validation deferred to analyzer, not parser — LOCKED

### v2.0-R2 Ratchets (Import Resolver)
- [v2.0-R11] ExportableNames snapshot extracted BEFORE recursion into target imports — LOCKED
- [v2.0-R12] resolve() is pure function; FileReader injection via parameter — LOCKED
- [v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded — LOCKED
- [v2.0-R14] DFS ancestor set (add/delete) for circular detection — LOCKED
- [v2.0-R15] Error accumulation, never throw for recoverable import errors — LOCKED
- [v2.0-R16] No auto-extension, no Levenshtein, no normalizePath — LOCKED
- [v2.0-R17] Import path must end with .gft — LOCKED
- [v2.0-R18] Targeted graph/memory rejection deferred; generic "not found" sufficient — LOCKED

### v2.0-R3 Ratchets (Analyzer Updates)
- [v2.0-R19] Memory-vs-context and memory-vs-produces name collisions detected by ScopeChecker — LOCKED
- [v2.0-R20] checkNodeWrites validates writes entries against declared memories — LOCKED
- [v2.0-R21] Memory in reads treated as valid source with field validation — LOCKED
- [v2.0-R22] TokenEstimator includes memory.maxTokens (0.3 partial factor) — LOCKED
- [v2.0-R23] TypeChecker unchanged for v2.0 (writes schema check deferred) — LOCKED

### v2.0-R4 Ratchets (CodeGen + Runtime Memory)
- [v2.0-R24] generateAgent gets memoryNames with default param for backward compat — LOCKED
- [v2.0-R25] formatReads distinguishes memory (`.graft/memory/`) from session — LOCKED
- [v2.0-R26] Memory writes use field-matching merge (schema-aware, preserves unrelated fields) — LOCKED
- [v2.0-R27] Always reload memory from disk in executeNode (no outputs.has() guard) — LOCKED
- [v2.0-R28] Dry run skips memory saves — LOCKED
- [v2.0-R29] loadMemory returns null on missing/corrupt file (try-catch) — LOCKED
- [v2.0-R30] Memory scaffold: conditional .gitkeep (no per-file scaffolding) — LOCKED
- [v2.0-R31] cleanSession and buildContextSection unchanged (memory in separate dir tree) — LOCKED

### v2.0-R5 Ratchets (Integration Tests + Examples)
- [v2.0-R32] examples/shared.gft is a library (no graph) — LOCKED
- [v2.0-R33] examples/chatbot.gft uses import + memory + writes — LOCKED
- [v2.0-R34] Integration tests use temp files for import tests — LOCKED

## Review Feedback
- T1-T7: ALL PASS. Test progression: 5 → 31 → 31 → 64 → 78 → 101 → 110
- v1.2: PASS. 171 tests (135 existing + 36 new). All 12 ratchet items compliant.
- v2.0-R1: PASS. 194 tests (171 existing + 23 new). All 10 ratchet items compliant.
- v2.0-R2: PASS. 214 tests (194 existing + 20 new). All 8 ratchet items compliant. Implementer deviation (entryFile guard) accepted as bugfix.
- v2.0-R3: PASS. 224 tests (214 existing + 10 new). All 5 ratchet items compliant. Zero deviations.
- v2.0-R4: PASS. 241 tests (224 existing + 17 new). All 8 ratchet items compliant. Zero deviations.
- v2.0-R5: PASS. 249 tests (241 existing + 8 new). All 3 ratchet items compliant. Zero deviations.

## Recurring Patterns
- A3-Skeptic: critical bugs every task (T2-T7 consecutively)
- v1.2: A3 caught stdin.end() showstopper, Promise.allSettled requirement, generateAgent() reuse problem
- v2.0-R1: A3 caught duplicate writes silent overwrite, empty import list, empty path validation
- v2.0-R2: A3 caught entry-file parse error gap; A1's ExportableNames approach was only correct one
- A1-Architect as forced dissenter self-rebutted pre-loop approach, adopted flag-based ordering
- A2-Pragmatist as forced dissenter self-rebutted (v2.0-R2): "YAGNI applies to features, not correctness mechanisms"
- A4-Specialist as forced dissenter self-retracted 3 of 4 positions (effective mechanism)
- Plan's test helpers consistently have stale signatures (T5, T6, T7)
- Convergence agents write code directly from T3 onwards
- YAGNI wins but A3's "silent failure" bugs are always worth fixing
- Forced dissenter mechanism continues to work across rounds
- Transitive re-export bug: 2 of 4 agents (A2, A4) had it in Step 1, caught by cross-critique
- v2.0-R3: A1 forced dissenter reversed own position — "collision detection is correctness, not a feature"
- v2.0-R4: A3 found foreach memory staleness bug (all 3 others missed); A2 forced dissenter self-rebutted all 3 positions (shallow merge, buildContextSection load, empty scaffold)

## Notes for Future
- Conditional edge routing: deferred to v1.3
- Full failure strategies (retry/fallback/skip): deferred, code structured for future addition
- Token budget enforcement (Graft tokens vs Claude CLI dollars): approximation only
- fieldsToJsonExample duplicated from agents.ts; consider extracting if agents.ts exports it
- Memory importability: deferred (v2.0-R13 locked as excluded)
- entryFile guard in resolver: scopes name merging to entry file only (justified deviation from convergence spec)
- All 249 tests currently passing
- v2.0 complete: import system + memory across all pipeline stages (lexer → parser → resolver → analyzer → codegen → runtime → integration)
