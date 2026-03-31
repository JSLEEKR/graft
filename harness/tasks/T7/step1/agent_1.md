# A1-Architect: T7 Compiler Pipeline & CLI

## Convergence Score: 4/5

The plan is structurally sound. Two known bugs require mechanical fixes. One design question (writeFiles export) is already resolved in source. No architectural disagreements remain.

---

## 1. compiler.ts Design

### CompileResult Interface

The plan's `CompileResult` is well-designed and should be implemented as specified:

```typescript
export interface CompileResult {
  success: boolean;
  program?: Program;
  report?: TokenReport;
  files?: GeneratedFile[];
  errors: GraftError[];
  warnings: GraftError[];
}
```

Key properties:
- `success` acts as a discriminant for type narrowing at call sites
- `errors` and `warnings` are always arrays (never undefined) -- callers can always iterate without null checks
- `program`, `report`, `files` are optional -- only populated on successful pipeline stages
- When `success: false`, `files` is undefined (codegen never ran or was gated)

### Pipeline Stages

The pipeline is sequential with two error handling modes:

1. **Lex** (throw-on-first-error) -- catch `GraftError`, return `{success: false}`
2. **Parse** (throw-on-first-error) -- catch `GraftError`, return `{success: false}`
3. **Scope check** (error accumulation) -- `ScopeChecker(program).check()` returns `GraftError[]`
4. **Type check** (error accumulation) -- `TypeChecker(program).check()` returns `GraftError[]`
5. **Gate**: if `errors.length > 0`, return `{success: false}` with `program` attached (allows partial inspection)
6. **Token estimation** -- `TokenEstimator(program).estimate()` returns `TokenReport` with `.warnings`
7. **Code generation** -- `generate(program, report, sourceFile)` returns `GeneratedFile[]`

Non-`GraftError` exceptions re-throw (unexpected internal bugs). This is correct -- the compiler should not swallow unknown errors.

### compileAndWrite

Thin wrapper: calls `compile()`, then calls `writeFiles(files, outDir)` on success. The `writeFiles` function is already exported from `src/codegen/codegen.ts` (line 59) -- no new code needed.

---

## 2. Known Bugs to Fix

### BUG-1: TokenEstimator Import Path (BLOCKER)

Plan line 3218 imports from `'./analyzer/tokens.js'`. The actual module is `./analyzer/estimator.js` (confirmed T5-R02, T6-R01, source).

**Fix:** `import { TokenEstimator, TokenReport } from './analyzer/estimator.js';`

### BUG-2: Parser Constructor Signature (BLOCKER)

Plan line 3251 calls `new Parser(tokens, source)`. The Parser constructor accepts only `Token[]` (confirmed T4-R01, source line 18: `constructor(private readonly tokens: Token[]) {}`).

**Fix:** `const parser = new Parser(tokens);`

Both bugs are mechanical one-line fixes. They are the same stale-signature bugs found in T5 and T6.

---

## 3. CLI Design (Commander)

### Structure

Two subcommands sharing the same pipeline:

| Command | Pipeline | Side Effects |
|---------|----------|-------------|
| `graft compile <file> [--out-dir]` | Full pipeline + `writeFiles()` | Writes to disk |
| `graft check <file>` | Full pipeline (codegen runs in-memory) | None |

`check` still runs codegen in-memory. This is intentional -- validates the full pipeline without disk side effects. The cost is negligible.

### Error Output

- Errors to `stderr` via `console.error()`, success output to `stdout` via `console.log()`
- `process.exit(1)` on failure (file-not-found or compilation errors)
- Implicit `process.exit(0)` on success (commander default)
- No `process.exit` in library code (`compile`, `compileAndWrite`) -- only in CLI action handlers

### readSource Helper

Handles file resolution and existence check. Uses `path.resolve()` for relative path handling, `fs.existsSync()` + `fs.readFileSync()` for I/O. Calls `process.exit(1)` on file-not-found.

### toLocaleString('en-US')

The plan uses `.toLocaleString()` without locale argument on some lines and with `'en-US'` implied by T6-R02 convention. The implementation should use `.toLocaleString()` as written in the plan -- it produces comma-separated numbers for readability.

---

## 4. Integration Test Design

### Test Source

Inline `HELLO_GFT` string exercising the full language surface:
- `context` with `max_tokens`
- Two `node` declarations with different models and budgets
- `edge` with `select` + `compact` transforms
- `graph` with `input`, `output`, `budget`

### Test Categories

| Test | Asserts On |
|------|-----------|
| Compiles successfully | `result.success`, empty errors, defined program/report/files |
| Correct file set | `result.files` paths match expected codegen output |
| Token analysis | `report.graphName`, `budget`, `bestCase <= budget`, node count |
| Valid settings JSON | `JSON.parse()` succeeds, model routing, budget values |
| Agent markdown structure | Contains model name, `===NODE_COMPLETE===` marker |
| Hook script content | Contains `jq`, transform field names |
| Rejects invalid programs | `success: false`, non-empty errors for undefined references |

### Design Decisions

- Assert on `CompileResult` properties, not console output -- decoupled from CLI formatting
- Inline source string avoids filesystem path fragility
- Tests are coupled to codegen output format intentionally (integration tests should be)

---

## 5. Verification Checklist

- [ ] Import `TokenEstimator, TokenReport` from `./analyzer/estimator.js` (not `tokens.js`)
- [ ] `new Parser(tokens)` (not `new Parser(tokens, source)`)
- [ ] `writeFiles` is exported from `codegen.ts` -- confirmed, exists at line 59
- [ ] Commander v14 API is stable -- `Command`, `.command()`, `.argument()`, `.option()`, `.action()` all valid
- [ ] `GraftError.format(source)` takes the source string for error formatting -- CLI must pass it
- [ ] All tests should import from `../src/compiler.js` (ESM, .js extension per T1-R09)

---

## 6. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| BUG-1 import path | LOW | Mechanical fix, well-documented |
| BUG-2 parser constructor | LOW | Mechanical fix, well-documented |
| Integration test coupling to codegen output | ACCEPTABLE | Intentional for integration tests |
| `check` running codegen in-memory | NONE | Cheap, validates full pipeline |
| Windows bash hooks | DEFERRED | T6-R05: deferred, Claude Code runs hooks via bash on all platforms |

---

## 7. Files to Create/Modify

| File | Action | Lines (est.) |
|------|--------|-------------|
| `src/compiler.ts` | CREATE | ~55 |
| `src/index.ts` | OVERWRITE | ~95 |
| `tests/integration.test.ts` | CREATE | ~110 |

Total new/modified: ~260 lines. No architectural changes to existing modules.
