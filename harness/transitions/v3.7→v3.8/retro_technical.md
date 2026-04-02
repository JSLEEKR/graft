# Technical Retrospective: Graft v3.7

## Version Summary

v3.7 delivered 4 rounds: server.ts orchestration extraction + findDeclNamePosition fix (R1, DIRECT), foreach source failure handling (R2, MEDIUM), multi-hop conditional edge routing (R3, MEDIUM), and integration tests (R4, TEST-ONLY). Test count rose from 790 to 832 (42 new tests). Ratchet count stands at ~225 total (220 locked, 5 unlocked across all versions). The version was executed in ~12 agent calls (including one NEEDS_CHANGES in R3).

v3.7's primary contributions are: (1) ensureWorkspaceScan() and collectWorkspaceFileTexts() extracted from server.ts, reducing it from 394 to 383 lines, (2) findDeclNamePosition rewritten to use loc.length instead of hardcoded KEYWORD_LENGTHS map, (3) foreach source failure handling with fallback output aliasing and skip guard, (4) multi-hop conditional edge routing with visited set cycle detection, done-as-target support, fallback alias propagation, and MAX_CONDITIONAL_HOPS=10, and (5) scope.ts branch.target !== 'done' guard for conditional edge validation. All five items from the v3.6 retro's recommended scope (Section 7) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: collectRenameLocations import-path exclusion is fragile [MEDIUM]
- **Severity**: MEDIUM
- **Status**: Carried forward from v3.6 retro (TD-01), v3.5 retro (TD-03)
- **Description**: The import-path filtering in collectRenameLocations (rename.ts:133-138) uses a simple regex `from\s+"([^"]*)"` to detect import paths. Both rename and find-all-references share collectRenameLocations, so a false match corrupts two features. The edge case of multiple `from` on one line remains.
- **Impact**: Unchanged. In practice, Graft's strict import syntax makes this unlikely.
- **Fix**: Parse import statements from the AST (available in ProgramIndex) and check match offsets against import path ranges. ~15 lines.
- **Recommendation**: MEDIUM priority. Address when next modifying collectRenameLocations.

### TD-02: flow-runner.ts complexity approaching extraction threshold [MEDIUM]
- **Severity**: MEDIUM
- **Status**: New in v3.7
- **Description**: flow-runner.ts grew from ~80 lines (v2.2 origin) to 208 lines. The `case 'node'` branch in executeFlowNodes (lines 89-155) is now 66 lines, containing nested concerns: failure strategy dispatch, fallback output aliasing, multi-hop conditional routing with cycle detection and depth limiting. The multi-hop routing loop alone (lines 100-153) is 53 lines with 3 levels of nesting (switch -> case -> for loop -> if/for). This is the densest block in the codebase.
- **Impact**: Adding any further node execution behavior (e.g., edge transforms at runtime, post-execution hooks) will push the case block past 80 lines. The fallback alias pattern appears twice in this block (lines 96-98 and 140-142), a local duplication.
- **Fix**: Extract `executeConditionalChain(flowNodeName, result, ctx, nodeResults, errors)` as a standalone function (~55 lines moved out). The inline fallback alias at line 96-98 could also be folded into a shared helper, but the two-site duplication is tolerable given the semantic difference (one is for the initial node, one is for chain nodes).
- **Recommendation**: MEDIUM priority. Address before adding any new node-level runtime behavior.

### TD-03: Token estimator still single-hop for conditional chains [MEDIUM]
- **Severity**: MEDIUM
- **Status**: Carried forward from v3.6 retro (Section 4), v3.5 retro, v3.4 retro, v3.3 retro
- **Description**: The runtime now follows conditional chains up to 10 hops (v3.7-R3), but the token estimator (estimator.ts:137-143, getConditionalBranchCosts) only accounts for one hop of conditional branching. A chain A->B->C->D would estimate cost for B only (the first hop), missing C and D entirely.
- **Impact**: Budget estimates will undercount programs using multi-hop conditional chains. The gap between estimated and actual token usage widens with chain depth. This was a theoretical concern before v3.7; now that the runtime supports multi-hop chains, the estimator mismatch is a concrete correctness gap.
- **Fix**: Walk the conditional edge graph in the estimator the same way the runtime does: follow edgesBySource chains, accumulate costs per hop, apply best/worst at each branch point. Use a visited set to handle cycles (or cap at MAX_CONDITIONAL_HOPS). ~30 lines in estimator.ts.
- **Recommendation**: MEDIUM priority. The estimator should match the runtime's capabilities. Promoted from LOW to MEDIUM because the runtime gap has been closed.

### TD-04: Fallback alias pattern duplicated in flow-runner.ts [LOW]
- **Severity**: LOW
- **Status**: New in v3.7
- **Description**: The pattern `if (result.node !== flowNode.name) ctx.outputs.set(flowNode.name, result.output)` appears at lines 96-98 (initial node execution) and lines 140-142 (conditional chain step). Both serve the same purpose: when a fallback node's output is stored under the fallback node's name by executeWithFailureStrategy, the alias ensures downstream consumers can find it under the originally-requested name.
- **Impact**: Minor. The two sites have slightly different variable names (flowNode.name vs target, result vs conditionalResult) reflecting their contexts. The semantic intent is identical.
- **Fix**: Extract `applyFallbackAlias(requestedName, result, ctx)` helper. ~5 lines.
- **Recommendation**: LOW priority. Tolerable local duplication. Could be addressed alongside TD-02 extraction.

### TD-05: Lexer still throws on first error (no recovery) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-05), v3.5 retro (TD-05), v3.4 retro (TD-06), v3.3 retro (TD-01), v3.2 retro (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting only works at the parser level and above.
- **Recommendation**: LOW priority. Carry forward. Marginal benefit for Graft file sizes.

### TD-06: Completion context detection remains position-fragile [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-06), v3.5 retro (TD-06), v3.4 retro (TD-07)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Carry forward. No reports of issues.

### TD-07: isInComment() scans from document start on every request [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-07), v3.5 retro (TD-07), v3.4 retro (TD-08)
- **Description**: O(n) per completion/rename/reference request. Usage is batch, so performance impact is bounded.
- **Recommendation**: LOW priority. Carry forward.

### TD-08: Empty `catch {}` blocks throughout codebase (~20 instances) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-08)
- **Description**: Unchanged. Bare catch blocks used for graceful degradation on parse/filesystem operations. Each is individually justified.
- **Recommendation**: Not a priority. Consistent and intentional pattern.

### TD-09: Workspace export cache has no deletion invalidation [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-09), v3.5 retro (TD-09), v3.4 retro (TD-10)
- **Description**: Deleted .gft files remain in workspaceExports cache until server restart. Now consumed by code actions, rename, AND references (3 consumers). All three handle missing files gracefully.
- **Recommendation**: LOW priority. Carry forward.

### TD-10: FlowNode.location is optional, requires ?? fallback everywhere [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.6 retro (TD-10), v3.5 retro (TD-10)
- **Description**: Unchanged. Parser always assigns location but the type is optional.
- **Recommendation**: LOW priority. Carry forward.

### Items Resolved from v3.6 Retro
- **TD-02 (findDeclNamePosition duplicates keyword-length logic)**: RESOLVED in v3.7-R1. findDeclNamePosition now uses `decl.location.length` from SourceLocation instead of hardcoded KEYWORD_LENGTHS map. The KEYWORD_LENGTHS constant and hardcoded `8` for "produces" have been removed entirely. references.ts reduced from 109 to 78 lines.
- **TD-04 (server.ts workspace orchestration duplicated across 3 handlers)**: RESOLVED in v3.7-R1. `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` extracted as shared helpers. onRenameRequest, onReferences, and onCodeAction all use the shared helpers. server.ts reduced from 394 to 383 lines. The filter predicate parameterization (line 252) allows each handler to specify its own relevance criteria.
- **TD-03 (isReferable and isRenameable nearly identical)**: Carried forward. Still LOW priority, no action taken. The functions remain small and semantically distinct.

---

## 2. Emerging Patterns

### Patterns Formalized in v3.7

- **Fallback output aliasing**: The pattern `if (result.node !== requestedName) ctx.outputs.set(requestedName, result.output)` was introduced in R2 for foreach source failure and reused in R3 for multi-hop conditional chains. This is now the canonical way to handle the impedance mismatch between "what name the caller requested" and "what name the failure strategy actually executed." The pattern ensures downstream consumers (foreach, conditional routing) can find outputs under the expected name regardless of whether a fallback was invoked. Two sites in flow-runner.ts (lines 96-98 and 140-142).

- **Workspace orchestration helpers**: `ensureWorkspaceScan()` and `collectWorkspaceFileTexts()` establish the pattern for cross-file LSP operations. The filter predicate parameter (line 252: `filter?: (fileText: string, filePath: string) => boolean`) allows each handler to pre-filter files by relevance without duplicating scan/read logic. This pattern should be followed by any future cross-file LSP feature.

- **SourceLocation.length as canonical keyword-width source**: The v3.7-R1 fix to findDeclNamePosition completes the migration away from hardcoded keyword lengths. All three consumers of keyword width (symbols.ts/makeSymbol, references.ts/findDeclNamePosition, and diagnostics ranges) now use SourceLocation.length. This is a ratchet-worthy pattern.

### Patterns to Monitor

- **flow-runner.ts growth trajectory**: 80 lines (v2.2) -> ~130 lines (v3.0, failure strategies) -> ~145 lines (v3.3, single-hop routing) -> 208 lines (v3.7, multi-hop routing + foreach fixes). The `case 'node'` branch is now 66 lines. Each runtime feature adds ~20-30 lines to this block. If v3.8 adds edge transforms at runtime or other node-level behavior, extraction will become mandatory.

- **Conditional edge feature surface**: The conditional edge system now spans 4 pipeline stages: parser (AST), scope checker (done guard, v3.7-R3), estimator (one-hop cost, v3.4-R2), and runtime (multi-hop routing, v3.7-R3). The estimator is the only stage that has not been updated to match the runtime's multi-hop capability.

- **Skip-on-undefined as implicit failure handling**: The foreach skip guard (flow-runner.ts:181-184, `if (sourceData === undefined) { break; }`) silently skips foreach when its source has no output. This is correct but invisible -- no warning or log message. A verbose mode or diagnostic for "foreach skipped because source had no output" could be valuable for debugging pipelines, but was explicitly deferred in R2 convergence.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Carried forward unchanged from v3.6 retro. Still the primary blocker for memory importability. Not in near-term roadmap. No user demand.

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: Unchanged from v3.6 retro. Text-based approach is holding. No new edge cases from v3.7.

- **[v3.4-R06] Conditional edge estimation: best=min branch cost, worst=max branch cost**: This ratchet describes single-hop estimation. Now that the runtime supports multi-hop chains (MAX_CONDITIONAL_HOPS=10), the estimator should be updated to follow chains. The ratchet text itself is not wrong (it correctly describes the current implementation), but the gap between estimator and runtime behavior is now a concrete issue (see TD-03).

- **[v2.1-R15] Budget enforcement advisory only; no hard abort**: Unchanged. Token budget is advisory. Hard enforcement remains deferred.

### New Ratchets Assessment

v3.7 ratchets have not been formally enumerated in common_memory.md yet. Based on the round summaries and review artifacts, the following decisions should be ratcheted:

- **R1**: ensureWorkspaceScan + collectWorkspaceFileTexts as shared helpers in server.ts; findDeclNamePosition uses loc.length (resolves TD-02 from v3.6 retro).
- **R2**: Fallback output aliasing pattern (`result.node !== flowNode.name` check); foreach skip guard on undefined source data; removal of `?? ctx.input` fallback.
- **R3**: MAX_CONDITIONAL_HOPS=10; visited set cycle detection in conditional routing; `done` as valid terminal target in runtime; fallback alias propagation through chain; `branch.target !== 'done'` guard in scope.ts; depth-limit error on exceeded hops.

### Ratchets Confirmed Still Valid

All ~225 ratchets reviewed. No ratchets are actively blocking v3.8 feature work. The estimator ratchet (v3.4-R06) is correct but incomplete relative to the runtime's new capability.

---

## 4. Edge Cases & Gaps

### Runtime (newly resolved in v3.7)

- **Foreach source failure handling**: RESOLVED. Fallback output aliasing ensures downstream foreach can find source output under the expected name. Skip guard prevents iteration when source produced no output. Removed unsafe `?? ctx.input` fallback.

- **Multi-hop conditional routing**: RESOLVED. Chains up to 10 hops with cycle detection (visited set), done-as-terminal, depth limit error, and fallback alias propagation through chain.

### Runtime (remaining gaps)

- **Conditional chain depth limit is hardcoded**: MAX_CONDITIONAL_HOPS=10 is a constant in flow-runner.ts (line 101). There is no configuration mechanism to override it. For most programs this is generous, but the value is not documented in the spec or error messages beyond the error string itself.

- **Edge transforms not applied in conditional chains**: When the runtime follows a conditional edge from A to B, any transforms declared on that edge (select, filter, etc.) are not applied. The scope checker warns about this (SCOPE_TRANSFORM_CONDITIONAL), but the runtime silently ignores transforms on conditional edges. This was a known gap since v3.3-R2 and is unchanged.

- **No iteration context in foreach errors**: When a foreach body node fails, the error message does not indicate which iteration triggered the failure. This was explicitly deferred in v3.7-R2 convergence. The error says "Node X failed" but not "Node X failed on iteration 3 of 5."

- **Parallel + conditional interaction is untested at scale**: v3.7-R4 integration tests cover basic parallel + conditional interactions, but there is no test for conditional chains originating from within a parallel block (i.e., two parallel branches each triggering their own multi-hop conditional chains simultaneously).

### Estimator

- **Single-hop conditional cost estimation**: The token estimator (getConditionalBranchCosts) only accounts for one hop of conditional branching. The runtime now supports 10 hops. See TD-03 for details.

### LSP (remaining gaps)

- **Field name collision in references/rename**: Unchanged from v3.6 retro. If a context field and a produces output share a name, both rename and find-all-references will return false positives. Scope checker enforces uniqueness at the declaration level, so this requires deliberate name collision.

- **includeDeclaration only works for current file**: Unchanged from v3.6 retro. Declaration filtering in findReferences uses findDeclNamePosition which only checks the current file's ProgramIndex.

- **producesNodeMap for references but not rename**: Unchanged from v3.6 retro. Produces names are referable but not renameable. Intentional but potentially confusing.

- **Multi-line import braces**: Unchanged from v3.6 retro. The import pattern regex in onRenameRequest does not match multi-line import brace syntax.

---

## 5. Performance Observations

- **server.ts helper extraction has no performance impact**: ensureWorkspaceScan() and collectWorkspaceFileTexts() are thin wrappers around the same filesystem operations. The filter predicate adds one function call per file, which is negligible compared to readFileSync.

- **Multi-hop conditional routing is O(H * B)**: Where H is hop count (max 10) and B is branch count per hop. Each hop involves one executeWithFailureStrategy call (potentially multiple executeNode calls for retry strategies) plus one conditional edge lookup. The visited set operations are O(1). For typical conditional chains (2-4 hops), overhead is minimal.

- **Cycle detection via visited Set**: The Set-based cycle detection adds O(H) memory and O(1) per-hop lookup. The Set is created per initial node execution and garbage collected after the case block completes. No memory accumulation across flow nodes.

- **No new memory concerns**: flow-runner.ts does not cache anything between flow node executions. All state (visited set, hop counter) is local to the node case block.

- **Parse cache at 50 entries (LRU)**: Unchanged. Adequate for current workspace sizes.

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
| Memory persistence (load/save/field-level) | Complete | v2.0/v3.0 |
| Token tracking | Complete | v2.1 |

**Remaining runtime gaps**: edge transforms on conditional edges (warned, not applied), iteration context in errors (deferred), parallel + multi-hop conditional interaction (untested at scale), estimator multi-hop chain support (TD-03).

### LSP Feature Completeness (8 features + utils)

The LSP has 9 feature modules totaling 914 lines across features/:
- diagnostics.ts (37 lines)
- hover.ts (86 lines)
- completions.ts (264 lines)
- definition.ts (35 lines)
- symbols.ts (75 lines)
- code-actions.ts (73 lines)
- rename.ts (196 lines)
- references.ts (78 lines, reduced from 109 in v3.6 via loc.length fix)
- utils.ts (61 lines)

Plus server.ts at 383 lines (reduced from 394), for a total LSP surface of ~1,297 lines (down from ~1,339 in v3.6).

**Architecture is holding well.** The extraction of workspace helpers in R1 reversed the server.ts growth trend. The one-module-per-feature pattern continues to scale cleanly. The total LSP line count actually decreased for the first time since the LSP was introduced in v2.2.

### What v3.7 Did Well

1. **Successfully pivoted from LSP to runtime**: After 5 consecutive LSP-focused versions (v3.2-v3.6), v3.7 addressed two runtime gaps (foreach failure, multi-hop routing) that had been deferred since v3.3. The pivot was clean -- R1 handled residual LSP tech debt, then R2 and R3 focused entirely on runtime.

2. **Fallback alias pattern emerged organically and was reused**: The alias pattern (`result.node !== requestedName`) was designed in R2 for foreach and reused in R3 for conditional chains without modification. This is a sign of good abstraction -- the pattern is general enough to apply to any execution context where failure strategies produce results under different names.

3. **Reviewer caught a real gap in R3**: The NEEDS_CHANGES verdict on R3 identified a missing depth-limit error message and two missing tests. Without the review, chains exceeding MAX_CONDITIONAL_HOPS would have been silently truncated with no indication to the user. This is the second NEEDS_CHANGES in the v3.x series (after v3.6-R3) and validates that the review step continues to catch real issues.

4. **Resolved both MEDIUM tech debts from v3.6 retro**: TD-02 (KEYWORD_LENGTHS) and TD-04 (server.ts duplication) were both resolved in R1. Combined with R2 and R3 resolving the runtime gaps, v3.7 cleared all 4 items from the v3.6 retro's recommended scope.

### Architectural Concerns

1. **flow-runner.ts case 'node' density**: The 66-line case block is the most complex single block in the codebase. It handles 4 concerns: (a) failure strategy dispatch, (b) fallback output aliasing, (c) multi-hop conditional routing with cycle detection, and (d) depth limit enforcement. Extracting the conditional routing into a separate function (TD-02 above) would reduce the case block to ~20 lines.

2. **Estimator-runtime parity gap**: With v3.7 closing the runtime's conditional routing gap, the estimator is now the only pipeline stage that does not fully model multi-hop conditional chains. The estimator's one-hop model was adequate when the runtime only did one hop (v3.3-v3.6). Now it underestimates.

3. **No new ratchets formally recorded**: The common_memory.md file does not have a `### v3.7` ratchet section, even though v3.7 introduced several ratchet-worthy decisions (MAX_CONDITIONAL_HOPS, fallback alias pattern, workspace helpers). This should be addressed in the memory update step.

---

## 7. v3.8 Scope Recommendations

### Assessment of remaining work

The runtime is now feature-complete for all declared flow control constructs. The LSP has 8 features and is mature. The primary remaining gaps are: (1) estimator-runtime parity for conditional chains, (2) flow-runner.ts complexity, (3) edge transforms on conditional edges, and (4) language-level features like memory importability.

### Recommended scope: Estimator parity + flow-runner extraction + quality

**Rationale**: v3.7 closed the runtime gaps. The next natural step is closing the estimator gap (TD-03) that was exposed by v3.7's multi-hop implementation, and extracting the flow-runner complexity (TD-02) before it grows further. A quality round can address minor polish items.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | flow-runner.ts extraction: `executeConditionalChain()` function (TD-02) + fallback alias helper (TD-04) | DIRECT | 2 |
| R2 | Multi-hop conditional chain estimation in TokenEstimator (TD-03) | MEDIUM | 4 |
| R3 | Foreach iteration context in error messages (deferred from v3.7-R2) | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~10** |

**Alternative scope: Language features**

If estimator parity is deferred, v3.8 could address language-level gaps:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Memory importability (unlock v2.0-R13) | MEDIUM | 4 |
| R2 | Edge transforms on conditional edges (resolve SCOPE_TRANSFORM_CONDITIONAL) | MEDIUM | 4 |
| R3 | Token budget hard enforcement (unlock v2.1-R15) | MEDIUM | 4 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~14** |

**Ratchet unlocks anticipated**:
- Recommended scope: 0 unlocks. No existing ratchets block estimator parity or flow-runner extraction.
- Alternative scope: 2 unlocks (v2.0-R13 for memory importability, v2.1-R15 for budget hard enforcement).

**Items explicitly deferred to v3.9+**:
- AST-based reference tracking -- text-based approach confirmed sufficient through v3.6
- Memory importability -- no user demand (unless alternative scope chosen)
- Async file I/O -- LLM latency dominates
- Source maps / workspace support -- major features needing dedicated versions
- Second codegen backend -- no user demand
- Lexer error recovery (TD-05) -- marginal benefit for Graft file sizes
- Parallel + multi-hop conditional interaction testing at scale

**Test target**: 832 existing + ~30 new = ~862 tests at v3.8 completion.

**v3.6 retro deferred items status check**:
- Memory importability (v2.0-R13): Still deferred. No user demand. Could be v3.8 alternative scope.
- Async file I/O: Still deferred. LLM latency dominates.
- Additional code actions (add missing field, fix budget): Still deferred. LSP is mature.
- Source maps: Still deferred. Major feature.
- Inverted workspace export index: Still deferred. Only matters at scale.
- AST-based reference tracking: Confirmed NOT needed. Text-based approach is sufficient.
- isReferable/isRenameable unification (TD-03 from v3.6): Still deferred. Functions are small and distinct.
