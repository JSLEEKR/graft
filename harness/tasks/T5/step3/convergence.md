# T5 Convergence: Analyzer (Scope, Type, Token Estimation)

## Decision Log

### Unanimous (all agents agree)
1. **Three-class decomposition**: ScopeChecker, TypeChecker, TokenEstimator -- separate files, separate concerns.
2. **Error accumulation**: `check(): GraftError[]`, not throw. AST is well-formed; collect all errors.
3. **Rename tokens.ts to estimator.ts**: Avoids confusion with `lexer/tokens.ts`.
4. **Parser constructor fix**: `new Parser(tokens)` not `new Parser(tokens, source)` per T4-R01.
5. **Graph input/output validation**: Must exist. Placed in ScopeChecker (3/4 agents agree; it is name resolution, not type compatibility, and ScopeChecker already has both `contextNames` and `producesMap`).
6. **Transform heuristics**: select=0.3, filter=0.5, drop=0.85, compact=0.7, truncate=min. Sound for v1.
7. **Multi-error accumulation test**: All agree to add (locks the defining behavioral difference from parser).

### Resolved Disagreements

| Issue | A2 (YAGNI) | A3 (Fix) | Decision | Rationale |
|-------|-----------|----------|----------|-----------|
| retry_then_fallback fallback cost | TODO comment | Add fallback node cost | **TODO comment** | No v1 program uses retry_then_fallback. Dead code path. A3 is technically correct but the fix requires refactoring getRetryMultiplier from pure multiplier to multiplier+additive, which is unnecessary churn for v1. |
| Conditional edge estimation | TODO comment | Store per-branch in edgeMap | **TODO comment** | No v1 program uses conditional edges. The fix is 3 lines but tests cannot exercise it. Document for v2. |
| Per-node budgetIn warning | A2 agrees small | A4 wants | **Include** | 5 lines, matches spec ("Warn if estimated > declared"), exercises warning severity path. Cheap and correct. |

### V1 Accepted Limitations
- Condition type compatibility (e.g., `>=` on String) -- needs type-flow analysis, out of scope.
- Multiple graph support -- `estimate()` processes `graphs[0]` only.
- Duplicate edge overwrite in edgeMap -- unlikely in practice.

---

## File 1: `src/analyzer/scope.ts`

```typescript
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // produces name -> field names

  constructor(program: Program) {
    this.program = program;
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.producesMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesMap.set(node.produces.name, fieldNames);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkNodeReads(errors);
    this.checkEdges(errors);
    this.checkGraphFlow(errors);
    return errors;
  }

  private checkNodeReads(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const ref of node.reads) {
        // ref.context could be a context name or a produces name
        const isContext = this.contextNames.has(ref.context);
        const isProduces = this.producesMap.has(ref.context);

        if (!isContext && !isProduces) {
          errors.push(new GraftError(
            `'${ref.context}' is not declared as a context or produces output`,
            ref.location,
          ));
          continue;
        }

        // Check partial reference field
        if (ref.field) {
          if (isContext) {
            const ctx = this.program.contexts.find(c => c.name === ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            if (!fieldNames.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in context '${ref.context}'`,
                ref.location,
              ));
            }
          } else if (isProduces) {
            const fields = this.producesMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in produces '${ref.context}'`,
                ref.location,
              ));
            }
          }
        }
      }
    }
  }

  private checkEdges(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      if (!this.nodeNames.has(edge.source)) {
        errors.push(new GraftError(
          `Edge source '${edge.source}' is not a declared node`,
          edge.location,
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.nodeNames.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (!this.nodeNames.has(branch.target)) {
            errors.push(new GraftError(
              `Edge target '${branch.target}' is not a declared node`,
              edge.location,
            ));
          }
        }
      }
    }
  }

  private checkGraphFlow(errors: GraftError[]): void {
    for (const graph of this.program.graphs) {
      // Validate graph input references a declared context
      if (!this.contextNames.has(graph.input)) {
        errors.push(new GraftError(
          `Graph input '${graph.input}' is not a declared context`,
          graph.location,
        ));
      }

      // Validate graph output references a declared produces type
      if (!this.producesMap.has(graph.output)) {
        errors.push(new GraftError(
          `Graph output '${graph.output}' is not a declared produces type`,
          graph.location,
        ));
      }

      // Validate flow node names
      for (const nodeName of graph.flow) {
        if (!this.nodeNames.has(nodeName)) {
          errors.push(new GraftError(
            `Node '${nodeName}' in graph flow is not declared`,
            graph.location,
          ));
        }
      }
    }
  }
}
```

---

## File 2: `src/analyzer/types.ts`

```typescript
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class TypeChecker {
  private program: Program;
  private producesFieldsMap: Map<string, Set<string>>; // node name -> produces field names

  constructor(program: Program) {
    this.program = program;
    this.producesFieldsMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesFieldsMap.set(node.name, fieldNames);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkEdgeTransforms(errors);
    return errors;
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        // TODO: condition type compatibility -- e.g., >= on String fields (v2)
        if (transform.type === 'select') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `select: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        }
      }
    }
  }
}
```

---

## File 3: `src/analyzer/estimator.ts`

```typescript
import { Program, NodeDecl, Transform } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export interface NodeTokenReport {
  name: string;
  estimatedIn: number;
  estimatedOut: number;
}

export interface TokenReport {
  graphName: string;
  budget: number;
  bestCase: number;
  worstCase: number;
  nodes: NodeTokenReport[];
  warnings: GraftError[];
}

export class TokenEstimator {
  private program: Program;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, import('../parser/ast.js').EdgeDecl>; // "source->target" key

  constructor(program: Program) {
    this.program = program;
    this.nodeMap = new Map();
    this.edgeMap = new Map();

    for (const node of program.nodes) {
      this.nodeMap.set(node.name, node);
    }
    for (const edge of program.edges) {
      if (edge.target.kind === 'direct') {
        this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
      }
      // TODO: store conditional edge branches for token estimation (v2)
    }
  }

  estimate(): TokenReport {
    const graph = this.program.graphs[0]; // v1: single graph
    if (!graph) {
      return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
    }

    const warnings: GraftError[] = [];
    const nodeReports: NodeTokenReport[] = [];
    let bestCase = 0;
    let worstCase = 0;

    for (let i = 0; i < graph.flow.length; i++) {
      const nodeName = graph.flow[i];
      const node = this.nodeMap.get(nodeName);
      if (!node) continue;

      // Estimate input: sum of reads token costs
      let estimatedIn = 0;
      for (const ref of node.reads) {
        // If reading a context
        const ctx = this.program.contexts.find(c => c.name === ref.context);
        if (ctx) {
          estimatedIn += ref.field ? Math.floor(ctx.maxTokens * 0.3) : ctx.maxTokens;
          continue;
        }
        // If reading a produces output from upstream node
        const sourceNode = this.program.nodes.find(n => n.produces.name === ref.context);
        if (sourceNode) {
          let upstreamTokens = sourceNode.budgetOut;
          // Check for edge transform reductions
          const edgeKey = `${sourceNode.name}->${nodeName}`;
          const edge = this.edgeMap.get(edgeKey);
          if (edge) {
            upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
          }
          estimatedIn += ref.field ? Math.floor(upstreamTokens * 0.3) : upstreamTokens;
        }
      }

      // Per-node budgetIn warning (spec: "Warn if estimated > declared")
      if (estimatedIn > node.budgetIn) {
        warnings.push(new GraftError(
          `Node '${nodeName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
          node.location,
          'warning',
        ));
      }

      const estimatedOut = node.budgetOut;
      const nodeTokens = estimatedIn + estimatedOut;
      bestCase += nodeTokens;

      // Worst case: account for retries
      const retryMultiplier = this.getRetryMultiplier(node);
      worstCase += nodeTokens * retryMultiplier;
      // TODO: retry_then_fallback worst-case should include fallback node cost (v2)

      nodeReports.push({ name: nodeName, estimatedIn, estimatedOut });
    }

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

  private applyTransformReductions(tokens: number, transforms: Transform[]): number {
    let result = tokens;
    for (const t of transforms) {
      switch (t.type) {
        case 'select':
          result = Math.floor(result * 0.3); // keep ~one field
          break;
        case 'filter':
          result = Math.floor(result * 0.5); // filter reduces ~50%
          break;
        case 'drop':
          result = Math.floor(result * 0.85); // drop one field ~15% savings
          break;
        case 'compact':
          result = Math.floor(result * 0.7); // compact ~30% reduction
          break;
        case 'truncate':
          result = Math.min(result, t.tokens);
          break;
      }
    }
    return result;
  }

  private getRetryMultiplier(node: NodeDecl): number {
    if (!node.onFailure) return 1;
    switch (node.onFailure.type) {
      case 'retry':
        return 1 + node.onFailure.max;
      case 'retry_then_fallback':
        return 1 + node.onFailure.max;
      default:
        return 1;
    }
  }
}
```

---

## File 4: `tests/analyzer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator, TokenReport } from '../src/analyzer/estimator.js';
import { Program } from '../src/parser/ast.js';
import { GraftError } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}

describe('ScopeChecker', () => {
  it('passes valid reads references', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) {
        question: String
      }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1k/500) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for undeclared context in reads', () => {
    const program = parse(`
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UnknownContext]
        produces Research { findings: List<String> }
      }
      graph Q(input: UnknownContext, output: Research, budget: 5k) {
        Researcher -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('UnknownContext');
  });

  it('reports error for invalid partial reference field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.nonexistent]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent');
  });

  it('reports error for undeclared node in edge', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      edge A -> GhostNode
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('GhostNode');
  });

  it('reports error for undeclared node in graph flow', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> MissingNode -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('MissingNode');
  });

  it('reports error for undeclared graph input context', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [FakeInput]
        produces Out { data: String }
      }
      graph G(input: FakeInput, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const inputError = errors.find(e => e.message.includes('FakeInput') && e.message.includes('input'));
    expect(inputError).toBeDefined();
  });

  it('reports error for undeclared graph output produces', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: GhostOutput, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const outputError = errors.find(e => e.message.includes('GhostOutput') && e.message.includes('output'));
    expect(outputError).toBeDefined();
  });

  it('accumulates multiple errors', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ghost1, Ghost2]
        produces Out { data: String }
      }
      graph G(input: Ghost1, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    // At least 2 errors: Ghost1 undeclared read + Ghost2 undeclared read
    // (plus Ghost1 undeclared graph input)
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('TypeChecker', () => {
  it('passes valid edge transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          findings: List<String>
          score: Float(0..1)
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.findings]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings)
        | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for select on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(nonexistent_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent_field');
  });

  it('reports error for drop on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | drop(ghost_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('ghost_field');
  });
});

describe('TokenEstimator', () => {
  it('estimates tokens for a simple pipeline', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
        | select(findings)
        | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
  });

  it('warns when worst case exceeds budget', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 3k/2k) {
        reads: [Spec]
        on_failure: retry(3)
        produces Out { data: String }
      }
      node B(model: haiku, budget: 3k/2k) {
        reads: [Out]
        on_failure: retry(3)
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('warns when node estimated input exceeds budgetIn', () => {
    const program = parse(`
      context BigContext(max_tokens: 5k) { data: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [BigContext]
        produces Out { result: String }
      }
      graph G(input: BigContext, output: Out, budget: 10k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // BigContext is 5000 tokens, budgetIn is 1000 -- should warn
    const nodeWarning = report.warnings.find(w => w.message.includes('exceeds budgetIn'));
    expect(nodeWarning).toBeDefined();
  });
});
```

---

## Verification Commands

```bash
# 1. Create the analyzer directory and files
mkdir -p src/analyzer

# 2. Write the three source files (scope.ts, types.ts, estimator.ts)
# (copy contents from sections above)

# 3. Compile
npx tsc --noEmit

# 4. Run tests
npx vitest run tests/analyzer.test.ts

# 5. Run all tests to verify no regression
npx vitest run
```

---

## Ratchet Candidates for Common Memory

- [T5-R01] Analyzer uses error accumulation (GraftError[]), not throw -- LOCK
- [T5-R02] File naming: estimator.ts not tokens.ts -- LOCK
- [T5-R03] Graph input/output validation in ScopeChecker -- LOCK
- [T5-R04] Per-node budgetIn warning in TokenEstimator -- LOCK
- [T5-R05] Three-class decomposition: scope.ts, types.ts, estimator.ts -- LOCK

## Implementation Notes

- `EdgeDecl` import in estimator.ts: used inline type import to avoid unused import lint issues. The `edgeMap` type uses `import('../parser/ast.js').EdgeDecl` inline. Alternatively, add `EdgeDecl` to the main import statement if the linter does not flag it.
- The `toLocaleString()` from the plan was removed in the budget warning message. It adds locale-dependent formatting which could make test assertions fragile. Plain number toString is sufficient.
- ScopeChecker `checkGraphFlow` now validates `graph.input` against `contextNames` and `graph.output` against `producesMap` before checking flow node names.
- The "undeclared context in reads" test also has `graph(input: UnknownContext, ...)` which will now produce a graph input error too. The test checks `errors.length > 0` and `errors[0].message.includes('UnknownContext')`, which still passes since the reads error fires first (checkNodeReads runs before checkGraphFlow).
