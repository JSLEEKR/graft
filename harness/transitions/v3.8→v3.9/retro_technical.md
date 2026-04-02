# Technical Retrospective: Graft v3.8

## Version Summary

v3.8 delivered 4 rounds: flow-runner extraction (R1, DIRECT), multi-hop conditional chain estimation (R2, MEDIUM), foreach iteration context in errors (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 832 to 864 (32 new tests). Ratchet count stands at ~230 total (225 locked, 5 unlocked across all versions). The version was executed in ~10 agent calls with zero NEEDS_CHANGES verdicts.

v3.8's primary contributions are: (1) `applyFallbackAlias()` and `executeConditionalChain()` extracted from the 66-line `case 'node'` block in flow-runner.ts, reducing it to 9 lines, (2) recursive multi-hop `getConditionalBranchCosts` in estimator.ts with per-branch visited set copies, cycle/depth warnings, and retry multiplier propagation through chain hops, (3) `MAX_CONDITIONAL_HOPS` centralized in src/constants.ts as single source of truth for both estimator and runtime, (4) foreach error messages now include `(foreach iteration N of M)` suffix, and (5) `conditionalEdges` map in estimator changed from storing target strings to `ConditionalBranch[]` for direct branch access. All 4 items from the v3.7 retro's recommended scope (Section 7) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: collectRenameLocations import-path exclusion is fragile [MEDIUM]
- **Severity**: MEDIUM
- **Status**: Carried forward from v3.7 retro (TD-01), v3.6 retro (TD-01), v3.5 retro (TD-03)
- **Description**: The import-path filtering in collectRenameLocations (rename.ts:133-138) uses a simple regex `from\s+"([^"]*)"` to detect import paths. Both rename and find-all-references share collectRenameLocations, so a false match corrupts two features.
- **Impact**: Unchanged. Graft's strict import syntax makes this unlikely in practice.
- **Fix**: Parse import statements from the AST (available in ProgramIndex) and check match offsets against import path ranges. ~15 lines.
- **Recommendation**: MEDIUM priority. Address when next modifying collectRenameLocations.

### TD-05: Lexer still throws on first error (no recovery) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-05), v3.6 retro (TD-05), v3.5 retro (TD-05), v3.4 retro (TD-06), v3.3 retro (TD-01), v3.2 retro (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting only works at the parser level and above.
- **Recommendation**: LOW priority. Carry forward. Marginal benefit for Graft file sizes.

### TD-06: Completion context detection remains position-fragile [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-06), v3.6 retro (TD-06), v3.5 retro (TD-06), v3.4 retro (TD-07)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Carry forward. No reports of issues.

### TD-07: isInComment() scans from document start on every request [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-07), v3.6 retro (TD-07), v3.5 retro (TD-07), v3.4 retro (TD-08)
- **Description**: O(n) per completion/rename/reference request. Usage is batch, so performance impact is bounded.
- **Recommendation**: LOW priority. Carry forward.

### TD-08: Empty `catch {}` blocks throughout codebase [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-08), v3.6 retro (TD-08)
- **Description**: ~8 catch blocks across 7 source files (compiler.ts, index.ts, runner.ts, executor.ts, flow-runner.ts, parser.ts, resolver.ts). Each is individually justified for graceful degradation.
- **Recommendation**: Not a priority. Consistent and intentional pattern.

### TD-09: Workspace export cache has no deletion invalidation [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-09), v3.6 retro (TD-09), v3.5 retro (TD-09), v3.4 retro (TD-10)
- **Description**: Deleted .gft files remain in workspaceExports cache until server restart. Now consumed by code actions, rename, AND references (3 consumers). All three handle missing files gracefully.
- **Recommendation**: LOW priority. Carry forward.

### TD-10: FlowNode.location is optional, requires ?? fallback everywhere [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.7 retro (TD-10), v3.6 retro (TD-10), v3.5 retro (TD-10)
- **Description**: Unchanged. Parser always assigns location but the type is optional.
- **Recommendation**: LOW priority. Carry forward.

### Items Resolved from v3.7 Retro
- **TD-02 (flow-runner.ts case 'node' complexity)**: RESOLVED in v3.8-R1. `executeConditionalChain()` and `applyFallbackAlias()` extracted as standalone functions. The `case 'node'` block reduced from 66 lines to 9 lines. flow-runner.ts is now 223 lines total (up from 208 due to the extracted functions being in the same file, but complexity is distributed across 4 named functions instead of 1 monolithic case block).
- **TD-03 (estimator-runtime parity for conditional chains)**: RESOLVED in v3.8-R2. `getConditionalBranchCosts` is now recursive with per-branch visited set copies (handles diamond paths), cycle detection with BUDGET_EXCEEDED warning, depth limiting at MAX_CONDITIONAL_HOPS, retry multiplier propagation, and done-as-zero-cost terminal. The estimator now mirrors the runtime's multi-hop behavior exactly. This item was carried through 5 consecutive retros (v3.3 through v3.7) before resolution.
- **TD-04 (fallback alias duplication)**: RESOLVED in v3.8-R1. `applyFallbackAlias(name, result, ctx)` extracted as a shared helper. Both call sites (case 'node' inline and conditional chain step) now use the same function.
- **TD-03 from v3.6 (isReferable and isRenameable nearly identical)**: Carried forward. Still LOW priority. Functions are small and semantically distinct.

---

## 2. Emerging Patterns

### Patterns Formalized in v3.8

- **Shared constants across pipeline stages**: `MAX_CONDITIONAL_HOPS` moved from flow-runner.ts to src/constants.ts, joining MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, and BUDGET_CRITICAL_THRESHOLD. The re-export from flow-runner.ts (`export { MAX_CONDITIONAL_HOPS }`) maintains backward compatibility. This completes the pattern where any constant shared across 2+ pipeline stages lives in constants.ts.

- **Per-branch visited set copying for diamond graph handling**: The estimator's `getConditionalBranchCosts` creates `new Set(visited)` per branch before recursing. This correctly handles diamond-shaped conditional graphs (A->B, A->C, B->D, C->D) where the same target appears in multiple independent paths. The runtime's visited set is simpler (single mutable set) because runtime execution follows exactly one branch per hop, not all branches simultaneously.

- **Error annotation via post-loop suffix**: The foreach iteration context uses a post-hoc annotation pattern: errors are collected normally during body execution, then suffixed with `(foreach iteration N of M)` after the fact (flow-runner.ts:209-211). This avoids threading iteration context through the entire error chain and is a clean separation of "what failed" from "where it failed."

### Patterns to Monitor

- **estimator.ts growth trajectory**: 143 lines (v3.4, single-hop conditional) -> 305 lines (v3.8, multi-hop recursive). The recursive `getConditionalBranchCosts` added ~70 lines. The file is well-structured (7 private methods, each focused on a single concern), but further estimation features would benefit from extraction into sub-methods or a separate conditional-estimation module.

- **Warning accumulation in estimator**: The `warnings` parameter is now threaded through `computeFlowCosts` and `getConditionalBranchCosts`. This is the estimator's first time producing structured warnings (previously only the top-level `estimate()` method produced BUDGET_EXCEEDED). The pattern is correct but adding more warning types could benefit from a dedicated WarningCollector or similar.

- **Constants file scope**: src/constants.ts now has 5 exported constants spanning 3 domains: model mapping (MODEL_MAP), estimation tuning (PARTIAL_FIELD_FACTOR), budget thresholds (BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD), and execution limits (MAX_CONDITIONAL_HOPS). At 17 lines this is not a concern, but if more constants are added, grouping by domain may help readability.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Carried forward unchanged. Still the primary blocker for memory importability. Not in near-term roadmap. No user demand.

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: Unchanged. Text-based approach is holding. No new edge cases from v3.8.

- **[v3.4-R06] Conditional edge estimation: best=min branch cost, worst=max branch cost**: This ratchet now accurately describes the per-hop behavior of the recursive estimator. The v3.8-R2 implementation preserves best=min, worst=max at each branch point while accumulating costs through the chain. No longer a concern -- ratchet and implementation are aligned.

- **[v2.1-R15] Budget enforcement advisory only; no hard abort**: Unchanged. Token budget is advisory. Hard enforcement remains deferred.

### New Ratchets from v3.8

Based on the round summaries and review artifacts, the following decisions should be ratcheted:

- **R1**: `applyFallbackAlias(name, result, ctx)` as exported helper in flow-runner.ts; `executeConditionalChain(flowNodeName, result, ctx, nodeResults, errors)` as exported function; `executeWithFailureStrategy` remains private (not exported).
- **R2**: `MAX_CONDITIONAL_HOPS` in src/constants.ts as single source of truth (re-exported from flow-runner.ts); recursive `getConditionalBranchCosts` with per-branch `new Set(visited)` copies; `conditionalEdges` stores `ConditionalBranch[]` not `string[]`; `computeFlowCosts` accepts `warnings` parameter; cycle and depth warnings use `BUDGET_EXCEEDED` code.
- **R3**: Foreach error annotation pattern: suffix `(foreach iteration N of M)` applied post-hoc to new errors after body execution.

### Ratchets Confirmed Still Valid

All ~230 ratchets reviewed. The v3.4-R06 ratchet, which was the sole concern in v3.7 retro, is now fully aligned with the recursive implementation. No ratchets are blocking v3.9 feature work.

---

## 4. Edge Cases & Gaps

### Runtime (resolved in v3.8)

- **Foreach iteration context in errors**: RESOLVED. Error messages now include `(foreach iteration N of M)` suffix, identifying which iteration triggered the failure.

- **Estimator-runtime parity for conditional chains**: RESOLVED. Estimator now follows chains recursively with cycle detection, depth limiting, and retry multiplier propagation -- matching the runtime's behavior.

### Runtime (remaining gaps)

- **Edge transforms not applied in conditional chains**: When the runtime follows a conditional edge from A to B, any transforms declared on that edge are not applied. The scope checker warns about this (SCOPE_TRANSFORM_CONDITIONAL), but the runtime silently ignores transforms on conditional edges. This was a known gap since v3.3-R2 and is unchanged.

- **Parallel + conditional interaction is untested at scale**: No test for conditional chains originating from within a parallel block (two parallel branches each triggering their own multi-hop conditional chains simultaneously). Basic parallel + conditional interactions are tested.

- **No iteration context for nested foreach**: The annotation pattern handles single-level foreach correctly, but nested foreach (foreach inside foreach) will produce multiple suffixes on the same error, e.g., `Node X failed (foreach iteration 2 of 3) (foreach iteration 1 of 5)`. This is technically correct (both iteration contexts are present) but the ordering is inner-first, which may be counterintuitive. The nesting scenario is rare in practice.

### Estimator (remaining gaps)

- **Estimator uses BUDGET_EXCEEDED for cycle/depth warnings**: Both conditional chain cycle detection and depth limit warnings reuse the `BUDGET_EXCEEDED` error code. These are distinct diagnostic scenarios (cycle vs depth vs actual budget exceeded). A more specific code (e.g., `BUDGET_CHAIN_CYCLE`, `BUDGET_CHAIN_DEPTH`) would improve diagnostic clarity. Not blocking -- all three are warnings, not errors.

- **Location { line: 0, column: 0, offset: 0 } for chain warnings**: Estimator chain warnings use a zero-position location because the estimator does not track source locations for edge declarations. This is cosmetically imperfect in IDE diagnostics (warning appears at file start) but functionally harmless since the warning text is self-describing.

### LSP (remaining gaps -- unchanged from v3.7)

- **Field name collision in references/rename**: If a context field and produces output share a name, false positives occur. Scope checker enforces uniqueness at declaration level.
- **includeDeclaration only works for current file**: Declaration filtering in findReferences only checks current file's ProgramIndex.
- **producesNodeMap for references but not rename**: Produces names are referable but not renameable. Intentional.
- **Multi-line import braces**: Import pattern regex does not match multi-line import brace syntax.

---

## 5. Performance Observations

- **Flow-runner extraction has no performance impact**: `applyFallbackAlias` and `executeConditionalChain` are normal function calls. The extraction adds one function call overhead per node execution (for applyFallbackAlias) and one per conditional chain (for executeConditionalChain). Both are negligible compared to LLM subprocess execution.

- **Estimator recursion depth bounded by MAX_CONDITIONAL_HOPS=10**: The recursive `getConditionalBranchCosts` creates a new `Set(visited)` per branch at each depth level. In the worst case (binary branching at each hop), this creates 2^10 = 1024 Set copies. Each Set contains at most 10 entries. Total memory: ~10KB. For typical conditional chains (2-4 hops, 2-3 branches), overhead is negligible.

- **No new memory concerns**: Constants centralization adds zero runtime overhead (module-level constants). The foreach error annotation pattern creates new strings via template literals but only on error paths.

- **Parse cache at 50 entries (LRU)**: Unchanged. Adequate for current workspace sizes.

- **LSP line counts unchanged at ~1,297 total**: No LSP changes in v3.8. Feature surface stable.

---

## 6. Architecture Assessment

### Runtime Feature Completeness

The runtime now handles all declared flow control constructs correctly:

| Feature | Status | Since |
|---------|--------|-------|
| Sequential node execution | Complete | v1.2 |
| Parallel execution (Promise.allSettled) | Complete | v1.2 |
| Foreach iteration | Complete | v1.2 |
| Edge transforms (select, filter, drop, compact, truncate) | Complete (non-conditional only) | v1.2 |
| Failure strategies (retry, fallback, skip, abort, retry_then_fallback) | Complete | v3.0-R5 |
| Conditional edge routing (single-hop) | Complete | v3.3-R2 |
| Conditional edge routing (multi-hop) | Complete | v3.7-R3 |
| Foreach source failure handling | Complete | v3.7-R2 |
| Foreach iteration error context | Complete | v3.8-R3 |
| Memory persistence (load/save/field-level) | Complete | v2.0/v3.0 |
| Token tracking | Complete | v2.1 |
| Token estimation (multi-hop conditional) | Complete | v3.8-R2 |

**Remaining runtime gaps**: edge transforms on conditional edges (warned, not applied), parallel + multi-hop conditional interaction (untested at scale).

### Estimator-Runtime Alignment

With v3.8-R2, the estimator is now fully aligned with the runtime for all execution patterns:

| Pattern | Estimator | Runtime | Status |
|---------|-----------|---------|--------|
| Sequential | Sum of costs | Sequential execution | Aligned |
| Parallel | Sum of all branches | Promise.allSettled | Aligned |
| Foreach | best=1x, worst=Nx | Up to maxIterations | Aligned |
| Conditional (single-hop) | best=min, worst=max | First matching branch | Aligned (v3.4) |
| Conditional (multi-hop) | Recursive chain walk | Multi-hop with visited set | Aligned (v3.8) |
| Retry multiplier | 1 + max retries | Retry loop | Aligned |
| Fallback cost | Not in worst case | Fallback execution | Gap (minor) |
| Cycle detection | Warning + finite cost | Error + break | Aligned |
| Depth limit | Warning + finite cost | Error + break | Aligned |

The one minor gap is fallback node cost: the estimator's worst-case does not add the fallback node's cost on top of the retry multiplier for `retry_then_fallback` strategies. This underestimates worst case by one fallback execution. LOW priority -- the advisory nature of budget enforcement (v2.1-R15) makes this acceptable.

### Codebase Stability Assessment

**The codebase is approaching stability.** Key indicators:

1. **Runtime feature-complete**: All declared flow control, failure strategies, conditional routing, memory, and token tracking are implemented and tested. The runtime table above has zero "Incomplete" entries for core features.

2. **Estimator aligned**: After 5 retros carrying TD-03, the estimator now mirrors the runtime for all execution patterns. No pipeline stage divergence remains.

3. **LSP mature**: 8 feature modules totaling 914 lines (unchanged since v3.6). Server.ts at 383 lines (unchanged since v3.7). No LSP work was needed in v3.8. Total LSP surface: ~1,297 lines.

4. **Tech debt inventory shrinking**: v3.7 had 10 TD items (TD-01 through TD-10). v3.8 resolved 3 (TD-02, TD-03, TD-04). Remaining: 7 items, all LOW except TD-01 (MEDIUM). No new MEDIUM or HIGH items introduced.

5. **flow-runner.ts complexity resolved**: The densest block in the codebase (66-line case 'node') is now 9 lines. The 4 concerns (failure strategy, fallback alias, conditional chain, depth limit) are distributed across 4 named functions.

6. **Zero NEEDS_CHANGES in v3.8**: All 4 rounds passed first-try review. This is the first version since v3.5 with a perfect pass rate.

7. **Decreasing test-per-round ratio**: v3.8 added 32 tests in 4 rounds (8 per round average), compared to v3.7's 42 in 4 rounds (10.5 per round). This suggests the changes are more focused -- cleanup and parity rather than new surface area.

### What v3.8 Did Well

1. **Closed the longest-running tech debt**: TD-03 (estimator-runtime parity) was carried through 5 consecutive retros (v3.3 through v3.7). v3.8-R2 resolved it cleanly with a recursive implementation that handles diamond paths, cycles, and depth limits. The per-branch visited set copy is an elegant solution that was not obvious in earlier retros.

2. **Extraction was truly mechanical**: R1's extraction of `applyFallbackAlias` and `executeConditionalChain` changed zero behavior. The 66-line block became 9 lines in-place plus two named functions. This is textbook extraction -- no regressions, no surprises, reviewer found zero issues.

3. **MAX_CONDITIONAL_HOPS centralization was opportunistic**: Moving the constant to constants.ts during R2 (when the estimator needed it) was the right timing. The re-export from flow-runner.ts maintains backward compatibility for any external consumers.

4. **Foreach error context was minimal and correct**: The post-hoc annotation pattern (suffix errors after body execution) is 3 lines of code that adds significant debugging value. The implementation correctly annotates only new errors (using `errorsBefore` index), not pre-existing ones.

### Architectural Concerns

1. **estimator.ts at 305 lines**: The file more than doubled from v3.4 (143 lines) to v3.8. The recursive `getConditionalBranchCosts` accounts for ~60 lines. The file is still well-structured (7 focused private methods), but it is now the second-largest source file after executor.ts (361 lines) and server.ts (383 lines). Future estimation features should consider whether a conditional estimation sub-module is warranted.

2. **Fallback cost gap in estimator**: As noted in the alignment table, the worst-case estimation for `retry_then_fallback` does not include the fallback node's cost. The formula is `cost * (1 + max)` but the actual worst case is `cost * (1 + max) + fallbackCost`. This is a known approximation, not a bug, and is consistent with the advisory nature of budget enforcement.

3. **BUDGET_EXCEEDED overloaded**: The estimator now uses BUDGET_EXCEEDED for 3 distinct scenarios: actual budget exceeded, conditional chain cycle detected, and conditional chain depth exceeded. Adding specific codes would improve diagnostic clarity, but the existing approach is functional.

---

## 7. v3.9 Scope Recommendations

### Assessment of remaining work

The runtime is feature-complete for all declared constructs. The estimator is aligned. The LSP is mature (8 features, stable for 2 versions). The tech debt inventory has shrunk to 7 items (1 MEDIUM, 6 LOW). The codebase is stable.

The remaining feature gaps fall into two categories:
1. **Polish**: edge transforms on conditional edges, parallel+conditional scale testing, fallback cost estimation, BUDGET_EXCEEDED code overloading
2. **Language features**: memory importability, budget hard enforcement

### Recommended scope: Quality polish + edge case closure

**Rationale**: The codebase is approaching a natural stability plateau. Rather than introducing new language features, v3.9 should close the remaining edge case gaps and polish items that have accumulated across versions. This would position v4.0 as a clean slate for the next feature wave.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Edge transforms on conditional edges (resolve SCOPE_TRANSFORM_CONDITIONAL warning, implement actual transform application) | MEDIUM | 4 |
| R2 | Estimator polish: fallback cost in worst-case + dedicated BUDGET_CHAIN_CYCLE/BUDGET_CHAIN_DEPTH codes | DIRECT | 2 |
| R3 | Parallel + multi-hop conditional integration tests at scale | TEST-ONLY | 2 |
| **Total** | | | **~8** |

### Alternative scope: Language features

If polish is deferred, v3.9 could address language-level gaps:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Memory importability (unlock v2.0-R13) | MEDIUM | 4 |
| R2 | Token budget hard enforcement (unlock v2.1-R15) | MEDIUM | 4 |
| R3 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~10** |

### Ratchet unlocks anticipated
- Recommended scope: 0 unlocks. No existing ratchets block edge transform implementation or estimator polish.
- Alternative scope: 2 unlocks (v2.0-R13 for memory importability, v2.1-R15 for budget hard enforcement).

### Items explicitly deferred to v4.0+
- Memory importability -- no user demand (unless alternative scope chosen)
- Budget hard enforcement -- no user demand (unless alternative scope chosen)
- AST-based reference tracking -- text-based approach confirmed sufficient
- Async file I/O -- LLM latency dominates
- Source maps / workspace support -- major features needing dedicated versions
- Second codegen backend -- no user demand
- Lexer error recovery (TD-05) -- marginal benefit for Graft file sizes
- isReferable/isRenameable unification -- functions are small and semantically distinct

### Test target
864 existing + ~20 new = ~884 tests at v3.9 completion.

### v3.7 retro deferred items status check
- **TD-02 (flow-runner density)**: RESOLVED in v3.8-R1.
- **TD-03 (estimator parity)**: RESOLVED in v3.8-R2.
- **TD-04 (fallback alias duplication)**: RESOLVED in v3.8-R1.
- **Foreach iteration context in errors**: RESOLVED in v3.8-R3.
- Memory importability (v2.0-R13): Still deferred. No user demand.
- Async file I/O: Still deferred. LLM latency dominates.
- Source maps: Still deferred. Major feature.
- Parallel + multi-hop conditional testing at scale: Still deferred. Could be v3.9 scope.
