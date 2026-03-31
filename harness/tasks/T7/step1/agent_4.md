# A4-Specialist Analysis: T7 Compiler Pipeline & CLI

## Convergence Score: 4/5

The plan is well-structured and mostly correct. Two known blockers have already been identified (estimator import path, Parser constructor signature). The remaining design is sound with only minor observations. High confidence this will converge quickly after applying the two known fixes.

---

## 1. Pipeline Ordering: CORRECT

The plan's `compile()` pipeline runs:

1. Lex (throw on error) -> early return
2. Parse (throw on error) -> early return
3. ScopeChecker (accumulate errors)
4. TypeChecker (accumulate errors)
5. Gate: if errors.length > 0, return failure
6. TokenEstimator (warnings only)
7. CodeGenerator (pure)

This ordering is correct per the DAG in common_memory (`diagnostics -> tokens -> lexer -> ast -> parser -> scope/types/estimator -> codegen -> compiler`). Scope and type checking both run before gating, which means all analysis errors are reported in a single pass rather than requiring multiple compilations. TokenEstimator runs after the error gate, which is correct since estimation on an invalid program would produce meaningless results.

**Verdict: No changes needed.**

## 2. Error Handling: Dual-Strategy Correctly Implemented

- **Lex/Parse**: `try/catch` with `GraftError` instanceof check. Non-GraftError exceptions re-throw (correct -- those are internal bugs, not user errors). Returns `CompileResult` with `success: false`.
- **Analyze**: `ScopeChecker.check()` and `TypeChecker.check()` return `GraftError[]`. Errors pushed into accumulator array. Gated before codegen.
- **TokenEstimator**: Warnings (not errors) pushed to separate `warnings` array. Not gated.

This matches T2-R02 (throw-on-first-error for lexer/parser) and T5-R01 (error accumulation for analyzers).

**Verdict: No changes needed.**

## 3. CompileResult Type: Well-Typed with One Observation

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

- `errors` and `warnings` are always-present arrays (never undefined) -- good API design, consumers don't need null checks.
- Optional `program`/`report`/`files` are only populated on success path.
- `success: boolean` enables discriminated narrowing.

**Observation**: The type uses `boolean` rather than a true discriminated union (`{ success: true; program: Program; report: TokenReport; files: GeneratedFile[]; ... } | { success: false; ... }`). This means TypeScript won't narrow the optional fields after checking `result.success === true` without explicit `!` assertions. The plan's own test code uses `result.files!` and `result.report!` which confirms this is a known trade-off. For v1, this is acceptable -- a full discriminated union would be more type-safe but adds implementation complexity. **No change needed for v1.**

## 4. Known Bug #1: TokenEstimator Import Path -- BLOCKER

**Plan line 3218**: `import { TokenEstimator, TokenReport } from './analyzer/tokens.js';`
**Actual**: `TokenEstimator` and `TokenReport` are in `src/analyzer/estimator.ts` (confirmed in source, T5-R02, T6-R01).
**Fix**: `import { TokenEstimator, TokenReport } from './analyzer/estimator.js';`

## 5. Known Bug #2: Parser Constructor Signature -- BLOCKER

**Plan line 3251**: `new Parser(tokens, source)`
**Actual**: `Parser` constructor is `Parser(tokens: Token[])` only (confirmed in source line 18, T4-R01).
**Fix**: `new Parser(tokens)`

## 6. CLI Output Format: Matches Spec

The CLI uses:
- `console.error` for error output (stderr) -- correct.
- `console.log` for success output (stdout) -- correct.
- `process.exit(1)` on failure, implicit 0 on success -- matches spec (no special exit codes).
- `err.format(source)` for error display -- confirmed `GraftError.format(source: string)` exists in `src/errors/diagnostics.ts` with ASCII art pointer format (T2-R07).
- `toLocaleString()` for number formatting in token analysis -- matches T6-R02 convention used in `src/codegen/orchestration.ts`.

**Observation on `check` command description**: The `.description()` says "no generation" but `check` still calls `compile()` which runs codegen in-memory. This is intentional per research_arch.md section 6 -- codegen is cheap and `check` validates the full pipeline without disk side effects. The description is slightly misleading but harmless for v1.

**Observation on `readSource`**: Uses `fs.existsSync` + `fs.readFileSync` rather than a single try/catch on `readFileSync`. This is fine -- the existence check gives a cleaner error message than a caught ENOENT.

## 7. `writeFiles` Export: Verified

`writeFiles` is exported from `src/codegen/codegen.ts` (confirmed in source, line 59). The plan's import `{ generate, GeneratedFile, writeFiles }` is correct.

## 8. Integration Tests: Adequate for V1

The test suite covers:
- **Success path**: compile result properties, file set completeness, token analysis values, settings JSON validity, agent markdown structure, hook script content.
- **Failure path**: undefined context reference produces errors.

**Observations**:
- Tests assert on `CompileResult` properties, not console output -- good decoupling from CLI formatting.
- Test source `HELLO_GFT` exercises all major language features: context, two nodes, edge with transforms (select, compact), graph.
- File path assertions are coupled to codegen output format -- acceptable for integration tests.
- No test for the `compileAndWrite` function (would require fs mocking or temp dirs). This is acceptable since `compileAndWrite` is trivial (calls `compile` + `writeFiles`, both individually tested).
- No test for lex errors (e.g., unterminated string). A lex-error test would increase confidence but is not strictly necessary since lexer has its own unit tests.

**Minor gap**: No test for warnings path (e.g., a node whose budgetIn exceeds overall budget). This would exercise the `warnings` array population but is low priority since estimator has its own unit tests.

## 9. `src/index.ts` Modification

Current `src/index.ts` is a placeholder (`console.log('graft v0.1.0')`). Plan fully overwrites it with CLI code. This is correct -- the placeholder was scaffolding from T1.

The plan imports `commander` which must be in `package.json`. Research confirms `commander ^14.0.0` is present.

## 10. Missing: `resolveJsonModule` Consideration

Common_memory notes "T7: revisit resolveJsonModule". The plan's CLI uses `commander` version from `.version('0.1.0')` as a hardcoded string rather than reading from `package.json`. This avoids the need for `resolveJsonModule` in tsconfig. **Correct choice for v1.**

---

## Summary of Required Fixes

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Import path: `./analyzer/tokens.js` -> `./analyzer/estimator.js` | BLOCKER | Change import in compiler.ts |
| 2 | Parser constructor: `new Parser(tokens, source)` -> `new Parser(tokens)` | BLOCKER | Remove `source` argument |

## Summary of Observations (No Action Needed)

| # | Observation | Verdict |
|---|-------------|---------|
| A | `CompileResult` uses `boolean` not discriminated union | Acceptable for v1 |
| B | `check` description says "no generation" but runs codegen in-memory | Intentional, harmless |
| C | No integration test for `compileAndWrite` | Trivial function, acceptable |
| D | No integration test for warnings path or lex error path | Covered by unit tests |
| E | `resolveJsonModule` avoided via hardcoded version string | Correct choice |
