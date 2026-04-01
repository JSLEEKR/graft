# A2-Pragmatist: v2.0-R4 Step 2 Cross-Critique (FORCED DISSENTER)

## Self-Rebuttal: Against My Own Step 1 Approach

### 1. Shallow merge is wrong

My Step 1 proposed `{...existing, ...output}` for memory writes. This is a bug, not a design choice. A node's `produces` schema can include fields irrelevant to the memory. If `Analyzer` produces `{findings: [...], confidence: 0.8, reasoning: "..."}` and writes to a memory with fields `{findings, pastQueries}`, shallow merge writes `reasoning` into the memory file -- polluting it with fields that don't belong. A4's field-matching merge (only update fields that exist in the memory schema) is strictly more correct. My "YAGNI" justification was laziness masquerading as pragmatism.

### 2. Direct load in buildContextSection is wrong for foreach

My Step 1 loads memory directly in `buildContextSection` instead of pre-loading into `this.outputs`. A3 correctly identified a fatal bug: with `!this.outputs.has()` guard, foreach iteration N cannot see memory updates written by iteration N-1. But my approach is even worse -- loading in `buildContextSection` means every read hits disk, which sounds like it avoids the staleness problem, except that `storeOutput` writes to `this.outputs` (not disk) for session data. The two data paths become inconsistent. A3's solution -- always reload memory from disk in `executeNode`, remove the `has()` guard for memory refs -- is the correct fix.

### 3. Empty `{}` scaffold files are worse than no files

I proposed scaffolding empty `{}` JSON files per memory. This is wrong in two ways: (a) it creates files that look valid but contain no useful data, making it unclear whether memory has been populated or not, and (b) A4's type-aware defaults (`[]` for lists, `0` for ints) are more useful as initial state. However, even A4's approach has the duplication problem (codegen `typeToDefaultValue` vs runtime `defaultForType`). The simplest correct approach: scaffold `.graft/memory/.gitkeep` (A1/A3), and let `loadMemory` return null/empty on first run.

## Critique of Other Agents

### A1-Architect

**Strengths**: Clean `Set<string>` threading, correct `buildContextSection` zero-change argument, conditional memory scaffold.

**Weakness**: The `!this.outputs.has()` guard (line 259 of A1's proposal) is the same bug A3 identified. In a foreach where iteration 1's node writes memory and iteration 2's node reads it, the guard prevents seeing the update. A1 acknowledges the parallel race but misses the sequential foreach case entirely. The guard needs to be removed for memory refs.

**Dry run**: A1 notes dry run might save mock data but defers the decision. A3 is right that this must be addressed now -- dry run memory pollution is silent corruption.

### A3-Skeptic

**Strengths**: Best analysis in the group. The foreach staleness bug (Issue 6) is a real correctness issue. Atomic writes via rename are a reasonable safety measure. Dry run guard is essential.

**Weakness 1**: Atomic writes add complexity for marginal benefit in this context. The codebase already uses direct `writeFileSync` for session outputs. Memory files are small JSON (bounded by `maxTokens`). The crash-mid-write window is milliseconds. I was wrong to dismiss safety concerns, but A3 may be over-engineering the solution.

**Weakness 2**: A3's `saveMemory` try-catch swallows errors silently. At minimum, a verbose-mode warning should be logged so operators can diagnose memory persistence failures.

### A4-Specialist

**Strengths**: Field-matching merge is the correct write strategy. Default parameter `= new Set()` for backward compat is smart -- avoids touching existing tests. The "uniform read, distinct write" framing is the clearest articulation of why `this.outputs` is the right read path.

**Weakness 1**: Loading all memories upfront in `execute()` has the same foreach staleness problem. If memory is loaded once at start, foreach iteration N reads stale data from iteration 0. A4's `saveMemory` updates `this.outputs` after writing to disk (line 317: `this.outputs.set(memName, currentMemory)`), which helps for sequential nodes but still fails if a foreach body node writes memory and then reads it in the next iteration -- because `loadMemories()` only runs once.

**Weakness 2**: `typeToDefaultValue` / `defaultForType` duplication across codegen and runtime is a maintenance trap. A4 justifies it with the T6 ratchet, but that ratchet was about `generateAgent` reuse, not utility functions. A shared `defaultForType` helper would be safe.

## Revised Approach

After self-rebuttal, I adopt a hybrid:

1. **Memory read path**: Always reload from disk in `executeNode` for memory refs (A3's fix). No `has()` guard for memories. This solves foreach staleness.
2. **Memory write path**: Field-matching merge (A4). Only write fields that exist in the memory schema. Full overwrite loses unrelated fields.
3. **Scaffold**: `.graft/memory/.gitkeep` only (A1/A3). No empty JSON files, no type-aware defaults in codegen. Runtime `loadMemory` returns null on missing file.
4. **Dry run guard**: Skip memory saves in dry run (A3).
5. **Atomic writes**: Skip. Use direct `writeFileSync` for consistency with the rest of the codebase. If we add atomic writes, we should add them everywhere.
6. **Default param**: `memoryNames = new Set()` (A4) for backward compat.
7. **`saveMemory` also updates `this.outputs`** (A4) so subsequent sequential nodes see fresh data without disk round-trip.
