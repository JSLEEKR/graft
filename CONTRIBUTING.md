# Contributing to Graft

Graft is in its early design phase. All forms of contribution are welcome.

## Areas Open for Contribution

### 1. Language Design (highest impact)
- Grammar improvement proposals (RFC format)
- Type system extensions
- New abstraction proposals
- Discovering edge cases in existing design

### 2. Specification
- Clarifying ambiguous parts of the spec
- Adding examples
- Comparative analysis with other languages/systems

### 3. Compiler (future)
- Parser implementation
- AST definition
- Token Flow Analyzer
- Claude Code backend code generator

### 4. Benchmarks
- Measuring token savings vs. existing multi-agent approaches
- Validating Graft effectiveness across various domains
- Compilation time benchmarks

### 5. Documentation
- Writing tutorials
- Domain-specific examples (.gft files)
- FAQ

## RFC Process

Language design changes go through an RFC (Request for Comments) process:

1. Create a file named `NNNN-title.md` in the `docs/rfcs/` directory
2. Describe the problem, proposal, alternatives, and trade-offs
3. Create a PR
4. Merge or revise after discussion

## Code Style (for future compiler implementation)

- Language: TBD (Rust, Go, or TypeScript under discussion)
- Testing: unit tests required for all parser rules and analyzers
- Documentation: documentation required for all public APIs

## Issue Labels

- `language-design` -- language design topics
- `specification` -- specification topics
- `compiler` -- compiler implementation
- `example` -- example files
- `question` -- questions/discussions
- `good-first-issue` -- suitable for first-time contributors
