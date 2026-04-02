# Code Review — v3.6-R3: Symbol Range Improvement + Rename Field Collision Guard

## Verdict: NEEDS_CHANGES

## Test Results
- All tests pass: YES
- Test count: 770 passed, 0 failed
- Type check (tsc --noEmit): CLEAN

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| `selectionRange` is name only | UNMET | selectionRange starts at keyword position, not name position |
| `range` starts at keyword position | MET | Correctly uses `loc.column - 1` |
| `range` uses `loc.length` when available | MET | `loc.length + 1 + name.length` formula |
| `range` fallback when `loc.length` absent | MET | Falls back to `name.length` |
| `selectionRange` contained in `range` | MET | Structurally satisfied (same start, earlier end) |
| Field collision checks context fields | MET | Iterates `index.contextMap` fields |
| Field collision checks memory fields | MET | Iterates `index.memoryMap` fields |
| Field collision checks produces fields | MET | Iterates `index.nodeMap` produces fields |
| Collision returns descriptive error | MET | Includes field name and parent declaration name |
| Non-colliding renames succeed | MET | Test passes |

## Issues Found
### Critical (must fix)
1. **selectionRange starts at wrong position**: `src/lsp/features/symbols.ts:69-71` — `selectionRange.start.character` is set to `character` (the keyword start), but the requirement says selectionRange should cover the **name only**. When `loc.length` is available, `selectionRange` should start at `character + loc.length + 1` (after keyword + space). Currently for `context TaskSpec` at column 1, selectionRange covers characters 0-8 ("context ") instead of characters 8-16 ("TaskSpec"). The tests only check width and containment, not absolute position, so they pass despite the bug.

### Minor (should fix)
1. **Test does not verify selectionRange absolute position**: `tests/v36-r3.test.ts:39-44` — The "selectionRange is name only" test checks `sr.end.character - sr.start.character === name.length` (width) but does not assert that `sr.start.character` is at the name's position. This lets the bug slip through.

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none

## Fix Instructions (if NEEDS_CHANGES)
1. **Fix selectionRange start position**: `src/lsp/features/symbols.ts` — When `loc.length` is available, `selectionRange.start.character` should be `character + loc.length + 1` (keyword length + 1 space). When `loc.length` is absent, the current fallback (same start as range) is acceptable since we don't know the keyword length. Concretely:
   ```typescript
   const nameStart = loc.length != null ? character + loc.length + 1 : character;
   const selectionRange = {
     start: { line, character: nameStart },
     end: { line, character: nameStart + name.length },
   };
   ```

2. **Strengthen selectionRange test**: `tests/v36-r3.test.ts` — Add an assertion that `sr.start.character` equals `loc.length + 1` (0-based, after keyword + space) when `loc.length` is provided. For the test at line 47 ("range for node uses loc.length"), add:
   ```typescript
   expect(sym.selectionRange.start.character).toBe(4 + 1); // after "node "
   expect(sym.selectionRange.end.character).toBe(4 + 1 + 'Summarizer'.length);
   ```
