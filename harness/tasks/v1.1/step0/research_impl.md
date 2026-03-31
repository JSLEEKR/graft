# v1.1 Implementation Research: parallel + foreach Flow Control

## 1. tokens.ts
Add 4 enum values: `Parallel`, `Foreach`, `As`, `MaxIterations`. Add 4 KEYWORDS entries: `parallel`, `foreach`, `as`, `max_iterations`. Lexer auto-handles via KEYWORDS map -- no lexer.ts changes needed.

## 2. ast.ts — FlowNode Discriminated Union
Replace `flow: string[]` with `flow: FlowNode[]`:
```ts
export type FlowNode =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }  // parallel { A  B  C }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: string[] }  // foreach(X.output.Y as z, max_iterations: N) { A -> B }
```
This is the minimal union. `branches` are unordered node names. `body` is a sequential sub-flow.

## 3. parser.ts — parseGraph Changes
Current flow parsing: `expectIdentifier()` then loop `Arrow -> Identifier|done`. Change to:
- After each `->`, check `current()` for `TokenType.Parallel`, `TokenType.Foreach`, or identifier.
- `parallel`: consume `{`, read node names (no arrows between them -- whitespace-separated identifiers), consume `}`.
- `foreach`: consume `(`, parse dotted source (`Planner.output.steps`), expect `as`, read binding name, expect `,`, expect `max_iterations`, expect `:`, read int, consume `)`, consume `{`, parse sub-flow as `Identifier (-> Identifier)*`, consume `}`.
- No ambiguity: `parallel` and `foreach` are keywords; graph flow nodes are PascalCase identifiers. The first token after `->` determines the branch unambiguously.

Note: The benchmark `parallel_flow.gft` has `SecurityReviewer` before `-> parallel { ... }` (lines 62-68). The first `SecurityReviewer` on line 63 inside the parallel block is redundant with line 62. The parser should handle this: line 62 is the preceding sequential node, then `-> parallel { ... }` is the next FlowNode.

## 4. Multi-field select: `select(a, b)`
Current Transform type: `{ type: 'select'; field: string }`. Change to `fields: string[]`.
- In `parseTransform`, after first `expectIdentifierOrKeyword()`, loop on `Comma` to collect additional fields.
- Estimator: `select` reduction factor should scale: `0.3` for 1 field, `0.3 * fields.length` capped at `0.9`.
- Codegen hooks.ts: `jq` select expression needs `.field1, .field2` instead of `.field`.
- Affects: ast.ts (Transform union), parser.ts (parseTransform), estimator.ts, hooks.ts.

## 5. scope.ts Changes
`checkGraphFlow` currently iterates `graph.flow` as `string[]`. Must walk `FlowNode[]`:
- `kind: 'node'`: validate `name` exists in `nodeNames`.
- `kind: 'parallel'`: validate each `branches[i]` exists in `nodeNames`.
- `kind: 'foreach'`: validate `source` context/produces exists, validate each `body[i]` exists in `nodeNames`, validate `maxIterations > 0`.

## 6. estimator.ts Changes
Currently sums tokens sequentially over `graph.flow`. New logic:
- `kind: 'node'`: unchanged (add node cost).
- `kind: 'parallel'`: best-case = max(branch costs), worst-case = sum(branch costs). For budget safety, use sum.
- `kind: 'foreach'`: multiply body cost by `maxIterations`.

## 7. orchestration.ts Changes
Step labels currently all say `[sequential]`. New:
- `kind: 'parallel'`: emit `### Step N: [parallel]` with sub-bullets for each branch agent.
- `kind: 'foreach'`: emit `### Step N: [foreach, max N iterations]` with body steps indented.

## 8. codegen.ts
Pass-through -- no changes needed beyond what orchestration.ts handles.

## 9. Test Strategy
| Module | New Tests |
|--------|-----------|
| lexer.test.ts | Tokenize `parallel`, `foreach`, `as`, `max_iterations` as keywords |
| parser.test.ts | Parse parallel block, foreach block, multi-field select, error on unterminated blocks |
| analyzer.test.ts | Scope: invalid node in parallel branches, invalid source in foreach; Estimator: parallel sum/max, foreach multiply |
| codegen.test.ts | Orchestration output contains `[parallel]` and `[foreach]` sections |
| integration.test.ts | Compile `parallel_flow.gft` and `foreach_flow.gft` end-to-end |

Estimated: ~20 new tests across modules.
