# v4.0 -> v4.1 Technical Retrospective

**Version**: v4.1 (Quality Hardening)
**Test count**: 1,001 (21 new in v4.1)
**Rounds**: 4 (R1-R4)
**Ratchets**: 11 new, 1 unlocked (v4.0-R04 conditionFieldName bridge removed)

---

## 1. Remaining Tech Debt

All formal TD items (TD-01 through TD-05) were closed by v3.9. No new TD items were introduced in v4.0 or v4.1. The following deferred items remain from earlier versions:

| Item | Source | Status |
|------|--------|--------|
| Token budget hard abort | v2.1-R15 | Advisory only; no hard enforcement. Deferred indefinitely. |
| Memory importability | v2.0-R13 | Locked as excluded. Memory blocks cannot be imported across files. |
| Bash hooks on Windows | v1.0 T6 | hooks.ts generates bash scripts; no Windows .ps1/.cmd variant. |

**Assessment**: None of these are blocking. Token budget hard abort becomes more relevant as graph calls introduce nested execution (budget consumed across parent + child is invisible to the user). This should be revisited if/when runtime budget tracking gains importance.

## 2. Abstraction Boundary Issues

### 2a. evaluateCondition vs evalCondition: divergent equality semantics

`evaluateCondition` in flow-runner.ts (line 113) uses loose equality (`==`/`!=`) for condition matching. `evalCondition` in transforms.ts (line 105) uses strict equality (`===`/`!==`). This inconsistency is a latent bug: a condition like `status == 200` will match string `"200"` in routing but not in filter transforms.

**Recommendation**: Unify on one semantics. Loose equality matches the Graft spec's stringly-typed condition values, so transforms.ts should align.

### 2b. flow-runner.ts is growing (363 lines)

flow-runner.ts now holds: evaluateExpr, resolveNestedField, evaluateCondition, executeWithFailureStrategy, applyFallbackAlias, executeConditionalChain, executeFlowNodes. It is the second-largest runtime file after executor.ts (361 lines). The expression evaluator (evaluateExpr) is a self-contained recursive function with no dependency on FlowContext and could be extracted to its own module.

**Recommendation**: Extract evaluateExpr + resolveNestedField to `src/runtime/expr-eval.ts` if flow-runner.ts grows past ~400 lines in the next version.

### 2c. parser.ts at 1,084 lines

The parser is the largest single file in the codebase. v4.0 added expression parsing, let, and graph call parsing. The file has natural split points (parseExpr/parsePrimary could be a separate module), but the recursive descent style means many functions reference each other. Not urgent, but worth monitoring.

## 3. Patterns to Formalize

### 3a. Exhaustive switch pattern

v4.1-R2 added `never` default cases to 4 switches across 3 files. This pattern should be applied systematically whenever FlowNode (or any discriminated union) is switched on. Currently covered:
- flow-runner.ts: executeFlowNodes
- scope.ts: walkFlowNodes
- estimator.ts: collectNodeReports, computeFlowCosts

**Not yet covered**: Any future switch on Expr.kind (currently only evaluateExpr, which uses break-fall-through rather than exhaustive default). Also, applyOne in transforms.ts switches on Transform.type without a never default.

### 3b. Shallow-clone isolation for child contexts

v4.1-R2 established `outputs: new Map(ctx.outputs)` for graph call isolation. This pattern (shallow clone of Maps for child scope) should be the standard for any future nested execution scope (e.g., if foreach ever needs output isolation, or if sub-graphs get their own variable scope).

### 3c. Optional warnings array pattern

evaluateExpr's `warnings?: string[]` parameter is a clean non-breaking way to surface runtime diagnostics without throwing. This pattern could be extended to other runtime functions (e.g., applyTransforms for truncation warnings, evaluateCondition for type coercion warnings).

## 4. Unaddressed Edge Cases

| Edge Case | Location | Risk |
|-----------|----------|------|
| Graph call child writes to memory | flow-runner.ts:348-353 | Child ctx shares the same executeNode callback; if a child-executed node writes to memory, the write persists. Output isolation does not extend to memory side effects. |
| Deeply nested field_access in expressions | evaluateExpr:36-43 | No depth limit on segment traversal. Unlikely to be exploited in practice but could be surprising with very deep JSON. |
| evaluateExpr missing `*` operator | flow-runner.ts:48-61 | Binary ops are `+`, `-`, `/` only. Multiplication is absent from the grammar (v4.0-R02 locked division at additive precedence). If multiplication is added later, the binary switch needs updating. |
| Foreach binding vs graph param name collision | scope.ts | Foreach binding collision checks nodeMap/producesMap/contextMap/memoryMap but does not check against graph param names within the same graph. |
| Graph call with zero args and required params | graph-checker.ts:125-132 | Correctly caught, but the error message says "Missing required parameter" without suggesting available defaults. Minor UX issue. |

## 5. File Size and Complexity

| File | Lines | Trend | Note |
|------|-------|-------|------|
| parser.ts | 1,084 | Stable | Largest file. Natural split at expression parsing. |
| scope.ts | 503 | Decreased (-194) | v4.1-R3 extraction to graph-checker.ts. Healthy size now. |
| flow-runner.ts | 363 | Growing | Was ~240 pre-v4.0. Watch for next version. |
| executor.ts | 361 | Stable | Unchanged in v4.0/v4.1. |
| estimator.ts | 344 | Stable | Clean structure with private methods. |
| graph-checker.ts | 204 | New | Extracted from scope.ts. Well-scoped. |
| types.ts (analyzer) | 288 | Stable | InferredType added in v4.0 but no growth in v4.1. |

No file exceeds 1,100 lines. The scope.ts extraction in v4.1-R3 was a good preventive measure.

## 6. Extension Points for Future Features

### 6a. Multiplication / modulo operators
The expression evaluator's binary switch (flow-runner.ts:48-61) and the parser's expression precedence would need a new level or additions to the existing additive level. The `Expr` union itself is extensible (add new `op` values to `binary`).

### 6b. String interpolation in expressions
Currently `+` on strings does concatenation. If template literals or interpolation are added, evaluateExpr would need a new Expr kind. The field_access resolution logic would need to handle interpolated segments.

### 6c. Graph return values
Graph calls currently execute but do not return a value to the parent scope. If graphs need to produce output that the parent can reference (e.g., `let result = call myGraph(...)`), the executeFlowNodes graph_call case would need to capture the final node's output and expose it via ctx.outputs or ctx.variables.

### 6d. Conditional expressions (ternary)
The Expr union could be extended with a `conditional` kind. evaluateExpr, checkExprSources, and the type checker would all need corresponding cases. The exhaustive switch pattern (v4.1-R2) means the compiler will catch missing cases.

---

## Summary of Actionable Items for v4.2+

1. **Fix equality semantics divergence** between evaluateCondition (loose) and evalCondition (strict) -- low effort, high correctness impact
2. **Add exhaustive defaults** to applyOne switch in transforms.ts and evaluateExpr binary op switch
3. **Monitor flow-runner.ts size** -- extract expr-eval.ts if it grows past 400 lines
4. **Consider graph call memory isolation** -- child nodes can currently write to shared memory
5. **Multiplication operator** is the most obvious grammar gap if arithmetic expressions see real use
