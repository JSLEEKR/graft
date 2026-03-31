# T7 Research: Compiler Pipeline & CLI

## 1. Compiler Pipeline Orchestration

**Pattern: Sequential pipeline with early-exit on fatal errors, error accumulation for analysis.**

- Lexer and Parser use throw-on-first-error (T2-R02, T4-R06) -- catch `GraftError`, return immediately.
- Analyzers (ScopeChecker, TypeChecker) return `GraftError[]` arrays (T5-R01) -- accumulate, then gate codegen.
- TokenEstimator runs only after scope/type pass; its warnings go to a separate array.
- CodeGenerator is pure (no side effects) -- `generate()` returns `GeneratedFile[]`.
- `writeFiles()` is the only side-effecting function, called separately in `compileAndWrite()`.

**Result type:** `CompileResult` with `success`, optional `program`/`report`/`files`, and `errors`/`warnings` arrays. This is a discriminated result -- when `success: false`, `files` is undefined.

## 2. Commander.js CLI Patterns

**Two subcommands sharing the same pipeline:**
- `graft compile <file> [--out-dir]` -- full pipeline + write files to disk.
- `graft check <file>` -- full pipeline minus codegen write (still generates in-memory for validation).

**Key decisions:**
- `readSource()` helper handles file resolution and existence check with `process.exit(1)`.
- Error output goes to `stderr` via `console.error()`, success output to `stdout` via `console.log()`.
- `process.exit(1)` on failure -- no special exit codes beyond 0/1.

## 3. Plan Bug: Parser Constructor

The plan passes `new Parser(tokens, source)` but the actual Parser constructor is `new Parser(tokens)` only (confirmed in source, flagged in common_memory). Must fix in implementation.

## 4. Plan Bug: TokenEstimator Import

The plan imports `TokenReport` from `'./analyzer/tokens.js'` but the actual file is `estimator.ts` (T5-R02). Must import from `'./analyzer/estimator.js'`.

## 5. Integration Testing Pattern

- Inline source string (`HELLO_GFT`) rather than reading from filesystem -- avoids path fragility.
- Test categories: success path (file set, token analysis, JSON validity, markdown structure, hook content), failure path (invalid references produce errors).
- Assert on `CompileResult` properties, not console output -- keeps tests decoupled from CLI formatting.

## 6. compile vs check Distinction

Both call `compile()` which runs the full analysis pipeline. The only difference:
- `compile` command calls `compileAndWrite()` which writes `GeneratedFile[]` to disk.
- `check` command calls `compile()` and only prints diagnostics.

This means `check` still runs codegen in-memory. This is intentional -- it validates the full pipeline without disk side effects.

## 7. Process.exit Patterns

- `process.exit(1)` on file-not-found (in `readSource()`).
- `process.exit(1)` on compilation failure (errors array non-empty).
- Implicit `process.exit(0)` on success (commander default).
- No `process.exit` in library code (`compile`, `compileAndWrite`) -- only in CLI handlers.

## 8. Key Interfaces Summary

| Module | Input | Output |
|---|---|---|
| `Lexer(source)` | `string` | `Token[]` (throws `GraftError`) |
| `Parser(tokens)` | `Token[]` | `Program` (throws `GraftError`) |
| `ScopeChecker(program).check()` | `Program` | `GraftError[]` |
| `TypeChecker(program).check()` | `Program` | `GraftError[]` |
| `TokenEstimator(program).estimate()` | `Program` | `TokenReport` (with `.warnings`) |
| `generate(program, report, sourceFile)` | `Program, TokenReport, string` | `GeneratedFile[]` |
| `writeFiles(files, outDir)` | `GeneratedFile[], string` | `void` (fs side effect) |
