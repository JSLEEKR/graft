# Retro-Technical: Graft v2.1 Codebase Evaluation

## Evaluation Scope
- 24 source files in `src/`
- 11 test files in `tests/`
- 288 tests passing, 107 ratchet decisions
- v2.1 delivered: shared module extraction, correctness fixes, token tracking

---

## 1. Tech Debt Introduced or Deferred

### TD-01: Double-parse in compiler.ts (carried from v2.0, deferred again in v2.1)

**File**: `src/compiler.ts`, lines 25-56

The compiler lexes+parses the source once (lines 25-45), then if imports exist, calls `resolve()` which lexes+parses the same source again internally (`src/resolver/resolver.ts:41-44`, `parseSource()`). This means every file with `import` declarations gets parsed twice. The resolver also re-parses every imported file independently.

**Impact**: Performance (2x parse cost on entry file). Not blocking for current file sizes but will compound with larger projects.

**Recommendation**: Pass the already-parsed `Program` to `resolve()` instead of raw source. This requires changing `resolve()` signature to accept `Program` + `sourceFile` path, eliminating the internal `parseSource(source)` call for the entry file.

### TD-02: Version string hardcoded at "0.1.0" and "1.2.0"

**Files**:
- `src/codegen/settings.ts:85` — `version: '0.1.0'` in generated settings.json
- `src/index.ts:12` — `.version('1.2.0')` in CLI

The CLI reports v1.2.0 but the project is at v2.1. The generated settings.json always emits `0.1.0`. Neither is derived from `package.json` or any single source.

**Recommendation**: Read version from `package.json` at compile time or export from a generated version constant.

### TD-03: TokenReport actuals extension not implemented

**Spec**: v2.1 design spec section 4.9 defined `actualIn?`, `actualOut?` on `NodeTokenReport` and `actualTotal?` on `TokenReport` for post-run calibration. This was not implemented in any v2.1 round. The `TokenTracker.getSummary()` returns its own format but does not feed back into `TokenReport`.

**Impact**: No compile-time-vs-runtime calibration pathway exists. The PARTIAL_FIELD_FACTOR (0.3) and transform reduction estimates (filter: 0.5, drop: 0.85, compact: 0.7) remain unvalidated.

**Recommendation**: Either implement the TokenReport extension or explicitly defer with a tracking item.

### TD-04: loadMemory silent failure on corrupt JSON

**File**: `src/runtime/memory.ts:8-12`

`loadMemory` returns `null` on parse failure with no logging or warning. A corrupted memory file is indistinguishable from a missing one.

**Deferred since**: v2.1 design spec OUT table (RD-04).

**Recommendation**: Add a `verbose` flag or callback for diagnostics. When memory.json is present but unparseable, the user should know.

### TD-05: ProgramIndex utility class not implemented

**Deferred since**: v2.1 design spec OUT table (RT-10).

Multiple classes build their own lookup maps from `Program`:
- `ScopeChecker` constructor (lines 14-29): builds `contextNames`, `nodeNames`, `producesMap`, `memoryNames`, `memoryFieldsMap`, `nodeWritesMap`
- `TypeChecker` constructor (lines 10-20): builds `producesFieldsMap`, `memoryFieldsMap`
- `TokenEstimator` constructor (lines 26-38): builds `nodeMap`, `edgeMap`
- `Executor` constructor (lines 69-83): builds `nodeMap`, `edgeMap`, `memoryNames`

Each duplicates partial indexing of the same `Program`. A shared `ProgramIndex` would eliminate this repeated work and reduce constructor boilerplate.

---

## 2. Patterns That Should Be Formalized

### P-01: Map-based lookup construction pattern

Every analyzer/runtime class manually iterates `program.nodes`, `program.contexts`, etc. in its constructor to build `Map<string, T>` lookups. This is the same code pattern repeated 4+ times. Formalizing this into `ProgramIndex` (TD-05) would eliminate it.

### P-02: Field-matching merge pattern

`saveMemory` (`src/runtime/memory.ts:28-34`) uses a schema-aware field-matching merge: iterate memory schema fields, copy from output if present. This pattern is specific to Graft's memory system but not documented as a formal concept. If field-level writes expand (v3.0 plans mention this), the merge semantics need to be clearly specified: additive, replace, deep merge, etc.

### P-03: Heuristic envelope detection in parseCLIOutput

`src/runtime/subprocess.ts:63-90` uses a heuristic to distinguish CLI envelope JSON from regular node output JSON. The heuristic checks for `result` + any of (`usage`, `model`, `cost_usd`). This works today but is fragile:
- If Claude CLI changes its output format, the heuristic breaks silently
- If a node legitimately produces output with `{result: ..., model: ...}`, it gets incorrectly unwrapped

**Recommendation**: Document the heuristic's assumptions and add a test specifically for the false-positive case (node output that looks like a CLI envelope).

### P-04: Error accumulation vs throw pattern

The codebase uses two error patterns:
1. **Throw on first error**: Lexer (`src/lexer/lexer.ts`) and Parser (`src/parser/parser.ts`) throw `GraftError`
2. **Accumulate errors**: Analyzer (`scope.ts`, `types.ts`) and Resolver (`resolver.ts`) collect errors in arrays

This split is intentional (lexer/parser errors are fatal to parsing) but is not documented anywhere as a design decision. The resolver actually has a hybrid: it catches `GraftError` from the parser and accumulates it (line 64-66, 140-147).

### P-05: Consistent file naming for node outputs

The executor writes outputs under two different names:
- `src/runtime/executor.ts:374-385`: writes both `nodename.json` and `producesname.json`
- `src/runtime/executor.ts:393-399`: writes transformed output as `nodename_transformed_for_targetname.json`

But the codegen orchestration (`src/codegen/orchestration.ts:75-77`) references a different naming convention: `source_to_target.json`. The hooks (`src/codegen/hooks.ts:19`) also use `source_to_target.json`. The runtime and codegen are inconsistent on transformed output file naming.

---

## 3. Ratchet Decisions to Revisit

### R-01: [v2.0-R13] Memory importability excluded

Ratchet `v2.0-R13` locks that only `ContextDecl` and `NodeDecl` are importable. `MemoryDecl` is explicitly excluded. However, the common_memory notes "Memory importability: deferred" suggesting it was always intended for later. As memory becomes more central (writes, reads, parallel detection), shared memory definitions across files may become necessary.

**Recommendation**: Revisit for v2.2 if multi-file projects need shared memory schemas.

### R-02: [v2.1-R15] Budget enforcement advisory only

Token budget enforcement is advisory (log + field in RunResult), with no mechanism for the executor to actually stop or adjust behavior. The orchestration CLAUDE.md says "80% consumed: switch remaining agents to compact mode" and "90% consumed: skip non-critical agents" but the executor has no concept of "critical" vs "non-critical" nodes or "compact mode".

**Recommendation**: Either implement actionable budget responses or document that budget enforcement is informational-only and the generated CLAUDE.md instructions are for human orchestrators, not automated enforcement.

### R-03: [T4] Parser LL(1)+LL(2) ratchet

The parser uses LL(1) with LL(2) lookahead only for inline struct detection (`src/parser/parser.ts:686`). As syntax grows (potential new constructs in v2.2+), this may become insufficient. Worth noting but not urgent.

### R-04: [v1.2-R07] Abort-on-failure MVP

The executor aborts on any node failure (`src/runtime/executor.ts:177`). Retry, fallback, and skip strategies are parsed and stored in the AST (`FailureStrategy` types) and emitted in generated agent docs, but the executor ignores them entirely. The `onFailure` field on `NodeDecl` is dead code at runtime.

**Impact**: Medium-high. Users who specify `on_failure: retry(2)` in their .gft files get no runtime benefit. The generated CLAUDE.md mentions retry behavior but the execution engine doesn't implement it.

**Recommendation**: This is the most impactful unimplemented feature in the runtime. Either implement failure strategies or remove them from the spec to avoid misleading users.

---

## 4. Edge Cases and Failure Modes

### EC-01: Foreach binding name collision with node names

`src/runtime/executor.ts:229`: `this.outputs.set(flowNode.binding, items[i])` stores the foreach binding in the same `outputs` map as node outputs. If a foreach binding name matches a node name or produces name, it silently overwrites:

```gft
node Planner(...) { produces Plan { steps: List<String> } }
// foreach(Planner.output.steps as Plan, ...) — "Plan" collides with produces name
```

The analyzer does not check for this collision.

### EC-02: Multiple graphs in a single file

`src/compiler.ts:59-64` requires at least one graph but the estimator (`src/analyzer/estimator.ts:42`) and executor both use `program.graphs[0]` — only the first graph. If a file declares multiple graphs, all but the first are silently ignored.

The parser accepts multiple graph declarations. The analyzer validates all graphs. But only one executes. No warning is emitted for additional graphs.

### EC-03: Edge transforms on conditional edges are silently ignored

`src/codegen/codegen.ts:32-33`: hooks are only generated for `edge.target.kind === 'direct'`. The hook generator (`src/codegen/hooks.ts:8`) also returns null for non-direct targets. The parser does not prevent transforms on conditional edges (they're parsed into `edge.transforms`). The estimator (`src/analyzer/estimator.ts:36-37`) has a TODO comment about storing conditional edge branches but never does. If a user writes:

```gft
edge A -> { when score >= 0.8 -> B  else -> C } | select(summary)
```

The `select(summary)` transform is parsed but never applied. No warning.

### EC-04: Edge source/target names case sensitivity in runtime

The executor stores outputs by the exact node name (`this.outputs.set(nodeDecl.name, output)`) and the codegen uses `.toLowerCase()` for file paths. The orchestration CLAUDE.md references lowercase file paths. If two nodes differ only by case (unlikely but valid), the system would have file path collisions.

### EC-05: Empty produces fields

The parser allows `produces Output {}` with zero fields. The executor would generate `{}` as mock output and write an empty JSON object. The analyzer does not warn about empty produces declarations.

### EC-06: Memory file race in parallel execution

`src/runtime/memory.ts:15-38`: `saveMemory` does read-modify-write on a file: load existing -> merge fields -> write. With `Promise.allSettled` parallel execution, two nodes writing to the same memory file concurrently will race. The analyzer warns about this (v2.1-R09) but the runtime has no file locking or sequencing.

---

## 5. Performance and Quality Issues

### PQ-01: Linear lookups in hot paths

Several places use `Array.find()` instead of the Map lookups already available:

- `src/analyzer/estimator.ts:163-175`: `this.program.contexts.find()`, `this.program.memories.find()`, `this.program.nodes.find()` — all O(n) per call. The estimator already has `this.nodeMap` but doesn't have context/memory maps.
- `src/analyzer/scope.ts:98`: `this.program.contexts.find(c => c.name === ref.context)` — when `contextNames` Set already confirms existence, the `find` is used only to access the object. A Map would be better.
- `src/runtime/executor.ts:407`: `this.program.memories.find(m => m.name === writeName)` — called per write per node execution.

**Impact**: O(n*m) in node-rich programs. Not critical at current scale but will degrade.

### PQ-02: Synchronous file I/O in executor

The entire runtime (`executor.ts`, `memory.ts`) uses synchronous `fs.writeFileSync`, `fs.readFileSync`, `fs.existsSync`, `fs.mkdirSync`. While the subprocess spawning is async, all file operations block the event loop. For pipelines with many nodes writing outputs and memory, this adds latency.

### PQ-03: JSON.stringify called multiple times for same output

`src/runtime/executor.ts:375-398`: `storeOutput` calls `JSON.stringify(output, null, 2)` once per file write. For a node with transforms, it could stringify the same output 3+ times (node name file, produces name file, transformed file). The stringified result could be cached.

### PQ-04: No test for large programs

All test fixtures are small (1-3 nodes, 1 graph). There are no benchmarks or stress tests for programs with 20+ nodes, deep import chains, or complex edge topologies. The O(n^2) patterns in PQ-01 would only surface at scale.

### PQ-05: GraftError.format() hardcodes "Error" label

`src/errors/diagnostics.ts:18`: `format()` always produces `"Error at line X:Y"` even when `severity === 'warning'`. This was noted in the v2.1-R2 convergence report as deferred (YAGNI). It should be addressed if format() is ever used for warnings.

---

## 6. Architectural Improvements Needed

### A-01: Resolver does not return merged Program metadata

The resolver merges imported `ContextDecl` and `NodeDecl` into the entry program but does not merge any associated metadata (like which file each declaration came from). After resolution, there's no way to trace a context back to its source file. This makes source-map-like features impossible.

**Recommendation**: Add `sourceFile?: string` to `ContextDecl` and `NodeDecl`, populated during resolution.

### A-02: Executor is still large (475 lines)

Despite v2.1-R1 extracting memory management, `executor.ts` remains the largest file at 475 lines. It handles:
- Session lifecycle (clean, setup)
- Flow execution (sequential, parallel, foreach)
- Node execution (prompt building, subprocess management, output parsing)
- Output storage (session files, produces aliases, transforms, memory saves)
- Token tracking integration
- Mock output generation

**Recommendation**: Extract prompt building (`buildPrompt` + `buildContextSection`) into a separate module (e.g., `src/runtime/prompt-builder.ts`). Extract flow execution into `src/runtime/flow-runner.ts`. Keep `Executor` as the orchestrator that composes these.

### A-03: No structured error codes

All errors are string messages in `GraftError`. There are no error codes or categorization beyond `severity`. This makes programmatic error handling (e.g., "is this a scope error or a type error?") impossible without string matching.

**Recommendation**: Add an optional `code` field to `GraftError` (e.g., `SCOPE_DUPLICATE_NAME`, `TYPE_FIELD_NOT_FOUND`, `IMPORT_CIRCULAR`). Low priority but improves IDE/tooling integration.

### A-04: No source map from AST to generated output

The codegen pipeline generates `.claude/` files but there is no mapping from generated content back to source `.gft` locations. If a generated agent prompt has an issue, the user cannot trace it back to the specific node declaration.

### A-05: Single-graph limitation not enforced at parse level

The system only processes `program.graphs[0]` but the parser accepts arbitrarily many graphs. Either the parser should limit to one graph with an error, or the runtime should support graph selection (e.g., `graft run file.gft --graph MyGraph`).

---

## 7. Summary: Priority-Ordered Action Items for v2.2

| Priority | ID | Item | Category |
|----------|----|------|----------|
| HIGH | R-04 | Implement failure strategies (retry/fallback/skip) in executor | Feature gap |
| HIGH | TD-01 | Eliminate double-parse in compiler.ts | Performance |
| HIGH | A-02 | Decompose executor.ts | Maintainability |
| MEDIUM | EC-01 | Foreach binding name collision detection | Correctness |
| MEDIUM | EC-03 | Warn on transforms applied to conditional edges | Correctness |
| MEDIUM | TD-02 | Fix version strings (derive from package.json) | Correctness |
| MEDIUM | TD-03 | Implement TokenReport actuals or explicitly defer | Tech debt |
| MEDIUM | PQ-01 | Replace Array.find() with Map lookups in estimator/scope/executor | Performance |
| MEDIUM | A-05 | Enforce single-graph or support graph selection | Correctness |
| LOW | TD-04 | loadMemory verbose warning on corrupt | Observability |
| LOW | TD-05 | ProgramIndex utility class | Maintainability |
| LOW | EC-02 | Warn when multiple graphs declared (only first used) | Correctness |
| LOW | EC-05 | Warn on empty produces declarations | Correctness |
| LOW | PQ-05 | GraftError.format() severity label | Correctness |
| LOW | A-03 | Structured error codes | Tooling |
| DEFERRED | R-01 | Memory importability | Feature |
| DEFERRED | PQ-02 | Async file I/O in executor | Performance |
| DEFERRED | A-01 | Source file tracking on declarations | Tooling |
| DEFERRED | A-04 | Source maps for generated output | Tooling |
