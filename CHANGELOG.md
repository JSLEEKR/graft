# Changelog

## v2.2.0 (2026-04-01)

### Added
- **LSP server**: Language Server Protocol support for Graft files
  - Real-time diagnostics (errors + warnings) on document open/change
  - Hover info: context fields, node config, memory details, produces summary
  - Go-to-definition: navigate to declarations including cross-file imports
  - 2-file architecture (`server.ts` + `features.ts`) with pure function handlers
  - `graft-lsp` binary entry for editor integration
- **VS Code extension**: `editors/vscode/` with TextMate grammar and LSP client
  - Syntax highlighting for all 35 keywords, type keywords, domain types, operators
  - Comment support (`//` line, `/* */` block), bracket matching, auto-closing pairs
  - LSP client auto-launches `graft-lsp` on `.gft` file open
- **npm distribution**: `@graft-lang/graft` scoped package
  - `exports` with `.` and `./ast` sub-paths
  - `files` array + `.npmignore` defense-in-depth
  - `prepublishOnly` script (build + test)
  - MIT LICENSE file, README badges (npm version, Node.js, license)
- **Structured error codes**: `GraftErrorCode` 21-member union type on all diagnostics
  - SCOPE_*, TYPE_*, ESTIMATE_*, IMPORT_*, COMPILE_* code families
  - Optional 4th param on `GraftError` constructor (backward compatible)
- **Correctness warnings**:
  - Foreach binding name collision detection (`SCOPE_BINDING_COLLISION`)
  - Conditional edge transform warning (`TRANSFORM_ON_CONDITIONAL`)
  - Multiple graph warning (`GRAPH_MULTIPLE`)
  - `loadMemory` verbose option for corrupt JSON diagnostics
- **Source file tracking**: `sourceFile` on `ContextDecl` and `NodeDecl` for cross-file navigation
- **ProgramIndex**: O(1) Map-based lookups (5 maps) replacing Array.find() throughout pipeline
- 88 new tests (376 total)

### Changed
- `resolve()` accepts `Program` instead of source string (eliminates double-parse)
- Executor decomposed: `prompt-builder.ts` (pure functions) + `flow-runner.ts` (flow execution)
- `VERSION` derived from package.json via `createRequire` with fallback
- `compile()` returns program even on `GRAPH_MISSING` (enables LSP for library files)
- Package renamed from `graft` to `@graft-lang/graft`

### Development Process
- 6 adversarial debate rounds (R1-R6), ~33 agent calls
- R1-R3 (MEDIUM): Tech debt, executor decomposition, correctness fixes
- R4 (HIGH): LSP server — 4-agent analysis, A3 found GRAPH_MISSING bug
- R5 (MEDIUM): npm + VS Code — A3 caught comment syntax, escape sequence, k-integer priority issues
- R6 (TEST-ONLY): Integration tests + v2.1 adversarial backlog (4 proposals resolved)
- 25 new ratchet-locked decisions (132 total)
- Cross-critique skipped in all MEDIUM rounds (score range ≤ 1)

## v2.1.0 (2026-04-01)

### Added
- **Token tracking**: runtime token usage monitoring across pipeline execution
  - `parseCLIOutput` with heuristic envelope detection (`--output-format json`)
  - `TokenTracker` class for cumulative budget tracking per node
  - Token log file (`.graft/token_log.txt`) with ISO timestamps, estimates, actuals, and cumulative budget percentage
  - `RunResult.tokenUsage` with budget/consumed/fraction/perNode breakdown
  - Advisory budget warnings at 80% (warning) and 90% (critical) thresholds
- **Correctness fixes**:
  - Writes schema overlap detection: warns when node produces no matching fields for written memory (TypeChecker)
  - `max_tokens > 0` validation for both contexts and memories (ScopeChecker)
  - Parallel memory write detection: warns when 2+ parallel branches write to the same memory
  - `compiler.ts` warning routing: diagnostics filtered by severity, warnings no longer block compilation
- **Shared modules**: extracted constants, utilities, and memory functions to dedicated modules
  - `src/constants.ts`: MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD
  - `src/utils.ts`: fieldsToJsonExample, typeToExample
  - `src/runtime/memory.ts`: loadMemory, saveMemory as standalone functions
  - `src/runtime/token-tracker.ts`: TokenTracker class
- 39 new tests (288 total)

### Changed
- MODEL_MAP deduplicated: single source of truth in `src/constants.ts` (previously duplicated in estimator.ts and executor.ts)
- Executor uses `--output-format json` instead of `--print` for Claude CLI subprocess invocation

### Development Process
- 4 adversarial debate rounds (R1-R4), 21 agent calls (42% under budget)
- R1 (MEDIUM): Mechanical refactoring, 2-agent analysis, no bugs found
- R2 (MEDIUM): Both agents independently found compiler.ts warning routing bug
- R3 (HIGH): A3 found CLI format uncertainty, A2 found mock spawner compat issue; cross-critique skipped (high consensus)
- R4: Debate skipped — pure integration testing with no design decisions
- 17 new ratchet-locked decisions (107 total, 2 unlocked for MODEL_MAP extraction)

## v2.0.0 (2026-04-01)

### Added
- **Import system**: `import { X, Y } from "./file.gft"` — share contexts and nodes across files
  - DFS circular import detection with ancestor set tracking
  - ExportableNames snapshot prevents transitive re-export
  - FileReader injection for testability
  - Only contexts and nodes importable (edges, graphs, memories excluded)
- **Persistent memory**: `memory M(max_tokens: 1k, storage: file) { fields }` — state that persists across pipeline runs
  - Stored in `.graft/memory/<name>.json`, survives session cleanup
  - `writes: [M]` clause on nodes to declare memory mutation
  - Field-matching merge: only schema-declared fields written, unrelated fields preserved
  - Always reload from disk per node execution (fixes foreach staleness)
  - Dry run guard: memory saves skipped during `--dry-run`
  - `loadMemory` returns null on missing/corrupt files (graceful first-run)
- 5 new keywords: `import`, `from`, `memory`, `writes`, `storage`
- Memory-aware agent generation (`.graft/memory/` paths in reads, "Memory Saving" section in writes)
- Orchestration "Persistent Memory" preamble section with per-step memory load/save annotations
- Memory validation in analyzer: name collision detection, writes validation, field-level read checking, token estimation with 0.3 partial factor
- Example files: `shared.gft` (library), `chatbot.gft` (import + memory + writes)
- 78 new tests (249 total)

### Development Process
- 5 adversarial debate rounds (R1-R5), ~70 agent calls
- R1: Lexer + AST + Parser — A3 caught duplicate writes silent overwrite, empty import list/path
- R2: Import Resolver — A1's ExportableNames snapshot was only correct approach; A3 caught entry-file parse error gap
- R3: Analyzer — A1 forced dissenter reversed: "collision detection is correctness, not a feature"
- R4: CodeGen + Runtime — A3 found foreach memory staleness bug (all others missed); A2 forced dissenter self-rebutted all 3 positions
- R5: Integration — minimal controversy, 4:0 consensus
- 34 new ratchet-locked decisions (92 total)

## v1.2.0 (2026-04-01)

### Added
- `graft run <file> --input <json>` — compile and execute a .gft pipeline
- Tree-walking interpreter over FlowNode[] from compiled AST
- Edge transforms at runtime as pure TypeScript functions (select, filter, drop, compact, truncate)
- Parallel execution via `Promise.allSettled` (collects all results, no silent data loss)
- Foreach iteration over list outputs with max_iterations cap
- `--dry-run` mode — simulate execution without spawning Claude subprocesses
- `--verbose` mode — print detailed execution progress
- `--timeout <seconds>` — configurable subprocess timeout (default 5 minutes)
- `--work-dir <dir>` — specify working directory for session data
- Session cleanup before each run (prevents stale data from previous runs)
- Input JSON validation against graph input context schema
- Mock spawner injection via `SpawnerFn` for testing
- File-based data passing via `.graft/session/node_outputs/`
- 36 new tests (171 total)

### Development Process
- Adversarial debate: 4-agent analysis + cross-critique + convergence
- A4-Specialist forced dissenter — self-retracted generateAgent() reuse, full failure strategies, ExecutionContext
- A3-Skeptic caught: stdin.end() showstopper, Promise.allSettled requirement, generateAgent() reuse problem
- 12 new ratchet-locked decisions (58 total)
- ~14 agent calls for v1.2

## v1.1.0 (2026-04-01)

### Added
- `parallel { A B C }` flow control — run nodes concurrently
- `foreach(Node.output.field as var, max_iterations: N) { ... }` — iterate over list outputs
- Multi-field `select(a, b, c)` edge transform — keep multiple fields in one transform
- `FlowNode` discriminated union AST type (node | parallel | foreach)
- 4 new keywords: `parallel`, `foreach`, `as`, `max_iterations`
- Recursive flow parsing with nesting depth enforcement
- Token estimation: parallel = sum, foreach = best 1x / worst Nx
- Codegen: `[parallel]` and `[foreach]` orchestration step labels
- 25 new tests (135 total), 2 new benchmarks (16 total)

### Fixed
- Benchmark bug: removed duplicate SecurityReviewer in parallel_flow.gft

### Development Process
- Adaptive Adversarial Loop: 4-agent debate + Skeptic-only review
- A3-Skeptic found benchmark file bug and foreach 3-part path issue
- A1-Architect forced dissenter reversed position on recursive vs flat FlowNode
- Recursive FlowNode adopted (3-to-1 vote, stronger code-reuse argument)

## v1.0.0 (2026-03-31)

- Initial release: full compiler pipeline (lexer → parser → analyzer → codegen)
- CLI: `graft compile`, `graft check`
- 110 unit tests, 14 benchmarks
- Built via adversarial debate harness (~99 agent calls, 46 ratchet-locked decisions)

## v0.1.0 (2026-03-31)

- Initial compiler implementation
- Lexer, parser, analyzer, codegen
- CLI: graft compile, graft check
- 110 unit tests
- Adversarial debate harness for development
