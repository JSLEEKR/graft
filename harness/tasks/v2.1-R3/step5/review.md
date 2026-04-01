# Code Review — v2.1-R3: Token Tracking Core

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 282 passed, 0 failed
- TypeScript compilation: clean (no errors)

## Convergence Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| TokenUsage interface in subprocess.ts | MET | Lines 58-61, exact match to spec |
| parseCLIOutput with heuristic envelope detection | MET | Lines 63-90, checks `result` AND (`usage`/`model`/`cost_usd`) |
| Graceful fallback to extractJson for raw output | MET | Line 88, falls through correctly |
| TokenTracker class in token-tracker.ts | MET | Exact match to convergence spec — constructor, record(), fraction, isWarning, isCritical, getSummary() |
| TokenTracker log writing with appendFileSync + try-catch | MET | Line 39 |
| Executor: --output-format json (replacing --print) | MET | executor.ts line 289 |
| Executor: parseCLIOutput replaces extractJson (both paths) | MET | Success path (line 333) and non-zero exit path (line 309) |
| Executor: tracker field with definite assignment | MET | Line 58 (`private tracker!: TokenTracker`) |
| Executor: token log cleared on session start | MET | Line 114 (`writeFileSync(tokenLogPath, '')`) |
| Executor: record tokens after storeOutput (real path) | MET | Lines 338-339 |
| Executor: record tokens in dry-run path | MET | Lines 274-275 |
| Executor: budget warnings in verbose mode | MET | Lines 341-346 |
| NodeResult.tokenUsage field | MET | Line 29 |
| RunResult.tokenUsage field | MET | Lines 39-44 |
| runner.ts: no changes needed | MET | No changes made |
| Existing test: --print assertion updated | MET | runner.test.ts line 328 uses `--output-format` |
| extractJson import removed from executor.ts | MET | No references to extractJson in executor.ts |

## Test Coverage Assessment

### parseCLIOutput tests (6 tests)
- Structured output with usage: covered
- Structured output without usage: covered
- Raw JSON (backward compat): covered
- result as string with inner JSON: covered
- result as object: covered
- Non-JSON text fallback: covered

### TokenTracker tests (8 tests)
- record with actual: covered
- record without actual (estimate fallback): covered
- cumulative tracking: covered
- isWarning at 80%: covered
- isCritical at 90%: covered
- not warning below 80%: covered
- fraction 0 when budget 0: covered
- getSummary structure: covered

### Token log writing tests (1 test)
- Log file created with correct format: covered
- Format validation (Node name, estimated, actual, cumulative): covered

### Executor integration tests (4 tests)
- RunResult includes tokenUsage after dry run: covered
- perNode entries match executed nodes: covered
- Token log file created: covered
- Mock spawner with CLI envelope returns tokenUsage: covered

All convergence-specified test targets are covered. Total new tests: 19.

## Issues Found

### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES

| Ratchet | Status |
|---------|--------|
| [v2.1-R11] TokenUsage + parseCLIOutput with heuristic detection | Compliant |
| [v2.1-R12] TokenTracker standalone in token-tracker.ts | Compliant |
| [v2.1-R13] Token log cleared on session start, appended per node | Compliant |
| [v2.1-R14] RunResult.tokenUsage with budget/consumed/fraction/perNode | Compliant |
| [v2.1-R15] Budget enforcement advisory only; no hard abort | Compliant (verbose logging only) |
| [v2.1-R16] Estimates from budgetIn/budgetOut, not TokenEstimator | Compliant |
| [v2.1-R17] Switch from --print to --output-format json | Compliant |
- Violations: none

## Deviations from Convergence Spec
None. Implementation is character-for-character faithful to the convergence spec across all three files.

## Adversarial Test Case (RP-07)

Proposed: A mock spawner returning output with a `result` field but NO metadata fields (no `usage`, `model`, or `cost_usd`) should NOT be treated as a CLI envelope. This tests the heuristic's false-positive guard. The existing test "raw JSON without metadata fields" partially covers this, but a more targeted case would be:

```typescript
it('object with result but no metadata is NOT treated as envelope', () => {
  const stdout = JSON.stringify({ result: "my-actual-output", extra: "data" });
  const out = parseCLIOutput(stdout);
  // Should fall through to extractJson, returning the whole object
  expect(out.content).toEqual({ result: "my-actual-output", extra: "data" });
  expect(out.tokenUsage).toBeUndefined();
});
```

This case validates A3's backward-compatibility concern from convergence disagreement resolution #1. Not blocking — existing coverage is sufficient.
