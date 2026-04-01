# Retrospective: Design Decisions (v2.0 → v2.1)

## Import System Design Review

### [v2.0-R11] ExportableNames snapshot BEFORE recursion — STILL CORRECT

This was the single most important correctness decision in v2.0. A1-Architect was the only agent to propose it in Step 1, and cross-critique caught the transitive re-export bug in A2/A4's approaches. The invariant is structurally enforced: `extractExportables()` runs before `ancestors.add()` + recurse. No friction observed — the code is clean and the 20 resolver tests all pass. No revisit needed.

### [v2.0-R12] resolve() is pure function; FileReader injection — STILL CORRECT, NEEDS EXTENSION

The FileReader injection makes testing trivial — all 20 resolver tests use in-memory file maps instead of disk I/O. However, the current signature `resolve(source, sourceFile, readFile?)` re-parses the entry file inside `resolve()` even though `compiler.ts` already parsed it in the Lex+Parse step. This is a double-parse inefficiency: `compiler.ts` lines 25-46 lex+parse, then line 50 calls `resolve(source, sourceFile)` which lex+parses again internally via `parseSource()`. For v2.1, consider accepting a `Program` directly to avoid the redundant parse.

### [v2.0-R13] Only ContextDecl and NodeDecl importable — SHOULD REVISIT

The design spec (section 3.1) originally listed `context`, `node`, `edge` as importable. The debate narrowed this to context+node only, excluding edges, graphs, and memories. This was correct for v2.0 MVP, but creates friction:

1. **Edges**: If you import a node, you likely want its outgoing edges too. Currently, importing `NodeA` from a library means you must re-declare `edge NodeA -> NodeB` in every consuming file. This is boilerplate.
2. **Memories**: common_memory.md explicitly notes "Memory importability: deferred (v2.0-R13 locked as excluded)." For shared memory schemas across pipelines (e.g., a `UserPreferences` memory used by multiple `.gft` files), you currently must duplicate the declaration.

Recommendation for v2.1: Add `MemoryDecl` to importable types. Edge importability can remain deferred (edges reference nodes by name, so importing edges without importing all referenced nodes creates validation complexity).

### [v2.0-R16] No auto-extension, no Levenshtein — STILL CORRECT

YAGNI. The error messages already include `Available: X, Y, Z` when a name is not found, which is sufficient DX for LLM-to-LLM communication. Levenshtein is a human-facing convenience. Auto-extension (`.gft` appended automatically) would create ambiguity about whether `"./shared"` refers to `shared.gft` or a directory. Keep as-is.

### [v2.0-R17] Import path must end with .gft — SHOULD REVISIT for v2.2

Currently correct for the single-language ecosystem. However, v2.2 plans npm package support. If a Graft library is distributed via npm, paths like `"graft-stdlib/shared"` won't end in `.gft`. The `.gft` requirement will need relaxation for package imports, likely with a distinct syntax (e.g., `import { X } from "pkg:graft-stdlib/shared"` vs `import { X } from "./local.gft"`). No action needed for v2.1, but flag for v2.2 planning.

## Memory System Design Review

### [v2.0-R22] TokenEstimator 0.3 partial factor — SHOULD REVISIT

The 0.3 factor appears in three places:
- `estimator.ts` line 165: context partial reads `Math.floor(ctx.maxTokens * 0.3)`
- `estimator.ts` line 170: memory partial reads `Math.floor(mem.maxTokens * 0.3)`
- `estimator.ts` line 184: upstream produces partial reads `Math.floor(upstreamTokens * 0.3)`

This constant is not empirically justified — it was chosen as a "reasonable guess" during the T5 debate. The same 0.3 is also used for `select` transform reduction (line 195: `0.3 * t.fields.length`). For v2.1 token tracking, actual runtime data will be available. The 0.3 should become a configurable parameter or be replaced with empirical calibration from token tracking data. At minimum, extract `0.3` to a named constant (`PARTIAL_READ_FACTOR`) to make the assumption visible and tunable.

### [v2.0-R26] Field-matching merge — STILL CORRECT, MINOR EDGE CASE

The field-matching merge in `executor.ts` lines 189-196 is schema-aware: it only writes fields declared in the memory schema, preserving unrelated fields. This was the right call over A1's full-overwrite and A2's shallow merge. One edge case worth noting:

- **Nested field mutation**: If a memory field is `turns: List<Turn>` and a node outputs `{ turns: [...] }`, the entire `turns` array is replaced, not appended. For conversation history accumulation, the node must output the full updated list. This is documented implicitly by the schema design but could surprise users. Consider whether v2.1 should add an `append` merge strategy for list fields.

### [v2.0-R27] Always reload from disk — NEEDS EXTENSION

The "always reload" decision (executor.ts lines 290-299) was A3's catch — it fixed a real bug where `foreach` loops would see stale memory after iteration N wrote to it. The fix is correct. However, for v2.1+ with multiple concurrent pipelines or larger memory files, this creates:

1. **Performance**: Every node execution triggers a `fs.readFileSync` + `JSON.parse` for each memory ref. For a 10-node pipeline reading the same memory, that's 10 disk reads per run.
2. **Concurrency**: Two concurrent `graft run` processes writing the same memory file will race. No locking mechanism exists.

For v2.1 (token tracking only), performance is acceptable. For v2.2+, consider:
- In-memory cache with dirty-flag invalidation
- File locking or advisory locks for concurrent access
- Or accept single-writer semantics and document it

### [v2.0-R29] loadMemory returns null on missing/corrupt — SHOULD REVISIT

Returning `null` silently on corrupt JSON means data loss goes undetected. If a memory file gets corrupted (partial write, disk error, manual edit), the pipeline silently starts with empty memory and then overwrites the file with new data — destroying whatever was there.

Recommendation for v2.1: Add a `verbose` mode warning when `JSON.parse` fails (the executor already has `this.options.verbose`). The current `catch {}` swallows the error completely. A one-line `if (this.options.verbose) console.warn(...)` in the catch block would surface corruption without breaking the pipeline.

## Architecture Assessment

### Pipeline Decomposition

The pipeline `lexer → parser → resolver → analyzer → codegen` is correct and well-separated. Each stage has clear inputs/outputs:

```
Lexer:    string → Token[]
Parser:   Token[] → Program
Resolver: (source, path) → ResolveResult (merged Program)
Analyzer: Program → GraftError[] + TokenReport
CodeGen:  (Program, TokenReport) → GeneratedFile[]
```

The resolver as a separate stage (not merged into parser) was the right call (v2.0-R12). The resolver needs to lex+parse imported files, so it depends on lexer+parser but not vice versa. Merging it into the parser would create a circular concern.

**One inefficiency**: `compiler.ts` parses the entry file, then `resolve()` re-parses it. This is because the resolver was designed as a standalone module (lesson from v1.2-R02: "don't reuse across boundaries"). The cost is one redundant parse of the entry file. For v2.1, consider `resolve(program, sourceFile, readFile?)` to accept the already-parsed program.

### Module Boundaries

The codegen modules are well-decomposed:
- `agents.ts` (151 LOC): per-node agent markdown generation
- `orchestration.ts` (163 LOC): orchestration plan markdown
- `hooks.ts`: edge transform shell scripts
- `settings.ts`: Claude settings.json
- `codegen.ts` (73 LOC): assembly coordinator

Each module is under 200 lines. No boundary issues.

The analyzer modules are similarly clean:
- `scope.ts` (223 LOC): name resolution and reference validation
- `estimator.ts` (225 LOC): token budget estimation
- `types.ts`: type checking

### Growth Concerns

**executor.ts at 517 LOC** is the largest file in the codebase and growing. It handles:
1. Constructor setup (node/edge maps, session/memory dirs)
2. Flow execution (sequential, parallel, foreach)
3. Node execution (prompt building, spawning, output parsing)
4. Memory management (load, save, field-matching merge)
5. Output storage (file writing, edge transform application)
6. Mock output generation (dry run)
7. Prompt building (context section assembly)

Responsibilities 4 and 5 are candidates for extraction:
- **Memory manager**: `loadMemory()`, `saveMemory()`, `memoryDir`, `memoryNames` → `src/runtime/memory.ts`
- **Output manager**: `storeOutput()`, `nodeOutputDir`, file writing → `src/runtime/outputs.ts`

This would bring executor.ts down to ~300 LOC (flow orchestration + node execution) and isolate memory persistence for independent testing and future storage backends.

**fieldsToJsonExample duplication**: This function is duplicated in `agents.ts` (lines 116-151) and `executor.ts` (lines 482-517) — 35 identical lines. common_memory.md notes this: "fieldsToJsonExample duplicated from agents.ts; consider extracting if agents.ts exports it." For v2.1, extract to a shared utility (e.g., `src/codegen/schema-utils.ts` or `src/utils/schema.ts`).

**MODEL_MAP triple duplication**: Exists in `agents.ts`, `executor.ts`, and `settings.ts`. Three copies of the same 3-entry map. Extract to `src/constants.ts`.

## Extension Points Needed for Roadmap

### v2.1 (token tracking) needs...

1. **Token counting hook in executor**: After each `spawner()` call, extract actual token usage from Claude CLI output (likely from stderr or a usage report). Current `SpawnResult` has `stdout` and `stderr` — need to parse token counts from these.
2. **Token log writer**: Currently `.graft/token_log.txt` is scaffolded but never written to at runtime. Need a `TokenLogger` that records per-node actual vs estimated tokens.
3. **Estimator calibration**: The 0.3 partial factor and transform reduction factors (`0.5` for filter, `0.85` for drop, `0.7` for compact) should be tuneable. v2.1 token tracking data can feed back into these.
4. **Report format**: `TokenReport` needs an `actuals` field alongside estimates for post-run comparison.

### v2.2 (npm + LSP) needs...

1. **Package resolution**: The resolver currently only handles relative paths. Need a `resolvePackagePath()` that looks up `node_modules/` or a Graft package registry. This suggests splitting `resolveImport()` into `resolveRelativeImport()` and `resolvePackageImport()`.
2. **LSP integration points**: The compiler's `compile()` returns errors with `SourceLocation` — this maps directly to LSP diagnostics. However, `compile()` is all-or-nothing. An LSP needs incremental: lex-only, parse-only, resolve-only. The current pipeline stages are already separate functions, so this is mostly a matter of exposing them individually (they're already importable).
3. **Import path relaxation**: [v2.0-R17] `.gft` extension requirement will block package imports. Need a way to distinguish local vs package imports.

### v3.0 (multi-backend) needs...

1. **Backend abstraction in codegen**: Currently `codegen.ts` is hardcoded to produce `.claude/` structure. For multi-backend (Claude, GPT, Gemini), the `generate()` function needs a backend parameter or plugin system. The `MODEL_MAP` is already Claude-specific.
2. **Spawner abstraction**: `executor.ts` uses `spawnClaude` from `subprocess.ts`. For multi-backend runtime, `SpawnerFn` needs to become backend-aware, or each backend provides its own spawner.
3. **Agent format abstraction**: `generateAgent()` produces Claude-specific markdown. Each backend will need its own agent template format.
4. **Field-level writes from v6 graph harness analysis**: common_memory.md references this as a v3.0 improvement. The current `saveMemory()` already does field-matching merge, which is the foundation for field-level writes. The extension would be finer-grained: per-field merge strategies (replace, append, increment) rather than the current uniform replace-if-present.

## Recommendations

1. **Extract memory management from executor.ts** → `src/runtime/memory.ts` (loadMemory, saveMemory, field-matching merge). Reduces executor.ts from 517 to ~350 LOC, isolates memory persistence for future storage backends (sqlite, redis).

2. **Extract fieldsToJsonExample to shared utility** → `src/utils/schema.ts`. Eliminates 35 lines of duplication between agents.ts and executor.ts. Extract MODEL_MAP to `src/constants.ts` (eliminates triple duplication).

3. **Add verbose warning for corrupt memory files** in `loadMemory()` catch block. One-line change, prevents silent data loss.

4. **Accept pre-parsed Program in resolve()** to eliminate double-parse of entry file. Change signature to `resolve(program: Program, sourceFile: string, readFile?)` or add an overload.

5. **Extract 0.3 partial factor to named constant** (`PARTIAL_READ_FACTOR = 0.3`). Makes the assumption explicit and tuneable for v2.1 token tracking calibration.

6. **Add MemoryDecl to importable types** for v2.1. Shared memory schemas across pipelines are a real use case. The resolver's `extractExportables()` already returns a `{ contexts, nodes }` map — extend to `{ contexts, nodes, memories }`.

7. **Plan import path syntax for v2.2 packages** now. Decide on `"pkg:name/path"` vs `"@scope/name/path"` vs a separate `require` keyword. The `.gft` extension requirement [v2.0-R17] must be relaxable for package imports without breaking relative imports.

8. **Defer executor decomposition beyond memory extraction**. At 517 LOC, executor.ts is large but not unmanageable. Flow orchestration and node execution are tightly coupled (shared `this.outputs` state). Extracting outputs management separately from memory would fragment the state too much. Extract memory first, reassess at v2.2.

9. **Add token log writing to executor** as prep for v2.1. The `.graft/token_log.txt` file is scaffolded but never written. Even before full token tracking, writing node name + duration + estimated tokens per run provides baseline data.

10. **No action needed** on [v2.0-R16] (no Levenshtein), [v2.0-R11] (ExportableNames snapshot), [v2.0-R14] (DFS ancestors), or [v2.0-R26] (field-matching merge). These are sound and stable.
