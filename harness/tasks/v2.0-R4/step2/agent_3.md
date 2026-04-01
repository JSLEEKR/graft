# A3-Skeptic: v2.0-R4 Step 2 Cross-Critique

## 1. Foreach Memory Staleness: Why A1 and A4 Are Wrong

A1 uses `!this.outputs.has(ref.context)` as a guard before loading memory from disk. A4 loads all memories once at `execute()` start. Both approaches break under `foreach`.

The concrete failure: iteration 1's node writes updated memory to disk via `saveMemory`. Iteration 2's node reads the same memory. With A1's guard, `this.outputs` already has the key from iteration 1's load, so disk is never re-read -- iteration 2 sees pre-iteration-1 data, not the updated version. With A4's load-all-upfront, the same problem: memory is loaded once before the loop starts and never refreshed.

Look at the existing foreach code (executor.ts line 205-211): it sets `this.outputs.set(flowNode.binding, items[i])` per iteration but never clears or refreshes anything else. If a body node writes memory to disk, subsequent iterations must re-read from disk to see those writes.

The fix is simple: for memory-type refs, always reload from disk. Remove the `!this.outputs.has()` guard entirely for memory reads. This makes memory disk-authoritative, which is the correct semantic -- memory is persistent state, not an in-memory cache.

A1 argues that session data should "take priority" over disk data. This is wrong. If a node produces output named identically to a memory (which the analyzer prevents per ratchet v2.0-R19), there would be a collision. But since collisions are impossible, the guard serves no purpose and actively causes a bug.

## 2. A4's Field-Matching Merge vs Full Overwrite

A4 proposes iterating over `mem.fields` and only writing output fields that match memory field names. This is more sophisticated than A1's full overwrite or A2's shallow spread merge.

**It is better than full overwrite** for one reason: a node that produces `{findings, confidence}` writing to a memory with fields `{findings, pastQueries}` should not erase `pastQueries`. Full overwrite destroys unrelated fields.

**But it has a subtle problem**: it couples runtime behavior to compile-time schema. If the memory schema evolves (fields added/removed) between compiler runs without re-running `graft compile`, the executor uses stale field lists. This is a minor concern since re-compiling is expected after schema changes, but worth noting.

**My revised position**: field-matching merge is the correct approach for v2.0. It is safer than full overwrite and more predictable than A2's shallow spread (which merges ALL output fields into memory, potentially polluting it with non-memory data).

## 3. A4's Load-All-Upfront vs Always-Reload

A4 loads all memories into `this.outputs` at `execute()` start. This is clean and simple for non-foreach pipelines. But it fails for foreach (see section 1) and also fails for sequential chains where node A writes memory and node B reads it -- node B would see pre-A data.

Wait -- A4 does `this.outputs.set(memName, currentMemory)` in `saveMemory`, which updates the in-memory map after writes. So sequential chains work. But foreach still breaks: if the foreach body writes memory, the in-memory map IS updated, but the next iteration reads from `this.outputs` (which has the updated data from `saveMemory`). Actually... this works if A4's `saveMemory` updates `this.outputs`.

Let me re-examine. A4's `saveMemory` does: load from disk, merge fields, write to disk, then `this.outputs.set(memName, currentMemory)`. So the in-memory map stays current. The load-all-upfront is just the initial seed. Subsequent writes update both disk and map.

**Revised assessment**: A4's approach actually handles foreach correctly IF `saveMemory` always updates `this.outputs`. The disk-authoritative approach (always reload) is still safer against edge cases (e.g., external process modifying memory files mid-run), but for v2.0 MVP, A4's approach is functionally equivalent for the foreach case.

I withdraw my objection to A4 on this specific point. The `!this.outputs.has()` guard in A1 is still wrong because it prevents seeing writes from EARLIER nodes in the same run that wrote to the same memory name.

## 4. Atomic Writes: Consistency Concern

The codebase uses `writeFileSync` everywhere -- session outputs, token logs, input files. Adding `renameSync` only for memory creates an inconsistency: why is memory special?

The answer: session outputs are ephemeral (cleaned each run). Memory persists forever. A truncated session output is lost on next run anyway. A truncated memory file is lost permanently. The severity difference justifies the inconsistency.

However, the practical risk is low. `writeFileSync` is synchronous and writes the full buffer before returning. Truncation only happens on process kill (SIGKILL, OOM) mid-syscall. For v2.0 MVP, direct `writeFileSync` is acceptable. If we add atomic writes, it should be a follow-up, not a blocker.

**Revised position**: Drop atomic writes from v2.0 scope. Use direct `writeFileSync` for consistency with the codebase. The corrupted-file recovery (`loadMemory` returning null) is sufficient protection.

## 5. Brief Notes on Other Positions

- **A2's shallow merge** (`{...existing, ...output}`): Dangerous. Pollutes memory with all output fields, not just memory-relevant ones. A4's field-matching is strictly better.
- **A2's `{}` scaffold**: Acceptable but less informative than A4's schema-default scaffold. Minor difference.
- **A4's default parameter** (`memoryNames = new Set()`): Good. Preserves backward compatibility without changing existing tests.
- **A1's dry run observation**: Correct but underweighted. A1 notes it as "minor edge case" -- it is not minor. Dry run saving mock data to persistent memory silently corrupts future real runs.

## Revised Position Summary

1. Always reload memory from disk (no `!outputs.has()` guard) -- confirmed
2. Drop atomic writes for v2.0 -- revised (was: require atomic writes)
3. Dry run guard on memory saves -- confirmed
4. Field-matching merge (A4's approach) -- adopted (was: full overwrite)
5. Full filename in agent prompts -- confirmed
