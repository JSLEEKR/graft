# A3-Skeptic Independent Analysis -- v2.0-R2

## Convergence Score: 6

## Critical Issues Identified (14 total)

### HIGH Severity
1. **Transitive re-export via resolved Program lookup**: Name lookup MUST use RAW parsed Program, not resolved/merged. Using merged enables transitive re-exports silently.
2. **Ancestor set not removed on return**: Missing `ancestors.delete(targetPath)` after recursion causes sibling imports to be falsely flagged as circular.
3. **Diamond import name duplication**: Same file parsed via different paths without cache causes duplicate name errors on valid programs.

### MEDIUM Severity
4. **Edge importability not explicitly handled**: EdgeDecl has `source` not `name`. Generic "not found" is confusing.
5. **Graph import not explicitly rejected**: Should say "graphs cannot be imported", not "not found".
6. **Memory importability ambiguity**: Must be explicitly excluded with clear error.
7. **Path normalization on Windows**: Must use consistent separators for cache keys.
8. **GraftError location for multi-file errors**: Error location should point to import declaration in importing file.
9. **FileReader throwing vs returning errors**: Must catch and convert to GraftError, not abort all resolution.

### LOW Severity
10. **Import path without .gft extension**: Should validate and give specific error.
11. **Empty imported file**: Should produce "no importable declarations" error.
12. **Self-import**: Should be caught by circular detection (file is in ancestor set at start).
13. **Same name in two import declarations from same file**: Duplicate detection must catch this.
14. **Produces declarations**: Nested inside nodes, not importable. Verify no accidental leakage.

## Implementation

Key differences from other agents:
- `normalizePath()` function: `path.resolve(p).replace(/\\/g, '/')`
- `buildExportMap()` returns `{ importable, graphNames, memoryNames, edgeSources }` for targeted error messages
- Separate `importedContexts`/`importedNodes` arrays per recursion level (prevents transitive leakage structurally)
- Circular chain display: `A -> B -> C -> A` (shows full cycle)
- Error accumulation: continue after each error, resolve remaining imports

```typescript
// Key structure
function buildExportMap(program: Program): {
  importable: Map<string, { kind: 'context' | 'node'; decl: ContextDecl | NodeDecl }>;
  graphNames: Set<string>;
  memoryNames: Set<string>;
}

// Targeted error messages:
if (graphNames.has(name)) {
  errors.push(new GraftError(`Cannot import graph '${name}': graphs are entry points`, loc));
} else if (memoryNames.has(name)) {
  errors.push(new GraftError(`Cannot import memory '${name}': memory imports not supported`, loc));
} else {
  errors.push(new GraftError(`Name '${name}' not found. Available: ${available}`, loc));
}
```

## Test Cases Proposed (15)
1. Basic context import
2. Basic node import
3. Transitive re-export rejection (CRITICAL)
4. Self-import → circular
5. A → B → C → A circular chain
6. Diamond import without duplicate errors
7. Diamond import parse-once verification
8. Graph import rejection with specific error
9. Memory import rejection with specific error
10. Duplicate: local + imported name
11. Duplicate: same name from two import declarations
12. File not found
13. Parse error in imported file
14. Name not found with suggestions
15. Empty imported file
16. No-imports passthrough
