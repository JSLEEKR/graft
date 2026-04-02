import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { executeFlowNodes, FlowContext, evaluateCondition, evaluateExpr } from '../src/runtime/flow-runner.js';
import { evalCondition } from '../src/runtime/transforms.js';
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

// ── Graph call return values ─────────────────────────────────────

describe('Graph call return values', () => {
  it('graph call stores last node output in parent outputs', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [],
      location: loc,
      flow: [
        { kind: 'node', name: 'Worker', location: loc },
      ],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
      { kind: 'node', name: 'Consumer', location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = name === 'Worker' ? { data: 'from_worker' } : { result: name };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // The graph call should have stored Worker's output under 'Sub' in parent outputs
    expect(ctx.outputs.get('Sub')).toEqual({ data: 'from_worker' });
  });

  it('graph call output accessible in let binding', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [],
      location: loc,
      flow: [
        { kind: 'node', name: 'Worker', location: loc },
      ],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
      { kind: 'let', name: 'val', value: {
        kind: 'field_access', segments: ['Sub', 'data'], location: loc,
      }, location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { data: 'result_value' };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('val')).toBe('result_value');
  });
});

// ── Equality semantics unification ───────────────────────────────

describe('Equality semantics unification', () => {
  it('evalCondition uses loose equality for == (string "200" == number 200)', () => {
    const cond = mkCond('status', '==', 200);
    // With loose equality, string "200" should == number 200
    expect(evalCondition({ status: '200' }, cond)).toBe(true);
  });

  it('evalCondition uses loose equality for != (different types)', () => {
    const cond = mkCond('status', '!=', 200);
    // "200" loosely equals 200, so != should be false
    expect(evalCondition({ status: '200' }, cond)).toBe(false);
  });

  it('evalCondition strict cases still work', () => {
    const cond = mkCond('level', '==', 'high');
    expect(evalCondition({ level: 'high' }, cond)).toBe(true);
    expect(evalCondition({ level: 'low' }, cond)).toBe(false);
  });

  it('evaluateCondition and evalCondition agree on loose equality', () => {
    const cond = mkCond('score', '==', 100);
    // Both should treat string "100" == number 100 the same way
    const routingResult = evaluateCondition(cond, { score: '100' });
    const transformResult = evalCondition({ score: '100' }, cond);
    expect(routingResult).toBe(transformResult);
  });
});

// ── Exhaustive switches ──────────────────────────────────────────

describe('Exhaustive switch coverage', () => {
  it('evaluateExpr handles call kind without error', () => {
    const outputs = new Map<string, unknown>();
    const result = evaluateExpr(
      { kind: 'call', name: 'str', args: [{ kind: 'literal', value: 42, location: loc }], location: loc },
      outputs,
    );
    expect(result).toBe('42');
  });
});
