# Technical Retrospective: Graft v4.0 (Variables, Expressions, Graph Params)

## Version Summary

v4.0 delivered 6 rounds: expression parser + AST + lexer (R1, HIGH), scope + type checker (R2, MEDIUM), flow-runner runtime (R3), estimator + codegen (R4), LSP (R5), integration tests (R6, TEST-ONLY). Test count rose from 890 to 980 (+90 tests, 72 v4.0-specific). 32 new ratchet items (v4.0-R01 through R33). One PASS-on-first-try streak across all 6 rounds.

---

## 1. Tech Debt Introduced or Deferred

### TD-NEW-01: conditionFieldName multi-segment bug [MEDIUM, DEFERRED]
`conditionFieldName()` in ast.ts joins segments with `.` and returns `<expr>` for non-field_access. The `evaluateCondition` path (flow-runner.ts:87) calls `output[conditionFieldName(condition)]` for multi-segment LHS, producing a dotted key like `"node.field"` for a flat property lookup -- always misses. Only single-segment field_access and variable references work correctly. Deferred as pre-existing per R2 review feedback. This is the only MEDIUM item in the codebase.

### TD-NEW-02: Flat precedence for division [LOW, INTENTIONAL]
Division parses at additive precedence (v4.0-R02). `a + b / c` parses as `(a + b) / c`. Debated in R1 (A4 withdrew multiplicative level). Revisit only if `*` or `%` operators are added.

### TD-NEW-03: Division by zero returns 0 silently [LOW]
flow-runner.ts:55 returns `0` on division by zero. No warning propagated. Acceptable for DSL but worth documenting.

### TD-NEW-04: Loose equality in evaluateCondition [LOW]
Condition evaluation uses `==`/`!=` (loose equality, lines 95-96). Allows `"5" == 5`. May be intentional for LLM string-number coercion but is a latent type confusion source.

### TD-NEW-05: Graph call shares outputs map [LOW]
Case `graph_call` (flow-runner.ts:330-334) creates child FlowContext with separate `variables` but shares `outputs` map via spread. Child graph nodes write into parent outputs. No namespace isolation -- a child graph node named the same as a parent node silently overwrites.

### TD-NEW-06: No `*` (multiply) or `%` (modulo) operators [LOW]
Binary op is `'+' | '-' | '/'`. Low priority but may surface as a user request.

### Carried from v3.9 (all LOW, stable 3+ versions)
TD-05 (lexer throws on first error), TD-06 (completion context detection), TD-07 (isInComment O(n) scan), TD-08 (empty catch blocks), TD-09 (workspace export cache no deletion), TD-10 (FlowNode.location optional).

---

## 2. Patterns That Should Be Formalized

### P-01: Variable-first resolution (duplicated across 4 sites)
Single-segment field_access resolves variables before node outputs in: scope.ts `checkExprSources`, types.ts `inferExprType`, flow-runner.ts `evaluateExpr`, and flow-runner.ts `evaluateCondition`. Ratcheted (v4.0-R21, R24, R25) but the resolution logic is copy-pasted. A shared `resolveIdentifier()` or documented contract would reduce divergence risk.

### P-02: DFS cycle detection with visited+inStack (duplicated)
Used in `checkGraphRecursion` (scope.ts:554) and `checkFallbackCycles` (scope.ts:602). Identical algorithmic pattern, different data structures. A generic `detectCycles(edges, onCycle)` helper would deduplicate.

### P-03: Parallel FlowNode walkers (3 sites)
`walkFlowNodes` (scope.ts), `walkFlowForTypes` (types.ts), `executeFlowNodes` (flow-runner.ts) all switch on `step.kind` across 5 FlowNode kinds. Each must be updated when a new kind is added. The T3 no-visitor ratchet blocks a formal visitor, but exhaustive switch validation (TypeScript `never` default) should be enforced in all three walkers.

### P-04: InferredType shadow type system
types.ts maintains `InferredType = 'number' | 'string' | 'boolean' | 'unknown'` separate from `TypeExpr`, bridged by `typeExprToInferred`. Adequate for scalar expressions but will need extension if list/map expressions are added.

---

## 3. Ratchet Review

### Candidates for Revisiting

| Ratchet | Issue | Recommendation |
|---------|-------|----------------|
| v4.0-R02 (flat division) | No `*` operator means division rarely useful alone | Revisit only if adding `*`; add multiplicative level then |
| v4.0-R04 (conditionFieldName bridge) | Was "incremental migration" but multi-segment path is still broken | Fix the multi-segment path or remove the bridge in v4.1 |
| v4.0-R09 (foreach rejects parallel/foreach) | Nested parallel-in-foreach blocked at parser | Reconsider if use cases emerge |
| v2.0-R13 (only context/node importable) | Blocks memory importability | Unlock if shared memory libraries needed |

### Ratchets Confirmed Valid
All 32 v4.0 ratchets reviewed. The Expr 5-kind union (R01), variable-first resolution (R21), graph recursion DFS (R19), and foreach body clone (R16) are all structurally sound.

---

## 4. Edge Cases and Failure Modes

1. **Deeply nested graph calls at runtime**: `checkGraphRecursion` catches static cycles but not non-cyclic deep chains (A->B->C->...->Z). Could cause stack overflow. No runtime depth limit exists.

2. **Variable shadowing in graph calls**: A graph param named the same as a parent variable silently shadows it. No warning emitted. Child `variables` map is independent (correct), but user gets no feedback.

3. **Undefined propagation in expressions**: Multi-segment field access returns `undefined` silently when intermediate segments are missing (flow-runner.ts:38-43). The `undefined` flows into binary ops and becomes `NaN` via `Number(undefined)`.

4. **Let bindings not re-assignable**: Second `let x = ...` in same scope hits SCOPE_VAR_COLLISION. No mutation path exists. If in-graph loops or conditionals are added, this needs scoped rebinding.

5. **No runtime type validation for graph param values**: Scope checker validates literal param types at compile time (scope.ts:506), but runtime `evaluateExpr` for computed args has no type guard. A String-typed param could receive a number at runtime.

6. **Graph call Node-type param error message**: Error says "undeclared node" without mentioning it was passed as a graph param -- potentially confusing.

---

## 5. Performance and Quality

### File Growth
| File | v3.9 Lines | v4.0 Lines | Growth |
|------|-----------|-----------|--------|
| scope.ts | 435 | 694 | +259 (graph recursion, var collision, expr sources, graph call args) |
| types.ts | ~120 | 289 | +169 (expr type inference, var condition types) |
| flow-runner.ts | 236 | 340 | +104 (evaluateExpr, let/graph_call cases) |
| parser.ts | ~906 | ~880+ expression section | +~60 (expression parsing) |
| ast.ts | ~148 | 179 | +31 (Expr, GraphParam, GraphArg) |

scope.ts at 694 lines is now the largest non-LSP file. The 6 new methods for v4.0 graph/variable checking could be extracted to a `graph-checker.ts` sub-module.

### Test Health
- 980 total tests, all passing
- 72 new v4.0-specific tests across 5 files
- 6 rounds, 0 NEEDS_CHANGES (clean sweep)
- R1 full 4-agent debate was productive: forced dissent yielded 2 accepted changes (Node not in KEYWORDS, foreach allows graph_call)

### ProgramIndex Threading
The single-instance pattern (`?? new ProgramIndex(program)` fallback) continues to work. compiler.ts threads one instance through ScopeChecker, TypeChecker, and TokenEstimator. Standalone usage without passing an index causes redundant construction but is harmless.

---

## 6. Summary

v4.0 added a well-structured expression system with clean AST types (5-kind Expr union), consistent variable-first resolution across all pipeline stages, graph params with type checking, and graph call execution with scoped variables. The main debts are: (1) conditionFieldName multi-segment bug now the only MEDIUM item, (2) shared outputs map in graph calls enabling silent overwrites, (3) three parallel FlowNode walkers that must stay synchronized, (4) scope.ts growth to 694 lines warranting sub-module extraction. The flat precedence and limited operator set are intentional simplifications appropriate for Graft's DSL scope. With 980 tests and comprehensive diagnostic coverage, the codebase remains in excellent health.
