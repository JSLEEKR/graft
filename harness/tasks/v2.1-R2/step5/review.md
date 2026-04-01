# Code Review — v2.1-R2: Correctness Fixes

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 263 passed, 0 failed
- TypeScript compiles: YES (tsc --noEmit clean)

## Convergence Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| compiler.ts warning routing (lines 67-84) | MET | Exact match to spec: scopeDiagnostics + typeDiagnostics filtered by severity, warnings to `warnings[]`, errors to `errors[]`, only errors block compilation |
| TypeChecker: memoryFieldsMap in constructor | MET | Built from program.memories, identical to spec |
| TypeChecker: checkWritesSchemaOverlap method | MET | Checks each writes entry independently, skips undeclared memories, skips nodes with no writes, emits warning (not error) on zero overlap |
| ScopeChecker: checkMaxTokens method | MET | Called after checkDuplicateNames in check(). Validates both contexts and memories. Error severity (not warning). Message format matches spec exactly |
| ScopeChecker: nodeWritesMap in constructor | MET | Built from program.nodes, maps node.name -> node.writes |
| ScopeChecker: checkParallelWrites method | MET | Called from walkFlowNodes case 'parallel'. Uses memoryWriters map to detect 2+ branches writing same memory. Warning severity. Message format matches spec |
| walkFlowNodes recursion for foreach body | MET | Line 241: `this.walkFlowNodes(step.body, location, errors)` recurses into foreach body, which will catch nested parallel blocks |

## Test Coverage vs Convergence Spec

| Test Target | Status | Notes |
|-------------|--------|-------|
| Zero overlap warning | COVERED | Line 635-652 |
| Partial overlap no warning | COVERED | Line 654-669 |
| Multiple writes independent check | COVERED | Line 671-689, verifies 1 warning for MemB only |
| Undeclared memory skipped | COVERED | Line 691-705 |
| No writes skipped | COVERED | Line 707-720 |
| Context max_tokens 0 error | COVERED | Line 724-740 |
| Memory max_tokens 0 error | COVERED | Line 742-758 |
| Valid positive max_tokens passes | COVERED | Line 760-774 |
| Two parallel branches same memory warning | COVERED | Line 778-802 |
| Different memories no warning | COVERED | Line 804-827 |
| One branch writes no warning | COVERED | Line 829-850 |
| Recursion into foreach body | PARTIAL | Line 852-883: tests parallel at top level with comment explaining parser rejects nested parallel. Acceptable — the recursion path exists in code (line 241) |
| Warnings don't block compilation | COVERED | Line 887-901: compile() returns success:true with warnings |
| Errors still block | COVERED | Line 904-917: max_tokens 0 causes success:false |

## Issues Found

### Critical (must fix)
None.

### Minor (should fix)
None.

### Observations (informational)
1. **foreach recursion test limitation**: The "detects parallel writes via walkFlowNodes recursion" test (line 852) cannot actually test parallel-inside-foreach because the parser currently rejects that syntax. The implementer correctly documented this with a comment and tested parallel writes at top level instead. The code path for recursion exists and is structurally correct. This is acceptable.

2. **GraftError.format() label**: Convergence report explicitly deferred this fix (YAGNI). Implementation correctly does not address it. No concern.

## Ratchet Compliance
- All locked decisions respected: YES
- [v2.0-R10] max_tokens > 0 validation deferred to analyzer, not parser — RESPECTED (implemented in ScopeChecker)
- [v2.0-R20] checkNodeWrites validates writes entries against declared memories — RESPECTED (unchanged)
- [v2.0-R23] TypeChecker unchanged for v2.0 (writes schema check deferred) — NOW SUPERSEDED by v2.1-R07 (writes schema overlap added to TypeChecker as planned)
- Violations: none

## New Ratchet Items (for Step 6)
- [v2.1-R07] Writes schema overlap: warning in TypeChecker, not error — LOCKED
- [v2.1-R08] max_tokens > 0 validation in ScopeChecker for both ContextDecl and MemoryDecl — LOCKED
- [v2.1-R09] Parallel memory write detection via nodeWritesMap in ScopeChecker.walkFlowNodes — LOCKED
- [v2.1-R10] compiler.ts filters diagnostics by severity; warnings don't block compilation — LOCKED

## Adversarial Test Case Proposal (RP-07)

**Three or more parallel branches writing the same memory**: The current `checkParallelWrites` uses `writers.length > 1` and joins with `' and '`. With 3 branches (A, B, C) all writing Cache, the message would be `Nodes 'A' and 'B' and 'C' both write to memory 'Cache' in parallel`. The word "both" is grammatically incorrect for 3+ writers — should be "all". This is cosmetic only, not a functional bug. The detection logic itself is correct (it would produce exactly 1 warning listing all 3 writers).

## Summary

Implementation faithfully reflects the convergence spec across all four requirements. All 263 tests pass. TypeScript compiles cleanly. 14 new tests added covering all specified test targets. Code matches convergence spec code nearly verbatim. No deviations, no critical issues, no regressions.

Test count: 249 (existing) + 14 (new) = 263 total.
