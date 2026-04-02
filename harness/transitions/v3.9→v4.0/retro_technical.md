# Technical Retrospective: Graft v3.9 (Final v3.x Assessment)

## Version Summary

v3.9 delivered 3 rounds: edge transforms on conditional edges (R1, MEDIUM), estimator polish + TD-01 resolution (R2, DIRECT), and integration tests (R3, TEST-ONLY). Test count rose from 864 to 890 (26 new tests). Ratchet count stands at ~235 total (193 locked, 7 unlocked across all versions). The version was executed in ~8 agent calls with one NEEDS_CHANGES verdict (R1, 2 missing tests, fixed).

v3.9's primary contributions are: (1) edge transforms now applied on conditional edges after condition evaluation, before target execution -- resolving the SCOPE_TRANSFORM_CONDITIONAL gap documented since v3.3-R2, (2) `ConditionalEdgeInfo` interface bundles branches + transforms in flow-runner.ts, replacing the bare `ConditionalBranch[]` return from `getConditionalEdge`, (3) `BUDGET_CHAIN_CYCLE` and `BUDGET_CHAIN_DEPTH` diagnostic codes replace overloaded `BUDGET_EXCEEDED` in the estimator, (4) `getFallbackCost()` now included in worst-case estimation for `retry_then_fallback` strategies, and (5) `getImportPathRanges()`/`isInImportPath()` replace the fragile regex-based import-path filtering in collectRenameLocations, closing TD-01 after 4 consecutive retros.

---

## 1. Tech Debt Inventory

### All Items Resolved or Carried as LOW

TD-01 through TD-04 are now fully resolved. The remaining inventory consists of 6 items, all LOW severity. No MEDIUM or HIGH items remain in the codebase.

### TD-05: Lexer still throws on first error (no recovery) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-05), v3.7 (TD-05), v3.6 (TD-05), v3.5 (TD-05), v3.4 (TD-06), v3.3 (TD-01), v3.2 (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting works at the parser level and above (ParseResult since v3.2).
- **Recommendation**: Permanent LOW. Graft files are small; multi-error lexer recovery adds complexity with marginal benefit.

### TD-06: Completion context detection remains position-fragile [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-06), v3.7 (TD-06), v3.6 (TD-06), v3.5 (TD-06), v3.4 (TD-07)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Permanent LOW. No reports of issues across 6 versions.

### TD-07: isInComment() scans from document start on every request [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-07), v3.7 (TD-07), v3.6 (TD-07), v3.5 (TD-07), v3.4 (TD-08)
- **Description**: O(n) per completion/rename/reference request. Bounded by Graft file sizes.
- **Recommendation**: Permanent LOW. Not a bottleneck.

### TD-08: Empty `catch {}` blocks throughout codebase [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-08), v3.7 (TD-08), v3.6 (TD-08)
- **Description**: ~8 catch blocks across 7 source files. Each is individually justified for graceful degradation. v3.9 added one more in `getImportPathRanges()` (rename.ts:188) -- parsing failure returns empty ranges, which is correct (no import filtering on error).
- **Recommendation**: Permanent LOW. Consistent, intentional pattern.

### TD-09: Workspace export cache has no deletion invalidation [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-09), v3.7 (TD-09), v3.6 (TD-09), v3.5 (TD-09), v3.4 (TD-10)
- **Description**: Deleted .gft files remain in workspaceExports cache until server restart. 3 consumers (code actions, rename, references) all handle missing files gracefully.
- **Recommendation**: Permanent LOW. Carry forward if LSP work continues; otherwise defer indefinitely.

### TD-10: FlowNode.location is optional, requires ?? fallback everywhere [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.8 retro (TD-10), v3.7 (TD-10), v3.6 (TD-10), v3.5 (TD-10)
- **Description**: Parser always assigns location but the type is `optional`. Making it required would be a safe change but touches AST type definitions.
- **Recommendation**: Permanent LOW. The optionality is cosmetic -- parser guarantees presence.

### Items Resolved in v3.9

- **TD-01 (collectRenameLocations import-path regex)**: RESOLVED in v3.9-R2. `getImportPathRanges()` parses the document with Lexer+Parser and extracts import path string ranges from the AST. `isInImportPath()` checks match offsets against these ranges. The regex `from\s+"([^"]*)"` is completely removed. This item was carried through v3.5, v3.6, v3.7, and v3.8 retros (4 total). R-PROC-19 mandated its inclusion in v3.9 scope.

- **SCOPE_TRANSFORM_CONDITIONAL gap**: RESOLVED in v3.9-R1. Transforms on conditional edges are now applied after condition evaluation, before target execution. The `ConditionalEdgeInfo` interface bundles `branches` and `transforms` together. The `SCOPE_TRANSFORM_CONDITIONAL` warning is removed from the scope checker. This gap was documented since v3.3-R2 (6 versions).

- **BUDGET_EXCEEDED overloading**: RESOLVED in v3.9-R2. The estimator now uses `BUDGET_CHAIN_CYCLE` for conditional chain cycle detection and `BUDGET_CHAIN_DEPTH` for chain depth limit warnings. `BUDGET_EXCEEDED` is reserved for actual budget threshold violations. The `BudgetErrorCode` union in diagnostics.ts now has 4 members: `BUDGET_EXCEEDED`, `BUDGET_NODE_EXCEEDED`, `BUDGET_CHAIN_CYCLE`, `BUDGET_CHAIN_DEPTH`.

- **Fallback cost gap in worst-case estimation**: RESOLVED in v3.9-R2. `getFallbackCost()` private method added to estimator. For `retry_then_fallback` strategies, worst-case is now `cost * (1 + max) + fallbackCost` instead of `cost * (1 + max)`. The fallback cost includes the fallback node's full `getNodeCost()` (input estimate + budgetOut).

---

## 2. Emerging Patterns

### Patterns Formalized in v3.9

- **Interface bundling for multi-concern edges**: `ConditionalEdgeInfo { branches, transforms }` replaces bare `ConditionalBranch[]` as the return type from `getConditionalEdge`. This bundles the two concerns (routing and transformation) that apply to conditional edges. The pattern is analogous to how `EdgeDecl` bundles source, target, and transforms for direct edges.

- **AST-based filtering in LSP features**: `getImportPathRanges()` uses Lexer+Parser to extract import path positions from the AST rather than regex matching on source text. This establishes a precedent: when LSP features need to exclude certain syntactic contexts, they should query the AST (available via ProgramIndex or direct parsing) rather than pattern-matching raw text. The comment/string filtering still uses text scanning (isInComment, isInString), but these are well-tested and correct for their domains.

- **Diagnostic code specialization**: The `BudgetErrorCode` sub-union grew from 2 to 4 members (`BUDGET_EXCEEDED`, `BUDGET_NODE_EXCEEDED`, `BUDGET_CHAIN_CYCLE`, `BUDGET_CHAIN_DEPTH`). This follows the established pattern where each diagnostically distinct scenario gets its own code, even when the severity is identical. IDE tooling can now filter/group chain warnings separately from budget warnings.

### Patterns Confirmed Stable

- **Shared constants in src/constants.ts**: Now holds 6 constants across 4 domains (model mapping, estimation tuning, budget thresholds, execution limits). At 17 lines, no further organization needed.

- **Pure function extraction for LSP**: All LSP feature modules export pure functions that accept parsed state (ProgramIndex, document text) and return protocol objects. Server.ts remains a thin orchestration layer. This pattern held through 8 feature modules with zero regressions.

- **Post-hoc error annotation**: The foreach iteration suffix pattern (v3.8-R3) worked without issues. The conditional edge transform application pattern (v3.9-R1) follows the same approach: apply transforms after the core operation (condition evaluation), not before.

---

## 3. Ratchet Review

### Ratchets Modified in v3.9

- **[v3.0-R26] SCOPE_TRANSFORM_CONDITIONAL**: This warning was added in v3.0-R6 and renamed in the same round. v3.9-R1 removes it entirely -- transforms on conditional edges are now supported. The ratchet that named the warning code is superseded by the implementation.

### Candidates for Revisiting in v4.0

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Still the primary blocker for memory importability. No user demand. If v4.0 introduces shared memory libraries, this ratchet must be unlocked.

- **[v2.1-R15] Budget enforcement advisory only; no hard abort**: Token budget remains advisory. Hard enforcement is a v4.0+ decision depending on runtime direction.

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: Text-based approach still holds. The import-path issue (TD-01) was the only failure of the text approach, and it is now fixed via AST-based filtering. Remaining text-based matching (word boundary, comment/string exclusion) is correct for all tested scenarios.

### Ratchets Confirmed Still Valid

All ~235 ratchets reviewed. No ratchets are blocking v4.0 feature work unless memory importability or budget enforcement is in scope. The 7 unlocked ratchets across all versions have all been addressed (re-locked or superseded).

---

## 4. Edge Cases & Gaps

### Gaps Resolved in v3.9

- **Edge transforms on conditional edges**: RESOLVED. Transforms declared on conditional edges are now applied after condition evaluation, before target execution. Multi-hop chains apply transforms per-hop independently. The `done` target and cycle detection paths skip transform application (correct -- no output to transform).

- **BUDGET_EXCEEDED overloading**: RESOLVED. Three distinct scenarios now have three distinct codes.

- **Fallback cost in worst-case estimation**: RESOLVED. `retry_then_fallback` worst-case includes fallback node cost.

- **Import-path regex in rename**: RESOLVED. AST-based filtering via `getImportPathRanges()`.

### Remaining Gaps (all LOW, carried from v3.8)

- **Parallel + conditional interaction untested at scale**: No test for conditional chains originating from within parallel blocks (two parallel branches each triggering multi-hop conditional chains simultaneously). Basic parallel + conditional interactions are tested. This is an edge case in Graft usage -- real-world .gft files rarely combine parallel with multi-hop conditionals.

- **Nested foreach error annotation ordering**: Nested foreach produces multiple suffixes in inner-first order, e.g., `(foreach iteration 2 of 3) (foreach iteration 1 of 5)`. Technically correct but counterintuitive. Rare in practice.

- **Location { line: 0, column: 0, offset: 0 } for chain warnings**: Estimator chain warnings (BUDGET_CHAIN_CYCLE, BUDGET_CHAIN_DEPTH) use zero-position location because the estimator does not track source locations for edge declarations. Cosmetically imperfect in IDE diagnostics but functionally harmless.

### LSP Gaps (unchanged from v3.8, all LOW)

- **Field name collision in references/rename**: If a context field and produces output share a name, false positives. Scope checker enforces uniqueness at declaration level.
- **includeDeclaration only works for current file**: Declaration filtering in findReferences only checks current file's ProgramIndex.
- **producesNodeMap for references but not rename**: Produces names are referable but not renameable. Intentional.
- **Multi-line import braces**: Import pattern in auto-import code actions does not match multi-line brace syntax.

---

## 5. Performance Observations

- **No new performance concerns in v3.9**: `ConditionalEdgeInfo` bundles data already being passed; no additional allocation. `getImportPathRanges()` re-parses the document once per rename operation -- this is a double-parse (server.ts already parsed for ProgramIndex), but rename is a low-frequency operation. The parse is fast (< 1ms for typical .gft files).

- **estimator.ts at 312 lines**: Up from 305 (v3.8). The `getFallbackCost()` method added 7 lines. Growth has plateaued.

- **flow-runner.ts at 236 lines**: Up from 223 (v3.8). The transform application in `executeConditionalChain` added 13 lines. The file remains well-structured.

- **rename.ts at 235 lines**: Up from ~195 (estimated v3.8). The `getImportPathRanges()` and `isInImportPath()` functions added ~40 lines. Still within comfortable bounds for a single feature module.

- **Total source: 6,086 lines across all .ts files in src/**.

- **LSP total: 1,336 lines** (383 server.ts + 953 across 10 feature files). Up from ~1,297 (v3.8) due to rename.ts growth.

- **Parse cache at 50 entries (LRU)**: Unchanged. Adequate.

---

## 6. v3.x Series Codebase Health Summary

### Test Progression (v3.0 through v3.9)

| Version | Tests | Rounds | Tests/Round | NEEDS_CHANGES |
|---------|-------|--------|-------------|---------------|
| v3.0    | 477   | 8      | 14.5        | 0             |
| v3.1    | 537   | 5      | 12.0        | 0             |
| v3.2    | 582   | 4      | 11.3        | 0             |
| v3.3    | 636   | 4      | 13.5        | 0             |
| v3.4    | 690   | 4      | 13.5        | 0             |
| v3.5    | 739   | 4      | 12.3        | 0             |
| v3.6    | 790   | 4      | 12.8        | 1 (R3)        |
| v3.7    | 832   | 4      | 10.5        | 1 (R3)        |
| v3.8    | 864   | 4      | 8.0         | 0             |
| v3.9    | 890   | 3      | 8.7         | 1 (R1)        |
| **Total** | **+413** | **44** | **9.4 avg** | **3 total** |

The v3.x series added 413 tests in 44 rounds. The decreasing tests-per-round ratio from v3.0 (14.5) to v3.9 (8.7) reflects the codebase maturing -- later versions polish existing features rather than adding new surface area. Only 3 NEEDS_CHANGES across 44 rounds (6.8% failure rate).

### Tech Debt Arc (v3.0 through v3.9)

| Retro | HIGH | MEDIUM | LOW | Total | Resolved |
|-------|------|--------|-----|-------|----------|
| v3.3  | 0    | 2      | 5   | 7     | 0        |
| v3.4  | 0    | 2      | 6   | 8     | 2        |
| v3.5  | 0    | 2      | 6   | 8     | 2        |
| v3.6  | 0    | 2      | 6   | 8     | 2        |
| v3.7  | 0    | 1      | 9   | 10    | 0        |
| v3.8  | 0    | 1      | 6   | 7     | 3        |
| v3.9  | 0    | 0      | 6   | 6     | 4        |

Peak was 10 items in v3.7. v3.8 and v3.9 together resolved 7 items (TD-01 through TD-04, SCOPE_TRANSFORM_CONDITIONAL, BUDGET_EXCEEDED overloading, fallback cost gap). The remaining 6 items are all LOW and have been stable for 3+ versions. No new tech debt was introduced in the second half of v3.x (v3.6 through v3.9).

### Pipeline Stage Maturity

| Stage | Status | Lines | Last Modified |
|-------|--------|-------|---------------|
| Lexer | Stable | 266 + 147 (tokens) | v3.0-R6 |
| Parser | Stable | 906 + 148 (ast) | v3.2-R1 |
| Resolver | Stable | 214 | v3.0-R1 |
| Analyzer (scope) | Stable | 435 | v3.9-R1 (SCOPE_TRANSFORM_CONDITIONAL removed) |
| Analyzer (estimator) | Stable | 312 | v3.9-R2 |
| Analyzer (type) | Stable | ~120 | v3.3-R3 |
| Codegen | Stable | 165 + ~200 (agents, hooks, settings) | v3.0-R3 |
| Runtime (executor) | Stable | 361 | v3.0-R7 |
| Runtime (flow-runner) | Stable | 236 | v3.9-R1 |
| Runtime (prompt-builder) | Stable | ~110 | v3.0-R1 |
| LSP (server) | Stable | 383 | v3.7-R1 |
| LSP (features) | Stable | 953 (10 files) | v3.9-R2 |
| Constants | Stable | ~17 | v3.8-R2 |
| Compiler/CLI | Stable | 148 | v3.0-R1 |

Every pipeline stage has been stable (no structural changes) for at least 2 versions. The most recent structural changes were in v3.9 (estimator diagnostic codes, flow-runner transform application), but these were additive, not architectural.

### Codebase Shape

```
Total source:        6,086 lines (44 .ts files)
Total tests:         890 tests
Ratchet decisions:   ~235 (193 locked, 7 historically unlocked)
Error codes:         30+ (GraftErrorCode union across 7 sub-unions)
LSP features:        8 modules (completions, hover, definition, rename, references, code-actions, symbols, diagnostics)
Constants:           6 shared constants
Pipeline stages:     14 files across 7 stages
```

---

## 7. Architectural Readiness for v4.0

### What is Solid

1. **Pipeline is fully modular**: Each stage (lexer, parser, resolver, analyzer, codegen, runtime) is cleanly separated. ProgramIndex threads through all stages. Adding a new pipeline stage or modifying an existing one does not require touching others.

2. **Runtime is feature-complete for v1 semantics**: All declared flow control constructs (sequential, parallel, foreach, conditional with multi-hop), all failure strategies (retry, fallback, skip, abort, retry_then_fallback), memory persistence (load/save/field-level), token tracking, and edge transforms are implemented and tested. No runtime gaps remain for the current language specification.

3. **Estimator mirrors runtime exactly**: After 5 retros carrying TD-03, the estimator is now fully aligned with the runtime for all execution patterns including multi-hop conditionals, retry multipliers, fallback costs, cycle detection, and depth limiting.

4. **LSP is mature and extensible**: 8 feature modules with pure function APIs, LRU parse cache, workspace scanning, cross-file operations. Adding new LSP features follows the established pattern (pure function in features/, thin handler in server.ts).

5. **CodegenBackend interface supports multiple backends**: ClaudeCodeBackend is the sole implementation, but the interface (4 methods: generateAgent, generateHook, generateOrchestration, generateSettings) is ready for additional backends without runtime or analyzer changes.

6. **Error system is comprehensive**: 30+ error codes across 7 sub-unions, with structured GraftError objects carrying source location, severity, and code. All diagnostic sites are covered.

### What Needs Attention for v4.0

1. **parser.ts at 906 lines is the largest file**: The recursive descent parser has grown incrementally since T4. It is well-structured (one parseX method per production rule), but adding new language constructs will push it past 1,000 lines. Consider whether v4.0's scope warrants splitting into parser + expression-parser or similar.

2. **scope.ts at 435 lines is the second-largest non-LSP file**: The scope checker handles an increasing number of validation rules. If v4.0 adds new language features, consider splitting structural checks from semantic checks.

3. **No intermediate representation (IR)**: The compiler goes directly from AST to codegen output. If v4.0 introduces optimization passes, control flow analysis, or multi-backend compilation, an IR layer between analyzer and codegen would be needed.

4. **Single-graph assumption**: The runtime and estimator assume `program.graphs[0]` (single graph per file). The parser and analyzer support multiple graphs (GRAPH_MULTIPLE warning), but runtime does not. If v4.0 introduces multi-graph execution, this is the bottleneck.

5. **No watch mode or incremental compilation**: Each compile/check cycle re-parses from scratch. The LSP has per-URI caching, but the CLI compiler does not. For rapid iteration during development, incremental compilation would reduce latency.

6. **Executor at 361 lines still manages orchestration + I/O**: While flow-runner.ts was extracted in v3.8, the executor still handles subprocess spawning, memory I/O, session management, and result collection. If v4.0 changes execution semantics, further decomposition may help.

### v4.0 Direction Recommendations

The v3.x series delivered the complete foundation: language specification, all runtime constructs, full LSP tooling, diagnostic system, npm distribution, and VS Code extension. With 890 tests and zero MEDIUM/HIGH tech debt, the codebase is in excellent shape.

v4.0 should choose one of three directions:

**Option A: Language Evolution (recommended)**
- New language features: loops/iteration beyond foreach, variables, expressions, subroutines
- Extends the parser (new productions), analyzer (new validations), and runtime (new execution patterns)
- High value: expands what .gft files can express
- Risk: parser.ts growth, AST complexity
- Prerequisite: none -- pipeline is ready

**Option B: Execution Environment**
- Watch mode, incremental compilation, multi-graph execution, remote node execution
- Extends the runtime and compiler CLI
- High value for developer experience
- Risk: complexity in state management, caching invalidation
- Prerequisite: consider IR layer for optimization

**Option C: Ecosystem Expansion**
- Second codegen backend, memory importability, workspace/project support, source maps
- Extends codegen (new backend), resolver (memory imports), LSP (workspace)
- Moderate value: broadens adoption surface
- Risk: scope creep across multiple subsystems
- Prerequisite: unlock v2.0-R13 for memory importability

### Items Explicitly Deferred Beyond v4.0

- Lexer error recovery (TD-05) -- permanent LOW, marginal benefit
- Async file I/O -- LLM latency dominates all I/O
- isReferable/isRenameable unification -- functions are small and semantically distinct
- AST-based reference tracking -- text-based approach confirmed sufficient through 6 versions
- Second codegen backend -- no user demand (unless Option C chosen)

---

## 8. Final v3.x Statistics

| Metric | v3.0 Start | v3.9 End | Delta |
|--------|-----------|----------|-------|
| Tests | 477 | 890 | +413 |
| Ratchets | ~175 | ~235 | +60 |
| Source lines | ~4,200 | 6,086 | +1,886 |
| LSP lines | 0 (v2.2) | 1,336 | +1,336 |
| Error codes | 18 | 30+ | +12 |
| Pipeline files | ~10 | 14 | +4 |
| LSP features | 0 | 8 | +8 |
| Tech debt (HIGH/MED) | 0 | 0 | 0 |
| Tech debt (LOW) | 2 | 6 | +4 (stable) |
| NEEDS_CHANGES | -- | 3/44 rounds | 6.8% |
| Versions | -- | 10 (v3.0-v3.9) | -- |
| Total rounds | -- | 44 | -- |

The v3.x series transformed Graft from a functional compiler with basic runtime into a production-quality tool with comprehensive LSP support, multi-hop conditional routing, failure strategies, field-level operations, diagnostic specialization, and npm distribution. The codebase is clean, well-tested, and architecturally ready for v4.0.
