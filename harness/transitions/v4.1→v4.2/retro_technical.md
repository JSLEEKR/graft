# v4.1 -> v4.2 Technical Retrospective

**Version**: v4.2 (Expression Functions + Graph Call Returns)
**Test count**: 1,048 (47 new in v4.2)
**Rounds**: 4 (R1-R4)
**Ratchets**: 13 new, 0 unlocked

---

## 1. Remaining Tech Debt

| Item | Source | Status |
|------|--------|--------|
| Token budget hard abort | v2.1-R15 | Advisory only. Graph call nesting makes this more relevant (parent+child budget invisible). |
| Memory importability | v2.0-R13 | Locked as excluded. |
| Bash hooks on Windows | v1.0 T6 | Deferred indefinitely. |
| Exhaustive defaults on applyOne/evaluateExpr | v4.1 retro | Not addressed in v4.2. applyOne switches on Transform.type, evaluateExpr binary switch on op -- both lack `never` defaults. |
| Graph call memory isolation | v4.1 retro | Child nodes can write to shared memory. Output isolation (v4.1-R2) does not extend to side effects. |
| Common memory stale ratchets | v4.0 retro (R-PROC-22) | ~150 lines of T1-v2.2 ratchets never referenced. Archival still not enacted. |

**New in v4.2**: No new tech debt introduced. The BUILTIN_FUNCTIONS registry is clean and extensible. The equality unification (v4.2-R11) closed the divergence flagged in v4.1 retro.

## 2. Abstraction Boundary Assessment

### 2a. BUILTIN_FUNCTIONS registry: clean but rigid

The registry in ast.ts stores only `{ arity: number }`. Four consumers independently hardcode function-specific behavior:

| Consumer | What it hardcodes |
|----------|-------------------|
| evaluateExpr (flow-runner.ts:74-82) | Runtime implementation (len->length, max->Math.max, etc.) |
| inferExprType (types.ts:190-197) | Return type per function name |
| hover.ts:64-69 | FUNC_DOCS record with signatures |
| conditionFieldName (ast.ts:172) | Display format `name(...)` |

If a new builtin is added (e.g., `abs`, `concat`), all four sites need manual updates. The registry is the source of truth for arity/parsing but not for semantics. This is acceptable at 4 functions; at 8+ it should be consolidated into a richer descriptor (return type, description, implementation).

### 2b. flow-runner.ts at 386 lines (was 363)

Grew by 23 lines from the graph call return capture. The v4.1 retro recommended extracting evaluateExpr to expr-eval.ts at 400 lines. At 386 we are 14 lines away. The `call` case added in v4.2-R1 (lines 72-82) is self-contained. If more builtins are added with complex implementations, extraction becomes justified.

### 2c. parser.ts at 1,101 lines (was 1,084)

Grew by 17 lines from the function call parsing in parsePrimary. The disambiguation logic (line 853: `token.value in BUILTIN_FUNCTIONS && this.peekType(1) === TokenType.LParen`) is clean LL(2). No structural concern.

### 2d. types.ts (analyzer) at 308 lines (was 288)

Grew by 20 lines from inferExprType `call` case and checkExprTypeErrors `call` case (arity validation). The TYPE_FUNC_ARITY error is well-placed here alongside TYPE_EXPR_MISMATCH.

## 3. Patterns to Formalize

### 3a. Registry-gated parsing

The parsePrimary disambiguation -- `value in BUILTIN_FUNCTIONS && peekType(1) === LParen` -- is a pattern worth naming. It means the parser's behavior is data-driven by a runtime registry, not purely grammar-defined. This is powerful but has a subtle implication: adding a builtin function name that collides with an existing field_access name would silently change parse behavior. Currently safe because len/max/min/str are unlikely field names, but a hypothetical `count` or `type` builtin could collide.

**Recommendation**: Document in common_memory that BUILTIN_FUNCTIONS names must not collide with common field/node/context names. Or add a compile-time check in scope.ts.

### 3b. beforeCount delta pattern for child execution tracking

The graph call return logic uses `nodeResults.length` before/after to detect child output. This is index-based side-channel tracking -- it works but is fragile if executeFlowNodes ever changes to filter or deduplicate results. A more robust alternative would be for executeFlowNodes to return its last result directly, but this would change the function signature across all callers.

### 3c. Loose equality for conditions

v4.2-R11 unified on loose equality (`==`/`!=`) across both evaluateCondition and evalCondition. This is correct for Graft's stringly-typed condition values (e.g., `status == 200` matching `"200"`). The decision should be ratchet-noted as intentional: Graft conditions use type-coercing equality.

## 4. Unaddressed Edge Cases

| Edge Case | Location | Risk |
|-----------|----------|------|
| Builtin name collision with field names | parsePrimary:853 | If a context/produces field is named `len`, `len(x)` parses as call but `len` alone parses as field_access. Correct but surprising. |
| Graph call with no child output | flow-runner.ts:371-375 | If a graph call's flow produces no NodeResult (e.g., all nodes fail), no output is stored. Parent referencing the call name gets undefined. Silent. |
| Nested function calls | parsePrimary:858-864 | `len(max(a, b))` works because parseExpr recurses. But `len(len(x))` also works -- no depth limit. Low risk in practice. |
| str() on complex objects | flow-runner.ts:82 | `str(someObject)` returns `[object Object]`. No JSON.stringify fallback. May surprise users. |
| Builtin function in condition left | conditionFieldName:172 | `len(items) >= 3` is valid but conditionFieldName returns `len(...)` which is display-only. The actual evaluation path through evaluateCondition handles it correctly. |

## 5. File Size and Complexity

| File | Lines | Trend | Note |
|------|-------|-------|------|
| parser.ts | 1,101 | +17 | Function call parsing. Still largest file. |
| flow-runner.ts | 386 | +23 | Graph call returns + call evaluation. Approaching 400-line threshold. |
| executor.ts | 361 | Stable | Unchanged in v4.2. |
| estimator.ts | 344 | Stable | No expression function cost estimation added. |
| types.ts (analyzer) | 308 | +20 | Call type inference + arity checks. |
| graph-checker.ts | 215 | +11 | Call source validation added. |
| completions.ts | 273 | +3 | Builtin function entries. |
| hover.ts | 99 | +9 | FUNC_DOCS record. |
| transforms.ts | 112 | -2 | Equality operator simplification. |

No file exceeds 1,110 lines. Growth is distributed across the pipeline rather than concentrated.

## 6. Extension Points for v4.3+

### 6a. Adding new builtin functions

Clear path: add entry to BUILTIN_FUNCTIONS, then update evaluateExpr switch, inferExprType switch, hover FUNC_DOCS, and add tests. 4 sites to touch. Consider consolidating to a single descriptor if function count doubles.

### 6b. User-defined functions

The `call` Expr kind and BUILTIN_FUNCTIONS registry could be extended to support user-defined functions declared in .gft files. parsePrimary would need to check a broader name set (builtins + user-declared). Scope checker would validate declarations. This is a natural v5.0+ feature.

### 6c. Multiplication / modulo operators

Still absent from the grammar. The binary op union is `'+' | '-' | '/'`. Adding `'*' | '%'` requires parser precedence level changes and evaluateExpr switch updates. The exhaustive switch pattern (when applied to binary ops) would catch missing cases.

### 6d. Graph call as expression

Currently graph calls are statements in flow. If `let result = call myGraph(...)` needs the return value inline, the graph call FlowNode would need to be expressifiable. v4.2's return value capture (R10) is the prerequisite -- the value is now available in ctx.outputs.

### 6e. Variable-arity builtins

BUILTIN_FUNCTIONS.arity is a fixed number. If a future function needs variable arity (e.g., `concat(a, b, c, ...)`), the type would need to change to `number | [number, number]` for min/max range. The arity check in checkExprTypeErrors would need range support.

---

## Summary of Actionable Items for v4.3+

1. **Add exhaustive defaults** to applyOne (transforms.ts) and evaluateExpr binary op switch -- carried from v4.1
2. **Monitor flow-runner.ts** at 386 lines -- extract expr-eval.ts if it crosses 400
3. **Enact R-PROC-22** (stale ratchet archival) -- third version carrying this recommendation
4. **Consider BUILTIN_FUNCTIONS name collision guard** in scope checker if function count grows
5. **str() on objects** returns `[object Object]` -- consider JSON.stringify fallback
6. **Graph call with zero child output** silently stores nothing -- consider warning
