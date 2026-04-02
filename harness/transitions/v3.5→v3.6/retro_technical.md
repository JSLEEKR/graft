# Technical Retrospective: Graft v3.5

## Version Summary

v3.5 delivered 4 rounds: rename hardening (R1, DIRECT), cross-file conflict detection + handler extraction (R2, DIRECT), FlowNode location + symbol enhancement (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 690 to 739 (49 new tests). 10 new ratchet items added, 0 unlocked. Ratchet count stands at ~210 total (205 locked, 5 unlocked across all versions). The version was executed in ~8 agent calls.

v3.5's primary contributions are: (1) rename correctness hardening (CRLF normalization, comment/string/import-path filtering, newName validation via identifier regex + GRAFT_KEYWORDS blacklist), (2) cross-file conflict detection in buildRenameEdits with GRAFT_KEYWORDS Set (26 keywords), (3) buildRenameEdits extraction as a pure function from server.ts, (4) FlowNode SourceLocation on all three kinds (node, parallel, foreach), and (5) parallel/foreach as document symbol children with descriptive labels. All four items from the v3.4 retro's recommended scope (Section 6) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: GRAFT_KEYWORDS is a separate set from lexer KEYWORDS [MEDIUM]
- **Severity**: MEDIUM
- **Status**: New in v3.5
- **Description**: `GRAFT_KEYWORDS` in features/rename.ts (line 7-13) is a hand-maintained Set of 26 keyword strings. The lexer already has `KEYWORDS` in lexer/tokens.ts (lines 97-147) as a `Record<string, TokenType>` containing 38 keywords (including type keywords like `String`, `Int`, `Float`, `Bool`, `List`, `Map`, `Optional`, `TokenBounded`, `FilePath`, `FileDiff`, `TestFile`, `IssueRef`). These two keyword lists have no shared derivation. GRAFT_KEYWORDS omits type keywords and some runtime keywords (`select`, `filter`, `drop`, `compact`, `truncate`, `input`, `output`, `enum`, `true`, `false`, `max_iterations`). While the omission is intentional (type keywords and transform keywords are valid contextual identifiers in some positions), the two lists will drift as keywords are added to the lexer.
- **Impact**: A new keyword added to the lexer but not to GRAFT_KEYWORDS would allow renaming an identifier to that keyword, producing a broken file. This is a latent correctness risk. The rename validation would silently accept the new keyword as a valid name.
- **Fix**: Derive GRAFT_KEYWORDS from the lexer's KEYWORDS object: `Object.keys(KEYWORDS)` minus the type keywords that are valid as identifiers. Or, add a shared `isGraftKeyword()` function that consults the lexer. ~5 lines.
- **Recommendation**: MEDIUM priority. Address when next modifying the keyword system.

### TD-02: Cross-file conflict detection uses regex, not parse [MEDIUM]
- **Severity**: MEDIUM
- **Status**: New in v3.5
- **Description**: `buildRenameEdits` (rename.ts:61-65) checks for conflicts in importing files using a regex pattern: `\b(context|node|memory|graph)\s+${newName}\b`. This is a text-based heuristic, not a parse-based check. It can miss declarations inside comments (`// context Foo(...)` would false-positive) and cannot detect conflicts from re-exported names or names introduced by imports in the target file.
- **Impact**: False positives (blocking valid renames) are possible when a declaration keyword appears in a comment. False negatives are unlikely given the current language structure. The risk is minor but the pattern is inconsistent with the pure-function philosophy of buildRenameEdits -- if it already parses the current file, parsing the workspace files for conflict checks would be more robust.
- **Fix**: Parse each workspace file with Lexer+Parser+ProgramIndex and check `index.contextMap.has(newName) || index.nodeMap.has(newName) || ...`. The parse infrastructure is already imported. ~10 lines to replace the regex check.
- **Recommendation**: MEDIUM priority. Can be bundled with any future rename improvement.

### TD-03: collectRenameLocations import-path exclusion is fragile [MEDIUM]
- **Severity**: MEDIUM
- **Status**: New in v3.5
- **Description**: The import-path filtering in collectRenameLocations (rename.ts:133-138) uses a simple regex `from\s+"([^"]*)"` to detect import paths, then checks if the match falls between the first pair of quotes after `from`. This has edge cases: (a) if a line has multiple `from "..."` patterns (unlikely but syntactically possible in comments), only the first is detected, (b) the check uses `lineText.indexOf('"', lineText.indexOf('from'))` which finds the first `from` on the line, not necessarily the one relevant to the match, (c) it does not handle single-quoted strings (Graft uses double quotes only, so this is fine currently).
- **Impact**: Minor. The edge cases require contrived inputs (multiple `from` on one line). In practice, import lines follow a strict format.
- **Fix**: No immediate fix needed. If import path handling grows more complex, switch to AST-based location checking. The current heuristic is adequate for the well-formed import syntax Graft enforces.
- **Recommendation**: LOW priority. Carry forward. Monitor if import syntax evolves.

### TD-04: server.ts rename handler still has inline orchestration [LOW]
- **Severity**: LOW
- **Status**: Reduced from v3.4 retro TD-05 (was MEDIUM, 363 lines)
- **Description**: server.ts is now 345 lines (down from 363 in v3.4 retro). The buildRenameEdits extraction (v3.5-R2) moved the core rename logic to features/rename.ts, but the onRenameRequest handler (server.ts:291-342) still contains ~50 lines of orchestration: workspace scanning, file reading, import pattern matching for cross-file candidates, and result mapping. This is server-side I/O orchestration (reading files, accessing workspace cache) which cannot be a pure function.
- **Impact**: The remaining inline code is inherently server-side (I/O, document access, cache interaction). It follows the same pattern as onCodeAction. server.ts is not growing further from this -- the pure logic was extracted.
- **Recommendation**: LOW priority. The remaining code is appropriately server-side. No further extraction needed unless server.ts grows past 400 lines from other features.

### TD-05: Lexer still throws on first error (no recovery) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.4 retro (TD-06), v3.3 retro (TD-01), v3.2 retro (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting only works at the parser level and above.
- **Recommendation**: LOW priority. Carry forward. Marginal benefit for Graft file sizes.

### TD-06: Completion context detection remains position-fragile [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.4 retro (TD-07), v3.3 retro (TD-05)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Carry forward. No reports of issues.

### TD-07: isInComment() scans from document start on every request [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.4 retro (TD-08), v3.3 retro (TD-06)
- **Description**: O(n) per completion/rename request. Now used by both completions.ts and collectRenameLocations. Graft files tend to be short. The rename case calls it once per match (not per keystroke), so the performance impact is bounded by number of matches rather than by typing rate.
- **Recommendation**: LOW priority. Carry forward. The rename usage pattern (batch, not interactive) reduces urgency.

### TD-08: Empty `catch {}` blocks throughout codebase (19 instances) [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.4 retro (TD-09), count increased by 1
- **Description**: v3.5 added 1 new bare catch block in rename.ts (line 33, parse failure returns null). Total: 19 bare catch blocks. Each is individually justified (graceful degradation on parse/filesystem operations).
- **Recommendation**: Not a priority. The pattern is consistent and intentional across all LSP feature modules.

### TD-09: Workspace export cache has no deletion invalidation [LOW]
- **Severity**: LOW
- **Status**: Carried forward from v3.4 retro (TD-10), v3.3 retro (TD-04)
- **Description**: Deleted .gft files remain in workspaceExports cache until server restart. Self-correcting (import produces RESOLVE_FILE_NOT_FOUND). Now consumed by both code actions (auto-import) and rename (cross-file scanning). Neither consumer is harmed by stale entries -- auto-import will offer a non-existent file (user sees the import error immediately), and rename will try to read a missing file (caught by bare catch, skipped gracefully).
- **Recommendation**: LOW priority. Carry forward.

### TD-10: FlowNode.location is optional, requires ?? fallback everywhere [LOW]
- **Severity**: LOW
- **Status**: New in v3.5
- **Description**: FlowNode's location field is typed as `location?: SourceLocation` (ast.ts:79-82). The parser now always assigns it (v3.5-R3), but the optional type means every consumer needs `node.location ?? parentLoc` fallback (symbols.ts:47, 49, 53). The tests confirm location is always present for parsed FlowNodes, but the type doesn't enforce it.
- **Impact**: Minor type safety gap. If a FlowNode is constructed programmatically without location, the symbol provider falls back to the parent location silently.
- **Fix**: Change to `location: SourceLocation` (required) on FlowNode. This would require updating any code that constructs FlowNodes without location. Since the parser always provides it, this should be safe.
- **Recommendation**: LOW priority. Breaking change to the AST type for marginal safety gain. Only worth doing if FlowNode is refactored for other reasons.

---

## 2. Emerging Patterns

### Patterns Formalized in v3.5

- **Pure function extraction for LSP features**: buildRenameEdits joins buildAutoImportActions as the second major pure function extracted from server.ts handlers. The pattern is established: server handler reads documents and cache, passes data to a pure function in features/, returns the result. All new LSP features should follow this pattern from the start.

- **Shared utility extraction**: isInComment/isInString moved from completions.ts to utils.ts (v3.5-R1), making them available to rename.ts as well. utils.ts now holds 3 shared functions (isInComment, isInString, getWordAtPosition). This is the established pattern for cross-feature utilities.

- **GRAFT_KEYWORDS as a shared constant**: The keyword set is exported from features/rename.ts and re-exported via index.ts. While currently only used by rename, it could serve other features that need to validate identifiers (e.g., a future "extract to context" refactoring).

### Patterns to Formalize

- **AST-aware text processing**: Both rename and completions now use the same comment/string detection utilities (isInComment, isInString) to filter text-based results. This pattern (regex match -> context filter) is becoming the standard approach for text-based LSP features. However, this is an accumulation of heuristics rather than an architectural decision. If a third feature needs the same filtering, consider whether an AST-based reference tracking system would be more maintainable.

- **Keyword synchronization**: GRAFT_KEYWORDS (26 entries) and lexer KEYWORDS (38 entries) are separate lists. A pattern should be established for deriving the rename keyword blacklist from the lexer's canonical set, minus type names and other contextual keywords that are valid as identifiers.

### Patterns to Monitor

- **server.ts stabilization**: server.ts is 345 lines after v3.5. It grew from 294 (v3.3) to 363 (v3.4) to 345 (v3.5, reduced by extraction). The growth trend has reversed -- pure function extraction is working. If a new feature adds another handler, the pattern is clear: extract logic to features/, keep the handler thin.

- **FlowContext interface**: Still at 4 members. No change. The concern from v3.3 retro remains valid but has not worsened.

- **Text-based vs AST-based reference finding**: v3.5 hardened the text-based approach with filtering (comments, strings, import paths). The filtering works well for the rename use case but adds code complexity. If find-all-references is added, the same filtering would need to be duplicated or shared. The decision point for AST-based tracking is when a third feature needs reference finding.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Carried forward unchanged from v3.4 retro. Still the primary blocker for memory importability. Not in near-term roadmap. No user demand.

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: This ratchet was NOT unlocked in v3.5 -- the word-boundary regex stays, with additive filtering on top (comments, strings, import paths). The filtering approach is pragmatic and effective. Only revisit if a correctness gap is found that filtering cannot address (e.g., field name collision where `reads: [Ctx.summary]` renames `summary` as both a node and a field name). AST-based tracking is the alternative but significantly more complex.

- **[v3.5-R07] GRAFT_KEYWORDS Set (26 keywords) exported from features/rename.ts**: This ratchet locks the keyword set in rename.ts. If keyword synchronization with the lexer (TD-01) is pursued, this would need to move to a shared location or be derived from the lexer. No unlock needed yet -- the fix can be done by changing the derivation without changing the export location.

### Ratchets Confirmed Still Valid

All ~210 ratchets reviewed. The 10 new v3.5 ratchets (R01-R10) are sound. No ratchets are actively blocking v3.6 feature work. The only long-term concern is v2.0-R13 (memory importability), which remains a conscious deferral.

---

## 4. Edge Cases & Gaps

### Rename (remaining gaps after v3.5 hardening)

- **Field name collision**: If a context field and a node share the same name (e.g., context `Report` has field `summary`, and there's a node named `summary`), renaming the node `summary` will also match `summary` in reads like `Report.summary`. The word-boundary regex cannot distinguish structural position. The `isInString` check doesn't apply because `Report.summary` is not in a string. This is the primary remaining correctness gap in the rename feature.

- **Produces name confusion**: If a produces output shares a name with a context or node (e.g., `produces Result { ... }` and `context Result { ... }`), the rename treats them as the same identifier. ProgramIndex allows this overlap (producesNodeMap uses produces name as key, contextMap uses context name), but the rename's text-based matching cannot distinguish them.

- **Rename does not update graph flow references**: If a node `A` is renamed to `B`, the rename correctly updates `reads: [A]` and import `{ A }`. However, graph flow entries (`A -> B -> done`) are also text-matched and renamed. This is actually correct behavior -- the node name in the flow IS the same identifier. But it means rename has no concept of "this is a flow reference" vs "this is a declaration" -- it renames everything uniformly, which happens to be correct for Graft's semantics.

- **Rename of imported names across files**: When renaming a declaration in the source file, the cross-file rename (server.ts:308-329) correctly finds importing files via `importPattern` regex and passes them to buildRenameEdits. However, the import pattern regex `import\s*\{[^}]*\bNAME\b[^}]*\}` will not match if the import list is spread across multiple lines. Multi-line import braces are syntactically valid but not tested.

### Estimator

- **Conditional branch chaining**: Unchanged from v3.4 retro. One-hop cost estimation only. Nested conditional edges in branch targets are not included in cost calculation.

### Runtime

- **Conditional edge routing still does not chain**: Unchanged from v3.4/v3.3 retro. One-hop limitation.
- **Foreach source failure handling**: Unchanged from v3.4/v3.3/v3.2 retro. If the source node for a foreach fails, the foreach behavior is undefined.

### Document Symbols

- **Symbol range is name-only**: makeSymbol (symbols.ts:60-68) creates a range spanning only the name (`character` to `character + name.length`). The LSP protocol distinguishes `range` (full declaration span) from `selectionRange` (name span). Both are set to the name span. This means the outline view highlight covers only the name, not the full declaration block. This is technically incorrect per the LSP spec but functionally acceptable -- most editors use selectionRange for navigation.

---

## 5. Performance Observations

- **isInComment O(n) usage in rename**: collectRenameLocations calls isInComment for every regex match (rename.ts:126-127). For a file with M matches and N lines, this is O(M*N) in the worst case. For typical Graft files (< 200 lines, < 20 matches), this is negligible. For large generated files (if they exist), this could be slow.

- **collectRenameLocations scans all workspace files**: The rename handler iterates all files in workspaceExports (server.ts:313-329) and calls collectRenameLocations on each importing file. For large workspaces with many .gft files, this is O(F * M * N) where F is importing file count, M is matches per file, and N is lines per file. Again, negligible for realistic Graft workspaces.

- **Workspace scan is still lazy-on-first-use**: Both code actions and rename trigger workspace scanning. After the first scan, the cache is used. No performance regression from v3.4.

- **Parse cache at 50 entries (LRU)**: Unchanged. Adequate for current workspace sizes.

---

## 6. Architecture Assessment

### What v3.5 Did Well

1. **Delivered all v3.4 retro recommendations**: Every item in the v3.4 retro's Section 6 scope was implemented. This validates the retrospective process as a reliable scoping mechanism.

2. **Pure function extraction is paying off**: buildRenameEdits is fully unit-testable without LSP wiring. The v3.5-R4 integration tests (tests/v35-r4.test.ts) test the rename pipeline end-to-end by calling the pure function directly, without needing to mock LSP connections.

3. **Shared utility reuse**: isInComment/isInString extraction to utils.ts enabled immediate reuse in rename.ts. The refactoring was minimal (move + re-export) with high value.

4. **FlowNode location enables future features**: Adding SourceLocation to FlowNode (v3.5-R3) enables future features like "go to flow node definition" and accurate outline navigation. The optional typing preserves backward compatibility.

### Architectural Concerns

1. **Dual keyword maintenance**: GRAFT_KEYWORDS (26) and lexer KEYWORDS (38) are independently maintained. This is a maintenance risk, not a correctness issue today.

2. **Text-based reference finding ceiling**: The rename feature has been hardened with context filtering (comments, strings, import paths), but the fundamental approach is text-based regex matching. The remaining edge cases (field name collision, produces name confusion) cannot be fixed without AST-based reference tracking. The question is whether these edge cases matter enough to justify the architectural investment.

3. **LSP feature module count**: src/lsp/features/ now has 9 files (8 modules + index.ts). This is well-organized and follows the one-feature-per-module pattern. Adding more features (find-all-references, extract-to-context, inline-import) would continue this pattern naturally.

---

## 7. v3.6 Scope Recommendations

### Assessment of remaining work

The LSP is now feature-complete for a v1 editing experience: diagnostics, hover, go-to-definition, completions, code actions (auto-import), document symbols (hierarchical), and rename (cross-file, hardened). The remaining gaps are edge cases (field name collision in rename) and polish items. The next version could either continue LSP depth (find-all-references, more code actions) or pivot to other areas (language features, runtime improvements).

### Recommended scope: LSP references + keyword unification + polish

**Rationale**: Find-all-references is the natural next LSP feature. It shares infrastructure with rename (both need reference finding) and enables "show usages" in the editor. Combining it with keyword unification (TD-01) and the remaining polish items creates a cohesive version. Alternatively, if the priority is language evolution, the version could focus on new syntax or runtime features.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Find-all-references (LSP textDocument/references) | MEDIUM | 4 |
| R2 | GRAFT_KEYWORDS derivation from lexer KEYWORDS + cross-file conflict parse-based check (TD-01, TD-02) | DIRECT | 2 |
| R3 | Symbol range improvement (full declaration span) + rename field collision guard | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~10** |

**Alternative scope: Runtime hardening**

If LSP is considered sufficiently mature, v3.6 could address runtime gaps:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Foreach source failure handling (define behavior when source node fails) | MEDIUM | 4 |
| R2 | Multi-hop conditional edge routing | MEDIUM | 4 |
| R3 | Token budget hard enforcement (configurable abort threshold) | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~12** |

**Ratchet unlocks anticipated**: 0 for either scope. No existing ratchets block these features. If find-all-references is implemented, it would share collectRenameLocations with filtering, which is additive.

**Items explicitly deferred to v3.7+**:
- Memory importability (R-01) -- needs design discussion, no user demand
- AST-based reference tracking (full rewrite of text-based matching) -- only if find-all-references reveals text-based limitations
- Async file I/O (R-02) -- LLM latency dominates
- Source maps / workspace support -- major features needing dedicated versions
- Second codegen backend -- no user demand

**Test target**: 739 existing + ~40 new = ~779 tests at v3.6 completion.

**v3.4 retro deferred items status check**:
- Memory importability (R-01): Still deferred. No user demand.
- Async file I/O (R-02): Still deferred. LLM latency dominates.
- Additional code actions (add missing field, fix budget): Could be part of v3.6 scope if LSP depth is prioritized. Carried forward.
- Source maps: Still deferred. Major feature.
- Inverted workspace export index: Still deferred. Only matters at scale.
- AST-based reference tracking: Still deferred. Text-based approach with filtering is sufficient after v3.5 hardening. Revisit if find-all-references exposes limitations.
