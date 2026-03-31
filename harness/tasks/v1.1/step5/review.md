# A3-Skeptic Review: v1.1 Implementation

**Reviewer:** A3-Skeptic (solo)
**Date:** 2026-03-31
**Verdict:** PASS

## Verification Results

### Build & Tests
- `npx tsc --noEmit`: Clean (zero errors)
- `npx vitest run`: 135/135 tests passing across 6 test files
- `npm run bench`: 16/16 benchmarks passing, including `parallel_flow` and `foreach_flow`

### Convergence Spec Compliance

All 14 decisions from `convergence.md` are correctly implemented:

| Decision | Status | Notes |
|----------|--------|-------|
| Type name `FlowNode` | OK | `src/parser/ast.ts:58` |
| `branches` (not `nodes`) | OK | `FlowNode` parallel variant uses `branches: string[]` |
| `body: FlowNode[]` (recursive) | OK | `FlowNode` foreach variant, recursive walks in scope/estimator/codegen |
| Depth enforcement in parser | OK | Parser rejects non-`node` entries in foreach body at line 509-512 |
| `.output.` via `expect(TokenType.Output)` | OK | `parser.ts:479` |
| Select `fields: string[]` | OK | `ast.ts:109`, parser always produces array |
| Select reduction `Math.min(0.3 * fields.length, 1.0)` | OK | `estimator.ts:189` |
| Parallel estimation = sum | OK | `estimator.ts:130-139` |
| Foreach estimation: best=1x, worst=Nx | OK | `estimator.ts:143-147` |
| Binding variable cosmetic | OK | Stored but not scope-validated |
| `done` inside foreach = parser error | OK | `parser.ts:402-406` |
| Parallel min 2 branches | OK | `parser.ts:462-464` |
| SecurityReviewer duplication fixed | OK | `parallel_flow.gft` flow starts with `parallel { ... }` |
| `when(!passed)` out of scope | OK | Not implemented (correct) |

### Edge Case Verification

All tested via direct parser invocation:

| Edge Case | Result | Error Message |
|-----------|--------|---------------|
| Empty parallel `parallel {}` | Rejected | "parallel block must contain at least 2 branches" |
| Single-branch parallel `parallel { D }` | Rejected | "parallel block must contain at least 2 branches" |
| `max_iterations: 0` | Rejected | "max_iterations must be at least 1" |
| Nested parallel inside foreach | Rejected | "Nested parallel or foreach inside foreach is not supported in v1.1" |
| Nested foreach inside foreach | Rejected | "Nested parallel or foreach inside foreach is not supported in v1.1" (test at parser.test.ts:399) |
| `select()` with 0 fields | Rejected | "Expected identifier, got ')' (RParen)" -- parser requires at least 1 field before comma loop |
| `done` inside foreach body | Rejected | "'done' is not allowed inside a foreach or parallel block" (test at parser.test.ts:379) |

### Code Quality Assessment

**Lexer (tokens.ts):** 4 new keywords (`Parallel`, `Foreach`, `As`, `MaxIterations`) with matching KEYWORDS entries. Clean.

**Parser (parser.ts):** Well-structured decomposition. `parseFlowNodes` handles recursive vs top-level via `insideBlock` flag. The foreach path parsing correctly uses `expect(TokenType.Output)` for the middle `.output.` segment, which is tighter than a generic identifier check. Validation is front-loaded in the parser (depth enforcement, min branches, min iterations).

**Scope checker (scope.ts):** Recursive `walkFlowNodes` validates node names in parallel branches, foreach source node existence, and foreach field existence in the source node's produces output. The foreach `maxIterations < 1` check is redundant (parser already rejects it) but harmless as defense-in-depth.

**Type checker (types.ts):** Iterates `transform.fields` for multi-field select validation. Each field is checked against source produces. Clean.

**Estimator (estimator.ts):** Two methods: `collectNodeReports` (flat reporting) and `computeFlowCosts` (recursive cost calculation). Parallel sums all branches. Foreach multiplies body by 1 (best) or maxIterations (worst). Retry multipliers are preserved inside foreach body because `computeFlowCosts` applies `getRetryMultiplier` per-node. This matches the convergence spec exactly.

**Codegen (orchestration.ts):** Generates `[parallel]` and `[foreach]` labels. After parallel, `prev` is set to null (correct -- no single predecessor). Foreach generates sub-step letters (a, b, c...). Settings `findFirstNodeName` recurses correctly through FlowNode variants.

**Hooks (hooks.ts):** Multi-field select generates correct jq projection: `{a: .a, b: .b}`. Accumulates fields from `t.fields` spread.

### Bugs Found

None.

### Potential Concerns (non-blocking)

1. **Foreach body node report duplication:** `collectNodeReports` adds a node report for each body node once (not multiplied by iterations). This is correct for display purposes but could be confusing if someone reads the per-node report as total cost. The `computeFlowCosts` method handles the actual multiplication. No action needed.

2. **Foreach codegen `prev = null` after block:** After a foreach block, `prev` is set to null, meaning the next sequential node won't show an input source file path. This is acceptable since the foreach output structure is iteration-dependent and there's no single predecessor file. If downstream nodes need foreach output, that would require v1.2 work.

3. **Sub-step lettering overflow:** If a foreach body has more than 26 steps, the sub-step labeling (`a`-`z`) would overflow to non-letter characters. This is unrealistic for v1.1 (body is limited to `kind: 'node'` entries and practical graphs won't have 26+ sequential body steps).

### Test Coverage

- Lexer: 4 new keyword tests
- Parser: 7 new tests (parallel, foreach, optional commas, error cases for empty/1-branch/nested/max_iterations/done-in-body)
- Analyzer: 4 new tests (parallel scope, foreach scope, foreach field validation, multi-field select type check, parallel estimation, foreach estimation, multi-field select estimation)
- Codegen: 3 new tests (parallel output, foreach output, multi-field select jq)
- Integration: 2 new tests (parallel_flow.gft, foreach_flow.gft end-to-end compilation)

No regressions. All 135 pre-existing + new tests pass.
