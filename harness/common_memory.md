# Common Memory — Graft Compiler
## Last updated: v2.2-R1 completed

## Ratchet-Locked Decisions (112 total, 2 unlocked)

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

### v2.1-R1 Ratchets (Cleanup and Refactoring)
- [T6] MODEL_MAP duplicated — UNLOCKED (extracted to src/constants.ts)
- [v1.2-R06] MODEL_MAP duplicated in executor.ts — UNLOCKED (extracted to src/constants.ts)
- [v2.1-R01] MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD in src/constants.ts — single source of truth — LOCKED
- [v2.1-R02] fieldsToJsonExample and typeToExample in src/utils.ts — single source of truth — LOCKED
- [v2.1-R03] loadMemory and saveMemory as standalone functions in src/runtime/memory.ts — LOCKED
- [v2.1-R04] saveMemory always saves; dryRun guard is caller's responsibility — LOCKED
- [v2.1-R05] PARTIAL_FIELD_FACTOR applies to all per-field fraction estimates (partial reads AND select transforms) — LOCKED
- [v2.1-R06] TOOL_MAP stays in src/codegen/agents.ts (not extracted) — LOCKED

### v2.1-R2 Ratchets (Correctness Fixes)
- [v2.1-R07] Writes schema overlap: warning in TypeChecker, not error — LOCKED
- [v2.1-R08] max_tokens > 0 validation in ScopeChecker for both ContextDecl and MemoryDecl — LOCKED
- [v2.1-R09] Parallel memory write detection via nodeWritesMap in ScopeChecker.walkFlowNodes — LOCKED
- [v2.1-R10] compiler.ts filters diagnostics by severity; warnings don't block compilation — LOCKED

### v2.1-R3 Ratchets (Token Tracking Core)
- [v2.1-R11] TokenUsage and parseCLIOutput in subprocess.ts with heuristic envelope detection — LOCKED
- [v2.1-R12] TokenTracker as standalone class in src/runtime/token-tracker.ts — LOCKED
- [v2.1-R13] Token log cleared on session start, appended per node — LOCKED
- [v2.1-R14] RunResult.tokenUsage with budget/consumed/fraction/perNode — LOCKED
- [v2.1-R15] Budget enforcement advisory only; no hard abort — LOCKED
- [v2.1-R16] Estimates from nodeDecl.budgetIn/budgetOut, not TokenEstimator — LOCKED
- [v2.1-R17] Switch from --print to --output-format json in executor — LOCKED

### v2.2-R1 Ratchets (Tech Debt)
- [v2.2-R01] resolve() accepts Program, not source string — LOCKED
- [v2.2-R02] VERSION from package.json via createRequire with try-catch fallback — LOCKED
- [v2.2-R03] ProgramIndex: 5 maps (contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap) — LOCKED
- [v2.2-R04] ProgramIndex: no getter methods, direct map access — LOCKED
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex (zero .find() calls) — LOCKED

## Review Feedback
- T1-T7: ALL PASS. Test progression: 5 → 31 → 31 → 64 → 78 → 101 → 110
- v1.2: PASS. 171 tests (135 existing + 36 new). All 12 ratchet items compliant.
- v2.0-R1: PASS. 194 tests (171 existing + 23 new). All 10 ratchet items compliant.
- v2.0-R2: PASS. 214 tests (194 existing + 20 new). All 8 ratchet items compliant. Implementer deviation (entryFile guard) accepted as bugfix.
- v2.0-R3: PASS. 224 tests (214 existing + 10 new). All 5 ratchet items compliant. Zero deviations.
- v2.0-R4: PASS. 241 tests (224 existing + 17 new). All 8 ratchet items compliant. Zero deviations.
- v2.0-R5: PASS. 249 tests (241 existing + 8 new). All 3 ratchet items compliant. Zero deviations.
- v2.1-R1: PASS. 249 tests (0 new — pure refactoring). 6 new ratchet items, 2 unlocked. Zero deviations. MEDIUM tier (2 agents).
- v2.1-R2: PASS. 263 tests (249 existing + 14 new). 4 new ratchet items. Zero deviations. MEDIUM tier (2 agents).
- v2.1-R3: PASS. 282 tests (263 existing + 19 new). 7 new ratchet items. Zero deviations. HIGH tier (4 agents, cross-critique skipped).
- v2.1-R4: PASS. 288 tests (282 existing + 6 new). 0 new ratchet items. Integration tests only. Debate skipped (no design decisions).
- v2.2-R1: PASS. 296 tests (288 existing - 1 removed + 3 version + 6 program-index). 5 new ratchet items. Zero deviations. MEDIUM tier (2 agents).

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
- v2.1-R1: MEDIUM tier effective for mechanical refactoring (2 agents, 6 total calls vs 14). A3's 0.3 semantic trap warning (line 195) overruled by convergence — same concept applies.
- v2.1-R2: Both A3 and A4 independently found compiler.ts warning routing bug (critical prerequisite). A3 scored 7/10, A4 scored 8/10 — high consensus.
- v2.1-R3: A3 found CLI format uncertainty (usage field may not exist). A2 found mock spawner backward-compat issue with result key collision. Both resolved in convergence. Cross-critique skipped due to high consensus (6-8 range).
- v2.2-R1: Cross-critique skipped (score range 8-7 = 1, below R-PROC-01 threshold of 2). A3 found spec missing producesNodeMap and codegen .find() calls. Both adopted in convergence.

## Debate ROI
- v2.1-R1 (MEDIUM): 6 agent calls, 0 bugs found, 0 design changes. Appropriate for mechanical refactoring.
- v2.1-R2 (MEDIUM): 6 agent calls, 1 critical bug found (compiler.ts warning routing), 0 design changes. Both agents caught the same bug independently.
- v2.1-R3 (HIGH, reduced): 7 agent calls (skipped 4 cross-critique), 2 design issues found (CLI format uncertainty, mock compat), 1 design change (heuristic envelope detection). Skipping cross-critique when consensus is high saves 4 calls with no quality loss.
- v2.1-R4 (MEDIUM, reduced): 2 agent calls (debate skipped — pure integration testing). No design decisions needed for test-only rounds.
- v2.2-R1 (MEDIUM): 5 agent calls (2 analysis + 1 convergence + 1 impl + 1 review). 0 bugs, 2 spec corrections (producesNodeMap, codegen migration). Score-gated cross-critique working as designed.

## Notes for Future
- Conditional edge routing: deferred to v1.3
- Full failure strategies (retry/fallback/skip): deferred, code structured for future addition
- Token budget enforcement (Graft tokens vs Claude CLI dollars): approximation only
- Memory importability: deferred (v2.0-R13 locked as excluded)
- entryFile guard in resolver: scopes name merging to entry file only (justified deviation from convergence spec)
- All 296 tests currently passing
- v2.0 complete: import system + memory across all pipeline stages (lexer → parser → resolver → analyzer → codegen → runtime → integration)
- v2.1-R1 complete: constants/utils/memory extracted to shared modules, MODEL_MAP deduplication resolved
- v2.1-R2 complete: writes schema validation, max_tokens > 0, parallel write detection, compiler.ts warning routing
- v2.1-R3 complete: token tracking (TokenUsage, TokenTracker, parseCLIOutput, token log, RunResult extension, budget advisory)
- v2.1-R4 complete: integration tests for multi-node, parallel, dry-run, log format, budget thresholds, examples
- Token budget enforcement is advisory only (v2.1-R15); hard abort deferred to future version
- v2.1 complete: cleanup + correctness + token tracking across all runtime stages
- v2.1 process improvement: MEDIUM tier, skipped Step 0, reduced cross-critique for high-consensus rounds — 21 agent calls total (vs 36 budgeted, 42% reduction)
- v2.2-R1 complete: double-parse eliminated, VERSION from package.json, ProgramIndex utility (5 maps), .find() calls eliminated from scope/estimator/executor/codegen
