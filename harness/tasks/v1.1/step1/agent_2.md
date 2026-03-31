# A2-Pragmatist: parallel + foreach + multi-field select (v1.1)

## Convergence Score: 8/10

Both research docs agree on the shape of the work. Disagreements are small and I side with the simpler option in every case (YAGNI).

## Key YAGNI Question: Do We Need Recursive FlowNode?

**No.** The benchmarks prove it:

- `parallel_flow.gft`: parallel at top level only. Body is a flat list of node names (no arrows, no nesting).
- `foreach_flow.gft`: foreach body is a simple sequential chain `Implementer -> Verifier`. No parallel-inside-foreach, no foreach-inside-foreach.

A fully recursive `FlowStep[]` body (research_arch.md) is premature. research_impl.md gets this right: `body: string[]` for foreach -- a sequential sub-flow of node names. No recursion needed for v1.1.

**Decision: Keep it flat. No recursive FlowNode.**

## AST Changes (Minimal)

```ts
// NEW: Add to ast.ts
export type FlowStep =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: string[] };

// CHANGE: GraphDecl
export interface GraphDecl {
  // ... existing fields ...
  flow: FlowStep[];  // was: string[]
}

// CHANGE: Transform select
| { type: 'select'; fields: string[] }  // was: field: string
```

**Why this is minimal:**
1. `branches: string[]` -- not `FlowStep[]`. Parallel is just a bag of node names.
2. `body: string[]` -- not `FlowStep[]`. Foreach body is a sequential node-name list.
3. No recursion. No nesting. If v1.2 needs nested parallel-in-foreach, we promote `body` to `FlowStep[]` then.
4. `select.fields: string[]` -- the only Transform change. Backwards-compatible at runtime (single-field select is `fields: [field]`).

Both research docs agree on `FlowStep` as a discriminated union with `kind`. research_impl.md uses `FlowNode` as the name; research_arch.md uses `FlowStep`. I prefer `FlowStep` -- it describes what it is (a step in the flow), not what it contains.

## Lexer: 4 New Keywords

Both research docs agree exactly:

```ts
// tokens.ts additions
Parallel = 'Parallel',
Foreach = 'Foreach',
As = 'As',
MaxIterations = 'MaxIterations',

// KEYWORDS map additions
parallel: TokenType.Parallel,
foreach: TokenType.Foreach,
as: TokenType.As,
max_iterations: TokenType.MaxIterations,
```

No lexer.ts changes needed -- the KEYWORDS map auto-resolves. Both docs agree on this.

## Parser Changes

### parseGraph: Replace flat loop with FlowStep-aware parsing

Current code (parser.ts lines 373-391) does `expectIdentifier()` then loops `Arrow -> Identifier|done`. Replace with:

```ts
private parseGraph(): GraphDecl {
  // ... existing parameter parsing unchanged ...

  this.expect(TokenType.LBrace);
  const flow: FlowStep[] = [];

  // First step is always a node identifier
  flow.push({ kind: 'node', name: this.expectIdentifier() });

  let sawDone = false;
  while (this.check(TokenType.Arrow)) {
    this.advance();
    if (this.check(TokenType.Done)) {
      this.advance();
      sawDone = true;
      break;
    }
    if (this.check(TokenType.Parallel)) {
      flow.push(this.parseParallelStep());
    } else if (this.check(TokenType.Foreach)) {
      flow.push(this.parseForeachStep());
    } else {
      flow.push({ kind: 'node', name: this.expectIdentifier() });
    }
  }
  if (!sawDone) {
    throw this.error("Expected '-> done' to terminate graph flow");
  }
  this.expect(TokenType.RBrace);

  return { name, input, output, budget, flow, location: loc };
}
```

### parseParallelStep

```ts
private parseParallelStep(): FlowStep {
  this.expect(TokenType.Parallel);
  this.expect(TokenType.LBrace);
  const branches: string[] = [];
  // Whitespace-separated identifiers (benchmark uses newlines, no commas)
  while (!this.check(TokenType.RBrace)) {
    branches.push(this.expectIdentifier());
  }
  this.expect(TokenType.RBrace);
  return { kind: 'parallel', branches };
}
```

**Note on parallel_flow.gft lines 62-68:** The first `SecurityReviewer` on line 62 is a preceding sequential step. Then `-> parallel { SecurityReviewer PerformanceReviewer StyleReviewer }` is the next step. The SecurityReviewer appears in both the sequential and parallel positions -- this is the benchmark's structure. The parser handles this naturally: line 62 emits `{ kind: 'node', name: 'SecurityReviewer' }`, then the arrow leads to the parallel block.

**Comma tolerance:** The benchmark uses whitespace-separated names (no commas). But for robustness, skip optional commas between identifiers in the parallel block. Simple: just don't require them. If a comma appears, consume it; if not, continue. Low cost, prevents user confusion.

### parseForeachStep

```ts
private parseForeachStep(): FlowStep {
  this.expect(TokenType.Foreach);
  this.expect(TokenType.LParen);

  // Source: Planner.output.steps
  const source = this.expectIdentifier();    // "Planner"
  this.expect(TokenType.Dot);
  this.expect(TokenType.Output);             // "output" is a keyword token
  this.expect(TokenType.Dot);
  const field = this.expectIdentifierOrKeyword();  // "steps"

  // Binding: as step
  this.expect(TokenType.As);
  const binding = this.expectIdentifierOrKeyword();

  // max_iterations: 5
  this.expect(TokenType.Comma);
  this.expect(TokenType.MaxIterations);
  this.expect(TokenType.Colon);
  const maxIterations = this.parseIntValue();

  this.expect(TokenType.RParen);

  // Body: { Implementer -> Verifier }
  this.expect(TokenType.LBrace);
  const body: string[] = [];
  body.push(this.expectIdentifier());
  while (this.check(TokenType.Arrow)) {
    this.advance();
    body.push(this.expectIdentifier());
  }
  this.expect(TokenType.RBrace);

  return { kind: 'foreach', source, field, binding, maxIterations, body };
}
```

**Key detail:** The `output` in `Planner.output.steps` is the keyword `TokenType.Output`. The parser must expect it as a keyword token, not an identifier. This is consistent with how the lexer works -- `output` maps to `TokenType.Output` in the KEYWORDS table. research_impl.md calls this a "dotted source" but doesn't flag this token-type subtlety. This will be a bug if missed.

### parseTransform: Multi-field select

```ts
// In parseTransform, replace select branch:
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
```

This is identical to how `parseEnum` already works. Both research docs agree on comma-separated fields.

## Scope Checker Changes

`checkGraphFlow` currently iterates `graph.flow` as `string[]`. Update to walk `FlowStep[]`:

```ts
private checkGraphFlow(errors: GraftError[]): void {
  for (const graph of this.program.graphs) {
    // ... existing input/output checks unchanged ...

    for (const step of graph.flow) {
      switch (step.kind) {
        case 'node':
          this.validateNodeName(step.name, graph.location, errors);
          break;
        case 'parallel':
          for (const name of step.branches) {
            this.validateNodeName(name, graph.location, errors);
          }
          break;
        case 'foreach':
          // Validate source node exists and produces the referenced field
          this.validateForeachSource(step, graph.location, errors);
          for (const name of step.body) {
            this.validateNodeName(name, graph.location, errors);
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              `foreach max_iterations must be >= 1, got ${step.maxIterations}`,
              graph.location,
            ));
          }
          break;
      }
    }
  }
}

private validateNodeName(name: string, loc: SourceLocation, errors: GraftError[]): void {
  if (!this.nodeNames.has(name)) {
    errors.push(new GraftError(`Node '${name}' in graph flow is not declared`, loc));
  }
}

private validateForeachSource(step: ForeachStep, loc: SourceLocation, errors: GraftError[]): void {
  // Check that step.source is a node name
  if (!this.nodeNames.has(step.source)) {
    errors.push(new GraftError(
      `foreach source '${step.source}' is not a declared node`, loc));
    return;
  }
  // Check that the node's produces has the referenced field
  const node = this.program.nodes.find(n => n.name === step.source);
  if (node) {
    const fieldNames = new Set(node.produces.fields.map(f => f.name));
    if (!fieldNames.has(step.field)) {
      errors.push(new GraftError(
        `foreach field '${step.field}' not found in produces of '${step.source}'`, loc));
    }
  }
}
```

## Estimator Changes

The current estimator loops `graph.flow` as `string[]` (lines 51-97). Replace with FlowStep-aware iteration:

```ts
for (const step of graph.flow) {
  switch (step.kind) {
    case 'node': {
      // Existing logic for single node -- unchanged
      const { best, worst } = this.estimateNode(step.name, warnings, nodeReports);
      bestCase += best;
      worstCase += worst;
      break;
    }
    case 'parallel': {
      // Token cost is the SAME as sequential (all nodes run, all tokens consumed)
      // research_arch.md is right: parallel doesn't save tokens, only wall-clock time
      for (const name of step.branches) {
        const { best, worst } = this.estimateNode(name, warnings, nodeReports);
        bestCase += best;
        worstCase += worst;
      }
      break;
    }
    case 'foreach': {
      // Body cost * iterations
      let bodyBest = 0;
      let bodyWorst = 0;
      for (const name of step.body) {
        const { best, worst } = this.estimateNode(name, warnings, nodeReports);
        bodyBest += best;
        bodyWorst += worst;
      }
      bestCase += bodyBest * 1;                    // optimistic: 1 iteration
      worstCase += bodyWorst * step.maxIterations;  // pessimistic: max iterations
      break;
    }
  }
}
```

Extract existing per-node estimation into a helper `estimateNode(name)` to avoid duplication. Both research docs agree on the estimation approach. research_impl.md suggests parallel best-case = max(branch costs), but that's wrong for token budgeting -- all branches consume tokens regardless of wall-clock parallelism. research_arch.md gets this right: parallel total tokens = sum.

### Multi-field select estimation

```ts
case 'select':
  result = Math.floor(result * 0.3 * t.fields.length);
  result = Math.min(result, tokens); // cap: can't exceed original
  break;
```

research_arch.md caps at 1.0, research_impl.md caps at 0.9. I go with capping at the original token count (can't select more data than exists). The `Math.min` handles this cleanly.

## Orchestration Changes

Replace the flat node-name loop with FlowStep-aware generation:

```ts
for (let i = 0; i < graph.flow.length; i++) {
  const step = graph.flow[i];
  switch (step.kind) {
    case 'node':
      // Existing sequential step output -- unchanged
      steps += formatSequentialStep(i + 1, step.name, ...);
      break;
    case 'parallel':
      steps += `\n### Step ${i + 1}: [parallel]\n`;
      for (const name of step.branches) {
        steps += `- Agent: ${name.toLowerCase()}\n`;
        // ... token estimates, completion signals ...
      }
      steps += `- Completion: all ${step.branches.length} agents signal ===NODE_COMPLETE===\n`;
      break;
    case 'foreach':
      steps += `\n### Step ${i + 1}: [foreach over ${step.source}.output.${step.field}, max ${step.maxIterations} iterations]\n`;
      steps += `- Binding: \`${step.binding}\`\n`;
      for (let j = 0; j < step.body.length; j++) {
        steps += `  - Sub-step ${String.fromCharCode(97 + j)}: ${step.body[j]}\n`;
      }
      steps += `- Completion: all iterations done or list exhausted\n`;
      break;
  }
}
```

## Disagreements Between Research Docs

| Topic | research_arch.md | research_impl.md | My call |
|-------|-----------------|------------------|---------|
| Type name | `FlowStep` | `FlowNode` | `FlowStep` -- describes role not identity |
| Parallel field name | `nodes: string[]` | `branches: string[]` | `branches` -- clearer that they are unordered |
| Foreach body type | `body: FlowStep[]` (recursive) | `body: string[]` (flat) | `body: string[]` -- YAGNI, benchmarks don't nest |
| Parallel estimation best-case | sum | max(branch costs) | sum -- tokens are consumed regardless of parallelism |
| Select scaling cap | 1.0 | 0.9 | `Math.min(result, original)` -- natural cap |
| Foreach body recursive? | Yes (depth-limited) | No | No. If v1.2 needs it, we promote then |

## Files to Modify (ordered by dependency)

1. **`src/lexer/tokens.ts`** -- Add 4 enum values + 4 KEYWORDS entries
2. **`src/parser/ast.ts`** -- Add `FlowStep` type, change `GraphDecl.flow`, change `select.field` to `select.fields`
3. **`src/parser/parser.ts`** -- Add `parseParallelStep`, `parseForeachStep`, update `parseGraph`, update `parseTransform`
4. **`src/analyzer/scope.ts`** -- Walk `FlowStep[]` in `checkGraphFlow`, add `validateForeachSource`
5. **`src/analyzer/estimator.ts`** -- Extract `estimateNode` helper, walk `FlowStep[]`, foreach multiplication, multi-field select scaling
6. **`src/codegen/orchestration.ts`** -- FlowStep-aware step generation

## Risks

1. **Breaking change**: `GraphDecl.flow: string[]` -> `FlowStep[]` breaks every consumer. Must update all 6 files atomically. Both research docs flag this.
2. **`output` keyword in foreach source**: `Planner.output.steps` -- the `output` token is `TokenType.Output`, not an identifier. Parser must `this.expect(TokenType.Output)` there. Neither research doc calls this out explicitly enough. This will be a parser bug if treated as identifier.
3. **Test updates**: All existing tests that construct `GraphDecl` or inspect `graph.flow` must change from `string[]` to `FlowStep[]`. Expect ~15-20 test updates.
4. **`select.field` -> `select.fields` rename**: Every test and consumer that touches Transform select must update. Grep for `.field` on select transforms to find all sites.

## What We Are NOT Doing (YAGNI)

- No recursive/nested flow steps
- No parallel-inside-foreach
- No foreach-inside-foreach
- No dynamic iteration count (always static `max_iterations`)
- No `break`/`continue` in foreach
- No conditional routing inside parallel branches
- No named parallel groups or join strategies
