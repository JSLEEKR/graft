# Code Review — v2.1-R1: Cleanup and Refactoring

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 249 passed, 0 failed

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| src/constants.ts with MODEL_MAP, PARTIAL_FIELD_FACTOR, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD | MET | All four constants present with correct values |
| src/utils.ts with fieldsToJsonExample + typeToExample | MET | Both exported, code matches convergence spec exactly |
| src/runtime/memory.ts with standalone loadMemory/saveMemory | MET | Both functions present, signatures match spec |
| agents.ts imports MODEL_MAP from constants | MET | Line 2: `import { MODEL_MAP } from '../constants.js'` |
| agents.ts imports fieldsToJsonExample from utils | MET | Line 3: `import { fieldsToJsonExample } from '../utils.js'` |
| agents.ts local MODEL_MAP removed | MET | grep confirms only definition in constants.ts |
| agents.ts local fieldsToJsonExample/typeToExample removed | MET | grep confirms only definitions in utils.ts |
| agents.ts TOOL_MAP stays local | MET | Lines 5-13, not extracted |
| settings.ts imports MODEL_MAP + budget thresholds from constants | MET | Line 2: imports all three |
| settings.ts no literal 0.8/0.9 | MET | grep confirms no matches |
| executor.ts imports from constants, utils, memory | MET | Lines 7-9 |
| executor.ts local MODEL_MAP removed | MET | grep confirms single definition |
| executor.ts local fieldsToJsonExample/typeToExample removed | MET | grep confirms single definitions |
| executor.ts loadMemory/saveMemory methods removed, imported | MET | Line 9 import, line 246/373 usage |
| executor.ts stale duplication comments removed | MET | grep for "duplicat/extract/copied" finds nothing |
| executor.ts dryRun guard at call site (not in saveMemory) | MET | Line 370: `if (!this.options.dryRun)` wraps saveMemory call |
| saveMemory has no dryRun parameter | MET | grep for dryRun in memory.ts finds nothing |
| estimator.ts imports PARTIAL_FIELD_FACTOR | MET | Line 3 |
| estimator.ts all four 0.3 replaced | MET | grep for `0\.3` in estimator.ts finds zero matches; lines 166, 171, 185, 196 use PARTIAL_FIELD_FACTOR |

## Ratchet Compliance
- All locked decisions respected: YES
- [v2.1-R01] Constants in src/constants.ts: MET
- [v2.1-R02] fieldsToJsonExample/typeToExample in src/utils.ts: MET
- [v2.1-R03] loadMemory/saveMemory standalone in src/runtime/memory.ts: MET
- [v2.1-R04] saveMemory always saves; dryRun guard is caller's responsibility: MET
- [v2.1-R05] PARTIAL_FIELD_FACTOR applies to all per-field fraction estimates: MET
- [v2.1-R06] TOOL_MAP stays in agents.ts: MET
- Violations: none

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Deviations from Convergence Spec
None detected. All new files, modified files, imports, and constant usages match the convergence spec exactly.

## Adversarial Test Proposal (RP-07)

The following test is NOT in the current suite and would strengthen coverage of the refactored code:

**Test: constants.ts PARTIAL_FIELD_FACTOR propagation to select transform estimation**

```ts
it('should use PARTIAL_FIELD_FACTOR consistently for select transform with single field', () => {
  // Construct a program where a node reads the full output of another node,
  // with a select([fieldA]) edge transform. The estimated input should be:
  //   floor(upstreamBudgetOut * min(PARTIAL_FIELD_FACTOR * 1, 1.0))
  // = floor(1000 * min(0.3, 1.0)) = floor(300) = 300
  // If someone changes PARTIAL_FIELD_FACTOR in constants.ts, this test
  // will catch any inconsistency between partial reads and select transforms.
  const source = `
    context Input { field query: String; max_tokens: 1000; }
    node A { reads Input; produces AOut { field x: String; field y: String; } model sonnet; budget_in 2000; budget_out 1000; }
    node B { reads AOut; produces BOut { field z: String; } model sonnet; budget_in 500; budget_out 200; }
    edge A -> B | select(x);
    graph Pipeline { input Input; flow A -> B -> done; output BOut; budget 5000; }
  `;
  // After select(x), estimated input to B should be floor(1000 * min(0.3 * 1, 1.0)) = 300
  // This validates that PARTIAL_FIELD_FACTOR is used in applyTransformReductions,
  // not a hardcoded 0.3.
});
```

This test is valuable because it would break if someone re-introduced a hardcoded 0.3 in `applyTransformReductions` while leaving the import unused, which would compile without error but violate ratchet [v2.1-R05].
