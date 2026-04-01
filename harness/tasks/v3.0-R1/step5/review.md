# Code Review — v3.0-R1: Pipeline Split + ProgramIndex Threading

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 384 passed, 0 failed (376 existing + 8 new)

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| Split compile() into compileToProgram() + compileAndGenerate() | MET | compiler.ts lines 26-126, clean separation |
| ProgramResult { success, program?, index?, report?, errors, warnings } | MET | Lines 13-20, all fields present and typed correctly |
| CompileResult extends ProgramResult with files? | MET | Lines 22-24 |
| compile() = thin alias for compileAndGenerate() | MET | Lines 123-126, single-line delegation |
| GRAPH_MISSING only in compileAndGenerate(), NOT compileToProgram() | MET | Lines 106-115 in compileAndGenerate(); compileToProgram has no graph check |
| ProgramIndex constructed once after resolve, before analyzers | MET | Line 70, between resolve block and ScopeChecker |
| Optional index? on ScopeChecker(program, index?) | MET | scope.ts line 15 |
| Optional index? on TokenEstimator(program, index?) | MET | estimator.ts line 27 |
| Optional index? on Executor(program, options, index?) | MET | executor.ts line 64 |
| ?? fallback pattern on all three constructors | MET | scope.ts:17, estimator.ts:29, executor.ts:67 |
| TypeChecker NOT touched (ratchet v2.2-R05) | MET | compiler.ts line 77: `new TypeChecker(program).check()` — no index param |
| RuntimeState { outputs, input } in prompt-builder.ts | MET | prompt-builder.ts lines 4-7 |
| PromptContext extends RuntimeState | MET | prompt-builder.ts lines 9-11 |
| FlowContext extends RuntimeState | MET | flow-runner.ts lines 5-7 |
| LSP uses compileToProgram() | MET | server.ts line 10 import, line 34 call |
| LSP: no GRAPH_MISSING filter | MET | Old filter removed; compileToProgram never emits GRAPH_MISSING |
| LSP uses result.index (no new ProgramIndex()) | MET | server.ts line 40: `result.index` from compileToProgram |
| runner.ts passes compileResult.index to Executor | MET | runner.ts line 32: `compileResult.index`, line 51: passed as 3rd arg |
| 8 new tests in pipeline.test.ts | MET | 5 compileToProgram + 2 compileAndGenerate + 1 backward compat |

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- [v3.0-R01] compileToProgram() does NOT check GRAPH_MISSING: CONFIRMED (no graph check in function body)
- [v3.0-R02] ProgramIndex optional param with ?? fallback: CONFIRMED (all 3 constructors)
- [v3.0-R03] RuntimeState in prompt-builder.ts, not new file: CONFIRMED (lines 4-7)
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex: CONFIRMED (no index param)
- [v2.2-R18] LSP GRAPH_MISSING handling: SUPERSEDED — old approach (filter after compile()) replaced by cleaner approach (compileToProgram() never emits it). Semantically equivalent, strictly better.
- Violations: none

## Detailed Observations

1. **compiler.ts** is cleanly structured: compileToProgram (lex-parse-resolve-analyze) returns ProgramResult, compileAndGenerate adds GRAPH_MISSING guard + codegen, compile is a one-liner alias, compileAndWrite unchanged.

2. **LSP server.ts** change is minimal and correct: import switched from compile to compileToProgram, GRAPH_MISSING filter removed (no longer needed), cache now stores result.index directly instead of constructing a new ProgramIndex. The `if (result.program && result.index)` guard is correct — index is undefined on parse/resolve errors.

3. **runner.ts** correctly extracts `compileResult.index` (line 32) and passes it to Executor constructor (line 51). The index may be undefined if compilation failed before ProgramIndex construction, but the early return on `!compileResult.success` (line 29) prevents that path.

4. **Test coverage** is thorough: tests verify success case, library file (no graph, no GRAPH_MISSING), analysis error (index present), parse error (no index), resolve error (no index), compileAndGenerate with files, compileAndGenerate GRAPH_MISSING for library, and backward compatibility.

5. **No scope creep**: only the files listed in the convergence spec were modified. No unrelated refactoring or feature additions.
