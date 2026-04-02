# Archived Ratchets — T1 through v2.2 (all LOCKED unless noted)

Archived from common_memory.md in v4.4. These ratchets are stable and rarely referenced.

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
- [T7-R05] Graph-existence guard: program.graphs.length === 0 -> error — LOCKED
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

### v2.0 Ratchets (34 items)
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
- [v2.0-R11] ExportableNames snapshot extracted BEFORE recursion into target imports — LOCKED
- [v2.0-R12] resolve() is pure function; FileReader injection via parameter — LOCKED
- [v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded — LOCKED
- [v2.0-R14] DFS ancestor set (add/delete) for circular detection — LOCKED
- [v2.0-R15] Error accumulation, never throw for recoverable import errors — LOCKED
- [v2.0-R16] No auto-extension, no Levenshtein, no normalizePath — LOCKED
- [v2.0-R17] Import path must end with .gft — LOCKED
- [v2.0-R18] Targeted graph/memory rejection deferred; generic "not found" sufficient — LOCKED
- [v2.0-R19] Memory-vs-context and memory-vs-produces name collisions detected by ScopeChecker — LOCKED
- [v2.0-R20] checkNodeWrites validates writes entries against declared memories — LOCKED
- [v2.0-R21] Memory in reads treated as valid source with field validation — LOCKED
- [v2.0-R22] TokenEstimator includes memory.maxTokens (0.3 partial factor) — LOCKED
- [v2.0-R23] TypeChecker unchanged for v2.0 (writes schema check deferred) — LOCKED
- [v2.0-R24] generateAgent gets memoryNames with default param for backward compat — LOCKED
- [v2.0-R25] formatReads distinguishes memory (.graft/memory/) from session — LOCKED
- [v2.0-R26] Memory writes use field-matching merge (schema-aware, preserves unrelated fields) — LOCKED
- [v2.0-R27] Always reload memory from disk in executeNode (no outputs.has() guard) — LOCKED
- [v2.0-R28] Dry run skips memory saves — LOCKED
- [v2.0-R29] loadMemory returns null on missing/corrupt file (try-catch) — LOCKED
- [v2.0-R30] Memory scaffold: conditional .gitkeep (no per-file scaffolding) — LOCKED
- [v2.0-R31] cleanSession and buildContextSection unchanged (memory in separate dir tree) — LOCKED
- [v2.0-R32] examples/shared.gft is a library (no graph) — LOCKED
- [v2.0-R33] examples/chatbot.gft uses import + memory + writes — LOCKED
- [v2.0-R34] Integration tests use temp files for import tests — LOCKED

### v2.1 Ratchets (17 items)
- [T6] MODEL_MAP duplicated — UNLOCKED (extracted to src/constants.ts)
- [v1.2-R06] MODEL_MAP duplicated in executor.ts — UNLOCKED (extracted to src/constants.ts)
- [v2.1-R01] MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD in src/constants.ts — LOCKED
- [v2.1-R02] fieldsToJsonExample and typeToExample in src/utils.ts — LOCKED
- [v2.1-R03] loadMemory and saveMemory as standalone functions in src/runtime/memory.ts — LOCKED
- [v2.1-R04] saveMemory always saves; dryRun guard is caller's responsibility — LOCKED
- [v2.1-R05] PARTIAL_FIELD_FACTOR applies to all per-field fraction estimates — LOCKED
- [v2.1-R06] TOOL_MAP stays in src/codegen/agents.ts (not extracted) — LOCKED
- [v2.1-R07] Writes schema overlap: warning in TypeChecker, not error — LOCKED
- [v2.1-R08] max_tokens > 0 validation in ScopeChecker for both ContextDecl and MemoryDecl — LOCKED
- [v2.1-R09] Parallel memory write detection via nodeWritesMap in ScopeChecker.walkFlowNodes — LOCKED
- [v2.1-R10] compiler.ts filters diagnostics by severity; warnings don't block compilation — LOCKED
- [v2.1-R11] TokenUsage and parseCLIOutput in subprocess.ts — LOCKED
- [v2.1-R12] TokenTracker as standalone class in src/runtime/token-tracker.ts — LOCKED
- [v2.1-R13] Token log cleared on session start, appended per node — LOCKED
- [v2.1-R14] RunResult.tokenUsage with budget/consumed/fraction/perNode — LOCKED
- [v2.1-R15] Budget enforcement advisory only; no hard abort — LOCKED
- [v2.1-R16] Estimates from nodeDecl.budgetIn/budgetOut, not TokenEstimator — LOCKED
- [v2.1-R17] Switch from --print to --output-format json in executor — LOCKED

### v2.2 Ratchets (25 items)
- [v2.2-R01] resolve() accepts Program, not source string — LOCKED
- [v2.2-R02] VERSION from package.json via createRequire with try-catch fallback — LOCKED
- [v2.2-R03] ProgramIndex: 5 maps — LOCKED
- [v2.2-R04] ProgramIndex: no getter methods, direct map access — LOCKED
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex — LOCKED
- [v2.2-R06] prompt-builder.ts: pure functions with PromptContext interface — LOCKED
- [v2.2-R07] flow-runner.ts: executeFlowNodes with FlowContext interface — LOCKED
- [v2.2-R08] GraftErrorCode: 18-member union type — LOCKED
- [v2.2-R09] Error codes on all 34 GraftError call sites — LOCKED
- [v2.2-R10] Parser/lexer remain throw-based — LOCKED
- [v2.2-R11] Foreach binding collision detection — LOCKED
- [v2.2-R12] C-02 in ScopeChecker.checkEdges() — LOCKED
- [v2.2-R13] Multiple graph warning — LOCKED
- [v2.2-R14] loadMemory options param — LOCKED
- [v2.2-R15] sourceFile set in compiler.ts and resolver.ts — LOCKED
- [v2.2-R16] LSP: 2-file structure — LOCKED
- [v2.2-R17] LSP: Node stdlib URI conversion — LOCKED
- [v2.2-R18] LSP: GRAPH_MISSING filtered — LOCKED
- [v2.2-R19] LSP: Full document sync — LOCKED
- [v2.2-R20] LSP: Per-URI cache — LOCKED
- [v2.2-R21] LSP: formatType exhaustive switch — LOCKED
- [v2.2-R22] npm: @graft-lang/graft scoped name — LOCKED
- [v2.2-R23] npm: files array + .npmignore — LOCKED
- [v2.2-R24] VS Code: command-based ServerOptions — LOCKED
- [v2.2-R25] TextMate: comments only — LOCKED
