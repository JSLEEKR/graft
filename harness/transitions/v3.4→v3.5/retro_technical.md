# Technical Retrospective: Graft v3.4

## Version Summary

v3.4 delivered 4 rounds: LSP rename support (R1, MEDIUM), conditional edge estimation + features.ts split (R2, DIRECT), hierarchical document symbols + code action extraction (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 636 to 690 (54 new tests). 10 new ratchet items added, 0 unlocked. Ratchet count stands at 200 total (195 locked, 5 unlocked across all versions). The version was executed in ~10 agent calls.

v3.4's primary contributions are: (1) LSP rename with cross-file support via workspace export cache, (2) conditional edge token estimation (best=min branch, worst=max branch), (3) hierarchical document symbols with field and flow node children, (4) features.ts split into 8 focused modules under features/, and (5) buildAutoImportActions extraction as a pure function. All four items from the v3.3 retro's recommended scope (Section 6) were delivered.

---

## 1. Tech Debt Inventory

### TD-01: collectRenameLocations uses raw \b regex — no context filtering [CRITICAL]
- **Severity**: HIGH
- **Status**: New in v3.4 — identified by A3-Skeptic during R1 analysis
- **Description**: `collectRenameLocations()` (rename.ts:13-45) uses `\b${escaped}\b` regex to find all occurrences of a name in document text. This regex matches ANY word-boundary occurrence, including:
  1. **Comments**: `// Rename MyContext to...` would match `MyContext`
  2. **String literals**: `"Expected MyContext output"` would match `MyContext`
  3. **Import paths**: `import { X } from "path/MyContext.gft"` — the `.gft` extension prevents a direct match here, but a node named `gft` would match inside paths
  4. **Produce field names**: If a field shares a name with a context/node (e.g., `summary` as both a field name and a node name), the regex cannot distinguish them
- **Impact**: Rename operations will silently corrupt comments, strings, and identically-named fields. This is user-facing data loss. A rename of `Summary` (node) would also rename any field called `Summary` and any comment mentioning "Summary".
- **Fix**: Filter matches by context. At minimum, exclude lines starting with `//` and positions inside `/* */` blocks. Ideally, re-parse and use AST locations from ProgramIndex (sourceLocation on declarations + reference tracking) instead of text search.
- **Recommendation**: HIGHEST priority for v3.5. The feature is shipped and users can trigger it.

### TD-02: No newName validation on rename
- **Severity**: HIGH
- **Status**: New in v3.4 — identified by A3-Skeptic
- **Description**: `onRenameRequest` (server.ts:291-360) accepts any `newName` string without validation. Invalid identifiers (`123abc`, `my-node`, empty string, `context` keyword) are accepted. The conflict check (server.ts:302-309) only checks ProgramIndex maps — it does not validate that the new name is a legal Graft identifier (`[A-Za-z_][A-Za-z0-9_]*`).
- **Impact**: Renaming to a keyword (`context`, `node`, `import`, `graph`, etc.) or invalid identifier will produce a syntactically broken file. The user sees no error from the rename — they see parse errors afterward.
- **Fix**: Add identifier validation (`/^[A-Za-z_][A-Za-z0-9_]*$/`) and keyword rejection in `onRenameRequest` before applying edits. Return null or a ResponseError for invalid names. ~10 lines.
- **Recommendation**: HIGH priority. Pair with TD-01 fix in v3.5.

### TD-03: Rename conflict check is single-file only
- **Severity**: MEDIUM
- **Status**: New in v3.4 — identified by A3-Skeptic
- **Description**: The conflict check in `onRenameRequest` (server.ts:302-309) only checks `state.index` — the ProgramIndex of the current file. If file A exports `Foo` and file B imports `Foo` but also locally declares `Bar`, renaming `Foo` to `Bar` in file A will succeed without detecting the collision in file B. The cross-file rename would then produce a `SCOPE_DUPLICATE` error in file B.
- **Impact**: Cross-file rename can introduce name collisions in importing files. The user discovers the conflict only after the rename is applied (via diagnostic errors). Not data loss — the error is visible — but it's a poor UX that requires manual undo.
- **Fix**: Before applying cross-file renames, parse each affected file and check its ProgramIndex for `newName` conflicts. This adds ~15 lines to the rename handler, using the existing parse infrastructure.
- **Recommendation**: MEDIUM priority. Address alongside TD-01/TD-02 for a complete rename hardening round.

### TD-04: CRLF line endings shift rename positions on Windows
- **Severity**: MEDIUM
- **Status**: New in v3.4 — identified by A3-Skeptic
- **Description**: `collectRenameLocations()` splits on `\n` (rename.ts:18) and computes offsets assuming 1-byte line separators (rename.ts:21: `offset += line.length + 1`). On Windows, files with `\r\n` line endings will have `\r` at the end of each split line. The `line.length + 1` correctly accounts for the `\n` separator consumed by split, but the `\r` remains in the line string. This means `line.length` includes the `\r`, so character offsets include trailing `\r` in position calculations. For the regex match against `docText` (which preserves `\r\n`), the offsets are actually correct because the full text includes `\r\n` — but the LSP `Range.character` positions will include the trailing `\r` width, which may cause off-by-one on editors that strip `\r` from line content.
- **Impact**: Potential off-by-one rename position errors on Windows with CRLF files. The LSP protocol defines character position relative to the line content (without the line ending). If `line.length` includes `\r`, the computed character positions are correct for indexing into `docText` but incorrect for LSP Range semantics.
- **Fix**: Normalize `\r\n` to `\n` before processing, or strip trailing `\r` from lines after splitting. The completions module (completions.ts) already handles CRLF — follow the same pattern. ~3 lines.
- **Recommendation**: MEDIUM priority. Windows is the primary development platform for this project.

### TD-05: server.ts has grown to 363 lines with rename logic inline
- **Severity**: MEDIUM
- **Status**: Upgraded from v3.3 retro TD-03 (was 294 lines, now 363 lines)
- **Description**: v3.4 added ~70 lines for rename handling (prepareRename: lines 265-289, onRenameRequest: lines 291-360). The rename handler contains inline logic for conflict detection, cross-file scanning, file reading, and workspace cache interaction. The `collectRenameLocations` and `isRenameable` functions were correctly extracted to features/rename.ts, but the orchestration logic (conflict check, cross-file iteration, import pattern matching) remains in server.ts.
- **Impact**: server.ts is accumulating handler-specific business logic that should be in pure functions. The rename handler has 3 distinct responsibilities: validation (conflict + identifier check), current-file collection, and cross-file collection. All three are testable independently.
- **Recommendation**: Extract rename orchestration logic into features/rename.ts as a pure function. This follows the pattern established by buildAutoImportActions in v3.4-R3 (code-actions.ts). ~30 lines to move.

### TD-06: Lexer still throws on first error (no recovery)
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-01), v3.2 retro (TD-01)
- **Description**: Unchanged. The lexer throws on the first unrecognized character. Multi-error reporting only works at the parser level and above.
- **Recommendation**: LOW priority. Carry forward. Marginal benefit.

### TD-07: Completion context detection remains position-fragile
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-05), v3.2 retro (TD-03)
- **Description**: Unchanged. Backward scanning for unmatched delimiters in completions.ts.
- **Recommendation**: Carry forward. No reports of issues.

### TD-08: isInComment() scans from document start on every request
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-06), v3.2 retro (TD-04)
- **Description**: O(n) per completion keystroke. Graft files tend to be short.
- **Recommendation**: LOW priority. Carry forward.

### TD-09: Empty `catch {}` blocks throughout codebase (18 instances)
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-07), count increased by 1
- **Description**: v3.4 added 1 new bare catch block in server.ts (line 342, cross-file rename file read). Total: 18 bare catch blocks. Each is individually justified (graceful degradation on filesystem operations).
- **Recommendation**: Not a priority. The pattern is consistent and intentional.

### TD-10: Workspace export cache has no deletion invalidation
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-04)
- **Description**: Deleted .gft files remain in workspaceExports cache. Self-correcting (import produces RESOLVE_FILE_NOT_FOUND).
- **Recommendation**: LOW priority. Carry forward.

### TD-11: ScopeChecker remains the largest analyzer class (444 lines)
- **Severity**: LOW
- **Status**: Carried forward from v3.3 retro (TD-10)
- **Description**: Unchanged. Not blocking any feature work.
- **Recommendation**: SKIP.

### TD-12: FlowNode has no SourceLocation — symbols use parent location
- **Severity**: LOW
- **Status**: New in v3.4
- **Description**: `makeFlowNodeChildren()` (symbols.ts:42-52) uses `parentLoc` (graph location) for all flow node symbols because FlowNode has no own location property. This means clicking a flow node in the outline view navigates to the graph declaration, not the node's position within the flow.
- **Impact**: Minor UX friction in outline navigation. The symbol appears but clicking it doesn't navigate to the right line.
- **Fix**: Add `location?: SourceLocation` to FlowNode in ast.ts, set it during parsing. This is a parser change (~10 lines) plus AST type change.
- **Recommendation**: LOW priority. Cosmetic.

---

## 2. Emerging Patterns

### Patterns Formalized in v3.4

- **Feature module split pattern**: features.ts was successfully split into 8 modules (diagnostics, hover, completions, definition, symbols, code-actions, rename, utils) with an index.ts barrel re-export. This is now the standard pattern for LSP feature organization. New LSP features get their own module under features/.

- **Pure function extraction pattern**: buildAutoImportActions (code-actions.ts) demonstrates the correct approach: extract business logic from server.ts handlers into pure functions that accept data parameters (docText, diagnostics, workspaceExports) and return LSP protocol objects. The server handler becomes a thin adapter that reads documents and calls the pure function.

### Patterns to Formalize

- **Rename orchestration should follow the buildAutoImportActions pattern**: The rename handler in server.ts still contains inline logic (conflict check, cross-file scanning, import pattern matching). This should be extracted to a pure function in features/rename.ts, accepting (docText, word, newName, index, workspaceFileTexts) and returning a WorkspaceEdit. This would make the entire rename flow unit-testable without LSP protocol wiring.

- **Conditional edge awareness across pipeline**: With v3.4-R2 completing estimator support for conditional edges, the conditional edge feature now works across runtime (v3.3-R2), analysis (v3.3-R3 condition types), and estimation (v3.4-R2). The pattern is: each pipeline stage handles conditional edges independently. Future features that span runtime+analysis+estimation should follow this 3-stage approach.

### Patterns to Monitor

- **FlowContext interface growth**: Still at 4 members (executeNode, getFailureStrategy, getConditionalEdge, outputs/input via RuntimeState). No change from v3.3. The concern from v3.3 retro remains valid but has not worsened.

- **server.ts as an accumulator**: server.ts grew from 294 (v3.3) to 363 (v3.4) lines. Each new LSP feature adds a handler with some inline logic. The features/ split helped the pure computation side, but the server-side orchestration (document reading, cache interaction, workspace scanning) continues to grow. If the next version adds another handler-heavy feature, server.ts will cross 400 lines.

- **Text-based reference finding vs AST-based**: The rename feature uses regex (collectRenameLocations) rather than AST-based reference tracking. This is the first feature where text-based matching creates correctness issues (TD-01). As more refactoring features are added (find-all-references, extract function), the lack of AST-based reference tracking will become a recurring limitation.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v3.4-R02] collectRenameLocations uses word-boundary regex (\b) for name matching**: This ratchet locks the current text-based approach. The A3-Skeptic findings (TD-01) demonstrate this approach has correctness gaps (matches in comments, strings, field names). Two options: (a) keep \b regex but add context filtering (comment/string exclusion), or (b) unlock and move to AST-based location tracking. Option (a) is the minimal fix; option (b) is architecturally cleaner but requires adding reference tracking to ProgramIndex. **Recommend option (a) for v3.5 — add filtering without unlocking the ratchet**, since filtering is additive behavior. Only unlock if AST-based tracking is pursued.

- **[v3.4-R05] Rename rejects if newName conflicts with existing declaration**: This ratchet is too narrow — it only covers the current file's ProgramIndex. Cross-file conflict detection (TD-03) is an extension, not a contradiction, so no unlock is needed. The ratchet can stay locked; the fix adds behavior on top.

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: Carried forward unchanged from v3.3 retro. Still the primary blocker for memory importability. Not in near-term roadmap.

- **[v3.3-R03] Workspace export cache: lazy scan on first code action, Map<exportName, filePath>**: The cache structure question from v3.3 retro (inversion for O(1) lookup) is still relevant. The rename handler adds a second consumer of workspaceExports (alongside code actions). Both iterate all files. Still LOW priority — workspace sizes are small.

### Ratchets Confirmed Still Valid

All 200 ratchets reviewed. The 10 new v3.4 ratchets (R01-R10) are sound with the caveats noted above for R02 and R05. No ratchets are actively blocking v3.5 feature work.

---

## 4. Edge Cases & Gaps

### LSP Rename (highest-priority gaps)

- **Comment/string false positives** (TD-01): `collectRenameLocations` matches names inside `//` comments, `/* */` block comments, and string literals. A file with `// TODO: rename MyNode to something better` would have `MyNode` renamed inside the comment. This is the most impactful correctness gap in the current LSP.

- **Field name collision**: If a context field and a node share the same name (e.g., context `Report` has field `summary`, and there's a node named `summary`), renaming the node `summary` will also rename the field `summary` in reads like `Report.summary`. The regex cannot distinguish structural position.

- **Import path name collision**: In `import { Foo } from "./Foo.gft"`, renaming the declaration `Foo` should rename the imported name `{ Foo }` but NOT the path `"./Foo.gft"`. The current regex WILL match `Foo` in the path if it appears at a word boundary. However, `Foo.gft` has a dot after `Foo`, and `\b` treats the dot as a word boundary — so `\bFoo\b` WILL match `Foo` in `Foo.gft`. This would corrupt the import path.

- **Cross-file rename misses non-importing files**: The cross-file rename (server.ts:332-357) only checks files in `workspaceExports`. If a file uses a name via re-export or indirect reference without appearing in the workspace cache, it will be missed. This is acceptable given v2.0-R13 (only contexts and nodes are importable), but the comment in the code doesn't document this limitation.

- **Keyword rename accepted**: Renaming `MyNode` to `context`, `node`, `graph`, `memory`, `import`, `from`, `edge`, `reads`, `writes`, `produces`, `budget`, `done`, `foreach`, `in`, `parallel`, `when`, `else`, `storage`, `on_failure`, `retry`, `fallback`, `skip`, or `abort` is silently accepted (TD-02).

### Estimator

- **Conditional branch chaining**: The estimator's `getConditionalBranchCosts` (estimator.ts:172-189) computes costs for direct targets of conditional edges. If a conditional target itself has conditional edges, those nested branches are NOT included in the cost calculation. The estimator processes flow nodes sequentially and handles conditional edges per-node, but conditional targets that aren't in the flow (they're reached via edge routing, not flow ordering) are only costed as single nodes, not as sub-graphs.

- **`done` branch cost**: `getConditionalBranchCosts` correctly handles the `done` keyword (estimator.ts:177-180) with zero cost. This is correct — `done` terminates execution.

### Runtime

- **Conditional edge routing still does not chain**: Unchanged from v3.3 retro. One-hop limitation.

- **Foreach source failure handling**: Unchanged from v3.3/v3.2 retro.

### Document Symbols

- **FlowNode position**: Flow nodes in graph symbols use the graph's location (symbols.ts:47), not their own position. Clicking a flow node in the outline navigates to the graph declaration line (TD-12).

- **Parallel/foreach not represented**: `makeFlowNodeChildren` (symbols.ts:48-49) skips parallel and foreach flow nodes. Only `kind === 'node'` entries appear as children. A graph with `parallel { A, B }` shows neither the parallel structure nor A/B as children.

---

## 5. Feature Priority Ranking

Ranked by user impact weighted against implementation complexity.

| Rank | Feature | Complexity | Impact | Notes |
|------|---------|-----------|--------|-------|
| 1 | Rename correctness: comment/string/path filtering | LOW-MEDIUM | CRITICAL | TD-01. ~40-60 lines. Filter `collectRenameLocations` results by excluding comment/string/import-path positions. Reuse `isInComment()`/`isInString()` from completions.ts. |
| 2 | Rename newName validation | LOW | HIGH | TD-02. ~10 lines. Identifier regex + keyword set check. |
| 3 | CRLF normalization in rename | LOW | HIGH | TD-04. ~3 lines. `docText.replace(/\r\n/g, '\n')` or strip `\r` after split. Windows is primary platform. |
| 4 | Cross-file conflict detection for rename | LOW-MEDIUM | MEDIUM | TD-03. ~15-20 lines. Parse affected files, check ProgramIndex for newName. |
| 5 | Rename handler extraction to features/rename.ts | LOW | MEDIUM | TD-05. Pure function extraction following buildAutoImportActions pattern. Improves testability. |
| 6 | Additional code actions (add missing field, fix budget) | MEDIUM | LOW-MEDIUM | Infrastructure exists. Incremental per-diagnostic handlers. |
| 7 | FlowNode source location in parser | LOW | LOW-MEDIUM | TD-12. Enables accurate outline navigation. ~10 lines parser change. |
| 8 | Parallel/foreach children in document symbols | LOW | LOW | symbols.ts enhancement. ~15 lines. |
| 9 | Memory importability | HIGH | LOW-MEDIUM | Requires unlocking v2.0-R13. Deferred since v2.0. R-01. |
| 10 | Inverted workspace export index | LOW | LOW | Map<name, filePaths[]> for O(1) lookup. Only matters at scale. |
| 11 | Async file I/O in executor | MEDIUM | LOW | LLM latency dominates. R-02. |
| 12 | Source maps for runtime errors | HIGH | LOW | Substantial effort for modest debugging improvement. X-03. |

---

## 6. Recommendation for v3.5 Scope

### Recommended scope: Rename hardening + LSP refinements

**Rationale**: v3.4 shipped rename support with known correctness gaps documented by A3-Skeptic during the R1 debate. These gaps are not theoretical — they are reproducible with common Graft files (any file with comments mentioning declaration names will have those comments corrupted on rename). Fixing these before adding new features is the right priority. The fixes are individually small (3-60 lines each) and collectively make rename production-quality.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | Rename hardening: comment/string/path filtering + newName validation + CRLF fix (TD-01, TD-02, TD-04) | MEDIUM | 4 |
| R2 | Cross-file conflict detection + rename handler extraction to features/rename.ts (TD-03, TD-05) | DIRECT | 2 |
| R3 | FlowNode source location + parallel/foreach symbol children (TD-12 + Section 4 gap) | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~10** |

**Ratchet unlocks anticipated**: 0. TD-01's fix is additive filtering on top of v3.4-R02 (word-boundary regex stays, but results are filtered). No existing ratchets block these features.

**Items explicitly deferred to v3.6+**:
- Additional code actions (add missing field, fix budget) — useful but not urgent
- Memory importability (R-01) — needs design discussion for scoping rules
- Async file I/O (R-02) — LLM latency dominates
- Source maps (X-03) — major feature needing dedicated version
- Inverted workspace export index — only needed at scale
- AST-based reference tracking (full rewrite of rename foundation) — v3.5 takes the pragmatic filtering approach; if filtering proves insufficient, revisit for v3.6

**Test target**: 690 existing + ~40 new = ~730 tests at v3.5 completion.

**v3.3 retro deferred items status check**:
- Memory importability (R-01): Still deferred. No user demand.
- Async file I/O (R-02): Still deferred. LLM latency dominates.
- Additional code actions: Still deferred. Auto-import is sufficient for now.
- Source maps: Still deferred.
- Inverted workspace export index: Still deferred.

**Key risk**: R1 (rename hardening) requires careful interaction between the filtering logic and the existing `collectRenameLocations` function. The comment/string detection must handle block comments spanning multiple lines and nested contexts correctly. Reusing `isInComment()`/`isInString()` from completions.ts is the safest path, but those functions operate on (line, character) coordinates while `collectRenameLocations` operates on absolute offsets — a coordinate translation layer will be needed.
