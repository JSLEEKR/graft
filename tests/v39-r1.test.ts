import { describe, it, expect } from 'vitest';
import { executeFlowNodes, executeConditionalChain, FlowContext, ConditionalEdgeInfo } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { ConditionalBranch, Transform } from '../src/parser/ast.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import type { FlowNode, Program } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

/**
 * Create a FlowContext mock for conditional edge transform tests.
 */
function makeCtx(opts: {
  nodeOutputs?: Record<string, Record<string, unknown>>;
  conditionalEdges?: Record<string, ConditionalEdgeInfo>;
  failNodes?: string[];
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
    getFailureStrategy: () => undefined,
    get _executedNodes() { return executedNodes; },
  } as FlowContext & { _executedNodes: string[] };
}

describe('v3.9-R1: edge transforms on conditional edges', () => {
  // 1. Select transform on single-hop conditional edge - output filtered
  it('select transform on single-hop conditional edge filters output', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', findings: ['a', 'b'], extra: 'noise' },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [{ type: 'select', fields: ['findings'] }],
        },
      },
    });

    // Simulate A already executed
    ctx.outputs.set('A', { status: 'go', findings: ['a', 'b'], extra: 'noise' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', findings: ['a', 'b'], extra: 'noise' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('B');
    // After transforms, A's output in ctx.outputs should be filtered
    expect(ctx.outputs.get('A')).toEqual({ findings: ['a', 'b'] });
  });

  // 2. Transform on else branch - transforms apply when else is selected
  it('transforms apply when else branch is selected', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'unknown', data: 'important', junk: 'remove' },
        Fallback: { result: 'handled' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'Next' },
            { target: 'Fallback' }, // else branch
          ],
          transforms: [{ type: 'select', fields: ['data'] }],
        },
      },
    });

    ctx.outputs.set('A', { status: 'unknown', data: 'important', junk: 'remove' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'unknown', data: 'important', junk: 'remove' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('Fallback');
    // Transforms applied even on else branch
    expect(ctx.outputs.get('A')).toEqual({ data: 'important' });
  });

  // 3. No transform when target is 'done'
  it('no transform when target is done', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'finished', data: 'keep', extra: 'also-keep' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'finished' }, target: 'done' },
          ],
          transforms: [{ type: 'select', fields: ['data'] }],
        },
      },
    });

    ctx.outputs.set('A', { status: 'finished', data: 'keep', extra: 'also-keep' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'finished', data: 'keep', extra: 'also-keep' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    // Transforms NOT applied because target was 'done' (break before transform)
    expect(ctx.outputs.get('A')).toEqual({ status: 'finished', data: 'keep', extra: 'also-keep' });
  });

  // 4. Multi-hop chain with transforms at each hop
  it('multi-hop chain with transforms at each hop applies independently', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', findings: ['a'], extra: 'x' },
        B: { status: 'continue', result: 'partial', debug: 'info' },
        C: { final: 'done' },
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
          transforms: [{ type: 'select', fields: ['result'] }],
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', findings: ['a'], extra: 'x' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', findings: ['a'], extra: 'x' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['B', 'C']);
    // A's output transformed by A's edge transforms
    expect(ctx.outputs.get('A')).toEqual({ findings: ['a'] });
    // B's output transformed by B's edge transforms
    expect(ctx.outputs.get('B')).toEqual({ result: 'partial' });
  });

  // 5. Empty transforms array - backward compat, no-op
  it('empty transforms array is backward compatible no-op', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', data: 'all' },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [],
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', data: 'all' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', data: 'all' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('B');
    // Output unchanged
    expect(ctx.outputs.get('A')).toEqual({ status: 'go', data: 'all' });
  });

  // 6. Compact transform on conditional edge
  it('compact transform on conditional edge removes empty fields', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', data: 'value', empty: '', nullish: null },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [{ type: 'compact' }],
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', data: 'value', empty: '', nullish: null });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', data: 'value', empty: '', nullish: null },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('B');
    // compact removes empty/null fields
    expect(ctx.outputs.get('A')).toEqual({ status: 'go', data: 'value' });
  });

  // 7. SCOPE_TRANSFORM_CONDITIONAL warning no longer emitted (scope checker regression)
  it('SCOPE_TRANSFORM_CONDITIONAL warning no longer emitted', () => {
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [{ name: 'Spec', maxTokens: 500, fields: [{ name: 'name', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc }],
      nodes: [
        { name: 'A', model: 'sonnet', budgetIn: 2000, budgetOut: 1000, reads: [{ context: 'Spec', location: loc }], tools: [], writes: [], produces: { name: 'Out', fields: [{ name: 'findings', type: { kind: 'list', element: { kind: 'primitive', name: 'String' } }, location: loc }], location: loc }, location: loc },
        { name: 'B', model: 'haiku', budgetIn: 1000, budgetOut: 500, reads: [{ context: 'Out', location: loc }], tools: [], writes: [], produces: { name: 'Final', fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc }, location: loc },
      ],
      edges: [{
        source: 'A',
        target: { kind: 'conditional', branches: [{ condition: { field: 'score', op: '>=', value: 0.5 }, target: 'B' }, { target: 'B' }] },
        transforms: [{ type: 'select', fields: ['findings'] }],
        location: loc,
      }],
      graphs: [{ name: 'G', input: 'Spec', output: 'Final', budget: 10000, flow: [{ kind: 'node', name: 'A' }, { kind: 'node', name: 'B' }], location: loc }],
    };
    const checker = new ScopeChecker(program);
    const diagnostics = checker.check();
    // Should NOT emit SCOPE_TRANSFORM_CONDITIONAL anymore
    const warning = diagnostics.find(d => d.code === 'SCOPE_TRANSFORM_CONDITIONAL');
    expect(warning).toBeUndefined();
  });

  // 8. Transform applied before cycle detection
  it('transforms are applied before cycle error fires', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: { status: 'go', findings: ['a', 'b'], extra: 'noise' },
        B: { status: 'loop', result: 'partial' },
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
            { condition: { field: 'status', op: '==', value: 'loop' }, target: 'A' },
          ],
          transforms: [],
        },
      },
    });

    ctx.outputs.set('A', { status: 'go', findings: ['a', 'b'], extra: 'noise' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', findings: ['a', 'b'], extra: 'noise' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    // Transforms on A->B edge applied BEFORE cycle detection
    expect(ctx.outputs.get('A')).toEqual({ findings: ['a', 'b'] });
    // Cycle error still fires
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('cycle');
  });

  // 9. Transform and fallback alias are independent operations
  it('transforms apply to source output and fallback alias applies to target output independently', async () => {
    const executedNodes: string[] = [];
    const outputs = new Map<string, unknown>();

    const ctx: FlowContext & { _executedNodes: string[] } = {
      outputs,
      input: {},
      executeNode: async (name: string): Promise<NodeResult> => {
        executedNodes.push(name);
        if (name === 'B') {
          // B fails, triggering fallback
          return { node: 'B', output: null, durationMs: 1, success: false, error: 'B failed' };
        }
        if (name === 'B_fallback') {
          const output = { fallbackResult: 'recovered' };
          outputs.set('B_fallback', output);
          return { node: 'B_fallback', output, durationMs: 1, success: true };
        }
        return { node: name, output: {}, durationMs: 1, success: true };
      },
      getConditionalEdge: (sourceName: string) => {
        if (sourceName === 'A') {
          return {
            branches: [
              { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
            ],
            transforms: [{ type: 'select', fields: ['data'] }],
          };
        }
        return null;
      },
      getFailureStrategy: (name: string) => {
        if (name === 'B') {
          return { type: 'fallback' as const, node: 'B_fallback' };
        }
        return undefined;
      },
      get _executedNodes() { return executedNodes; },
    } as FlowContext & { _executedNodes: string[] };

    ctx.outputs.set('A', { status: 'go', data: 'important', extra: 'noise' });
    const result: NodeResult = {
      node: 'A',
      output: { status: 'go', data: 'important', extra: 'noise' },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    // Transforms applied to SOURCE (A) output
    expect(ctx.outputs.get('A')).toEqual({ data: 'important' });
    // Fallback alias: B's slot gets the fallback node's output
    expect(ctx.outputs.get('B')).toEqual({ fallbackResult: 'recovered' });
    // Both B (failed) and B_fallback (succeeded) were executed
    expect(executedNodes).toContain('B');
    expect(executedNodes).toContain('B_fallback');
  });

  // 10. Filter transform on conditional edge
  it('filter transform on conditional edge filters array field', async () => {
    const ctx = makeCtx({
      nodeOutputs: {
        A: {
          status: 'go',
          items: [
            { name: 'a', priority: 1 },
            { name: 'b', priority: 5 },
            { name: 'c', priority: 3 },
          ],
        },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: {
          branches: [
            { condition: { field: 'status', op: '==', value: 'go' }, target: 'B' },
          ],
          transforms: [{ type: 'filter', field: 'items', condition: { field: 'priority', op: '>=', value: 3 } }],
        },
      },
    });

    ctx.outputs.set('A', {
      status: 'go',
      items: [
        { name: 'a', priority: 1 },
        { name: 'b', priority: 5 },
        { name: 'c', priority: 3 },
      ],
    });
    const result: NodeResult = {
      node: 'A',
      output: {
        status: 'go',
        items: [
          { name: 'a', priority: 1 },
          { name: 'b', priority: 5 },
          { name: 'c', priority: 3 },
        ],
      },
      durationMs: 1,
      success: true,
    };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeConditionalChain('A', result, ctx, results, errors);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('B');
    // Filter applied: only items with priority >= 3
    const transformed = ctx.outputs.get('A') as Record<string, unknown>;
    expect(transformed.status).toBe('go');
    expect(transformed.items).toEqual([
      { name: 'b', priority: 5 },
      { name: 'c', priority: 3 },
    ]);
  });
});
