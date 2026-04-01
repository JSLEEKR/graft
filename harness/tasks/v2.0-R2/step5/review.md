# Code Review -- v2.0-R2: Import Resolver

## Verdict: PASS

All 214 tests pass (194 existing + 20 new). The implementation faithfully reflects the convergence spec with one justified deviation. All ratchet items are compliant.

---

## 1. Convergence Spec Alignment

The implementation in `src/resolver/resolver.ts` matches the convergence spec line-for-line with one deviation (analyzed in section 4). Types, function signatures, control flow, error messages, and the overall architecture are identical to the spec.

The `compiler.ts` integration matches the spec exactly -- import resolution is inserted between Parse and the "no graph declaration" guard, with early return on errors.

## 2. Ratchet Item Compliance

| Ratchet | Status | Evidence |
|---------|--------|----------|
| v2.0-R11 | COMPLIANT | `extractExportables(targetProgram)` called at line 152, `ctx.exportCache.set()` at line 153, recursion begins at line 160. Snapshot is cached BEFORE any recursive `resolveImport` calls. |
| v2.0-R12 | COMPLIANT | `resolve()` is a pure exported function. `FileReader` injected as parameter with `fs.readFileSync` default (line 54). No module-level mutable state. |
| v2.0-R13 | COMPLIANT | `extractExportables()` (lines 32-38) only extracts `ContextDecl` and `NodeDecl`. Memory, Graph, and Edge declarations are structurally excluded. |
| v2.0-R14 | COMPLIANT | `ctx.ancestors` is a `Set<string>`. `ancestors.add(targetPath)` at line 160, `ancestors.delete(targetPath)` at line 164. Entry file seeded at line 78. |
| v2.0-R15 | COMPLIANT | All recoverable errors use `ctx.errors.push(new GraftError(...))` followed by `return` or `continue`. Only non-GraftError exceptions are re-thrown (lines 68, 158). |
| v2.0-R16 | COMPLIANT | No path normalization utilities, no Levenshtein distance, no auto-extension. Path resolution uses only `path.resolve()` and `path.dirname()`. |
| v2.0-R17 | COMPLIANT | `.gft` extension check at lines 106-112 with early return on failure. |
| v2.0-R18 | COMPLIANT | No targeted graph/memory rejection. Name-not-found error uses generic message with "Available" list (lines 189-191). |
| v2.0-R05 | COMPLIANT | `importDecl.resolvedPath = targetPath` set at line 103. Test at line 88-96 of resolver.test.ts verifies this. |

## 3. ExportableNames Invariant Verification

The critical invariant is correctly implemented. The sequence in `resolveImport` is:

1. Parse target file (line 149)
2. Extract exportables snapshot (line 152)
3. Cache snapshot (line 153)
4. THEN recurse into target's imports (lines 160-163)

This means when `a.gft` imports from `b.gft`, and `b.gft` imports `Deep` from `c.gft`, the entry file can only see `b.gft`'s own declarations (those present at parse time), not `Deep`. Test case "prevents transitive re-export (CRITICAL invariant)" at line 98 directly validates this.

## 4. `entryFile` Deviation Analysis

**What changed**: The implementer added `entryFile: string` to `ResolveCtx` (line 23) and inserted an early return at line 169:
```typescript
if (importingFile !== ctx.entryFile) return;
```

**Why this is correct**: Without this guard, the shared `ctx.declaredNames` map would be polluted by nested import name registrations. Consider: `b.gft` imports `Shared` from `shared.gft`. Without the guard, `Shared` would be registered in `declaredNames` as coming from `shared.gft`. If the entry file also imports `Shared` from `shared.gft` (diamond pattern), it would hit the duplicate detection and produce a spurious error. The convergence spec's code has this latent bug because `declaredNames` is shared across recursion levels but name merging was written as if each level had its own scope.

The `entryFile` guard correctly limits name resolution (duplicate checking + AST merging) to only the entry file's direct imports. Nested files are parsed and cached for the export snapshot, but their name bindings do not contaminate the entry file's namespace.

**Side effect**: Name-not-found errors in nested imports are silently skipped (they occur after line 169). This is acceptable -- nested files' internal import correctness is validated when those files are compiled as entry points themselves. Structural errors (file not found, circular import, parse error) that occur before line 169 are still reported for all levels.

**Verdict on deviation**: Justified bugfix. The convergence spec had a latent bug in the diamond import scenario that the `entryFile` guard resolves. This is a beneficial departure.

## 5. Error Cases Coverage

All error paths are tested:
- File not found (test line 196)
- Name not found with suggestions (test line 204)
- Empty file / no importable declarations (test line 217)
- Local + imported name conflict (test line 225)
- Same name from two files (test line 236)
- Missing .gft extension (test line 251)
- Parse error in imported file (test line 258)
- Entry file parse error (test line 266)
- Error accumulation / multiple errors (test line 273)
- Circular: self-import (test line 121)
- Circular: A -> B -> A (test line 128)

## 6. Test Quality Assessment

20 tests covering all spec requirements. The test infrastructure is well-designed:
- `mockReader()` provides cross-platform FileReader mocking with path normalization
- `testResolve()` standardizes the base path for consistent assertions
- Diamond parse-once test (line 163) uses a counting reader to verify caching behavior
- Transitive re-export test (line 98) validates the critical invariant

Test coverage matches all 20 cases listed in the convergence spec.

## 7. compiler.ts Integration

The integration is correct. One observation:

**Double parse**: The compiler parses the source at line 40, then `resolve()` parses it again internally (line 62 of resolver.ts). This is functionally correct and matches the convergence spec. The resolver needs its own parse to maintain its pure-function contract (v2.0-R12). This is a minor inefficiency, not a bug. If it becomes a performance concern, a future optimization could accept a pre-parsed `Program` -- but that would change the resolver's API contract and is out of scope for this task.

## 8. Issues Found

### Suggestions (nice to have, not blocking)

**S1**: The `mockReader` in tests uses `normalized.endsWith(normalizedKey)` (line 15) which could match false positives (e.g., `foo/lib.gft` matching `b/foo/lib.gft`). In practice this does not cause test failures because the test file names are unique, but a stricter equality check would be more robust.

**S2**: `ctx.resolvedFiles` uses `Array.includes()` for dedup (line 155). For large import graphs this is O(n) per check. A `Set` would be O(1). Not a concern for v2.0 scale but worth noting for future optimization.

No critical or important issues found.

---

## Summary

The implementation is clean, correct, and complete. All ratchet items are satisfied. The `entryFile` deviation is a justified bugfix that prevents false-positive duplicate errors in diamond import scenarios. Test coverage is comprehensive with 20 tests covering all specified cases. All 214 tests pass with zero failures.
