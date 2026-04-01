# Technical Retrospective: Graft v3.3

## Version Summary

v3.3 delivered 4 rounds: LSP code actions (R1, MEDIUM), conditional edge runtime routing (R2, MEDIUM), document symbols + condition type validation (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 582 to 636 (54 new tests). 10 new ratchet items added, 0 unlocked. Ratchet count stands at 190 total (185 locked, 5 unlocked across all versions). The version was executed in ~12 agent calls.

v3.3's primary contributions are: (1) LSP code actions with auto-import for SCOPE_UNDEFINED_REF using a workspace export cache, (2) conditional edge runtime routing via evaluateCondition() and FlowContext.getConditionalEdge, (3) document symbols for outline view, and (4) condition type validation (TYPE_CONDITION_MISMATCH for ordered operators on non-numeric fields). All four items from the v3.2 retro's recommended scope (Section 6) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: Lexer still throws on first error (no recovery)
- **Severity**: MEDIUM
- **Status**: Carried forward from v3.2 retro (TD-01)
- **Description**: The lexer throws a GraftError on the first unrecognized character or malformed token. Multi-error reporting only works for syntactically valid tokens with structural errors.
- **Impact**: Users with non-ASCII characters or truly invalid tokens see only one error. Small surface since the lexer's alphabet is well-defined.
- **Recommendation**: LOW priority. Marginal benefit. Carry forward.

### TD-02: features.ts is 552 lines and still growing
- **Severity**: MEDIUM (upgraded from LOW)
- **Status**: Carried forward from v3.2 retro (TD-07), now worse
- **Description**: features.ts grew from 487 lines (v3.2) to 552 lines (v3.3). v3.3 added extractUndefinedName(), buildAutoImportEdit(), computeRelativeImportPath() (auto-import helpers, lines 524-552), and getDocumentSymbols() + makeSymbol() (document symbols, lines 41-72). The file now contains 8 distinct feature categories: diagnostics, document symbols, word extraction, hover, go-to-definition, type formatting, completions (with 8 sub-handlers + 5 helpers), and auto-import helpers.
- **Impact**: Navigability. The file remains logically organized with section headers, but at 552 lines it has crossed the threshold where splitting would improve maintenance. The v3.2 retro specifically predicted this: "Split when the next LSP feature (code actions) is added."
- **Recommendation**: Split into `features/completions.ts` and `features/code-actions.ts` (or similar) in the next version that adds LSP features. The auto-import helpers (extractUndefinedName, buildAutoImportEdit, computeRelativeImportPath) are already self-contained and testable independently.

### TD-03: server.ts has grown to 294 lines with workspace scanning inline
- **Severity**: MEDIUM
- **Status**: New in v3.3
- **Description**: server.ts grew from ~200 lines (v3.2) to 294 lines. The workspace export scanning logic (scanWorkspaceExports, scanDir, parseAndCacheExports -- lines 202-233) and the code action handler (lines 237-291) are substantial additions. The code action handler contains inline logic for collecting imported names, iterating workspace exports, and building edits -- all of which could be pure functions in features.ts.
- **Impact**: The server file is accumulating business logic that should live in testable pure functions. The scanDir/parseAndCacheExports functions do synchronous recursive filesystem traversal, which is appropriate for a lazy one-time scan but would block the event loop if the workspace is large.
- **Recommendation**: Extract the code action matching logic (lines 254-289) into a pure function in features.ts. This would make it unit-testable without LSP protocol wiring. The filesystem scanning can stay in server.ts since it's inherently side-effectful.

### TD-04: Workspace export cache uses Map<filePath, string[]> with no invalidation on file deletion
- **Severity**: LOW
- **Status**: New in v3.3
- **Description**: The workspaceExports map (server.ts:53) is populated by lazy scanning on first code action request. It is updated when documents change (line 123: parseAndCacheExports on .gft changes). However, if a .gft file is deleted from the workspace, its exports remain in the cache indefinitely. There is no file watcher for deletions.
- **Impact**: Stale auto-import suggestions could offer imports from deleted files. The user would see an import suggestion, apply it, and then get a RESOLVE_FILE_NOT_FOUND error on the next validation. Minor UX friction, not a crash.
- **Recommendation**: LOW priority. Could be addressed by adding workspace/didDeleteFiles handling, but the self-correcting behavior (import fails, user sees error) is acceptable for now.

### TD-05: Completion context detection remains position-fragile
- **Severity**: LOW
- **Status**: Carried forward from v3.2 retro (TD-03), unchanged
- **Description**: isInsideBracketAfter(), isInsideImportBraces(), and isInsideBlock() scan backwards looking for unmatched delimiters. Malformed documents with unmatched brackets can cause false positives.
- **Impact**: Wrong completion suggestions for malformed files. Not a crash.
- **Recommendation**: Carry forward. No reports of issues.

### TD-06: isInComment() scans from document start on every completion request
- **Severity**: LOW
- **Status**: Carried forward from v3.2 retro (TD-04), unchanged
- **Description**: isInComment() iterates all lines from line 0 to cursor line, O(n) per completion keystroke. No caching.
- **Impact**: Performance degradation on large files (500+ lines). Graft files tend to be short.
- **Recommendation**: LOW priority. Carry forward.

### TD-07: Empty `catch {}` blocks throughout codebase (17 instances)
- **Severity**: LOW
- **Status**: Carried forward from v3.2 retro (TD-08), count increased
- **Description**: v3.3 added 4 new bare catch blocks in server.ts (lines 204, 209, 214, 232) for the workspace scanning code (all best-effort filesystem operations). Total across codebase: 17 bare catch blocks (server.ts: 7, subprocess.ts: 4, memory.ts: 2, executor.ts: 1, resolver.ts: 1, token-tracker.ts: 1, version.ts: 1).
- **Impact**: Silent failures in edge cases. Each is individually justified (graceful degradation), but the pattern makes debugging harder.
- **Recommendation**: Not a priority. The filesystem catch blocks in workspace scanning are correct behavior (best-effort scan).

### TD-08: estimator.ts TODO for conditional edge branch estimation
- **Severity**: LOW
- **Status**: Carried forward from v3.2 retro (TD-05, partial)
- **Description**: `src/analyzer/estimator.ts:37` has `// TODO: store conditional edge branches for token estimation (v2)`. The estimator's edgeMap only stores direct edges (line 34: `if (edge.target.kind === 'direct')`). Conditional edges are skipped entirely. Now that conditional edges are runtime-functional (v3.3-R2), the estimator does not account for the cost of conditionally-routed nodes.
- **Impact**: Token budget estimates undercount when conditional edges route to nodes. A conditional branch that routes to node X will execute X but the estimator's best/worst case calculation does not include X's cost. This is a correctness gap in budget estimation.
- **Recommendation**: MEDIUM priority. Now that conditional routing is implemented, the estimator should account for conditional branches: best case = cheapest branch, worst case = most expensive branch. This is ~20-30 lines of code in computeFlowCosts().

### TD-09: evaluateCondition uses loose equality (==) and Number() coercion
- **Severity**: LOW
- **Status**: New in v3.3
- **Description**: evaluateCondition() in flow-runner.ts uses `==` (loose equality, line 18) and `Number()` for coercion (lines 20-23). Loose equality means `0 == ""` is true, `null == undefined` is true, etc. Number() coercion means `Number("abc")` becomes NaN, and all comparisons with NaN are false.
- **Impact**: Edge cases with type-mismatched condition values could produce unexpected routing. The new checkConditionTypes() in TypeChecker catches ordered comparisons on non-numeric types at compile time (TYPE_CONDITION_MISMATCH), which mitigates the ordered operator cases. However, `==` and `!=` with mixed types (e.g., comparing integer output to string condition value "0") still use loose equality at runtime.
- **Recommendation**: LOW priority. The TypeChecker validation catches the most dangerous cases. Loose equality for `==`/`!=` is ratchet-locked (v3.3-R09: "Numeric coercion via Number() for ordered comparison operators"). Monitor for user reports.

### TD-10: ScopeChecker remains the largest analyzer class (444 lines)
- **Severity**: LOW
- **Status**: Carried forward from v3.2 retro (TD-06), unchanged
- **Description**: ScopeChecker handles 11+ check categories. Not blocking any feature work.
- **Recommendation**: SKIP. Extract helpers only if a new check category is added.

---

## 2. Emerging Patterns

### Patterns to Formalize

- **Workspace-aware LSP pattern**: v3.3 introduced workspace-level awareness via the workspace export cache (workspaceExports map, lazy scanning, onChange updates). This is the first time the LSP looks beyond the single open document. Future workspace features (rename, find-all-references, workspace symbols) should build on this pattern: lazy scan on first request, incremental update on document change, stale-but-functional on deletion.

- **FlowContext extension pattern**: v3.3 extended FlowContext with `getConditionalEdge?` as an optional method (v3.3-R07). This follows the same pattern as `getFailureStrategy?` (v3.0-R21). New runtime capabilities that need per-node lookup should follow this: optional method on FlowContext, implemented in executor.ts, consumed in flow-runner.ts. The interface is accumulating optional methods -- currently 3 (executeNode required, getFailureStrategy optional, getConditionalEdge optional).

- **TypeChecker as validation hub**: v3.3 added checkConditionTypes() as a third validation pass in TypeChecker (alongside checkEdgeTransforms and checkWritesSchemaOverlap). The TypeChecker is evolving from "edge transform field validation" to a general type compatibility checker. Future type validations should go here.

- **DIRECT tier dominance**: v3.3 used MEDIUM for 2 rounds (R1, R2) and DIRECT for 1 (R3), continuing the trend. Of the last 12 rounds across v3.2-v3.3, 5 were DIRECT, 4 were MEDIUM, 2 were TEST-ONLY, and 1 was DIRECT (R3 of v3.2 was orchestrator-direct). MEDIUM is reserved for rounds that touch multiple pipeline stages; DIRECT works for focused additions.

### Patterns to Monitor

- **FlowContext interface growth**: FlowContext now has 4 members (executeNode, getFailureStrategy, getConditionalEdge, outputs/input via RuntimeState). If more optional methods are added, consider a capabilities object or strategy pattern to avoid a God interface.

- **Dual-purpose ProgramIndex maps**: ProgramIndex.producesFieldsMap is keyed by both node name AND produces name (v3.0-R16). This dual-keying pattern has not been extended to other maps but could create confusion if produces names collide with node names in different contexts.

- **Synchronous filesystem in LSP**: The workspace scanning (scanDir, parseAndCacheExports) and completion import resolution (resolveImportNames in server.ts:169-183) both do synchronous filesystem I/O. For small workspaces this is fine; for large monorepos it could block the LSP event loop during the initial scan.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v3.3-R09] Numeric coercion via Number() for ordered comparison operators**: Currently correct but could be revisited if Graft adds a strict mode or if users report surprising condition evaluation behavior. The combination of loose `==` for equality and `Number()` for ordering is pragmatic but not type-safe.

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Still the primary blocker for memory importability (R-01 from roadmap). No change since v3.2 retro -- still a legitimate use case (shared counters, configuration) but not blocking current users.

- **[v3.3-R03] Workspace export cache: lazy scan on first code action, Map<exportName, filePath>**: The cache structure (Map<filePath, string[]>) is inverted from the lookup pattern (name -> file). Each code action iterates ALL workspace files to find a matching export name. This is O(files * exports) per diagnostic. If workspaces grow large, this could be slow. Consider inverting to Map<exportName, filePath[]> for O(1) lookup.

### Ratchets Confirmed Still Valid

All 190 ratchets reviewed. The 10 new v3.3 ratchets (R01-R10) are sound. No ratchets are actively blocking v3.4 feature work. The v3.2 retro identified [v2.0-R13] as a potential unlock for memory importability -- this remains true but memory importability is not in the near-term roadmap.

---

## 4. Edge Cases & Gaps

### Runtime

- **Conditional edge routing does not chain**: If node A routes conditionally to node B, and node B also has a conditional edge, the second conditional edge is NOT evaluated. The flow-runner only checks getConditionalEdge for the current flow node (flow-runner.ts:97-116), and the conditionally-routed node is executed via executeWithFailureStrategy without re-entering the conditional edge check. This means conditional routing is limited to one hop.

- **Conditional edge + transforms interaction**: Edge transforms are applied in storeOutput() (executor.ts:335-347) only for direct edges (`edge.target.kind === 'direct'`). Transforms on conditional edges are already blocked at analysis time (SCOPE_TRANSFORM_CONDITIONAL), but if this restriction is ever lifted, the runtime transform application would need updating.

- **Foreach source failure handling**: Unchanged from v3.2 retro. If the source produces non-iterable output, the error message is generated (flow-runner.ts:148) but the foreach binding cleanup still runs. Not a crash but the error path is untested for edge cases like null source data.

- **Synchronous file I/O in executor**: Unchanged from v3.2 retro. LLM subprocess latency dominates, so this is not a practical bottleneck.

### LSP

- **No rename support**: Unchanged from v3.2 retro. ProgramIndex tracks all references. Cross-file rename needs the workspace export cache infrastructure from v3.3 as a foundation.

- **Document symbols lack children**: getDocumentSymbols() returns flat symbols (no nesting). Context fields, node produces fields, and graph flow nodes are not represented as child symbols. The LSP protocol supports hierarchical DocumentSymbol with a `children` array. This would give users a richer outline view.

- **Code action only handles SCOPE_UNDEFINED_REF**: The code action provider only fires for SCOPE_UNDEFINED_REF diagnostics. Other fixable diagnostics (e.g., SCOPE_DUPLICATE for typos, BUDGET_EXCEEDED for budget suggestions) are not addressed. Auto-import is the highest-value case, but the infrastructure now exists for additional quick fixes.

- **Workspace export cache does not include memories or graphs**: parseAndCacheExports() (server.ts:220-233) only caches context and node names. This is correct per v2.0-R13 (only contexts and nodes are importable), but if memory importability is ever added, the cache would need updating.

### Analyzer

- **Token estimation gap for conditional branches**: The estimator skips conditional edges entirely (estimator.ts:34-38). A graph with `A -> B when(status == "ok"), C when(status == "error")` would estimate cost for A but not for B or C, even though one of them will always execute. This is the most actionable gap -- conditional routing is now a runtime feature but the estimator is unaware of it.

---

## 5. Feature Priority Ranking

Ranked by user impact weighted against implementation complexity.

| Rank | Feature | Complexity | Impact | Notes |
|------|---------|-----------|--------|-------|
| 1 | LSP rename support | MEDIUM | HIGH | ProgramIndex tracks locations. Workspace export cache from v3.3 provides cross-file foundation. Highest remaining LSP gap. |
| 2 | Token estimation for conditional edges | LOW | MEDIUM | ~30 lines in estimator.ts. Fixes a correctness gap now that conditional routing works. TD-08. |
| 3 | Document symbol children (hierarchical outline) | LOW | MEDIUM | Add field-level children to context/node/memory/graph symbols. ~40 lines. |
| 4 | features.ts split | LOW | MEDIUM | Split completions and auto-import helpers into separate files. Pure refactoring, no behavior change. TD-02. |
| 5 | Code action handler extraction to features.ts | LOW | LOW-MEDIUM | Move matching logic from server.ts to a pure function. Improves testability. TD-03. |
| 6 | Additional code actions (add missing field, fix budget) | MEDIUM | LOW-MEDIUM | Infrastructure exists from v3.3-R1. Incremental additions. |
| 7 | Memory importability | HIGH | LOW-MEDIUM | Requires unlocking v2.0-R13, parser + resolver + scope changes. Deferred since v2.0. R-01. |
| 8 | Inverted workspace export index | LOW | LOW | Flip Map<filePath, names[]> to Map<name, filePaths[]> for O(1) lookup. Only matters for large workspaces. |
| 9 | Async file I/O in executor | MEDIUM | LOW | LLM latency dominates. R-02. |
| 10 | Source maps for runtime errors | HIGH | LOW | Substantial effort for modest debugging improvement. X-03. |

---

## 6. Recommendation for v3.4 Scope

### Recommended scope: LSP rename + estimator fix + LSP refinements + tech debt split

**Rationale**: v3.3 completed the initial LSP code action infrastructure and conditional edge runtime. The LSP is now feature-rich enough that rename support is the most impactful remaining gap -- users editing multi-file Graft projects need safe renaming. The conditional edge estimator gap (TD-08) is a small, high-value correctness fix that should ride along. Features.ts splitting is overdue (predicted in v3.2, now at 552 lines).

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | LSP rename support (single-file + cross-file via workspace cache) | MEDIUM | 4 |
| R2 | Token estimation for conditional edges + features.ts split | DIRECT | 2 |
| R3 | Hierarchical document symbols + code action extraction to features.ts | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~10** |

**Ratchet unlocks anticipated**: 0 (no existing ratchets block these features).

**Items explicitly deferred to v3.5+**:
- Memory importability (R-01) -- needs design discussion for scoping rules
- Async file I/O (R-02) -- LLM latency dominates
- Additional code actions beyond auto-import -- incremental, can be added per-round in future versions
- Source maps / multi-file workspace support -- major features needing dedicated versions
- Inverted workspace export index -- only needed at scale

**Test target**: 636 existing + ~40 new = ~676 tests at v3.4 completion.

**v3.2 retro deferred items status check**:
- Memory importability (R-01): Still deferred. No user demand.
- Async file I/O (R-02): Still deferred. LLM latency dominates.
- Second backend (R-08): Still deferred. No user demand.
- LSP rename support: **Promoted to v3.4 R1** -- now feasible with workspace cache infrastructure.
- Source maps / workspace support: Still deferred.
