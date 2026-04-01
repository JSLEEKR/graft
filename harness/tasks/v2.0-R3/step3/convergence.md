# Convergence Report -- v2.0-R3: Analyzer Updates

## Summary

3:1 consensus (A1 reversed via forced dissent, A3, A4 vs A2) on adding `checkDuplicateNames`. All 4 agree on core changes: memoryNames/memoryFieldsMap, checkNodeWrites, memory branch in reads/estimator.

## Forced Dissent Ruling
- A1 (forced dissenter) reversed: "This task creates the three-way ambiguity. Collision detection is a correctness requirement, not a feature." Rebuttal strength: 8/10. ACCEPTED.
- A2 dissent (spec doesn't mention collision): REJECTED. The spec says "validate memory references." If memory/context share a name, resolution is silently wrong — this is a validation failure.

## Unanimous Agreement
1. Add `memoryNames: Set<string>` and `memoryFieldsMap: Map<string, Set<string>>` to ScopeChecker constructor
2. Add `checkNodeWrites` method — validates writes entries against memoryNames
3. Add memory branch in `checkNodeReads` — three-way dispatch (context/produces/memory)
4. Update error message: "context or produces output" → "context, produces output, or memory"
5. TokenEstimator: memory branch in `getEstimatedIn` — memory.maxTokens, 0.3 partial factor
6. TypeChecker: NO CHANGES

## Majority Decision (3:1)
7. Add `checkDuplicateNames` method — detects memory-vs-context and memory-vs-produces name collisions
   - Runs BEFORE checkNodeReads (root cause before symptoms)
   - ~6-10 lines of production code

## Dropped
- A3's differentiated writes errors ("X is a context, not a memory"): DROPPED by A3's own concession. Simple "not a declared memory" is sufficient.
- A4's differentiated writes: DROPPED for consistency with A3's concession.

## Implementation Code

### ScopeChecker changes (src/analyzer/scope.ts)

```typescript
// Constructor additions:
this.memoryNames = new Set(program.memories.map(m => m.name));
this.memoryFieldsMap = new Map();
for (const mem of program.memories) {
  this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
}

// check() method:
check(): GraftError[] {
  const errors: GraftError[] = [];
  this.checkDuplicateNames(errors);  // NEW — must be first
  this.checkNodeReads(errors);
  this.checkNodeWrites(errors);      // NEW
  this.checkEdges(errors);
  this.checkGraphFlow(errors);
  return errors;
}

// NEW method:
private checkDuplicateNames(errors: GraftError[]): void {
  for (const mem of this.program.memories) {
    if (this.contextNames.has(mem.name)) {
      errors.push(new GraftError(
        `Name '${mem.name}' is declared as both a context and a memory`,
        mem.location,
      ));
    }
    if (this.producesMap.has(mem.name)) {
      errors.push(new GraftError(
        `Name '${mem.name}' conflicts with a produces declaration`,
        mem.location,
      ));
    }
  }
}

// NEW method:
private checkNodeWrites(errors: GraftError[]): void {
  for (const node of this.program.nodes) {
    for (const writeName of node.writes) {
      if (!this.memoryNames.has(writeName)) {
        errors.push(new GraftError(
          `writes target '${writeName}' is not a declared memory`,
          node.location,
        ));
      }
    }
  }
}

// checkNodeReads: add memory branch
const isMemory = this.memoryNames.has(ref.context);
if (!isContext && !isProduces && !isMemory) {
  errors.push(new GraftError(
    `'${ref.context}' is not declared as a context, produces output, or memory`,
    ref.location,
  ));
  continue;
}
// Add field validation for memory:
if (ref.field && isMemory) {
  const fields = this.memoryFieldsMap.get(ref.context)!;
  if (!fields.has(ref.field)) {
    errors.push(new GraftError(
      `Field '${ref.field}' does not exist in memory '${ref.context}'`,
      ref.location,
    ));
  }
}
```

### TokenEstimator changes (src/analyzer/estimator.ts)

```typescript
// In getEstimatedIn, after context check, before produces check:
const mem = this.program.memories.find(m => m.name === ref.context);
if (mem) {
  estimatedIn += ref.field ? Math.floor(mem.maxTokens * 0.3) : mem.maxTokens;
  continue;
}
```

### Tests (~10 tests)

1. Memory name valid in reads — no error
2. Memory partial field read (valid field) — no error
3. Memory partial field read (invalid field) — error with field name
4. Undeclared memory in writes — error
5. Read and write same memory — no error (spec allows)
6. Memory/context name collision — error "both a context and a memory"
7. Memory/produces name collision — error "conflicts with produces"
8. Memory in token estimator — correct maxTokens contribution
9. Memory partial read 0.3 factor — correct estimate
10. Updated error message includes "memory" for undeclared reads

## Ratchet-Locked Items

- [v2.0-R19] Memory-vs-context and memory-vs-produces name collisions detected by ScopeChecker — LOCKED
- [v2.0-R20] checkNodeWrites validates writes entries against declared memories — LOCKED
- [v2.0-R21] Memory in reads treated as valid source with field validation — LOCKED
- [v2.0-R22] TokenEstimator includes memory.maxTokens (0.3 partial factor) — LOCKED
- [v2.0-R23] TypeChecker unchanged for v2.0 (writes schema check deferred) — LOCKED
