# Technical Retrospective: Graft v4.7 — Expression System Complete

## Scope

v4.7 closes the v4.x expression system that began in v4.0. This retrospective evaluates the full stack: parser precedence chain, AST representation, runtime evaluation, and type system.

## 1. Precedence Chain Assessment

The 8-level chain (`parseExpr -> parseNullCoalesce -> parseLogicalOr -> parseLogicalAnd -> parseComparison -> parseAdditive -> parseMultiplicative -> parseUnary -> parsePrimary`) follows textbook precedence for C-family languages. Each level is a clean while-loop consuming its operators and delegating downward.

**Strength**: The chain was built incrementally (v4.0: additive/unary, v4.3: multiplicative, v4.5: comparison, v4.6: logical, v4.7: null coalescing) and each addition slotted in without disturbing prior levels. The v4.3 ratchet unlock moving division from additive to multiplicative was the only structural rework — caught early, fixed cleanly.

**Weakness**: `parseComparison` allows chaining (`a < b < c`) via its while-loop, which produces a left-associative binary tree. This evaluates as `(a < b) < c` where `(a < b)` yields a boolean, then compared to `c`. This is technically correct parsing but semantically surprising. Not a bug — JavaScript does the same — but worth noting if Graft ever targets non-JS semantics.

## 2. AST: Expr Union (9 Kinds)

`literal | field_access | binary | unary | group | call | template | conditional` — 8 kinds in the union type (the 9th "kind" being the TemplatePart sub-union). Every kind carries `SourceLocation`. The discriminated union is exhaustive across all consumers: evaluator, type checker, scope checker, estimator, and codegen all handle every kind.

**12 binary ops**: `+ - * / % < > <= >= == != && || ??`
**2 unary ops**: `-` (numeric negation), `!` (logical negation)

The op field is a string literal union on the binary node. This is compact but means the parser's token-to-op mapping is repeated in every consumer's switch. A shared `BinaryOp` type alias would reduce drift risk, though no actual drift has occurred.

## 3. Runtime: expr-eval.ts

**Short-circuit**: `&&`, `||`, `??` all short-circuit correctly. `&&` returns the left value if falsy (not `false`), `||` returns left if truthy — JavaScript semantics, not boolean coercion. `??` checks `null`/`undefined` only, preserving falsy values like `0` and `""`. All three patterns are ratchet-locked (v4.6-R04, v4.7-R04/R05).

**Division-by-zero**: Both `/` and `%` return `0` and push a warning string. This is a safe default for LLM pipeline context where NaN/Infinity would propagate silently. The `warnings?: string[]` optional param (v4.1-R05) avoids breaking callers who don't care.

**Undefined field access**: Multi-segment field access returns `undefined` on any null/missing intermediate. Single-segment checks variables first, then outputs (v4.0-R24 ratchet). This variable-first resolution is consistent between runtime and type inference.

**Concern**: `==` and `!=` use JavaScript loose equality (`==`), not strict (`===`). This was a deliberate unification (v4.2-R11) to match transforms.ts, but loose equality has well-known surprises (`0 == ""`, `null == undefined`). For an LLM-targeted language this is acceptable — the runtime context rarely produces these edge cases — but it is the single most likely source of user confusion if Graft's audience ever expands.

## 4. Type System: Inference + Checking

`InferredType = 'number' | 'string' | 'boolean' | 'unknown'` is intentionally coarse. Type inference walks the AST recursively, propagates through binary/unary/call/conditional/template, and reads from `BUILTIN_FUNCTIONS` registry and `ProgramIndex.producesFieldsMap`.

**What works well**:
- Ordered comparisons (`<`, `>`, `<=`, `>=`) emit errors on non-numeric operands
- Logical operators (`&&`, `||`) emit warnings (not errors) on non-boolean operands
- Conditional branch type mismatch emits a warning (v4.6-R07/R08/R09)
- Function arity is checked statically (TYPE_FUNC_ARITY)
- `unknown` propagation prevents false positives — if either side is unknown, no diagnostic

**What could improve**:
- `+` on mismatched known types (e.g., `number + boolean`) emits an error, which is correct, but `string + number` silently coerces to string concatenation at runtime without a warning. This is by design (template semantics) but undocumented.
- `checkVarConditionTypes` only catches single-segment variable references in edge conditions. Multi-segment expressions or call expressions in condition LHS bypass this check. The scope checker catches undefined references, but the type checker does not verify the inferred type of complex condition LHS expressions.

## 5. Tech Debt Assessment

| Item | Severity | Description |
|------|----------|-------------|
| TD-A | Low | `conditionFieldName()` in ast.ts is a display-only bridge from v4.0. It handles `field_access` and `call` but returns `<expr>` for other kinds. Only used in error messages, so cosmetic, but it should handle `literal` and `binary` for completeness. |
| TD-B | Low | `Condition` type in ast.ts still has a `value: string \| number \| boolean` field alongside `left: Expr` and `op`. This was the pre-v4.0 condition format. The `value` field is not an `Expr`, creating asymmetry. Edge conditions use this legacy shape while `let` expressions use full `Expr`. |
| TD-C | Medium | The `evaluateExpr` function and `TypeChecker.inferExprType` have parallel switch structures over the same 8 Expr kinds. Any new Expr kind requires synchronized changes in 5+ files (parser, evaluator, type checker, scope checker, estimator). The exhaustive `never` defaults (v4.1-R06/R07/R08) catch missing cases at compile time, which mitigates this. |
| TD-D | Low | `BUILTIN_FUNCTIONS` registry uses `returnType: 'unknown'` for `keys()`. The actual return type is `string[]` but the type system has no array type in `InferredType`. This means `len(keys(obj))` infers as `number` (correct) but `keys(obj)` itself infers as `unknown`. |
| TD-E | Low | Template parsing creates a new `Lexer` and `Parser` for each `${...}` interpolation. This is correct but allocates per-interpolation. For typical Graft programs (small expressions), this is negligible. |

## 6. What Should v5.0 Focus On?

The expression system is complete. The language now has: variables, arithmetic, comparison, logical operators, null coalescing, conditionals, string interpolation, 7 built-in functions, and full precedence parsing. The natural next targets:

1. **User-defined functions / macros** — The `BUILTIN_FUNCTIONS` registry pattern is ready for extension. User-defined functions in `.gft` files would require a new declaration type and scope rules but the call infrastructure exists.
2. **Array/map literals in expressions** — `keys()` returns arrays but there is no way to construct them in expressions. Array literals (`[1, 2, 3]`) and map literals would enable richer data manipulation.
3. **Type system enrichment** — `InferredType` is limited to 4 values. Adding `'array'` and `'object'` would enable better diagnostics for `keys()`, `len()`, and future collection operations.
4. **Hard budget enforcement** — Token budget is still advisory (noted since v2.1-R15). With the expression system complete, budget expressions like `budget: base_cost * 1.5` become possible.
5. **LSP expression support** — Hover/completions work for builtins but not for variables or field access within expressions. Expression-aware completions would require tracking the cursor position within the precedence chain.

## 7. Architectural Scaling Concerns

**No blockers identified.** The recursive descent parser scales linearly with input size. The expression evaluator is tree-walking, which is adequate for Graft's use case (small expressions in graph definitions, not general-purpose computation).

**Watch items**:
- The `ProgramIndex` is constructed once and threaded everywhere. If programs grow to hundreds of nodes, the upfront map construction cost is O(n) which remains acceptable.
- Template parsing's inner `Lexer+Parser` allocation is O(interpolations) per template. Not a concern at current scale.
- The exhaustive `never` default pattern (v4.1 ratchets) is the primary defense against missing-case bugs when adding new Expr/FlowNode kinds. This pattern must be maintained as the system grows.

## Stats

| Metric | Value |
|--------|-------|
| Tests | 1,240 (1 failing — pre-existing) |
| Ratchets (v4.x expression) | ~72 across v4.0-v4.7 |
| Expr kinds | 8 (literal, field_access, binary, unary, group, call, template, conditional) |
| Binary operators | 14 (+, -, *, /, %, <, >, <=, >=, ==, !=, &&, \|\|, ??) |
| Unary operators | 2 (-, !) |
| Built-in functions | 7 (len, max, min, str, abs, round, keys) |
| Precedence levels | 8 |
| Files touched by expression system | ~12 (ast.ts, parser.ts, expr-eval.ts, types.ts, scope.ts, graph-checker.ts, flow-runner.ts, estimator.ts, codegen files, LSP features) |
| v4.x test delta | +260 (980 at v4.0-R6 start to 1,240 at v4.7 end) |
