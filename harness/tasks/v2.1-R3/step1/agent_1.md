# A1-Architect: v2.1-R3 Token Tracking Core

## Convergence Score: 7/10

## Key Decisions
- D1: TokenTracker as standalone file (src/runtime/token-tracker.ts) — follows v2.1-R1 memory.ts pattern
- D2: Switch --print to --output-format json for structured usage data
- D3: Token parsing in subprocess.ts (parseCliOutput) at the CLI boundary
- D4: TokenTracker owns log file writing via record()
- D5: Advisory-only enforcement via isWarning/isCritical getters

## Critical Issues
- I5 (CRITICAL): Mock spawner breakage — existing mocks returning `{result: "..."}` would be incorrectly parsed as CLI envelopes. Needs envelope detection heuristic.
- I3: Parallel node log ordering — cumulative values depend on async resolution order (acceptable for advisory)
- I1: Double JSON parse risk — outer CLI wrapper, inner result JSON
