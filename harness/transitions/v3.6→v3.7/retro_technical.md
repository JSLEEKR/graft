# Technical Retrospective: Graft v3.6

## Version Summary

v3.6 delivered 4 rounds: find-all-references (R1, MEDIUM), GRAFT_KEYWORDS derivation + parse-based conflict detection (R2, DIRECT), symbol range fix + rename field collision guard (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 739 to 790 (51 new tests). 8 new ratchet items added, 0 unlocked. Ratchet count stands at ~220 total (215 locked, 5 unlocked across all versions). The version was executed in ~11 agent calls (including one NEEDS_CHANGES in R3).

v3.6's primary contributions are: (1) find-all-references via isReferable + findReferences reusing collectRenameLocations with cross-file support and includeDeclaration filtering, (2) GRAFT_KEYWORDS derived from lexer KEYWORDS (eliminating the dual-keyword-maintenance debt), (3) cross-file conflict detection moved from regex to Parser+ProgramIndex, (4) makeSymbol range fixed to span keyword-through-name with selectionRange as name-only, and (5) rename field collision guard checking context/memory/produces fields. All four items from the v3.5 retro's recommended scope (Section 7) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: collectRenameLocations import-path exclusion is fragile [MEDIUM]
- **Severity**: MEDIUM
- **Status**: Carried forward from v3.5 retro (TD-03), promoted from LOW
- **Description**: The import-path filtering in collectRenameLocations (rename.ts:133-138) uses a simple regex `from\s+"([^"]*)"` to detect import paths. Now that both rename and find-all-references share collectRenameLocations, a false match in this filtering affects two features instead of one. The edge case of multiple `from` on one line remains.
- **Impact**: Elevated from LOW because the blast radius has doubled: a false match now corrupts both rename edits and reference locations. In practice, Graft's strict import syntax makes this unlikely.
- **Fix**: Parse import statements from the AST (available in ProgramIndex) and check match offsets against import path ranges. ~15 lines.
- **Recommendation**: MEDIUM priority. Address when next modifying collectRenameLocations.

### TD-02: findDeclNamePosition duplicates keyword-length logic [MEDIUM]
- **Severity**: MEDIUM
- **Status**: New in v3.6
- **Description**: references.ts (lines 16-21) has a `KEYWORD_LENGTHS` constant mapping keyword names to their character lengths (`context: 7, node: 4, memory: 6, graph: 5`), and a hardcoded `8` for "produces" (line 69). This duplicates information already available in SourceLocation.length (added in v3.0-R6, ratchet v3.0-R24). The makeSymbol function in symbols.ts already uses `loc.length` for the same purpose (line 64). The references module computes the same offset independently.
- **Impact**: If a keyword changes length (unlikely) or if SourceLocation.length is extended, references.ts would need a separate update. More importantly, this is duplicated logic that diverges from the established pattern.
- **Fix**: Use `loc.length` from SourceLocation instead of KEYWORD_LENGTHS lookup. The ProgramIndex already stores the declaration with its SourceLocation. ~10 lines to simplify findDeclNamePosition.
- **Recommendation**: MEDIUM priority. Clean alignment with the SourceLocation.length pattern.

### TD-03: isReferable and isRenameable are nearly identical [LOW]
- **Severity**: LOW
- **Status**: New in v3.6
- **Description**: `isReferable` (references.ts:5-13) checks 5 maps (contextMap, nodeMap, memoryMap, graphMap, producesNodeMap). `isRenameable` (rename.ts:105-112) checks 4 maps (contextMap, nodeMap, memoryMap, graphMap -- excludes producesNodeMap). The difference is intentional: produces names are referable but not renameable (renaming a produces name would require renaming the parent node's produces clause). However, the two functions have no shared derivation and their divergence is only documented by the ratchets, not by code.
- **Impact**: Minor. The semantic difference is correct. A developer adding a new map to ProgramIndex might update one but not the other.
- **Fix**: Add a comment in each function explaining why they differ, or create a shared `isDeclared(word, index, maps)` helper parameterized by which maps to check.
- **Recommendation**: LOW priority. The functions are small and self-explanatory. A comment would suffice.

### TD-04: server.ts workspace orchestration is duplicated across 3 handlers [MEDIUM]
- **Severity**: MEDIUM
- **Status**: Elevated from v3.5 retro TD-04 (was LOW, server.ts was 345 lines)
- **Description**: server.ts is now 394 lines. Three handlers -- onRenameRequest (lines 292-343), onReferences (lines 345-391), and onCodeAction (lines 241-262) -- each independently perform lazy workspace scanning, file reading, and text collection. The patterns are nearly identical: check workspaceScanDone, call scanWorkspaceExports, iterate workspaceExports, read files from disk or open documents, filter by relevance (import pattern for rename, includes() for references, export names for code actions), and pass the collected files to a pure function.
- **Impact**: Each new LSP feature that needs cross-file awareness will copy ~20 lines of workspace orchestration. server.ts grew 49 lines from v3.5 (345 to 394) largely from the references handler duplicating the rename handler's workspace pattern.
- **Fix**: Extract a shared `collectWorkspaceFiles(filter: (text: string) => boolean)` function that encapsulates the workspace scan + file read + filter pattern. All three handlers could call it with different filter predicates. ~30 lines extracted, ~15 lines per handler simplified.
- **Recommendation**: MEDIUM priority. Address before adding another cross-file feature.

### TD-05: Lexer still throws on first error (no recovery) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-05), v3.4 retro (TD-06), v3.3 retro (TD-01), v3.2 retro (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting only works at the parser level and above.
- **Recommendation**: LOW priority. Carry forward. Marginal benefit for Graft file sizes.

### TD-06: Completion context detection remains position-fragile [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-06), v3.4 retro (TD-07)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Carry forward. No reports of issues.

### TD-07: isInComment() scans from document start on every request [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-07), v3.4 retro (TD-08)
- **Description**: O(n) per completion/rename/reference request. Now used by completions.ts, collectRenameLocations (rename), and findReferences (via collectRenameLocations). The usage is still batch (per-match, not per-keystroke), so performance impact is bounded.
- **Recommendation**: LOW priority. Carry forward.

### TD-08: Empty `catch {}` blocks throughout codebase (~20 instances) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-08). Count likely +1 (rename.ts parse failures).
- **Description**: Bare catch blocks used for graceful degradation on parse/filesystem operations. Each is individually justified. The rename cross-file conflict detection (rename.ts:83) now uses `catch { /* Parse failure -- skip conflict check */ }` which is intentional.
- **Recommendation**: Not a priority. Consistent and intentional pattern.

### TD-09: Workspace export cache has no deletion invalidation [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-09), v3.4 retro (TD-10)
- **Description**: Deleted .gft files remain in workspaceExports cache until server restart. Now consumed by code actions, rename, AND references (3 consumers). All three handle missing files gracefully.
- **Recommendation**: LOW priority. Carry forward.

### TD-10: FlowNode.location is optional, requires ?? fallback everywhere [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.5 retro (TD-10)
- **Description**: Unchanged. Parser always assigns location but the type is optional.
- **Recommendation**: LOW priority. Carry forward.

### Items Resolved from v3.5 Retro
- **TD-01 (GRAFT_KEYWORDS separate from lexer KEYWORDS)**: RESOLVED in v3.6-R2. GRAFT_KEYWORDS is now derived from `Object.keys(KEYWORDS).filter(...)`, eliminating manual synchronization. Ratchet v3.6-R05.
- **TD-02 (Cross-file conflict detection uses regex)**: RESOLVED in v3.6-R2. Conflict detection now uses Parser+ProgramIndex parse-based check. Ratchet v3.6-R06.
- **TD-04 (server.ts rename handler inline orchestration)**: PARTIALLY RESOLVED. The rename handler is still ~50 lines but the pure logic is well-extracted. However, server.ts grew to 394 lines due to the references handler following the same pattern. Promoted to TD-04 above with new framing (shared orchestration pattern).
- **Symbol range (Section 4 gap)**: RESOLVED in v3.6-R3. makeSymbol now uses `loc.length` for range spanning keyword-to-name-end. Ratchet v3.6-R07.

---

## 2. Emerging Patterns

### Patterns Formalized in v3.6

- **Shared text-based reference finding**: collectRenameLocations is now the canonical function for finding identifier occurrences in text. Both rename (buildRenameEdits) and references (findReferences) call it. The function handles CRLF normalization, comment filtering, string filtering, and import-path filtering. This is a stable, shared primitive.

- **ProgramIndex as universal lookup**: The isReferable function checks all 5 ProgramIndex maps (contextMap, nodeMap, memoryMap, graphMap, producesNodeMap). ProgramIndex is used by every LSP feature: hover, definition, completions, symbols, rename, references, and code actions. It is the sole in-memory representation for LSP-side analysis.

- **Derivation over duplication**: GRAFT_KEYWORDS derivation from lexer KEYWORDS (v3.6-R2) establishes the pattern of deriving LSP-side constants from compiler-side canonical sources. This eliminates a class of synchronization bugs.

- **Parse-based validation for cross-file operations**: The rename cross-file conflict check (v3.6-R2) now parses workspace files with Lexer+Parser+ProgramIndex instead of using regex. This is the correct architectural pattern for any operation that needs to understand Graft semantics across files.

### Patterns to Monitor

- **server.ts handler duplication**: Three handlers (code actions, rename, references) follow the same workspace orchestration pattern. The next cross-file feature will likely copy it again. This should be extracted before it happens.

- **Text-based vs AST-based reference finding ceiling**: findReferences inherits all the limitations of collectRenameLocations (field name collision, produces name confusion). The v3.5 retro predicted this: "If find-all-references is added, the same filtering would need to be duplicated or shared." The sharing was achieved (collectRenameLocations reuse), but the edge cases persist. The text-based approach works for Graft's current semantics where identifier names are globally unique per file, but would break if scoped identifiers were added.

- **KEYWORD_LENGTHS duplication**: references.ts introduced its own keyword length mapping, parallel to SourceLocation.length. This is a minor regression of the "derivation over duplication" pattern established in the same version.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Carried forward unchanged from v3.5 retro. Still the primary blocker for memory importability. Not in near-term roadmap. No user demand.

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: Now shared by both rename and references. The text-based approach is holding but the field name collision edge case (context field "summary" collides with node "summary") remains unfixable without AST-based tracking. No unlock needed yet -- the edge case requires deliberate name collision that Graft's scope checker would flag.

- **[v3.5-R07] GRAFT_KEYWORDS Set (26 keywords) exported from features/rename.ts**: This ratchet should be UPDATED (not unlocked) -- the Set is still exported from rename.ts, but its derivation changed from hand-maintained to computed. The ratchet text should reflect the derivation.

### New Ratchets Assessment

All 8 new v3.6 ratchets (R01-R08) are sound:
- R01-R04 (references): Clean separation of concerns -- isReferable for eligibility, findReferences for collection, collectRenameLocations reuse, includeDeclaration via keyword-length computation.
- R05-R06 (keyword/conflict): Correct architectural decisions -- derive, don't duplicate; parse, don't regex.
- R07-R08 (symbols/rename): Correct LSP spec compliance -- range spans declaration, selectionRange spans name. Field collision guard prevents semantic errors.

### Ratchets Confirmed Still Valid

All ~220 ratchets reviewed. No ratchets are actively blocking v3.7 feature work. The only long-term concern remains v2.0-R13 (memory importability).

---

## 4. Edge Cases & Gaps

### References

- **Field name collision in references**: Same limitation as rename. If a context field and a produces output share a name, findReferences will return both the field reference and the produces reference. Example: `reads: [Report.summary]` where `summary` is also a produces name -- findReferences would return the `summary` in the reads clause as a reference to the produces `summary`, even though it's a field reference. The includes() pre-filter (v3.6-R03) would catch it because the text contains the word.

- **includeDeclaration only works for current file**: The findDeclNamePosition function (references.ts:28-74) only looks up declarations in the current file's ProgramIndex. If the declaration is in another file (imported), includeDeclaration=false has no effect on the imported file -- the declaration in the source file will appear as a regular reference. This is because findReferences treats cross-file references uniformly via collectRenameLocations.

- **producesNodeMap for references but not rename**: isReferable includes producesNodeMap (5 maps), isRenameable excludes it (4 maps). This means a produces name like `Analysis` in `produces Analysis { ... }` is referable (find-all-references works) but not renameable. This is intentional but may confuse users who expect "find references -> rename" to be a natural workflow.

### Rename (remaining gaps)

- **Field name collision**: Unchanged from v3.5 retro. If a context field and a node share the same name, renaming the node will also match the field in reads clauses. The v3.6-R3 field collision guard prevents renaming TO a field name but does not prevent incorrect matching of existing field references.

- **Multi-line import braces**: Unchanged from v3.5 retro. The import pattern regex in onRenameRequest (server.ts:311) does not match multi-line import brace syntax.

### Estimator

- **Conditional branch chaining**: Unchanged from v3.5/v3.4 retro. One-hop cost estimation only.

### Runtime

- **Conditional edge routing still does not chain**: Unchanged from v3.5/v3.4/v3.3 retro.
- **Foreach source failure handling**: Unchanged. Behavior undefined when source node fails.

---

## 5. Performance Observations

- **Cross-file reference scanning**: findReferences iterates ALL workspace files and calls includes(word) as a pre-filter before invoking collectRenameLocations (server.ts:373-377). This is a text-scan pre-filter, not a parse. For typical workspaces (< 50 .gft files), this is negligible. For large workspaces, the includes() call on each file's text is O(F * N) where F is file count and N is average file size. The collectRenameLocations call on matching files adds O(M * L) per file (M matches, L lines for isInComment). Acceptable for foreseeable workspace sizes.

- **Parse-based conflict detection in rename**: buildRenameEdits (rename.ts:72-84) now parses each workspace file with Lexer+Parser+ProgramIndex for conflict checking. This is more expensive than the previous regex approach but runs at most once per rename operation (not per keystroke). For a workspace with 50 files, 50 parse operations at ~1ms each = ~50ms total. Acceptable for a user-initiated rename.

- **findDeclNamePosition runs once per findReferences call**: The declaration position lookup (for includeDeclaration filtering) is a single map lookup per findReferences invocation. Negligible.

- **No new memory concerns**: The workspace file map in onReferences (server.ts:362-378) stores file text strings. For large workspaces, this could consume significant memory if many files contain the searched word. However, the includes() pre-filter limits the set, and the map is created per-request (not cached).

- **Parse cache at 50 entries (LRU)**: Unchanged. Adequate for current workspace sizes.

---

## 6. Architecture Assessment

### LSP Feature Completeness (9 modules)

The LSP now has 9 feature modules (8 features + utils) totaling 945 lines across features/:
- diagnostics.ts (37 lines)
- hover.ts (86 lines)
- completions.ts (264 lines)
- definition.ts (35 lines)
- symbols.ts (75 lines)
- code-actions.ts (73 lines)
- rename.ts (196 lines)
- references.ts (109 lines)
- utils.ts (61 lines)

Plus server.ts at 394 lines, for a total LSP surface of ~1,339 lines.

**Architecture is holding well.** The one-module-per-feature pattern scales cleanly. Each feature module is a pure function (or set of pure functions) with ProgramIndex as the primary data structure. The barrel export (index.ts, 9 lines) provides a clean import surface for server.ts.

### What v3.6 Did Well

1. **Delivered all v3.5 retro recommendations**: All 4 proposed rounds matched the retro's Section 7 scope exactly. The retrospective process continues to be a reliable scoping mechanism.

2. **Correct reuse decision**: Reusing collectRenameLocations for find-all-references (v3.6-R01) avoided duplicating the text-scanning, comment/string filtering, and CRLF normalization logic. This validates the v3.5 investment in hardening collectRenameLocations.

3. **Resolved two MEDIUM tech debts**: GRAFT_KEYWORDS derivation (TD-01) and parse-based conflict detection (TD-02) from v3.5 retro were both addressed in a single round (R2). This demonstrates that tech debt rounds can efficiently bundle related items.

4. **Reviewer caught a real bug**: R3 received NEEDS_CHANGES because the selectionRange in makeSymbol started at the keyword position instead of the name position. The reviewer caught this before it shipped. This is the first NEEDS_CHANGES since v3.2-R1 and validates that the review step still catches real issues.

### Architectural Concerns

1. **server.ts growth trajectory**: 294 (v3.3) -> 363 (v3.4) -> 345 (v3.5, reduced by extraction) -> 394 (v3.6). The extraction in v3.5 temporarily reversed the trend, but v3.6 brought it back above the previous peak. The 394-line count is approaching the 400-line threshold noted in v3.5 retro TD-04. The primary growth driver is handler orchestration duplication.

2. **Text-based reference finding confirmed sufficient**: v3.6 was the test case the v3.5 retro predicted -- find-all-references reusing the text-based approach. The approach works. The edge cases (field name collision, produces name confusion) remain theoretical for typical Graft programs because scope checker enforces uniqueness at the declaration level. AST-based reference tracking is NOT recommended for v3.7 unless a user reports a false positive.

3. **ProgramIndex stability**: ProgramIndex has 8 maps (contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap, graphMap, producesFieldsMap, memoryFieldsMap). It was last modified in v3.0-R4 (added producesFieldsMap and memoryFieldsMap). No changes in 6 versions. This is a mature, stable data structure.

4. **Feature interdependencies are well-managed**: references.ts imports from rename.ts (collectRenameLocations). This is the only cross-feature import. All other features are independent. The dependency is unidirectional and stable.

---

## 7. v3.7 Scope Recommendations

### Assessment of remaining work

The LSP is now feature-rich with 8 capabilities: diagnostics, hover, go-to-definition, completions, code actions (auto-import), document symbols (hierarchical), rename (cross-file, hardened, field-collision-guarded), and find-all-references (cross-file with includeDeclaration). The remaining LSP gaps are minor edge cases and polish. The project should now pivot away from LSP toward either runtime hardening or language features.

### Recommended scope: Runtime hardening + server.ts cleanup

**Rationale**: The LSP has received 5 consecutive versions of investment (v3.2 through v3.6). Continuing LSP work yields diminishing returns. The runtime has three open gaps (foreach failure, multi-hop conditional routing, budget enforcement) that have been deferred since v3.2/v3.3. These affect actual program execution, not just editor experience. A small server.ts cleanup round addresses the most pressing architectural concern.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | server.ts workspace orchestration extraction (TD-04) + findDeclNamePosition SourceLocation.length alignment (TD-02) | DIRECT | 2 |
| R2 | Foreach source failure handling (define behavior when source node fails) | MEDIUM | 4 |
| R3 | Multi-hop conditional edge routing | MEDIUM | 4 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~12** |

**Alternative scope: Language features**

If runtime hardening is deferred, v3.7 could address language-level gaps:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Additional code actions (add missing field, fix budget) | MEDIUM | 4 |
| R2 | Token budget hard enforcement (configurable abort threshold) | MEDIUM | 4 |
| R3 | Memory importability (unlock v2.0-R13) | MEDIUM | 4 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~14** |

**Ratchet unlocks anticipated**: 
- Recommended scope: 0 unlocks. No existing ratchets block runtime hardening.
- Alternative scope: 1 unlock (v2.0-R13 for memory importability). 1 unlock (v2.1-R15 for budget hard enforcement).

**Items explicitly deferred to v3.8+**:
- AST-based reference tracking -- text-based approach confirmed sufficient for v3.6
- Async file I/O -- LLM latency dominates
- Source maps / workspace support -- major features needing dedicated versions
- Second codegen backend -- no user demand
- Lexer error recovery (TD-05) -- marginal benefit for Graft file sizes
- Inverted workspace export index -- only matters at scale

**Test target**: 790 existing + ~35 new = ~825 tests at v3.7 completion.

**v3.5 retro deferred items status check**:
- Memory importability (R-01): Still deferred. No user demand. Could be v3.7 alternative scope.
- Async file I/O (R-02): Still deferred. LLM latency dominates.
- Additional code actions (add missing field, fix budget): Carried forward. Part of alternative scope.
- Source maps: Still deferred. Major feature.
- Inverted workspace export index: Still deferred. Only matters at scale.
- AST-based reference tracking: Confirmed NOT needed after v3.6. Text-based approach is sufficient.
