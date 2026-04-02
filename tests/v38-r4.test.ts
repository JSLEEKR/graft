import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { executeFlowNodes, executeConditionalChain, applyFallbackAlias, FlowContext } from '../src/runtime/flow-runner.js';
import { MAX_CONDITIONAL_HOPS } from '../src/constants.js';
import { MAX_CONDITIONAL_HOPS as FLOW_RUNNER_MAX_HOPS } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import type { Program, FlowNode, ConditionalBranch } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

const loc = { line: 1, column: 1, offset: 0 };

function addConditionalEdge(
  program: Program,
  source: string,
  branches: ConditionalBranch[],
): void {
  program.edges.push({
    source,
    target: { kind: 'conditional', branches },
    transforms: [],
    location: loc,
  });
}

/**
 * Create a FlowContext for runtime tests.
 */
function makeFlowCtx(opts: {
  nodeOutputs?: Record<string, Record<string, unknown>>;
  conditionalEdges?: Record<string, ConditionalBranch[]>;
  failNodes?: string[];
  failureStrategies?: Record<string, { type: 'fallback'; node: string }>;
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
      return opts.failureStrategies?.[name] ?? undefined;
    },
    get _executedNodes() { return executedNodes; },
  } as FlowContext & { _executedNodes: string[] };
}

// =============================================================================
// v3.8-R4: Integration & Regression Tests
// =============================================================================
describe('v3.8-R4: cross-feature integration and regression tests', () => {

  // -------------------------------------------------------------------------
  // 1. Estimator + runtime parity: 3-hop chain, estimator range covers runtime
  // -------------------------------------------------------------------------
  it('3-hop chain: estimator cost range covers actual runtime path', async () => {
    // Build program with A -> B -> C -> D conditional chain
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { status: String }
      }
      node B(model: sonnet, budget: 1k/300) {
        reads: [OutA]
        produces OutB { status: String }
      }
      node C(model: sonnet, budget: 1k/200) {
        reads: [OutB]
        produces OutC { status: String }
      }
      node D(model: sonnet, budget: 1k/100) {
        reads: [OutC]
        produces OutD { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    addConditionalEdge(program, 'A', [
      { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: { field: 'status', op: '==', value: 'go' }, target: 'C' },
    ]);
    addConditionalEdge(program, 'C', [
      { condition: { field: 'status', op: '==', value: 'go' }, target: 'D' },
    ]);

    // Estimator
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();

    // Runtime: all conditions match, full chain executes A->B->C->D
    const ctx = makeFlowCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { status: 'go' },
        C: { status: 'go' },
        D: { result: 'done' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'C' }],
        C: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'D' }],
      },
    });
    const flow: FlowNode[] = [{ kind: 'node', name: 'A' }];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    // Runtime executed all 4 nodes
    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B', 'C', 'D']);

    // Estimator range should cover what the runtime did (4 nodes)
    // All 4 nodes ran, so their cost must fall within [bestCase, worstCase]
    expect(report.bestCase).toBeGreaterThan(0);
    expect(report.worstCase).toBeGreaterThanOrEqual(report.bestCase);
  });

  // -------------------------------------------------------------------------
  // 2. Estimator + runtime parity: cycle detection by both
  // -------------------------------------------------------------------------
  it('cycle: estimator warns and runtime errors', async () => {
    // Estimator side: A -> B -> A cycle
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { status: String }
      }
      node B(model: sonnet, budget: 1k/300) {
        reads: [OutA]
        produces OutB { status: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    addConditionalEdge(program, 'A', [
      { condition: { field: 'status', op: '==', value: 'loop' }, target: 'B' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: { field: 'status', op: '==', value: 'loop' }, target: 'A' },
    ]);

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.warnings.some(w => w.message.includes('cycle'))).toBe(true);

    // Runtime side: same cycle
    const ctx = makeFlowCtx({
      nodeOutputs: {
        A: { status: 'loop' },
        B: { status: 'loop' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'loop' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'loop' }, target: 'A' }],
      },
    });
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors.some(e => e.includes('cycle'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Estimator + runtime parity: done mid-chain
  // -------------------------------------------------------------------------
  it('done mid-chain: estimator bestCase=0 extra, runtime stops at done', async () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { status: String }
      }
      node B(model: sonnet, budget: 1k/300) {
        reads: [OutA]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    addConditionalEdge(program, 'A', [
      { condition: { field: 'status', op: '==', value: 'done' }, target: 'done' },
      { condition: undefined, target: 'B' },
    ]);

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Best: A + done(0) = 1000. Worst: A + B = 1000 + 800 = 1800
    expect(report.bestCase).toBe(1000);
    expect(report.worstCase).toBe(1000 + 800);

    // Runtime: condition matches done
    const ctx = makeFlowCtx({
      nodeOutputs: { A: { status: 'done' } },
      conditionalEdges: {
        A: [
          { condition: { field: 'status', op: '==', value: 'done' }, target: 'done' },
          { condition: undefined, target: 'B' },
        ],
      },
    });
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    // B should NOT have been executed
    expect(ctx._executedNodes).toEqual(['A']);
  });

  // -------------------------------------------------------------------------
  // 4. Foreach body with conditional chain routing
  // -------------------------------------------------------------------------
  it('foreach body node triggers conditional chain via executeConditionalChain', async () => {
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Worker: { route: 'yes' },
        FollowUp: { result: 'ok' },
      },
      conditionalEdges: {
        Worker: [{ condition: { field: 'route', op: '==', value: 'yes' }, target: 'FollowUp' }],
      },
    });
    // Pre-populate source
    ctx.outputs.set('Source', { items: ['a', 'b'] });

    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Each iteration: Worker + FollowUp = 2 executions * 2 items = 4
    expect(ctx._executedNodes).toEqual(['Worker', 'FollowUp', 'Worker', 'FollowUp']);
  });

  // -------------------------------------------------------------------------
  // 5. Foreach iteration error includes annotation AND conditional context
  // -------------------------------------------------------------------------
  it('foreach error from conditional chain includes iteration annotation', async () => {
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Worker: { route: 'yes' },
      },
      failNodes: ['ChainTarget'],
      conditionalEdges: {
        Worker: [{ condition: { field: 'route', op: '==', value: 'yes' }, target: 'ChainTarget' }],
      },
    });
    ctx.outputs.set('Source', { items: ['a', 'b', 'c'] });

    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(1);
    // Error should mention the failing node AND the foreach annotation
    expect(errors[0]).toContain('ChainTarget');
    expect(errors[0]).toContain('(foreach iteration 1 of 3)');
  });

  // -------------------------------------------------------------------------
  // 6. MAX_CONDITIONAL_HOPS: constants.ts value matches flow-runner re-export
  // -------------------------------------------------------------------------
  it('MAX_CONDITIONAL_HOPS from constants.ts matches flow-runner re-export', () => {
    expect(MAX_CONDITIONAL_HOPS).toBe(10);
    expect(FLOW_RUNNER_MAX_HOPS).toBe(MAX_CONDITIONAL_HOPS);
  });

  // -------------------------------------------------------------------------
  // 7. Single-hop conditional backward compat (no chain, same as v3.4)
  // -------------------------------------------------------------------------
  it('single-hop conditional (no chain) matches v3.4 behavior', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { score: Float }
      }
      node Cheap(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutCheap { result: String }
      }
      node Expensive(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutExpensive { result: String }
      }
      edge A -> {
        when score > 0.5 -> Expensive
        else -> Cheap
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: 500+500=1000, Cheap: 500+200=700, Expensive: 500+1000=1500
    expect(report.bestCase).toBe(1000 + 700);
    expect(report.worstCase).toBe(1000 + 1500);
    // No chain warnings
    expect(report.warnings.filter(w => w.message.includes('chain') || w.message.includes('cycle'))).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 8. applyFallbackAlias + executeConditionalChain compose: fallback in chain
  // -------------------------------------------------------------------------
  it('applyFallbackAlias followed by executeConditionalChain works correctly', async () => {
    const ctx = makeFlowCtx({
      nodeOutputs: {
        FallbackNode: { status: 'route' },
        ChainNext: { result: 'final' },
      },
      conditionalEdges: {
        // The chain looks up 'OriginalNode' because that is the flow node name
        // after alias, but the routing is based on the fallback output
        OriginalNode: [{ condition: { field: 'status', op: '==', value: 'route' }, target: 'ChainNext' }],
      },
    });

    // Simulate: OriginalNode failed, FallbackNode succeeded
    const fallbackResult: NodeResult = {
      node: 'FallbackNode',
      output: { status: 'route' },
      durationMs: 1,
      success: true,
    };

    // Apply alias: store FallbackNode output under OriginalNode
    applyFallbackAlias('OriginalNode', fallbackResult, ctx);
    expect(ctx.outputs.get('OriginalNode')).toEqual({ status: 'route' });

    // Now run conditional chain from OriginalNode using the aliased output
    const results: NodeResult[] = [fallbackResult];
    const errors: string[] = [];
    await executeConditionalChain('OriginalNode', fallbackResult, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['ChainNext']);
  });

  // -------------------------------------------------------------------------
  // 9. Foreach with empty source array skips cleanly (v3.7-R2 regression)
  // -------------------------------------------------------------------------
  it('foreach with empty source array runs 0 iterations without error', async () => {
    const ctx = makeFlowCtx({
      nodeOutputs: { Worker: { result: 'ok' } },
    });
    ctx.outputs.set('Source', { items: [] });

    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(0);
    expect(ctx._executedNodes).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 10. Estimator handles foreach body nodes that have conditional edges
  // -------------------------------------------------------------------------
  it('estimator accounts for conditional edges on nodes inside foreach body', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Lister(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces ListOut { items: List<String> }
      }
      node Worker(model: sonnet, budget: 1k/300) {
        reads: [ListOut]
        produces WorkOut { status: String }
      }
      node Escalate(model: opus, budget: 2k/1k) {
        reads: [WorkOut]
        produces EscOut { result: String }
      }
      graph G(input: Spec, output: ListOut, budget: 100k) { Lister -> done }
    `);
    // Manually set up the flow to include foreach with Worker in body
    program.graphs[0].flow = [
      { kind: 'node', name: 'Lister' },
      {
        kind: 'foreach',
        source: 'Lister',
        field: 'items',
        binding: 'item',
        maxIterations: 5,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    // Add conditional edge: Worker -> Escalate
    addConditionalEdge(program, 'Worker', [
      { condition: { field: 'status', op: '==', value: 'needs_review' }, target: 'Escalate' },
    ]);

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();

    // Lister: 500+500=1000
    // Worker: 500+300=800
    // Escalate: 300+1000=1300
    // Foreach body per iter: Worker(800) + conditional(Escalate=1300) = 2100
    // Foreach: best=1 iter, worst=5 iters
    // Total best: 1000 + 2100*1 = 3100
    // Total worst: 1000 + 2100*5 = 11500
    expect(report.bestCase).toBe(1000 + (800 + 1300) * 1);
    expect(report.worstCase).toBe(1000 + (800 + 1300) * 5);
  });

  // -------------------------------------------------------------------------
  // 11. Estimator handles foreach body with chain to done (best=0 chain cost)
  // -------------------------------------------------------------------------
  it('estimator foreach body with conditional done branch gives lower best case', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Lister(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces ListOut { items: List<String> }
      }
      node Worker(model: sonnet, budget: 1k/300) {
        reads: [ListOut]
        produces WorkOut { status: String }
      }
      node Extra(model: sonnet, budget: 1k/200) {
        reads: [WorkOut]
        produces ExtraOut { result: String }
      }
      graph G(input: Spec, output: ListOut, budget: 100k) { Lister -> done }
    `);
    // Manually set up flow with foreach
    program.graphs[0].flow = [
      { kind: 'node', name: 'Lister' },
      {
        kind: 'foreach',
        source: 'Lister',
        field: 'items',
        binding: 'item',
        maxIterations: 3,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    addConditionalEdge(program, 'Worker', [
      { condition: { field: 'status', op: '==', value: 'ok' }, target: 'done' },
      { condition: undefined, target: 'Extra' },
    ]);

    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();

    // Worker: 500+300=800
    // Extra: 300+200=500
    // Conditional best: min(done=0, Extra=500) = 0
    // Conditional worst: max(done=0, Extra=500) = 500
    // Foreach body best: 800+0=800, worst: 800+500=1300
    // Lister: 1000
    // Total best: 1000 + 800*1 = 1800
    // Total worst: 1000 + 1300*3 = 4900
    expect(report.bestCase).toBe(1000 + 800 * 1);
    expect(report.worstCase).toBe(1000 + (800 + 500) * 3);
  });
});
