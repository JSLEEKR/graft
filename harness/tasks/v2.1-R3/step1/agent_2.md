# A2-Pragmatist: v2.1-R3 Token Tracking Core

## Convergence Score: 7/10

## Key Decisions
- YAGNI: Don't split actualIn/actualOut — CLI gives combined. Defer to R4.
- Minimal: parseCLIOutput with fallback to extractJson. ~120 LOC total.
- TokenTracker in own file (executor at 438 LOC already)
- Estimates from nodeDecl.budgetIn/budgetOut, not TokenEstimator

## Critical Risk
- Mock spawner backward compat: existing mocks with `{result: "..."}` key collision
- Proposed fix: only treat as CLI envelope if BOTH result AND usage/model/cost_usd present
- This heuristic prevents false positives on node outputs that happen to have a result field
