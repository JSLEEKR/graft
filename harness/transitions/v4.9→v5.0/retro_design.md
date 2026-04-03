# Retrospective: Design Decisions — v4.x Expression System

**Scope**: v4.0 through v4.9 (10 versions, ~150 new tests, 9 Expr kinds, 13 binary operators, 7 builtins)
**Date**: 2026-04-03

---

## 1. Design Friction

### 1A. Expr Union Type Growth

The `Expr` discriminated union grew from 5 kinds (v4.0) to 8 kinds (v4.9: literal, field_access, binary, unary, group, call, template, conditional). This growth was **well-managed** overall, but caused friction in two specific areas:

**Friction point: downstream exhaustiveness.** Every new Expr kind required updates in 6+ locations: `evaluateExpr`, `inferExprType`, `checkExprTypeErrors`, `checkExprSources`, `formatExpr` (x2), and `conditionFieldName`. The exhaustive `never` default switches added in v4.1-R2 [v4.1-R06 through R08] were a critical safeguard — without them, the `template` and `conditional` kinds added in v4.4/v4.5 would have silently fallen through. **Recommendation**: the exhaustive switch pattern should be ratchet-mandated for any function that dispatches on Expr.kind.

**Friction point: the binary op union.** The binary `op` field grew from `'+' | '-' | '/'` to a 14-member string literal union. This is a flat discriminant — there is no grouping by precedence or semantics. The evaluator (`expr-eval.ts`) handles this with a single switch, which works but means adding a new operator requires touching the union type, the parser (new precedence method), the evaluator, the type checker, and the LSP. This is acceptable for the current operator count, but would become unwieldy if v5.0 adds more operators (e.g., string methods, array indexing).

**No friction: the SourceLocation mandate.** Every Expr kind carries `location: SourceLocation`, locked in v4.0-R01. This was consistently useful — the type checker, scope checker, and LSP all depend on it. Zero regressions from this decision.

### 1B. Precedence Chain Scaling

The precedence chain grew from 3 levels (v4.0: additive, unary, primary) to 8 levels (v4.9: nullCoalesce, logicalOr, logicalAnd, comparison, additive, multiplicative, unary, primary). Each level is a separate `parseX()` method that calls the next level down.

**Assessment: scaled well.** The chain is a textbook recursive descent approach. Each method is 5-15 lines, single-purpose, and independently testable. The only friction was the v4.0-R02 ratchet (division at additive precedence) which had to be unlocked in v4.3 when multiplicative was introduced — a direct consequence of premature optimization ("no multiplicative level needed"). This was the only ratchet unlock in the entire expression system, and it was resolved cleanly.

**One structural concern**: `parseComparison` uses a while-loop, allowing chained comparisons (`a < b < c`), which silently produces left-associative chaining. This is technically parseable but semantically surprising (it compares the boolean result of `a < b` against `c`). No bugs have manifested yet because Graft expressions are simple, but this is a latent issue for v5.0.

### 1C. Short-Circuit Evaluation

Short-circuit semantics for `&&`, `||`, and `??` were implemented by early-returning in the binary case of `evaluateExpr` (lines 28-39 of expr-eval.ts). This was added in v4.6 (logical) and v4.7 (null coalescing).

**Assessment: clean, no friction.** The pattern is straightforward — check the operator before evaluating both sides. The three short-circuit operators are handled before the general `left/right` evaluation, so there is no risk of accidental eager evaluation. The type checker correctly identifies `&&`/`||` as returning `boolean` and `??` as returning the left type or right type. No downstream issues reported.

### 1D. Condition Type: Legacy Friction

The `Condition` interface (ast.ts:174-178) remains a separate type from `Expr`, with `left: Expr`, `op` (6 operators), and `value: string | number | boolean`. This was the original edge-routing condition from v3.x, and `Condition.left` was migrated to `Expr` in v4.0-R03. However, **the Condition type itself was never unified with Expr**. This causes ongoing friction:

- `Condition.value` is a flat literal, not an `Expr`. Edge conditions cannot use expressions on the right side (e.g., `when score >= threshold` is impossible — `threshold` must be a literal).
- `evaluateCondition` (flow-runner.ts) and `evalCondition` (transforms.ts) are separate functions from `evaluateExpr`, with their own resolution logic.
- `conditionFieldName()` is a bridge function that extracts a string from `Condition.left`, which is itself an `Expr` — evidence that the two type systems are not fully integrated.

**Recommendation for v5.0**: Unify `Condition` into `Expr`. Replace `Condition { left, op, value }` with a binary `Expr` where both sides are full expressions. This eliminates `evaluateCondition`, `evalCondition`, and `conditionFieldName` as separate code paths. The parser can still restrict edge condition syntax if needed, but the AST and evaluator should be unified.

---

## 2. Abstraction Boundaries

### 2A. Parser <-> Analyzer Boundary

The current boundary is clean: the parser produces an untyped AST, and the analyzer (scope + type checker) validates it. Expressions cross both, but the responsibilities are well-separated:

- **Parser**: syntax (precedence, grouping, template interpolation, conditional syntax)
- **ScopeChecker** (`checkExprSources`): name resolution (variables, node outputs, builtins)
- **TypeChecker** (`inferExprType`, `checkExprTypeErrors`): type compatibility

**One boundary blur**: `BUILTIN_FUNCTIONS` is defined in `ast.ts` and used by both parser (for call disambiguation in `parsePrimary`) and analyzer (for arity/type checking). This is pragmatic — the parser needs to distinguish `len(x)` from `len.x` — but it means adding a new builtin requires editing the AST module. For v5.0, if user-defined functions are added, this disambiguation will need to change: the parser cannot know at parse time whether `foo(x)` is a builtin or user-defined. The parser should parse all `identifier(args)` as calls, and let the analyzer resolve the target.

### 2B. Runtime <-> Evaluator Boundary

The extraction of `evaluateExpr` to `src/runtime/expr-eval.ts` (v4.4-R01) was a good boundary clarification. `flow-runner.ts` handles flow control (sequencing, branching, looping), and `expr-eval.ts` handles pure expression evaluation.

**Remaining blur**: `evaluateCondition` in `flow-runner.ts` and `evalCondition` in `transforms.ts` are separate from `evaluateExpr`. Both do field resolution and comparison, duplicating logic. This is a direct consequence of the `Condition` vs `Expr` split noted in 1D above. Unifying `Condition` into `Expr` would eliminate this boundary violation.

**Another concern**: `evaluateExpr` takes `outputs: Map<string, unknown>` and `variables?: Map<string, unknown>` as separate parameters. The variable-first resolution logic (check variables, then outputs) is embedded in the evaluator. If v5.0 adds more scopes (e.g., memory fields, imported constants), this parameter list will grow. Consider an `EvalContext` object that encapsulates all resolution scopes.

### 2C. LSP <-> Core Boundary (formatExpr Duplication)

`formatExpr` is implemented identically in two locations:
- `src/lsp/features/hover.ts:101` (exported, used by LSP hover)
- `src/codegen/orchestration.ts:188` (private, used by codegen)

These are byte-for-byte identical 19-line functions. The v4.9 changelog notes "formatExpr exported from hover.ts for reuse" but the codegen version was not updated to import from hover.ts — it has its own copy.

**Recommendation**: Extract `formatExpr` to a shared location. Options:
1. `src/parser/ast.ts` — next to the `Expr` type definition (keeps AST + printer together)
2. `src/format.ts` — the existing shared format module (already has `formatTokenReport`)
3. `src/expr-format.ts` — new dedicated module

Option 2 (`src/format.ts`) is the cleanest fit given the existing pattern. The LSP and codegen both import from core modules already.

---

## 3. Extension Points for v5.0

### 3A. Memory Importability

Currently locked as excluded (v2.0-R13). If v5.0 enables `import { MyMemory } from "./other.gft"`:

**What needs to change**:
- `ImportDecl.names` must distinguish context/node/memory/graph imports (currently all are strings — the resolver categorizes them post-hoc)
- `ProgramIndex.memoryFieldsMap` needs cross-file population (currently only indexes the current file's memories)
- Scope checker `checkMemoryRef` needs to resolve against imported memories
- Runtime `saveMemory` needs cross-file memory path resolution

**What already works**: The import resolver already handles cross-file name resolution and cycle detection. The `ProgramIndex` already supports multi-file programs via `sourceFile` tracking on declarations.

**Design recommendation**: Add a `kind` field to imports (`import context Foo from ...` vs `import memory Bar from ...`) rather than inferring the kind from the imported file's declarations. This makes the parser responsible for disambiguation and keeps the resolver simple.

### 3B. User-Defined Functions

The expression system is currently hardcoded to 7 builtins (len, max, min, str, abs, round, keys). User-defined functions would require:

**Parser changes**:
- Remove the `BUILTIN_FUNCTIONS` check from `parsePrimary` call disambiguation. Parse all `identifier(args)` as calls.
- Add function declaration syntax (likely at graph scope: `fn name(params) = expr`)

**AST changes**:
- `call` Expr kind already supports arbitrary names and args — no structural change needed.
- Add `FunctionDecl` to `Program` or `GraphDecl` (depends on scoping rules).

**Analyzer changes**:
- `checkExprSources` must resolve function names against declarations + builtins.
- `inferExprType` must infer return types from function bodies (or require annotations).
- `BUILTIN_FUNCTIONS.returnType` pattern already provides the infrastructure for type metadata.

**Runtime changes**:
- `evaluateExpr` case 'call' currently has a hardcoded switch on function names. This must become a lookup table. The existing `BUILTIN_FUNCTIONS` registry pattern is the right foundation — extend it to include user-defined functions at runtime.

**Assessment**: The expression system is well-positioned for user-defined functions. The `call` Expr kind, `BUILTIN_FUNCTIONS` registry, and `evaluateExpr` dispatch are all extensible. The main work is parser syntax and scope analysis, not restructuring existing code.

### 3C. Runtime Type Checking

**What exists**:
- `InferredType = 'number' | 'string' | 'boolean' | 'unknown'` — 4-value type system
- `TypeChecker` performs static analysis only (compile-time)
- `evaluateExpr` does implicit coercion at runtime (Number(), String())
- Division/modulo by zero: returns 0 with warning (v4.1-R05)

**What is missing**:
- No runtime type errors. `Number("hello")` returns `NaN`, which propagates silently.
- No `null`/`undefined` type in `InferredType`. The type system cannot distinguish "this field might not exist" from "this field is a string". The `??` operator exists but the type checker cannot verify it is used where needed.
- No array/object types. `keys()` returns `unknown`, `len()` returns `number` regardless of input type. The `TypeExpr` system (ast.ts) has `list` and `map` kinds, but `InferredType` has no equivalent.
- No type narrowing. `if x != null then x else 0` does not narrow `x` to non-null in the consequent branch.

**Recommendation for v5.0**: Extend `InferredType` to at least include `'null'` and `'array'`. Full type narrowing is likely YAGNI for a DSL compiler, but null-awareness would catch real bugs (accessing fields on undefined node outputs).

### 3D. Multi-File Graph Composition

Currently, graphs are file-local. `import` brings in contexts, nodes, and memories, but not graphs. If v5.0 enables cross-file graph calls:

**What needs to change**:
- Import resolver must support graph imports
- `ProgramIndex.graphMap` must include imported graphs (currently file-local only)
- `checkGraphRecursion` DFS must work across file boundaries
- `getGraphDecl` in `FlowContext` must resolve imported graphs
- `TokenEstimator` graph call recursion must follow cross-file references

**What already works**: The graph call infrastructure (LL(1) disambiguation, child FlowContext isolation, output capture) is file-boundary agnostic. It resolves graphs by name from `graphMap`. If `graphMap` includes imported graphs, most runtime code works unchanged.

**Risk**: Cross-file graph recursion detection. The current DFS (v4.0-R19) operates on a single `Program`. Multi-file requires either whole-program analysis or a more sophisticated incremental approach.

---

## 4. Overall Expr System Assessment

### Strengths

1. **Clean AST design.** The 8-kind discriminated union is compact and well-typed. Each kind has exactly the fields it needs, no optional bloat. The `SourceLocation` mandate enables good diagnostics everywhere.

2. **Textbook precedence chain.** 8 levels, each a simple method. Easy to read, easy to extend (add a method, insert it in the chain). The v4.3 precedence fix (division moved to multiplicative) proves the chain is modifiable without cascading breakage.

3. **Registry-driven builtins.** `BUILTIN_FUNCTIONS` in ast.ts is the single source of truth for name, arity, return type, signature, and description. Parser, analyzer, evaluator, and LSP all read from it. Adding a builtin is a one-line registry entry plus one switch case in the evaluator.

4. **Evaluator simplicity.** `evaluateExpr` is 118 lines, covers all 8 kinds, handles short-circuit correctly, and has no external dependencies beyond the AST types. It is the most portable module in the codebase.

5. **Incremental delivery.** The expression system was built over 10 versions without breaking changes. Each version added 1-2 features (operators, functions, templates, conditionals) with full test coverage per round. The ratchet system prevented regression.

### Weaknesses

1. **Condition/Expr duality.** The biggest design debt from v4.x. `Condition` should be a special case of `Expr`, not a parallel type. This causes code duplication (`evaluateCondition` vs `evaluateExpr`), limits edge condition expressiveness, and requires the `conditionFieldName` bridge.

2. **formatExpr duplication.** Identical code in two files (hover.ts and orchestration.ts). Minor but a clear DRY violation that will get worse as Expr kinds grow.

3. **InferredType is too coarse.** 4 values (`number`, `string`, `boolean`, `unknown`) cannot represent null, arrays, objects, or optional types. This limits the type checker's ability to catch real errors (e.g., calling `len()` on a number, using `??` unnecessarily).

4. **Evaluator parameter sprawl.** `evaluateExpr(expr, outputs, variables?, warnings?)` is at 4 parameters. Adding more scopes (memory, imports) will push this further. An `EvalContext` object would be cleaner.

5. **No Expr visitor/walker.** Each consumer (type checker, scope checker, codegen, LSP, evaluator) implements its own recursive Expr traversal. There is no shared `walkExpr(expr, visitor)` utility. This means adding a new Expr kind requires updating 6+ switch statements. A visitor pattern or `mapExpr`/`foldExpr` utility would reduce this burden.

### Restructuring Verdict

**The expression system does NOT need restructuring for v5.0.** It is well-positioned for extension. The recommended changes are:

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| HIGH | Unify Condition into Expr (eliminate dual evaluation paths) | MEDIUM | Removes ~80 lines of duplicate logic, enables rich edge conditions |
| HIGH | Extract formatExpr to shared module | LOW | 5-minute fix, eliminates DRY violation |
| MEDIUM | Add walkExpr/visitExpr utility | LOW | Reduces cost of adding new Expr kinds from 6 files to 1 |
| MEDIUM | Introduce EvalContext to replace parameter list | LOW | Prepares for multi-scope resolution |
| LOW | Extend InferredType with null/array | MEDIUM | Better diagnostics but limited ROI for DSL |
| LOW | Prevent chained comparisons in parser | LOW | Latent correctness issue, no reported bugs |

The core Expr union, precedence chain, registry pattern, and evaluator architecture are all sound and should be preserved as-is for v5.0. The changes above are refinements, not rewrites.
