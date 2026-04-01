# A3-Skeptic — v2.0-R3 (Score: 7)

## Issues Identified (8 total)
1. HIGH: Namespace collision (memory vs context vs produces) — ambiguous reads
2. HIGH: Silent zero-token for memory reads in estimator
3. HIGH: No writes validation exists
4. HIGH: Memory field validation for partial reads absent
5. MEDIUM: Error message omits "memory"
6. MEDIUM: Duplicate memory names silently overwrite
7. MEDIUM: Memory name collides with produces name
8. LOW: max_tokens > 0 never checked

## Key Proposal: checkDuplicateNames + checkNameCollisions
- Detect memory/context name collision at declaration time
- Detect memory/produces name collision
- Differentiated writes errors (context vs produces vs undeclared)
- 11 test cases proposed
