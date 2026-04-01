# Retrospective: Technical Assessment (v2.0 -> v2.1)

## Tech Debt Inventory

**[TD-01] MODEL_MAP triplicated across codebase** -- severity: medium -- recommended action: extract to shared constant
- Identical `MODEL_MAP` exists in `src/codegen/agents.ts` (L4-8), `src/codegen/settings.ts` (L4-8), and `src/runtime/executor.ts` (L9-13). Three copies must be kept in sync manually. The ratchets v1.2-R06 and T6 explicitly locked this duplication. With 3 copies now (up from 2 in v1.2), the maintenance cost has crossed the threshold where extraction is warranted. Recommend a single `src/constants.ts` or `src/models.ts` export, and unlocking the ratchet.

**[TD-02] fieldsToJsonExample + typeToExample duplicated in agents.ts and executor.ts** -- severity: medium -- recommended action: extract to shared utility
- `fieldsToJsonExample` and `typeToExample` are identical 36-line functions in both `src/codegen/agents.ts` (L116-151) and `src/runtime/executor.ts` (L482-517). Comment at executor.ts L481 acknowledges this: "Duplicated from agents.ts (not exported there) per convergence spec." The convergence spec deferred extraction; common_memory notes for future confirms: "fieldsToJsonExample duplicated from agents.ts; consider extracting if agents.ts exports it."

**[TD-03] TODO: conditional edge token estimation** -- severity: low -- recommended action: implement in v2.1
- `src/analyzer/estimator.ts` L36: `// TODO: store conditional edge branches for token estimation (v2)`. Conditional edges exist in the AST and parser but the estimator ignores them entirely. No token estimation for conditional routing paths.

**[TD-04] TODO: condition type compatibility in TypeChecker** -- severity: low -- recommended action: implement in v2.1
- `src/analyzer/types.ts` L30: `// TODO: condition type compatibility -- e.g., >= on String fields (v2)`. The type checker does not validate that comparison operators are semantically valid for the operand types (e.g., `>=` on a String field should warn).

**[TD-05] Writes schema validation deferred** -- severity: medium -- recommended action: implement in v2.1
- Ratchet v2.0-R23: "TypeChecker unchanged for v2.0 (writes schema check deferred)". Nodes with `writes: [M]` have no compile-time validation that their `produces` schema contains fields compatible with the memory schema. A node producing `{name: String}` writing to memory `{count: Int}` would silently produce no updates at runtime.

**[TD-06] Memory importability deferred** -- severity: low -- recommended action: evaluate for v2.1
- Ratchet v2.0-R13 locks memories as non-importable. common_memory notes: "Memory importability: deferred." Cross-file memory references require duplicating memory declarations.

**[TD-07] Conditional edge routing deferred** -- severity: low -- recommended action: keep deferred to v1.3+
- common_memory: "Conditional edge routing: deferred to v1.3." The parser supports conditional edge syntax, but the runtime executor (`executeFlowNodes`) has no concept of conditional branching -- all edges are treated as direct.

**[TD-08] Full failure strategies deferred** -- severity: low -- recommended action: keep deferred
- Ratchet v1.2-R07: "Abort-on-failure MVP; retry/fallback/skip deferred." The executor aborts on first failure. `on_failure` strategies (retry, fallback, skip) are parsed and stored in AST but never evaluated at runtime.

**[TD-09] Version string hardcoded at 0.1.0 in settings.ts** -- severity: low -- recommended action: derive from package.json
- `src/codegen/settings.ts` L86: `version: '0.1.0'` is hardcoded. CLI version at `src/index.ts` L12 is `'1.2.0'`. Neither reflects v2.0. These should be derived from package.json or a single version constant.

**[TD-10] Bash hooks Windows deferred** -- severity: low -- recommended action: document limitation
- T6 ratchet: "bash hooks Windows deferred." Generated `.sh` hook files require bash. On Windows, the shell shim (`process.platform === 'win32'`) only covers subprocess spawning, not hook execution.

## Code Patterns to Formalize

**[CP-01] Node/edge map construction is repeated in 4 locations**
- `TokenEstimator` constructor builds `nodeMap` and `edgeMap` from `program.nodes` and `program.edges`.
- `Executor` constructor builds identical `nodeMap` and `edgeMap`.
- `ScopeChecker` constructor builds `contextNames`, `nodeNames`, `producesMap` from program.
- `generateOrchestration` builds `memoryNames` set and `edgeMap`.
Each consumer extracts its own lookup structures from `Program`. A `ProgramIndex` helper class would eliminate this repetition and ensure consistent indexing logic.

**[CP-02] Case-insensitive name resolution is inconsistent**
- Executor uses `.toLowerCase()` for file paths (`nodeOutputDir`, `sessionDir` file names) but case-sensitive `Map` lookups for node/edge names.
- `buildContextSection` does case-sensitive `this.outputs.get(ref.context)` but case-insensitive `graph.input` comparison: `ref.context === graph.input` (case-sensitive).
- `execute()` output matching: `key.toLowerCase() === outputName` (case-insensitive).
- This inconsistency could cause silent failures if a user writes `produces analysis` but the graph output is `Analysis`.

**[CP-03] Error accumulation vs throw-on-first is inconsistent across pipeline stages**
- Lexer: throw-on-first (GraftError). Parser: throw-on-first. Resolver: error accumulation. ScopeChecker: error accumulation. TypeChecker: error accumulation. This is by design (ratchet T2), but the compile pipeline in `compiler.ts` uses try-catch for lexer/parser and direct accumulation for analyzer, creating two different error handling paths. The resolver adds a third pattern (try-catch inside resolve, accumulation in result).

**[CP-04] `program.graphs[0]` assumption appears in 7 locations**
- `estimator.ts` L41, `orchestration.ts` L5, `settings.ts` L56, `executor.ts` L99, `executor.ts` L459, `codegen.ts` L20 (implicit via orchestration), `compiler.ts` L59 (guard). All assume single-graph programs. If multi-graph support is ever added, every one of these must change. Consider a `getGraph()` accessor that centralizes this assumption.

## Ratchet Decisions to Revisit

**[RR-01] MODEL_MAP duplication (T6 ratchet, v1.2-R06)** -- recommend UNLOCK
- With 3 copies now, the original YAGNI justification no longer holds. The duplication has grown linearly with each release. A single shared export would be a net simplification, not premature abstraction.

**[RR-02] v2.0-R23 TypeChecker unchanged (writes schema check deferred)** -- recommend UNLOCK
- Now that the memory system is stable and tested, there is no reason to keep deferring writes-vs-memory schema compatibility checks. This is a correctness gap, not a feature.

**[RR-03] v1.2-R07 Abort-on-failure MVP** -- evaluate for UNLOCK
- The `FailureStrategy` types are fully parsed and stored in the AST. The `TokenEstimator` already calculates retry multipliers. The runtime executor is the only component that ignores failure strategies. Unlocking this ratchet for v2.1 would be architecturally clean since the groundwork is already laid.

**[RR-04] v2.0-R13 Memory importability excluded** -- evaluate for UNLOCK
- As users build modular pipelines with shared libraries, requiring each file to re-declare identical memory schemas will become a friction point. The resolver infrastructure already supports merging declarations by type.

## Unaddressed Edge Cases

**[EC-01] Parallel nodes writing to the same memory -- race condition**
- If two nodes in a `parallel { A B }` block both have `writes: [M]`, they execute concurrently via `Promise.allSettled`. Both call `saveMemory()` which does read-modify-write on the same JSON file. The last writer wins, silently discarding the other's updates. No warning at compile time or runtime.

**[EC-02] Foreach binding collision with produces names**
- In `foreach(Planner.output.steps as step, ...)`, the binding `step` is stored in `this.outputs` (executor.ts L259). If a node in the foreach body has `produces Step { ... }`, the produces name and binding name would collide in the outputs map. No scope checker validation exists for this case.

**[EC-03] Empty produces fields**
- A node with `produces Result { }` (zero fields) is syntactically valid. The parser accepts it (`parseFields` returns `[]`). The mock output generator returns `{}`. The agent prompt tells the model to produce `{}`. This is likely unintentional but silently succeeds.

**[EC-04] Memory file corruption during concurrent writes**
- `saveMemory()` does non-atomic read-modify-write: `readFileSync` then `writeFileSync`. If the process crashes or two executor instances run simultaneously, the memory file could be left in an inconsistent state. Ratchet v2.0-R29 handles read-side corruption (loadMemory returns null), but write-side corruption is unaddressed.

**[EC-05] extractJson failure mode on partial JSON**
- `subprocess.ts` `extractJson` tries full parse, then brace matching, then bracket matching. If stdout contains `{"a": 1} some trailing text {"b": 2}`, it would extract the wrong JSON (first-brace to last-brace spans both objects plus the text between). No test covers this malformed output case.

**[EC-06] Import resolver does not validate that imported nodes' reads are satisfiable**
- If file B exports node `Analyzer` that `reads: [CodeSpec]`, and file A imports `Analyzer` but not `CodeSpec`, compilation will succeed at the resolver level. The scope checker will catch this, but the error message will say "CodeSpec is not declared" without mentioning that it exists in the imported file and should also be imported.

**[EC-07] Edge transforms on conditional edges are silently ignored**
- The parser does not allow transforms on conditional edges (syntax doesn't support `|` after `{ when... }`). But if future changes add this, the hook generator, orchestration generator, and runtime all filter for `edge.target.kind === 'direct'`, silently dropping any conditional edge transforms.

**[EC-08] max_tokens: 0 is accepted by parser**
- Ratchet v2.0-R10: "max_tokens > 0 validation deferred to analyzer, not parser." However, the analyzer also does not validate max_tokens > 0. Neither ScopeChecker nor TypeChecker checks this. A context or memory with `max_tokens: 0` would produce a zero-token estimation, which is misleading but not caught.

## v2.1 Readiness: Real-Time Token Tracking

### What Exists

1. **Static token estimation** (`src/analyzer/estimator.ts`): `TokenEstimator` computes per-node `estimatedIn`/`estimatedOut`, graph `bestCase`/`worstCase`, and generates warnings when estimates exceed budgets. This provides the baseline numbers.

2. **Token budget display** in orchestration output (`src/codegen/orchestration.ts` L40-42): "Check `.graft/token_log.txt` after each step" with 80%/90% threshold guidance.

3. **Token accounting in hooks** (`src/codegen/hooks.ts` L31-39): Generated bash hooks write byte-level reduction stats to `.graft/token_log.txt` after edge transforms.

4. **Duration tracking in executor** (`src/runtime/executor.ts`): `NodeResult.durationMs` and `RunResult.totalDurationMs` are captured per-node and overall. The infrastructure for per-node metrics exists.

5. **Subprocess output capture** (`src/runtime/subprocess.ts`): stdout and stderr are fully captured. The stdout length is logged in verbose mode (executor.ts L332).

### What's Missing

1. **No runtime token counting**: The executor has no mechanism to count actual tokens consumed by each Claude subprocess call. The `SpawnResult` only captures stdout/stderr/exitCode -- no token usage metadata.

2. **No token tracking data structure**: There is no `TokenUsage` interface or accumulator in `RunResult` or `NodeResult`. The static estimates from `TokenEstimator` are not connected to the runtime at all.

3. **No Claude API token response parsing**: The `spawnClaude` function uses `claude --print` which outputs the response text. Claude CLI may provide token usage info in stderr or via a flag (e.g., `--output-format json`), but the subprocess module does not attempt to extract it.

4. **No budget enforcement at runtime**: The orchestration doc mentions "80% consumed: switch to compact mode" and "90%: skip non-critical agents", but the executor has no runtime budget tracking or enforcement logic. These are instructions for human/LLM operators reading the orchestration doc, not automated behavior.

5. **No token log writing from runtime**: The executor does not write to `.graft/token_log.txt`. Only the bash hooks (codegen output) write to it. The runtime execution path bypasses hooks entirely.

6. **No callback/event system**: The executor has no event emission mechanism. Adding real-time token tracking would require either: (a) polling-based approach, (b) callback injection into `RunOptions`, or (c) event emitter pattern. None of these exist.

### Blockers

1. **Claude CLI token reporting**: The primary blocker is obtaining actual token counts from Claude subprocess calls. Options:
   - Parse stderr for usage info (fragile, format may change)
   - Use `--output-format json` flag to get structured response with usage
   - Switch from CLI spawning to API calls (major refactor, breaks SpawnerFn interface)
   
2. **SpawnerFn type constraint**: The `SpawnerFn = (options: SpawnOptions) => Promise<SpawnResult>` type is ratchet-locked (v1.2-R08). Adding token usage to `SpawnResult` is backward-compatible. Adding new fields to `SpawnOptions` for token tracking flags is also backward-compatible. Neither requires ratchet unlock.

3. **Single-graph assumption**: Token tracking needs to know the graph budget. Currently `program.graphs[0]` is used everywhere. This is not a blocker but needs to be consistent.

## Recommendations for v2.1

1. **Extract MODEL_MAP to `src/constants.ts`** -- unlock ratchets T6/v1.2-R06. Eliminates 3-copy maintenance burden. Low risk, high clarity. Simultaneously extract `fieldsToJsonExample`/`typeToExample` to `src/utils/schema.ts`.

2. **Implement writes-vs-memory schema validation in TypeChecker** -- unlock ratchet v2.0-R23. Validate that nodes with `writes: [M]` produce at least one field that exists in memory M's schema. Emit warning (not error) for zero-overlap.

3. **Add `TokenUsage` to SpawnResult and NodeResult** -- extend interfaces:
   ```typescript
   interface SpawnResult {
     // ... existing ...
     tokenUsage?: { inputTokens: number; outputTokens: number };
   }
   interface NodeResult {
     // ... existing ...
     tokenUsage?: { inputTokens: number; outputTokens: number };
   }
   interface RunResult {
     // ... existing ...
     totalTokens?: { inputTokens: number; outputTokens: number };
   }
   ```
   Parse token usage from Claude CLI output (investigate `--output-format json` flag).

4. **Add runtime budget tracking to Executor** -- accumulate token usage across nodes, emit warnings at 80%/90% thresholds, optionally skip non-critical nodes. Requires the token usage data from recommendation 3.

5. **Build ProgramIndex utility** -- centralize the repeated `nodeMap`/`edgeMap`/`memoryNames` construction. Used by Executor, TokenEstimator, ScopeChecker, and orchestration generator.

6. **Add parallel memory write conflict detection** -- in ScopeChecker, detect when two nodes in a `parallel { }` block both write to the same memory and emit an error. This is a correctness issue (EC-01).

7. **Validate max_tokens > 0** -- add to ScopeChecker or as a parser-level check. Resolves EC-08 and the deferred ratchet v2.0-R10.

8. **Improve import error messages** -- when a scope error references a name that exists in an imported file but was not explicitly imported, include a suggestion: "Did you mean to import 'CodeSpec' from './shared.gft'?"

9. **Add token log writing to runtime executor** -- after each node execution, append to `.graft/token_log.txt` with actual or estimated token usage, creating continuity between compile-time estimates and runtime actuals.

10. **Investigate Claude CLI structured output** -- determine if `claude --print --output-format json` or similar provides token usage metadata. This is the critical path dependency for real-time token tracking. If not available via CLI, evaluate whether an API-based spawner variant is feasible alongside the CLI spawner.
