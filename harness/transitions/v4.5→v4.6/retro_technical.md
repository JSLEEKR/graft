# Technical Retrospective: Graft v4.6

**Scope**: Logical operators (`&&`, `||`, `!`) and conditional branch type mismatch warnings.

---

## 1. Precedence Chain Assessment

The parser implements a textbook precedence tower:

```
parseExpr → parseLogicalOr → parseLogicalAnd → parseComparison
  → parseAdditive → parseMultiplicative → parseUnary → parsePrimary
```

**Verdict: Complete and correct.** Each level delegates downward, and left-associativity is handled via `while` loops at every binary level. The `if/then/else` conditional expression is parsed in `parsePrimary`, which is the right place -- it acts as an atom, not an infix operator, so it does not compete with precedence.

One minor note: `parseComparison` uses a `while` loop, which technically allows chaining like `a < b < c`. This parses as `(a < b) < c`, comparing a boolean to a number. Not a bug per se (the type checker would flag it), but it differs from languages that disallow comparison chaining. Acceptable for a DSL.

## 2. Short-Circuit Evaluation

The `evaluateExpr` implementation in `expr-eval.ts` handles short-circuit correctly:

```typescript
if (expr.op === '&&') {
  const left = evaluateExpr(expr.left, ...);
  return left ? evaluateExpr(expr.right, ...) : left;
}
if (expr.op === '||') {
  const left = evaluateExpr(expr.left, ...);
  return left ? left : evaluateExpr(expr.right, ...);
}
```

**Edge cases reviewed:**

- **Falsy non-boolean values**: `0 && "hello"` returns `0`, not `false`. This is JavaScript-style truthiness, which is intentional given the runtime is JS. The type checker emits a warning when operands are non-boolean, but the runtime tolerates it. This is the correct layering.
- **Undefined propagation**: `undefined || fallback` returns `fallback`. `undefined && x` returns `undefined`. Both are reasonable behaviors for a graph DSL where node outputs may be missing.
- **Side-effect safety**: Since Graft expressions are pure (no assignments, no function calls with side effects), short-circuit evaluation has no observable behavioral difference beyond performance. The correctness bar is low here, and the implementation clears it.
- **Nested short-circuit**: `a || (b && c)` works correctly because `||` delegates to `parseLogicalAnd`, which handles the inner `&&` at higher precedence.

**No issues found.**

## 3. Missing Expression Features

For a graph orchestration DSL, the current expression language covers the core needs. What remains:

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Null coalescing (`??`) | Medium | `node.output ?? default` is a common pattern; currently requires `if node.output then node.output else default` which evaluates twice |
| Array indexing (`arr[0]`) | Medium | `keys(obj)` returns an array but there is no way to index into it |
| String methods (`contains`, `startsWith`) | Low | Template strings cover most formatting needs; filtering on string content is rare in graph orchestration |
| Ternary `? :` syntax | None | Already have `if/then/else` conditional expressions, which are more readable for LLM consumers |
| Pipe operator | None | Over-engineering for a DSL; function calls suffice |

The highest-value addition would be null coalescing. The `if/then/else` workaround requires naming the expression twice or using a `let` binding, which is friction in a language designed for concise graph definitions.

## 4. Tech Debt Items

**TD-01: Loose equality in `==` / `!=`**
`expr-eval.ts` line 65 uses `==` (loose equality) for the `==` operator. This means `0 == ""` is `true` and `null == undefined` is `true`. For a DSL consumed by LLMs, strict equality (`===`) would be more predictable. This should be changed to `===` / `!==` unless there is a documented reason for loose semantics.

**TD-02: Type checker warning vs error inconsistency**
Logical operator type mismatch (`&&`/`||` with non-boolean operands) emits a `warning`, while ordered comparison type mismatch (`<`/`>` with non-numeric operands) emits an `error`. The distinction makes sense (logical ops coerce in JS; ordered comparison on non-numbers is almost always a bug), but the severity difference should be documented in the spec.

**TD-03: `inferExprType` returns `'boolean'` for `&&`/`||` unconditionally**
In `types.ts` line 177, logical operators always infer `boolean`. But the runtime returns the actual operand value (JS-style), not a coerced boolean. If a downstream `let` binding uses the result of `||` for its value (e.g., `let fallback = a || b`), the inferred type will be `boolean` when the actual runtime type could be anything. This is a latent type inference bug.

**TD-04: No `location` propagation for right-hand side of binary ops**
In the parser, binary expression nodes use `left.location` as the location for the whole expression (e.g., line 778: `location: left.location`). This means error messages point to the start of the left operand, not the operator. For long expressions, this makes debugging harder. The operator token location should be captured.

## 5. Expression System Maturity Assessment

**Rating: 85% feature-complete for DSL goals.**

The expression system now covers: arithmetic, comparison, logical operators, unary negation/not, string concatenation, template strings, conditional expressions, built-in functions (len, max, min, str, abs, round, keys), field access with dot notation, and variable bindings via `let`. This is a solid foundation for a graph orchestration DSL.

What keeps it from 100%:
- No null coalescing (the most common missing pattern)
- No array indexing (limits utility of `keys()`)
- The loose equality issue (TD-01) is a correctness risk
- Type inference for logical operators is technically wrong (TD-03)

For Graft's stated purpose -- LLM-to-LLM graph orchestration -- the expression language is sufficient for all current use cases. The missing features are "nice to have" rather than blockers. The type checker additions in v4.6 (conditional branch mismatch warnings, logical op type checking) significantly improve the developer experience by catching errors at compile time rather than runtime.

**Recommendation**: Address TD-01 (loose equality) and TD-03 (logical op type inference) in the next patch. Consider null coalescing for the next minor version.
