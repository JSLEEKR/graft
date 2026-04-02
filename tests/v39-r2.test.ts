import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import type { Program } from '../src/parser/ast.js';
import { collectRenameLocations } from '../src/lsp/features/rename.js';

const loc = { line: 1, column: 1, offset: 0 };

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

describe('v3.9-R2: estimator polish + TD-01', () => {
  // 1. Cycle warning uses BUDGET_CHAIN_CYCLE code
  it('cycle warning uses BUDGET_CHAIN_CYCLE code', () => {
    // Build AST manually: A -> B (conditional), B -> A (conditional) = cycle
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 500, fields: [{ name: 'query', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'A', model: 'sonnet', budgetIn: 500, budgetOut: 500,
          reads: [{ context: 'Input' }], writes: [],
          produces: { name: 'AOut', fields: [{ name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
        {
          name: 'B', model: 'sonnet', budgetIn: 500, budgetOut: 500,
          reads: [{ context: 'AOut' }], writes: [],
          produces: { name: 'BOut', fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
      ],
      edges: [
        {
          source: 'A',
          target: {
            kind: 'conditional',
            branches: [
              { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
              { condition: { field: 'status', op: '==', value: 'stop' }, target: 'done' },
            ],
          },
          transforms: [],
          location: loc,
        },
        {
          source: 'B',
          target: {
            kind: 'conditional',
            branches: [
              { condition: { field: 'result', op: '==', value: 'retry' }, target: 'A' },
              { condition: { field: 'result', op: '==', value: 'ok' }, target: 'done' },
            ],
          },
          transforms: [],
          location: loc,
        },
      ],
      graphs: [
        { name: 'G', input: 'Input', output: 'BOut', budget: 50000, flow: [{ kind: 'node', name: 'A' }], location: loc },
      ],
    };
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const cycleWarning = report.warnings.find(w => w.message.includes('cycle'));
    expect(cycleWarning).toBeDefined();
    expect(cycleWarning!.code).toBe('BUDGET_CHAIN_CYCLE');
  });

  // 2. Depth warning uses BUDGET_CHAIN_DEPTH code
  it('depth warning uses BUDGET_CHAIN_DEPTH code', () => {
    // Build AST manually: chain N0 -> N1 -> ... -> N11 via conditional edges (depth > 10)
    const nodes = [];
    for (let i = 0; i <= 11; i++) {
      nodes.push({
        name: `N${i}`, model: 'sonnet' as const, budgetIn: 100, budgetOut: 100,
        reads: [{ context: i > 0 ? `N${i - 1}Out` : 'Input' }], writes: [],
        produces: {
          name: `N${i}Out`,
          fields: [{ name: 'status', type: { kind: 'primitive' as const, name: 'String' }, location: loc }],
          location: loc,
        },
        location: loc,
      });
    }
    const edges = [];
    for (let i = 0; i < 11; i++) {
      edges.push({
        source: `N${i}`,
        target: {
          kind: 'conditional' as const,
          branches: [
            { condition: { field: 'status', op: '==' as const, value: 'go' }, target: `N${i + 1}` },
            { condition: { field: 'status', op: '==' as const, value: 'stop' }, target: 'done' },
          ],
        },
        transforms: [],
        location: loc,
      });
    }
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 100, fields: [{ name: 'query', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes,
      edges,
      graphs: [
        { name: 'G', input: 'Input', output: 'N11Out', budget: 500000, flow: [{ kind: 'node', name: 'N0' }], location: loc },
      ],
    };
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const depthWarning = report.warnings.find(w => w.message.includes('maximum depth'));
    expect(depthWarning).toBeDefined();
    expect(depthWarning!.code).toBe('BUDGET_CHAIN_DEPTH');
  });

  // 3. BUDGET_EXCEEDED still used for actual budget exceeded
  it('BUDGET_EXCEEDED still used for actual budget exceeded', () => {
    const program = parse(`
      context BigInput(max_tokens: 5000) { data: String }
      node Expensive(model: sonnet, budget: 5000/5000) {
        reads: [BigInput]
        produces ExpOut { result: String }
      }
      graph G(input: BigInput, output: ExpOut, budget: 1k) { Expensive -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const budgetWarning = report.warnings.find(w => w.code === 'BUDGET_EXCEEDED');
    expect(budgetWarning).toBeDefined();
    expect(budgetWarning!.message).toContain('exceeds budget');
  });

  // 4. Fallback cost included in worst-case for retry_then_fallback
  it('retry_then_fallback worst-case includes fallback node cost', () => {
    const program = parse(`
      context Input(max_tokens: 100) { query: String }
      node Main(model: sonnet, budget: 100/200) {
        reads: [Input]
        on_failure: retry(2, fallback(Backup))
        produces MainOut { result: String }
      }
      node Backup(model: haiku, budget: 100/300) {
        reads: [Input]
        produces BackupOut { result: String }
      }
      graph G(input: Input, output: MainOut, budget: 50k) { Main -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Main cost = 100 (input) + 200 (output) = 300
    // Without fallback: worst = 300 * (1 + 2) = 900
    // Backup cost = 100 (input) + 300 (output) = 400
    // With fallback: worst = 300 * (1 + 2) + 400 = 1300
    // Best case: just Main = 300
    expect(report.bestCase).toBe(300);
    expect(report.worstCase).toBe(1300);
  });

  // 5. TD-01: rename skips identifier inside import path
  it('rename skips identifier inside import path string', () => {
    const docText = `import { Foo } from "shared/Foo"\nnode Foo(model: sonnet, budget: 1k/1k) {\n  reads: [Input]\n  produces FooOut { x: String }\n}`;
    const locations = collectRenameLocations(docText, 'Foo');
    // Should find Foo in: import { Foo }, node Foo
    // Should NOT find Foo inside "shared/Foo" import path
    expect(locations).toHaveLength(2); // import name + node declaration
    for (const l of locations) {
      const line = docText.split('\n')[l.start.line];
      const matchText = line.substring(l.start.character, l.end.character);
      expect(matchText).toBe('Foo');
    }
  });

  // 6. TD-01: rename still finds identifier outside import path
  it('rename finds identifier outside import path on same line', () => {
    const docText = `import { MyNode } from "lib/MyNode"`;
    const locations = collectRenameLocations(docText, 'MyNode');
    // Should find MyNode in "import { MyNode }" but NOT in "lib/MyNode"
    expect(locations).toHaveLength(1);
    expect(locations[0].start.character).toBe(9); // position of MyNode in "import { MyNode }"
  });
});
