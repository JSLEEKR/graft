# Technical Retrospective: Graft v3.2

## Version Summary

v3.2 delivered 4 rounds: parser error recovery (R1, MEDIUM), LSP polish (R2, DIRECT), tech debt (R3, DIRECT), and integration tests (R4, TEST-ONLY). Test count rose from 537 to 582 (45 new tests). 7 new ratchet items added (5 in R1, 2 in R2), 1 unlocked (v2.2-R10 parser throw-based). Ratchet count stands at 180 total (175 locked, 5 unlocked across all versions). The version was executed in ~10 agent calls, 17% fewer than v3.1's 12.

v3.2's primary contribution is parser error recovery -- the parser now accumulates errors with panic-mode recovery at declaration boundaries, returning a ParseResult with a partial but structurally valid Program. Secondary contributions include LSP keyword hover documentation, storage completions, import name resolution wiring, and LRU cache eviction. The `./format` sub-path export was added to package.json for programmatic consumers.

---

## 1. Tech Debt Inventory

### TD-01: Lexer still throws on first error (no recovery)
- **Severity**: MEDIUM
- **Source**: v3.2 design decision -- parser got error recovery, lexer intentionally left as throw-on-first
- **Description**: The lexer (src/lexer/lexer.ts) throws a GraftError on the first unrecognized character or malformed token. If a file has a lexer error (e.g., invalid character `@` at line 1), the parser never runs, so multi-error reporting only works for syntactically valid tokens with structural errors. The compiler wraps the lexer in try-catch and returns immediately on lexer failure (compiler.ts:33-38).
- **Impact**: Users with non-ASCII characters or truly invalid tokens see only one error. This is a smaller surface than parser errors since the lexer's alphabet is well-defined, but it is an incomplete story.
- **Recommendation**: LOW priority. Most real lexer errors are single-point failures (bad character, unterminated string). Multi-error recovery in the lexer provides marginal benefit.

### TD-02: synchronize() does not handle nested brace structures in all edge cases
- **Severity**: LOW
- **Source**: v3.2-R1 implementation
- **Description**: Parser.synchronize() (parser.ts:105-125) tracks brace depth to avoid false keyword matches inside blocks. However, it does not account for braces inside string literals. A string literal containing `"context"` or `"{"` could cause synchronization to misalign. In practice this is unlikely because Graft string literals appear only in import paths and condition values, not inside declaration bodies where synchronization occurs.
- **Impact**: Theoretical. No real Graft file would trigger this because string literals don't appear in positions where synchronize() runs.
- **Recommendation**: SKIP. The risk is purely theoretical for the current grammar.

### TD-03: Completion context detection remains position-fragile
- **Severity**: LOW
- **Source**: v3.1 retro (carried forward as-is from TD-03)
- **Description**: isInsideBracketAfter(), isInsideImportBraces(), and isInsideBlock() in features.ts scan backwards through lines looking for unmatched delimiters. Malformed documents with unmatched brackets above the cursor position can cause false positives. Now that the parser has error recovery, the LSP sees more partial/malformed documents, slightly increasing the probability of misfire.
- **Impact**: Completion suggestions may appear in wrong contexts for malformed files. Not a crash -- just unhelpful suggestions.
- **Recommendation**: Carry forward. Acceptable for current usage patterns. Consider fixing if user reports arrive.

### TD-04: isInComment() scans from document start on every completion request
- **Severity**: LOW
- **Source**: v3.1 retro (performance observation), features.ts:340-374
- **Description**: isInComment() iterates all lines from line 0 to the cursor line to determine block comment state. For documents with hundreds of lines, this is O(n) per completion keystroke. No caching of comment region boundaries exists.
- **Impact**: Performance degradation on large files. Currently tolerable because Graft files tend to be short (< 100 lines). Would become noticeable at 500+ lines.
- **Recommendation**: LOW priority. Cache comment regions per document version if performance reports arise.

### TD-05: Two TODO comments remain in analyzer source
- **Severity**: LOW
- **Source**: Code inspection
- **Description**: `src/analyzer/types.ts:54` has `// TODO: condition type compatibility -- e.g., >= on String fields (v2)` and `src/analyzer/estimator.ts:37` has `// TODO: store conditional edge branches for token estimation (v2)`. Both reference "v2" but remain unaddressed through v3.2.
- **Impact**: Missing validation -- condition operators like `>=` on String fields are not type-checked. Missing estimation -- conditional edge branches don't contribute to token budget estimates.
- **Recommendation**: TD-06 (condition type compatibility) is the higher-value fix. TD-07 (conditional edge estimation) is advisory-only and acceptable to defer further.

### TD-06: ScopeChecker is the largest analyzer class (450+ lines)
- **Severity**: LOW
- **Source**: v3.1 retro (carried forward)
- **Description**: ScopeChecker handles 11 distinct check categories: duplicate names, max_tokens, node reads, node writes, edges, multiple graphs, graph flow (with recursive walkFlowNodes), failure strategies, fallback cycles, parallel write detection, and binding collisions. The fallback cycle DFS alone is 53 lines.
- **Impact**: Navigability. Not a correctness issue, but the file is difficult to scan for specific checks.
- **Recommendation**: SKIP for v3.3. Not blocking any feature work. If a new scope check category is added, consider extracting cycle detection or flow walking into a helper.

### TD-07: features.ts is 487 lines and growing
- **Severity**: LOW
- **Source**: v3.1 retro (was 449 lines; v3.2 added keyword hover docs and storage completions)
- **Description**: features.ts contains diagnostics, word extraction, hover (with KEYWORD_DOCS map), go-to-definition, type formatting, and completions (8 sub-handlers + 5 helpers). The KEYWORD_DOCS record (60-76) added in v3.2-R2 is 16 entries of multi-line strings.
- **Impact**: Not a correctness issue. The file is well-organized with clear section headers but approaching the point where splitting completions into a separate file would improve navigability.
- **Recommendation**: Split when the next LSP feature (code actions) is added. Code actions will add another 100+ lines, making the split justified.

### TD-08: Empty `catch {}` blocks in runtime code
- **Severity**: LOW
- **Source**: Code inspection (subprocess.ts, token-tracker.ts, server.ts)
- **Description**: Several bare `catch {}` or `catch { /* silent */ }` blocks swallow errors without logging. subprocess.ts has 4 such blocks (JSON parse fallbacks), token-tracker.ts has 1 (log file write), server.ts has 2 (validation and import resolution). While each is individually justified (graceful degradation), the pattern makes debugging harder.
- **Impact**: Silent failures in edge cases. Not a correctness issue for happy paths.
- **Recommendation**: Add optional verbose/debug logging behind a flag. Not a v3.3 priority.

---

## 2. Emerging Patterns

### Patterns to Formalize

- **ParseResult pattern (error accumulation + partial result)**: Parser.parse() now returns `{ program, errors }` where program is always non-null. This pattern should be considered for the resolver, which currently returns `{ program, errors }` with a similar shape. The lexer is the remaining throw-on-first component -- if lexer recovery is ever added, it should follow the same pattern (returning `{ tokens, errors }`).

- **ProgramIndex as universal lookup layer**: ProgramIndex (8 maps) is now threaded through every pipeline stage: ScopeChecker, TypeChecker, TokenEstimator, Executor, LSP features, and codegen. Any new pipeline stage or analysis pass should accept ProgramIndex rather than raw Program. The pattern is established: optional parameter with `?? new ProgramIndex(program)` fallback.

- **DIRECT tier as default implementation mode**: v3.2 used DIRECT for 2 of 4 rounds (R2, R3), MEDIUM for 1 (R1), and TEST-ONLY for 1 (R4). Combined with v3.1's results (3 DIRECT, 1 MEDIUM, 1 TEST-ONLY), DIRECT has been validated across 11 consecutive rounds with 100% first-try pass rate. The process has naturally converged: debate is reserved for foundational changes (parser recovery, new subsystems).

- **Merged Step 3+4 as permanent default**: Every round since v3.1-R1 has merged convergence and implementation into a single agent call. Zero context-loss issues observed. The old 2-step process (separate convergence document, then implementation) can be formally deprecated.

- **Sub-path exports pattern**: package.json now has 6 sub-path exports (`.`, `./ast`, `./compiler`, `./runtime`, `./types`, `./format`). Each maps to a single source file. When adding new public API surfaces, follow this pattern: one source file per export, no barrel re-exports except src/types.ts.

### Patterns to Monitor

- **LSP feature handler proliferation**: Each new LSP capability (diagnostics, hover, definition, completions, keyword hover, import completions, storage completions) adds a new code path in features.ts or server.ts. If code actions are added, this will be 5+ handler types. Consider a handler registry or feature module pattern if growth continues.

- **Ratchet accumulation**: 180 ratchets across 3 major versions. Most are implementation decisions that will never need revisiting (e.g., "Parser(Token[]) constructor", "ESM modules"). The ratchet list in common_memory.md is now 200+ lines. Consider archiving pre-v2.0 ratchets as "foundation decisions" to reduce scanning overhead for future convergence agents.

---

## 3. Ratchet Review

### Candidates for Revisiting

- **[v2.0-R04] storage param optional, defaults to 'file'; file parsed as identifier**: If a second storage type is added (e.g., `redis`, `sqlite`), this ratchet is fine. But if storage types need structured configuration (e.g., `storage: file(path: "/tmp/data")`), the "parsed as identifier" constraint would need unlocking. Not urgent -- `file` is the only storage type and no others are planned.

- **[v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded**: This blocks R-01 (memory importability). The ratchet was correct at the time (memories are file-bound state), but shared memory patterns (counters, configuration) are a legitimate use case. Unlock if v3.3 includes memory importability.

- **[T4] LL(1)+LL(2)**: The parser is now effectively LL(k) in places -- parseTypeOrInlineStruct() does a 2-token lookahead (Identifier followed by LBrace), and the error recovery synchronize() scans forward arbitrarily. The "LL(1)+LL(2)" label is slightly outdated but not blocking anything.

### Ratchets Confirmed Still Valid

All 180 ratchets were reviewed. No ratchets are actively blocking v3.3 feature work unless memory importability (R-01) is in scope, which would require unlocking v2.0-R13. The v3.2 ratchets (R01-R07) are all sound engineering decisions with no signs of premature lock-in.

---

## 4. Edge Cases & Gaps

### Parser Recovery

- **Cascading errors from recovery misalignment**: If synchronize() skips past the intended recovery point (e.g., a closing brace of a nested struct is mistaken for a declaration-level brace), subsequent declarations may parse incorrectly, producing misleading secondary errors. The MAX_ERRORS=25 limit caps damage, and the "program always non-null" invariant prevents crashes, but users may see confusing error messages after the first real error.

- **Error recovery in import declarations**: If an import statement has a syntax error, the parser records the error and synchronizes. However, the import path is not recorded (the import was never completed), so downstream import resolution runs with the remaining valid imports. The skipped import does not produce a "missing import" scope error -- the user only sees the parse error. This is correct behavior but could be surprising if the user expects both errors.

- **No recovery inside field lists**: If a field declaration has a type error (e.g., `field: UnknownType`), the entire enclosing declaration (context/node/memory) is dropped from the partial program. There is no field-level recovery. This is by design (v3.2-R03: "inner parseX functions keep throwing") but means a single bad field discards the entire declaration.

### LSP

- **No code actions (quick fixes)**: The highest-value missing LSP feature. When SCOPE_UNDEFINED_REF fires for a name that exists in an importable file, the user must manually add the import. Auto-import would leverage the existing resolver infrastructure.

- **No rename support**: Renaming a context or node requires manual find-and-replace across all files. The ProgramIndex already tracks all references -- rename would be a matter of collecting locations.

- **No document symbols / workspace symbols**: The LSP provides no outline view. Contexts, nodes, memories, and graphs are not surfaced as document symbols.

- **Completion trigger characters may miss some contexts**: Trigger characters are `.`, `[`, `{`. Completions after `model:` or `on_failure:` rely on typing the colon and then a character, at which point the trigger fires via general keystroke (not trigger character). This works but depends on client behavior.

### Runtime

- **Conditional edge routing not implemented**: Conditional edges parse and analyze correctly but are ignored at runtime (flow-runner.ts only handles direct node references in the flow). The scope checker warns about transforms on conditional edges (SCOPE_TRANSFORM_CONDITIONAL) but the runtime gap is the real issue.

- **Foreach source failure handling**: If the source node of a foreach produces output that is not iterable (null, non-array), the runtime behavior is unspecified. The scope checker warns (E-02) but the executor may throw an unhandled error.

- **Synchronous file I/O in executor**: All file operations (storeOutput, loadMemory, saveMemory) use synchronous fs methods. In parallel execution, one branch's file write blocks all others. This is the primary runtime performance bottleneck.

---

## 5. Feature Priority Ranking

Ranked by user impact weighted against implementation complexity.

| Rank | Feature | Complexity | Impact | Notes |
|------|---------|-----------|--------|-------|
| 1 | LSP code actions (auto-import, quick fixes) | MEDIUM | HIGH | Leverages existing ProgramIndex + resolver. Highest-value LSP improvement. EP-02. |
| 2 | Conditional edge routing in runtime | MEDIUM | MEDIUM | Completes a feature partially implemented since v1.3. Parser + analyzer + codegen already handle it. R-05. |
| 3 | LSP document symbols / outline | LOW | MEDIUM | ProgramIndex already has all the data. 30-50 lines of new code. Standard LSP feature users expect. |
| 4 | Condition type compatibility validation | LOW | MEDIUM | `>=` on String fields is silently accepted. 20-30 lines in TypeChecker. TD-06 (deferred since v1.0). |
| 5 | LSP rename support | MEDIUM | MEDIUM | ProgramIndex tracks locations. Cross-file rename needs import-aware location collection. |
| 6 | Memory importability | HIGH | LOW-MEDIUM | Requires unlocking v2.0-R13, parser + resolver + scope changes. Real use cases exist but are not blocking current users. R-01. |
| 7 | Async file I/O in executor | MEDIUM | LOW | LLM subprocess latency dominates (minutes vs milliseconds for file I/O). Impact only matters for parallel execution of many nodes. R-02. |
| 8 | Second codegen backend | MEDIUM | LOW | Interface validated. No user demand reported. R-08. |
| 9 | Source maps for runtime errors | HIGH | LOW | Substantial implementation effort for modest debugging improvement. X-03. |
| 10 | Multi-file workspace/project support | HIGH | LOW | Major feature requiring LSP workspace folders, project config file, etc. X-04. |

---

## 6. Recommendation for v3.3 Scope

### Recommended scope: LSP code actions + conditional edge routing + small LSP improvements

**Rationale**: v3.2 completed the parser error recovery and LSP polish that were the main DX pain points. v3.3 should continue the LSP maturation trajectory with code actions (the highest remaining LSP value) while filling the runtime gap in conditional edge routing. Small additions (document symbols, condition type validation) round out the version with low-risk, high-impact improvements.

**Proposed rounds**:

| Round | Feature | Tier | Est. Agent Calls |
|-------|---------|------|-----------------|
| R1 | LSP code actions (auto-import for SCOPE_UNDEFINED_REF, add missing field) | MEDIUM | 4 |
| R2 | Conditional edge routing in runtime | MEDIUM | 4 |
| R3 | LSP document symbols + condition type validation | DIRECT | 2 |
| R4 | Integration + regression tests | TEST-ONLY | 2 |
| **Total** | | | **~12** |

**Ratchet unlocks anticipated**: 0 (no existing ratchets block these features).

**Items explicitly deferred to v3.4+**:
- Memory importability (R-01) -- needs design discussion for scoping rules
- Async file I/O (R-02) -- LLM latency dominates
- Second backend (R-08) -- no user demand
- LSP rename support -- depends on code actions infrastructure from R1
- Source maps / workspace support -- major features needing dedicated versions

**Test target**: 582 existing + ~45 new = ~627 tests at v3.3 completion.
