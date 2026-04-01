# Technical Retrospective: Graft v3.1

## Version Summary

v3.1 delivered 5 rounds: LSP completions (R1), parallel failure strategy fix + fallback cycle detection (R2), tech debt cleanup (R3), programmatic API surface (R4), and integration tests (R5). Test count rose from 477 to 537 (60 new tests). No new ratchet items were added to common_memory.md during this version; the ratchet count remains at 135 (131 locked, 4 unlocked).

---

## 1. Codebase Quality Assessment

### Strengths

- **features.ts is well-structured.** The getCompletions() function (162-277) handles 8 distinct completion contexts with clean separation: model aliases, failure strategies, fallback node names, import braces, dot-field access, reads/writes brackets, graph flow, and top-level keywords. Each context is isolated in its own conditional block.

- **Comment/string suppression is correct.** isInComment() (311-345) handles both line comments (//) and block comments (/* */), with proper string-skipping inside non-block regions. isInString() (347-353) uses toggle-based quote tracking. Both are conservative (suppress on ambiguity), which is the right default for completions.

- **flow-runner.ts parallel fix is clean.** executeWithFailureStrategy (10-61) is extracted as a standalone function, called from both sequential and parallel branches. The parallel block (80-99) correctly uses Promise.allSettled with per-branch error capture, preventing one branch failure from crashing others.

- **Fallback cycle detection (scope.ts 362-414) is correct.** DFS with visited + in-stack sets properly detects cycles in the fallback graph. The iterative stack-based approach avoids stack overflow on deep chains.

- **types.ts barrel (11 lines) is minimal and correct.** Re-exports types only (no runtime values except GraftError class). Sub-path exports in package.json (./compiler, ./runtime, ./types) follow Node.js conventions.

- **formatTokenReport extraction (format.ts) is clean.** 31 lines, single responsibility, proper locale formatting with toLocaleString('en-US') per ratchet T7-R04.

### Concerns

- **features.ts is growing large (449 lines).** It now contains diagnostics, word extraction, hover, go-to-definition, type formatting, completions (with 8 sub-handlers), and 5 helper functions. The file started as 3 LSP features in v2.2-R4 and has grown by ~60% with completions. Not urgent, but approaching the point where splitting into features/completions.ts would improve navigability.

- **ScopeChecker (444 lines) continues to accumulate checks.** It now handles: duplicate names, max_tokens, node reads, node writes, edges, multiple graphs, graph flow (with recursive walkFlowNodes), failure strategies, fallback cycles, and parallel write detection. This is the largest single-class file in the analyzer. The fallback cycle detection alone is 53 lines.

- **Executor still has synchronous file I/O.** All fs.writeFileSync/fs.readFileSync/fs.mkdirSync calls (lines 96-115, 302-349) block the event loop. This was deferred as R-02 in the v3.1 plan and remains valid.

---

## 2. New Tech Debt Identified

### TD-01: LSP completions lack resolveImportNames integration

getCompletions() accepts `resolveImportNames?: (importPath: string) => string[]` (line 167), but server.ts never passes it (line 116-121). Import brace completions will always return empty. This is a stub for future work, not a bug, but it means the import completion context (216-224) is dead code in practice.

### TD-02: LSP cache grows without bound

server.ts cache (line 18) is a `Map<string, { program, index }>` that only shrinks on document close (line 85-88). For long-running sessions with many files opened and closed via go-to-definition (without explicit close), the cache may retain stale entries. The importDeps map (line 21) has the same characteristic.

### TD-03: Completion context detection is position-fragile

isInsideBracketAfter() (355-372) scans backwards through lines looking for unmatched `[` preceded by a keyword. This works for well-formed code but will misfire if the user has unmatched brackets above the cursor position (common during editing). Same applies to isInsideImportBraces() and isInsideBlock(). This is acceptable for MVP but will produce surprising behavior in malformed documents.

### TD-04: No completion for `storage:` values

The parser accepts `storage: file` (and potentially other storage types), but there is no completion context for it. Low priority since `file` is currently the only storage type.

### TD-05: Executor.storeOutput writes duplicate JSON files

storeOutput() (302-349) writes both `nodename.json` and `producesname.json` to the session directory. When they differ, this is useful. When they are the same (common pattern), it writes identical content twice. Minor waste.

### TD-06: package.json exports don't include ./format

formatTokenReport was extracted to src/format.ts but is not exposed as a sub-path export. Consumers who want to format token reports programmatically cannot import it directly; they must go through the main entry point (if it re-exports) or use a deep import.

---

## 3. Deferred Items Review

### Still Valid (carry forward to v3.2+)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| R-01 | Memory importability across files | VALID | v2.0-R13 locked memories as non-importable. Real use cases exist (shared counters, session state). Requires parser + resolver + scope changes. Medium effort. |
| R-02 | Async file I/O in executor | VALID | All fs operations are synchronous. Matters for parallel node execution where file writes block the event loop. Now more important with parallel failure strategies actually working. |
| R-04 | Parser error recovery (multi-error reporting) | VALID | Parser still throws on first error (PARSE_UNEXPECTED_TOKEN, PARSE_MISSING_FIELD). LSP users see only one error at a time. This is the highest-impact UX improvement for the LSP. |
| R-05 | Conditional edge routing in runtime | VALID | Deferred since v1.3. Scope checker warns about transforms on conditional edges (SCOPE_TRANSFORM_CONDITIONAL) but runtime ignores conditional edges entirely. |
| R-08 | Second backend implementation | VALID | CodegenBackend interface exists (v3.0-R3) but only ClaudeCodeBackend is implemented. A second backend would validate the interface design. |
| R-10 | LSP parsed Program caching for imports | VALID | Currently each file re-parses all its imports on every change. With the 200ms debounce this is tolerable for small projects but will degrade with deep import trees. |
| R-11 | Keyword hover documentation in LSP | VALID | getHoverInfo() only resolves context/node/memory/produces names. Hovering over keywords (context, node, graph, memory, import) shows nothing. Low effort, good UX. |

### Can Be Dropped or Deprioritized

| ID | Item | Rationale |
|----|------|-----------|
| (none) | All deferred items remain technically valid. | No items have been obviated by v3.1 changes. R-11 is the lowest priority since completions now provide snippet documentation for keywords, partially overlapping with hover docs. |

---

## 4. Performance Observations

### Test Suite

- 537 tests in 5.46s (98 tests/second). Healthy. No timeout issues observed.
- 32 test files. Test-to-source ratio is good.

### LSP Responsiveness

- 200ms debounce on document changes (v3.0-R30) is appropriate for typing. However, completions trigger on every keystroke without debounce (line 112-122 in server.ts). For large files with deep import trees, the compileToProgram() call inside validateDocument (triggered by debounce) could cause visible lag. Completion requests use cached state, so they are fast as long as the cache is warm.

### Completion Function Complexity

- getCompletions() performs up to 8 regex tests per invocation. All are simple patterns tested against the current line prefix (O(n) in line length). No performance concern.
- isInComment() (311-345) scans all lines from 0 to current line on every completion request. For files with thousands of lines this could become noticeable. Consider caching comment regions per document version.

### Runtime

- Parallel execution uses Promise.allSettled correctly. The executeWithFailureStrategy extraction means retry/fallback logic runs per-branch without blocking other branches.
- Synchronous file I/O in Executor is the primary performance bottleneck in the runtime. Each storeOutput() call does 2-4 synchronous writes (node JSON, produces JSON, optional transform JSON, optional memory save).

---

## 5. Extension Points Needed

### EP-01: Completion provider extensibility

getCompletions() is a single monolithic function with hardcoded context detection. If a second DSL variant or custom keywords are added, there is no way to extend completion contexts without modifying features.ts. Consider a registry pattern or context-handler array.

### EP-02: LSP command/action support

The LSP server provides diagnostics, hover, definition, and completions. Missing: code actions (quick fixes for diagnostics), rename support, document symbols, and workspace symbols. Code actions are the highest value addition (e.g., "add missing import" when SCOPE_UNDEFINED_REF is reported for a name that exists in an importable file).

### EP-03: Runtime event hooks

Executor has no lifecycle hooks (beforeNode, afterNode, onError). Programmatic API consumers (via ./runtime export) cannot observe execution progress without parsing RunResult after completion. An event emitter or callback interface would enable real-time monitoring, logging, and cancellation.

### EP-04: Backend-specific completion contexts

The completion provider knows about MODEL_MAP but nothing about backend-specific configurations. If a second backend is implemented, completions for backend-specific settings would need a way to query the active backend's capabilities.

---

## 6. Recommendations for v3.2

### High Priority

1. **Parser error recovery (R-04).** The single biggest UX gap. The LSP shows one error at a time, forcing fix-recompile cycles. Implement panic-mode recovery at statement boundaries (context/node/memory/graph/edge/import). This touches parser.ts only, with downstream benefits for LSP immediately.

2. **Async file I/O in executor (R-02).** Convert fs.*Sync calls to fs.promises equivalents. This unblocks parallel node execution from file I/O contention. Straightforward mechanical change with high impact on runtime performance.

3. **LSP code actions.** Add quick-fix code actions for the most common diagnostics: SCOPE_UNDEFINED_REF (suggest import or declaration), SCOPE_FIELD_NOT_FOUND (suggest similar field names), SCOPE_DUPLICATE_NAME (highlight the conflicting declaration). This leverages the existing ProgramIndex infrastructure.

### Medium Priority

4. **resolveImportNames integration (TD-01).** Wire up the import name resolver in server.ts so import brace completions actually work. The callback signature already exists; it needs the resolver to be invoked with the import path from the current line.

5. **Keyword hover documentation (R-11).** Add hover info for Graft keywords (context, node, graph, memory, import, edge, writes, reads, etc.). Low effort since the completion snippets already contain the documentation text; it just needs to be surfaced in getHoverInfo().

6. **Conditional edge routing (R-05).** The scope checker, parser, and codegen all handle conditional edges. The runtime is the only gap. Implementing this completes the feature that has been partially implemented since v1.3.

### Low Priority

7. **Memory importability (R-01).** Unlocking v2.0-R13 has broad implications across the pipeline. Defer unless a concrete use case demands it.

8. **Second backend (R-08).** The interface exists and is tested via ClaudeCodeBackend. A second backend would validate the design but is not blocking any user-facing functionality.

9. **LSP Program cache for imports (R-10).** Only matters for projects with deep import trees. Monitor before investing.

### Tech Debt to Address

- Split features.ts if completions grow further (currently manageable at 449 lines).
- Add ./format sub-path export to package.json if formatTokenReport is part of the public API.
- Consider LRU eviction for LSP cache to prevent unbounded growth in long sessions.
