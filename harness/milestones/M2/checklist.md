# M2: "Prove it works in real scenarios"

> Goal: Demonstrate that Graft is better than manual configuration in real scenarios.

## Checklist

- ~~**M2-1: VS Code extension marketplace** — Excluded (user decision)~~

- [ ] **M2-2: npm org `graft-lang` setup**
  - [ ] Create org on npm web
  - [ ] Migrate package to `@graft-lang/graft` (or publish separately)
  - [ ] Update README/docs

- [ ] **M2-3: Real-world example validation**
  - [x] 3 examples exist (content-pipeline, data-analysis, pr-summarizer) — v5.6
  - [ ] Claude Code e2e verification for each example
  - [ ] README/description per example

- [x] **M2-4: Conditional edge codegen**
  - [x] Router hook generation (condition evaluation → routing decision file)
  - [x] Orchestration describes conditional branching
  - [x] Settings registers router hooks
  - [x] Agent input overrides include conditional targets

- [x] **M2-5: Hook auto-execution verification**
  - [x] PostToolUse `if` pattern syntax confirmed (per Claude Code docs)
  - [x] Verified in M1 e2e test

- [x] **M2-6: Error message improvement**
  - [x] Rustc-style error format (`-->`, `^^^`, `= help:`)
  - [x] "did you mean?" suggestions (Levenshtein-based)

- [x] **M2-7: `graft watch`**
  - [x] Auto-recompile on file changes (debounce 100ms)
  - [x] Watches .gft imports in same directory

- [x] **M2-8: `graft visualize`**
  - [x] Pipeline DAG → Mermaid diagram output
  - [x] Shows nodes (model), edges (transforms), conditional branches, parallel blocks

## Verification Criteria

**"Real-world test"**: In an actual work scenario:
1. Write a `.gft` file (reference existing examples)
2. `graft compile` → run in Claude Code
3. Is the result better than manual configuration?
4. Where are the friction points?
