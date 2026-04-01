# Common Memory — Graft Compiler
## Last updated: v3.0-R8 completed (v3.0.0 release)

## Ratchet-Locked Decisions (168 total, 4 unlocked)

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

### v2.2-R2 Ratchets (Executor Decomposition + Error Codes)
- [v2.2-R06] prompt-builder.ts: pure functions (buildPrompt, buildContextSection, resolveField, generateMockOutput) with PromptContext interface — LOCKED
- [v2.2-R07] flow-runner.ts: executeFlowNodes with FlowContext interface; executor delegates flow execution — LOCKED
- [v2.2-R08] GraftErrorCode: 18-member union type, optional 4th param on GraftError — LOCKED
- [v2.2-R09] Error codes on all 34 GraftError call sites (20 scope + 4 type + 3 estimator + 6 resolver + 1 compiler) — LOCKED
- [v2.2-R10] Parser/lexer remain throw-based; error codes only on analyzer/resolver/compiler — LOCKED

### v2.2-R3 Ratchets (Correctness Fixes)
- [v2.2-R11] Foreach binding collision: else-if chain against nodeNames/producesMap/contextNames/memoryNames — LOCKED
- [v2.2-R12] C-02 in ScopeChecker.checkEdges(), not TypeChecker — LOCKED
- [v2.2-R13] Multiple graph warning in ScopeChecker, uses graphs[1].location — LOCKED
- [v2.2-R14] loadMemory options param: `options?: { verbose?: boolean }` — LOCKED
- [v2.2-R15] sourceFile set in compiler.ts (all decls) + resolver.ts (imported decls only) — LOCKED

### v2.2-R4 Ratchets (LSP Server)
- [v2.2-R16] LSP: 2-file structure (server.ts + features.ts), pure functions for all handlers — LOCKED
- [v2.2-R17] LSP: Node stdlib URI conversion (fileURLToPath/pathToFileURL), no vscode-uri — LOCKED
- [v2.2-R18] LSP: GRAPH_MISSING filtered from LSP diagnostics; compile() returns program on no-graph — LOCKED
- [v2.2-R19] LSP: Full document sync (TextDocumentSyncKind.Full), compile-on-change — LOCKED
- [v2.2-R20] LSP: Per-URI cache of { program, index }, stale data for hover/definition on error — LOCKED
- [v2.2-R21] LSP: formatType exhaustive switch over TypeExpr, distinct from typeToExample — LOCKED

### v2.2-R5 Ratchets (npm Distribution + VS Code Extension)
- [v2.2-R22] npm: @graft-lang/graft scoped name, exports with ./ast sub-path — LOCKED
- [v2.2-R23] npm: files array (dist/, README.md, LICENSE) + .npmignore defense-in-depth — LOCKED
- [v2.2-R24] VS Code: command-based ServerOptions (graft-lsp on PATH), CJS output — LOCKED
- [v2.2-R25] TextMate: // and /* */ comments only, no escape sequences, k-integer before integer — LOCKED

### v3.0-R1 Ratchets (Pipeline Split + ProgramIndex Threading)
- [v3.0-R01] compileToProgram() does NOT check GRAPH_MISSING (codegen prerequisite only) — LOCKED
- [v3.0-R02] ProgramIndex optional param with ?? new ProgramIndex(program) fallback on ScopeChecker, TokenEstimator, Executor — LOCKED
- [v3.0-R03] RuntimeState interface in prompt-builder.ts (not a new file); PromptContext and FlowContext extend it — LOCKED

### v3.0-R2 Ratchets (WriteRef + Multi-field Reads)
- [v3.0-R04] WriteRef { memory, field?, location } replaces string[] on NodeDecl.writes — LOCKED
- [v3.0-R05] ContextRef.field changes from string | undefined to string[] | undefined — LOCKED
- [v3.0-R06] Multi-field brace syntax: reads: [Ctx.{f1, f2}] parsed to field: ["f1", "f2"] — LOCKED
- [v3.0-R07] Estimator scaling: Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1.0) at all 3 sites — LOCKED
- [v3.0-R08] Codegen single-field dot, multi-field brace display — LOCKED
- [v3.0-R09] Scope checker validates WriteRef.field against memory schema — LOCKED

### v3.0-R3 Ratchets (CodegenBackend Interface)
- [v3.0-R10] CodegenBackend interface with 4 fine-grained methods (generateAgent, generateHook, generateOrchestration, generateSettings) — LOCKED
- [v3.0-R11] ClaudeCodeBackend delegates to existing standalone functions (no restructuring) — LOCKED
- [v3.0-R12] generate() accepts optional backend param, defaults to ClaudeCodeBackend — LOCKED
- [v3.0-R13] ProgramIndex.graphMap: Map<string, GraphDecl> — LOCKED
- [v3.0-R14] CONFIG_UNKNOWN_BACKEND error code in GraftErrorCode union — LOCKED
- [v3.0-R15] generateSettings() accepts optional ProgramIndex (avoids double construction) — LOCKED

### v3.0-R4 Ratchets (Field-Level Analyzer)
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex — UNLOCKED (now accepts ProgramIndex)
- [v3.0-R16] ProgramIndex.producesFieldsMap: Map<string, Map<string, TypeExpr>> (keyed by both node name AND produces name) — LOCKED
- [v3.0-R17] ProgramIndex.memoryFieldsMap: Map<string, Map<string, TypeExpr>> — LOCKED
- [v3.0-R18] TypeChecker accepts optional ProgramIndex (same pattern as ScopeChecker, TokenEstimator) — LOCKED
- [v3.0-R19] TYPE_WRITE_FIELD_OVERLAP error code in GraftErrorCode union — LOCKED

### v3.0-R5 Ratchets (Failure Strategies Runtime)
- [v1.2-R07] Abort-on-failure MVP; retry/fallback/skip deferred — UNLOCKED (now fully implemented)
- [v3.0-R20] executeWithFailureStrategy in flow-runner.ts handles retry/fallback/skip/abort/retry_then_fallback — LOCKED
- [v3.0-R21] FlowContext.getFailureStrategy?: (name: string) => FailureStrategy | undefined — LOCKED
- [v3.0-R22] Executor passes getFailureStrategy via nodeDecl.onFailure lookup — LOCKED
- [v3.0-R23] SCOPE_INVALID_FALLBACK error code validates fallback node references — LOCKED

### v3.0-R6 Ratchets (Quality + Cleanup)
- [v2.2-R08] GraftErrorCode: 18-member union type — UNLOCKED (now 30+ members with sub-unions)
- [v2.2-R10] Parser/lexer remain throw-based; error codes only on analyzer — UNLOCKED (parser now has PARSE_ codes)
- [v3.0-R24] SourceLocation.length?: number on all tokens — LOCKED
- [v3.0-R25] GraftErrorCode = ParseErrorCode | ScopeErrorCode | TypeErrorCode | BudgetErrorCode | ImportErrorCode | GraphErrorCode | ConfigErrorCode — LOCKED
- [v3.0-R26] TRANSFORM_ON_CONDITIONAL renamed to SCOPE_TRANSFORM_CONDITIONAL — LOCKED
- [v3.0-R27] PARSE_UNEXPECTED_TOKEN and PARSE_MISSING_FIELD on parser throws — LOCKED
- [v3.0-R28] Foreach binding save/restore (hadBinding + prevBinding pattern) — LOCKED
- [v3.0-R29] Dead bench script removed from package.json — LOCKED
- [v3.0-R30] LSP 200ms debounce on onDidChangeContent — LOCKED

### v3.0-R7 Ratchets (LSP Improvements + Runtime Field Writes)
- [v3.0-R31] saveMemory accepts optional fields?: string[] for field-level writes — LOCKED
- [v3.0-R32] Executor passes WriteRef.field to saveMemory as [writeRef.field] — LOCKED
- [v3.0-R33] LSP import dependency tracking (importDeps map) with transitive invalidation — LOCKED
- [v3.0-R34] LSP diagnostic ranges use SourceLocation.length (non-zero-width squiggles) — LOCKED

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
- v2.2-R2: PASS. 323 tests (296 existing + 27 new). 5 new ratchet items. Zero deviations. MEDIUM tier (2 agents, cross-critique skipped).
- v2.2-R3: PASS. 337 tests (323 existing + 14 new). 5 new ratchet items. Zero deviations. MEDIUM tier (2 agents, cross-critique skipped).
- v2.2-R4: PASS. 359 tests (337 existing + 22 new). 6 new ratchet items. Zero negative deviations. HIGH tier (4 agents, cross-critique skipped).
- v2.2-R5: PASS. 363 tests (359 existing + 4 new). 4 new ratchet items. Zero deviations. MEDIUM tier (2 agents, cross-critique skipped).
- v2.2-R6: PASS. 376 tests (363 existing + 13 new). 0 new ratchet items. TEST-ONLY tier. All 4 adversarial test proposals from v2.1 implemented.
- v3.0-R1: PASS. 384 tests (376 existing + 8 new). 3 new ratchet items. MEDIUM tier (2 agents, cross-critique skipped). Zero deviations.
- v3.0-R2: PASS. 404 tests (384 existing + 20 new). 6 new ratchet items. MEDIUM tier. Zero deviations. A3-Skeptic found 2 critical silent runtime bugs (writes.join→[object Object], string iteration on ref.field).
- v3.0-R3: PASS. 419 tests (404 existing + 15 new). 6 new ratchet items. HIGH tier (4 agents, cross-critique skipped). Zero deviations. Dead import cleanup from reviewer suggestion.
- v3.0-R4: PASS. 430 tests (419 existing + 11 new). 4 new ratchet items, 1 unlocked (v2.2-R05). MEDIUM tier. ScopeChecker/TypeChecker deduplication via ProgramIndex field maps.
- v3.0-R5: PASS. 443 tests (430 existing + 13 new). 4 new ratchet items, 1 unlocked (v1.2-R07). Failure strategies runtime (retry/fallback/skip/abort/retry_then_fallback).
- v3.0-R6: PASS. 456 tests (443 existing + 13 new). 7 new ratchet items, 2 unlocked (v2.2-R08, v2.2-R10). Quality + cleanup round.
- v3.0-R7: PASS. 465 tests (456 existing + 9 new). 4 new ratchet items. LSP improvements + runtime field writes.
- v3.0-R8: PASS. 477 tests (465 existing + 12 new). 0 new ratchet items. TEST-ONLY integration + regression.

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
- v2.2-R2: Both agents scored 8/10. A4's comprehensive error code taxonomy (24 codes) trimmed to 18 by convergence (YAGNI). A2's separate flow-runner helpers rejected in favor of single switch.
- v2.2-R3: Score range 8-7=1, cross-critique skipped. Only disagreement: A3 placed C-02 in TypeChecker, A4 in ScopeChecker. ScopeChecker adopted (structural warning, not type checking).
- v2.2-R4: All 4 agents scored 7-8. A3 found GRAPH_MISSING bug (compile() drops program for library files). Resolved by returning program + filtering in LSP. URI conversion: A2/A3 Node stdlib adopted over A1 hand-rolled.

## Debate ROI
- v2.1-R1 (MEDIUM): 6 agent calls, 0 bugs found, 0 design changes. Appropriate for mechanical refactoring.
- v2.1-R2 (MEDIUM): 6 agent calls, 1 critical bug found (compiler.ts warning routing), 0 design changes. Both agents caught the same bug independently.
- v2.1-R3 (HIGH, reduced): 7 agent calls (skipped 4 cross-critique), 2 design issues found (CLI format uncertainty, mock compat), 1 design change (heuristic envelope detection). Skipping cross-critique when consensus is high saves 4 calls with no quality loss.
- v2.1-R4 (MEDIUM, reduced): 2 agent calls (debate skipped — pure integration testing). No design decisions needed for test-only rounds.
- v2.2-R1 (MEDIUM): 5 agent calls (2 analysis + 1 convergence + 1 impl + 1 review). 0 bugs, 2 spec corrections (producesNodeMap, codegen migration). Score-gated cross-critique working as designed.
- v2.2-R2 (MEDIUM): 5 agent calls. 0 bugs, executor decomposed from ~475 to ~300 lines, 18 error codes added to 34 call sites.
- v2.2-R3 (MEDIUM): 5 agent calls. 0 bugs, 5 correctness warnings added, sourceFile tracking for LSP.
- v2.2-R4 (HIGH): 11 agent calls (2 research + 4 analysis + 1 convergence + 1 impl + 1 review + 2 skipped cross-critique). 1 bug found (GRAPH_MISSING drops program). New LSP subsystem.
- v2.2-R5 (MEDIUM): 5 agent calls (2 analysis + 1 convergence + 1 impl + 1 review). 0 bugs, 3 correctness corrections from A3 (comment syntax, escape sequences, k-integer priority). Configuration-only round.
- v2.2-R6 (TEST-ONLY): 2 agent calls (1 impl + 1 review). 0 bugs. Integration tests + adversarial backlog cleared.
- v3.0-R1 (MEDIUM): 5 agent calls. 0 bugs. Pipeline split + ProgramIndex threading.
- v3.0-R2 (MEDIUM): 5 agent calls. 2 critical bugs found by A3-Skeptic. WriteRef + multi-field reads.
- v3.0-R3 (HIGH): 7 agent calls. 0 bugs. CodegenBackend interface.
- v3.0-R4 (MEDIUM): 5 agent calls. 0 bugs. ProgramIndex field maps.
- v3.0-R5 through R8: Direct implementation (context recovered from session summary). Failure strategies, quality cleanup, LSP improvements, integration tests.

## Notes for Future
- Conditional edge routing: deferred to v1.3
- Full failure strategies (retry/fallback/skip): IMPLEMENTED in v3.0-R5
- Token budget enforcement (Graft tokens vs Claude CLI dollars): approximation only
- Memory importability: deferred (v2.0-R13 locked as excluded)
- entryFile guard in resolver: scopes name merging to entry file only (justified deviation from convergence spec)
- All 359 tests currently passing
- v2.0 complete: import system + memory across all pipeline stages (lexer → parser → resolver → analyzer → codegen → runtime → integration)
- v2.1-R1 complete: constants/utils/memory extracted to shared modules, MODEL_MAP deduplication resolved
- v2.1-R2 complete: writes schema validation, max_tokens > 0, parallel write detection, compiler.ts warning routing
- v2.1-R3 complete: token tracking (TokenUsage, TokenTracker, parseCLIOutput, token log, RunResult extension, budget advisory)
- v2.1-R4 complete: integration tests for multi-node, parallel, dry-run, log format, budget thresholds, examples
- Token budget enforcement is advisory only (v2.1-R15); hard abort deferred to future version
- v2.1 complete: cleanup + correctness + token tracking across all runtime stages
- v2.1 process improvement: MEDIUM tier, skipped Step 0, reduced cross-critique for high-consensus rounds — 21 agent calls total (vs 36 budgeted, 42% reduction)
- v2.2-R1 complete: double-parse eliminated, VERSION from package.json, ProgramIndex utility (5 maps), .find() calls eliminated from scope/estimator/executor/codegen
- v2.2-R2 complete: executor decomposed (prompt-builder.ts + flow-runner.ts), 18 GraftErrorCode union type, error codes on all 34 diagnostic sites
- v2.2-R3 complete: foreach binding collision, conditional edge transform warning, multiple graph warning, loadMemory verbose, sourceFile tracking
- GraftErrorCode now has 21 members (18 from R2 + 3 from R3)
- v2.2-R4 complete: LSP server with diagnostics, hover, go-to-definition. 2-file structure (server.ts + features.ts). compile() fixed to return program on GRAPH_MISSING.
- v2.2-R5 complete: npm distribution metadata (@graft-lang/graft), VS Code extension (syntax highlighting, LSP client). Zero production code changes.
- v2.2-R6 complete: integration tests (end-to-end compile, LSP round-trip, npm pack, adversarial backlog). All 4 v2.1 adversarial proposals resolved.
- All 477 tests currently passing
- v2.2 complete: 6 rounds (R1-R6), all PASS. Tech debt + correctness + LSP + npm + VS Code + integration.
- v3.0-R1 complete: Pipeline split (compileToProgram/compileAndGenerate/compile), ProgramIndex threading, RuntimeState interface.
- v3.0-R2 complete: WriteRef replaces string[] writes, multi-field partial reads (ContextRef.field: string[]), brace syntax in parser, all 10 source files + 5 test files updated.
- v3.0-R3 complete: CodegenBackend interface + ClaudeCodeBackend + backend-aware generate() + ProgramIndex.graphMap + CONFIG_UNKNOWN_BACKEND + CLI --backend flag.
- v3.0-R4 complete: ProgramIndex field-level maps (producesFieldsMap, memoryFieldsMap), TypeChecker migrated to ProgramIndex, ScopeChecker deduplication.
- v3.0-R5 complete: Failure strategies runtime (executeWithFailureStrategy, SCOPE_INVALID_FALLBACK, retry/fallback/skip/abort/retry_then_fallback).
- v3.0-R6 complete: SourceLocation.length, GraftErrorCode sub-unions, PARSE_ codes, SCOPE_TRANSFORM_CONDITIONAL rename, foreach binding cleanup, bench removal, LSP debounce.
- v3.0-R7 complete: Field-level saveMemory, executor field writes, LSP cache invalidation, diagnostic range width.
- v3.0-R8 complete: Integration + regression tests (end-to-end pipeline, failure strategies, WriteRef, multi-field reads, parse codes, SourceLocation length).
- v3.0 COMPLETE: 8 rounds (R1-R8), all PASS. Multi-backend codegen + field-level writes + failure strategies + quality cleanup + LSP improvements.
