# Graft — Productization Harness

> v1.0-v5.0: Compiler built via adversarial debate (archived in `harness/tasks/`).
> v6.0+: Product-focused Ship-Verify-Iterate process.

## Project Info

- **Goal**: Graft — graph-native language for AI agent harness engineering
- **Language**: TypeScript (hand-written recursive descent parser)
- **Current Version**: v5.0.0 (quality + unification release)
- **Phase**: Productization (M1: install & run)
- **Roadmap**: `docs/superpowers/specs/2026-04-03-graft-v6-productization-roadmap.md`
- **Milestone Tracking**: `harness/milestones/M{N}/checklist.md`
- **Dev Notes**: `C:\Users\user\OneDrive\Documents\GraftDevNotes\graft-v1-development-notes.md`
- **Blog**: `JSLEEKR/jslee-homepage` → `content/blog/`

## Process: Ship-Verify-Iterate

```
Ship (구현)  →  Verify (검증)  →  Iterate (개선)
   │                │                  │
   TDD            실제 시나리오       마찰 제거
   단일 에이전트    "10분 안에 되는가?"  발견된 문제 수정
```

### When to use multi-agent debate (legacy process)

Only for:
- Breaking API design changes
- New codegen backend architecture
- Cross-cutting architectural shifts

For everything else (features, fixes, docs, deployment): direct implementation with TDD.

Legacy debate harness docs preserved in `harness/tasks/` and `harness/common_memory.md`.

## Current Milestone: M1 — "설치하고 돌려볼 수 있다"

Priority order:
1. **M1-2**: Claude Code 출력 검증 (compile 결과가 실제로 동작하는가?)
2. **M1-4**: e2e 데모 기록
3. **M1-1**: npm publish
4. **M1-3**: README 재작성 (10분 Getting Started)
5. **M1-5**: VS Code 확장 배포
6. **M1-6**: `graft init` scaffolding

See `harness/milestones/M1/checklist.md` for details.

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
- Commits: `feat(M1): description` for milestone work, `fix: description` for fixes
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
