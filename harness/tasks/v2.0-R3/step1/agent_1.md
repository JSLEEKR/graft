# A1-Architect — v2.0-R3 (Score: 8)

## Proposed Changes
- ScopeChecker: add memoryNames Set, memoryFieldsMap Map, checkNodeWrites method, memory branch in checkNodeReads
- TokenEstimator: memory branch in getEstimatedIn (memory.maxTokens, 0.3 partial)
- TypeChecker: NO CHANGES
- Error message update: "context or produces output" → "context, produces output, or memory"

## Key Decisions
- Three-way dispatch in checkNodeReads (context/produces/memory) — YAGNI over polymorphic registry
- Separate checkNodeWrites method called from check()
- No namespace collision detection (pre-existing concern, not introduced by this change)
