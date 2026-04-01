# A4-Specialist: v2.1-R2 Correctness Fixes

## Convergence Score: 8/10

## Domain Analysis
- Writes schema validation = type compatibility check (structural overlap)
- max_tokens > 0 = constant validation (domain constraint)
- Parallel memory write detection = static data race detection

## Key Findings

### Critical: compiler.ts Warning Routing
GraftError.severity field exists but compiler.ts doesn't use it. All checker results pushed into errors[] — warnings block compilation.

### Placement Rationale
- max_tokens > 0: ScopeChecker (validates declaration property, not type compatibility)
- Writes schema: TypeChecker (structural field comparison)
- Parallel writes: ScopeChecker (flow graph analysis)

### Error vs Warning Classification
- max_tokens <= 0: Error (always wrong, runtime would malfunction)
- Writes schema zero overlap: Warning (program valid but almost certainly a bug)
- Parallel memory write: Warning (nondeterministic last-write-wins)

## Implementation
- ScopeChecker: checkMaxTokens + checkParallelWrites (via nodeWritesMap)
- TypeChecker: checkWritesSchemaOverlap (via memoryFieldsMap)
- compiler.ts: filter diagnostics by severity before error check
