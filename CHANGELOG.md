# Changelog

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
