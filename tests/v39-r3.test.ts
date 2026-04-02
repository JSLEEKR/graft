import { describe, it, expect } from 'vitest';
import { executeFlowNodes, executeConditionalChain, FlowContext, ConditionalEdgeInfo } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { collectRenameLocations } from '../src/lsp/features/rename.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import type { FlowNode, Program } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

/**
 * Create a FlowContext mock for integration tests.
 */
function makeCtx(opts: {
  nodeOutputs?: Record<string, Record<string, unknown>>;
  conditionalEdges?: Record<string, ConditionalEdgeInfo>;
  failNodes?: string[];
  failureStrategies?: Record<string, { type: 'retry'; max: number } | { type: 'fallback'; node: string } | { type: 'skip' } | { type: 'abort' } | { type: 'retry_then_fallback'; max: number; node: string }>;
} = {}): FlowContext & { _executedNodes: string[] } {
  const outputs = new Map<string, unknown>();
  const executedNodes: string[] = [];

  return {
    outputs,
    input: {},
    executeNode: async (name: string): Promise<NodeResult> => {
      executedNodes.push(name);
      if (opts.failNodes?.includes(name)) {
        return { node: name, output: null, durationMs: 1, success: false, error: `${name} failed` };
      }
      const output = opts.nodeOutputs?.[name] ?? {};
      outputs.set(name, output);
      return { node: name, output, durationMs: 1, success: true };
    },
    getConditionalEdge: (sourceName: string) => {
      return opts.conditionalEdges?.[sourceName] ?? null;
    },
    getFailureStrategy: (name: string) => {
      return opts.failureStrategies?.[name];
    },
    get _executedNodes() { return executedNodes; },
  } as FlowContext & { _executedNodes: string[] };
}

describe('v3.9-R3: integration and regression tests', () => {
  // ──── Cross-feature tests ────

  // 1. Conditional edge transform + multi-hop chain: transforms applied at each hop,
  //    data flows correctly through transformed hops
  it('conditional edge transform applied at each hop in multi-hop chain with data flow verification', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', findings: ['x', 'y'], debug: 'verbose', extra: 'noise' },
        B: { status: 'continue', summary: 'partial', trace: 'data', junk: 'remove' },
        C: { final: 'complete' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [{ type: 'select', fields: ['findings'] }],
        },
        B: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'continue' }, target: 'C' },
          ],
          transforms: [{ type: 'select', fields: ['summary'] }],
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', findings: ['x', 'y'], debug: 'verbose', extra: 'noise' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', findings: ['x', 'y'], debug: 'verbose', extra: 'noise' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    // Both B and C executed in order
    expect(ctx._executedNodes).toEqual(['B', 'C']);
    // A's output transformed by A->B edge transforms (select findings only)
    expect(ctx.outputs.get('A')).toEqual({ findings: ['x', 'y'] });
    // B's output transformed by B->C edge transforms (select summary only)
    expect(ctx.outputs.get('B')).toEqual({ summary: 'partial' });
    // C's output unchanged (no outgoing conditional edge with transforms)
    expect(ctx.outputs.get('C')).toEqual({ final: 'complete' });
  });

  // 2. Conditional edge transform + foreach source: foreach source node has
  //    a conditional edge with transform, foreach iterates over transformed output
  it('foreach source node with conditional edge + transform flows correctly', async () => {
    // Setup: Producer has conditional edge with select transform to Processor.
    // Then foreach iterates over Processor's output field.
    const ctx = makeCtx({
      nodeOutputs: {
        Producer: { status: 'ready', items: ['a', 'b', 'c'], metadata: 'drop-this' },
        Processor: { status: 'ok', results: [{ id: 1 }, { id: 2 }], debug: 'info' },
        Worker: { done: true },
      },
      conditionalEdges: {
        Producer: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'ready' }, target: 'Processor' },
          ],
          transforms: [{ type: 'select', fields: ['items'] }],
        },
      },
    });

    // Execute the flow: Producer -> (conditional) -> Processor, then foreach over Processor.results
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Producer' },
      {
        kind: 'foreach',
        source: 'Processor',
        field: 'results',
        binding: 'item',
        maxIterations: 10,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Producer executed, then Processor via conditional chain
    expect(ctx._executedNodes).toContain('Producer');
    expect(ctx._executedNodes).toContain('Processor');
    // Producer output was transformed (select items only)
    expect(ctx.outputs.get('Producer')).toEqual({ items: ['a', 'b', 'c'] });
    // Foreach iterated over Processor.results (2 items), executing Worker twice
    const workerExecutions = ctx._executedNodes.filter(n => n === 'Worker');
    expect(workerExecutions).toHaveLength(2);
  });

  // 3. Estimator with BUDGET_CHAIN_CYCLE code in conditional chain estimate report
  it('estimator emits BUDGET_CHAIN_CYCLE for cyclic conditional chain', () => {
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 100, fields: [{ name: 'q', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'Alpha', model: 'sonnet', budgetIn: 200, budgetOut: 200,
          reads: [{ context: 'Input', location: loc }], writes: [], tools: [],
          produces: { name: 'AlphaOut', fields: [{ name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
        {
          name: 'Beta', model: 'sonnet', budgetIn: 200, budgetOut: 200,
          reads: [{ context: 'AlphaOut', location: loc }], writes: [], tools: [],
          produces: { name: 'BetaOut', fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
      ],
      edges: [
        {
          source: 'Alpha',
          target: { kind: 'conditional', branches: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'Beta' }] },
          transforms: [{ type: 'select', fields: ['status'] }],
          location: loc,
        },
        {
          source: 'Beta',
          target: { kind: 'conditional', branches: [{ condition: { field: 'result', op: '==', value: 'retry' }, target: 'Alpha' }] },
          transforms: [],
          location: loc,
        },
      ],
      graphs: [
        { name: 'G', input: 'Input', output: 'BetaOut', budget: 100000, flow: [{ kind: 'node', name: 'Alpha' }], location: loc },
      ],
    };

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const cycleWarning = report.warnings.find(w => w.code === 'BUDGET_CHAIN_CYCLE');
    expect(cycleWarning).toBeDefined();
    expect(cycleWarning!.message).toContain('cycle');
  });

  // ──── Regression tests ────

  // 4. Single-hop conditional edge WITHOUT transform still works (no transform applied)
  it('single-hop conditional edge without transform leaves output unchanged', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', data: 'value', extra: 'keep-me' },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [], // No transforms declared
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', data: 'value', extra: 'keep-me' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', data: 'value', extra: 'keep-me' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('B');
    // Output fully preserved when no transforms declared
    expect(ctx.outputs.get('A')).toEqual({ status: 'go', data: 'value', extra: 'keep-me' });
  });

  // 5. BUDGET_EXCEEDED still emitted for actual budget exceeded (not replaced by new codes)
  it('BUDGET_EXCEEDED still emitted for actual budget overage, coexists with new codes', () => {
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
    // Verify the code is specifically BUDGET_EXCEEDED, not one of the new chain codes
    expect(budgetWarning!.code).not.toBe('BUDGET_CHAIN_CYCLE');
    expect(budgetWarning!.code).not.toBe('BUDGET_CHAIN_DEPTH');
  });

  // 6. Rename skips identifier inside import path after TD-01 AST-based filtering
  it('rename skips identifier inside import path but finds declaration and usage', () => {
    const docText = [
      'import { Analyzer } from "shared/Analyzer"',
      'context Input(max_tokens: 500) { query: String }',
      'node Analyzer(model: sonnet, budget: 1k/1k) {',
      '  reads: [Input]',
      '  produces AnalyzerOut { result: String }',
      '}',
      'graph G(input: Input, output: AnalyzerOut, budget: 10k) { Analyzer -> done }',
    ].join('\n');

    const locations = collectRenameLocations(docText, 'Analyzer');

    // Should find: import { Analyzer }, node Analyzer, and Analyzer in graph flow
    // Should NOT find: Analyzer inside "shared/Analyzer" import path
    // Check that no location points inside the import path string
    for (const l of locations) {
      const line = docText.split('\n')[l.start.line];
      const matchText = line.substring(l.start.character, l.end.character);
      expect(matchText).toBe('Analyzer');
      // Verify it's not inside quotes (the import path)
      const beforeMatch = line.substring(0, l.start.character);
      const quoteCount = (beforeMatch.match(/"/g) || []).length;
      // If inside quotes, quoteCount would be odd
      expect(quoteCount % 2).toBe(0);
    }

    // Should have at least 3 locations (import name, node decl, graph flow)
    expect(locations.length).toBeGreaterThanOrEqual(3);
  });

  // 7. Conditional chain estimation backward compat: existing chain estimations
  //    unchanged by fallback cost addition
  it('conditional chain estimation backward compatible without fallback', () => {
    // Simple chain: A -> B (conditional), no retry/fallback
    // A cost = 100 (in) + 200 (out) = 300
    // B cost = 200 (in from AOut budgetOut) + 300 (out) = 500
    // Best case: A only (300) if condition routes to done, or A+B (800) if B is cheapest path
    // Worst case: A + B = 800 (all conditional branches taken)
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 100, fields: [{ name: 'q', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'A', model: 'sonnet', budgetIn: 100, budgetOut: 200,
          reads: [{ context: 'Input', location: loc }], writes: [], tools: [],
          produces: { name: 'AOut', fields: [{ name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
        {
          name: 'B', model: 'haiku', budgetIn: 200, budgetOut: 300,
          reads: [{ context: 'AOut', location: loc }], writes: [], tools: [],
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
      ],
      graphs: [
        { name: 'G', input: 'Input', output: 'BOut', budget: 50000, flow: [{ kind: 'node', name: 'A' }], location: loc },
      ],
    };

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();

    // A cost = 100 + 200 = 300
    // Conditional branches: B (500) or done (0)
    // Best = A (300) + min(B cost=500, done=0) = 300
    // Worst = A (300) + max(B cost=500, done=0) = 800
    expect(report.bestCase).toBe(300);
    expect(report.worstCase).toBe(800);
    // No budget warnings (budget is 50k)
    expect(report.warnings).toHaveLength(0);
  });

  // ──── Scale test ────

  // 8. Parallel block: conditional edges are NOT auto-chained (parallel only executes
  //    each branch node, conditional chaining is a sequential-flow concern).
  //    This documents the current behavior as a regression guard.
  it('parallel block executes branches but does not trigger conditional chains', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        P1: { status: 'go', result: 'p1-data' },
        P2: { status: 'pass', result: 'p2-data' },
        P1Next: { final: 'p1-done' },
        P2Next: { final: 'p2-done' },
      },
      conditionalEdges: {
        P1: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'P1Next' },
          ],
          transforms: [{ type: 'select', fields: ['result'] }],
        },
        P2: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'pass' }, target: 'P2Next' },
          ],
          transforms: [{ type: 'compact' }],
        },
      },
    });

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['P1', 'P2'] },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Both parallel branches executed
    expect(ctx._executedNodes).toContain('P1');
    expect(ctx._executedNodes).toContain('P2');
    // Conditional chains are NOT triggered from parallel branches
    // (only sequential 'node' flow steps trigger conditional chaining)
    expect(ctx._executedNodes).not.toContain('P1Next');
    expect(ctx._executedNodes).not.toContain('P2Next');
    // Outputs preserved as-is (no transforms applied since chains didn't run)
    expect(ctx.outputs.get('P1')).toEqual({ status: 'go', result: 'p1-data' });
    expect(ctx.outputs.get('P2')).toEqual({ status: 'pass', result: 'p2-data' });
  });

  // 9. Additional cross-feature: estimator handles conditional chain with transforms
  //    and still produces correct cost estimates
  it('estimator accounts for transform reductions in conditional chain cost', () => {
    // A produces AOut (budgetOut=1000). Edge A->B has select transform (1 field).
    // B reads AOut. The select transform should reduce B's estimated input.
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 100, fields: [{ name: 'q', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'A', model: 'sonnet', budgetIn: 100, budgetOut: 1000,
          reads: [{ context: 'Input', location: loc }], writes: [], tools: [],
          produces: { name: 'AOut', fields: [{ name: 'findings', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
        {
          name: 'B', model: 'haiku', budgetIn: 500, budgetOut: 200,
          reads: [{ context: 'AOut', location: loc }], writes: [], tools: [],
          produces: { name: 'BOut', fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
      ],
      edges: [
        {
          source: 'A',
          target: { kind: 'direct', node: 'B' },
          transforms: [{ type: 'select', fields: ['findings'] }],
          location: loc,
        },
      ],
      graphs: [
        { name: 'G', input: 'Input', output: 'BOut', budget: 50000, flow: [{ kind: 'node', name: 'A' }, { kind: 'node', name: 'B' }], location: loc },
      ],
    };

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();

    // A cost = 100 (in) + 1000 (out) = 1100
    // B reads AOut (budgetOut=1000), but select with 1 field: floor(1000 * 0.3) = 300
    // B cost = 300 (reduced input) + 200 (out) = 500
    // Total = 1100 + 500 = 1600
    expect(report.bestCase).toBe(1600);
    expect(report.worstCase).toBe(1600);

    // Verify B's node report shows reduced input
    const bReport = report.nodes.find(n => n.name === 'B');
    expect(bReport).toBeDefined();
    expect(bReport!.estimatedIn).toBe(300); // floor(1000 * 0.3 * 1)
  });

  // 10. Regression: parallel branches that do NOT have conditional edges still work
  it('parallel branches without conditional edges execute normally', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        X: { xResult: 'done' },
        Y: { yResult: 'done' },
        Z: { zResult: 'done' },
      },
      // No conditional edges defined
    });

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['X', 'Y', 'Z'] },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('X');
    expect(ctx._executedNodes).toContain('Y');
    expect(ctx._executedNodes).toContain('Z');
    // All outputs preserved as-is
    expect(ctx.outputs.get('X')).toEqual({ xResult: 'done' });
    expect(ctx.outputs.get('Y')).toEqual({ yResult: 'done' });
    expect(ctx.outputs.get('Z')).toEqual({ zResult: 'done' });
    expect(results).toHaveLength(3);
  });
});
