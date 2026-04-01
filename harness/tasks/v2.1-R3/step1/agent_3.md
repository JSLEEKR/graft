# A3-Skeptic: v2.1-R3 Token Tracking Core

## Convergence Score: 6/10

## Critical Findings
1. HIGH: CLI envelope format unverified — v1.2 research documented {result, session_id, cost_usd} with NO usage field
2. HIGH: Double-parse problem — --output-format json wraps result as string
3. HIGH: executeNode discards SpawnResult — tokenUsage has no propagation path without changes
4. MEDIUM: Budget threading gap — TokenTracker needs graph budget, Executor doesn't receive it
5. MEDIUM: Token log not cleared — cleanSession() only cleans node_outputs/
6. MEDIUM: Dry run estimates unavailable in Executor
7. Breaking: All existing mock spawner tests break with --print to --output-format switch

## Proposed Mitigations
- Multi-layer fallback in parseCLIOutput (envelope -> double-parse -> raw text)
- try-catch on all log I/O to never crash pipeline
- Graceful degradation: if no usage field, tokenUsage=undefined, tracker uses estimates
