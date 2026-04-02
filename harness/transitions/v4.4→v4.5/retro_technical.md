# Technical Retrospective: v4.5 (Comparison Operators + Conditional Expressions)

## 1. Expression Precedence Chain

The chain is clean and correctly ordered:

```
parseExpr -> parseComparison -> parseAdditive -> parseMultiplicative -> parseUnary -> parsePrimary
```

Comparison operators bind looser than arithmetic, which is correct: `a + 1 > b * 2` parses as `(a + 1) > (b * 2)`. The `while` loop in `parseComparison` means chained comparisons like `a > b > c` parse as `(a > b) > c`, which evaluates `true/false > c` -- mathematically meaningless. This is technically a tech debt item, but acceptable for a DSL where chained comparisons are unlikely. No action needed now, but a diagnostic warning could catch misuse later.

## 2. Conditional Expression Parsing -- Edge Cases

The `if <expr> then <expr> else <expr>` form in `parsePrimary` (line 958) has a subtle ambiguity: each sub-expression calls `parseExpr()`, which re-enters the full precedence chain. This means:

- **Nested conditionals work**: `if a then if b then 1 else 2 else 3` parses correctly because the inner `if` is consumed greedily by the consequent's `parseExpr()`.
- **else-less form is impossible**: The `else` keyword is mandatory (enforced by `this.expect(TokenType.Else)`), which is the right call -- avoids dangling-else ambiguity entirely.
- **Comparison in condition works**: `if x > 0 then x else -x` parses correctly since `parseExpr` handles comparisons before `then` is expected.

One concern: `then` and `else` are now reserved keywords. If any existing `.gft` file uses `then` or `else` as a field name or identifier, it will break. This is a minor migration risk but acceptable since these are natural reserved words.

## 3. Tech Debt Introduced

**3a. Loose equality in runtime (`==` / `!=`)**
`expr-eval.ts` line 55-56 uses JavaScript `==` and `!=` for the `==`/`!=` operators. This means `0 == ""` is `true`, `null == undefined` is `true`, etc. For a DSL targeting LLM orchestration where values come from JSON outputs, this is a real hazard. Recommendation: switch to `===`/`!==` in a future patch.

**3b. Number() coercion on comparison operands**
Lines 51-54 wrap comparison operands in `Number()`. This means comparing strings like `"hello" > "world"` produces `NaN > NaN` = `false`, which is silently wrong rather than producing a warning. The type checker catches this at analysis time (requires numeric operands for ordered comparisons), so this is mitigated -- but runtime could still hit it via `unknown`-typed values. Consider adding a runtime warning path for `NaN` results.

**3c. Condition type has diverged from Expr**
The `Condition` interface (ast.ts line 174) still uses `value: string | number | boolean` as its RHS, while the new expression system supports arbitrary `Expr` on the RHS of comparisons. This means edge conditions (`Analyzer -> Reviewer when score >= 0.8`) use a different, more limited representation than `let` expressions (`let pass = score >= 0.8`). This dual representation is the largest tech debt item from v4.5 -- it should be unified so edge conditions use full `Expr` on both sides.

**3d. `+` type mismatch diagnostic is overly strict**
In `checkExprTypeErrors` (types.ts line 228), `+` with mixed types (e.g., `string + number`) raises an error. But `evaluateExpr` (expr-eval.ts line 31) actually handles this via string coercion -- `"count: " + 5` works at runtime but fails type checking. The checker and runtime disagree. Either the checker should allow string+number (coercion) or the runtime should reject it.

## 4. Type Checker Assessment

The type checker handles comparisons and conditionals well:
- Comparison operators correctly infer `boolean` return type (line 177).
- Conditional branch type propagation works: matching branches return the shared type, mismatched branches fall back to `unknown` (line 200-203).
- Ordered comparison operand checking is implemented (line 220-224).

**Gap**: No warning when conditional branches have mismatched types. `if x > 0 then 42 else "negative"` silently infers `unknown`. A diagnostic warning here would catch likely mistakes.

**Gap**: The `!` operator requires a `boolean` operand (line 249), but comparison results are `boolean` and `!` would naturally compose with them. This is fine -- just noting that `!(x > 0)` works correctly through the precedence chain.

## 5. What's Still Missing for a Complete Expression Language

| Feature | Priority | Notes |
|---------|----------|-------|
| Logical AND/OR (`&&`, `\|\|`) | HIGH | No way to combine conditions: `x > 0 && x < 10` requires nested `if` |
| String comparison | MEDIUM | `==`/`!=` work via loose equality; no `<`/`>` for lexicographic order |
| Ternary shorthand | LOW | `if/then/else` is verbose but unambiguous; ternary would add parser complexity |
| Array/map indexing | MEDIUM | `items[0]` or `data["key"]` -- currently requires field_access which assumes dot notation |
| Pipe/chain operator | LOW | Functional composition like `data \| filter \| len` |

The highest-impact missing feature is logical operators. Without `&&`/`||`, users cannot write `if x > 0 && x < 100 then ...` and must nest conditionals instead.

## 6. Summary

v4.5 is a clean addition. The precedence chain is correct, conditional parsing avoids dangling-else by design, and the type checker covers the new constructs. The three items to address soonest:

1. **Unify `Condition` with `Expr`** -- the dual representation will cause increasing friction as the expression system grows.
2. **Switch `==`/`!=` to strict equality** -- loose equality is a silent bug source with JSON-derived values.
3. **Add `&&`/`||` operators** -- without them, the conditional expression feature is significantly less useful.
