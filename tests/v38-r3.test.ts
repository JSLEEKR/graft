import { describe, it, expect } from 'vitest';
import { executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode } from '../src/parser/ast.js';

function makeCtx(overrides: Partial<FlowContext> = {}): FlowContext {
  const outputs = overrides.outputs ?? new Map();
  const ctx: FlowContext = {
    executeNode: async (name: string) => {
      const result: NodeResult = {
        node: name,
        output: { result: 'ok' },
        durationMs: 10,
        success: true,
      };
      outputs.set(name, result.output);
      return result;
    },
    outputs,
    input: overrides.input ?? {},
    ...overrides,
  };
  return ctx;
}

function storingExecuteNode(
  outputs: Map<string, unknown>,
  handler: (name: string) => Promise<NodeResult>,
): (name: string) => Promise<NodeResult> {
  return async (name: string) => {
    const result = await handler(name);
    if (result.success && result.output) {
      outputs.set(result.node, result.output);
    }
    return result;
  };
}

describe('v3.8-R3: foreach iteration context in error messages', () => {
  // 1. Foreach body failure includes iteration index in error message
  it('error message includes iteration index (1-based)', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const outputs = new Map<string, unknown>();
    // Pre-populate source output with 3 items
    outputs.set('Source', { items: ['a', 'b', 'c'] });

    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        if (name === 'Worker') {
          // Fail on first iteration
          return { node: name, output: null, durationMs: 10, success: false, error: 'Worker crashed' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
    });

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

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('foreach iteration 1');
  });

  // 2. Foreach body failure includes total count in error message
  it('error message includes total count', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const outputs = new Map<string, unknown>();
    outputs.set('Source', { items: ['a', 'b', 'c'] });

    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        if (name === 'Worker') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'Worker crashed' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
    });

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

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    // 3 items total
    expect(errors[0]).toContain('of 3)');
  });

  // 3. Failure at different iteration positions (e.g., iteration 3 of 5)
  it('failure at iteration 3 of 5 shows correct position', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const outputs = new Map<string, unknown>();
    outputs.set('Source', { items: [1, 2, 3, 4, 5] });

    let callCount = 0;
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        if (name === 'Worker') {
          callCount++;
          if (callCount === 3) {
            return { node: name, output: null, durationMs: 10, success: false, error: 'Worker failed' };
          }
          return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
    });

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

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('(foreach iteration 3 of 5)');
  });

  // 4. Multiple errors in one iteration all get annotated
  it('multiple errors in one iteration all get annotated', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const outputs = new Map<string, unknown>();
    outputs.set('Source', { items: ['a', 'b'] });

    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        // Both nodes fail
        return { node: name, output: null, durationMs: 10, success: false, error: `${name} failed` };
      }),
    });

    // Body has two nodes — first fails, which adds error, but we need both to fail
    // Actually with abort-on-error, the second node won't run after the first fails.
    // Instead: use a body where the first node produces an error but doesn't abort,
    // or we directly push multiple errors.
    //
    // The simplest approach: the body node fails on iteration 1, producing one error.
    // Since errors.length > 0 breaks the loop after annotation, we only get 1 error.
    //
    // To test multiple errors in ONE iteration, we need parallel nodes in the body.
    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [
          {
            kind: 'parallel',
            branches: ['NodeA', 'NodeB'],
          },
        ],
      },
    ];

    await executeFlowNodes(flow, results, errors, ctx);
    // Both NodeA and NodeB should fail in parallel, producing 2 errors
    expect(errors.length).toBeGreaterThanOrEqual(2);
    for (const err of errors) {
      expect(err).toContain('(foreach iteration 1 of 2)');
    }
  });
});
