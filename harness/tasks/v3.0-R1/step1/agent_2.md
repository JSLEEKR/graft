# A2-Pragmatist Independent Analysis — v3.0-R1

## Proposed Implementation

### Core Principles
- **YAGNI**: Only change what the plan says. Do not thread ProgramIndex through TypeChecker (ratchet v2.2-R05). Do not touch codegen's internal ProgramIndex usage (out of scope).
- **Minimal diff**: The pipeline split is mechanical extraction. Keep the same error handling flow.
- **No new files**: RuntimeState goes in an existing file.
- **Backward compat**: Keep `compile()` as a thin wrapper, not a copy of the logic.

### Key Design Decisions
1. `ProgramResult` is the new return type for `compileToProgram()` with `index?: ProgramIndex`
2. `CompileResult extends ProgramResult` with `files?` — backward compatible
3. `compile()` becomes one-line alias for `compileAndGenerate()`
4. ProgramIndex constructed after resolve, before analyzers — single construction point
5. TypeChecker NOT passed index (ratchet v2.2-R05)
6. Optional `index?` params with `?? new ProgramIndex(program)` fallback on ScopeChecker, TokenEstimator, Executor — zero test breakage
7. RuntimeState in prompt-builder.ts, no new file
8. No `options?` param on compileAndGenerate (YAGNI)
9. Move ProgramIndex construction BEFORE graph guard so library files also get an index

### Potential Issue Found
- GRAPH_MISSING early return: `compileToProgram()` returns `success: false` with no `index` when no graph. LSP needs index for library files. Fix: build ProgramIndex BEFORE graph guard.

## Self-Assessment
- Convergence score: **8**
