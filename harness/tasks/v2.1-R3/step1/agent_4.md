# A4-Specialist: v2.1-R3 Token Tracking Core

## Convergence Score: 8/10

## Domain Analysis
- Runtime instrumentation at call boundaries (PGO pattern)
- Resource accounting with estimated vs actual (JIT compiler pattern)
- Budget as advisory resource limit (memory arena pattern)
- Token log as trace output (LLVM -fopt-record pattern)

## Key Decisions
- Two-phase extraction: extractCliOutput unwraps CLI layer, extractJson handles inner content
- TokenTracker as standalone class following single-responsibility
- Use TokenEstimator internally in executor rather than passing through RunOptions
- Advisory-only enforcement via isWarning/isCritical getters

## Breaking Change
- Existing test at runner.test.ts asserts --print in args — must update to --output-format
