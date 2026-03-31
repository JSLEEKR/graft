# T7 Research: Compiler Pipeline & CLI

## 1. Module Wiring (compiler.ts)

Plan imports `TokenEstimator, TokenReport` from `./analyzer/tokens.js` -- **wrong path**. Actual location is `./analyzer/estimator.js` (per T5-R02, T6-R01, confirmed in source). The `TokenReport` interface and `TokenEstimator` class both live in `src/analyzer/estimator.ts`.

All other imports are correct:
- `Lexer` from `./lexer/lexer.js`
- `Parser` from `./parser/parser.js` (takes `Token[]` only, no `source` param)
- `ScopeChecker` from `./analyzer/scope.js`
- `TypeChecker` from `./analyzer/types.js`
- `generate, GeneratedFile, writeFiles` from `./codegen/codegen.js`
- `GraftError` from `./errors/diagnostics.js`
- `Program` from `./parser/ast.js`

## 2. Known Bug: Parser Constructor

Plan line 3252: `new Parser(tokens, source)` -- **wrong**. Parser constructor is `Parser(tokens: Token[])` only (T4-R01, confirmed in source line 18). Must be `new Parser(tokens)`. This is the same stale signature bug from T5/T6.

## 3. CompileResult Design

The plan's `CompileResult` type is well-designed:
- `success` boolean discriminant enables typed narrowing
- `errors`/`warnings` always present (empty arrays, never undefined) -- good API
- Optional `program`, `report`, `files` -- only populated on success
- Catches `GraftError` at lex/parse (throw-on-first-error), accumulates at analyze (error arrays)

One minor issue: `check` command still runs codegen (via `compile()`). The plan generates files but never writes them. This is acceptable -- codegen is cheap and `check` just skips `writeFiles`. No change needed.

## 4. Error Handling Strategy

Plan catches `GraftError` and converts to `CompileResult` -- correct approach. Non-GraftError exceptions re-throw (unexpected bugs). This matches the two error modes:
- Lexer/Parser: throw-on-first-error (T2-R02, T4-R06)
- Analyzer: returns `GraftError[]` arrays (T5-R01)

## 5. Commander.js v14

Package.json has `commander ^14.0.0`. v14 API is stable: `Command`, `.command()`, `.argument()`, `.option()`, `.action()`. Plan's usage is standard. No breaking changes vs v12/v13.

## 6. writeFiles Export

Plan imports `writeFiles` from codegen.ts. Need to verify it exists.

## 7. Integration Tests

Plan's test source (`HELLO_GFT`) exercises the full pipeline: context, two nodes, edge with transforms, graph. Tests cover:
- Success path (compile, file list, token report, settings JSON, agent markdown, hook script)
- Failure path (undefined context reference)

File path assertions assume codegen output format -- these are coupled to codegen implementation but that is intentional for integration tests.

## 8. Fixes Required During Implementation

| # | Fix | Severity |
|---|-----|----------|
| 1 | Import `TokenEstimator, TokenReport` from `./analyzer/estimator.js` not `./analyzer/tokens.js` | BLOCKER |
| 2 | `new Parser(tokens)` not `new Parser(tokens, source)` | BLOCKER |
| 3 | Verify `writeFiles` is exported from codegen.ts; if not, implement it | CHECK |
| 4 | `toLocaleString()` in CLI -- plan uses it, matches T6-R02 convention | OK |

## 9. Windows Compatibility (T6-R05)

Plan deferred Windows bash hook compat to T7. The CLI generates `.sh` hook scripts. For v1, this is acceptable -- Claude Code runs hooks via bash on all platforms. No changes needed now.
