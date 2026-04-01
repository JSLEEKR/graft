# A1-Architect Cross-Critique -- v2.0-R2

## Score: 8 (up from 7)

## Key Critiques
- A2/A4: CRITICAL transitive re-export bug — cache full Programs, mutate during recursion, read mutated for lookup
- A2: allNames declared but never used for duplicate checking (uses .some() dedup instead)
- A3: normalizePath unnecessary (path.resolve consistent per-platform), targeted errors adopted
- A4: Class unnecessary, Levenshtein YAGNI, auto-extension YAGNI

## Revised Position
- Adopt: ExportableNames snapshot (confirmed correct), normalizePath DROPPED, targeted graph/memory errors ADOPTED
- Keep: Function-based, ResolveCtx, FileReader injection, .gft extension validation

## Critical Ordering Invariant
```
const exportMap = buildExportMap(targetProgram);  // BEFORE recursion
ctx.exportCache.set(targetPath, exportMap);
// Now safe to recurse — exportMap captured pre-mutation
```
