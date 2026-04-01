# A4-Specialist: v2.0-R4 Step 2 Cross-Critique

## 1. A3's foreach staleness critique -- accepted, my load-all-at-start is broken

A3 is correct. My `loadMemories()` at the top of `execute()` has the same staleness bug as A1's `!outputs.has()` guard. The causal chain:

1. `loadMemories()` reads `ConversationLog.json` into `this.outputs` at execute-start
2. foreach iteration 1: node writes updated `ConversationLog` via `saveMemory` (disk updated, `this.outputs` updated)
3. foreach iteration 2: `loadMemories()` already ran -- no reload happens. `this.outputs` still has the value from step 2's `saveMemory`, which is correct *only if* `saveMemory` also updates `this.outputs`.

Wait -- my `saveMemory` *does* update `this.outputs.set(memName, currentMemory)` at the end. So iteration 2 would see the updated data through `this.outputs`. The staleness bug only applies if `saveMemory` writes to disk but forgets to update the in-memory map.

**However**, A3's deeper point stands: memory should be disk-authoritative. If an external process modifies `.graft/memory/` between iterations (unlikely but possible), or if a future change breaks the `this.outputs.set()` in `saveMemory`, the in-memory cache silently diverges. A3's "always reload from disk for memory refs" is the safer semantic.

**Revised position**: Always reload memory from disk in `executeNode`, not at `execute()` start. This is a small perf cost (one `readFileSync` per memory ref per node) but eliminates the entire class of staleness bugs. The foreach case makes this non-negotiable.

## 2. Field-matching merge -- defended with refinement

A1 uses full overwrite. A2 uses shallow merge. My field-matching merge is the correct semantic for persistent state:

- Full overwrite (A1): Node produces `{findings: [...]}`, memory has `{findings: [...], pastQueries: [...]}`. Full overwrite wipes `pastQueries`. This is data loss.
- Shallow merge (A2): `{...existing, ...output}` copies *all* output fields into memory, including fields that aren't declared in the memory schema. Memory accumulates junk fields over time.
- Field-matching merge (mine): Only fields declared in `mem.fields` are written. Node output fields that don't match memory fields are ignored. Memory fields not in the output are preserved.

The field-matching merge is the only strategy that respects the memory schema as a contract. The memory declaration says which fields exist; the merge honors that declaration.

## 3. A3's atomic writes -- accepted for memory, not session

A3's `writeFileSync` + `renameSync` pattern is the right call for memory files specifically. The argument: memory persists across runs, so a crash-corrupted memory file has lasting consequences. Session outputs are ephemeral (cleaned each run), so the same risk is tolerable there.

One concern: A3 noted Windows `renameSync` issues with open file handles. Since Graft is single-process and sequential within a node, this is safe. But worth a try-catch around the rename with fallback to direct write.

## 4. A3's dry run guard -- accepted

A3 correctly identifies that dry run + memory save = silent data corruption on next real run. The guard belongs in `storeOutput` or `saveMemory`. I prefer the guard in `saveMemory` itself (`if (this.options.dryRun) return`) since it's the single point of persistence. Memory *reads* should still work in dry run (agent sees what context it would receive).

## 5. A1's approach -- per-node load with `!outputs.has()` guard

A1's `!this.outputs.has()` guard has the foreach staleness bug A3 identified. But A1's instinct to load per-node (not at execute-start) is correct -- it's just the guard condition that's wrong. Remove the guard for memory refs, always reload.

A1's full-overwrite write strategy is the biggest disagreement. See section 2 above.

## 6. A2's buildContextSection approach -- rejected

A2 loads memory directly inside `buildContextSection` via `this.loadMemory()`. This breaks the uniform-read pattern: `buildContextSection` currently only reads from `this.outputs`, never from disk. Adding disk I/O to a context-building method mixes concerns. The correct place for disk I/O is `executeNode` (before prompt building), keeping `buildContextSection` as a pure data formatter.

A2's approach also means `buildContextSection` needs access to `this.program.memories`, adding a dependency it doesn't currently have.

## 7. Default param backward compat

All agents agree on `Set<string>` parameter. My `memoryNames = new Set()` default preserves backward compatibility -- existing tests calling `generateAgent(node)` work without changes. A3 drops the default, requiring all call sites to update. The default is strictly better: zero test churn for the common case.

## Revised Approach Summary

1. **Memory load**: Per-node in `executeNode`, always reload from disk (no `!outputs.has()` guard for memory refs)
2. **Memory write**: Field-matching merge + atomic write (`tmp` + `rename`) + dry run guard
3. **Codegen**: `memoryNames = new Set()` default param, memory scaffold with type-aware defaults
4. **buildContextSection**: No changes (uniform read from `this.outputs`)
5. **Orchestration**: Memory preamble section (A4 style) + per-node memory annotations (A3 style)
