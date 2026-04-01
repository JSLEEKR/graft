# Convergence Report — v2.1-R2: Correctness Fixes

## Summary

High consensus (A3: 7/10, A4: 8/10). Both agents independently identified the compiler.ts warning routing bug as the critical prerequisite. One disagreement on max_tokens placement resolved below.

## Disagreement Resolutions

### 1. max_tokens > 0 placement: ScopeChecker vs TypeChecker

**Adopted: A4 — ScopeChecker.**

Reasoning: max_tokens validates a property of a declared entity (like name uniqueness), not type compatibility between two structures. ScopeChecker already validates declaration properties. TypeChecker validates structural relationships (field existence, transform compatibility). max_tokens > 0 is a declaration constraint.

### 2. Warning message verbosity

**Adopted: A4 — simpler messages without field name enumeration.**

Reasoning: A3 proposes including all produces and memory field names in the warning message. This creates very long messages for schemas with many fields. A simpler message like "produces no matching fields" is sufficient — the user can inspect the source. Field enumeration is diagnostic detail that belongs in verbose/IDE mode, not default output.

### 3. GraftError.format() label fix

**Deferred.** A3 correctly notes format() hardcodes "Error at line" even for warnings. But format() is not currently used in the CLI's warning display path (CLI uses `w.message` directly). YAGNI — fix when format() is actually used for warnings.

## Implementation Spec

### Critical Prerequisite: compiler.ts Warning Routing

Lines 67-77 of `src/compiler.ts` must filter by severity:

```typescript
// Analyze: scope
const scopeDiagnostics = new ScopeChecker(program).check();

// Analyze: types
const typeDiagnostics = new TypeChecker(program).check();

// Separate errors from warnings
for (const d of [...scopeDiagnostics, ...typeDiagnostics]) {
  if (d.severity === 'warning') {
    warnings.push(d);
  } else {
    errors.push(d);
  }
}

if (errors.length > 0) {
  return { success: false, program, errors, warnings };
}
```

### Check 1: Writes Schema Validation (TypeChecker)

Add `memoryFieldsMap` to constructor. Add `checkWritesSchemaOverlap` method.

```typescript
// In constructor, add:
private memoryFieldsMap: Map<string, Set<string>>;
// Build in constructor body:
this.memoryFieldsMap = new Map();
for (const mem of program.memories) {
  this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
}

// In check():
this.checkWritesSchemaOverlap(diagnostics);

// New method:
private checkWritesSchemaOverlap(diagnostics: GraftError[]): void {
  for (const node of this.program.nodes) {
    if (node.writes.length === 0) continue;
    const producesFields = this.producesFieldsMap.get(node.name);
    if (!producesFields) continue; // scope checker catches

    for (const writeName of node.writes) {
      const memoryFields = this.memoryFieldsMap.get(writeName);
      if (!memoryFields) continue; // scope checker catches undeclared

      let hasOverlap = false;
      for (const field of producesFields) {
        if (memoryFields.has(field)) { hasOverlap = true; break; }
      }

      if (!hasOverlap) {
        diagnostics.push(new GraftError(
          `Node '${node.name}' writes to memory '${writeName}' but produces no matching fields`,
          node.location,
          'warning',
        ));
      }
    }
  }
}
```

### Check 2: max_tokens > 0 Validation (ScopeChecker)

Add `checkMaxTokens` to `check()` call chain.

```typescript
check(): GraftError[] {
  const errors: GraftError[] = [];
  this.checkDuplicateNames(errors);
  this.checkMaxTokens(errors);  // NEW
  this.checkNodeReads(errors);
  this.checkNodeWrites(errors);
  this.checkEdges(errors);
  this.checkGraphFlow(errors);
  return errors;
}

private checkMaxTokens(errors: GraftError[]): void {
  for (const ctx of this.program.contexts) {
    if (ctx.maxTokens <= 0) {
      errors.push(new GraftError(
        `Context '${ctx.name}' has invalid max_tokens: ${ctx.maxTokens} (must be > 0)`,
        ctx.location,
      ));
    }
  }
  for (const mem of this.program.memories) {
    if (mem.maxTokens <= 0) {
      errors.push(new GraftError(
        `Memory '${mem.name}' has invalid max_tokens: ${mem.maxTokens} (must be > 0)`,
        mem.location,
      ));
    }
  }
}
```

### Check 3: Parallel Memory Write Detection (ScopeChecker)

Add `nodeWritesMap` to constructor. Add `checkParallelWrites` called from `walkFlowNodes`.

```typescript
// In constructor, add:
private nodeWritesMap: Map<string, string[]>;
// Build in constructor body:
this.nodeWritesMap = new Map();
for (const node of program.nodes) {
  // ... existing producesMap build ...
  this.nodeWritesMap.set(node.name, node.writes);  // ADD
}

// In walkFlowNodes, case 'parallel', after existing branch validation:
this.checkParallelWrites(step.branches, location, errors);

// New method:
private checkParallelWrites(branches: string[], location: SourceLocation, errors: GraftError[]): void {
  const memoryWriters = new Map<string, string[]>();

  for (const branch of branches) {
    const writes = this.nodeWritesMap.get(branch);
    if (!writes) continue;
    for (const memName of writes) {
      const writers = memoryWriters.get(memName);
      if (writers) {
        writers.push(branch);
      } else {
        memoryWriters.set(memName, [branch]);
      }
    }
  }

  for (const [memName, writers] of memoryWriters) {
    if (writers.length > 1) {
      errors.push(new GraftError(
        `Nodes ${writers.map(w => `'${w}'`).join(' and ')} both write to memory '${memName}' in parallel`,
        location,
        'warning',
      ));
    }
  }
}
```

## Test Targets

### Writes Schema Validation
- Zero overlap: node produces `{data}`, memory has `{history}` → warning
- Partial overlap: node produces `{history, extra}`, memory has `{history}` → no warning
- Multiple writes: `writes: [MemA, MemB]`, overlaps MemA but not MemB → 1 warning for MemB
- Undeclared memory in writes: no TypeChecker warning (ScopeChecker handles)
- Node with no writes: no check

### max_tokens > 0
- Context with max_tokens 0 → error
- Memory with max_tokens 0 → error
- Both with valid positive → no error

### Parallel Memory Write Detection
- Two parallel branches write same memory → warning
- Two parallel branches write different memories → no warning
- One parallel branch writes, other doesn't → no warning
- Parallel inside foreach body → warning detected via recursion

### Compiler Integration
- Warnings don't block compilation (success: true with warnings)
- Errors still block (success: false)

## Ratchet Items

### New Ratchets
- [v2.1-R07] Writes schema overlap: warning in TypeChecker, not error — LOCKED
- [v2.1-R08] max_tokens > 0 validation in ScopeChecker for both ContextDecl and MemoryDecl — LOCKED
- [v2.1-R09] Parallel memory write detection via nodeWritesMap in ScopeChecker.walkFlowNodes — LOCKED
- [v2.1-R10] compiler.ts filters diagnostics by severity; warnings don't block compilation — LOCKED
