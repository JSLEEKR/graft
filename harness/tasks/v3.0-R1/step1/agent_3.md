# A3-Skeptic Independent Analysis — v3.0-R1

## Key Issues Found

1. **GRAPH_MISSING placement**: Should move to compileAndGenerate(), NOT compileToProgram(). Library files are valid for analysis. LSP benefits immediately.
2. **TypeChecker ratchet v2.2-R05 LOCKED**: Do NOT pass ProgramIndex to TypeChecker in R1.
3. **Optional index params**: Use `index?: ProgramIndex` with fallback to prevent test breakage across ~50 call sites.
4. **ProgramIndex mutation risk**: Maps are readonly but contents mutable. Threading same instance makes mutations more dangerous.
5. **RuntimeState extraction feels ceremonial**: Only captures outputs+input, nearly useless for this round.
6. **generate() should NOT receive index in R1**: Deferred to R3 (CodegenBackend interface).

## Proposed Design Decisions
1. compileToProgram() does NOT enforce GRAPH_MISSING (codegen concern)
2. TypeChecker keeps current constructor (ratchet locked)
3. compile() remains unchanged in signature (thin wrapper)
4. ScopeChecker/TokenEstimator: optional index? param with fallback
5. LSP: keep GRAPH_MISSING filter as defensive no-op guard
6. Executor: optional index? third constructor param

## Edge Cases
- Empty source: same GraftError behavior
- Library files (no graph): compileToProgram succeeds, compileAndGenerate fails with GRAPH_MISSING
- Parse errors: index undefined (constructed after parse)
- Resolve errors: index undefined (constructed after resolve)
- Analysis errors: index IS defined

## Self-Assessment
- Convergence score: **7**
