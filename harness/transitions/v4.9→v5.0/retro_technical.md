# Retrospective: Technical — v4.x Expression System (v4.0-v4.9)

## 1. Tech Debt Introduced or Deferred

### TD-01: Duplicated `formatExpr` (HIGH priority)

Two identical implementations of `formatExpr` exist:
- `src/lsp/features/hover.ts:101-120` (exported, canonical)
- `src/codegen/orchestration.ts:188-207` (private, copy-pasted)

Both handle all 9 Expr kinds with identical switch arms. v4.9-R1 added the codegen copy rather than importing from hover.ts. This is the most straightforward tech debt item — a single shared utility extraction resolves it.

**Recommended fix**: Extract `formatExpr` to `src/format.ts` (which already exists for `formatTokenReport`) or a new `src/expr-format.ts`, import from both hover.ts and orchestration.ts.

### TD-02: `conditionFieldName` bridge still alive (MEDIUM priority)

The `conditionFieldName()` bridge in `src/parser/ast.ts:180-188` was created in v4.0-R1 for backward compatibility during the `Condition.left` migration. Ratchet v4.0-R04 was UNLOCKED in v4.1 when `resolveNestedField` replaced it for runtime use. However, the function still exists and is used in:
- `src/analyzer/types.ts:102` — `checkConditionTypes` for field name extraction
- `src/codegen/hooks.ts:99` — jq filter generation

The function handles `field_access`, `call`, and fallback `<expr>` cases but is fundamentally a lossy string representation. For hooks.ts codegen, this is acceptable (display only). For types.ts, it extracts the field name for type checking — this works only because condition LHS is always `field_access` in practice (the parser's `parseCondition` constructs it that way). But if conditions ever accept full expressions on the LHS, this bridge will silently break type checking.

**Recommended fix**: In types.ts, replace `conditionFieldName` call with direct `condition.left` AST inspection (it's always `field_access` since parseCondition constructs it). In hooks.ts, rename usage to clarify it's display-only.

### TD-03: Loose equality in `evaluateExpr` (MEDIUM priority)

`src/runtime/expr-eval.ts:68-69` uses JavaScript loose equality (`==`/`!=`) for expression evaluation:
```typescript
case '==': return left == right;
case '!=': return left != right;
```

This was a deliberate design choice (unified with `evaluateCondition` in v4.2-R2), but it creates subtle behaviors: `0 == false` is `true`, `"" == false` is `true`, `null == undefined` is `true`. For a DSL targeting LLM-to-LLM communication, these JS-specific coercion rules may produce surprising results. The type checker has no way to warn about these cases because it doesn't track literal values.

**Recommendation**: Document as intentional for v5.0. Consider strict equality (`===`/`!==`) as a breaking change for v6.0 or add a `strict_mode` graph-level flag.

### TD-04: `evaluateCondition` does not use `evaluateExpr` for LHS (LOW priority)

`src/runtime/flow-runner.ts:24-46` (`evaluateCondition`) manually resolves `condition.left` with its own variable-first + nested field traversal logic, rather than calling `evaluateExpr(condition.left, outputs, variables)`. This is a vestige of the pre-expression era. The v4.1 spec (in `docs/superpowers/specs/2026-04-02-graft-v4.1-design.md:31`) explicitly noted this should be unified, but the fix only replaced `conditionFieldName` with `resolveNestedField`, not the full evaluateExpr path.

The duplication is:
- `evaluateCondition` lines 30-46: manual field_access resolution with variable-first
- `evaluateExpr` lines 7-24: the same logic but generalized to all Expr kinds

If condition LHS ever accepts expressions beyond `field_access`, `evaluateCondition` will silently fail (returns `undefined` for non-field_access).

**Recommended fix**: Replace the manual resolution in `evaluateCondition` with `evaluateExpr(condition.left, outputs, variables)`.

### TD-05: `letBindingMap` has flat namespace collision risk (LOW priority)

`src/program-index.ts:72-91` stores let bindings in a flat `Map<string, LetBinding>` keyed by variable name. If two graphs define `let x = ...`, only the last one wins in the map. This affects LSP hover and go-to-definition — hovering over `x` might show the wrong graph's binding.

The current code at line 81 simply overwrites:
```typescript
this.letBindingMap.set(step.name, { name: step.name, value: step.value, graphName, location: step.location });
```

**Recommended fix**: Key by `graphName:varName` composite key, or use `Map<string, LetBinding[]>` for multi-graph support. LSP lookups would then need graph context to disambiguate.

### TD-06: Template expression parsing creates new Lexer+Parser instances (LOW priority)

`src/parser/parser.ts:903-909` instantiates a new `Lexer` and `Parser` for each `${...}` interpolation:
```typescript
const innerLexer = new Lexer(exprSource);
const innerTokens = innerLexer.tokenize();
// ...
const innerParser = new Parser(exprTokens);
const expr = innerParser.parseExpr();
```

For typical usage this is fine, but deeply nested templates or templates with many interpolations create O(n) parser instances. The inner parser's error recovery is also disconnected from the outer parser's error accumulation — inner parse errors will throw and may not produce good error messages.

### TD-07: No `Expr` visitor/walker utility (MEDIUM priority)

Multiple components walk the Expr AST independently with near-identical switch statements:
- `src/analyzer/graph-checker.ts:35-98` (`checkExprSources`) — 9-arm switch
- `src/analyzer/types.ts:148-211` (`inferExprType`) — 9-arm switch
- `src/analyzer/types.ts:214-308` (`checkExprTypeErrors`) — 9-arm switch with recursion
- `src/runtime/expr-eval.ts:3-119` (`evaluateExpr`) — 9-arm switch
- `src/lsp/features/hover.ts:101-120` (`formatExpr`) — 9-arm switch
- `src/codegen/orchestration.ts:188-207` (`formatExpr`) — 9-arm switch (duplicate)

That's 6 independent 9-arm switches over the same `Expr` union. Adding a new Expr kind requires updating all 6 locations. The exhaustive TypeScript checking helps (since the union is discriminated), but it's still a maintenance burden.

**Recommendation**: Consider an `Expr.walk()` or `visitExpr(expr, visitor)` utility for v5.0 if new Expr kinds are planned. If not, the current approach is tolerable since TypeScript's exhaustive checking catches missed cases.

## 2. Patterns to Formalize

### P-01: Precedence Chain Pattern

The expression parser uses a clean precedence chain:
```
parseExpr -> parseNullCoalesce -> parseLogicalOr -> parseLogicalAnd
  -> parseComparison -> parseAdditive -> parseMultiplicative
  -> parseUnary -> parsePrimary
```

Each level follows the same structure: parse left, loop on matching operators, parse next-higher precedence for right. This pattern was consistently applied across v4.3 (multiplicative), v4.5 (comparison), v4.6 (logical), and v4.7 (null coalescing). It should be documented as the canonical way to add new operators.

### P-02: Short-Circuit Evaluation Pattern

`src/runtime/expr-eval.ts:28-39` implements short-circuit before the generic binary evaluation:
```typescript
if (expr.op === '&&') { const left = evaluateExpr(...); return left ? evaluateExpr(right) : left; }
if (expr.op === '||') { const left = evaluateExpr(...); return left ? left : evaluateExpr(right); }
if (expr.op === '??') { const left = evaluateExpr(...); return left !== null && left !== undefined ? left : evaluateExpr(right); }
```

This "early-return before generic path" pattern is sound and should be the model for any future short-circuit operators (e.g., optional chaining).

### P-03: Variable-First Resolution Pattern

Used in 3 places for single-segment identifiers:
- `evaluateExpr` (runtime, `expr-eval.ts:9-11`)
- `evaluateCondition` (runtime, `flow-runner.ts:33-37`)
- `inferExprType` (static analysis, `types.ts:159-161`)

The pattern: single-segment names check variables first, then node outputs. Multi-segment names go to node output traversal. This is ratchet-locked (v4.0-R21) and working well, but the 3 independent implementations risk drift.

### P-04: BUILTIN_FUNCTIONS Registry Pattern

The `BUILTIN_FUNCTIONS` registry in `ast.ts:18-31` serves as a single source of truth for:
- Parser recognition (`parsePrimary`)
- Scope validation (`checkExprSources`)
- Arity checking (`checkExprTypeErrors`)
- Type inference (`inferExprType`)
- LSP hover docs (signature + description)
- LSP completions

This pattern is well-designed and should be the model for user-defined functions in v5.0 — a function registry with metadata that all pipeline stages consume.

### P-05: Exhaustive Switch with `never` Default

Added systematically in v4.1-R2 across flow-runner.ts, scope.ts, estimator.ts. Compile-time safety for FlowNode switches. Should be applied to all Expr switches too (currently only some have it).

## 3. Ratchet Decisions to Revisit

### R-REVISIT-01: conditionFieldName bridge (v4.0-R04, UNLOCKED)

Already unlocked in v4.1 but the function persists. Should be deprecated or removed entirely. See TD-02 above.

### R-REVISIT-02: Loose equality semantics (v4.5-R04)

`evaluateExpr` comparison uses `==`/`!=` (loose). This was intentionally unified with `evaluateCondition` in v4.2-R2, but it creates JS-specific coercion behaviors that may not be desirable for a DSL. Worth revisiting if v5.0 introduces strict typing.

### R-REVISIT-03: InferredType is 4-value enum (v4.0-R20)

`InferredType = 'number' | 'string' | 'boolean' | 'unknown'` has no `array`, `object`, or `null` types. The `keys()` builtin returns `unknown` (should be `array`), and null coalescing type inference falls back to `unknown` when it could be more precise. If v5.0 adds array/object operations, this type system needs expansion.

### R-REVISIT-04: Foreach rejects parallel/foreach nesting (parser level)

`src/parser/parser.ts:758-761` rejects nested parallel/foreach at parser level. This is a hard structural constraint. If v5.0 aims for more complex flow composition, this may need to be relaxed to allow parallel inside foreach.

## 4. Unaddressed Edge Cases

### E-01: Variable shadowing across graph call boundaries

When graph A calls graph B, B gets an isolated variable scope. But if B's flow references a variable name that exists in A, the isolation is correct (B can't see A's vars). However, if B defines `let x = ...` and A also has `let x = ...`, the `letBindingMap` will overwrite A's entry with B's. This affects LSP only (runtime scope isolation is correct).

### E-02: Template with only interpolation, no text

`let msg = "${A.score}"` produces a template with one expr part and no text parts. This works correctly but the result is a string (from template type inference), even though the interpolated value might be a number. `evaluateExpr` will convert via `String(val)` at runtime.

### E-03: Division/modulo by expression that evaluates to zero

`src/runtime/expr-eval.ts:49-53` handles division by zero with a warning. But the divisor is computed as `Number(right)` — if `right` is `null`, `undefined`, or `false`, `Number()` returns `0`, triggering the warning silently. The type checker doesn't catch `let x = 5 / false` because it only checks if both sides are `number`, and `false` is `boolean` (caught as TYPE_EXPR_MISMATCH), but `let x = 5 / A.count` where `A.count` is undefined at runtime will silently return 0 with a warning.

### E-04: `evaluateCondition` returns `condition.op === '!='` for undefined fields

`src/runtime/flow-runner.ts:48-49`: when a field is undefined, equality comparison returns `op === '!='`. This means `undefined != "anything"` is `true` and `undefined == "anything"` is `false`. But `undefined >= 0` falls through to `Number(undefined) >= 0` which is `NaN >= 0` = `false`. The undefined handling is inconsistent between equality and ordered operators.

### E-05: `checkExprSources` doesn't validate multi-segment field access depth

`src/analyzer/graph-checker.ts:45-63` validates that the first segment of a field_access is a known node/variable. But it doesn't check whether subsequent segments (e.g., `A.output.nested.field`) correspond to actual schema fields. The type checker only goes 2 levels deep (`producesFieldsMap` maps node -> field, not deeper). Deeply nested field access is unchecked at compile time.

### E-06: Condition LHS limited to field_access

`src/parser/parser.ts:470-489` (`parseCondition`) constructs `left` as `{ kind: 'field_access', segments: [field] }` — always a single-segment field_access. The Condition type accepts any `Expr` as `left`, but the parser only produces field_access. This means conditions can't use expressions like `when len(items) > 5 -> ...`. Both `evaluateCondition` and `types.ts` assume `left` is field_access.

## 5. Performance/Quality Issues

### PQ-01: Expression evaluation is recursive with no depth limit

`evaluateExpr` recurses through the Expr tree with no maximum depth. A pathologically nested expression (e.g., `(((((...))))`) could cause a stack overflow. In practice, parser-generated expressions won't be deeply nested, but template expressions with inner parsers could theoretically chain.

**Risk**: Low. Parser doesn't generate unbounded nesting.

### PQ-02: ProgramIndex rebuilt on every LSP change

The LSP rebuilds `ProgramIndex` on every document change (after debounce). ProgramIndex iterates all program declarations to build 9 maps. With the addition of `letBindingMap`, this is now 10 traversals. For large programs with many graphs, this could add latency.

**Risk**: Low for typical Graft programs (they're small). Could matter at scale.

### PQ-03: `inferExprType` and `checkExprTypeErrors` double-walk

`src/analyzer/types.ts:130-145` walks flow nodes to infer types, then `checkExprTypeErrors` re-infers types for each sub-expression during error checking. For a let binding `let x = a + b * c`, the type of `b * c` is inferred once during `inferExprType(step.value)` and again during `checkExprTypeErrors` when it encounters the `+` binary and infers both operand types. This is O(n^2) in expression depth.

**Risk**: Low for typical expressions. Would matter for generated code with large expression trees.

### PQ-04: `str()` builtin calls `JSON.stringify` on every object

`src/runtime/expr-eval.ts:92` uses `JSON.stringify` for object-to-string conversion. For large node outputs (which could be multi-KB JSON), this is expensive. No caching.

**Risk**: Low unless str() is called repeatedly on large outputs in a loop.

## 6. v5.0 Readiness Assessment

### Memory Importability

**Status**: Deferred since v2.0 (ratchet v2.0-R13 locked as excluded).

**Current state**: `MemoryDecl` has `name`, `maxTokens`, `storage`, `fields`, `location`. No `sourceFile` property (contexts and nodes have `sourceFile?: string`). Memory is not exportable/importable.

**Gap**: To support memory importability, need:
1. Add `sourceFile?: string` to `MemoryDecl` (trivial)
2. Resolver: include memory in import resolution (currently contexts + nodes only)
3. Scope checker: validate cross-file memory references
4. Runtime: memory file paths need to account for import source
5. LSP: completions/hover for imported memories

**Readiness**: 6/10. The import infrastructure exists for contexts and nodes. Extending to memory is incremental but touches resolver, scope checker, runtime, and LSP.

### User-Defined Functions

**Status**: Not started. BUILTIN_FUNCTIONS registry is the foundation.

**Gap**:
1. No syntax for function declarations (`fn name(params) = expr`)
2. No function type in the type system (`InferredType` has no `function`)
3. `parsePrimary` dispatches to builtins via string lookup — needs to check a user-defined function registry
4. `evaluateExpr` case 'call' only dispatches to hardcoded builtins — needs closure/environment support
5. Scope checker needs function-level scope analysis
6. No recursion detection for user-defined functions (graph recursion detection exists as a model)

**Readiness**: 4/10. The BUILTIN_FUNCTIONS registry pattern (P-04) is a good model, and the call Expr kind already exists. But the evaluation model is purely builtin-dispatch with no environment/closure concept.

### Runtime Type Checking

**Status**: Static type checking exists (`types.ts`). No runtime type assertions.

**Gap**:
1. `evaluateExpr` does no runtime type checking — `Number()` coerces silently, `String()` coerces silently
2. No way to express type constraints on let bindings (e.g., `let x: number = ...`)
3. Node output types are declared in `produces` but never validated at runtime against actual output
4. The warnings system (v4.1-R2, division by zero) is ad-hoc — no systematic runtime diagnostic framework

**Readiness**: 3/10. Would require a runtime type checking layer between expression evaluation and result storage.

### Multi-File Composition

**Status**: Import system exists (v2.0) for contexts and nodes. Graph calls exist (v4.0).

**Gap**:
1. Graphs cannot be imported across files — `import { Graph } from "./lib.gft"` doesn't work
2. No cross-file graph call support (graph must be in same file)
3. `letBindingMap` has no file-level namespacing (TD-05)
4. No module-level graph export declarations

**Readiness**: 5/10. The import/resolver infrastructure exists. Graph import would extend the existing resolver pattern but needs cross-file graph call resolution in scope checker, type checker, estimator, and runtime.

## Summary Table

| Category | ID | Priority | Effort |
|----------|-----|----------|--------|
| Tech debt | TD-01 formatExpr duplication | HIGH | XS (extract + import) |
| Tech debt | TD-02 conditionFieldName bridge | MEDIUM | S (inline + remove) |
| Tech debt | TD-03 Loose equality | MEDIUM | Document only for now |
| Tech debt | TD-04 evaluateCondition bypass | LOW | S (replace with evaluateExpr call) |
| Tech debt | TD-05 letBindingMap flat namespace | LOW | S (composite key) |
| Tech debt | TD-06 Template inner parser instances | LOW | Defer |
| Tech debt | TD-07 No Expr visitor utility | MEDIUM | M (visitor pattern) |
| Edge case | E-01 Variable shadowing in LSP | LOW | S (letBindingMap key fix) |
| Edge case | E-04 Undefined handling inconsistency | MEDIUM | S (normalize behavior) |
| Edge case | E-06 Condition LHS limited to field_access | MEDIUM | M (parser + evaluator) |
| Ratchet | R-REVISIT-03 InferredType expansion | MEDIUM | M (type system) |
| v5.0 prep | Memory importability | HIGH | L (resolver + scope + runtime + LSP) |
| v5.0 prep | User-defined functions | HIGH | XL (syntax + scope + eval + types) |
| v5.0 prep | Multi-file graph composition | MEDIUM | L (import + resolver + runtime) |
