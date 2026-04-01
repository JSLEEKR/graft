# Architecture Research — v1.2: `graft run` Execution Engine

## Patterns Found

1. **DAG Executor with Topological Walk** — Confidence: HIGH
   - Topologically sort graph flow nodes. Walk in order. Nodes at same topological level with no mutual dependencies execute concurrently (a "superstep").
   - Pros: Deterministic ordering, natural parallel detection from AST's `FlowNode` kinds, maps directly to `GraphDecl.flow` array.
   - Cons: Requires careful state management for intermediate outputs.

2. **Promise-wrapped subprocess spawning** — Confidence: HIGH
   - Wrap each `claude -p "<prompt>" --output-format json` invocation in a Promise. Sequential nodes use `await`, parallel nodes use `Promise.all([...])`, foreach uses `for...of`.
   - Pros: Native Node.js, no dependencies, clean error propagation.
   - Cons: Must handle stdout buffering, exit codes, timeout manually.

3. **Session directory as message bus** — Confidence: HIGH
   - Node outputs write to `{name}.json`, edge transforms produce `{source}_to_{target}.json`. Already scaffolded by compiler.
   - Pros: Debuggable, crash-recoverable, matches existing codegen output.

4. **Compile-then-Execute pipeline** — Confidence: HIGH
   - `graft run` calls existing `compile()` to get `CompileResult` with AST, then passes `Program` AST to new `Executor` class. No markdown re-parsing.
   - Pros: Single source of truth (AST), no fragile markdown parsing.

5. **Edge transforms via jq subprocess** — Confidence: MEDIUM
   - Existing hooks generate jq commands. Executor can either shell out or apply transforms in-process.
   - Cons: jq dependency on target system; in-process alternative avoids dependency.

6. **Dry-run / simulation mode** — Confidence: MEDIUM
   - `--dry-run` flag walks graph, validates inputs, prints execution plan, estimates token costs without spawning subprocesses.

## Recommended Pattern

DAG executor walking `FlowNode[]` from compiled AST, with Promise-wrapped `claude` CLI subprocess calls and file-based data passing via `.graft/session/`. Executor class:
- Takes `Program` AST + input JSON
- Validates input against graph's input context schema
- Walks `flow: FlowNode[]` sequentially, dispatching by `kind`
- `node`: spawn `claude -p` with agent prompt, collect JSON output
- `parallel`: `Promise.all` over branch nodes
- `foreach`: iterate over list field, execute body per item
- Writes outputs to `.graft/session/node_outputs/`
- Runs edge transforms between nodes

## Warnings

- **Do not parse generated markdown.** Work from AST directly.
- **Claude CLI `--print` flag (`-p`) is essential.** Without it, `claude` enters interactive mode.
- **Subprocess stdout buffering.** Collect all stdout before parsing.
- **Failure strategy order matters.** `retry_then_fallback` means: try N times, then fallback. Do not retry the fallback.
- **foreach is sequential by default.** Do not parallelize.
- **Token tracking.** Append to `.graft/token_log.txt` after each node. `--output-format json` includes usage metadata.
- **Input validation before execution, not during.**
