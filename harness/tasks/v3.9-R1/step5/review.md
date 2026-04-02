# Code Review — v3.9-R1: Edge Transforms on Conditional Edges

## Verdict: NEEDS_CHANGES

## Test Results
- All tests pass: YES
- Test count: 872 passed, 0 failed

## Convergence Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| ConditionalEdgeInfo interface added and exported | MET | flow-runner.ts:9-12, exported correctly with branches + transforms fields |
| FlowContext.getConditionalEdge return type updated | MET | flow-runner.ts:17, returns ConditionalEdgeInfo or null |
| Transform + applyTransforms imported | MET | flow-runner.ts:1,4 imports Transform from ast.js and applyTransforms from transforms.js |
| Transforms after condition eval, before target execution | MET | flow-runner.ts:131-135, applied after target resolved (line 128) but before executeWithFailureStrategy (line 144) |
| Not applied on `done` | MET | flow-runner.ts:129, break before transform application when target is 'done' |
| Not applied on cycle | PARTIAL | Transforms ARE applied before cycle detection (line 132 before 138), which matches task description ("applied before cycle detected") but there is no test verifying this |
| executor.ts returns { branches, transforms } | MET | executor.ts:129, closure returns `{ branches: edge.target.branches, transforms: edge.transforms }` |
| SCOPE_TRANSFORM_CONDITIONAL removed from scope.ts | MET | No occurrences in src/ directory |
| SCOPE_TRANSFORM_CONDITIONAL removed from diagnostics.ts | MET | No occurrences in src/ directory |
| Existing tests updated for new interface | MET | v33-r2, v37-r3, v37-r4, v38-r1, v38-r4 all return `{ branches, transforms: [] }` |
| Test: select transform on single-hop conditional | MET | Test 1 |
| Test: transform on else branch | MET | Test 2 |
| Test: no transform when target is done | MET | Test 3 (R-PROC-18 error path) |
| Test: multi-hop chain with transforms | MET | Test 4 |
| Test: backward compat (empty transforms) | MET | Test 5 |
| Test: compact transform on conditional edge | MET | Test 6 (bonus, not in plan) |
| Test: SCOPE_TRANSFORM_CONDITIONAL no longer emitted | MET | Test 7 |
| Test: filter transform on conditional edge | MET | Test 8 |
| Test: transform interaction with fallback alias | UNMET | Plan specifies this test but it is missing |
| Test: transform on cycle (R-PROC-18 error path) | UNMET | Task description requires this under R-PROC-18 but no test exists |

## Issues Found

### Critical (must fix)

1. **Missing test: transform on cycle (R-PROC-18)**: The R-PROC-18 checklist in the task description explicitly requires "Transform on cycle (applied before cycle detected)". The runtime code correctly applies transforms before cycle detection (flow-runner.ts:132-138), but there is no test verifying that transforms are applied when a cycle is subsequently detected. This is an error path test mandated by R-PROC-18.

2. **Missing test: transform interaction with fallback alias**: The v3.9 plan (2026-04-02-graft-v3.9-plan.md, line 34) lists "transform interaction with fallback alias" as one of the ~8 target tests. This test is absent. The compact transform test (test 6) was added instead, which is useful but does not substitute for the planned test.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- [v3.0-R26] SCOPE_TRANSFORM_CONDITIONAL: code removed (not renamed) because transforms on conditional edges are now supported. This is explicitly sanctioned by the v3.9 design spec ratchet impact analysis. No unlock needed.

## Fix Instructions (if NEEDS_CHANGES)

1. **Add cycle + transform test** to `tests/v39-r1.test.ts`: Create a test where node A has a conditional edge to B with transforms, and B has a conditional edge back to A (cycle). Verify that: (a) transforms are applied to A's output in ctx.outputs before the cycle error, (b) the cycle error message is present in errors. This validates the code path at flow-runner.ts:132-138.

2. **Add fallback alias + transform test** to `tests/v39-r1.test.ts`: Create a test where a node fails, its fallback node succeeds, `applyFallbackAlias` stores the fallback output under the original name, and a conditional edge with transforms is followed. Verify that transforms are applied correctly when the output comes from a fallback. This can use the existing `makeCtx` helper with `failNodes` and `failureStrategies` options (add `failureStrategies` to the helper if needed).
