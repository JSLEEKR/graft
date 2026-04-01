# A3-Skeptic Independent Analysis — v2.2-R3: Correctness Fixes

## Convergence Score: 7/10

## Key Positions

### C-01: Foreach Binding Collision
- Use `else if` chain (nodeNames → producesMap → contextNames → memoryNames) since names are unique across categories
- Include actionable message: "The binding will overwrite the node's output at runtime"
- Handles imported names automatically (ScopeChecker operates on resolved program)

### C-02: Conditional Edge Transform Warning
- **Place in TypeChecker** (`checkEdgeTransforms`), not ScopeChecker — TypeChecker already owns edge transform validation
- Check `edge.target.kind !== 'direct' && edge.transforms.length > 0`
- One warning per edge, not per transform
- Continue field validation even for conditional edges (actionable feedback)
- Message: "Transforms on conditional edge are parsed but not applied at runtime"

### C-03: Multiple Graph Warning
- New `checkMultipleGraphs()` method in ScopeChecker, called from `check()` before `checkGraphFlow()`
- Use `graphs[1].location` (second graph is the "redundant" one)
- Message references first graph name: `"only the first graph '${graphs[0].name}' will be executed"`
- Exactly one warning regardless of how many extra graphs exist

### C-04: loadMemory Verbose Warning
- Add `options?: { verbose?: boolean }` as 3rd param (keep existing param order)
- **Reject spec's reordered signature** `(name, memoryDir, program, options?)` — breaks existing call site, program param unused
- `console.warn` with file path in message for actionability
- Backward compatible via optional chaining (`options?.verbose`)

### C-05: Source File Tracking
- Add `sourceFile?: string` to ContextDecl and NodeDecl
- Set in resolver for both entry file decls (lines 70-71) and imported decls (lines 200-202)
- **Critical gap**: When `program.imports.length === 0`, resolver never called (compiler.ts:49)
- Proposes compiler.ts guard: set sourceFile before import check for no-import case
- Requires adding `import * as path from 'node:path'` to compiler.ts

## Issues Found

1. **Spec loadMemory signature mismatch** (HIGH): Spec shows reordered params with unused `program` — would break executor.ts:190
2. **sourceFile never set when no imports** (MEDIUM): compiler.ts:49 guards resolve() behind imports.length > 0
3. **GraftErrorCode union needs 3 new members** (LOW): Straightforward addition
4. **Foreach binding collision completeness** (MEDIUM): Must check all four name categories
5. **Multiple graph zero-length guard** (LOW): `graphs.length > 1` naturally safe

## Edge Cases Analyzed
- Binding collides with own foreach source node name
- Empty transforms array on conditional edge (no warning)
- Zero graphs (caught by GRAPH_MISSING, multiple-graph check must not run)
- loadMemory with empty file (0 bytes — JSON.parse('') throws)
- Diamond imports with shared declaration objects (sourceFile set once, shared by reference)
- No-import file: sourceFile stays undefined without compiler.ts fix
