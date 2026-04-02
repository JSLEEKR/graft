# Code Review — v3.8-R2: Multi-Hop Conditional Chain Estimation (MEDIUM)

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 849 passed, 0 failed

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| MAX_CONDITIONAL_HOPS in constants.ts | MET | Line 17, value 10, shared between estimator and flow-runner |
| flow-runner.ts imports + re-exports | MET | Line 4 import, line 6 re-export |
| ConditionalBranch[] stored (not string[]) | MET | estimator.ts line 27, stores edge.target.branches directly |
| warnings param threaded through | MET | computeFlowCosts(steps, warnings) and getConditionalBranchCosts(source, warnings, visited, depth) |
| Per-branch visited set copies | MET | Line 220: `new Set(visited)` per branch (diamond correctness) |
| Cycle detection with warning (BUDGET_EXCEEDED) | MET | Lines 201-209, cycle message + BUDGET_EXCEEDED code |
| Depth limit with warning | MET | Lines 180-187, depth message + BUDGET_EXCEEDED code |
| done = zero cost terminal | MET | Lines 194-197, pushes 0 to both best/worst arrays |
| Unknown target skipped | MET | Line 214: `if (!node) continue` |
| Retry multiplier in chain | MET | Line 228: `cost * retryMul` for worst case |
| v3.4-R06 preserved (best=min, worst=max) | MET | Line 232: `Math.min(...branchBestCosts), Math.max(...branchWorstCosts)` |
| 12 new tests in tests/v38-r2.test.ts | MET | 12 tests covering all scenarios |

## R-PROC-18 Error Path Tests
| Test | Status | Notes |
|------|--------|-------|
| Cycle -> finite + warning | MET | Test 5: A->B->A cycle, checks cycle message + BUDGET_EXCEEDED code |
| Depth limit -> finite + warning | MET | Test 6: 12-node chain, checks depth warning + finite results |
| Empty chain -> zero cost | MET | Test 7: no conditional edges, base cost only |
| Chain to done -> stops | MET | Test 4 + Test 10: done branch yields zero cost |

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Code Quality Notes
- Recursive getConditionalBranchCosts correctly handles all edge cases
- Per-branch visited set copy prevents false cycle detection on diamond topologies (Test 11)
- Asymmetric chain test (Test 8) validates best!=worst divergence
- Retry multiplier test (Test 9) confirms worst-case inflation within chains
- Unknown target test (Test 12) confirms graceful handling with no warnings
- Helper function `addConditionalEdge` cleanly constructs test programs

## Ratchet Compliance
- All locked decisions respected: YES
- [v3.4-R06] best=min, worst=max preserved: YES
- [v2.1-R01] Constants in src/constants.ts: YES
- [v3.0-R02] ProgramIndex optional param pattern: YES
- Violations: none

## Fix Instructions (if NEEDS_CHANGES)
N/A
