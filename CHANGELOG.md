# Changelog

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
