# Design Retrospective -- v2.2

## Summary

v2.2 spanned 6 rounds (R1-R6) covering tech debt elimination, executor decomposition, correctness warnings, LSP server, npm distribution, and integration testing. It was architecturally the most complex version to date, introducing a new domain (LSP) while simultaneously restructuring core subsystems (ProgramIndex, prompt-builder, flow-runner). This retrospective evaluates which design decisions worked well, which caused friction, and what extension points v3.0 needs.

---

## 1. Did any design choice cause unexpected friction in later rounds?

### RD-01: GRAPH_MISSING return path lacked `program` -- friction from R1 through R4

**Files**: `src/compiler.ts:65-72`, `src/lsp/server.ts:37-43`

The decision in R1 to eliminate double-parse (v2.2-R01 ratchet) changed `resolve()` to accept a `Program` object, and the `CompileResult` interface was updated to include `program?: Program`. However, the GRAPH_MISSING early return path at `compiler.ts:65` originally did not include `program` in its return value. This was not discovered until R4, when A3-Skeptic identified that library files (which have no graph) would produce a `CompileResult` with `program === undefined`, making LSP hover and go-to-definition impossible for library files.

The fix was trivial (adding `program` to the return object), but the bug survived three rounds (R1, R2, R3) because those rounds never exercised the GRAPH_MISSING path with LSP in mind. This is a classic example of an early abstraction boundary (CompileResult) being designed without anticipating a downstream consumer (LSP cache).

**Lesson**: When modifying a public return type, audit all early-return paths. The GRAPH_MISSING path was the only one that omitted `program` -- all other error returns already included it.

**Severity**: Medium. The fix was one line, but it blocked a core LSP feature for library files.

### RD-02: `formatType` vs `typeToExample` duplication -- latent but not yet painful

**Files**: `src/lsp/features.ts:133-145`, `src/utils.ts` (typeToExample)

The v2.2-R21 ratchet explicitly states that `formatType` is "distinct from `typeToExample`." Both functions switch over `TypeExpr.kind` but produce different output formats (human-readable strings vs JSON example values). This is currently correct -- they serve different purposes. However, both must be updated whenever a new `TypeExpr.kind` is added (v3.0 may add new types for field-level writes). The exhaustive switch pattern protects against forgetting either function (TypeScript reports `never` violations), but having two parallel switches is a maintenance smell.

**No friction yet**, but flagged for v3.0 monitoring.

### RD-03: Cross-critique was never triggered in v2.2

All six rounds had score ranges of 0 or 1, below the R-PROC-01 threshold of 2. This means the forced dissenter mechanism was never exercised in v2.2. For R4 (HIGH tier, 4 agents), A3-Skeptic still found the GRAPH_MISSING bug through independent analysis, not through cross-critique. The process worked despite the skipped step, but the score-gating threshold may be too high for rounds where agents have high domain familiarity.

**This is a process finding, not a design finding**, but it has design implications: the forced dissenter self-rebuttal mechanism, which caught real bugs in v2.0 (e.g., transitive re-export), was dormant throughout v2.2.

---

## 2. Are there abstraction boundaries that should shift?

### RD-04: ProgramIndex is underused -- codegen still uses Array.find()

**Files**: `src/codegen/orchestration.ts:71,117`, `src/program-index.ts`

The R1 convergence explicitly migrated `scope.ts`, `estimator.ts`, `executor.ts`, and `codegen/settings.ts` to ProgramIndex. However, `orchestration.ts` retained two `report.nodes.find()` calls (lines 71 and 117) that search `TokenReport.nodes` by name. These are not `Program`-level `.find()` calls (they search the `TokenReport`, not the `Program`), but they reveal a missing abstraction: there is no `TokenReportIndex` or equivalent map for O(1) report lookups.

In v2.2, `orchestration.ts` receives a `nodeMap: Map<string, NodeDecl>` parameter (line 60) for declaration lookups, but still does linear search on `report.nodes`. For programs with many nodes (v3.0 multi-graph), this will become a performance concern.

**Recommendation**: Either add a `nodeReportMap: Map<string, NodeReport>` to `TokenReport`, or have `TokenEstimator` return it alongside the array. This is a natural extension of the ProgramIndex pattern.

### RD-05: PromptContext and FlowContext are structurally similar but disconnected

**Files**: `src/runtime/prompt-builder.ts:4-8`, `src/runtime/flow-runner.ts:5-9`

Both interfaces contain `outputs: Map<string, unknown>` and `input: Record<string, unknown>`. The executor constructs both from the same data (see `executor.ts:124-128` for FlowContext, and the PromptContext construction inside `executeNode`). These could share a common base interface (e.g., `RuntimeContext`) that both extend, reducing the coupling between executor and its delegates.

Currently this is not causing bugs, but when v3.0 adds failure strategies (retry/fallback/skip), the FlowContext will need additional fields (retry count, fallback targets), and having a clear shared base will prevent duplication.

**Recommendation**: Extract a `RuntimeState` interface containing `outputs` and `input`, and have both `PromptContext` and `FlowContext` extend it.

### RD-06: LSP server.ts has a hard dependency on compile() -- no incremental path

**Files**: `src/lsp/server.ts:34`, `src/compiler.ts:21`

The LSP server calls `compile(doc.getText(), filePath)` on every `didChangeContent` event (v2.2-R19 ratchet: full document sync, compile-on-change). This means every keystroke triggers a full lex-parse-resolve-analyze-generate cycle. For small `.gft` files this is fine, but as programs grow (especially with imports), the latency will become noticeable.

The current architecture provides no incremental path: `compile()` is monolithic and stateless. The LSP caches the `Program` and `ProgramIndex` per URI, but the cache is only used for hover/definition -- diagnostics are always recomputed from scratch.

**Recommendation for v3.0**: Consider splitting `compile()` into `parse()` + `analyze()` stages that the LSP can call independently. When only the current file changes, the LSP could reparse the current file and reuse cached `Program` objects for imported files. This requires the resolver to support partial re-resolution.

### RD-07: Executor still constructs ProgramIndex independently from compiler

**Files**: `src/compiler.ts:75-94` (constructs ScopeChecker/TypeChecker/TokenEstimator), `src/runtime/executor.ts:67`

Both the compiler and the executor construct their own `ProgramIndex` from the same `Program`. The compiler creates three analyzers (each may or may not create its own ProgramIndex internally), and the executor creates another. In a `graft run` flow, the program is compiled and then executed, meaning ProgramIndex is constructed at least twice for the same program.

This is not a performance problem today (ProgramIndex construction is O(n) over declarations, which is trivially fast), but it signals that ProgramIndex should be part of `CompileResult` or passed through the pipeline rather than reconstructed at each stage.

---

## 3. What extension points are needed for the v3.0 roadmap?

### RD-08: Field-level writes require PromptContext/FlowContext awareness

**v3.0 roadmap item**: Field-level writes, multi-field partial reads

Currently, `prompt-builder.ts` reads from `outputs` as whole objects (`ctx.outputs.get(ref.context)`) and `resolveField` does single-field extraction. For field-level writes, the runtime needs to:
1. Track which fields of a memory were written by which node
2. Merge field-level writes during `saveMemory` (currently `memory.ts` does full-object merge)
3. Support partial reads that only extract specific fields

The `resolveField` function in `prompt-builder.ts:10-13` already does single-field resolution, but the write path in `executor.ts` currently saves entire objects. The `saveMemory` function in `memory.ts` does field-matching merge (v2.0-R26 ratchet), which is the right foundation, but needs to be extended to track provenance (which node wrote which field).

**Extension point needed**: `saveMemory` needs a `fields?: string[]` parameter to specify which fields to write (vs current whole-object merge). `PromptContext.outputs` needs metadata about which fields are available for each source.

### RD-09: Failure strategies need FlowContext extension

**v3.0 roadmap item**: Failure strategies (retry/fallback/skip)

The current `flow-runner.ts:18` aborts on any error (`if (errors.length > 0) break`). The v1.2-R07 ratchet locks this as "abort-on-failure MVP." To implement retry/fallback/skip in v3.0:

1. `FlowContext` needs: `onFailure: 'abort' | 'retry' | 'fallback' | 'skip'` per node or per graph
2. `executeFlowNodes` needs a retry loop wrapping `ctx.executeNode()`
3. Fallback requires an alternative node name, which the AST already supports (`on_failure` keyword is lexed but not parsed into FlowNode)

The `FlowContext.executeNode` callback signature (`(name: string) => Promise<NodeResult>`) is sufficient for retry (just call again) but not for fallback (needs a different name). The callback should probably accept a `NodeExecutionOptions` object.

**Extension point needed**: `FlowContext.executeNode` signature change, `FlowNode` AST extension for `on_failure` clause, `executeFlowNodes` retry/skip logic.

### RD-10: Multi-graph support needs ProgramIndex.graphMap

**v3.0 roadmap item**: Multi-graph support or graph selection

`ProgramIndex` currently has no `graphMap` (the spec mentioned it but the converged implementation at R1 excluded it -- graphs were trivial with only one supported). The R3 `GRAPH_MULTIPLE` warning explicitly states "only the first graph will be executed." For v3.0 multi-graph support:

1. `ProgramIndex` needs `graphMap: Map<string, GraphDecl>` (was in spec Section 4.4 but not implemented)
2. The `graft run` CLI needs a `--graph` flag to select which graph to execute
3. The executor needs to accept a graph name parameter
4. LSP hover should show graph details (input, output, flow structure)

**Extension point needed**: Add `graphMap` to ProgramIndex constructor. Modify `Executor.execute()` to accept an optional graph name.

### RD-11: LSP needs completion provider for v3.0 IDE experience

**Deferred from v2.2 spec (line 497)**: "LSP completions (autocomplete for identifiers) -- potential v2.3 addition"

The current LSP architecture (pure functions in `features.ts`, ProgramIndex for lookups) is well-positioned for completions. A `getCompletions(word: string, position, index: ProgramIndex)` function would follow the same pattern as `getHoverInfo`. The extension point already exists in the architecture -- it just needs a `completionProvider: true` capability and an `onCompletion` handler in `server.ts`.

### RD-12: GraftErrorCode needs namespace expansion strategy for v3.0

The current 21 error codes are organized by subsystem prefix (SCOPE_, TYPE_, BUDGET_, IMPORT_, GRAPH_). v3.0 will need:
- `RUNTIME_*` codes for failure strategies (RUNTIME_RETRY_EXHAUSTED, RUNTIME_FALLBACK_FAILED)
- `MEMORY_*` codes for memory-specific errors (MEMORY_RACE_CONDITION, MEMORY_CORRUPT)
- `CONFIG_*` codes for multi-backend configuration errors

The current flat union type in `diagnostics.ts:7-34` will grow unwieldy. Consider grouping by namespace in v3.0 (see RD-15 for detailed analysis).

---

## 4. How well did the LSP architecture integrate with existing compiler pipeline?

### RD-13: Integration was clean, with one significant gap (GRAPH_MISSING)

The LSP architecture integrated well due to three design choices:
1. **ProgramIndex** (R1) provided O(1) lookups that both analyzers and LSP features use
2. **sourceFile tracking** (R3) on ContextDecl/NodeDecl enabled cross-file go-to-definition
3. **GraftErrorCode** (R2) enabled the LSP to filter diagnostics by code (GRAPH_MISSING filtering at `server.ts:37`)

The one integration gap was the GRAPH_MISSING issue (RD-01 above). The fix pattern -- returning `program` even on error -- is sound and should be a design rule going forward: `CompileResult.program` should always be populated after successful parsing, regardless of downstream analysis failures.

The 2-file LSP structure (v2.2-R16 ratchet) kept all testable logic in `features.ts` as pure functions, making it possible to test LSP features without running an actual LSP server. This was validated by 22 unit tests and 2 integration tests.

**Quantitative assessment**: 22 LSP-specific tests, 0 bugs in LSP features post-implementation, 1 bug in the pipeline (GRAPH_MISSING) caught during LSP design. The LSP did not require any changes to the lexer, parser, resolver, or analyzer -- it consumed existing outputs cleanly.

### RD-14: compile() as the LSP entry point is simple but not optimal

The LSP calls `compile()` which runs the full pipeline including code generation (`generate()`). The LSP does not need generated files -- it only needs the `Program`, diagnostics, and warnings. Running code generation on every keystroke is wasted work.

**Current impact**: Minimal. Code generation is fast for small programs. But this violates separation of concerns -- the LSP should not trigger side-effect-prone operations (file generation) even if the results are discarded.

**Recommendation**: Split `compile()` into `compileToProgram()` (lex, parse, resolve, analyze) and `compileAndGenerate()` (adds codegen). The LSP calls `compileToProgram()`. This aligns with the incremental compilation recommendation in RD-06.

---

## 5. Did ProgramIndex eliminate all hot-path Array.find() calls as intended?

### RD-15: ProgramIndex eliminated all Program-level .find() calls; 3 remain elsewhere

**Eliminated** (R1 convergence report, verified in source):
- `src/analyzer/scope.ts` -- replaced `program.contexts.find()` and `program.nodes.find()` with `index.contextMap.get()` and `index.nodeMap.get()`
- `src/analyzer/estimator.ts` -- replaced `program.contexts.find()`, `program.memories.find()`, `program.nodes.find()` with ProgramIndex lookups
- `src/runtime/executor.ts` -- replaced `program.memories.find()` with `index.memoryMap.get()`
- `src/codegen/settings.ts` -- replaced `program.nodes.find()` with `index.nodeMap.get()`

**Remaining .find() calls** (3 total):

| File | Line | Target | Hot path? |
|------|------|--------|-----------|
| `src/codegen/orchestration.ts` | 71 | `report.nodes.find(n => n.name === step.name)` | No (codegen, not runtime) |
| `src/codegen/orchestration.ts` | 117 | `report.nodes.find(n => n.name === branchName)` | No (codegen, not runtime) |
| `src/runtime/executor.ts` | 148 | `[...nodeResults].reverse().find(r => r.success)` | Low (once per execution, after all nodes complete) |

The two `orchestration.ts` calls search `TokenReport.nodes`, not `Program` arrays. These are codegen-time operations (run once during compilation), not runtime hot paths. The `executor.ts` call at line 148 searches `nodeResults` (a small array) once at the end of execution to determine final output.

**Verdict**: ProgramIndex achieved its goal. All hot-path `Program`-level `.find()` calls are eliminated. The remaining calls are either in cold paths (codegen) or operate on different data structures (TokenReport, NodeResult[]). No further ProgramIndex migration is needed unless v3.0 introduces performance-sensitive codegen paths.

---

## 6. Are GraftErrorCode values well-organized for future expansion?

### RD-16: Current organization is sound but will need restructuring in v3.0

The 21 error codes follow a consistent `CATEGORY_SPECIFIC` naming pattern:

```
SCOPE_*          (7 codes) -- scope checker errors/warnings
TYPE_*           (2 codes) -- type checker errors
BUDGET_*         (2 codes) -- token estimator warnings
IMPORT_*         (6 codes) -- resolver errors
GRAPH_*          (2 codes) -- graph-level errors/warnings
SCOPE_BINDING_*  (1 code)  -- foreach-specific scope warning
TRANSFORM_*      (1 code)  -- edge-specific warning
```

**Strengths**:
- Prefix grouping makes it easy to filter by subsystem (LSP uses `e.code !== 'GRAPH_MISSING'`)
- The optional `code` field (4th param on GraftError) maintains backward compatibility
- All 34 diagnostic call sites have codes assigned (v2.2-R09 ratchet)

**Issues for v3.0 expansion**:

1. **TRANSFORM_ON_CONDITIONAL breaks the prefix convention**: It does not start with a subsystem prefix. It should be `SCOPE_TRANSFORM_CONDITIONAL` or `EDGE_TRANSFORM_CONDITIONAL` to maintain consistency. This was the only code added in R3 that deviated from the pattern (the other R3 additions, `GRAPH_MULTIPLE` and `SCOPE_BINDING_COLLISION`, follow it).

2. **No PARSE_ or LEX_ codes**: The v2.2-R10 ratchet explicitly states "Parser/lexer remain throw-based; error codes only on analyzer/resolver/compiler." If v3.0 wants to provide structured diagnostics for parse errors (e.g., for LSP squiggly underlines on syntax errors), codes like `PARSE_UNEXPECTED_TOKEN`, `PARSE_MISSING_FIELD`, `LEX_INVALID_TOKEN` will need to be added. The parser currently throws `GraftError` with location but no code, so the infrastructure exists -- just the codes are missing.

3. **Flat union type will become unwieldy**: At 21 members, the union is manageable. v3.0 could add 10-15 more codes (RUNTIME_*, MEMORY_*, PARSE_*, CONFIG_*), pushing it to 35+. At that point, consider organizing as:
   ```typescript
   type ScopeErrorCode = 'SCOPE_DUPLICATE_NAME' | 'SCOPE_UNDEFINED_REF' | ...;
   type ImportErrorCode = 'IMPORT_CIRCULAR' | 'IMPORT_NOT_FOUND' | ...;
   type GraftErrorCode = ScopeErrorCode | ImportErrorCode | ...;
   ```
   This preserves the same runtime type (string union) while improving authoring ergonomics.

4. **BUDGET_EXCEEDED vs BUDGET_NODE_EXCEEDED granularity is good**: These distinguish between graph-level budget warnings and per-node warnings. The same pattern should be used for v3.0 runtime errors (RUNTIME_NODE_FAILED vs RUNTIME_GRAPH_FAILED).

### RD-17: Error code numeric ranges not used -- string codes are the right choice

The spec originally considered numeric LSP diagnostic codes, but the implementation uses string codes mapped directly to `Diagnostic.code`. This is correct: LSP `Diagnostic.code` accepts `number | string`, and string codes are more readable in editor UI. No change needed.

---

## Findings Summary

| ID | Category | Severity | Finding |
|----|----------|----------|---------|
| RD-01 | Friction | Medium | GRAPH_MISSING return path lacked `program`, discovered 3 rounds late |
| RD-02 | Monitoring | Low | `formatType` and `typeToExample` are parallel switches over TypeExpr |
| RD-03 | Process | Low | Cross-critique never triggered in v2.2 (all score ranges <= 1) |
| RD-04 | Boundary | Low | `orchestration.ts` still uses `.find()` on TokenReport (not ProgramIndex scope) |
| RD-05 | Boundary | Low | PromptContext and FlowContext share structure but no common interface |
| RD-06 | Boundary | Medium | LSP recompiles everything on every keystroke; no incremental path |
| RD-07 | Boundary | Low | ProgramIndex constructed independently in compiler and executor |
| RD-08 | v3.0 extension | High | Field-level writes need saveMemory field parameter + provenance tracking |
| RD-09 | v3.0 extension | High | Failure strategies need FlowContext extension + AST on_failure clause |
| RD-10 | v3.0 extension | Medium | Multi-graph needs ProgramIndex.graphMap (spec had it, implementation omitted) |
| RD-11 | v3.0 extension | Medium | LSP completions: architecture ready, just needs implementation |
| RD-12 | v3.0 extension | Low | GraftErrorCode namespace expansion strategy needed |
| RD-13 | Integration | Positive | LSP integrated cleanly via ProgramIndex + sourceFile + GraftErrorCode |
| RD-14 | Integration | Medium | LSP calls full compile() including unnecessary codegen |
| RD-15 | ProgramIndex | Positive | All Program-level hot-path .find() eliminated; 3 cold-path calls remain |
| RD-16 | Error codes | Medium | TRANSFORM_ON_CONDITIONAL breaks prefix convention; PARSE_/LEX_ codes missing |
| RD-17 | Error codes | Positive | String codes over numeric codes was correct for LSP diagnostic display |

---

## Recommendations for v3.0

1. **Split compile() into compileToProgram() + compileAndGenerate()** (RD-06, RD-14) -- highest architectural impact. Enables LSP optimization and incremental compilation.
2. **Add graphMap to ProgramIndex** (RD-10) -- prerequisite for multi-graph support.
3. **Extract RuntimeState interface** from PromptContext/FlowContext (RD-05) -- prepare for failure strategy extension.
4. **Extend FlowContext for failure strategies** (RD-09) -- add onFailure per-node, retry wrapping.
5. **Add PARSE_/LEX_ error codes** (RD-16) -- enable structured LSP diagnostics for syntax errors.
6. **Rename TRANSFORM_ON_CONDITIONAL** to follow prefix convention (RD-16) -- minor cleanup.
7. **Consider NodeReportMap in TokenReport** (RD-04) -- O(1) report lookups in codegen.
