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

---

## v3.0 through v3.9 Ratchets (archived v5.0, ~91 items, all LOCKED unless noted)

### v3.0 Ratchets (34 items)
- [v3.0-R01] compileToProgram() does NOT check GRAPH_MISSING (codegen prerequisite only) — LOCKED
- [v3.0-R02] ProgramIndex optional param with ?? new ProgramIndex(program) fallback on ScopeChecker, TokenEstimator, Executor — LOCKED
- [v3.0-R03] RuntimeState interface in prompt-builder.ts; PromptContext and FlowContext extend it — LOCKED
- [v3.0-R04] WriteRef { memory, field?, location } replaces string[] on NodeDecl.writes — LOCKED
- [v3.0-R05] ContextRef.field changes from string | undefined to string[] | undefined — LOCKED
- [v3.0-R06] Multi-field brace syntax: reads: [Ctx.{f1, f2}] parsed to field: ["f1", "f2"] — LOCKED
- [v3.0-R07] Estimator scaling: Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1.0) at all 3 sites — LOCKED
- [v3.0-R08] Codegen single-field dot, multi-field brace display — LOCKED
- [v3.0-R09] Scope checker validates WriteRef.field against memory schema — LOCKED
- [v3.0-R10] CodegenBackend interface with 4 fine-grained methods — LOCKED
- [v3.0-R11] ClaudeCodeBackend delegates to existing standalone functions — LOCKED
- [v3.0-R12] generate() accepts optional backend param, defaults to ClaudeCodeBackend — LOCKED
- [v3.0-R13] ProgramIndex.graphMap: Map<string, GraphDecl> — LOCKED
- [v3.0-R14] CONFIG_UNKNOWN_BACKEND error code in GraftErrorCode union — LOCKED
- [v3.0-R15] generateSettings() accepts optional ProgramIndex — LOCKED
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex — UNLOCKED (now accepts ProgramIndex)
- [v3.0-R16] ProgramIndex.producesFieldsMap: Map<string, Map<string, TypeExpr>> — LOCKED
- [v3.0-R17] ProgramIndex.memoryFieldsMap: Map<string, Map<string, TypeExpr>> — LOCKED
- [v3.0-R18] TypeChecker accepts optional ProgramIndex — LOCKED
- [v3.0-R19] TYPE_WRITE_FIELD_OVERLAP error code — LOCKED
- [v1.2-R07] Abort-on-failure MVP — UNLOCKED (fully implemented in R5)
- [v3.0-R20] executeWithFailureStrategy in flow-runner.ts — LOCKED
- [v3.0-R21] FlowContext.getFailureStrategy optional method — LOCKED
- [v3.0-R22] Executor passes getFailureStrategy via nodeDecl.onFailure lookup — LOCKED
- [v3.0-R23] SCOPE_INVALID_FALLBACK error code — LOCKED
- [v2.2-R08] GraftErrorCode: 18-member union type — UNLOCKED (now 30+ members)
- [v2.2-R10] Parser/lexer remain throw-based — UNLOCKED (parser now has PARSE_ codes)
- [v3.0-R24] SourceLocation.length?: number on all tokens — LOCKED
- [v3.0-R25] GraftErrorCode = ParseErrorCode | ScopeErrorCode | TypeErrorCode | BudgetErrorCode | ImportErrorCode | GraphErrorCode | ConfigErrorCode — LOCKED
- [v3.0-R26] TRANSFORM_ON_CONDITIONAL renamed to SCOPE_TRANSFORM_CONDITIONAL — LOCKED
- [v3.0-R27] PARSE_UNEXPECTED_TOKEN and PARSE_MISSING_FIELD on parser throws — LOCKED
- [v3.0-R28] Foreach binding save/restore (hadBinding + prevBinding pattern) — LOCKED
- [v3.0-R29] Dead bench script removed from package.json — LOCKED
- [v3.0-R30] LSP 200ms debounce on onDidChangeContent — LOCKED
- [v3.0-R31] saveMemory accepts optional fields?: string[] — LOCKED
- [v3.0-R32] Executor passes WriteRef.field to saveMemory — LOCKED
- [v3.0-R33] LSP import dependency tracking with transitive invalidation — LOCKED
- [v3.0-R34] LSP diagnostic ranges use SourceLocation.length — LOCKED

### v3.1 Ratchets (12 items)
- [v3.1-R01] getCompletions() pure function in features.ts — LOCKED
- [v3.1-R02] LSP completionProvider triggerCharacters: ['.', '[', '{'] — LOCKED
- [v3.1-R03] Comment suppression: isInComment() scans from document start — LOCKED
- [v3.1-R04] String literal suppression: isInString() checks unmatched quotes — LOCKED
- [v3.1-R05] Parallel branches call executeWithFailureStrategy — LOCKED
- [v3.1-R06] SCOPE_FALLBACK_CYCLE error code — LOCKED
- [v3.1-R07] Fallback cycle detection uses DFS with visited + in-stack sets — LOCKED
- [v3.1-R08] Executor uses this.index.nodeMap/edgesBySource exclusively — LOCKED
- [v3.1-R09] ScopeChecker derives name lookups from this.index.*Map.has() — LOCKED
- [v3.1-R10] formatTokenReport() in src/format.ts shared between compile and check — LOCKED
- [v3.1-R11] src/types.ts is the ONLY barrel file — LOCKED
- [v3.1-R12] Sub-path exports: ./compiler, ./runtime, ./types in package.json — LOCKED

### v3.2 Ratchets (7 items)
- [v3.2-R01] Parser.parse() returns ParseResult { program, errors } — LOCKED
- [v3.2-R02] synchronize() tracks brace depth — LOCKED
- [v3.2-R03] Inner parseX functions keep throwing; only top-level parse() catches — LOCKED
- [v3.2-R04] MAX_ERRORS = 25 — LOCKED
- [v3.2-R05] Progress guard: if synchronize() doesn't advance, force advance — LOCKED
- [v2.2-R10] Parser/lexer remain throw-based — UNLOCKED (parser error accumulation)
- [v3.2-R06] KEYWORD_DOCS checked before ProgramIndex in getHoverInfo() — LOCKED
- [v3.2-R07] LRU cache eviction at MAX_CACHE_SIZE = 50 — LOCKED

### v3.3 Ratchets (10 items)
- [v3.3-R01] extractUndefinedName() uses message regex primary, getWordAtPosition fallback — LOCKED
- [v3.3-R02] computeRelativeImportPath() with backslash normalization — LOCKED
- [v3.3-R03] Workspace export cache: lazy scan, Map<exportName, filePath> — LOCKED
- [v3.3-R04] Import insertion after last existing import line — LOCKED
- [v3.3-R05] codeActionProvider with CodeActionKind.QuickFix only — LOCKED
- [v3.3-R06] evaluateCondition() exported from flow-runner.ts with 6 operators — UNLOCKED (function removed in v5.0-R2)
- [v3.3-R07] FlowContext.getConditionalEdge optional method — LOCKED
- [v3.3-R08] Branch selection: first matching when wins, else as default — LOCKED
- [v3.3-R09] Numeric coercion via Number() for ordered comparison operators — LOCKED
- [v3.3-R10] TYPE_CONDITION_MISMATCH error code — LOCKED

### v3.4 Ratchets (10 items)
- [v3.4-R01] isRenameable checks contextMap, nodeMap, memoryMap, graphMap — LOCKED
- [v3.4-R02] collectRenameLocations uses word-boundary regex — LOCKED
- [v3.4-R03] prepareRename returns null for non-renameable — LOCKED
- [v3.4-R04] Cross-file rename scans workspace exports cache — LOCKED
- [v3.4-R05] Rename rejects if newName conflicts — LOCKED
- [v3.4-R06] Conditional edge estimation: best=min, worst=max branch cost — LOCKED
- [v3.4-R07] features.ts split into 8 modules under features/ — LOCKED
- [v3.4-R08] features/utils.ts holds getWordAtPosition — LOCKED
- [v3.4-R09] Document symbol children: fields as Field, flow nodes as Function — LOCKED
- [v3.4-R10] buildAutoImportActions pure function — LOCKED

### v3.5 Ratchets (10 items)
- [v3.5-R01] CRLF normalization in collectRenameLocations — LOCKED
- [v3.5-R02] isInComment/isInString extracted to features/utils.ts — LOCKED
- [v3.5-R03] collectRenameLocations skips comments, strings, import paths — LOCKED
- [v3.5-R04] newName validation: /^[A-Za-z_][A-Za-z0-9_]*$/ + GRAFT_KEYWORDS blacklist — LOCKED
- [v3.5-R05] buildRenameEdits pure function in features/rename.ts — LOCKED
- [v3.5-R06] Cross-file conflict detection before applying rename — LOCKED
- [v3.5-R07] GRAFT_KEYWORDS Set (26 keywords) exported from features/rename.ts — LOCKED
- [v3.5-R08] FlowNode all three kinds have optional location?: SourceLocation — LOCKED
- [v3.5-R09] Parser captures location at keyword/identifier for all FlowNode kinds — LOCKED
- [v3.5-R10] Document symbols: parallel/foreach as children with labels — LOCKED

### v3.6 Ratchets (8 items)
- [v3.6-R01] isReferable checks 5 ProgramIndex maps — LOCKED
- [v3.6-R02] findReferences reuses collectRenameLocations — LOCKED
- [v3.6-R03] Cross-file references scan ALL workspace files with includes() pre-filter — LOCKED
- [v3.6-R04] includeDeclaration filtering via keyword-length position — LOCKED
- [v3.6-R05] GRAFT_KEYWORDS derived from lexer KEYWORDS minus type keywords and output — LOCKED
- [v3.6-R06] Cross-file conflict detection uses Parser+ProgramIndex, not regex — LOCKED
- [v3.6-R07] makeSymbol range spans keyword→name, selectionRange is name-only — LOCKED
- [v3.6-R08] Rename field collision guard checks context/memory/produces fields — LOCKED

---

## v4.0 through v4.4 IMPL Ratchets (archived v5.0, all LOCKED unless noted)

> DESIGN ratchets retained in common_memory.md: v4.0-R01, R03 (SUPERSEDED), R09, R11, R20, R21, v4.4-R08

### v4.0 IMPL Ratchets
- [v4.0-R02] Division at additive precedence — UNLOCKED (moved to multiplicative in v4.3)
- [v4.0-R04] conditionFieldName() bridge — UNLOCKED (removed; resolveNestedField replaces it)
- [v4.0-R05] Let: arrow-connected FlowNode kind — LOCKED
- [v4.0-R06] Graph call: LL(1) disambiguation — LOCKED
- [v4.0-R07] parsePrimary: permissive first segment (accepts KEYWORD_TYPES) — LOCKED
- [v4.0-R08] Graph params: after budget, comma-separated — LOCKED
- [v4.0-R10] Graph call zero args: allowed at parser, validated by analyzer — LOCKED
- [v4.0-R12] GraphDecl.params: GraphParam[] required field, defaults to [] — LOCKED
- [v4.0-R13] New tokens: Plus, Minus, Bang, Equals, Let — LOCKED
- [v4.0-R14] mkCond() test helper in tests/helpers.ts — LOCKED
- [v4.0-R15] KIntegerLiteral included in parsePrimary — LOCKED
- [v4.0-R16] declaredVars: Set<string> tracked in walkFlowNodes — LOCKED
- [v4.0-R17] seenNodes: Set<string> tracks node appearance order — LOCKED
- [v4.0-R18] checkVarCollision checks nodeMap, contextMap, memoryMap, graphMap + duplicate vars — LOCKED
- [v4.0-R19] checkGraphRecursion: DFS with visited+inStack — LOCKED
- [v4.0-R22] 6 new ScopeErrorCodes + 2 new TypeErrorCodes — LOCKED
- [v4.0-R23] evaluateExpr: recursive evaluator for Expr AST — LOCKED
- [v4.0-R24] Variable-first resolution in evaluateExpr — LOCKED
- [v4.0-R25] evaluateCondition: accepts optional variables param — LOCKED
- [v4.0-R26] executeFlowNodes case 'let': lazy variables, evaluates expr, stores — LOCKED
- [v4.0-R27] executeFlowNodes case 'graph_call': child FlowContext with own variables — LOCKED
- [v4.0-R28] FlowContext: added variables?, getGraphDecl? — LOCKED
- [v4.0-R29] TokenEstimator: case 'let' zero cost, case 'graph_call' recurses — LOCKED
- [v4.0-R30] Orchestration codegen: let → [data binding], graph_call → [sub-pipeline] — LOCKED
- [v4.0-R31] Graph params section in orchestration header — LOCKED
- [v4.0-R32] Document symbols: let → Variable kind, graph_call → Function kind — LOCKED
- [v4.0-R33] Completions in graph flow: 'let' keyword + graph names — LOCKED

### v4.1 IMPL Ratchets
- [v4.1-R01] resolveNestedField(segments, obj) exported from flow-runner.ts — LOCKED
- [v4.1-R02] evaluateCondition unified resolution — LOCKED
- [v4.1-R03] evalCondition in transforms.ts uses resolveNestedField — LOCKED
- [v4.1-R04] Graph call child FlowContext gets outputs: new Map (shallow clone) — LOCKED
- [v4.1-R05] evaluateExpr optional 4th param warnings?: string[] — LOCKED
- [v4.1-R06] Exhaustive never default on executeFlowNodes switch — LOCKED
- [v4.1-R07] Exhaustive never defaults on estimator switches — LOCKED
- [v4.1-R08] Exhaustive never default on walkFlowNodes switch — LOCKED
- [v4.1-R09] graph-checker.ts: extracted from scope.ts — LOCKED
- [v4.1-R10] graph-checker.ts functions accept index: ProgramIndex — LOCKED
- [v4.1-R11] scope.ts reduced from ~697 to ~503 lines — LOCKED

### v4.2 IMPL Ratchets
- [v4.2-R01] Expr union gains 'call' kind — LOCKED
- [v4.2-R02] BUILTIN_FUNCTIONS registry in ast.ts — LOCKED
- [v4.2-R03] parsePrimary: Identifier + BUILTIN_FUNCTIONS + LParen → function call — LOCKED
- [v4.2-R04] evaluateExpr case 'call': dispatches to built-in functions — LOCKED
- [v4.2-R05] checkExprSources case 'call': validates name, recurses args — LOCKED
- [v4.2-R06] inferExprType case 'call': returns type per function — LOCKED
- [v4.2-R07] checkExprTypeErrors validates arity — LOCKED
- [v4.2-R08] SCOPE_UNKNOWN_FUNCTION and TYPE_FUNC_ARITY error codes — LOCKED
- [v4.2-R09] conditionFieldName handles 'call' kind — LOCKED
- [v4.2-R10] Graph call captures last NodeResult output — LOCKED
- [v4.2-R11] evalCondition uses loose equality matching evaluateCondition — LOCKED
- [v4.2-R12] Builtin function completions: Function kind, arity detail — LOCKED
- [v4.2-R13] Hover documentation for len/max/min/str — LOCKED

### v4.3 IMPL Ratchets
- [v4.3-R01] Star and Percent tokens in lexer — LOCKED
- [v4.3-R02] Binary ops extended: '*' | '%' — LOCKED
- [v4.3-R03] parseMultiplicative precedence level — LOCKED
- [v4.3-R04] Division moved to multiplicative level — LOCKED
- [v4.3-R05] evaluateExpr: * and % with modulo-by-zero warning — LOCKED
- [v4.3-R06] New builtins: abs(1), round(1), keys(1) — LOCKED
- [v4.3-R07] keys() returns Object.keys() for objects — LOCKED
- [v4.3-R08] str() uses JSON.stringify for objects/arrays — LOCKED
- [v4.3-R09] inferExprType: abs→number, round→number, keys→unknown — LOCKED
- [v4.3-R10] Hover docs for abs, round, keys — LOCKED

### v4.4 IMPL Ratchets
- [v4.4-R01] src/runtime/expr-eval.ts: evaluateExpr + resolveNestedField extracted — LOCKED
- [v4.4-R02] flow-runner.ts re-exports evaluateExpr and resolveNestedField — LOCKED
- [v4.4-R03] TemplateString token type in lexer — LOCKED
- [v4.4-R04] Escaped \${ produces literal ${ — LOCKED
- [v4.4-R05] TemplatePart type: text | expr — LOCKED
- [v4.4-R06] Template Expr kind: { kind: 'template', parts, location } — LOCKED
- [v4.4-R07] parseTemplateParts: splits on ${...} with brace depth — LOCKED
- [v4.4-R09] evaluateExpr template case: map parts, String(), join('') — LOCKED
- [v4.4-R10] inferExprType: template always returns 'string' — LOCKED
- [v4.4-R11] checkExprSources and checkExprTypeErrors: recurse into template parts — LOCKED
- [v4.4-R12] BUILTIN_FUNCTIONS extended with returnType, signature, description — LOCKED
- [v4.4-R13] inferExprType reads BUILTIN_FUNCTIONS[name].returnType — LOCKED
- [v4.4-R14] Hover docs generated from BUILTIN_FUNCTIONS registry — LOCKED
- [v4.4-R15] T1-v2.2 ratchets archived to harness/archived_ratchets.md — LOCKED
