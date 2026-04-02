# Common Memory — Graft Compiler
## Last updated: v4.7 COMPLETE

## Ratchet-Locked Decisions (~275 total, 6 unlocked)

### T1-v2.2 Ratchets (archived)
> See `harness/archived_ratchets.md` for ~100 ratchets from T1 through v2.2. All LOCKED except 2 MODEL_MAP unlocks (extracted to constants.ts).

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

### v3.1-R1 Ratchets (LSP Completions)
- [v3.1-R01] getCompletions() pure function in features.ts (no server state access) — LOCKED
- [v3.1-R02] LSP completionProvider triggerCharacters: ['.', '[', '{'] — LOCKED
- [v3.1-R03] Comment suppression: isInComment() scans from document start tracking block comment state — LOCKED
- [v3.1-R04] String literal suppression: isInString() checks for unmatched quotes — LOCKED

### v3.1-R2 Ratchets (Parallel Fix + Cycle Detection)
- [v3.1-R05] Parallel branches call executeWithFailureStrategy, not raw ctx.executeNode — LOCKED
- [v3.1-R06] SCOPE_FALLBACK_CYCLE error code for self-referencing and mutual fallback cycles — LOCKED
- [v3.1-R07] Fallback cycle detection uses DFS with visited + in-stack sets — LOCKED

### v3.1-R3 Ratchets (Tech Debt)
- [v3.1-R08] Executor uses this.index.nodeMap/edgesBySource exclusively (no duplicate fields) — LOCKED
- [v3.1-R09] ScopeChecker derives name lookups from this.index.*Map.has() (no duplicate Sets) — LOCKED
- [v3.1-R10] formatTokenReport() in src/format.ts shared between compile and check — LOCKED

### v3.1-R4 Ratchets (API Surface)
- [v3.1-R11] src/types.ts is the ONLY barrel file (public API boundary exception to T1 no-barrels ratchet) — LOCKED
- [v3.1-R12] Sub-path exports: ./compiler, ./runtime, ./types in package.json — LOCKED

### v3.2-R1 Ratchets (Parser Error Recovery)
- [v3.2-R01] Parser.parse() returns ParseResult { program: Program, errors: GraftError[] } — program always non-null — LOCKED
- [v3.2-R02] synchronize() tracks brace depth to avoid false keyword matches inside blocks — LOCKED
- [v3.2-R03] Inner parseX functions keep throwing; only top-level parse() catches and recovers — LOCKED
- [v3.2-R04] MAX_ERRORS = 25 limit prevents pathological input — LOCKED
- [v3.2-R05] Progress guard: if synchronize() doesn't advance pos, force advance — LOCKED
- [v2.2-R10] "Parser/lexer remain throw-based" — UNLOCKED (parser moves to error accumulation; lexer stays throw-based)

### v3.2-R2 Ratchets (LSP Polish)
- [v3.2-R06] KEYWORD_DOCS checked before ProgramIndex in getHoverInfo() — LOCKED
- [v3.2-R07] LRU cache eviction at MAX_CACHE_SIZE = 50 with lastAccess tracking — LOCKED

### v3.3-R1 Ratchets (LSP Code Actions)
- [v3.3-R01] extractUndefinedName() uses message regex /'([^']+)'/ primary, getWordAtPosition fallback — LOCKED
- [v3.3-R02] computeRelativeImportPath() with backslash-to-forward-slash normalization — LOCKED
- [v3.3-R03] Workspace export cache: lazy scan on first code action, Map<exportName, filePath> — LOCKED
- [v3.3-R04] Import insertion after last existing import line, or at document start — LOCKED
- [v3.3-R05] codeActionProvider with CodeActionKind.QuickFix only — LOCKED

### v3.3-R2 Ratchets (Conditional Edge Runtime)
- [v3.3-R06] evaluateCondition() exported from flow-runner.ts with 6 operators (==, !=, >=, >, <=, <) — LOCKED
- [v3.3-R07] FlowContext.getConditionalEdge?: optional method for branch lookup — LOCKED
- [v3.3-R08] Branch selection: first matching when wins, else as default fallback — LOCKED
- [v3.3-R09] Numeric coercion via Number() for ordered comparison operators — LOCKED

### v3.3-R3 Ratchets (Document Symbols + Condition Types)
- [v3.3-R10] TYPE_CONDITION_MISMATCH error code for ordered operators on non-numeric fields — LOCKED

### v3.4-R1 Ratchets (LSP Rename)
- [v3.4-R01] isRenameable checks contextMap, nodeMap, memoryMap, graphMap only — LOCKED
- [v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching — LOCKED
- [v3.4-R03] prepareRename returns null for non-renameable symbols — LOCKED
- [v3.4-R04] Cross-file rename scans workspace exports cache for importing files — LOCKED
- [v3.4-R05] Rename rejects if newName conflicts with existing declaration — LOCKED

### v3.4-R2 Ratchets (Conditional Edge Estimation + Split)
- [v3.4-R06] Conditional edge estimation: best=min branch cost, worst=max branch cost — LOCKED
- [v3.4-R07] features.ts split into 8 modules under features/ with index.ts re-export — LOCKED
- [v3.4-R08] features/utils.ts holds getWordAtPosition (shared across modules) — LOCKED

### v3.4-R3 Ratchets (Hierarchical Symbols + Code Action Extraction)
- [v3.4-R09] Document symbol children: fields as SymbolKind.Field, flow nodes as SymbolKind.Function — LOCKED
- [v3.4-R10] buildAutoImportActions pure function in features/code-actions.ts — LOCKED

### v3.5-R1 Ratchets (Rename Hardening)
- [v3.5-R01] CRLF normalization in collectRenameLocations before text scanning — LOCKED
- [v3.5-R02] isInComment/isInString extracted to features/utils.ts (shared) — LOCKED
- [v3.5-R03] collectRenameLocations skips matches inside comments, strings, import paths — LOCKED
- [v3.5-R04] newName validation: /^[A-Za-z_][A-Za-z0-9_]*$/ + GRAFT_KEYWORDS blacklist — LOCKED

### v3.5-R2 Ratchets (Cross-file Conflicts + Handler Extraction)
- [v3.5-R05] buildRenameEdits pure function in features/rename.ts (server.ts thin wrapper) — LOCKED
- [v3.5-R06] Cross-file conflict detection before applying rename edits — LOCKED
- [v3.5-R07] GRAFT_KEYWORDS Set (26 keywords) exported from features/rename.ts — LOCKED

### v3.5-R3 Ratchets (FlowNode Location + Symbol Enhancement)
- [v3.5-R08] FlowNode all three kinds have optional location?: SourceLocation — LOCKED
- [v3.5-R09] Parser captures location at keyword/identifier for all FlowNode kinds — LOCKED
- [v3.5-R10] Document symbols: parallel/foreach as children with descriptive labels — LOCKED

### v3.6-R1 Ratchets (Find All References)
- [v3.6-R01] isReferable checks 5 ProgramIndex maps (including producesNodeMap) — LOCKED
- [v3.6-R02] findReferences reuses collectRenameLocations (no separate reference finder) — LOCKED
- [v3.6-R03] Cross-file references scan ALL workspace files with includes() pre-filter — LOCKED
- [v3.6-R04] includeDeclaration filtering via keyword-length position computation — LOCKED

### v3.6-R2 Ratchets (Keyword Unification + Conflict Fix)
- [v3.6-R05] GRAFT_KEYWORDS derived from lexer KEYWORDS minus type keywords and output — LOCKED
- [v3.6-R06] Cross-file conflict detection uses Parser+ProgramIndex, not regex — LOCKED

### v3.6-R3 Ratchets (Symbol Range + Rename Polish)
- [v3.6-R07] makeSymbol range spans keyword→name, selectionRange is name-only — LOCKED
- [v3.6-R08] Rename field collision guard checks context/memory/produces fields — LOCKED

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
- v3.1-R1: PASS. 503 tests (477 existing + 26 new). 4 new ratchet items. MEDIUM tier (A2+A3, merged Step 3+4). LSP completion provider.
- v3.1-R2: PASS. 513 tests (503 existing + 10 new). 3 new ratchet items. DIRECT tier. Parallel fix + fallback cycle detection.
- v3.1-R3: PASS. 519 tests (513 existing + 6 new). 3 new ratchet items. DIRECT tier. Tech debt cleanup.
- v3.1-R4: PASS. 527 tests (519 existing + 8 new). 2 new ratchet items. DIRECT tier. Programmatic API surface.
- v3.1-R5: PASS. 537 tests (527 existing + 10 new). 0 new ratchet items. TEST-ONLY integration + regression.
- v3.2-R1: PASS. 555 tests (537 existing + 18 new). 5 new ratchet items, 1 unlocked (v2.2-R10). MEDIUM tier (A2+A3, merged Step 3+4). Parser error recovery.
- v3.2-R2: PASS. 570 tests (555 existing + 15 new). 2 new ratchet items. DIRECT tier. LSP polish (keyword hover, storage completions, import wiring, LRU cache).
- v3.2-R3: PASS. 570 tests (0 new). 0 new ratchet items. DIRECT tier. Tech debt (./format export, TD-05 already done).
- v3.2-R4: PASS. 582 tests (570 existing + 12 new). 0 new ratchet items. TEST-ONLY integration + regression.
- v3.3-R1: PASS. 598 tests (582 existing + 16 new). 5 new ratchet items. MEDIUM tier (A2+A3, merged Step 3+4). LSP code actions (auto-import).
- v3.3-R2: PASS. 611 tests (598 existing + 13 new). 4 new ratchet items. MEDIUM tier. Conditional edge runtime routing.
- v3.3-R3: PASS. 623 tests (611 existing + 12 new). 1 new ratchet item. DIRECT tier. Document symbols + condition type validation.
- v3.3-R4: PASS. 636 tests (623 existing + 13 new). 0 new ratchet items. TEST-ONLY integration + regression.
- v3.4-R1: PASS. 653 tests (636 existing + 17 new). 5 new ratchet items. MEDIUM tier (A2+A3, merged Step 3+4). LSP rename support.
- v3.4-R2: PASS. 668 tests (653 existing + 15 new). 3 new ratchet items. DIRECT tier. Conditional edge estimation + features.ts split.
- v3.4-R3: PASS. 678 tests (668 existing + 10 new). 2 new ratchet items. DIRECT tier. Hierarchical document symbols + code action extraction.
- v3.4-R4: PASS. 690 tests (678 existing + 12 new). 0 new ratchet items. TEST-ONLY integration + regression.
- v3.5-R1: PASS. 706 tests (690 existing + 16 new). 4 new ratchet items. DIRECT tier. Rename hardening (CRLF, comment/string/import filtering, newName validation).
- v3.5-R2: PASS. 716 tests (706 existing + 10 new). 3 new ratchet items. DIRECT tier. Cross-file conflict detection + buildRenameEdits extraction.
- v3.5-R3: PASS. 724 tests (716 existing + 8 new). 3 new ratchet items. DIRECT tier. FlowNode location + parallel/foreach symbol children.
- v3.5-R4: PASS. 739 tests (724 existing + 15 new). 0 new ratchet items. TEST-ONLY integration + regression.
- v3.6-R1: PASS. 753 tests (739 existing + 14 new). 4 new ratchet items. MEDIUM tier (A2+A3, R-PROC-14 applied). Find-all-references.
- v3.6-R2: PASS. 761 tests (753 existing + 8 new). 2 new ratchet items. DIRECT tier. Keyword unification + parse-based conflict detection.
- v3.6-R3: NEEDS_CHANGES then PASS. 770 tests (761 existing + 9 new). 2 new ratchet items. DIRECT tier. Symbol range fix + rename field collision guard. Reviewer caught selectionRange bug (started at keyword, not name). Fixed.
- v3.6-R4: PASS. 790 tests (770 existing + 20 new). 0 new ratchet items. TEST-ONLY integration + regression.

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
- v3.1-R1 (MEDIUM): 4 agent calls (2 analysis + 1 merged convergence+impl + 1 review). A3-Skeptic identified 10 edge cases (block comments, CRLF, string literals, missing produces in reads). Merged Step 3+4 eliminated context loss.
- v3.1-R2 (DIRECT): 2 agent calls. 0 bugs. Parallel fix + fallback cycle detection.
- v3.1-R3 (DIRECT): 2 agent calls. 0 bugs. Tech debt cleanup (4 items).
- v3.1-R4 (DIRECT): 2 agent calls. 0 bugs. API surface.
- v3.1-R5 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v3.2-R1 (MEDIUM): 4 agent calls (2 analysis + 1 merged convergence+impl + 1 review). A3-Skeptic identified brace-depth tracking requirement and progress guard. A2-Pragmatist identified seenNonImport advance() fix.
- v3.2-R2 (DIRECT): 2 agent calls. 0 bugs. LSP polish (4 items).
- v3.2-R3 (DIRECT): 1 agent call (orchestrator direct). TD-05 already implemented. ./format export added.
- v3.2-R4 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v3.3-R1 (MEDIUM): 4 agent calls (2 analysis + 1 merged convergence+impl + 1 review). A3-Skeptic identified diagnostic-location mismatch (6/9 SCOPE_UNDEFINED_REF point to keywords, not names), workspace root capture gap, Windows backslash paths.
- v3.3-R2 (MEDIUM): 4 agent calls. 0 bugs. Conditional edge runtime routing (evaluateCondition, FlowContext extension).
- v3.3-R3 (DIRECT): 2 agent calls. 0 bugs. Document symbols + condition type validation.
- v3.3-R4 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v3.4-R1 (MEDIUM): 4 agent calls (2 analysis + 1 merged convergence+impl + 1 review). Text-based reference finding with word-boundary regex. Cross-file rename via workspace export cache.
- v3.4-R2 (DIRECT): 2 agent calls. 0 bugs. Conditional edge estimation + features.ts split into 8 modules.
- v3.4-R3 (DIRECT): 2 agent calls. 0 bugs. Hierarchical document symbols + code action extraction.
- v3.4-R4 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v3.5-R1 (DIRECT): 2 agent calls. 0 bugs. Rename hardening (A3 backlog items from v3.4-R1).
- v3.5-R2 (DIRECT): 2 agent calls. 0 bugs. Cross-file conflict detection + buildRenameEdits extraction.
- v3.5-R3 (DIRECT): 2 agent calls. 0 bugs. FlowNode location + parallel/foreach symbol children.
- v3.5-R4 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v3.6-R1 (MEDIUM): 4 agent calls (2 analysis + 1 merged convergence+impl + 1 review). A3-Skeptic found produces name gap in isRenameable (HIGH). R-PROC-14 first real test — analysis completed before convergence. Find-all-references.
- v3.6-R2 (DIRECT): 2 agent calls. 0 bugs. Keyword derivation from lexer + parse-based conflict detection.
- v3.6-R3 (DIRECT): 3 agent calls (1 impl + 1 review NEEDS_CHANGES + 1 fix). Reviewer caught selectionRange starting at keyword instead of name. Symbol range fix + rename field collision guard.
- v3.6-R4 (TEST-ONLY): 2 agent calls. 0 bugs. Integration tests.
- v4.1-R1 (MEDIUM): 4 agent calls. conditionFieldName multi-segment fix. resolveNestedField replaces bridge function.
- v4.1-R2 (DIRECT): 2 agent calls. Output isolation + division warning + 4 exhaustive switches.
- v4.1-R3 (DIRECT): 2 agent calls. Scope checker extraction (graph-checker.ts). Pure refactor, 0 new tests.
- v4.1-R4 (TEST-ONLY): 2 agent calls. Integration + regression tests (10 new).
- v4.2-R1 (MEDIUM): 4 agent calls. Expression functions (call Expr kind, BUILTIN_FUNCTIONS, parser/evaluator/scope/type).
- v4.2-R2 (DIRECT): 2 agent calls. Graph call return values + equality unification + exhaustive switch test.
- v4.2-R3 (DIRECT): 2 agent calls. LSP completions + hover for builtin functions.
- v4.2-R4 (TEST-ONLY): 2 agent calls. Integration + regression tests (10 new).

## Notes for Future
- Conditional edge routing: IMPLEMENTED in v3.3-R2
- Full failure strategies (retry/fallback/skip): IMPLEMENTED in v3.0-R5
- Token budget enforcement (Graft tokens vs Claude CLI dollars): approximation only
- Memory importability: deferred (v2.0-R13 locked as excluded)
- entryFile guard in resolver: scopes name merging to entry file only (justified deviation from convergence spec)
- All 1,048 tests currently passing
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
- All 790 tests currently passing
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
- v3.1-R1 complete: LSP completion provider (getCompletions, 8 contexts, comment/string suppression, snippets, CRLF-safe). MEDIUM tier, A2+A3 debate.
- v3.1-R2 complete: Parallel failure strategy fix (executeWithFailureStrategy in parallel blocks), fallback cycle detection (SCOPE_FALLBACK_CYCLE, DFS with in-stack).
- v3.1-R3 complete: Tech debt cleanup (Executor/ScopeChecker dedup to ProgramIndex, formatTokenReport extraction, foreach error msg fix).
- v3.1-R4 complete: Programmatic API surface (./compiler, ./runtime, ./types sub-path exports, src/types.ts barrel file).
- v3.1-R5 complete: Integration + regression tests (10 cross-cutting tests covering all R1-R4 features).
- v3.1 COMPLETE: 5 rounds (R1-R5), all PASS. LSP completions + parallel fix + fallback cycles + tech debt + API surface. 537 tests.
- v3.2-R1 complete: Parser error recovery (ParseResult, synchronize() with brace-depth, progress guard, MAX_ERRORS=25, error accumulation). MEDIUM tier, A2+A3 debate.
- v3.2-R2 complete: LSP polish (keyword hover docs, storage completions, import name resolution, LRU cache eviction).
- v3.2-R3 complete: Tech debt (./format sub-path export, TD-05 duplicate writes already guarded).
- v3.2-R4 complete: Integration + regression tests (12 cross-cutting tests covering R1-R3 features).
- v3.2 COMPLETE: 4 rounds (R1-R4), all PASS. Parser error recovery + LSP polish + tech debt + integration. 582 tests.
- v3.3-R1 complete: LSP code actions (auto-import for SCOPE_UNDEFINED_REF, workspace export cache, relative path computation). MEDIUM tier, A2+A3 debate.
- v3.3-R2 complete: Conditional edge runtime routing (evaluateCondition, FlowContext.getConditionalEdge, branch selection). MEDIUM tier.
- v3.3-R3 complete: Document symbols (getDocumentSymbols, SymbolKind mapping) + condition type validation (TYPE_CONDITION_MISMATCH, checkConditionTypes).
- v3.3-R4 complete: Integration + regression tests (13 cross-cutting tests covering R1-R3 features).
- v3.3 COMPLETE: 4 rounds (R1-R4), all PASS. LSP code actions + conditional routing + document symbols + condition types. 636 tests.
- v3.4-R1 complete: LSP rename support (isRenameable, collectRenameLocations, prepareRename, cross-file rename). MEDIUM tier.
- v3.4-R2 complete: Conditional edge token estimation (best=min, worst=max branch cost) + features.ts split into 8 modules.
- v3.4-R3 complete: Hierarchical document symbols (field/flow children) + buildAutoImportActions extraction.
- v3.4-R4 complete: Integration + regression tests (12 cross-cutting tests covering R1-R3 features).
- v3.4 COMPLETE: 4 rounds (R1-R4), all PASS. LSP rename + conditional estimation + hierarchical symbols + features split. 690 tests.
- v3.5-R1 complete: Rename hardening (CRLF normalization, comment/string/import-path filtering, newName validation, isInComment/isInString extraction to utils.ts). DIRECT tier.
- v3.5-R2 complete: Cross-file conflict detection + buildRenameEdits pure function extraction + GRAFT_KEYWORDS Set. DIRECT tier.
- v3.5-R3 complete: FlowNode SourceLocation on all three kinds + parallel/foreach as document symbol children with descriptive labels. DIRECT tier.
- v3.5-R4 complete: Integration + regression tests (15 cross-cutting tests covering R1-R3 features). TEST-ONLY tier.
- v3.5 COMPLETE: 4 rounds (R1-R4), all PASS. Rename hardening + cross-file conflicts + FlowNode location + symbol enhancement. 739 tests.
- v3.6-R1 complete: Find-all-references (isReferable, findReferences, includeDeclaration, cross-file). MEDIUM tier, R-PROC-14 applied.
- v3.6-R2 complete: GRAFT_KEYWORDS derived from lexer KEYWORDS + parse-based cross-file conflict detection. DIRECT tier.
- v3.6-R3 complete: Symbol range fix (range=keyword→name, selectionRange=name) + rename field collision guard. DIRECT tier. One NEEDS_CHANGES (selectionRange bug fixed).
- v3.6-R4 complete: Integration + regression tests (20 cross-cutting tests). TEST-ONLY tier.
- v3.6 COMPLETE: 4 rounds (R1-R4). Find-all-references + keyword unification + symbol range + rename polish. 790 tests.
- v3.7-R1 complete: Server.ts orchestration extraction (ensureWorkspaceScan, collectWorkspaceFileTexts) + findDeclNamePosition fix (loc.length instead of KEYWORD_LENGTHS). DIRECT tier.
- v3.7-R2 complete: Foreach source failure handling (fallback output aliasing, skip guard, removed ?? ctx.input). MEDIUM tier. Fallback alias pattern: `if (result.node !== flowNode.name) ctx.outputs.set(flowNode.name, result.output)`.
- v3.7-R3 complete: Multi-hop conditional edge routing (visited set cycle detection, done-as-target, fallback alias in chain, MAX_CONDITIONAL_HOPS=10, scope.ts done guard). MEDIUM tier. One NEEDS_CHANGES (missing depth-limit error + 2 tests, fixed).
- v3.7-R4 complete: Integration + regression tests (13 cross-cutting tests). TEST-ONLY tier.
- v3.7 COMPLETE: 4 rounds (R1-R4). Foreach failure + multi-hop routing + server extraction + reference fix. 832 tests.
- v3.8-R1 complete: Flow-runner extraction (applyFallbackAlias, executeConditionalChain, case 'node' 66→9 lines). DIRECT tier.
- v3.8-R2 complete: Multi-hop conditional chain estimation (recursive getConditionalBranchCosts, per-branch visited sets, cycle/depth warnings, ConditionalBranch[] storage). MEDIUM tier. Closes TD-03 (carried 5 retros).
- v3.8-R3 complete: Foreach iteration context in error messages (annotation suffix). DIRECT tier.
- v3.8-R4 complete: Integration + regression tests (11 cross-cutting tests). TEST-ONLY tier.
- v3.8 COMPLETE: 4 rounds (R1-R4). Flow-runner extraction + multi-hop estimation + foreach error context. 864 tests. Closes TD-02, TD-03, TD-04.
- v3.9-R1 complete: Edge transforms on conditional edges (ConditionalEdgeInfo, transforms after condition eval, SCOPE_TRANSFORM_CONDITIONAL removed). MEDIUM tier. One NEEDS_CHANGES (2 missing tests, fixed).
- v3.9-R2 complete: Estimator polish (BUDGET_CHAIN_CYCLE, BUDGET_CHAIN_DEPTH, fallback cost) + TD-01 AST-based import-path filtering. DIRECT tier.
- v3.9-R3 complete: Integration + regression tests (10 cross-cutting tests). TEST-ONLY tier.
- v3.9 COMPLETE: 3 rounds (R1-R3). Conditional edge transforms + estimator polish + TD-01. 890 tests. Final v3.x release. Closes TD-01, resolves SCOPE_TRANSFORM_CONDITIONAL.
- v4.0 COMPLETE: 6 rounds (R1-R6). Variables (let), expressions, graph params, graph calls. 980 tests. 72 new v4.0 tests across 5 test files.
- v4.1 COMPLETE: 4 rounds (R1-R4). Quality hardening — conditionFieldName fix, output isolation, scope extraction, exhaustive switches. 1,001 tests. 21 new v4.1 tests across 2 test files.
- v4.2 COMPLETE: 4 rounds (R1-R4). Expression functions (len/max/min/str), graph call return values, equality unification. 1,048 tests. 47 new v4.2 tests across 4 test files.

### v4.0-R1 Ratchets (Lexer + AST + Expression Parser)
- [v4.0-R01] Expr: 5-kind discriminated union (literal, field_access, binary, unary, group) with mandatory SourceLocation — LOCKED
- [v4.0-R02] Division at additive precedence (flat with +/-), no multiplicative level — UNLOCKED (v4.3: moved to multiplicative precedence for standard math semantics)
- [v4.0-R03] Condition.left: Expr replaces Condition.field atomically — LOCKED
- [v4.0-R04] conditionFieldName() bridge exported from ast.ts for incremental migration — LOCKED
- [v4.0-R05] Let: arrow-connected FlowNode kind — LOCKED
- [v4.0-R06] Graph call: LL(1) disambiguation (Identifier + LParen) — LOCKED
- [v4.0-R07] parsePrimary: permissive first segment (accepts KEYWORD_TYPES) — LOCKED
- [v4.0-R08] Graph params: after budget, comma-separated, Node checked by Identifier value — LOCKED
- [v4.0-R09] Foreach body: allows node/let/graph_call, rejects parallel/foreach — LOCKED
- [v4.0-R10] Graph call zero args: allowed at parser level, validated by analyzer in R2 — LOCKED
- [v4.0-R11] FlowNode: 5 kinds (node, parallel, foreach, let, graph_call) — LOCKED
- [v4.0-R12] GraphDecl.params: GraphParam[] required field, defaults to [] — LOCKED
- [v4.0-R13] New tokens: Plus, Minus, Bang, Equals, Let — LOCKED
- [v4.0-R14] mkCond() test helper in tests/helpers.ts — LOCKED
- [v4.0-R15] KIntegerLiteral included in parsePrimary — LOCKED

### v4.0-R2 Ratchets (7 items, all LOCKED)
- [v4.0-R16] declaredVars: Set<string> tracked in walkFlowNodes, foreach body clones set — LOCKED
- [v4.0-R17] seenNodes: Set<string> tracks node appearance order; Node-type graph params pre-populated — LOCKED
- [v4.0-R18] checkVarCollision checks nodeMap, contextMap, memoryMap, graphMap + duplicate vars — LOCKED
- [v4.0-R19] checkGraphRecursion: DFS with visited+inStack (same pattern as fallback cycle detection) — LOCKED
- [v4.0-R20] InferredType = 'number' | 'string' | 'boolean' | 'unknown' in types.ts — LOCKED
- [v4.0-R21] Variable-first resolution: single-segment field_access checks varTypes before producesFieldsMap — LOCKED
- [v4.0-R22] 6 new ScopeErrorCodes + 2 new TypeErrorCodes added to diagnostics.ts — LOCKED

### v4.0-R3 Ratchets (Runtime — flow-runner.ts)
- [v4.0-R23] evaluateExpr: recursive evaluator for Expr AST (literal, field_access, binary, unary, group) — LOCKED
- [v4.0-R24] Variable-first resolution in evaluateExpr: single-segment field_access checks variables map before outputs — LOCKED
- [v4.0-R25] evaluateCondition: accepts optional variables param, variable-first for single-segment LHS — LOCKED
- [v4.0-R26] executeFlowNodes case 'let': creates ctx.variables lazily, evaluates expr, stores result — LOCKED
- [v4.0-R27] executeFlowNodes case 'graph_call': builds child FlowContext with own variables scope — LOCKED
- [v4.0-R28] FlowContext: added variables?: Map<string, unknown>, getGraphDecl?: (name) => GraphDecl — LOCKED

### v4.0-R4 Ratchets (Estimator + Codegen)
- [v4.0-R29] TokenEstimator: case 'let' zero cost, case 'graph_call' recurses into called graph flow — LOCKED
- [v4.0-R30] Orchestration codegen: let → [data binding] step, graph_call → [sub-pipeline] step — LOCKED
- [v4.0-R31] Graph params section in orchestration header (name: type with optional default) — LOCKED

### v4.0-R5 Ratchets (LSP)
- [v4.0-R32] Document symbols: let → Variable kind, graph_call → Function kind with args label — LOCKED
- [v4.0-R33] Completions in graph flow: 'let' keyword + graph names from graphMap as Module kind — LOCKED

### v4.0-R6 Review Summary
- v4.0-R6 complete: Integration + Regression Tests (TEST-ONLY). 13 new tests, 980 total. All pass.
  - Cross-feature: variable+conditional, variable+foreach, variable+parallel, nested graph calls, variable+graph param
  - Regression: existing flow patterns, conditions with field refs, graph without params, LSP on basic programs
  - Scale: complex pipeline with let+graph call+params compiles end-to-end
  - Error: undeclared variable in let → SCOPE_VAR_ORDER, self-recursive graph → SCOPE_GRAPH_RECURSION

### v4.0-R2 Review Feedback
- v4.0-R2 complete: Scope Checker + Type Checker (MEDIUM tier, A2+A3 debate). 18 new tests, 939 total. PASS on first try.
  - A3 found critical edge case: condition LHS single-segment ambiguity (variable vs field). Variable-first resolution adopted.
  - A3 found foreach body must clone declaredVars (body vars don't leak to outer scope).
  - Node-type graph params required special handling: pre-populated in seenNodes, skip flow-order check in graph call args.
  - conditionFieldName multi-segment bug deferred (pre-existing, out of R2 scope).
  - Graft field syntax uses newlines not commas (test fix during implementation).

### v4.1-R1 Ratchets (conditionFieldName Multi-Segment Fix)
- [v4.0-R04] conditionFieldName() bridge exported from ast.ts — UNLOCKED (removed; resolveNestedField replaces it)
- [v4.1-R01] resolveNestedField(segments, obj) exported from flow-runner.ts — traverses nested object properties — LOCKED
- [v4.1-R02] evaluateCondition unified resolution: single-segment variable-first, multi-segment via resolveNestedField — LOCKED
- [v4.1-R03] evalCondition in transforms.ts uses resolveNestedField for field_access, undefined for other Expr kinds — LOCKED

### v4.1-R2 Ratchets (Output Isolation + Exhaustive Switches)
- [v4.1-R04] Graph call child FlowContext gets `outputs: new Map(ctx.outputs)` (shallow clone for isolation) — LOCKED
- [v4.1-R05] evaluateExpr optional 4th param `warnings?: string[]` for division-by-zero reporting — LOCKED
- [v4.1-R06] Exhaustive `never` default on executeFlowNodes switch in flow-runner.ts — LOCKED
- [v4.1-R07] Exhaustive `never` defaults on collectNodeReports and computeFlowCosts switches in estimator.ts — LOCKED
- [v4.1-R08] Exhaustive `never` default on walkFlowNodes switch in scope.ts — LOCKED

### v4.1-R3 Ratchets (Scope Checker Extraction)
- [v4.1-R09] graph-checker.ts: extracted from scope.ts — checkVarCollision, checkExprSources, checkGraphCallArgs, checkGraphRecursion, collectGraphCalls, checkLiteralParamType — LOCKED
- [v4.1-R10] graph-checker.ts functions accept `index: ProgramIndex` as parameter (not `this.index`) — LOCKED
- [v4.1-R11] scope.ts reduced from ~697 to ~503 lines via extraction — LOCKED

### v4.2-R1 Ratchets (Expression Functions)
- [v4.2-R01] Expr union gains 'call' kind: { kind: 'call', name: string, args: Expr[], location } — LOCKED
- [v4.2-R02] BUILTIN_FUNCTIONS registry in ast.ts: Record<string, { arity: number }> with len/max/min/str — LOCKED
- [v4.2-R03] parsePrimary: Identifier + value in BUILTIN_FUNCTIONS + peekType(1) === LParen → function call — LOCKED
- [v4.2-R04] evaluateExpr case 'call': dispatches to built-in functions (len→length, max→Math.max, min→Math.min, str→String) — LOCKED
- [v4.2-R05] checkExprSources case 'call': validates name in BUILTIN_FUNCTIONS, recurses into args — LOCKED
- [v4.2-R06] inferExprType case 'call': returns type per function (len/max/min→number, str→string) — LOCKED
- [v4.2-R07] checkExprTypeErrors validates arity: expr.args.length !== builtin.arity → TYPE_FUNC_ARITY — LOCKED
- [v4.2-R08] SCOPE_UNKNOWN_FUNCTION and TYPE_FUNC_ARITY error codes in diagnostics.ts — LOCKED
- [v4.2-R09] conditionFieldName handles 'call' kind: returns `${name}(...)` — LOCKED

### v4.2-R2 Ratchets (Graph Call Returns + Equality)
- [v4.2-R10] Graph call captures last NodeResult output, stores under flowNode.name in parent ctx.outputs — LOCKED
- [v4.2-R11] evalCondition in transforms.ts uses loose equality (==, !=) matching evaluateCondition — LOCKED

### v4.2-R3 Ratchets (LSP)
- [v4.2-R12] Builtin function completions in graph flow context: Function kind, arity detail — LOCKED
- [v4.2-R13] Hover documentation for len/max/min/str with signature and description — LOCKED

### v4.7-R1 Ratchets (Null Coalescing)
- [v4.7-R01] QuestionQuestion token in lexer, two-char matching — LOCKED
- [v4.7-R02] Binary op union extended: '??' added to ast.ts — LOCKED
- [v4.7-R03] parseNullCoalesce precedence level above parseLogicalOr — LOCKED
- [v4.7-R04] Runtime: ?? checks null/undefined only (0, false, "" are NOT nullish) — LOCKED
- [v4.7-R05] Short-circuit: right side only evaluated if left is null/undefined — LOCKED
- [v4.7-R06] inferExprType: ?? returns left type if known, otherwise right type — LOCKED

### v4.7 Review Feedback
- v4.7-R1 complete: Null coalescing (DIRECT). 12 new tests, 1,214 total. PASS.
  - QuestionQuestion token, parseNullCoalesce precedence
  - Runtime: null/undefined check (not falsy), short-circuit
  - Type inference: left type propagation
- v4.7-R2 complete: Runtime hardening (TEST-ONLY). 8 new tests, 1,222 total. PASS.
  - Edge cases: undefined field access, null nested access, div/mod by zero
  - Variable priority over outputs verified
  - Template with undefined interpolation
- v4.7-R3 complete: Integration + regression (TEST-ONLY). 18 new tests, 1,240 total. PASS.
  - Cross-feature: ?? with conditional, logical, arithmetic, function calls
  - All 11 binary operators verified at runtime
- v4.7 COMPLETE: 3 rounds (R1-R3). Null coalescing, runtime hardening, integration. 1,240 tests. 6 new ratchets.

### v4.6-R1 Ratchets (Logical Operators)
- [v4.6-R01] AmpAmp and PipePipe tokens in lexer, two-char matching — LOCKED
- [v4.6-R02] Binary op union extended: '&&' | '||' added to ast.ts — LOCKED
- [v4.6-R03] parseLogicalOr and parseLogicalAnd precedence levels: || < && < comparison — LOCKED
- [v4.6-R04] Short-circuit evaluation: && returns left if falsy, || returns left if truthy — LOCKED
- [v4.6-R05] inferExprType: && and || return 'boolean' — LOCKED
- [v4.6-R06] checkExprTypeErrors: logical operators warn on non-boolean operands — LOCKED

### v4.6-R2 Ratchets (Conditional Type Mismatch Warning)
- [v4.6-R07] TYPE_CONDITIONAL_MISMATCH error code in TypeErrorCode union — LOCKED
- [v4.6-R08] checkExprTypeErrors: conditional branches with different known types emit warning — LOCKED
- [v4.6-R09] Warning severity (not error): mismatched conditional branches still compile — LOCKED

### v4.6 Review Feedback
- v4.6-R1 complete: Logical operators (DIRECT). 17 new tests, 1,183 total. PASS.
  - AmpAmp/PipePipe tokens, parseLogicalOr/parseLogicalAnd precedence
  - Short-circuit evaluation in expr-eval.ts
  - Type checker warns on non-boolean operands
- v4.6-R2 complete: Conditional type mismatch warning (DIRECT). 7 new tests, 1,190 total. PASS.
  - TYPE_CONDITIONAL_MISMATCH warning for mismatched branch types
  - Warnings go to result.warnings (not result.errors)
- v4.6-R3 complete: Integration + regression (TEST-ONLY). 12 new tests, 1,202 total. PASS.
  - Cross-feature: logical + conditional + comparison + arithmetic
  - Regression: all expression features intact
  - Complex expressions with all operator types compile
- v4.6 COMPLETE: 3 rounds (R1-R3). Logical operators, conditional warning, integration. 1,202 tests. 9 new ratchets.

### v4.5-R1 Ratchets (Comparison Operators)
- [v4.5-R01] Six comparison tokens: Greater, Less, GreaterEqual, LessEqual, EqualEqual, BangEqual — LOCKED
- [v4.5-R02] parseComparison precedence level between parseExpr and parseAdditive — LOCKED
- [v4.5-R03] Binary op union extended: '<' | '>' | '<=' | '>=' | '==' | '!=' — LOCKED
- [v4.5-R04] evaluateExpr comparison: ordered ops use Number(), equality uses == (loose) — LOCKED
- [v4.5-R05] inferExprType: comparison ops return 'boolean' — LOCKED
- [v4.5-R06] checkExprTypeErrors: ordered comparison requires numeric, equality allows any — LOCKED

### v4.5-R2 Ratchets (Conditional Expressions)
- [v4.5-R07] If and Then keywords in tokens.ts KEYWORDS map — LOCKED
- [v4.5-R08] conditional Expr kind: { condition, consequent, alternate, location } — LOCKED
- [v4.5-R09] parsePrimary: if <expr> then <expr> else <expr> parsed as conditional — LOCKED
- [v4.5-R10] evaluateExpr conditional: truthy → consequent, falsy → alternate — LOCKED
- [v4.5-R11] inferExprType conditional: matching branch types propagate, mismatch → 'unknown' — LOCKED
- [v4.5-R12] checkExprSources + checkExprTypeErrors recurse into all 3 conditional sub-exprs — LOCKED
- [v4.5-R13] TextMate grammar: 'if' and 'then' added to keyword pattern — LOCKED

### v4.5 Review Feedback
- v4.5-R1 complete: Comparison operators (DIRECT). 17 new tests, 1,140 total. PASS.
  - Six comparison tokens with parseComparison precedence level
  - Type checker: ordered comparison requires numeric, equality allows any
  - Runtime evaluation with Number() coercion for ordered ops
- v4.5-R2 complete: Conditional expressions (DIRECT). 11 new tests, 1,151 total. PASS.
  - If/Then keywords, conditional Expr kind, parser in parsePrimary
  - Runtime: truthy/falsy evaluation
  - Type inference: matching branch types propagate
- v4.5-R3 complete: Integration + regression (TEST-ONLY). 15 new tests, 1,166 total. PASS.
  - Cross-feature: conditional with comparison, chained let, nested conditional runtime
  - Regression: if/then keywords don't break identifiers, arithmetic still works
  - Fixed: stale 2-arg Lexer constructor in template parsing
- v4.5 COMPLETE: 3 rounds (R1-R3). Comparison operators, conditional expressions, integration. 1,166 tests. 13 new ratchets.

### v4.4-R1 Ratchets (evaluateExpr Extraction)
- [v4.4-R01] src/runtime/expr-eval.ts: evaluateExpr + resolveNestedField extracted from flow-runner.ts — LOCKED
- [v4.4-R02] flow-runner.ts re-exports evaluateExpr and resolveNestedField for backward compatibility — LOCKED

### v4.4-R2 Ratchets (String Interpolation)
- [v4.4-R03] TemplateString token type in lexer, detected by ${ inside string — LOCKED
- [v4.4-R04] Escaped \${ in strings produces literal ${ and remains StringLiteral — LOCKED
- [v4.4-R05] TemplatePart type: { kind: 'text'; value: string } | { kind: 'expr'; value: Expr } — LOCKED
- [v4.4-R06] Template Expr kind: { kind: 'template'; parts: TemplatePart[]; location } — LOCKED
- [v4.4-R07] parseTemplateParts: splits raw string on ${...} with brace depth counting — LOCKED
- [v4.4-R08] Inner expressions parsed via new Lexer + new Parser on substring — LOCKED
- [v4.4-R09] evaluateExpr template case: map parts, String() auto-conversion, join('') — LOCKED
- [v4.4-R10] inferExprType: template always returns 'string' — LOCKED
- [v4.4-R11] checkExprSources and checkExprTypeErrors: recurse into template expr parts — LOCKED

### v4.4-R3 Ratchets (BUILTIN_FUNCTIONS Enrichment + Memory Archival)
- [v4.4-R12] BUILTIN_FUNCTIONS extended with returnType, signature, description fields — LOCKED
- [v4.4-R13] inferExprType reads BUILTIN_FUNCTIONS[name].returnType instead of hardcoded switch — LOCKED
- [v4.4-R14] Hover docs generated from BUILTIN_FUNCTIONS.signature + .description, FUNC_DOCS removed — LOCKED
- [v4.4-R15] T1-v2.2 ratchets archived to harness/archived_ratchets.md (~100 items) — LOCKED

### v4.4 Review Feedback
- v4.4-R1 complete: evaluateExpr extraction (DIRECT). 11 new tests, 1,088 total. PASS.
  - New file: src/runtime/expr-eval.ts (96 lines)
  - flow-runner.ts dropped from 404 to 311 lines
  - Re-export for backward compatibility confirmed by identity test
- v4.4-R2 complete: String interpolation (MEDIUM). 15 new tests, 1,103 total. PASS.
  - TemplateString token in lexer with ${ detection and \${ escape
  - Template Expr kind with TemplatePart[] (text + expr)
  - Parser: parseTemplateParts with brace depth counting, inner Lexer+Parser
  - Runtime: template evaluation via map+join
  - Type checker: template -> 'string', recurse into parts
  - Scope checker: recurse into template expr parts
- v4.4-R3 complete: BUILTIN_FUNCTIONS enrichment + memory archival (DIRECT). 12 new tests, 1,115 total. PASS.
  - Registry extended with returnType, signature, description
  - inferExprType reads from registry (2 lines replace 10-line switch)
  - Hover docs from registry (3 lines replace 10-line FUNC_DOCS record)
  - T1-v2.2 ratchets archived to harness/archived_ratchets.md
  - common_memory.md reduced from ~650 to ~530 lines
- v4.4-R4 complete: Integration + regression tests (TEST-ONLY). 8 new tests, 1,123 total. PASS.
  - Cross-feature: template with function call, template with multiplication, template in let binding
  - Regression: flow-runner imports, all 7 expression types
  - Scale: pipeline with templates + operators + builtins compiles
- v4.4 COMPLETE: 4 rounds (R1-R4). Expression extraction, string interpolation, registry enrichment, memory archival. 1,123 tests. 15 new ratchets.

### v4.3-R1 Ratchets (Multiplication/Modulo + New Builtins)
- [v4.3-R01] Star and Percent tokens in lexer, SINGLE_CHAR map — LOCKED
- [v4.3-R02] Binary ops extended: '*' | '%' added to op union in ast.ts — LOCKED
- [v4.3-R03] parseMultiplicative precedence level: Star, Percent, Slash between additive and unary — LOCKED
- [v4.3-R04] Division moved to multiplicative level (v4.0-R02 UNLOCKED) for standard math semantics — LOCKED
- [v4.3-R05] evaluateExpr: * and % with modulo-by-zero warning — LOCKED
- [v4.3-R06] New builtins: abs(1), round(1), keys(1) added to BUILTIN_FUNCTIONS — LOCKED
- [v4.3-R07] keys() returns Object.keys() for objects, [] for non-objects — LOCKED
- [v4.3-R08] str() uses JSON.stringify for objects/arrays, String() for primitives — LOCKED
- [v4.3-R09] inferExprType: abs→number, round→number, keys→unknown — LOCKED
- [v4.3-R10] Hover docs for abs, round, keys with signatures — LOCKED

### v4.3 Review Feedback
- v4.3-R1 complete: Multiplication/modulo + new builtins (MEDIUM tier). 15 new tests, 1,063 total. PASS.
  - Star/Percent tokens, parseMultiplicative precedence level
  - Division moved from additive to multiplicative (ratchet unlock)
  - 3 new builtins: abs, round, keys
  - str() improved to JSON.stringify for objects
- v4.3-R2 complete: str() fix + division precedence test (DIRECT tier). 6 new tests, 1,069 total. PASS.
  - str() on null returns "null" (JSON.stringify null handling)
  - resolveNestedField exported and tested
  - Division precedence verified: 2 + 6/3 = 4
- v4.3-R3 complete: Integration + regression tests (TEST-ONLY tier). 8 new tests, 1,077 total. PASS.
  - Cross-feature: multiplication in let binding, keys+len composition
  - Regression: +, -, / operators, existing builtins still work
  - Scale: pipeline with *, %, abs, round, keys compiles; precedence test
- v4.3 COMPLETE: 3 rounds (R1-R3). Multiplication/modulo, new builtins (abs/round/keys), str() fix, division precedence fix. 1,077 tests. 10 new ratchets, 1 unlocked.

### v4.2 Review Feedback
- v4.2-R1 complete: Expression functions (MEDIUM tier). 21 new tests, 1,022 total. PASS.
  - New 'call' Expr kind with BUILTIN_FUNCTIONS registry
  - Parser disambiguation: only builtin names + LParen → call; unknown names remain field_access
  - Scope checker validates function names, type checker validates arity
- v4.2-R2 complete: Graph call return values + equality unification (DIRECT tier). 7 new tests, 1,029 total. PASS.
  - Graph call output capture: track beforeCount, capture last result, store in parent outputs
  - Equality fix: transforms.ts === → == (one-line change, high impact)
- v4.2-R3 complete: LSP updates (DIRECT tier). 5 new tests, 1,034 total. PASS.
  - Builtin function completions with Function kind
  - Hover docs with signatures and descriptions
- v4.2-R4 complete: Integration + regression tests (TEST-ONLY tier). 10 new tests, 1,048 total. PASS.
  - Cross-feature: function+variable, function+graph return, function in binary expr
  - Regression: existing patterns, unified equality, let bindings
  - Scale: complex pipeline with functions + graph returns + sub-pipelines
- v4.2 COMPLETE: 4 rounds (R1-R4). Expression functions, graph call returns, equality unification. 1,048 tests. 13 new ratchets.

### v4.1 Review Feedback
- v4.1-R1 complete: conditionFieldName multi-segment fix (MEDIUM tier). 11 new tests, 991 total. PASS.
  - resolveNestedField replaces conditionFieldName for runtime value lookup
  - conditionFieldName bridge removed from ast.ts (no longer needed after full migration)
  - Single-segment backward compatibility preserved (variable-first resolution)
- v4.1-R2 complete: Output isolation + division warning + exhaustive switches (DIRECT tier). 5 new tests, 996 total. PASS.
  - Graph call child context isolation via shallow Map clone
  - Division-by-zero warning via optional warnings array (non-breaking API)
  - 4 exhaustive never defaults added across 3 files
- v4.1-R3 complete: Scope checker extraction (DIRECT tier). 0 new tests, 996 total (pure refactor). PASS.
  - graph-checker.ts extracted 6 functions from scope.ts (~194 lines moved)
  - No behavioral changes, all existing tests pass unchanged
- v4.1-R4 complete: Integration + regression tests (TEST-ONLY tier). 10 new tests, 1001 total. PASS.
  - Cross-feature: multi-segment condition + conditional routing at runtime
  - Regression: graph call with params, let bindings, transform filter conditions, resolveNestedField edge cases
  - Scale: complex pipeline with let + graph call + params compiles end-to-end
  - Error: scope checker extraction didn't break SCOPE_VAR_ORDER detection
- v4.1 COMPLETE: 4 rounds (R1-R4). Quality hardening — conditionFieldName fix, output isolation, scope extraction, exhaustive switches. 1,001 tests. 11 new ratchets, 1 unlocked.

### v4.0-R1 Review Feedback
- v4.0-R1 complete: Lexer + AST + Expression Parser (HIGH tier, full 4-agent debate). 31 new tests, 921 total. PASS on first try.
  - Forced dissent (A1): 4 self-rebuttals, 2 accepted (Node not in KEYWORDS, foreach allows graph_call), 2 rejected (flat division is fine, bridge helper is fine)
  - A3 retracted let-without-arrows (spec example was pseudocode)
  - A4 withdrew multiplicative precedence level (spec grammar is flat)
  - Condition.field → Condition.left migration: 4 source files + 142 test occurrences across 15 files, all migrated via conditionFieldName() bridge + mkCond() helper
