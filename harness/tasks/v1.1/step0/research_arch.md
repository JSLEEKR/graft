# v1.1 Research: Parallel + Foreach Flow Control

## 1. Flow AST: string[] -> FlowStep Union

Current `GraphDecl.flow` is `string[]` (sequential node names). Replace with:

```ts
type FlowStep =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; nodes: string[] }
  | { kind: 'foreach'; source: string; field: string; varName: string; maxIterations: number; body: FlowStep[] };
```

`GraphDecl.flow: FlowStep[]` — sequential steps remain a flat array; parallel and foreach are composite steps within that array. This is a recursive type so foreach can nest parallel (future), but v1.1 limits nesting to depth 1.

## 2. Lexer: New Keywords

Add to `TokenType` enum and `KEYWORDS` map:
- `parallel` -> `TokenType.Parallel`
- `foreach` -> `TokenType.Foreach`
- `as` -> `TokenType.As`
- `max_iterations` -> `TokenType.MaxIterations`

Total: 4 new keywords. All lowercase, consistent with existing convention.

## 3. Parser: parseGraph Changes

Replace the simple `while(Arrow) { push(identifier) }` loop with `parseFlowSteps()`:

- On `Identifier`: emit `{ kind: 'node' }`, consume arrow
- On `Parallel`: consume `{`, parse comma-separated identifiers, consume `}`, emit `{ kind: 'parallel' }`
- On `Foreach`: consume `(Source.output.field as var, max_iterations: N)`, consume `{`, parse inner flow steps (recursive call), consume `}`, emit `{ kind: 'foreach' }`
- On `Done`: break

Key syntax from benchmarks:
```
-> parallel { SecurityReviewer, PerformanceReviewer, StyleReviewer }
-> foreach(Planner.output.steps as step, max_iterations: 5) { Implementer -> Verifier }
```

Note: parallel benchmark uses newline-separated nodes (no commas). Parser should accept both.

## 4. Multi-Field Select

Current `Transform` select type: `{ type: 'select'; field: string }`. The parallel benchmark uses `select(vulnerabilities, risk)` with two fields. Change to:

```ts
{ type: 'select'; fields: string[] }  // was: field: string
```

Update `parseTransform` to parse comma-separated fields inside `select()`. Update `applyTransformReductions` to scale by field count: `result * 0.3 * fields.length` (capped at 1.0).

## 5. Token Estimation

**Parallel**: Same total tokens as sequential (all nodes still run). Best case unchanged. Worst case unchanged. The difference is wall-clock time, not token budget. Estimator sums all parallel node costs identically to sequential.

**Foreach**: Multiply the body's token cost by `max_iterations`. Best case = 1 iteration. Worst case = max_iterations * body cost. Add to `TokenReport`:

```ts
// In estimation loop, when encountering foreach:
bestCase += bodyCost * 1;           // optimistic: 1 iteration
worstCase += bodyCost * maxIterations * retryMultiplier;
```

## 6. Codegen: Orchestration Plan

**Parallel steps** emit a step group:
```
### Step 2: Parallel [SecurityReviewer, PerformanceReviewer, StyleReviewer]
- Run concurrently, wait for all to complete
- Agents: security_reviewer, performance_reviewer, style_reviewer
- Completion: all three ===NODE_COMPLETE=== signals received
```

**Foreach steps** emit an iteration block:
```
### Step 2: Foreach over Planner.output.steps (max 5 iterations)
- For each `step` in list:
  - Sub-step 2a: Implementer [foreach-body]
  - Sub-step 2b: Verifier [foreach-body]
- Completion: all iterations done or list exhausted
```

## 7. Files to Modify

| File | Change |
|------|--------|
| `src/lexer/tokens.ts` | Add 4 keywords + token types |
| `src/lexer/lexer.ts` | No change (keywords auto-resolve via KEYWORDS map) |
| `src/parser/ast.ts` | Add `FlowStep` union, change `GraphDecl.flow` type, change `select.field` to `select.fields` |
| `src/parser/parser.ts` | Rewrite `parseGraph` body, add `parseFlowSteps`, `parseParallel`, `parseForeach`; update `parseTransform` for multi-field select |
| `src/analyzer/estimator.ts` | Walk `FlowStep[]` recursively instead of flat loop; parallel = sum, foreach = multiply |
| `src/analyzer/scope.ts` | Validate foreach source/field references; validate parallel node names exist |
| `src/codegen/orchestration.ts` | Emit parallel groups and foreach iteration blocks |
| `src/codegen/*.ts` | Agent generation unchanged (nodes are still nodes) |

## 8. Risk: Breaking Change

`GraphDecl.flow: string[]` -> `FlowStep[]` is a breaking change to the AST. All consumers (estimator, codegen, scope checker, tests) must update simultaneously. Suggest doing this in a single atomic task.
