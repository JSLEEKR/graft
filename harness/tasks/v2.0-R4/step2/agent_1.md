# A1-Architect: v2.0-R4 Step 2 Cross-Critique

## Critique of A2-Pragmatist (Forced Dissenter)

A2's approach is structurally identical to mine in most areas. Two points of divergence:

**Shallow merge for saves**: A2 proposes `{ ...existing, ...output }`. This is wrong for a subtle reason: node output includes ALL produces fields, not just the ones relevant to the memory. If a node produces `{ findings: [...], confidence: 0.8 }` and writes to a memory with fields `{ findings, pastQueries }`, shallow merge overwrites `pastQueries` with `undefined` if the output doesn't contain it. Wait -- actually no, spread only copies *own enumerable* properties that exist on the source. If `output` doesn't have `pastQueries`, it won't be in the spread result. So shallow merge is actually safe here. But it also writes `confidence` to memory, which is noise. A4's field-matching merge is cleaner but adds complexity. For v2.0, full overwrite (my approach) or shallow merge (A2) are both acceptable -- the memory file just stores whatever the node produced. Field-level filtering is a v3.0 concern.

**Per-memory scaffold files with `{}`**: A2 creates one JSON file per memory instead of a single `.gitkeep`. This means `loadMemory` never sees a missing file after compile. Reasonable, but it means recompiling overwrites memory files from previous runs. A `.gitkeep` avoids this -- the directory exists, but memory files are only created at runtime. I maintain my `.gitkeep` approach.

**Memory reads in `buildContextSection` directly**: A2 loads memory in `buildContextSection` instead of preloading into `this.outputs`. This actually avoids the staleness bug A3 found -- each call to `buildContextSection` reads fresh from disk. However, it duplicates the file I/O logic inside `buildContextSection`, which currently is a pure data-lookup function. I prefer keeping `buildContextSection` simple and fixing the staleness issue at the load point instead.

## Critique of A3-Skeptic

**Foreach staleness bug (Issue 6)**: This is a legitimate correctness bug in my approach. My `!this.outputs.has()` guard prevents iteration N+1 from seeing memory updates written by iteration N. The scenario: foreach body node reads and writes the same memory. Iteration 1 writes updated memory to disk via `saveMemory`. Iteration 2's `executeNode` checks `this.outputs.has("Memory")` -- it's true (set in iteration 1's load), so it skips the disk reload. Iteration 2 sees stale data.

A3's fix -- always reload memory from disk, remove the `!this.outputs.has()` guard for memory refs -- is correct. Memory is disk-authoritative. The `this.outputs` map is a session cache for node-to-node data flow; memory should bypass this cache on reads.

**Atomic writes**: A3 argues for write-to-tmp + rename. The argument that session outputs are ephemeral but memory persists is compelling. However, the codebase uses `writeFileSync` everywhere else. Adding atomic writes only for memory creates inconsistency and adds a Windows edge case (EACCES if antivirus has the file open). For v2.0 MVP, I'd defer this -- `writeFileSync` is sufficient. If crash-resilience becomes a real issue, it should be applied uniformly, not just to memory.

**Dry run guard**: A3 is correct that dry runs should not write to persistent memory. Mock data polluting memory across runs is a silent corruption bug. I noted this in my Step 1 (issue #4) but didn't commit to a specific fix. A3's `!this.options.dryRun` guard in `storeOutput` is the right approach.

**Empty file edge case**: A3's `raw.trim() === ''` check is unnecessary -- `JSON.parse('')` throws, which the catch already handles. The try-catch is sufficient. Adding explicit checks for every failure mode JSON.parse already handles is defensive to the point of noise.

**Full filename in agent prompts**: A3 includes `.graft/memory/conversationlog.json` instead of `.graft/memory/`. This is a good point -- LLM agents are literal instruction followers. I'll adopt this.

## Critique of A4-Specialist

**Load ALL memories at `execute()` start**: A4 calls `loadMemories()` once at the top of `execute()`, loading every declared memory into `this.outputs`. This is clean but has the same staleness problem A3 identified -- if a node writes to memory mid-pipeline, subsequent nodes see the pre-write data from `this.outputs`. A4 partially fixes this by calling `this.outputs.set(memName, currentMemory)` in `saveMemory`, but this still doesn't handle the foreach case correctly because the outputs map is updated but the *timing* depends on when saveMemory runs relative to when the next iteration loads.

Actually, looking more carefully: A4's `saveMemory` does `this.outputs.set(memName, currentMemory)` after writing to disk. Combined with the initial `loadMemories()`, this means `this.outputs` always has the latest memory state. The foreach iteration issue is *resolved* in A4's approach because each iteration's `saveMemory` updates `this.outputs`, and the next iteration's `buildContextSection` reads from `this.outputs`. No need to reload from disk. This is actually elegant -- disk and in-memory stay in sync.

But wait: what if a *different* process or external tool modifies the memory file between iterations? A4's approach wouldn't see that. A3's disk-authoritative approach would. For v2.0 MVP, single-process execution means A4's approach is safe. I'll accept this.

**Field-matching merge**: A4 only writes output fields that match memory schema fields. This prevents noise fields from leaking into memory. It's more correct than full overwrite, but adds complexity (iterating memory fields, checking `field.name in output`). For v2.0, full overwrite is simpler and the memory file just stores what the node produced. Field-matching merge is the right approach for v3.0 when field-level writes arrive. For now: YAGNI, but I acknowledge it's technically more correct.

**Schema-default JSON scaffold**: A4's `typeToDefaultValue` creates memory files with typed defaults (`""`, `0`, `[]`). This means first-run agents see structured data instead of `{}`. It's nice but introduces duplicated type-traversal logic between codegen and runtime. More importantly, it means recompiling overwrites memory files from previous runs (same problem as A2's `{}` scaffold). The `.gitkeep` approach avoids this entirely.

**Default parameter `memoryNames = new Set()`**: Good backward-compat idea. Avoids updating all existing test call sites. I'll adopt this.

## Revised Approach

Changes from my Step 1 position:

1. **Always reload memory from disk** (from A3): Remove the `!this.outputs.has()` guard for memory refs. Memory is disk-authoritative. This fixes the foreach staleness bug.

2. **Dry run guard** (from A3): Add `if (!this.options.dryRun)` around memory saves in `storeOutput`.

3. **Full filename in agent prompts** (from A3): Use `.graft/memory/${name.toLowerCase()}.json` instead of `.graft/memory/`.

4. **Default parameter** (from A4): `memoryNames: Set<string> = new Set()` for backward compat.

5. **Keep full overwrite for saves** (reject A2 merge, defer A4 field-matching): v2.0 has no field-level write syntax. Full overwrite is simpler and correct for current semantics.

6. **Keep `.gitkeep` scaffold** (reject A2/A4 per-file scaffold): Avoids recompile overwriting runtime memory data.

7. **Reject atomic writes** (A3): Inconsistent with rest of codebase. Defer to a future uniform approach if crash-resilience is needed.

8. **Keep preload-into-outputs strategy** but reload each time for memory refs. The key change: in `executeNode`, memory refs always reload from disk, non-memory refs use `this.outputs` cache.

```typescript
// Revised memory load in executeNode
for (const ref of nodeDecl.reads) {
  if (this.memoryNames.has(ref.context)) {
    const memData = this.loadMemory(ref.context);
    if (memData !== null) {
      this.outputs.set(ref.context, memData);
    } else {
      this.outputs.delete(ref.context);
    }
  }
}
```

This is A3's exact fix. Memory reads are always fresh from disk. The `outputs.delete` on null ensures stale data doesn't persist if memory file was deleted between iterations.
