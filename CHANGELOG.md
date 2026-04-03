# Changelog

## v5.5.0 (2026-04-03)

### Added
- **VS Code extension packaging**: `vsce package` verified, 4KB .vsix output
- LICENSE file added to editors/vscode/

### Fixed
- Removed missing icon.png reference from VS Code extension package.json

### Stats
- 1,344 tests, all passing
- VS Code extension: builds, packages, ready for marketplace publish

## v5.4.0 (2026-04-03)

### Changed
- **README**: hook references updated (.sh→.js), graft init in CLI section, test count, version history
- **npm package**: source maps disabled (72KB vs 114KB), .npmignore cleaned
- **M1 checklist**: M1-2 marked complete, e2e verification results documented

### Stats
- 1,344 tests, all passing
- npm package: 95 files, 72KB compressed

## v5.3.0 (2026-04-03)

### Added
- **Parallel codegen tests**: 9 new tests covering parallel→sequential edge transforms, Agent tool dispatch, hook graceful no-op, agent input overrides
- **code-review.gft integration test**: full 4-agent parallel pipeline e2e compilation with all assertions
- **Hook entry merging**: multiple edge transform hooks now share one PostToolUse "Write" matcher entry instead of separate entries

### Fixed
- **Hook schema**: `if` field verified against Claude Code spec (glob pattern syntax)
- **settings.json cleanliness**: 3 separate "Write" entries → 1 entry with 3 hooks

### Stats
- 1,344 tests (10 new), all passing
- code-review.gft + chatbot.gft + hello.gft all compile correctly

## v5.2.0 (2026-04-03)

### Fixed
- **Parallel→sequential edge transforms**: orchestration CLAUDE.md now generates edge transform instructions when a sequential node follows a parallel block (was silently skipped)
- **Agent input paths**: downstream nodes (e.g., SeniorReviewer after parallel reviewers) get exact transformed input file paths in agent MD instead of vague `.graft/session/` reference
- **Graceful hook no-op**: hook scripts exit(0) instead of exit(1) when input file doesn't exist, preventing failures from hooks firing on unrelated Write calls
- **Parallel dispatch instruction**: orchestration explicitly tells Claude Code to "dispatch all N agents concurrently using the Agent tool in a single message"

### Changed
- `agents.ts`: accepts `inputOverrides` map for edge-transformed input resolution
- `claude-backend.ts`: computes input overrides from program edges at codegen time

### Stats
- 1,334 tests (all passing)
- code-review.gft (4-agent parallel pipeline) compiles to correct orchestration structure
- Verified: hello.gft sequential pipeline output unchanged

## v5.1.0 (2026-04-03)

### Added
- **`graft init <name>`** command: scaffolds a new Graft project with a working two-node pipeline
- **GitHub Actions CI**: test matrix (Node 20/22) on push/PR, automated npm publish on tag
- **VS Code extension packaging**: `.vscodeignore`, vsce scripts, version sync

### Fixed
- **Claude Code hook format**: settings.json hooks now use `{ matcher, hooks: [{ type: "command", command }] }` (was flat `{ matcher, command }`)
- **Agent frontmatter**: added required `description` field, omit `tools:` line when empty

### Changed
- **README rewritten**: Quick Start focus, concise language overview, updated to v5.0 features
- **VS Code extension**: version bumped to 5.0.0, added repository and icon fields

### Stats
- 1,334 tests (all passing), Claude Code output verified against spec
- M1 milestone: install, compile, run — all working

## v5.0.0 (2026-04-03)

### Changed
- **Condition→Expr AST unification**: removed legacy `Condition` interface and `conditionFieldName()` function. `ConditionalBranch.condition` and `Transform` filter now use binary `Expr`
- **evaluateCondition/evalCondition removed**: conditional edge routing and filter transforms now use `evaluateExpr` with `Record→Map` conversion
- **Strict equality**: `==` and `!=` in expressions now use `===`/`!==` (no cross-type coercion)
- **formatExpr extraction**: moved to `src/format.ts` (single source of truth, re-exported from hover.ts)
- **Exhaustive switch defaults**: all `Expr` switch dispatchers have `never` defaults for compile-time safety
- **Ratchet archival**: v3.0-v3.9 + v4.0-v4.4 IMPL ratchets archived. `common_memory.md` reduced from 683 to 149 lines

### Breaking
- `Condition` type no longer exported from `ast.ts`
- `evaluateCondition` no longer exported from `flow-runner.ts`
- `evalCondition` no longer exported from `transforms.ts`
- `conditionFieldName()` no longer exported from `ast.ts`
- Equality operators use strict comparison (`"5" == 5` is now `false`)

### Stats
- 1,333 tests (57 new), ~30 ratchets (active), ~275 archived
- 5 rounds: R1 AST unification, R2 function removal, R3 strict equality, R4 ratchet archival, R5 integration tests

## v4.9.0 (2026-04-02)

### Added
- **Codegen expression display**: `let` bindings in orchestration output show formatted expressions
  - `formatExpr()` renders all 9 Expr kinds to human-readable strings
  - Graph call arguments also show formatted expressions
- **formatExpr exported** from hover.ts for reuse

### Stats
- 1,277 tests (7 new), ~326 ratchets
- 1 round (codegen enhancement + regression). **Final v4.x release.**

## v4.8.0 (2026-04-02)

### Added
- **Variable hover**: hovering over a `let` binding variable shows its expression and graph context
  - `formatExpr()` function for human-readable expression rendering
  - Shows all 9 Expr kinds including conditionals, templates, null coalescing
- **Variable go-to-definition**: jump to `let` declaration from variable references
- **Expression completions**: `if`, `true`, `false` keywords + variable names in graph flow context
- **ProgramIndex.letBindingMap**: indexes all `let` bindings across graphs (including nested foreach)
  - `LetBinding` interface exported from program-index.ts

### Stats
- 1,270 tests (30 new), ~320 ratchets
- 3 rounds (R1 hover + go-to-def, R2 completions, R3 integration)

## v4.7.0 (2026-04-02)

### Added
- **Null coalescing operator**: `??` for safe default values
  - New `QuestionQuestion` token in lexer
  - New `parseNullCoalesce` precedence level (highest below assignment)
  - Checks for null/undefined only — `0`, `false`, `""` are NOT nullish
  - Short-circuit: right side only evaluated if left is null/undefined
  - Type inference: left type if known, otherwise right type
- **TextMate grammar**: `??` added to operator pattern

### Stats
- 1,240 tests (38 new), ~310 ratchets
- 3 rounds (R1 null coalescing, R2 runtime hardening, R3 integration)

## v4.6.0 (2026-04-02)

### Added
- **Logical operators**: `&&` (AND) and `||` (OR) with short-circuit evaluation
  - New `AmpAmp` and `PipePipe` tokens in lexer
  - New `parseLogicalOr` and `parseLogicalAnd` precedence levels
  - Short-circuit: `&&` returns left if falsy, `||` returns left if truthy
  - Type inference: logical operators return `boolean`
  - Type checker warns on non-boolean operands
- **Conditional branch type mismatch warning**: `TYPE_CONDITIONAL_MISMATCH`
  - Warns when `if-then-else` branches have different known types
  - Severity: warning (code still compiles)
- **TextMate grammar**: `&&` and `||` added to operator pattern

### Stats
- 1,202 tests (36 new), ~301 ratchets
- 3 rounds (R1 logical ops, R2 type mismatch warning, R3 integration)

## v4.5.0 (2026-04-02)

### Added
- **Comparison operators**: `<`, `>`, `<=`, `>=`, `==`, `!=` in expressions
  - New `parseComparison` precedence level (lower than additive, higher than assignment)
  - Six new token types: `Greater`, `Less`, `GreaterEqual`, `LessEqual`, `EqualEqual`, `BangEqual`
  - Comparison results infer to `boolean` type
  - Type checker enforces numeric operands for ordered comparisons (`<`, `>`, `<=`, `>=`)
  - Equality operators (`==`, `!=`) accept any types
- **Conditional expressions**: `if <expr> then <expr> else <expr>` in let bindings
  - New `If` and `Then` keywords in lexer
  - New `conditional` Expr kind with condition, consequent, alternate
  - Nested conditionals supported (else-if chains)
  - Type inference: matching branch types propagate, mismatched → `unknown`
  - Scope checker validates sources in all three sub-expressions
  - Runtime: truthy/falsy evaluation (0, false, null → falsy)
- **TextMate grammar**: `if` and `then` keywords added to VS Code syntax highlighting

### Fixed
- Stale second argument in template Lexer constructor call (TypeScript compile error)

### Stats
- 1,166 tests (43 new), ~275 ratchets
- 3 rounds (R1 comparison, R2 conditional, R3 integration), ~4 agent calls

## v4.4.0 (2026-04-02)

### Added
- **String interpolation**: template expressions in let bindings — `let msg = "Score: ${A.score}"`
  - New `TemplateString` token in lexer (detects `${` inside strings)
  - New `template` Expr kind with `TemplatePart[]` (text + expression parts)
  - Escaped `\${` produces literal `${` (no interpolation)
  - Inner expressions support full expression syntax (operators, function calls, field access)
  - Type inference: templates always infer to `string`
- **BUILTIN_FUNCTIONS enrichment**: registry extended with `returnType`, `signature`, `description` fields
  - `inferExprType` reads from registry (eliminates hardcoded switch)
  - Hover docs generated from registry (eliminates duplicate FUNC_DOCS)

### Changed
- **evaluateExpr extraction**: moved from `flow-runner.ts` to `src/runtime/expr-eval.ts`
  - flow-runner.ts: 404 → 311 lines
  - Backward-compatible re-exports from flow-runner.ts
- **Common memory archival**: T1-v2.2 ratchets moved to `harness/archived_ratchets.md`

### Stats
- 1,123 tests (46 new), ~275 ratchets
- 4 rounds (1 DIRECT, 1 MEDIUM, 1 DIRECT, 1 TEST-ONLY), ~6 agent calls

## v4.3.0 (2026-04-02)

### Added
- **Multiplication and modulo operators**: `*` and `%` in expressions with proper multiplicative precedence
  - New `Star` and `Percent` tokens in lexer
  - New `parseMultiplicative` precedence level between additive and unary
  - Modulo-by-zero returns 0 with warning (matches division behavior)
- **New built-in functions**: `abs()`, `round()`, `keys()` added to expression system
  - `abs(n)` — absolute value
  - `round(n)` — round to nearest integer
  - `keys(obj)` — returns object keys as array
- **LSP hover docs** for `abs`, `round`, `keys` with signatures

### Fixed
- **Division precedence**: moved from additive to multiplicative level — `2 + 6/3` now correctly evaluates to `4` instead of `2.67` (standard math semantics)
- **`str()` JSON.stringify**: objects and arrays now stringify via `JSON.stringify()` instead of `String()` — `str({a:1})` returns `'{"a":1}'` not `'[object Object]'`

### Stats
- 1,077 tests (29 new), ~260 ratchets (1 unlocked: v4.0-R02)
- 3 rounds (1 MEDIUM, 1 DIRECT, 1 TEST-ONLY), ~6 agent calls

## v4.2.0 (2026-04-02)

### Added
- **Expression functions**: `len()`, `max()`, `min()`, `str()` as built-in functions callable in expressions
  - New `call` Expr kind with name + args
  - Parser: `parsePrimary` recognizes builtin name + `(` as function call
  - Evaluator: `evaluateExpr` handles `call` kind with built-in dispatch
  - Scope checker: validates function names against `BUILTIN_FUNCTIONS` registry
  - Type checker: validates argument count (arity) per function
  - 2 new error codes: `SCOPE_UNKNOWN_FUNCTION`, `TYPE_FUNC_ARITY`
- **Graph call return values**: graph calls now capture the last node's output and store it under the graph call name in parent outputs — enables `let x = Sub().field` patterns
- **LSP**: builtin function completions in graph flow context, hover documentation for `len`/`max`/`min`/`str`

### Fixed
- **Equality semantics unification**: `evalCondition` in transforms.ts now uses loose equality (`==`/`!=`) matching `evaluateCondition` in flow-runner.ts — string `"200"` now correctly matches number `200` in filter transforms

### Stats
- 1,048 tests (47 new), ~290 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls
- First version with expression functions

## v4.1.0 (2026-04-02)

### Fixed
- **Multi-segment condition LHS (TD-NEW-01)**: `evaluateCondition` and `evalCondition` now resolve nested field paths (`result.score`) correctly via `resolveNestedField` helper. Previously produced dotted key for flat lookup — always missed.
- **Graph call output isolation (TD-NEW-05)**: child graph gets cloned outputs map, preventing child node outputs from overwriting parent same-named outputs
- **Division by zero warning (TD-NEW-03)**: `evaluateExpr` accepts optional `warnings` array, emits `"division by zero in expression"` instead of silently returning 0

### Changed
- **Scope checker extraction**: graph-related checking extracted from scope.ts (697→503 lines) to `src/analyzer/graph-checker.ts` (204 lines)
  - Extracted: `checkVarCollision`, `checkExprSources`, `checkGraphCallArgs`, `checkGraphRecursion`, `collectGraphCalls`, `checkLiteralParamType`
- **Exhaustive FlowNode switch**: `never` default added to flow-runner.ts, scope.ts, estimator.ts switch statements — new FlowNode kinds now cause compile-time errors
- Removed `conditionFieldName` import from flow-runner.ts and transforms.ts (still used by hooks.ts and types.ts for string representation)

### Stats
- 1,001 tests (21 new), ~272 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls
- Closes TD-NEW-01 (conditionFieldName multi-segment), TD-NEW-03 (div-by-zero), TD-NEW-05 (shared outputs)

## v4.0.0 (2026-04-02)

### Added
- **Variables (`let`)**: bind intermediate values in graph flow — `let score = Analyzer.score`
- **Expressions**: arithmetic (`+`, `-`, `/`), string concatenation, field access, unary (`-`, `!`), grouping
  - `Expr` AST: 5-kind discriminated union (literal, field_access, binary, unary, group)
  - Expression parser with additive precedence (flat `+`/`-`/`/`)
- **Graph parameters**: typed parameters on graph declarations — `graph G(..., count: Int, label: String = "default")`
  - Int, String, Bool types with default values
  - Node-type parameters for passing node references
- **Graph calls**: invoke sub-graphs from flow — `Sub(count: 5) -> done`
  - LL(1) disambiguation (Identifier + LParen)
  - Child variable scope isolation
  - Nested graph calls supported (A calls B calls C)
- **Scope analysis**: variable collision detection, graph recursion detection (DFS), graph call argument validation
  - 6 new error codes: `SCOPE_VAR_COLLISION`, `SCOPE_VAR_UNDECLARED`, `SCOPE_VAR_ORDER`, `SCOPE_GRAPH_RECURSION`, `SCOPE_GRAPH_PARAM_MISSING`, `SCOPE_GRAPH_PARAM_TYPE`
- **Type analysis**: expression type inference (`InferredType`), binary op compatibility checks, variable condition type validation
  - 2 new error codes: `TYPE_EXPR_MISMATCH`, `TYPE_VAR_CONDITION`
- **Runtime**: `evaluateExpr()` recursive evaluator, `let`/`graph_call` execution in flow-runner
  - Variable-first resolution: single-segment field access checks variables before node outputs
  - Graph call builds child `FlowContext` with isolated variable scope
- **Estimator**: `let` zero cost, `graph_call` recurses into called graph's flow
- **Codegen**: `[data binding]` steps for let, `[sub-pipeline]` steps for graph calls, parameters section in orchestration header
- **LSP**: `let` as Variable symbol, `graph_call` as Function symbol, `let` keyword completion, graph name completions in flow context

### Changed
- `Condition.left` is now `Expr` (was `{kind: 'field_access', segments, location}`) — `conditionFieldName()` bridge for backward compat
- `FlowNode` union: 5 kinds (node, parallel, foreach, let, graph_call) — was 3
- `GraphDecl.params`: `GraphParam[]` required field (defaults to `[]`)
- `FlowContext`: added `variables?: Map<string, unknown>`, `getGraphDecl?`
- New tokens: `Plus`, `Minus`, `Bang`, `Equals`, `Let`

### Stats
- 980 tests (90 new), ~268 ratchets (33 new)
- 6 rounds (1 HIGH, 1 MEDIUM, 2 DIRECT, 1 TEST-ONLY, 1 integration)
- First major version bump since v3.0

## v3.9.0 (2026-04-02)

### Added
- **Edge transforms on conditional edges**: transforms (select, filter, drop, compact, truncate) now applied on conditional edges after condition evaluation, before target execution
  - `ConditionalEdgeInfo` interface bundles branches + transforms
  - Multi-hop chains apply transforms per-hop independently
  - `done` target and cycle detection skip transform application
- **Estimator diagnostic code specialization**: `BUDGET_CHAIN_CYCLE` and `BUDGET_CHAIN_DEPTH` replace overloaded `BUDGET_EXCEEDED` for chain-specific warnings
- **Fallback cost in worst-case estimation**: `retry_then_fallback` worst-case now includes fallback node cost

### Changed
- `FlowContext.getConditionalEdge` returns `ConditionalEdgeInfo | null` (was `ConditionalBranch[] | null`)
- `SCOPE_TRANSFORM_CONDITIONAL` warning removed — transforms on conditional edges now fully supported

### Fixed
- **TD-01**: `collectRenameLocations` import-path regex replaced with AST-based `getImportPathRanges()`/`isInImportPath()` (carried 4 retros, R-PROC-19 mandated inclusion)

### Stats
- 890 tests (26 new), ~230 ratchets
- 3 rounds (1 MEDIUM, 1 DIRECT, 1 TEST-ONLY), ~8 agent calls
- Closes TD-01 (import-path regex, carried 4 retros)
- Resolves SCOPE_TRANSFORM_CONDITIONAL gap (documented since v3.3-R2)
- Final v3.x release

## v3.8.0 (2026-04-02)

### Added
- **Multi-hop conditional chain estimation**: estimator now walks conditional edge chains (matching runtime behavior), with cycle/depth warnings
  - Recursive `getConditionalBranchCosts` with per-branch visited set copies (handles diamond paths)
  - Cycle detection emits warning, returns finite cost
  - Depth limit (MAX_CONDITIONAL_HOPS=10) emits warning
  - Retry multiplier propagates through chain hops
- **Foreach iteration context in errors**: error messages now include `(foreach iteration N of M)` suffix
- **Flow-runner extraction**: `applyFallbackAlias()` and `executeConditionalChain()` extracted from 66-line `case 'node'` block (now 9 lines)

### Changed
- `MAX_CONDITIONAL_HOPS` moved to `src/constants.ts` as single source of truth (re-exported from flow-runner.ts)
- `conditionalEdges` map in estimator stores `ConditionalBranch[]` instead of `string[]`
- `computeFlowCosts` accepts `warnings` parameter for chain estimation diagnostics

### Stats
- 864 tests (32 new), ~225 ratchets
- 4 rounds (2 DIRECT, 1 MEDIUM, 1 TEST-ONLY), ~10 agent calls
- Closes TD-02 (flow-runner density), TD-03 (estimator-runtime parity, carried 5 retros), TD-04 (fallback alias duplication)

## v3.7.0 (2026-04-02)

### Added
- **Foreach source failure handling**: foreach now correctly handles source node failures
  - Fallback output aliasing: when source uses `fallback(Node)`, output stored under both fallback and original name
  - Skip strategy guard: foreach body skipped when source data is undefined (removed unsafe `?? ctx.input` fallback)
- **Multi-hop conditional edge routing**: conditional edges now follow chains up to 10 hops
  - Visited set cycle detection (catches cycles on first revisit)
  - `done` as valid conditional target (terminates chain)
  - Fallback alias propagation through multi-hop chains
  - MAX_CONDITIONAL_HOPS=10 with clear error on exceeded
- **Server.ts orchestration extraction**: `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` helpers extracted from 3 handlers

### Fixed
- `findDeclNamePosition` in references.ts uses `loc.length` instead of hardcoded KEYWORD_LENGTHS map
- Scope checker now allows `done` as conditional branch target

### Stats
- 832 tests (42 new), ~220 ratchets
- 4 rounds (2 MEDIUM, 1 DIRECT, 1 TEST-ONLY), ~12 agent calls
- Runtime hardening pivot after 5 consecutive LSP versions (v3.2-v3.6)

## v3.6.0 (2026-04-02)

### Added
- **LSP find-all-references**: `textDocument/references` for contexts, nodes, memories, graphs, and produces names
  - `isReferable()` gate (broader than `isRenameable` — includes produces names via `producesNodeMap`)
  - `findReferences()` pure function reusing `collectRenameLocations` infrastructure
  - `includeDeclaration` support: filters declaration site when `context.includeDeclaration` is false
  - Cross-file: scans ALL workspace `.gft` files with fast `string.includes()` pre-filter
- **Rename field collision guard**: blocks rename when new name matches a field in any context, memory, or produces declaration

### Changed
- **GRAFT_KEYWORDS derived from lexer**: no longer hand-maintained — derived from `Object.keys(KEYWORDS)` excluding type keywords and `output`
- **Cross-file conflict detection**: replaced regex heuristic with parse-based ProgramIndex check (eliminates false positives from comment-only matches)
- **Document symbol ranges**: `range` now spans keyword→name (wider), `selectionRange` spans name only (LSP spec compliant)

### Stats
- 790 tests (51 new), ~220 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls
- R-PROC-14 first real test: A3 analysis completed before convergence, caught produces name gap

## v3.5.0 (2026-04-02)

### Added
- **Rename correctness hardening** (A3 backlog from v3.4):
  - Comment/string/import-path filtering in `collectRenameLocations` — regex matches inside comments, strings, and `from "..."` paths are now skipped
  - CRLF normalization: `\r\n` → `\n` before text-based scanning
  - `newName` validation: identifier regex (`/^[A-Za-z_][A-Za-z0-9_]*$/`) + keyword blacklist (26 Graft keywords)
  - `isInComment()` and `isInString()` extracted from completions.ts to shared `utils.ts`
- **Cross-file conflict detection**: `buildRenameEdits` checks that the new name doesn't collide with declarations in importing files before applying edits
- **`buildRenameEdits` pure function**: rename handler logic extracted from server.ts to `features/rename.ts` (follows `buildAutoImportActions` pattern)
- **FlowNode source location**: parser now captures `SourceLocation` on all three FlowNode kinds (`node`, `parallel`, `foreach`)
- **Parallel/foreach document symbol children**: outline view now shows `parallel(A, B)` and `foreach(Source.field)` as children of graph symbols, with foreach body nodes as nested children

### Changed
- `GRAFT_KEYWORDS` Set exported from `features/rename.ts` for shared use
- Server.ts rename handler reduced to thin wrapper calling `buildRenameEdits`
- `features/index.ts` updated with new exports (`isInComment`, `isInString`, `buildRenameEdits`, `GRAFT_KEYWORDS`)

### Stats
- 739 tests (49 new), ~210 ratchets
- 4 rounds (all DIRECT/TEST-ONLY), ~8 agent calls

## v3.4.0 (2026-04-02)

### Added
- **LSP rename support**: `textDocument/rename` and `textDocument/prepareRename` for contexts, nodes, memories, and graphs
  - Single-file rename: all references (reads, writes, edges, graph flows) updated via word-boundary regex
  - Cross-file rename: imported names updated across workspace files using workspace export cache
  - `prepareRename` validates cursor is on a renameable declaration name
  - Conflict detection: rejects rename if new name collides with existing declaration
- **Conditional edge token estimation**: estimator now accounts for conditional edge branches
  - Best case: cheapest branch target cost; worst case: most expensive branch target cost
  - `done` targets contribute zero cost
- **Hierarchical document symbols**: outline view now shows children
  - Context/Memory children: field names (SymbolKind.Field)
  - Node children: produces field names (SymbolKind.Field)
  - Graph children: flow node references (SymbolKind.Function)

### Changed
- **features.ts split**: 600-line monolith split into 8 focused modules under `src/lsp/features/`
  - `utils.ts`, `diagnostics.ts`, `hover.ts`, `completions.ts`, `definition.ts`, `symbols.ts`, `code-actions.ts`, `rename.ts`
  - `index.ts` re-exports all public functions (server.ts import path unchanged)
- **Code action handler extraction**: `buildAutoImportActions()` pure function in `features/code-actions.ts`
  - Server handler reduced to thin wrapper, improving testability
- Removed TODO comment for conditional edge estimation (TD-08, deferred since v2.0)

### Stats
- 690 tests (54 new), 200 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls

## v3.3.0 (2026-04-02)

### Added
- **LSP code actions (auto-import)**: `SCOPE_UNDEFINED_REF` diagnostics offer quick-fix to auto-import the undefined name from workspace `.gft` files
  - Workspace export cache with lazy scanning and incremental updates
  - Import insertion after existing imports, correct relative path computation
  - Windows path normalization, non-file URI guards, self-import exclusion
- **Conditional edge runtime routing**: conditional edges (`when`/`else` branches) now evaluate at runtime
  - `evaluateCondition()` supports all 6 comparison operators with numeric coercion
  - Branch selection: first matching `when` wins, `else` as default fallback
  - Wired through `FlowContext.getConditionalEdge` in executor
- **LSP document symbols**: outline view for `.gft` files showing contexts, nodes, memories, graphs, edges
  - Symbol kinds: Class, Function, Variable, Module, Event
- **Condition type validation**: `TYPE_CONDITION_MISMATCH` error for ordered operators (`>=`, `>`, `<=`, `<`) on non-numeric fields
- New error code: `TYPE_CONDITION_MISMATCH` in `TypeErrorCode`

### Changed
- `FlowContext` interface extended with optional `getConditionalEdge` method
- `onInitialize` now captures `InitializeParams` to extract workspace root
- Removed TODO comment for condition type validation (TD-06, deferred since v1.0)

### Stats
- 636 tests (54 new), 180 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls

## v3.2.0 (2026-04-02)

### Added
- **Parser error recovery**: parser accumulates errors with panic-mode recovery at declaration boundaries instead of throwing on first error
  - `ParseResult` return type: `{ program: Program, errors: GraftError[] }` — program always non-null
  - `synchronize()` with brace-depth tracking to avoid false keyword matches inside blocks
  - Progress guard prevents infinite loops; MAX_ERRORS = 25 limit
  - Inner parseX functions keep throwing; only top-level parse loop catches and recovers
- **Keyword hover documentation**: hover over Graft keywords (context, node, memory, graph, edge, import, reads, writes, produces, model, max_tokens, on_failure, storage, foreach, parallel) shows documentation with syntax examples
- **Storage completions**: `storage:` keyword offers `file` as completion
- **Import completion wiring**: import brace completions now resolve actual exported names from target files
- **LRU cache eviction**: LSP server cache evicts oldest entries when exceeding 50 documents
- **`./format` sub-path export**: `import { formatTokenReport } from '@graft-lang/graft/format'`

### Changed
- `Parser.parse()` returns `ParseResult` instead of `Program` (non-breaking: program field is always populated)
- Compiler no longer wraps parser in try-catch; uses `ParseResult.errors` directly
- LSP import completions extract actual file path from `from "..."` instead of passing empty string

### Stats
- 582 tests (45 new), 172 ratchets
- 4 rounds (1 MEDIUM, 2 DIRECT, 1 TEST-ONLY), ~10 agent calls

## v3.1.0 (2026-04-02)

### Added
- **LSP completion provider**: autocomplete for keywords, names, fields, model aliases, failure strategies
  - Trigger characters: `.`, `[`, `{`
  - Context-aware: top-level keywords, reads/writes names, field access, model aliases, on_failure strategies, fallback node names, graph flow nodes, import names
  - Snippet completions for context, node, memory, graph, import declarations
  - Comment and string literal suppression, CRLF-safe
- **Fallback cycle detection**: `SCOPE_FALLBACK_CYCLE` error for self-referencing and mutual fallback loops
  - DFS with in-stack detection in ScopeChecker
- **Programmatic API surface**: sub-path exports for library consumers
  - `@graft-lang/graft/compiler`: `compileToProgram`, `compile`, `compileAndGenerate`
  - `@graft-lang/graft/runtime`: `Executor`, `RunResult`, `RunOptions`, `NodeResult`
  - `@graft-lang/graft/types`: `Program`, `ProgramIndex`, `GraftError`, `GraftErrorCode`, `TokenReport`, `CodegenBackend`, `TokenUsage`, etc.
  - `src/types.ts` barrel file (sole exception to no-barrels ratchet — public API boundary)
- 60 new tests (537 total)

### Fixed
- **Parallel failure strategy bypass**: parallel branches now call `executeWithFailureStrategy` instead of raw `executeNode`, honoring retry/skip/fallback/abort strategies

### Changed
- Executor: removed duplicate `nodeMap`/`edgeMap` fields, uses `index.*` exclusively
- ScopeChecker: removed duplicate name Sets, derives from ProgramIndex maps
- CLI: extracted `formatTokenReport()` shared between compile and check commands
- Foreach nesting error: removed stale "v1.1" version reference

### Development Process
- 5 rounds: R1 (MEDIUM, debated), R2-R4 (DIRECT), R5 (TEST-ONLY)
- ~12 agent calls (budgeted 12)
- 100% first-try pass rate (5/5)
- 0 new ratchet unlocks needed

## v3.0.0 (2026-04-02)

### Added
- **Pluggable codegen backends**: `CodegenBackend` interface with 4 methods (`generateAgent`, `generateHook`, `generateOrchestration`, `generateSettings`)
  - `ClaudeCodeBackend` as default implementation, delegating to existing standalone functions
  - New backends can target Cursor rules, Windsurf, raw markdown, etc.
- **Field-level memory writes**: `writes: [Memory.field]` syntax for surgical field updates
  - `WriteRef { memory, field?, location }` replaces `writes: string[]`
  - Runtime `saveMemory` accepts optional `fields?: string[]` for field-level merges
- **Multi-field partial reads**: `reads: [Ctx.{f1, f2}]` brace syntax
  - `ContextRef.field` changed from `string | undefined` to `string[] | undefined`
  - Token estimator scales by `PARTIAL_FIELD_FACTOR * fieldCount` at all 3 estimation sites
- **Failure strategies**: `on_failure` clause fully implemented
  - 5 strategies: `retry(N)`, `fallback(NodeName)`, `skip`, `abort`, `retry_then_fallback(N, NodeName)`
  - `executeWithFailureStrategy` in flow-runner.ts
  - `SCOPE_INVALID_FALLBACK` compile-time validation for fallback references
- **Pipeline entry points**: `compileToProgram()`, `compileAndGenerate()`, `compile()` (3-tier API)
- **ProgramIndex field maps**: `producesFieldsMap` (dual-keyed), `memoryFieldsMap` for O(1) field lookups
- **GraftErrorCode sub-unions**: `ParseErrorCode | ScopeErrorCode | TypeErrorCode | BudgetErrorCode | ImportErrorCode | GraphErrorCode | ConfigErrorCode`
- **Parse error codes**: `PARSE_UNEXPECTED_TOKEN`, `PARSE_MISSING_FIELD` on parser diagnostics
- **SourceLocation.length**: all tokens carry `length` for non-zero-width LSP diagnostic squiggles
- **LSP improvements**: 200ms debounce, import dependency tracking with transitive invalidation
- 101 new tests (477 total)

### Changed
- `TypeChecker` accepts `ProgramIndex` (unlocked from v2.2 ratchet)
- `RuntimeState` interface unifies `PromptContext` and `FlowContext` in prompt-builder.ts
- `TRANSFORM_ON_CONDITIONAL` renamed to `SCOPE_TRANSFORM_CONDITIONAL`
- Foreach binding save/restore prevents scope leakage
- Removed bench script (dead code)

### Development Process
- 8 rounds: R1-R4 (debate), R5-R8 (DIRECT — no debate, 100% first-try pass)
- ~26 agent calls (most efficient version relative to output)
- A3-Skeptic caught 2 silent runtime corruption bugs in R2 (WriteRef `.join()` on objects, string iteration on field arrays)
- Cross-critique skipped in all eligible rounds (high consensus)
- 17 new ratchet decisions, 4 unlocked (168 total)
- DIRECT tier validated: well-scoped additive rounds need no debate

## v2.2.0 (2026-04-01)

### Added
- **LSP server**: Language Server Protocol support for Graft files
  - Real-time diagnostics (errors + warnings) on document open/change
  - Hover info: context fields, node config, memory details, produces summary
  - Go-to-definition: navigate to declarations including cross-file imports
  - 2-file architecture (`server.ts` + `features.ts`) with pure function handlers
  - `graft-lsp` binary entry for editor integration
- **VS Code extension**: `editors/vscode/` with TextMate grammar and LSP client
  - Syntax highlighting for all 35 keywords, type keywords, domain types, operators
  - Comment support (`//` line, `/* */` block), bracket matching, auto-closing pairs
  - LSP client auto-launches `graft-lsp` on `.gft` file open
- **npm distribution**: `@graft-lang/graft` scoped package
  - `exports` with `.` and `./ast` sub-paths
  - `files` array + `.npmignore` defense-in-depth
  - `prepublishOnly` script (build + test)
  - MIT LICENSE file, README badges (npm version, Node.js, license)
- **Structured error codes**: `GraftErrorCode` 21-member union type on all diagnostics
  - SCOPE_*, TYPE_*, ESTIMATE_*, IMPORT_*, COMPILE_* code families
  - Optional 4th param on `GraftError` constructor (backward compatible)
- **Correctness warnings**:
  - Foreach binding name collision detection (`SCOPE_BINDING_COLLISION`)
  - Conditional edge transform warning (`TRANSFORM_ON_CONDITIONAL`)
  - Multiple graph warning (`GRAPH_MULTIPLE`)
  - `loadMemory` verbose option for corrupt JSON diagnostics
- **Source file tracking**: `sourceFile` on `ContextDecl` and `NodeDecl` for cross-file navigation
- **ProgramIndex**: O(1) Map-based lookups (5 maps) replacing Array.find() throughout pipeline
- 88 new tests (376 total)

### Changed
- `resolve()` accepts `Program` instead of source string (eliminates double-parse)
- Executor decomposed: `prompt-builder.ts` (pure functions) + `flow-runner.ts` (flow execution)
- `VERSION` derived from package.json via `createRequire` with fallback
- `compile()` returns program even on `GRAPH_MISSING` (enables LSP for library files)
- Package renamed from `graft` to `@graft-lang/graft`

### Development Process
- 6 adversarial debate rounds (R1-R6), ~33 agent calls
- R1-R3 (MEDIUM): Tech debt, executor decomposition, correctness fixes
- R4 (HIGH): LSP server — 4-agent analysis, A3 found GRAPH_MISSING bug
- R5 (MEDIUM): npm + VS Code — A3 caught comment syntax, escape sequence, k-integer priority issues
- R6 (TEST-ONLY): Integration tests + v2.1 adversarial backlog (4 proposals resolved)
- 25 new ratchet-locked decisions (132 total)
- Cross-critique skipped in all MEDIUM rounds (score range ≤ 1)

## v2.1.0 (2026-04-01)

### Added
- **Token tracking**: runtime token usage monitoring across pipeline execution
  - `parseCLIOutput` with heuristic envelope detection (`--output-format json`)
  - `TokenTracker` class for cumulative budget tracking per node
  - Token log file (`.graft/token_log.txt`) with ISO timestamps, estimates, actuals, and cumulative budget percentage
  - `RunResult.tokenUsage` with budget/consumed/fraction/perNode breakdown
  - Advisory budget warnings at 80% (warning) and 90% (critical) thresholds
- **Correctness fixes**:
  - Writes schema overlap detection: warns when node produces no matching fields for written memory (TypeChecker)
  - `max_tokens > 0` validation for both contexts and memories (ScopeChecker)
  - Parallel memory write detection: warns when 2+ parallel branches write to the same memory
  - `compiler.ts` warning routing: diagnostics filtered by severity, warnings no longer block compilation
- **Shared modules**: extracted constants, utilities, and memory functions to dedicated modules
  - `src/constants.ts`: MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD
  - `src/utils.ts`: fieldsToJsonExample, typeToExample
  - `src/runtime/memory.ts`: loadMemory, saveMemory as standalone functions
  - `src/runtime/token-tracker.ts`: TokenTracker class
- 39 new tests (288 total)

### Changed
- MODEL_MAP deduplicated: single source of truth in `src/constants.ts` (previously duplicated in estimator.ts and executor.ts)
- Executor uses `--output-format json` instead of `--print` for Claude CLI subprocess invocation

### Development Process
- 4 adversarial debate rounds (R1-R4), 21 agent calls (42% under budget)
- R1 (MEDIUM): Mechanical refactoring, 2-agent analysis, no bugs found
- R2 (MEDIUM): Both agents independently found compiler.ts warning routing bug
- R3 (HIGH): A3 found CLI format uncertainty, A2 found mock spawner compat issue; cross-critique skipped (high consensus)
- R4: Debate skipped — pure integration testing with no design decisions
- 17 new ratchet-locked decisions (107 total, 2 unlocked for MODEL_MAP extraction)

## v2.0.0 (2026-04-01)

### Added
- **Import system**: `import { X, Y } from "./file.gft"` — share contexts and nodes across files
  - DFS circular import detection with ancestor set tracking
  - ExportableNames snapshot prevents transitive re-export
  - FileReader injection for testability
  - Only contexts and nodes importable (edges, graphs, memories excluded)
- **Persistent memory**: `memory M(max_tokens: 1k, storage: file) { fields }` — state that persists across pipeline runs
  - Stored in `.graft/memory/<name>.json`, survives session cleanup
  - `writes: [M]` clause on nodes to declare memory mutation
  - Field-matching merge: only schema-declared fields written, unrelated fields preserved
  - Always reload from disk per node execution (fixes foreach staleness)
  - Dry run guard: memory saves skipped during `--dry-run`
  - `loadMemory` returns null on missing/corrupt files (graceful first-run)
- 5 new keywords: `import`, `from`, `memory`, `writes`, `storage`
- Memory-aware agent generation (`.graft/memory/` paths in reads, "Memory Saving" section in writes)
- Orchestration "Persistent Memory" preamble section with per-step memory load/save annotations
- Memory validation in analyzer: name collision detection, writes validation, field-level read checking, token estimation with 0.3 partial factor
- Example files: `shared.gft` (library), `chatbot.gft` (import + memory + writes)
- 78 new tests (249 total)

### Development Process
- 5 adversarial debate rounds (R1-R5), ~70 agent calls
- R1: Lexer + AST + Parser — A3 caught duplicate writes silent overwrite, empty import list/path
- R2: Import Resolver — A1's ExportableNames snapshot was only correct approach; A3 caught entry-file parse error gap
- R3: Analyzer — A1 forced dissenter reversed: "collision detection is correctness, not a feature"
- R4: CodeGen + Runtime — A3 found foreach memory staleness bug (all others missed); A2 forced dissenter self-rebutted all 3 positions
- R5: Integration — minimal controversy, 4:0 consensus
- 34 new ratchet-locked decisions (92 total)

## v1.2.0 (2026-04-01)

### Added
- `graft run <file> --input <json>` — compile and execute a .gft pipeline
- Tree-walking interpreter over FlowNode[] from compiled AST
- Edge transforms at runtime as pure TypeScript functions (select, filter, drop, compact, truncate)
- Parallel execution via `Promise.allSettled` (collects all results, no silent data loss)
- Foreach iteration over list outputs with max_iterations cap
- `--dry-run` mode — simulate execution without spawning Claude subprocesses
- `--verbose` mode — print detailed execution progress
- `--timeout <seconds>` — configurable subprocess timeout (default 5 minutes)
- `--work-dir <dir>` — specify working directory for session data
- Session cleanup before each run (prevents stale data from previous runs)
- Input JSON validation against graph input context schema
- Mock spawner injection via `SpawnerFn` for testing
- File-based data passing via `.graft/session/node_outputs/`
- 36 new tests (171 total)

### Development Process
- Adversarial debate: 4-agent analysis + cross-critique + convergence
- A4-Specialist forced dissenter — self-retracted generateAgent() reuse, full failure strategies, ExecutionContext
- A3-Skeptic caught: stdin.end() showstopper, Promise.allSettled requirement, generateAgent() reuse problem
- 12 new ratchet-locked decisions (58 total)
- ~14 agent calls for v1.2

## v1.1.0 (2026-04-01)

### Added
- `parallel { A B C }` flow control — run nodes concurrently
- `foreach(Node.output.field as var, max_iterations: N) { ... }` — iterate over list outputs
- Multi-field `select(a, b, c)` edge transform — keep multiple fields in one transform
- `FlowNode` discriminated union AST type (node | parallel | foreach)
- 4 new keywords: `parallel`, `foreach`, `as`, `max_iterations`
- Recursive flow parsing with nesting depth enforcement
- Token estimation: parallel = sum, foreach = best 1x / worst Nx
- Codegen: `[parallel]` and `[foreach]` orchestration step labels
- 25 new tests (135 total), 2 new benchmarks (16 total)

### Fixed
- Benchmark bug: removed duplicate SecurityReviewer in parallel_flow.gft

### Development Process
- Adaptive Adversarial Loop: 4-agent debate + Skeptic-only review
- A3-Skeptic found benchmark file bug and foreach 3-part path issue
- A1-Architect forced dissenter reversed position on recursive vs flat FlowNode
- Recursive FlowNode adopted (3-to-1 vote, stronger code-reuse argument)

## v1.0.0 (2026-03-31)

- Initial release: full compiler pipeline (lexer → parser → analyzer → codegen)
- CLI: `graft compile`, `graft check`
- 110 unit tests, 14 benchmarks
- Built via adversarial debate harness (~99 agent calls, 46 ratchet-locked decisions)

## v0.1.0 (2026-03-31)

- Initial compiler implementation
- Lexer, parser, analyzer, codegen
- CLI: graft compile, graft check
- 110 unit tests
- Adversarial debate harness for development
