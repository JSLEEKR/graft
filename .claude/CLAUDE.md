# Graft — Productization Harness

> v1.0-v5.0: Compiler built via adversarial debate (archived in `harness/tasks/`).
> v5.1-v5.8+: Product-focused Ship-Verify-Iterate process.

## Project Info

- **Goal**: Graft — graph-native language for AI agent harness engineering
- **Language**: TypeScript (hand-written recursive descent parser)
- **Current Version**: v5.8.0
- **Phase**: Productization (M2: real-world validation)
- **Roadmap**: `docs/superpowers/specs/2026-04-03-graft-v6-productization-roadmap.md`
- **Milestone Tracking**: `harness/milestones/M{N}/checklist.md`
- **User Guide**: `docs/guide.md`
- **Dev Notes**: `C:\Users\user\OneDrive\Documents\GraftDevNotes\graft-v1-development-notes.md`
- **Blog**: `JSLEEKR/jslee-homepage` → `content/blog/`

## Process: Ship-Verify-Iterate

```
Ship (implement) → Verify (validate) → Iterate (improve)
   │                    │                    │
   TDD              Real scenarios       Remove friction
   Single agent     "Does it work        Fix discovered
                     in 10 minutes?"      issues
```

### When to use multi-agent debate (legacy process)

Only for:
- Breaking API design changes
- New codegen backend architecture
- Cross-cutting architectural shifts

For everything else (features, fixes, docs, deployment): direct implementation with TDD.

Legacy debate harness docs preserved in `harness/tasks/` and `harness/common_memory.md`.

## Current Milestone: M2 — "Prove it works in real scenarios"

M1 ("You can install it and run it") completed 2026-04-03.

Remaining M2 items:
1. **M2-2**: npm org `graft-lang` setup
2. **M2-3**: Real-world example e2e verification

Completed: M2-4 (conditional codegen), M2-5 (hook verification), M2-6 (error messages), M2-7 (watch), M2-8 (visualize).

See `harness/milestones/M2/checklist.md` for details.

## Architecture

```
.gft Source → Lexer → Parser → AST → Analyzers → Codegen → .claude/ output
                                        │
                                        ├── ScopeChecker
                                        ├── TypeChecker
                                        ├── TokenEstimator
                                        └── GraphChecker

Runtime: Executor → FlowRunner → subprocess (claude CLI)
LSP: graft-lsp (hover, completions, go-to-def, rename, references, code actions)
```

## Key Files

| Area | Files |
|------|-------|
| CLI | `src/index.ts` (commander) |
| Compiler | `src/compiler.ts` |
| Parser | `src/lexer/lexer.ts`, `src/parser/parser.ts`, `src/parser/ast.ts` |
| Analyzers | `src/analyzer/{scope,types,estimator,graph-checker}.ts` |
| Codegen | `src/codegen/{orchestration,agent,hooks,settings}.ts` |
| Runtime | `src/runtime/{executor,flow-runner,subprocess,transforms,memory}.ts` |
| LSP | `src/lsp/server.ts`, `src/lsp/features/` |
| Format | `src/format.ts` (formatExpr, formatTokenReport) |

## Conventions

- Tests: `vitest`, files in `tests/`, named `v{XX}-r{N}.test.ts` for versioned features
- Commits: `feat(M2): description` for milestone work, `fix: description` for fixes
- No barrels except `src/types.ts`
- Exhaustive `never` defaults on all Expr switch dispatchers
- Strict equality (`===`/`!==`) in runtime
- Variable-first resolution in expression evaluation

## Ratchet Policy (v6.0+)

Only lock decisions that affect users:
- CLI command names and flags
- Generated file paths and formats
- Package exports and public API
- `.gft` language syntax

Do NOT lock internal implementation details.

Active ratchets: `harness/common_memory.md`
Archived: `harness/archived_ratchets.md`
