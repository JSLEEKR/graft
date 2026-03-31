# Common Memory — Graft Compiler v1
## Last updated: T6 completed

## Ratchet-Locked Decisions

### T1: Scaffolding
- [T1-R01] tsc only — [T1-R02] ESM — [T1-R03] NodeNext — [T1-R04] explicit vitest imports
- [T1-R05] shebang — [T1-R06] forceConsistentCasingInFileNames — [T1-R07] strict
- [T1-R08] no barrel exports — [T1-R09] .js import extensions

### T2: Lexer
- [T2-R01] GraftError extends Error — [T2-R02] throw-on-first-error (lexer/parser)
- [T2-R03] tokens.ts/lexer.ts separate — [T2-R04] diagnostics.ts dependency-free
- [T2-R05] float digit guard — [T2-R06] SINGLE_CHAR module scope
- [T2-R07] ASCII error format — [T2-R08] Token.location as SourceLocation
- [T2-R09] KEYWORDS Record — [T2-R10] maximal munch

### T3: AST
- [T3-R01] single ast.ts — [T3-R02] SourceLocation from diagnostics
- [T3-R03] interfaces+unions — [T3-R04] kind/type discriminants
- [T3-R05] primitive.name narrowed — [T3-R06] domain.name narrowed — [T3-R07] Float only range
- [T3-R08] mutable — [T3-R09] no visitor — [T3-R10] flow string[] — [T3-R11] EdgeTarget union
- [T3-R12] no types-only test

### T4: Parser
- [T4-R01] Parser(Token[]) only — [T4-R02] expectIdentifierOrKeyword() for values
- [T4-R03] parseProduces consumes keyword — [T4-R04] done required
- [T4-R05] KEYWORD_TYPES Set — [T4-R06] throw-on-first-error — [T4-R07] LL(1)+LL(2) inline structs

### T5: Analyzer
- [T5-R01] error accumulation (GraftError[]) — [T5-R02] estimator.ts not tokens.ts
- [T5-R03] graph input/output in ScopeChecker — [T5-R04] per-node budgetIn warning
- [T5-R05] three-class decomposition

### T6: Code Generator
- [T6-R01] import from analyzer/estimator.js — [T6-R02] toLocaleString('en-US')
- [T6-R03] MODEL_MAP duplicated (no shared module) — [T6-R04] default model pass-through
- [T6-R05] bash hooks; Windows compat deferred to T7

## Recurring Patterns
- A3-Skeptic catches critical bugs every task: GraftError extends (T2), keyword collision (T4), retry cost (T5), import path + locale (T6)
- YAGNI wins consistently across all tasks
- Plan's test helpers contain stale constructor signatures (found T5, T6)
- Convergence agents increasingly write code directly (T3, T5, T6)

## Review Feedback
- T1-T6: ALL PASS. Test counts: 5 → 31 → 31 → 64 → 78 → 101

## Key Facts
- DAG: diagnostics → tokens → lexer → ast → parser → scope/types/estimator → codegen → compiler — HIGH
- Codegen imports from estimator.js for TokenReport — HIGH

## Failed Approaches
- ts-node, pre-created dirs, merging tokens/lexer, LexResult, readonly AST, location on Condition/Transform, expectIdentifier for all, source param in parser, retry cost at v1, MODEL_MAP extraction

## Notes for T7-T8
- T7: compiler.ts orchestrates lex→parse→analyze→codegen; CLI with commander
- T7: revisit resolveJsonModule, tsx, Windows bash hooks
- T7: test helper must use new Parser(tokens) not new Parser(tokens, source)
- T8: E2E test with hello.gft → .claude/ output verification
