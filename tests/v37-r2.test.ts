import { describe, it, expect } from 'vitest';
import { executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode } from '../src/parser/ast.js';

/**
 * Create a FlowContext mock. The executeNode mock stores successful outputs
 * in ctx.outputs under the node name, mimicking executor.ts storeOutput behavior.
 */
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
      // Mimic executor storeOutput: store under node name
      outputs.set(name, result.output);
      return result;
    },
    outputs,
    input: overrides.input ?? {},
    ...overrides,
  };
  return ctx;
}

/**
 * Create an executeNode mock that stores output in the given outputs Map
 * on success, simulating executor.ts storeOutput behavior.
 */
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

/** A flow: Source -> foreach(Source.field as binding) { bodyNode } */
function foreachFlow(
  sourceName: string,
  field: string,
  binding: string,
  bodyNodeName: string,
): FlowNode[] {
  return [
    { kind: 'node', name: sourceName },
    {
      kind: 'foreach',
      source: sourceName,
      field,
      binding,
      maxIterations: 100,
      body: [{ kind: 'node', name: bodyNodeName }],
    },
  ];
}

describe('v3.7-R2: foreach + failure strategy interaction', () => {
  // 1. Source fails with abort (default): foreach never runs, error propagated
  it('source fails with abort: foreach never runs, error propagated', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'plan failed' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('plan failed');
    // Worker should never be called
    expect(called).toEqual(['Planner']);
  });

  // 2. Source fails with skip: foreach body skipped, no error, pipeline continues
  it('source fails with skip: foreach body skipped silently', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'plan failed' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'skip' } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    // No error should be propagated
    expect(errors).toHaveLength(0);
    // Worker should never be called (foreach skipped)
    expect(called).toEqual(['Planner']);
  });

  // 3. Source fails with skip, nodes after foreach still run
  it('source fails with skip: nodes after foreach still run', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Planner' },
      {
        kind: 'foreach',
        source: 'Planner',
        field: 'tasks',
        binding: 'task',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
      { kind: 'node', name: 'Reporter' },
    ];

    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'plan failed' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'skip' } : undefined,
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    // Reporter should still run even though foreach was skipped
    expect(called).toContain('Reporter');
    expect(called).not.toContain('Worker');
  });

  // 4. Source fails with fallback, fallback succeeds: foreach uses fallback output (BUG FIX TEST)
  it('source fails with fallback, fallback succeeds: foreach uses fallback output', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'plan failed' };
        }
        if (name === 'BackupPlanner') {
          return {
            node: 'BackupPlanner',
            output: { tasks: ['a', 'b', 'c'] },
            durationMs: 10,
            success: true,
          };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'fallback', node: 'BackupPlanner' } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    // Foreach should have run with the fallback output (3 items)
    const workerCalls = called.filter(n => n === 'Worker');
    expect(workerCalls).toHaveLength(3);
    // The output should be aliased under 'Planner'
    expect(ctx.outputs.get('Planner')).toEqual({ tasks: ['a', 'b', 'c'] });
  });

  // 5. Source fails with fallback, fallback also fails: error propagated, foreach never runs
  it('source fails with fallback, fallback also fails: error propagated', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        return { node: name, output: null, durationMs: 10, success: false, error: `${name} failed` };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'fallback', node: 'BackupPlanner' } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('BackupPlanner');
    expect(called).not.toContain('Worker');
  });

  // 6. Source fails with retry, retry succeeds: foreach uses retried output
  it('source fails with retry, retry succeeds: foreach uses retried output', async () => {
    let plannerAttempts = 0;
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          plannerAttempts++;
          if (plannerAttempts < 3) {
            return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
          }
          return { node: name, output: { tasks: ['x', 'y'] }, durationMs: 10, success: true };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'retry', max: 3 } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    const workerCalls = called.filter(n => n === 'Worker');
    expect(workerCalls).toHaveLength(2);
  });

  // 7. Source fails with retry, all retries fail: error propagated, foreach never runs
  it('source fails with retry, all retries fail: error propagated', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) => name === 'Planner' ? { type: 'retry', max: 2 } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(called).not.toContain('Worker');
  });

  // 8. Source fails with retry_then_fallback, fallback succeeds: foreach uses fallback output
  it('source fails with retry_then_fallback, fallback succeeds: foreach uses fallback output', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        if (name === 'BackupPlanner') {
          return {
            node: 'BackupPlanner',
            output: { tasks: ['a', 'b'] },
            durationMs: 10,
            success: true,
          };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
      getFailureStrategy: (name) =>
        name === 'Planner' ? { type: 'retry_then_fallback', max: 2, node: 'BackupPlanner' } : undefined,
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    const workerCalls = called.filter(n => n === 'Worker');
    expect(workerCalls).toHaveLength(2);
    // The output should be aliased under 'Planner'
    expect(ctx.outputs.get('Planner')).toEqual({ tasks: ['a', 'b'] });
  });

  // 9. Source output field is not an array: error message includes field info
  it('source output field is not an array: error message includes field info', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx();
    ctx.outputs.set('Planner', { tasks: 'not-an-array' });
    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Planner',
        field: 'tasks',
        binding: 'task',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Planner');
    expect(errors[0]).toContain('tasks');
    expect(errors[0]).toContain('not an array');
  });

  // 10. Source output field is empty array: foreach runs 0 iterations, no error
  it('source output field is empty array: foreach runs 0 iterations, no error', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const called: string[] = [];
    const outputs = new Map<string, unknown>();
    const ctx = makeCtx({
      outputs,
      executeNode: storingExecuteNode(outputs, async (name) => {
        called.push(name);
        if (name === 'Planner') {
          return { node: name, output: { tasks: [] }, durationMs: 10, success: true };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      }),
    });
    await executeFlowNodes(foreachFlow('Planner', 'tasks', 'task', 'Worker'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(called).not.toContain('Worker');
  });
});
