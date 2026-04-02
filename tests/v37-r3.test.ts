import { describe, it, expect } from 'vitest';
import { executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, ConditionalBranch, Condition, Program } from '../src/parser/ast.js';
import { ScopeChecker } from '../src/analyzer/scope.js';

/**
 * Create a FlowContext mock for multi-hop conditional edge tests.
 */
function makeCtx(opts: {
  nodeOutputs: Record<string, Record<string, unknown>>;
  conditionalEdges: Record<string, ConditionalBranch[]>;
  failNodes?: string[];
  failureStrategies?: Record<string, any>;
}): FlowContext & { _executedNodes: string[] } {
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
      const output = opts.nodeOutputs[name] ?? {};
      outputs.set(name, output);
      return { node: name, output, durationMs: 1, success: true };
    },
    getConditionalEdge: (sourceName: string) => {
      return opts.conditionalEdges[sourceName] ?? null;
    },
    getFailureStrategy: (name: string) => {
      return opts.failureStrategies?.[name] ?? undefined;
    },
    get _executedNodes() { return executedNodes; },
  } as FlowContext & { _executedNodes: string[] };
}

describe('v3.7-R3: multi-hop conditional edge routing', () => {
  // 1. 2-hop chain: A -> B (conditional) -> C (conditional). All execute.
  it('2-hop chain: A -> B -> C via conditional edges', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { status: 'continue' },
        C: { result: 'done' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'continue' }, target: 'C' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B', 'C']);
  });

  // 2. 3-hop chain: A -> B -> C -> D. All execute.
  it('3-hop chain: A -> B -> C -> D via conditional edges', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { next: 'yes' },
        B: { next: 'yes' },
        C: { next: 'yes' },
        D: { result: 'final' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'next', op: '==', value: 'yes' }, target: 'B' }],
        B: [{ condition: { field: 'next', op: '==', value: 'yes' }, target: 'C' }],
        C: [{ condition: { field: 'next', op: '==', value: 'yes' }, target: 'D' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B', 'C', 'D']);
  });

  // 3. Chain stops when no conditional edge on target node
  it('chain stops when target has no conditional edge', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { result: 'end' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        // B has no conditional edge
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B']);
  });

  // 4. done target stops chain silently
  it('done target stops chain silently', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'finished' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'finished' }, target: 'done' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A']);
  });

  // 5. Cycle detection: A -> B -> A produces error with cycle path
  it('cycle detection: A -> B -> A produces error with cycle path', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { route: 'go' },
        B: { route: 'go' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'route', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'route', op: '==', value: 'go' }, target: 'A' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('cycle');
    expect(errors[0]).toContain('A');
    expect(errors[0]).toContain('B');
  });

  // 6. Mid-chain failure stops chain
  it('mid-chain failure stops chain: A -> B(fail) -> C never runs', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: {},
        C: { result: 'ok' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'C' }],
      },
      failNodes: ['B'],
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('B failed');
    expect(ctx._executedNodes).toEqual(['A', 'B']);
    expect(ctx._executedNodes).not.toContain('C');
  });

  // 7. Fallback alias in chain: A -> B (conditional), B has fallback D
  it('fallback alias in chain: fallback node output aliased under target name', async () => {
    const outputs = new Map<string, unknown>();
    const executedNodes: string[] = [];

    const ctx: FlowContext & { _executedNodes: string[] } = {
      outputs,
      input: {},
      executeNode: async (name: string): Promise<NodeResult> => {
        executedNodes.push(name);
        if (name === 'B') {
          return { node: name, output: null, durationMs: 1, success: false, error: 'B failed' };
        }
        if (name === 'D') {
          const out = { status: 'from_fallback' };
          outputs.set('D', out);
          return { node: 'D', output: out, durationMs: 1, success: true };
        }
        const out = { status: 'go' };
        outputs.set(name, out);
        return { node: name, output: out, durationMs: 1, success: true };
      },
      getConditionalEdge: (sourceName: string) => {
        if (sourceName === 'A') {
          return [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }];
        }
        return null;
      },
      getFailureStrategy: (name: string) => {
        if (name === 'B') return { type: 'fallback' as const, node: 'D' };
        return undefined;
      },
      get _executedNodes() { return executedNodes; },
    } as FlowContext & { _executedNodes: string[] };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(executedNodes).toContain('D');
    // B's output should be aliased to D's output
    expect(ctx.outputs.get('B')).toEqual({ status: 'from_fallback' });
  });

  // 8. No condition match, no else: only source node runs
  it('no condition match, no else: chain does not start', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'nope' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A']);
  });

  // 9. Else branch in chain: A -> B (via else), B -> C (via condition)
  it('else branch in chain: A -> B (else) -> C (condition)', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'unknown' },
        B: { status: 'continue' },
        C: { result: 'final' },
      },
      conditionalEdges: {
        A: [
          { condition: { field: 'status', op: '==', value: 'go' }, target: 'X' },
          { target: 'B' }, // else branch
        ],
        B: [{ condition: { field: 'status', op: '==', value: 'continue' }, target: 'C' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B', 'C']);
  });

  // 10. Errors from prior nodes prevent chain from continuing
  it('pre-existing errors prevent conditional chain from starting', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { result: 'ok' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = ['previous error'];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    // A should not even run because errors already exist
    expect(ctx._executedNodes).toEqual([]);
  });

  // 11. Depth limit: chain exceeding MAX_CONDITIONAL_HOPS (10) produces error
  it('depth limit: chain exceeding MAX_CONDITIONAL_HOPS produces error', async () => {
    // Build 12 distinct nodes: N0 -> N1 -> ... -> N11, all chained via conditional edges.
    // MAX_CONDITIONAL_HOPS is 10, so starting from N0 the loop can do 10 hops (N1..N10).
    // N10 routes to N11, but that would be hop index 10 (11th hop), exceeding the limit.
    const nodeNames = Array.from({ length: 12 }, (_, i) => `N${i}`);
    const nodeOutputs: Record<string, Record<string, unknown>> = {};
    const conditionalEdges: Record<string, ConditionalBranch[]> = {};

    for (const name of nodeNames) {
      nodeOutputs[name] = { go: 'yes' };
    }
    // Chain: N0 -> N1 -> N2 -> ... -> N11
    for (let i = 0; i < nodeNames.length - 1; i++) {
      conditionalEdges[nodeNames[i]] = [
        { condition: { field: 'go', op: '==', value: 'yes' }, target: nodeNames[i + 1] },
      ];
    }

    const ctx = makeCtx({ nodeOutputs, conditionalEdges });
    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'N0' }], results, errors, ctx);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('exceeded');
  });
});

describe('v3.7-R3: ScopeChecker done target validation', () => {
  // Regression test: 'done' as a conditional branch target must NOT produce SCOPE_UNDEFINED_REF
  it('done as conditional branch target does not produce SCOPE_UNDEFINED_REF', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Spec', maxTokens: 500, fields: [{ name: 'name', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'A', model: 'sonnet', budgetIn: 2000, budgetOut: 1000,
          reads: [{ context: 'Spec', location: loc }], tools: [], writes: [],
          produces: { name: 'Out', fields: [{ name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
      ],
      edges: [{
        source: 'A',
        target: {
          kind: 'conditional',
          branches: [
            { condition: { field: 'status', op: '==', value: 'finished' }, target: 'done' },
          ],
        },
        transforms: [],
        location: loc,
      }],
      graphs: [{ name: 'G', input: 'Spec', output: 'Out', budget: 10000, flow: [{ kind: 'node', name: 'A' }], location: loc }],
    };

    const checker = new ScopeChecker(program);
    const diagnostics = checker.check();
    const scopeError = diagnostics.find(d => d.code === 'SCOPE_UNDEFINED_REF' && d.message.includes('done'));
    expect(scopeError).toBeUndefined();
  });
});
