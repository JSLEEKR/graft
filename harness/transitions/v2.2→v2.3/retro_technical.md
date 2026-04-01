# Technical Retrospective: Graft v2.2

## 1. Tech Debt Introduced or Deferred

### TD-01: ProgramIndex instantiated redundantly across pipeline stages

ProgramIndex is constructed independently in ScopeChecker (`src/analyzer/scope.ts:16`), TokenEstimator (`src/analyzer/estimator.ts:29`), Executor (`src/runtime/executor.ts:67`), LSP server (`src/lsp/server.ts:42`), `generateSettings` (`src/codegen/settings.ts:52`), and `generateOrchestration` (`src/codegen/orchestration.ts:9`). Each call does O(N) map construction over the same Program. The compile pipeline in `src/compiler.ts` could construct it once and thread it through, but currently does not. For v2.2's program sizes this is negligible, but multi-backend codegen (v3.0) will amplify it.

**Recommendation**: Construct ProgramIndex once in `compile()` and pass it as a parameter to ScopeChecker, TypeChecker, TokenEstimator, and generate(). This is a mechanical refactoring suitable for MEDIUM tier.

### TD-02: Duplicate field-set construction in ScopeChecker and TypeChecker

ScopeChecker builds `producesMap` (line 20) and `memoryFieldsMap` (line 11). TypeChecker independently builds `producesFieldsMap` (line 6) and `memoryFieldsMap` (line 7). These are identical data structures computed from the same Program. If ProgramIndex were extended with field-level maps (needed for v3.0 field-level writes), both checkers could share them.

**Recommendation**: Defer until v3.0 when field-level maps are needed. At that point, extend ProgramIndex with `producesFieldsMap` and `memoryFieldsMap`.

### TD-03: `report.nodes.find()` in orchestration.ts

`src/codegen/orchestration.ts:71` and `:117` still use `report.nodes.find(n => n.name === ...)` for linear scans within `generateSteps`. This was missed during the R1 `.find()` elimination pass because it operates on `TokenReport.nodes` rather than `Program` arrays. Not high-impact (small arrays), but inconsistent with the ProgramIndex pattern.

**Recommendation**: Either add a `nodeReportMap` to TokenReport or build one locally in `generateSteps`.

### TD-04: LSP dependencies in main package

`vscode-languageserver` and `vscode-languageserver-textdocument` are production dependencies in `package.json` (lines 47-48). Every `npm install @graft-lang/graft` pulls in the full LSP server stack even when users only want the CLI compiler. The LSP server is a separate entry point (`bin.graft-lsp`).

**Recommendation**: Consider splitting the LSP into a separate package (`@graft-lang/graft-lsp`) or moving LSP deps to `optionalDependencies`. Alternatively, accept the weight if npm package size remains small (LSP deps are ~2MB).

### TD-05: Hardcoded model aliases in constants.ts

`MODEL_MAP` in `src/constants.ts:1-5` maps `sonnet`/`opus`/`haiku` to specific dated model versions. These will go stale as Anthropic releases new models. Currently requires a code change + version bump to update aliases.

**Recommendation**: For v3.0 multi-backend, MODEL_MAP should become configurable (e.g., via a config file or CLI flags). The current hardcoding is acceptable for single-backend but will not scale.

### TD-06: Conditional edge routing not implemented in runtime

Ratchet v2.2-R12 added a warning for transforms on conditional edges, but the runtime (`src/runtime/flow-runner.ts`) has no `case 'conditional'` in its FlowNode switch. Conditional edges are parsed and validated by the analyzer but never executed. This was deferred to v1.3 (common_memory line 195) and remains unimplemented.

**Recommendation**: Either implement conditional routing in v2.3 or document it explicitly as unsupported in the spec.

### TD-07: `formatType` duplicated conceptually with `typeToExample`

`src/lsp/features.ts:133-145` has `formatType` (returns human-readable type strings) while `src/utils.ts:11-38` has `typeToExample` (returns JSON example values). Both exhaustively switch over TypeExpr.kind. They serve different purposes but both must be updated when a new TypeExpr kind is added. No shared dispatch exists.

**Recommendation**: Accept the duplication. They produce fundamentally different outputs (string vs value). A shared visitor would add complexity without reducing error risk. However, consider adding a compile-time exhaustiveness test (TypeScript `never` check) to both switches to catch missing cases.

### TD-08: No `sourceFile` on MemoryDecl, EdgeDecl, or GraphDecl

v2.2-R3 added `sourceFile?: string` to ContextDecl and NodeDecl only. MemoryDecl, EdgeDecl, and GraphDecl lack it. The LSP go-to-definition for memory falls back to `currentUri` (`src/lsp/features.ts:112`). If memory importability is added (currently deferred per v2.0-R13), this will need to be extended.

**Recommendation**: Defer. Memory is not importable. Edges and graphs are local-only by design.

### TD-09: Token estimation magic numbers

`src/analyzer/estimator.ts` uses hardcoded heuristics: filter reduces ~50% (line 201), drop reduces ~15% (line 204), compact reduces ~30% (line 207). These are undocumented approximations with no empirical basis. `PARTIAL_FIELD_FACTOR` (0.3) is the only one extracted to constants.

**Recommendation**: Extract all estimation heuristics to `src/constants.ts` for visibility and tuning. Name them explicitly: `FILTER_REDUCTION_FACTOR`, `DROP_REDUCTION_FACTOR`, `COMPACT_REDUCTION_FACTOR`.

## 2. Patterns That Should Be Formalized

### PAT-01: Pure-function extraction for testability

v2.2-R2 established the pattern of extracting pure functions from classes for testing: `prompt-builder.ts` (pure functions) extracted from `executor.ts` (stateful class), `features.ts` (pure functions) extracted from `server.ts` (stateful). This pattern was applied twice in v2.2 and should be the default approach for new modules.

**Formalize**: When a class method has no `this` dependencies beyond constructor-injected data, extract it as a pure function in a companion `-builder` or `-features` file.

### PAT-02: ProgramIndex as shared lookup layer

Every pipeline stage that previously used `.find()` on Program arrays now goes through ProgramIndex maps. This is a clean separation: Program is the AST data structure, ProgramIndex is the query layer. Future stages should use ProgramIndex, never raw array scans.

**Formalize**: Pipeline stages receive ProgramIndex, not Program, for lookups. Program is for iteration only.

### PAT-03: Error code taxonomy

v2.2-R2 established the `NAMESPACE_SPECIFIC_ERROR` naming convention for GraftErrorCode (e.g., `SCOPE_DUPLICATE_NAME`, `IMPORT_CIRCULAR`, `BUDGET_EXCEEDED`). v2.2-R3 extended it consistently with `SCOPE_BINDING_COLLISION`, `TRANSFORM_ON_CONDITIONAL`, `GRAPH_MULTIPLE`. This taxonomy should continue for v3.0 error codes.

**Formalize**: New error codes must follow `NAMESPACE_SPECIFIC` format. Valid namespaces: SCOPE, TYPE, BUDGET, IMPORT, GRAPH, PARSE (future), RUNTIME (future), CODEGEN (future).

### PAT-04: Warning-vs-error severity as compiler gate

`src/compiler.ts:81-87` separates diagnostics by severity: errors block compilation, warnings pass through. This pattern was solidified in v2.1-R2 and v2.2-R3 (5 new warnings added). All new correctness checks should decide: is this an error (blocks compilation) or a warning (advisory)?

**Formalize**: Decision rule -- if the program can still compile and produce correct output, it is a warning. If the output would be incorrect or the program is structurally invalid, it is an error.

### PAT-05: LSP cache invalidation via compile-on-change

The LSP uses full document sync + compile-on-every-change (`src/lsp/server.ts:28-46`). This is simple but will not scale to large files or multi-file workspaces. The pattern of caching `{ program, index }` per URI works well for single-file but does not handle cross-file invalidation (e.g., editing an imported file should invalidate the importer).

**Formalize**: For v2.3, this is acceptable. For any future multi-file workspace features, the cache must support dependency-aware invalidation.

## 3. Ratchet Decisions to Revisit

### REVISIT-01: [v2.2-R05] TypeChecker NOT migrated to ProgramIndex

Locked because TypeChecker had zero `.find()` calls. However, TypeChecker builds its own `producesFieldsMap` and `memoryFieldsMap` (TD-02). If ProgramIndex is extended with field maps for v3.0, this ratchet should be unlocked to allow TypeChecker to use ProgramIndex instead of building its own maps.

**Trigger**: When ProgramIndex gains field-level maps.

### REVISIT-02: [v2.0-R13] Only ContextDecl and NodeDecl importable; edges, graphs, memories excluded

Memory importability was explicitly deferred. For v3.0 multi-field partial reads and field-level writes, shared memory schemas across files may become necessary. If multiple .gft files need to read/write the same memory, memory declarations must either be importable or duplicated.

**Trigger**: When the spec requires cross-file memory sharing.

### REVISIT-03: [v2.2-R04] ProgramIndex: no getter methods, direct map access

Direct map access is minimal and works today. However, for v3.0 multi-backend codegen, if ProgramIndex needs to provide backend-specific views (e.g., filtering nodes by model for different backends), getter methods or query methods may be needed.

**Trigger**: When multi-backend codegen requires filtered views over Program.

### REVISIT-04: [v2.1-R15] Budget enforcement advisory only; no hard abort

Token budget enforcement remains advisory (warnings only). The runtime tracks consumed tokens but never stops execution. For production use, some users may want hard budget limits.

**Trigger**: User feedback requesting hard budget enforcement.

### REVISIT-05: [v2.2-R10] Parser/lexer remain throw-based; error codes only on analyzer/resolver/compiler

Parser and lexer throw `GraftError` on first error. They do not use error codes. If error recovery or multi-error reporting is added to the parser, error codes will be needed there too.

**Trigger**: When parser error recovery is implemented.

## 4. Edge Cases and Failure Modes

### EC-01: LSP hover on keywords returns null

`getWordAtPosition` (`src/lsp/features.ts:38-54`) matches identifiers but keywords like `node`, `context`, `memory` are also identifiers syntactically. If a user hovers over the keyword `node` at the start of a node declaration, `getHoverInfo` tries to look up "node" in ProgramIndex and returns null. This is correct behavior but may confuse users expecting keyword documentation.

**Recommendation**: Consider adding keyword hover documentation in a future LSP enhancement.

### EC-02: Foreach binding shadows outputs map without cleanup

In `src/runtime/flow-runner.ts:69`, foreach sets `ctx.outputs.set(flowNode.binding, items[i])` for each iteration but never removes the binding after the loop completes. If a downstream node reads the binding name as a context reference, it will get the last iteration's value. This is arguably correct (binding should be scoped to loop body) but the binding leaks into the shared outputs map.

**Recommendation**: Save and restore the previous value of `flowNode.binding` in `ctx.outputs` after the foreach loop completes, or delete the entry.

### EC-03: Case-insensitive file path matching in output lookup

`src/runtime/executor.ts:140-145` matches final output by comparing `key.toLowerCase() === outputName` (case-insensitive). But `ctx.outputs` stores entries by exact name (case-sensitive, line 306-308). If a produces name has different casing than the graph output declaration, the lookup may fail on the exact match but succeed on the lowercase scan. This inconsistency could mask bugs.

**Recommendation**: Standardize on either case-sensitive or case-insensitive matching throughout the runtime.

### EC-04: LSP does not invalidate cache when imported files change

`src/lsp/server.ts` caches `{ program, index }` per URI and recompiles on `onDidChangeContent`. If file A imports file B, and B is edited, A's cache is not invalidated. The user sees stale diagnostics/hover for A until they trigger a change in A.

**Recommendation**: Track import dependencies via `resolvedFiles` from ResolveResult. On any file change, invalidate all URIs that import the changed file (transitively).

### EC-05: Memory file corruption during concurrent writes

`saveMemory` in `src/runtime/memory.ts:22-45` does read-modify-write on memory files without locking. If two parallel nodes write to the same memory (warned by SCOPE_PARALLEL_WRITES but not prevented), one write can overwrite the other's changes. The analyzer warns but the runtime does not enforce.

**Recommendation**: For v2.3, consider implementing file-level locking or sequentializing writes to the same memory file. Alternatively, if SCOPE_PARALLEL_WRITES is upgraded from warning to error, the race condition becomes impossible.

### EC-06: `extractJson` fallback is overly aggressive

`src/runtime/subprocess.ts:92-106` tries to extract JSON by finding first/last brace or bracket. If Claude's output contains explanatory text with embedded JSON-like content (e.g., `The result is {"foo": 1} but not {"bar": 2}`), it would extract `{"foo": 1} but not {"bar": 2}` which fails to parse. The fallback then tries bracket extraction. This heuristic is fragile.

**Recommendation**: Since v2.1-R17 switched to `--output-format json`, the CLI envelope should always be valid JSON. The fallback is a safety net for malformed output. Consider logging a warning when the fallback is triggered, to distinguish expected JSON from heuristic extraction.

### EC-07: No validation of `on_failure.node` reference

The parser accepts `on_failure: fallback(SomeNode)` but neither the parser nor analyzer validates that `SomeNode` is a declared node. The ScopeChecker checks edge targets, foreach sources, and graph I/O, but does not check fallback node references in `FailureStrategy`.

**Recommendation**: Add a `checkFailureStrategies` method to ScopeChecker that validates fallback node references exist in `nodeNames`.

### EC-08: Graph output can reference a node that is not in the flow

The graph output is validated as a produces type (`src/analyzer/scope.ts:232-238`) but there is no check that the node producing that output is actually reachable in the graph's flow. A graph could declare `output: SomeProduces` where the producing node is not in the flow, resulting in null final output at runtime.

**Recommendation**: Add a reachability check in `checkGraphFlow` that verifies the output produces type is generated by a node in the flow.

## 5. Performance and Quality Issues

### PQ-01: Full document reparse on every keystroke (LSP)

The LSP uses `TextDocumentSyncKind.Full` (`src/lsp/server.ts:23`) and recompiles the entire file on every change. For small .gft files (typical: <200 lines), this is fine. For large files or slow machines, this could cause lag. There is no debouncing.

**Recommendation**: Add a debounce timer (e.g., 200ms) in `onDidChangeContent` to batch rapid keystrokes. Alternatively, switch to incremental sync if the parser supports partial re-parsing (it does not currently).

### PQ-02: Synchronous file I/O throughout the runtime

`src/runtime/executor.ts`, `src/runtime/memory.ts`, and `src/codegen/codegen.ts` use synchronous `fs.readFileSync`/`fs.writeFileSync`/`fs.existsSync`. During execution, memory loads and saves block the event loop. For single-node execution this is fine, but parallel node execution (`Promise.allSettled` in `flow-runner.ts:35`) could benefit from async I/O.

**Recommendation**: Defer. The bottleneck is Claude CLI subprocess time (seconds), not file I/O (microseconds). Async I/O would add complexity for negligible gain.

### PQ-03: No caching of lexer/parser results for imported files

The resolver (`src/resolver/resolver.ts:116-148`) parses each imported file from scratch every time `resolve()` is called (once per compile). The `exportCache` only caches exportable names, not the parsed Program. If the same file is compiled multiple times (e.g., in the LSP), the imported file is re-lexed and re-parsed each time.

**Recommendation**: For LSP, cache parsed Programs for imported files by file path + mtime. For CLI compilation, the current behavior is acceptable (single compile per invocation).

### PQ-04: Test suite has no performance benchmarks

376 tests cover correctness but none measure performance. There are no regression tests for compile time, memory usage, or LSP response latency. The `bench` script in `package.json:38` references `benchmarks/run.ts` which does not exist.

**Recommendation**: Either create `benchmarks/run.ts` or remove the dead script entry. For v2.3, consider adding a simple compile-time benchmark (e.g., compile examples/chatbot.gft 1000 times, assert < 1s).

### PQ-05: Diagnostic range is zero-width in LSP

`makeDiagnostic` in `src/lsp/features.ts:21-33` sets `start` and `end` to the same position (zero-width range). This means error squiggles in the editor are invisible or appear as a single point. Better UX would be to span the full token or identifier that caused the error.

**Recommendation**: Extend `SourceLocation` with an optional `length` field, or use the error code to infer the diagnostic range (e.g., for `SCOPE_UNDEFINED_REF`, underline the identifier name).

## 6. Extension Points Needed for v3.0 Roadmap

### EXT-01: Multi-backend codegen architecture

Currently `src/codegen/codegen.ts:15` hardcodes Claude Code output: `.claude/agents/`, `.claude/hooks/`, `.claude/CLAUDE.md`, `.claude/settings.json`. For v3.0 multi-backend, `generate()` needs a backend abstraction:

```
interface CodegenBackend {
  generateAgent(node: NodeDecl, memoryNames: Set<string>): GeneratedFile;
  generateHook(edge: EdgeDecl): GeneratedFile | null;
  generateOrchestration(program: Program, report: TokenReport): GeneratedFile;
  generateSettings(program: Program, sourceFile: string): GeneratedFile;
}
```

The current `generate()` function would become `ClaudeCodeBackend implements CodegenBackend`. New backends (e.g., OpenAI Agents, local LLM) would implement the same interface.

**Files to modify**: `src/codegen/codegen.ts`, `src/codegen/agents.ts`, `src/codegen/hooks.ts`, `src/codegen/orchestration.ts`, `src/codegen/settings.ts`.

### EXT-02: Field-level writes (v3.0 roadmap item)

Currently `saveMemory` (`src/runtime/memory.ts:22-45`) does field-matching merge: it overwrites memory fields that appear in the node output. This is already field-level in practice, but the language only allows `writes: [MemoryName]` -- you write to the entire memory, and the runtime merges by field.

For v3.0, the spec calls for `writes: [Memory.field1, Memory.field2]` syntax to declare which specific fields a node writes. This requires:
1. **Parser**: `writes` clause accepts dotted field references (not just names).
2. **AST**: `NodeDecl.writes` changes from `string[]` to `WriteRef[]` (similar to `ContextRef` for reads).
3. **Analyzer**: ScopeChecker validates that written fields exist in the target memory.
4. **Runtime**: `saveMemory` only merges the declared fields, not all matching fields.
5. **TypeChecker**: `checkWritesSchemaOverlap` checks per-field instead of any-field overlap.

**Impact**: Touches parser, AST, analyzer (scope + type), codegen (agents), and runtime (memory). HIGH complexity.

### EXT-03: Multi-field partial reads (v3.0 roadmap item)

Currently reads support single-field partial reads: `reads: [Context.field]`. The v3.0 spec calls for multi-field: `reads: [Context.{field1, field2}]`. This requires:
1. **Lexer**: No change (braces already tokenized).
2. **Parser**: `parseReads` must handle `{field1, field2}` syntax after dot.
3. **AST**: `ContextRef.field` changes from `string | undefined` to `string[] | undefined`.
4. **Analyzer**: ScopeChecker validates each field in the list.
5. **Estimator**: Input estimation uses `PARTIAL_FIELD_FACTOR * fieldCount` instead of `PARTIAL_FIELD_FACTOR * 1`.
6. **Runtime**: `resolveField` in prompt-builder needs to handle multi-field extraction.
7. **LSP**: Hover info for reads should display multi-field references.

**Impact**: Touches parser, AST, analyzer, estimator, runtime, and LSP. HIGH complexity.

### EXT-04: Backend-specific model mapping

`MODEL_MAP` in `src/constants.ts` is Claude-specific. Multi-backend codegen needs per-backend model maps. The runtime also uses `MODEL_MAP` in `src/runtime/executor.ts:223` to resolve model names for subprocess spawning.

**Recommendation**: Move model resolution to the backend interface. Each backend provides its own model map. The runtime uses the backend's resolver.

### EXT-05: Pluggable spawner for multi-backend runtime

`src/runtime/executor.ts` already supports `SpawnerFn` injection (ratchet v1.2-R08). For multi-backend, the spawner needs to vary by backend (Claude CLI vs OpenAI API vs local LLM). The current `SpawnOptions` interface is CLI-specific (args, cwd, timeoutMs).

**Recommendation**: Abstract `SpawnOptions` to a backend-agnostic `InferenceRequest` interface. Each backend implements its own spawner that translates the request to its API format.

### EXT-06: LSP completion provider

The LSP currently supports hover and go-to-definition. For a production-quality editing experience, auto-completion is essential. Completion candidates would come from:
- Keywords (from `KEYWORDS` map in `src/lexer/tokens.ts`)
- Declared names (from ProgramIndex maps)
- Field names (from context/produces/memory field lists)
- Model aliases (from MODEL_MAP)

**Recommendation**: Add `completionProvider: true` to server capabilities and implement `onCompletion` handler using ProgramIndex lookups.

### EXT-07: Diagnostic range tracking (needed for LSP quality)

As noted in PQ-05, SourceLocation is point-only (line, column, offset). For proper LSP diagnostics, completion, and rename support, ranges (start + end) are needed. This is foundational for all future LSP features.

**Recommendation**: Extend SourceLocation to include `endLine`, `endColumn`, `endOffset` (or a separate `SourceRange` type). This is a pervasive change that touches the lexer, parser, and all AST nodes. Should be done early in v2.3 before other LSP features depend on it.

## Summary Table

| ID | Category | Priority | Complexity | v3.0 Blocker? |
|----|----------|----------|------------|---------------|
| TD-01 | Tech Debt | Medium | LOW | No |
| TD-02 | Tech Debt | Low | LOW | Yes (when field maps needed) |
| TD-03 | Tech Debt | Low | LOW | No |
| TD-04 | Tech Debt | Medium | MEDIUM | No |
| TD-05 | Tech Debt | Medium | MEDIUM | Yes (multi-backend) |
| TD-06 | Tech Debt | Medium | HIGH | No |
| TD-07 | Tech Debt | Low | LOW | No |
| TD-08 | Tech Debt | Low | LOW | No (until memory import) |
| TD-09 | Tech Debt | Low | LOW | No |
| EC-01 | Edge Case | Low | LOW | No |
| EC-02 | Edge Case | Medium | LOW | No |
| EC-03 | Edge Case | Low | LOW | No |
| EC-04 | Edge Case | High | MEDIUM | No |
| EC-05 | Edge Case | Medium | MEDIUM | No |
| EC-06 | Edge Case | Low | LOW | No |
| EC-07 | Edge Case | Medium | LOW | No |
| EC-08 | Edge Case | Medium | LOW | No |
| PQ-01 | Performance | Low | LOW | No |
| PQ-02 | Performance | Low | LOW | No |
| PQ-03 | Performance | Medium | MEDIUM | No |
| PQ-04 | Quality | Medium | LOW | No |
| PQ-05 | Quality | High | MEDIUM | No |
| EXT-01 | Extension | Critical | HIGH | Yes |
| EXT-02 | Extension | Critical | HIGH | Yes |
| EXT-03 | Extension | Critical | HIGH | Yes |
| EXT-04 | Extension | High | MEDIUM | Yes |
| EXT-05 | Extension | High | MEDIUM | Yes |
| EXT-06 | Extension | Medium | MEDIUM | No |
| EXT-07 | Extension | High | HIGH | No (but needed for LSP quality) |
