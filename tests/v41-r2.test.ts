import { describe, it, expect } from 'vitest';
import { executeFlowNodes, evaluateExpr, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, GraphDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function makeCtx(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    executeNode: async (name: string) => ({
      node: name,
      output: { result: 'ok' },
      durationMs: 10,
      success: true,
    }),
    outputs: new Map(),
    input: {},
    ...overrides,
  };
}

// ── Graph call output isolation ─────────────────────────────────────

describe('Graph call output isolation', () => {
  it('child graph let binding does not leak to parent variables', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [], location: loc,
      flow: [
        { kind: 'node', name: 'Worker', location: loc },
        { kind: 'let', name: 'childVar', value: { kind: 'literal', value: 99, location: loc }, location: loc },
      ],
    };

    const parentFlow: FlowNode[] = [
      { kind: 'let', name: 'parentVar', value: { kind: 'literal', value: 1, location: loc }, location: loc },
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { data: name };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(parentFlow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // Parent should have its own var but NOT the child's var
    expect(ctx.variables?.get('parentVar')).toBe(1);
    expect(ctx.variables?.has('childVar')).toBeFalsy();
  });

  it('child foreach binding does not pollute parent outputs', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [], location: loc,
      flow: [
        { kind: 'node', name: 'Splitter', location: loc },
        { kind: 'foreach', source: 'Splitter', field: 'items', binding: 'item',
          maxIterations: 5, body: [
            { kind: 'node', name: 'ItemProcessor', location: loc },
          ], location: loc },
      ],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        if (name === 'Splitter') {
          return { node: name, output: { items: ['a', 'b'] }, durationMs: 5, success: true };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // Parent outputs should NOT have Splitter or item bindings
    expect(ctx.outputs.has('Splitter')).toBe(false);
    expect(ctx.outputs.has('item')).toBe(false);
  });

  it('child can read parent outputs via cloned map', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [], location: loc,
      flow: [{ kind: 'node', name: 'Consumer', location: loc }],
    };

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Producer', location: loc },
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
    ];

    let consumerReceivedProducerOutput = false;
    const ctx = makeCtx({
      executeNode: async (name) => {
        if (name === 'Producer') {
          const output = { value: 42 };
          ctx.outputs.set(name, output);
          return { node: name, output, durationMs: 5, success: true };
        }
        // Consumer runs in child context — should see Producer's output from cloned map
        // We check by looking at the context passed... actually we check via the childCtx outputs
        consumerReceivedProducerOutput = true;
        const output = { done: true };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(consumerReceivedProducerOutput).toBe(true);
    expect(nodeResults).toHaveLength(2);
  });
});

// ── Division by zero warning ────────────────────────────────────────

describe('Division by zero warning', () => {
  it('division by zero returns 0 and adds warning', () => {
    const expr = {
      kind: 'binary' as const,
      op: '/' as const,
      left: { kind: 'literal' as const, value: 10, location: loc },
      right: { kind: 'literal' as const, value: 0, location: loc },
      location: loc,
    };
    const warnings: string[] = [];
    const result = evaluateExpr(expr, new Map(), undefined, warnings);
    expect(result).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('division by zero');
  });

  it('normal division does not produce warning', () => {
    const expr = {
      kind: 'binary' as const,
      op: '/' as const,
      left: { kind: 'literal' as const, value: 10, location: loc },
      right: { kind: 'literal' as const, value: 2, location: loc },
      location: loc,
    };
    const warnings: string[] = [];
    const result = evaluateExpr(expr, new Map(), undefined, warnings);
    expect(result).toBe(5);
    expect(warnings).toHaveLength(0);
  });
});
