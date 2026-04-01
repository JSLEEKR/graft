# Step 5 Review — v1.2: `graft run` Execution Engine

**Reviewer**: A3-Skeptic (solo review per Adaptive Adversarial Loop)
**Date**: 2026-04-01
**Verdict**: **PASS**

---

## Ratchet Compliance (12/12)

| Ratchet | Status | Evidence |
|---------|--------|----------|
| v1.2-R01 | COMPLIANT | `executeFlowNodes()` walks `FlowNode[]` from AST; no markdown parsing anywhere in runtime/ |
| v1.2-R02 | COMPLIANT | No import of `generateAgent`; `buildPrompt()` is a separate method in Executor |
| v1.2-R03 | COMPLIANT | `Promise.allSettled(promises)` at executor.ts:174 |
| v1.2-R04 | COMPLIANT | transforms.ts is pure TS; no jq, no child_process, no external deps |
| v1.2-R05 | COMPLIANT | `.graft/session/node_outputs/` used for all inter-node file passing |
| v1.2-R06 | COMPLIANT | `MODEL_MAP` duplicated in executor.ts:9-13 (3rd copy alongside agents.ts and settings.ts) |
| v1.2-R07 | COMPLIANT | `if (errors.length > 0) break` in executeFlowNodes; no retry/fallback logic |
| v1.2-R08 | COMPLIANT | `SpawnerFn` type exported from executor.ts:15; injected via `RunOptions.spawner` |
| v1.2-R09 | COMPLIANT | `child.stdin?.end()` at subprocess.ts:22, immediately after spawn |
| v1.2-R10 | COMPLIANT | `cleanSession()` skips `.gitkeep`, removes everything else; tested explicitly |
| v1.2-R11 | COMPLIANT | `this.nodeMap` built from `program.nodes` loop at executor.ts:62-64 |
| v1.2-R12 | COMPLIANT | `shell: process.platform === 'win32'` at subprocess.ts:20 |

---

## Deviations from Convergence Spec

### Beneficial Deviations (accepted)

1. **Dual import of extractJson** (executor.ts:5). `extractJson` is imported separately from `subprocess.ts` rather than being bundled into the spawner result. This is fine -- it maintains separation between process spawning and output parsing.

2. **storeOutput writes by both node name and produces name** (executor.ts:313-332). The convergence spec did not explicitly require dual-keyed storage, but this is a correct enhancement -- downstream nodes may reference either the node name or the produces name. No harm.

3. **Transformed edge outputs written to separate files** (executor.ts:336-347). Files like `a_transformed_for_b.json` are written for edge transforms. This goes slightly beyond the spec (which only required file-based data passing) but is a logical extension for debugging visibility.

4. **Non-zero exit code with parseable JSON is treated as success** (executor.ts:272-281). When a subprocess exits non-zero but stdout contains valid JSON, the output is used and marked success. This is a pragmatic decision for robustness with Claude CLI's exit code behavior.

### No Problematic Deviations Found

---

## Bugs and Edge Cases

### Important (should fix -- but not blocking PASS)

1. **foreach binding overwrites outputs map without scoping** (executor.ts:208).
   `this.outputs.set(flowNode.binding, items[i])` overwrites the binding key on each iteration. If a downstream node in the foreach body stores its output, and the body runs again, the previous iteration's output is lost. This is acceptable for MVP (sequential foreach, last-write-wins), but worth noting for future work. The test at runner.test.ts:361 confirms the expected 4 calls but does not verify intermediate outputs are preserved.

2. **`cleanSession` only cleans `node_outputs/`, not session root** (executor.ts:142-149).
   The input JSON file written at executor.ts:104-107 (`userrequest.json`) is written to `sessionDir` (the parent), but `cleanSession` only iterates `nodeOutputDir` (the child). Stale input files from previous runs persist. This is minor since the input file is overwritten each run anyway.

### Suggestions (nice to have)

3. **extractJson greedy brace matching** (subprocess.ts:61-68). The `lastIndexOf('}')` approach will fail if Claude CLI outputs JSON followed by a closing brace in unrelated text. Given that `--print` mode should produce clean output, this is acceptable for MVP. Consider tightening if production issues arise.

4. **No test for the `run` subcommand in index.ts**. The CLI integration (index.ts:101-136) uses dynamic `import('./runner.js')` which is tested indirectly through the `run()` function tests, but the Commander argument parsing (--input, --dry-run, --timeout conversion) is not directly tested. This is consistent with existing CLI subcommands (`compile`, `check`) which also lack direct Commander tests.

5. **Timeout SIGKILL fallback** (subprocess.ts:33). After SIGTERM, a 5-second timer fires SIGKILL. The 5-second inner timer is never cleared if the process exits cleanly after SIGTERM, creating a brief timer leak. Harmless in practice since the process is terminating anyway.

---

## Code Quality

### Positive

- **Consistent conventions**: ESM imports with `.js` extensions, `node:` prefixed builtins, proper TypeScript types throughout.
- **Error handling**: Every failure path produces structured `RunResult` with error messages. No unhandled promise rejections.
- **Test coverage**: 36 tests covering transforms (12), evalCondition (7), extractJson (4), Executor (8), run() (5). All pass.
- **Clean module boundaries**: transforms.ts has zero side effects, subprocess.ts isolates process management, executor.ts handles orchestration, runner.ts is a thin entry point.
- **No ad-hoc additions**: Implementation stays within convergence scope. Conditional edge routing correctly deferred.

### Minor Notes

- `FlowNode` is imported in executor.ts:3 but never used as a type annotation (the type is inferred from `graph.flow`). Harmless unused import.
- The `fieldsToJsonExample` and `typeToExample` functions are duplicated from agents.ts (noted in comment at executor.ts:410). This is per convergence spec (R02 mandates separation from codegen).

---

## Test Gap Analysis

Tests cover the critical paths well. Gaps that are acceptable for MVP:

- No test for `verbose: true` console output (cosmetic)
- No test for subprocess timeout behavior (would require real process spawning or timer mocking)
- No test for conditional edge targets (correctly deferred to v1.3)
- No negative test for `foreach` with non-array data (the error path exists at executor.ts:201 but is untested)

---

## Summary

All 12 ratchet items are correctly implemented. The code follows project conventions (ESM, .js imports, node: prefix, error handling patterns). All 171 tests pass. No deviations are problematic. The implementation is a faithful realization of the convergence spec with minor beneficial enhancements for robustness.

**Verdict: PASS**
