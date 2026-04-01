# A4-Specialist Independent Analysis — v2.2-R3: Correctness Fixes

## Convergence Score: 8/10

## Key Positions

### C-01: Foreach Binding Collision
- Use else-if chain checking nodeNames → producesMap → contextNames → memoryNames
- Specific messages per declaration type (e.g., "collides with declared node", "collides with declared context")
- WARNING severity with SCOPE_BINDING_COLLISION code
- Check goes in walkFlowNodes foreach case, after existing validations

### C-02: Conditional Edge Transform Warning
- **Place in ScopeChecker.checkEdges()** — structural/behavioral warning about edge semantics
- Check `edge.target.kind === 'conditional' && edge.transforms.length > 0`
- TRANSFORM_ON_CONDITIONAL code, WARNING severity
- ScopeChecker is correct location because this is about structural validity, not type checking

### C-03: Multiple Graph Warning
- Goes in ScopeChecker (not compiler.ts) — it's a warning, not a precondition guard
- GRAPH_MISSING in compiler.ts is an error that blocks compilation; GRAPH_MULTIPLE is advisory
- Use graphs[1].location, reference graphs[0].name in message
- Single warning regardless of graph count

### C-04: loadMemory Verbose Warning
- Add optional `options?: { verbose?: boolean }` 3rd parameter
- Keep existing parameter order (memoryDir, name)
- console.warn with file path when verbose=true and JSON parse fails
- Fully backward compatible

### D-05: Source File Tracking
- Add `sourceFile?: string` to ContextDecl and NodeDecl in ast.ts
- Entry file declarations SHOULD get sourceFile set — essential for LSP go-to-definition
- Set in resolver for both entry and imported declarations
- For no-import case, set sourceFile in compiler.ts before the import guard
- 3 new GraftErrorCode members: SCOPE_BINDING_COLLISION, GRAPH_MULTIPLE, TRANSFORM_ON_CONDITIONAL

## Compiler Design Rationale

1. **Binding collision as WARNING**: In compiler design, name shadowing is traditionally a warning because it's not inherently wrong — the user may intend it. But in Graft's runtime, the outputs Map uses string keys, so a binding that matches a node name will silently overwrite that node's output. Warning is appropriate because the behavior is surprising.

2. **ScopeChecker for structural warnings**: ScopeChecker validates program structure — name resolution, reference validity, graph flow. GRAPH_MULTIPLE and TRANSFORM_ON_CONDITIONAL are structural concerns (not type concerns), so they belong in ScopeChecker alongside other structural checks.

3. **sourceFile as resolver responsibility**: In traditional compilers, source location tracking is the responsibility of the module resolution phase. The resolver already knows which file each declaration came from, making it the natural place to set sourceFile.

## Trade-off Analysis

| Item | Approach | Trade-off |
|------|----------|-----------|
| C-01 | else-if chain | At most one warning per binding (cleaner output) vs multiple warnings (complete info). One warning is sufficient since names are unique across categories. |
| C-02 | ScopeChecker vs TypeChecker | TypeChecker already has checkEdgeTransforms, but the check is about edge routing semantics, not types. ScopeChecker is semantically correct. |
| C-03 | ScopeChecker vs compiler.ts | compiler.ts has GRAPH_MISSING error, but GRAPH_MULTIPLE is advisory. Warnings belong in analyzer. |
| C-04 | console.warn vs logger | No logger abstraction exists. console.warn is simple and testable via vi.spyOn. |
| D-05 | Resolver + compiler.ts fallback | Ensures sourceFile is always set, even when no imports exist. Small duplication is acceptable for correctness. |
