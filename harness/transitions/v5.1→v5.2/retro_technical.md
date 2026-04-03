# v5.1 → v5.2 Technical Retrospective

## Summary

v5.2 fixes parallel pipeline codegen — the core issue was that `orchestration.ts` lost track of predecessor nodes after a `parallel` block (`prev = null`), causing edge transforms and input paths to be silently omitted for the next sequential node.

## What Changed

### 1. Parallel→Sequential Edge Resolution (orchestration.ts)

**Problem**: After a `parallel` FlowNode, `prev` was set to `null`. The next sequential node (e.g., SeniorReviewer after 3 parallel reviewers) had no `prev`, so:
- No edge transform instructions were generated
- No input file paths were specified
- The CLAUDE.md orchestration said nothing about how to get data from parallel branches to the next node

**Fix**: Added `prevParallelBranches: string[]` tracking. When a sequential node follows a parallel block, iterate all branches and look up edges in `edgeMap`. Generate per-branch transform instructions with exact file paths and hook commands.

**Before** (v5.1):
```markdown
### Step 2: SeniorReviewer [sequential]
- Agent: seniorreviewer
- Expected tokens: input ~6,360 / output ~5,000
```

**After** (v5.2):
```markdown
### Step 2: SeniorReviewer [sequential]
- Agent: seniorreviewer
- Inputs: `.graft/session/node_outputs/securityreviewer_to_seniorreviewer.json`, ...
- **Edge transform** (SecurityReviewer → SeniorReviewer): keep only fields: `vulnerabilities`, `severity`, ...
- **Edge transform** (LogicReviewer → SeniorReviewer): ...
- **Edge transform** (PerformanceReviewer → SeniorReviewer): ...
```

### 2. Agent Input Overrides (agents.ts, claude-backend.ts)

**Problem**: Agent MD files said `Load SecurityAnalysis from .graft/session/` — too vague. The subagent didn't know to read the transformed file.

**Fix**: `ClaudeCodeBackend.generateAgent()` computes `inputOverrides: Map<contextName, filePath>` from program edges. When an incoming edge has transforms, the agent's Context Loading section uses the exact transformed path instead of the generic session directory.

**Before**: `- Load SecurityAnalysis from .graft/session/`
**After**: `- Load SecurityAnalysis from .graft/session/node_outputs/securityreviewer_to_seniorreviewer.json`

### 3. Graceful Hook No-op (hooks.ts)

**Problem**: Hook scripts called `process.exit(1)` when the input file didn't exist. Since hooks fire on ALL Write calls (not just the specific file), every unrelated Write would trigger a hook failure.

**Fix**: `process.exit(0)` — silent no-op when input doesn't exist.

### 4. Parallel Dispatch Instruction (orchestration.ts)

**Problem**: CLAUDE.md said "Run concurrently, wait for all to complete" but didn't tell Claude HOW.

**Fix**: "**Dispatch all N agents concurrently** using the Agent tool in a single message"

## Process Notes

- No debate needed — these were implementation bugs, not design decisions
- All 1,334 tests pass
- Both hello.gft (sequential) and code-review.gft (parallel) compile correctly
- Direct implementation with TDD per v6.0+ process

## Files Changed

| File | Change |
|------|--------|
| `src/codegen/orchestration.ts` | `prevParallelBranches` tracking, edge transform generation after parallel |
| `src/codegen/agents.ts` | `inputOverrides` parameter in `generateAgent` and `formatReads` |
| `src/codegen/claude-backend.ts` | Compute input overrides from program edges |
| `src/codegen/hooks.ts` | `process.exit(0)` for missing input (graceful no-op) |
