# A2-Pragmatist — v2.0-R3 (Score: 8)

## Proposed Changes
- ~25 lines new production code total
- ScopeChecker: memoryNames, memoryFieldsMap, checkNodeWrites, memory branch in reads
- TokenEstimator: 5 lines — memory lookup + continue fix for produces block
- TypeChecker: NO CHANGES

## Key Decisions
- Minimal diff, reuse existing patterns exactly
- No new abstractions — three inline cases is fine
- No namespace collision detection (YAGNI)
- 6 focused tests proposed
