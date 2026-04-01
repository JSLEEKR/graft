# Code Review -- v2.2-R1: Tech Debt -- Double-Parse + Version + ProgramIndex

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 296 passed, 0 failed
- Type check (tsc --noEmit): clean, no errors

## Convergence Compliance

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | resolve() accepts Program, not source string | MET | Signature changed to `entryProgram: Program` at resolver.ts:51 |
| 2 | Entry-file parse try-catch removed from resolver | MET | No parse logic for entry file; parseSource() only used for imported files |
| 3 | compiler.ts passes program to resolve() | MET | Line 50: `resolve(program, sourceFile)` |
| 4 | VERSION from package.json via createRequire with try-catch | MET | version.ts matches convergence spec exactly |
| 5 | index.ts uses VERSION | MET | Line 7 imports, line 13 uses `.version(VERSION)` |
| 6 | settings.ts uses VERSION and ProgramIndex | MET | VERSION at line 89, ProgramIndex at line 52, nodeMap.get() at line 56 |
| 7 | ProgramIndex has 5 maps | MET | contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap |
| 8 | ProgramIndex has NO getter methods | MET | Only constructor + readonly map fields |
| 9 | scope.ts uses ProgramIndex (2 .find() replaced) | MET | contextMap.get() at line 101, nodeMap.get() at line 227 |
| 10 | estimator.ts uses ProgramIndex (3 .find() replaced) | MET | contextMap.get() line 164, memoryMap.get() line 170, producesNodeMap.get() line 176 |
| 11 | executor.ts uses ProgramIndex (reuses nodeMap, edgesBySource, memoryMap) | MET | Lines 72-73 reuse index maps; memoryMap.get() at line 401 |
| 12 | orchestration.ts uses ProgramIndex (nodeMap passed to generateSteps) | MET | Index created line 9, nodeMap passed to generateSteps at line 19 |
| 13 | TypeChecker NOT migrated | MET | Verified: zero .find() calls in types.ts, no ProgramIndex import |
| 14 | Resolver test helper updated to parse first | MET | testResolve() now creates Lexer/Parser, passes Program to resolve() |
| 15 | "entry file parse error" test removed | MET | No grep match for "entry file parse error" in tests/ |
| 16 | ~296 tests passing | MET | Exactly 296 (288 - 1 + 3 + 6) |

## Issues Found

### Critical (must fix)
None.

### Minor (should fix)
None. The implementation matches the convergence spec with no deviations. All .find() calls on `program.nodes`, `program.contexts`, and `program.memories` have been eliminated from source files. The remaining `.find()` calls in orchestration.ts (lines 71, 117) operate on `report.nodes` (TokenReport), which is correct and outside scope.

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none
- New ratchet items from convergence:
  - [v2.2-R01] resolve() accepts Program, not source string -- LOCKED
  - [v2.2-R02] VERSION from package.json via createRequire with try-catch fallback -- LOCKED
  - [v2.2-R03] ProgramIndex: 5 maps (contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap) -- LOCKED
  - [v2.2-R04] ProgramIndex: no getter methods, direct map access -- LOCKED
  - [v2.2-R05] TypeChecker NOT migrated to ProgramIndex (zero .find() calls) -- LOCKED

## Memory Verification (Step 6)

### common_memory.md Status
The file currently reflects v2.1-R4 as the latest. It needs the following updates for v2.2-R1:

1. **Header**: Update "Last updated" from `v2.1-R4 completed (v2.1 DONE)` to `v2.2-R1 completed`
2. **Ratchet count**: Update from 107 to 112 (107 + 5 new)
3. **New ratchet section**: Add `### v2.2-R1 Ratchets (Tech Debt)` with the 5 items listed above
4. **Review feedback**: Add entry: `- v2.2-R1: PASS. 296 tests (288 existing - 1 removed + 3 version + 6 program-index). 5 new ratchet items. Zero deviations. MEDIUM tier (2 agents).`
5. **Test count note**: Update "All 288 tests currently passing" to "All 296 tests currently passing"
6. **Recurring patterns**: Add: `- v2.2-R1: Cross-critique skipped (score range 8-7 = 1, below R-PROC-01 threshold of 2). Pure consensus round.`
7. **Debate ROI**: Add entry for v2.2-R1

### Memory Accuracy
- All existing entries remain accurate
- No fabricated claims detected
- Ratchet count arithmetic verified (107 existing + 5 new = 112)

## Adversarial Test Proposal (R-PROC-03)

**Test: ProgramIndex with duplicate node names (last-writer-wins behavior)**

```typescript
it('last node wins when duplicate names exist (pre-analyzer state)', () => {
  const node1 = {
    name: 'Worker', model: 'sonnet', budgetIn: 1000, budgetOut: 500,
    reads: [], tools: [], writes: [],
    produces: { name: 'Out1', fields: [], location: loc },
    location: loc,
  };
  const node2 = {
    name: 'Worker', model: 'haiku', budgetIn: 2000, budgetOut: 1000,
    reads: [], tools: [], writes: [],
    produces: { name: 'Out2', fields: [], location: loc },
    location: loc,
  };
  const index = new ProgramIndex(makeProgram({ nodes: [node1, node2] }));
  // Last-writer-wins: node2 overwrites node1 in nodeMap
  expect(index.nodeMap.get('Worker')).toBe(node2);
  expect(index.nodeMap.size).toBe(1);
  // But producesNodeMap has both entries since produces names differ
  expect(index.producesNodeMap.get('Out1')).toBe(node1);
  expect(index.producesNodeMap.get('Out2')).toBe(node2);
  expect(index.producesNodeMap.size).toBe(2);
});
```

**Rationale**: ProgramIndex is constructed before the analyzer runs. If a malformed or pre-validation Program has duplicate node names, the Map silently overwrites. This test documents the last-writer-wins behavior so future maintainers understand the implicit contract: ScopeChecker catches duplicates, ProgramIndex assumes a valid program. The producesNodeMap asymmetry (both entries survive because produces names differ) is a subtle edge case worth documenting.
