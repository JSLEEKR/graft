# A1-Architect: v1.1 parallel + foreach + multi-field select

## Convergence Score: 0.85

Research agents agree on the broad strokes (FlowNode union, 4 keywords, recursive parser, multi-field select). Divergences on naming (`branches` vs `nodes`, `body: string[]` vs `body: FlowNode[]`) and estimator semantics (parallel best-case: sum vs max) are resolved below with rationale.

---

## 1. AST Type Changes (`src/parser/ast.ts`)

### 1a. FlowNode discriminated union

```ts
// NEW: replaces GraphDecl.flow: string[]
export type FlowNode =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: FlowNode[] };
```

**Design decisions:**

- **`branches: string[]`** not `nodes` -- "branches" communicates unordered/concurrent semantics. Research_impl uses `branches`, research_arch uses `nodes`. `branches` wins because `nodes` collides with `Program.nodes` mentally.
- **`body: FlowNode[]`** not `body: string[]` -- recursive type enables future nesting (foreach containing parallel). Research_arch proposed this; research_impl proposed flat `string[]`. The recursive type costs nothing extra today (v1.1 limits depth to 1 via parser validation) and avoids a v1.2 breaking change.
- **`source`/`field`/`binding`** -- `foreach(Planner.output.steps as step, max_iterations: 5)` decomposes to `source: "Planner"`, `field: "steps"`, `binding: "step"`. The `.output.` segment is syntactic sugar (always "output"), so we don't store it.

### 1b. GraphDecl change

```ts
export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  flow: FlowNode[];  // CHANGED from string[]
  location: SourceLocation;
}
```

### 1c. Transform select change

```ts
export type Transform =
  | { type: 'select'; fields: string[] }   // CHANGED from field: string
  | { type: 'filter'; field: string; condition: Condition }
  | { type: 'drop'; field: string }
  | { type: 'compact' }
  | { type: 'truncate'; tokens: number };
```

Single-field selects become `fields: ["summary"]`. Multi-field: `fields: ["vulnerabilities", "risk"]`.

### 1d. Complete ast.ts diff summary

| Line | Old | New |
|------|-----|-----|
| After `FailureStrategy` type | (nothing) | Add `FlowNode` type export |
| `GraphDecl.flow` | `flow: string[]` | `flow: FlowNode[]` |
| `Transform` select variant | `field: string` | `fields: string[]` |

---

## 2. New Keywords (`src/lexer/tokens.ts`)

### 2a. TokenType enum additions

```ts
// Add to TokenType enum, after Abort:
Parallel = 'Parallel',
Foreach = 'Foreach',
As = 'As',
MaxIterations = 'MaxIterations',
```

### 2b. KEYWORDS map additions

```ts
// Add to KEYWORDS:
parallel: TokenType.Parallel,
foreach: TokenType.Foreach,
as: TokenType.As,
max_iterations: TokenType.MaxIterations,
```

Both agents agree on these 4 keywords. `max_iterations` uses underscore to match `max_tokens` convention. No lexer.ts changes needed -- the KEYWORDS map auto-resolves in the existing identifier/keyword disambiguation logic.

**Ambiguity analysis:** `parallel` and `foreach` are lowercase keywords. Graph flow node names are PascalCase identifiers (`SecurityReviewer`). No ambiguity: after `->`, the parser checks `current().type` -- `TokenType.Parallel` vs `TokenType.Foreach` vs `TokenType.Identifier` is unambiguous LL(1).

---

## 3. Parser Changes (`src/parser/parser.ts`)

### 3a. Import changes

```ts
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl,
  Field, TypeExpr, ContextRef, ProducesDecl,
  Transform, Condition, FailureStrategy,
  EdgeTarget, ConditionalBranch,
  FlowNode,  // NEW
} from './ast.js';
```

### 3b. parseGraph rewrite

Replace the current flow-parsing block (lines 374-388) with a call to `parseFlowSteps()`:

```ts
private parseGraph(): GraphDecl {
  const loc = this.current().location;
  this.expect(TokenType.Graph);
  const name = this.expectIdentifier();

  // Parameters: (input: X, output: Y, budget: Nk)
  this.expect(TokenType.LParen);
  this.expect(TokenType.Input);
  this.expect(TokenType.Colon);
  const input = this.expectIdentifier();
  this.expect(TokenType.Comma);
  this.expect(TokenType.Output);
  this.expect(TokenType.Colon);
  const output = this.expectIdentifier();
  this.expect(TokenType.Comma);
  this.expect(TokenType.Budget);
  this.expect(TokenType.Colon);
  const budget = this.parseTokenValue();
  this.expect(TokenType.RParen);

  // Body: { FlowSteps -> done }
  this.expect(TokenType.LBrace);
  const flow = this.parseFlowSteps(/* insideBlock */ false);
  this.expect(TokenType.RBrace);

  return { name, input, output, budget, flow, location: loc };
}
```

### 3c. parseFlowSteps -- the core recursive function

```ts
/**
 * Parse a sequence of flow steps separated by arrows.
 * When insideBlock=true, stops at RBrace (foreach/parallel body).
 * When insideBlock=false, expects -> done to terminate.
 *
 * Grammar:
 *   FlowSteps := FlowStep ( '->' FlowStep )* '->' 'done'
 *   FlowStep  := Identifier
 *              | 'parallel' '{' Identifier+ '}'
 *              | 'foreach' '(' DottedRef 'as' Identifier ',' 'max_iterations' ':' Int ')' '{' FlowSteps '}'
 */
private parseFlowSteps(insideBlock: boolean): FlowNode[] {
  const steps: FlowNode[] = [];

  // Parse first step
  steps.push(this.parseFlowStep());

  while (this.check(TokenType.Arrow)) {
    this.advance(); // consume ->

    // Check for 'done' (only valid at top level, but we accept it anywhere
    // and let the caller validate)
    if (this.check(TokenType.Done)) {
      this.advance();
      if (insideBlock) {
        throw this.error("'done' is not allowed inside a foreach or parallel block");
      }
      return steps;
    }

    // Check for RBrace -- end of foreach body after arrow would be an error
    if (this.check(TokenType.RBrace)) {
      throw this.error("Expected flow step after '->'");
    }

    steps.push(this.parseFlowStep());
  }

  // If we get here without 'done' at top level, that's an error
  if (!insideBlock) {
    throw this.error("Expected '-> done' to terminate graph flow");
  }

  // insideBlock: we stop when no more arrows (next token should be RBrace)
  return steps;
}
```

### 3d. parseFlowStep -- dispatches to parallel/foreach/node

```ts
private parseFlowStep(): FlowNode {
  if (this.check(TokenType.Parallel)) {
    return this.parseParallelStep();
  }
  if (this.check(TokenType.Foreach)) {
    return this.parseForeachStep();
  }
  // Regular node reference
  const name = this.expectIdentifier();
  return { kind: 'node', name };
}
```

### 3e. parseParallelStep

```ts
/**
 * parallel { SecurityReviewer  PerformanceReviewer  StyleReviewer }
 *
 * Branches are whitespace-separated identifiers (no commas, no arrows).
 * Per benchmark: newline-separated, not comma-separated.
 * Parser accepts both: identifiers until RBrace, optional commas ignored.
 */
private parseParallelStep(): FlowNode {
  this.expect(TokenType.Parallel);
  this.expect(TokenType.LBrace);

  const branches: string[] = [];
  while (!this.check(TokenType.RBrace)) {
    if (branches.length > 0 && this.check(TokenType.Comma)) {
      this.advance(); // optional comma
    }
    branches.push(this.expectIdentifier());
  }
  this.expect(TokenType.RBrace);

  if (branches.length < 2) {
    throw this.error('parallel block must contain at least 2 branches');
  }

  return { kind: 'parallel', branches };
}
```

**Note on parallel_flow.gft anomaly:** The benchmark file has `SecurityReviewer` both as a preceding sequential node AND as the first entry inside `parallel { ... }`. This is intentional -- the first `SecurityReviewer` on line 62 is a separate sequential step (the "entry point"), and the parallel block on lines 63-67 is the next step. The parser handles this correctly: line 62 becomes `{ kind: 'node', name: 'SecurityReviewer' }`, then the arrow on line 63 leads to `{ kind: 'parallel', branches: ['SecurityReviewer', 'PerformanceReviewer', 'StyleReviewer'] }`. The scope checker validates that all branch names are declared nodes; it does NOT deduplicate. This matches the benchmark intent (all three reviewers run in parallel).

### 3f. parseForeachStep

```ts
/**
 * foreach(Planner.output.steps as step, max_iterations: 5) {
 *   Implementer -> Verifier
 * }
 *
 * Parses: foreach ( <Identifier>.output.<Identifier> as <Identifier> , max_iterations : <Int> ) { <FlowSteps> }
 */
private parseForeachStep(): FlowNode {
  this.expect(TokenType.Foreach);
  this.expect(TokenType.LParen);

  // Source: Planner.output.steps
  const source = this.expectIdentifier();   // "Planner"
  this.expect(TokenType.Dot);
  const outputKw = this.expectIdentifierOrKeyword(); // "output"
  if (outputKw !== 'output') {
    throw this.error(`Expected 'output' in foreach source, got '${outputKw}'`);
  }
  this.expect(TokenType.Dot);
  const field = this.expectIdentifierOrKeyword();  // "steps"

  // Binding: as step
  this.expect(TokenType.As);
  const binding = this.expectIdentifierOrKeyword(); // "step"

  // max_iterations: 5
  this.expect(TokenType.Comma);
  this.expect(TokenType.MaxIterations);
  this.expect(TokenType.Colon);
  const maxIterations = this.parseIntValue();

  if (maxIterations < 1) {
    throw this.error('max_iterations must be at least 1');
  }

  this.expect(TokenType.RParen);

  // Body: { Implementer -> Verifier }
  this.expect(TokenType.LBrace);
  const body = this.parseFlowSteps(/* insideBlock */ true);
  this.expect(TokenType.RBrace);

  if (body.length === 0) {
    throw this.error('foreach body must contain at least one step');
  }

  return { kind: 'foreach', source, field, binding, maxIterations, body };
}
```

### 3g. parseTransform update for multi-field select

```ts
private parseTransform(): Transform {
  if (this.check(TokenType.Select)) {
    this.advance();
    this.expect(TokenType.LParen);
    const fields: string[] = [];
    fields.push(this.expectIdentifierOrKeyword());
    while (this.check(TokenType.Comma)) {
      this.advance();
      fields.push(this.expectIdentifierOrKeyword());
    }
    this.expect(TokenType.RParen);
    return { type: 'select', fields };
  }
  // ... rest unchanged
}
```

---

## 4. Scope Checker Changes (`src/analyzer/scope.ts`)

### 4a. Replace flat flow iteration with recursive walk

```ts
private checkGraphFlow(errors: GraftError[]): void {
  for (const graph of this.program.graphs) {
    // Validate graph input/output (unchanged)
    if (!this.contextNames.has(graph.input)) {
      errors.push(new GraftError(
        `Graph input '${graph.input}' is not a declared context`,
        graph.location,
      ));
    }
    if (!this.producesMap.has(graph.output)) {
      errors.push(new GraftError(
        `Graph output '${graph.output}' is not a declared produces type`,
        graph.location,
      ));
    }

    // Walk FlowNode tree
    this.walkFlowNodes(graph.flow, graph.location, errors);
  }
}

private walkFlowNodes(nodes: FlowNode[], location: SourceLocation, errors: GraftError[]): void {
  for (const step of nodes) {
    switch (step.kind) {
      case 'node':
        if (!this.nodeNames.has(step.name)) {
          errors.push(new GraftError(
            `Node '${step.name}' in graph flow is not declared`,
            location,
          ));
        }
        break;
      case 'parallel':
        for (const branch of step.branches) {
          if (!this.nodeNames.has(branch)) {
            errors.push(new GraftError(
              `Node '${branch}' in parallel block is not declared`,
              location,
            ));
          }
        }
        break;
      case 'foreach':
        // Validate source node exists
        if (!this.nodeNames.has(step.source)) {
          errors.push(new GraftError(
            `Foreach source node '${step.source}' is not declared`,
            location,
          ));
        }
        // Validate source node produces the referenced field
        // Find the produces output for the source node
        const sourceNode = this.program.nodes.find(n => n.name === step.source);
        if (sourceNode) {
          const fieldNames = new Set(sourceNode.produces.fields.map(f => f.name));
          if (!fieldNames.has(step.field)) {
            errors.push(new GraftError(
              `Field '${step.field}' does not exist in '${step.source}' produces output`,
              location,
            ));
          }
        }
        if (step.maxIterations < 1) {
          errors.push(new GraftError(
            `foreach max_iterations must be at least 1`,
            location,
          ));
        }
        // Recurse into body
        this.walkFlowNodes(step.body, location, errors);
        break;
    }
  }
}
```

### 4b. Import FlowNode

Add `FlowNode` to the import from `../parser/ast.js`. Also import `SourceLocation` from diagnostics (already imported indirectly via GraftError, but needed for the `walkFlowNodes` parameter).

---

## 5. Token Estimator Changes (`src/analyzer/estimator.ts`)

### 5a. Replace flat loop with recursive estimateFlowNodes

```ts
estimate(): TokenReport {
  const graph = this.program.graphs[0];
  if (!graph) {
    return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
  }

  const warnings: GraftError[] = [];
  const nodeReports: NodeTokenReport[] = [];
  let bestCase = 0;
  let worstCase = 0;

  this.estimateFlowNodes(graph.flow, nodeReports, warnings);

  for (const nr of nodeReports) {
    bestCase += nr.estimatedIn + nr.estimatedOut;
  }
  // Worst case recalculated with retry multipliers and foreach
  const { best, worst } = this.computeFlowCosts(graph.flow);
  bestCase = best;
  worstCase = worst;

  if (worstCase > graph.budget) {
    warnings.push(new GraftError(
      `Worst-case token usage (${worstCase}) exceeds budget (${graph.budget})`,
      graph.location,
      'warning',
    ));
  }

  return {
    graphName: graph.name,
    budget: graph.budget,
    bestCase,
    worstCase,
    nodes: nodeReports,
    warnings,
  };
}
```

### 5b. computeFlowCosts -- recursive cost calculator

```ts
private computeFlowCosts(steps: FlowNode[]): { best: number; worst: number } {
  let best = 0;
  let worst = 0;

  for (const step of steps) {
    switch (step.kind) {
      case 'node': {
        const node = this.nodeMap.get(step.name);
        if (!node) break;
        const cost = this.getNodeCost(step.name, node);
        const retryMul = this.getRetryMultiplier(node);
        best += cost;
        worst += cost * retryMul;
        break;
      }
      case 'parallel': {
        // Parallel: all branches run. Total tokens = sum of all branches.
        // Both best and worst are sums (tokens consumed, not wall-clock).
        for (const branchName of step.branches) {
          const node = this.nodeMap.get(branchName);
          if (!node) continue;
          const cost = this.getNodeCost(branchName, node);
          const retryMul = this.getRetryMultiplier(node);
          best += cost;
          worst += cost * retryMul;
        }
        break;
      }
      case 'foreach': {
        // Foreach: body runs up to maxIterations times.
        // Best case = 1 iteration. Worst case = maxIterations iterations.
        const bodyCosts = this.computeFlowCosts(step.body);
        best += bodyCosts.best * 1;
        worst += bodyCosts.worst * step.maxIterations;
        break;
      }
    }
  }

  return { best, worst };
}

private getNodeCost(nodeName: string, node: NodeDecl): number {
  let estimatedIn = 0;
  for (const ref of node.reads) {
    const ctx = this.program.contexts.find(c => c.name === ref.context);
    if (ctx) {
      estimatedIn += ref.field ? Math.floor(ctx.maxTokens * 0.3) : ctx.maxTokens;
      continue;
    }
    const sourceNode = this.program.nodes.find(n => n.produces.name === ref.context);
    if (sourceNode) {
      let upstreamTokens = sourceNode.budgetOut;
      const edgeKey = `${sourceNode.name}->${nodeName}`;
      const edge = this.edgeMap.get(edgeKey);
      if (edge) {
        upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
      }
      estimatedIn += ref.field ? Math.floor(upstreamTokens * 0.3) : upstreamTokens;
    }
  }
  return estimatedIn + node.budgetOut;
}
```

### 5c. applyTransformReductions update for multi-field select

```ts
case 'select':
  result = Math.floor(result * 0.3 * t.fields.length);
  result = Math.min(result, tokens); // cap at original
  break;
```

Research_impl says `0.3 * fields.length` capped at 0.9. I cap at original tokens instead (more correct -- 4 fields should not exceed total). The `Math.min` with `tokens` (original input) prevents pathological cases.

### 5d. estimateFlowNodes -- populates nodeReports (for display)

```ts
private estimateFlowNodes(steps: FlowNode[], reports: NodeTokenReport[], warnings: GraftError[]): void {
  for (const step of steps) {
    switch (step.kind) {
      case 'node': {
        const node = this.nodeMap.get(step.name);
        if (!node) break;
        const estimatedIn = this.getEstimatedIn(step.name, node);
        if (estimatedIn > node.budgetIn) {
          warnings.push(new GraftError(
            `Node '${step.name}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
            node.location,
            'warning',
          ));
        }
        reports.push({ name: step.name, estimatedIn, estimatedOut: node.budgetOut });
        break;
      }
      case 'parallel':
        for (const branchName of step.branches) {
          const node = this.nodeMap.get(branchName);
          if (!node) continue;
          const estimatedIn = this.getEstimatedIn(branchName, node);
          if (estimatedIn > node.budgetIn) {
            warnings.push(new GraftError(
              `Node '${branchName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
              node.location,
              'warning',
            ));
          }
          reports.push({ name: branchName, estimatedIn, estimatedOut: node.budgetOut });
        }
        break;
      case 'foreach':
        this.estimateFlowNodes(step.body, reports, warnings);
        break;
    }
  }
}
```

---

## 6. Codegen Orchestration Changes (`src/codegen/orchestration.ts`)

### 6a. Replace flat flow loop with recursive step generation

Replace the `for (let i = 0; i < graph.flow.length; i++)` loop with a recursive function that handles all three FlowNode kinds.

```ts
function generateSteps(
  flow: FlowNode[],
  report: TokenReport,
  edgeMap: Map<string, boolean>,
  startStep: number,
  prevNode: string | null,
): { text: string; nextStep: number; lastNode: string | null } {
  let text = '';
  let stepNum = startStep;
  let prev = prevNode;

  for (const step of flow) {
    switch (step.kind) {
      case 'node': {
        const lowerName = step.name.toLowerCase();
        const nodeReport = report.nodes.find(n => n.name === step.name);
        let inputSource = '';
        if (prev) {
          const hasTransform = edgeMap.has(`${prev}->${step.name}`);
          inputSource = hasTransform
            ? `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json\``
            : `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}.json\``;
        }
        text += `
### Step ${stepNum}: ${step.name} [sequential]
- Agent: ${lowerName}${inputSource}
- Expected tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}
- Completion: \`===NODE_COMPLETE:${lowerName}===\`
- Output: \`.graft/session/node_outputs/${lowerName}.json\`
`;
        prev = step.name;
        stepNum++;
        break;
      }

      case 'parallel': {
        const branchList = step.branches.join(', ');
        text += `
### Step ${stepNum}: Parallel [${branchList}]
- Run concurrently, wait for all to complete
`;
        for (const branchName of step.branches) {
          const lowerName = branchName.toLowerCase();
          const nodeReport = report.nodes.find(n => n.name === branchName);
          text += `- Agent: ${lowerName} — tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}
`;
        }
        text += `- Completion: all ${step.branches.length} \`===NODE_COMPLETE===\` signals received
`;
        // After parallel, prev is ambiguous; set to null (next node reads from multiple)
        prev = null;
        stepNum++;
        break;
      }

      case 'foreach': {
        text += `
### Step ${stepNum}: Foreach over ${step.source}.output.${step.field} (max ${step.maxIterations} iterations)
- For each \`${step.binding}\` in list:
`;
        // Generate sub-steps with letter suffixes
        let subLetter = 'a';
        for (const bodyStep of step.body) {
          if (bodyStep.kind === 'node') {
            const lowerName = bodyStep.name.toLowerCase();
            text += `  - Sub-step ${stepNum}${subLetter}: ${bodyStep.name} [foreach-body]
`;
            subLetter = String.fromCharCode(subLetter.charCodeAt(0) + 1);
          }
        }
        text += `- Completion: all iterations done or list exhausted
`;
        prev = null;
        stepNum++;
        break;
      }
    }
  }

  return { text, nextStep: stepNum, lastNode: prev };
}
```

### 6b. Update generateOrchestration to call the recursive function

```ts
export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const edgeMap = new Map<string, boolean>();
  for (const edge of program.edges) {
    if (edge.target.kind === 'direct' && edge.transforms.length > 0) {
      edgeMap.set(`${edge.source}->${edge.target.node}`, true);
    }
  }

  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null);

  return `# Graft Orchestration: ${graph.name}
...  // rest unchanged
## Execution Plan
${steps}
...`;
}
```

Import `FlowNode` from ast.

---

## 7. Files Modified Summary

| File | Changes | Risk |
|------|---------|------|
| `src/lexer/tokens.ts` | +4 enum values, +4 KEYWORDS entries | Low -- additive |
| `src/parser/ast.ts` | +`FlowNode` type, `GraphDecl.flow` type change, `Transform.select` field->fields | **HIGH** -- breaking |
| `src/parser/parser.ts` | +`parseFlowSteps`, `parseFlowStep`, `parseParallelStep`, `parseForeachStep`; rewrite `parseGraph` body; update `parseTransform` | **HIGH** -- core logic |
| `src/analyzer/scope.ts` | +`walkFlowNodes` recursive validator | Medium |
| `src/analyzer/estimator.ts` | +`computeFlowCosts`, `estimateFlowNodes`, `getNodeCost` recursive; update `applyTransformReductions` for multi-field | Medium |
| `src/codegen/orchestration.ts` | +`generateSteps` recursive; update `generateOrchestration` | Medium |
| `src/codegen/hooks.ts` | Update jq select for multi-field: `.field1, .field2` | Low |
| Tests (6+ files) | New + updated tests | Medium |

**No changes to:** `src/lexer/lexer.ts` (keywords auto-resolve), `src/codegen/codegen.ts` (pass-through), `src/errors/diagnostics.ts`.

---

## 8. Test Strategy

### 8a. Lexer tests (`tests/lexer.test.ts`)

- **4 new tests:** Tokenize `parallel`, `foreach`, `as`, `max_iterations` as their respective keyword types.
- Verify they don't break identifier tokenization (PascalCase names still work).

### 8b. Parser tests (`tests/parser.test.ts`)

- **Parse parallel block:** `graph G(...) { A -> parallel { B C D } -> E -> done }` produces correct FlowNode array.
- **Parse foreach block:** `graph G(...) { A -> foreach(A.output.items as item, max_iterations: 3) { B -> C } -> done }` produces correct FlowNode.
- **Parse multi-field select:** `edge A -> B | select(x, y, z)` produces `{ type: 'select', fields: ['x', 'y', 'z'] }`.
- **Single-field select still works:** `edge A -> B | select(x)` produces `fields: ['x']`.
- **Error: unterminated parallel:** `parallel {` with no RBrace throws.
- **Error: parallel with < 2 branches:** `parallel { A }` throws.
- **Error: foreach missing max_iterations:** throws.
- **Error: done inside foreach body:** throws.
- **Error: foreach max_iterations < 1:** throws.

### 8c. Analyzer tests (`tests/analyzer.test.ts`)

- **Scope: invalid node in parallel** -- error reported for undeclared branch name.
- **Scope: invalid source in foreach** -- error for undeclared source node.
- **Scope: invalid field in foreach** -- error for field not in produces.
- **Estimator: parallel = sum** -- total tokens equals sum of all branch costs.
- **Estimator: foreach best=1x, worst=Nx** -- verify multiplied costs.
- **Estimator: multi-field select** -- `0.3 * fields.length` reduction, capped.

### 8d. Codegen tests (`tests/codegen.test.ts`)

- **Orchestration parallel output** -- contains `[parallel]` label, lists all branches.
- **Orchestration foreach output** -- contains `[foreach, max N iterations]`, sub-steps labeled.

### 8e. Integration tests (`tests/integration.test.ts`)

- **Compile `parallel_flow.gft`** end-to-end: no errors, orchestration output correct.
- **Compile `foreach_flow.gft`** end-to-end: no errors, orchestration output correct.

### 8f. Estimated test count

~20 new tests across modules. Existing 110 tests must continue passing (the `field -> fields` change will require updating existing select-related tests).

---

## 9. Migration Path for Breaking Change

The `flow: string[] -> FlowNode[]` and `select.field -> select.fields` changes break all consumers. Implementation order:

1. **tokens.ts** -- additive, safe first
2. **ast.ts** -- type changes (compiler will flag all broken call sites)
3. **parser.ts** -- implement new parsing (tests will fail until step 4)
4. **Update all existing tests** that reference `graph.flow` as `string[]` or `transform.field`
5. **scope.ts** -- walk FlowNode tree
6. **estimator.ts** -- recursive cost calculation
7. **orchestration.ts** -- recursive step generation
8. **hooks.ts** -- multi-field jq select
9. **New tests** for parallel/foreach/multi-field

This must be done as a single atomic task -- partial application leaves the compiler in a broken state.

---

## 10. Decisions Requiring Convergence

| Decision | A1 Position | Rationale |
|----------|-------------|-----------|
| `branches` vs `nodes` | `branches` | Avoids mental collision with `Program.nodes` |
| `body: FlowNode[]` vs `body: string[]` | `FlowNode[]` | Future-proofs nesting; no cost today |
| Parallel estimation: sum vs max for best-case | sum | Tokens are consumed regardless of parallelism; wall-clock is not modeled |
| Foreach best-case: 1 iteration | 1 iteration | Optimistic bound; worst-case = maxIterations |
| Multi-field select cap | `Math.min(result, original)` | More correct than arbitrary 0.9 cap |
| `done` inside foreach body | Error | `done` terminates the graph, not a sub-flow |
| Parallel minimum branches | 2 | Single branch is just sequential; enforce intent |
