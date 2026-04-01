# A2-Pragmatist Cross-Critique — v1.2

## Key Positions
- Agree with A3: Promise.allSettled, stdin.end() are must-haves
- Disagree with A1: 6 files is too many, input validation unnecessary, MODEL_MAP extraction violates T6 ratchet
- Disagree with A3: No pre-flight check (spawn ENOENT is fine), no timeout (defer), no session cleanup (fresh dir)
- Disagree with A4: generateAgent() reuse is WRONG — it produces markdown with YAML frontmatter and ===NODE_COMPLETE=== sentinels. Runtime needs plain text prompt.
- Disagree with A4: ExecutionContext class unnecessary, plain Map suffices

## Revised Approach
- 2 files: src/runner.ts (~180 lines) + src/runner/transforms.ts (~70 lines)
- Promise.allSettled for parallel
- stdin.end() immediately
- No validate.ts, no types.ts, no Executor class, no retry/fallback, no timeout
- MODEL_MAP duplicated per T6 ratchet
- Do NOT reuse generateAgent() — build minimal buildPrompt()
- Mock spawner as function parameter, not interface
