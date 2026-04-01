# Code Review — v2.0-R4: CodeGen + Runtime Memory Support

## Verdict: PASS

## Test Results

All 241 tests passing (10 test files). This matches the expected count from the checklist.

## Ratchet Compliance Checklist

| # | Ratchet Item | Status | Notes |
|---|-------------|--------|-------|
| R24 | `generateAgent` has `memoryNames: Set<string> = new Set()` default param | COMPLIANT | `agents.ts:20` — exact signature match |
| R25 | `formatReads` distinguishes `.graft/memory/` from `.graft/session/` | COMPLIANT | `agents.ts:69-84` — `memoryNames.has(ref.context)` check routes correctly |
| R26 | Memory writes use field-matching merge | COMPLIANT | `executor.ts:189-195` — iterates `mem.fields`, only writes matching output fields |
| R27 | Always reload memory from disk (no `outputs.has()` guard) | COMPLIANT | `executor.ts:289-299` — unconditional loop over reads, always calls `loadMemory` |
| R28 | Dry run skips memory saves | COMPLIANT | `executor.ts:171` — early return in `saveMemory`; dry-run path in `executeNode` produces mock output and calls `storeOutput` but `saveMemory` guards internally |
| R29 | `loadMemory` returns null on missing/corrupt | COMPLIANT | `executor.ts:160-168` — `existsSync` check + try-catch returning null |
| R30 | Conditional `.gitkeep` scaffold | COMPLIANT | `codegen.ts:59-62` — only when `program.memories.length > 0` |
| R31 | `cleanSession` and `buildContextSection` unchanged | COMPLIANT | `executor.ts:151-158` (cleanSession) and `executor.ts:445-473` (buildContextSection) — no memory-related modifications |

## Convergence Spec Alignment

### 1. agents.ts

Implementation matches convergence spec exactly:
- `generateAgent` signature with default param (backward compat confirmed by test at line 733)
- `formatReads` distinguishes memory vs session paths with full filename (`.graft/memory/${ref.context.toLowerCase()}.json`)
- `formatWrites` generates "Memory Saving" section only for writes targeting memory declarations
- Field-level reads (e.g., `UserProfile.preferences`) correctly generate memory path

### 2. codegen.ts

Implementation matches convergence spec exactly:
- `memoryNames` set built from `program.memories`
- Passed to `generateAgent` for each node
- Conditional `.graft/memory/.gitkeep` scaffold

### 3. orchestration.ts

Implementation matches convergence spec:
- Memory preamble section with token max formatting (`toLocaleString('en-US')`)
- `generateSteps` receives `program` and `memoryNames` params
- Per-step memory load/save annotations for sequential nodes
- Per-branch `[mem-read]`/`[mem-write]` annotations for parallel nodes
- Foreach case has no additional memory annotations (body handles it) — matches spec

### 4. executor.ts

Implementation matches convergence spec:
- `memoryDir` and `memoryNames` fields in constructor
- `loadMemory` returns `null` on missing/corrupt (try-catch)
- `saveMemory` with field-matching merge, dry-run guard, `mkdirSync` for safety
- `executeNode` always reloads memory from disk (no `outputs.has()` guard)
- Memory data placed into `this.outputs` for uniform `buildContextSection` consumption
- When memory is null (missing/corrupt), `this.outputs.delete(ref.context)` ensures "No data available" path
- `storeOutput` calls `saveMemory` for each write target
- `cleanSession` untouched — only cleans `nodeOutputDir`
- `buildContextSection` untouched — reads from `this.outputs` uniformly
- Memory directory created in `execute()` only when memories declared

## Test Coverage Assessment

### CodeGen Tests (9 new tests in codegen.test.ts)

1. Agent with memory read shows `.graft/memory/` path — line 656
2. Agent with memory write shows "Memory Saving" section — line 674
3. Agent without memory reads — no memory paths — line 693
4. Agent without writes — no "Memory Saving" section — line 706
5. Existing generateAgent backward compat — line 723
6. Memory scaffold present when memories declared — line 598
7. No memory scaffold when no memories — line 627
8. Orchestration "Persistent Memory" section — line 743
9. Orchestration memory load/save per step — line 773

### Runtime Tests (8 new tests in runner.test.ts)

10. Memory load — file exists, parsed JSON in context — line 666
11. Memory load — file missing, "No data available" — line 700
12. Memory load — corrupted JSON, null gracefully — line 727
13. Memory save — writes after execution — line 760
14. Memory save — field-matching merge preserves unrelated fields — line 784
15. Dry run — no memory file writes — line 815
16. Memory not cleaned by session cleanup — line 831
17. Memory persists across executor instances — line 854

All 17 convergence-specified tests are present and passing.

## Deviations from Convergence Spec

None. The implementation is a faithful reproduction of the convergence spec code.

## Potential Issues (non-blocking)

### Suggestion: Dry-run path still calls `storeOutput` which calls `saveMemory`

In `executeNode`, the dry-run path (line 302-309) calls `this.storeOutput(nodeDecl, mockOutput)`, which in turn calls `saveMemory`. The `saveMemory` method has its own `dryRun` guard (line 171), so this is safe and produces the correct behavior. However, it means dry-run mock outputs still trigger the memory write code path up to the guard. This is fine — the guard is the first line of `saveMemory`, so there is no wasted I/O.

### Suggestion: `toLocaleString('en-US')` locale dependency

The orchestration memory preamble uses `toLocaleString('en-US')` for token formatting. This matches the existing pattern used elsewhere in the codebase (budget formatting), so it is consistent. No action needed.

## Summary

The implementation is a clean, faithful execution of the convergence spec. All 8 ratchet items (R24-R31) are satisfied. All 17 specified tests are present and passing. Total test count is 241 as expected. No deviations, no bugs found. The code integrates well with existing patterns — `buildContextSection` and `cleanSession` remain untouched, memory data flows through the existing `this.outputs` map uniformly, and backward compatibility is preserved via the default parameter.
