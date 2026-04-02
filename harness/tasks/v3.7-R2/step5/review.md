# Code Review — v3.7-R2: Foreach Source Failure Handling

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 807 passed, 0 failed
- Type check (tsc --noEmit): PASS, zero errors

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| Fallback output aliasing under original node name | MET | Lines 96-98: `if (result.node !== flowNode.name) ctx.outputs.set(flowNode.name, result.output)` |
| Remove `?? ctx.input` fallback in foreach | MET | Line 148: now just `ctx.outputs.get(flowNode.source)` |
| Skip guard when source has no output | MET | Lines 149-152: `if (sourceData === undefined) { break; }` |
| 10 tests covering failure strategy x foreach interactions | MET | tests/v37-r2.test.ts: 10 tests |
| No iteration context in errors (deferred) | MET | Correctly not addressed per scope |

## Detailed Change Analysis

### Change 1: Fallback output aliasing (flow-runner.ts:96-98)
- Correct: When `executeWithFailureStrategy` returns a result from a fallback node (e.g., BackupPlanner), `result.node` will be "BackupPlanner" but `flowNode.name` is "Planner". The alias stores the output under "Planner" so downstream foreach can find it via `ctx.outputs.get("Planner")`.
- The `storingExecuteNode` helper in tests correctly simulates executor behavior (stores under `result.node`, not the requested name), which means the test for this bug (test 4) would genuinely fail without the alias fix.

### Change 2: Foreach skip guard (flow-runner.ts:148-152)
- Correct: Removes the dangerous `?? ctx.input` fallback that would attempt to iterate over the program input when a source node was skipped. The `break` silently skips foreach, which is the right behavior when the source was skipped via failure strategy.
- Test 2 (skip: foreach skipped silently) and test 3 (skip: nodes after foreach still run) both verify this behavior.

### Test Quality Assessment
- Tests use a `storingExecuteNode` wrapper that faithfully mimics executor.ts `storeOutput` behavior (stores under `result.node`). This is critical for test 4 (fallback aliasing) to be a valid regression test.
- All 5 failure strategy types are covered: abort (test 1), skip (tests 2-3), fallback (tests 4-5), retry (tests 6-7), retry_then_fallback (test 8).
- Edge cases covered: non-array field (test 9), empty array (test 10).
- Tests 4 and 8 explicitly verify the alias invariant (`ctx.outputs.get('Planner')` equals fallback output).

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- [v3.0-R20] executeWithFailureStrategy in flow-runner.ts: respected, function unchanged
- [v1.2-R03] Promise.allSettled for parallel: respected, parallel handler unchanged
- No violations

## Summary
Two minimal, targeted fixes totaling 7 lines of production code (4 lines for alias + 3 lines for skip guard). Both fixes address real bugs where failure strategies interacted incorrectly with foreach. 10 well-structured tests cover all failure strategy types against foreach behavior. No regressions across the full 807-test suite.
