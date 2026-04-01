# Code Review — v3.5-R3: FlowNode SourceLocation + Enhanced Document Symbols

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 724 passed, 0 failed
- TypeScript compilation: clean (no errors)

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| `location?: SourceLocation` on all 3 FlowNode kinds | MET | ast.ts lines 79-82: node, parallel, foreach all have optional location |
| Parser captures location before parsing each FlowNode kind | MET | `parseFlowNode()` captures at line 605 before `expectIdentifier()`; `parseParallelStep()` at line 617 before `expect(Parallel)`; `parseForeachStep()` at line 643 before `expect(Foreach)` |
| `makeFlowNodeChildren()` uses `node.location ?? parentLoc` fallback | MET | symbols.ts lines 46, 49, 52-53: all three branches use fallback |
| Parallel label format `parallel(A, B)` | MET | symbols.ts line 48: `parallel(${node.branches.join(', ')})` |
| Foreach label format `foreach(Source.field)` | MET | symbols.ts line 51: `foreach(${node.source}.${node.field})` |
| Foreach children are recursive | MET | symbols.ts line 53: calls `makeFlowNodeChildren(node.body, ...)` recursively |
| Existing tests not broken | MET | v34-r3.test.ts constructs FlowNodes without location (valid since optional), all pass |
| 8 new tests cover key scenarios | MET | tests/v35-r3.test.ts has 8 tests covering all FlowNode kinds + symbol generation |

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Detailed Analysis

### AST Type Change (ast.ts)
The `location` field is correctly optional (`?`) on all three FlowNode union members. This is the right choice because:
- Existing code that constructs FlowNodes without location (e.g., v34-r3 tests, codegen) continues to work
- The parser always sets it, so runtime FlowNodes from parsing always have location
- The `??` fallback in symbols.ts handles the absence gracefully

### Parser Location Capture (parser.ts)
Location is captured at the correct token for each case:
- **node**: `this.current().location` before `expectIdentifier()` — captures the identifier position
- **parallel**: `this.current().location` before `expect(TokenType.Parallel)` — captures the `parallel` keyword position
- **foreach**: `this.current().location` before `expect(TokenType.Foreach)` — captures the `foreach` keyword position

### Document Symbols (symbols.ts)
- Clean implementation with proper fallback pattern
- Foreach correctly recurses into body with `makeFlowNodeChildren(node.body, node.location ?? parentLoc)`
- Label formats are sensible and informative

### Test Coverage (v35-r3.test.ts)
All 8 tests are well-structured:
1. Parser: node FlowNode has location
2. Parser: node location points to correct line
3. Parser: parallel FlowNode has location
4. Parser: foreach FlowNode has location
5. Symbols: node uses own location instead of graph location
6. Symbols: parallel appears as child with correct label
7. Symbols: foreach appears as child with nested children
8. Symbols: mixed flow (all three kinds together)

## Ratchet Compliance
- All locked decisions respected: YES
- Violations: none
