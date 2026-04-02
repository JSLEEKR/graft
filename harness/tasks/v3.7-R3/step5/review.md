# Code Review — v3.7-R3: Multi-hop Conditional Edge Routing

## Verdict: NEEDS_CHANGES

## Test Results
- All tests pass: YES
- Test count: 817 passed, 0 failed

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| Multi-hop loop replacing one-hop routing | MET | flow-runner.ts lines 100-147: for-loop with visited set |
| MAX_CONDITIONAL_HOPS=10 constant | MET | flow-runner.ts line 101 |
| Visited set for cycle detection | MET | flow-runner.ts lines 102-103, 129-133 |
| `done` as terminal target (runtime) | MET | flow-runner.ts line 127: `target === 'done'` breaks loop |
| Fallback alias in chain | MET | flow-runner.ts lines 140-142: `conditionalResult.node !== target` check |
| `done` guard in scope.ts | MET | scope.ts line 187: `branch.target !== 'done'` prevents false SCOPE_UNDEFINED_REF |
| Depth limit error message | UNMET | When MAX_CONDITIONAL_HOPS is exhausted without a cycle, the chain silently stops with no error. The verification checklist calls for "a clear error message." |
| Depth limit test | UNMET | No test exercises a chain of >10 hops to verify the depth limit behavior |
| Scope validation test for `done` target | UNMET | No test verifies that scope.ts allows `done` as a conditional branch target without error |

## Issues Found
### Critical (must fix)
1. **Missing depth-limit error**: flow-runner.ts:107 — When the for-loop exhausts MAX_CONDITIONAL_HOPS iterations without encountering a cycle or terminal condition, execution silently stops. A chain of 11+ non-repeating nodes would be silently truncated with no indication to the user. Add an error message after the loop if it completed all 10 iterations without breaking (i.e., the loop ran to completion because `hop` reached MAX_CONDITIONAL_HOPS).

2. **Missing depth-limit test**: tests/v37-r3.test.ts — No test exercises the MAX_CONDITIONAL_HOPS=10 boundary. Add a test with a chain of 11+ distinct nodes with conditional edges to verify the depth-limit error fires at hop 10.

3. **Missing scope validation test**: tests/v37-r3.test.ts (or existing scope test file) — The scope.ts change at line 187 is correct but untested. A conditional edge targeting `done` would previously produce a false `SCOPE_UNDEFINED_REF` error. Add a test that verifies `ScopeChecker` does NOT report an error when a conditional branch targets `done`.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- [v3.3-R06] evaluateCondition in flow-runner.ts: respected, function signature unchanged
- [v3.3-R07] FlowContext.getConditionalEdge optional method: respected
- [v3.3-R08] Branch selection (first match wins, else fallback): respected
- [v3.0-R20] executeWithFailureStrategy in flow-runner.ts: respected
- [v3.1-R05] Parallel branches use executeWithFailureStrategy: respected
- No violations

## Fix Instructions (if NEEDS_CHANGES)
1. **Add depth-limit error** in `src/runtime/flow-runner.ts`: After the for-loop (after line 147), check if the loop completed all iterations. If the loop variable `hop` equals MAX_CONDITIONAL_HOPS (meaning the loop completed without breaking), push an error: `errors.push(\`Conditional edge chain exceeded maximum depth of ${MAX_CONDITIONAL_HOPS} hops\`)`. One way: add a boolean `exhausted` flag set to true before the loop, set to false inside every `break`, then check after the loop.

2. **Add depth-limit test** in `tests/v37-r3.test.ts`: Create a chain of 11 nodes (N0 -> N1 -> ... -> N10) each with a conditional edge. Verify that an error containing "exceeded" or "maximum" is produced.

3. **Add scope validation test** in `tests/v37-r3.test.ts`: Construct a Program with a conditional edge where one branch targets `done`. Run `ScopeChecker.check()` and verify no errors with code `SCOPE_UNDEFINED_REF` are returned for the `done` target.
