import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateExpr, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { applyTransforms } from '../src/runtime/transforms.js';
import { NodeResult } from '../src/runtime/executor.js';
import { Expr, FlowNode } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function mkMultiCond(segments: string[], op: '<' | '>' | '<=' | '>=' | '==' | '!=', value: string | number | boolean): Expr {
  return {
    kind: 'binary', op,
    left: { kind: 'field_access', segments, location: loc },
    right: { kind: 'literal', value, location: loc },
    location: loc,
  };
}

// ── evaluateCondition removed ──────────────────────────────────────

describe('v5.0-R2: evaluateCondition removed from flow-runner', () => {
  it('evaluateCondition is no longer exported', async () => {
    const mod = await import('../src/runtime/flow-runner.js');
    expect('evaluateCondition' in mod).toBe(false);
  });

  it('evaluateExpr handles condition-style binary expressions', () => {
    const cond = mkCond('score', '>=', 80);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 85 })))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 50 })))).toBe(false);
  });

  it('evaluateExpr with all 6 comparison operators', () => {
    const make = (op: '==' | '!=' | '>=' | '>' | '<=' | '<') => mkCond('x', op, 5);
    const m = (v: number) => new Map(Object.entries({ x: v }));

    expect(!!evaluateExpr(make('=='), m(5))).toBe(true);
    expect(!!evaluateExpr(make('=='), m(3))).toBe(false);
    expect(!!evaluateExpr(make('!='), m(3))).toBe(true);
    expect(!!evaluateExpr(make('!='), m(5))).toBe(false);
    expect(!!evaluateExpr(make('>='), m(5))).toBe(true);
    expect(!!evaluateExpr(make('>='), m(4))).toBe(false);
    expect(!!evaluateExpr(make('>'), m(6))).toBe(true);
    expect(!!evaluateExpr(make('>'), m(5))).toBe(false);
    expect(!!evaluateExpr(make('<='), m(5))).toBe(true);
    expect(!!evaluateExpr(make('<='), m(6))).toBe(false);
    expect(!!evaluateExpr(make('<'), m(4))).toBe(true);
    expect(!!evaluateExpr(make('<'), m(5))).toBe(false);
  });

  it('variable-first resolution preserved', () => {
    const cond = mkCond('score', '>=', 90);
    const vars = new Map<string, unknown>([['score', 95]]);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 10 })), vars)).toBe(true);
  });

  it('multi-segment field access in conditions preserved', () => {
    const cond = mkMultiCond(['result', 'score'], '>=', 80);
    const outputs = new Map<string, unknown>([['result', { score: 85 }]]);
    expect(!!evaluateExpr(cond, outputs)).toBe(true);
  });
});

// ── evalCondition removed ──────────────────────────────────────────

describe('v5.0-R2: evalCondition removed from transforms', () => {
  it('evalCondition is no longer exported', async () => {
    const mod = await import('../src/runtime/transforms.js');
    expect('evalCondition' in mod).toBe(false);
  });

  it('filter transform still works via evaluateExpr internally', () => {
    const data = {
      items: [
        { severity: 8, label: 'high' },
        { severity: 2, label: 'low' },
        { severity: 6, label: 'medium' },
      ],
    };
    const cond: Expr = mkCond('severity', '>=', 5);
    const result = applyTransforms(data, [{ type: 'filter', field: 'items', condition: cond }]);
    expect(result).toEqual({
      items: [
        { severity: 8, label: 'high' },
        { severity: 6, label: 'medium' },
      ],
    });
  });

  it('filter with string equality still works', () => {
    const data = {
      items: [
        { status: 'approved', id: 1 },
        { status: 'rejected', id: 2 },
        { status: 'approved', id: 3 },
      ],
    };
    const cond: Expr = mkCond('status', '==', 'approved');
    const result = applyTransforms(data, [{ type: 'filter', field: 'items', condition: cond }]) as Record<string, unknown>;
    expect((result.items as unknown[]).length).toBe(2);
  });
});

// ── Conditional edge routing still works ───────────────────────────

describe('v5.0-R2: Conditional routing via evaluateExpr', () => {
  it('conditional edge routes correctly at runtime', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Router', location: loc },
    ];

    const ctx: FlowContext = {
      executeNode: async (name) => {
        const output = name === 'Router' ? { score: 90 } : { text: 'done' };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      outputs: new Map(),
      input: {},
      getConditionalEdge: (source) => {
        if (source === 'Router') {
          return {
            branches: [
              { target: 'HighPath', condition: mkCond('score', '>=', 80) },
              { target: 'LowPath', condition: undefined },
            ],
            transforms: [],
          };
        }
        return null;
      },
    };

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(nodeResults.length).toBeGreaterThanOrEqual(2);
    expect(nodeResults[1].node).toBe('HighPath');
  });

  it('else branch taken when no condition matches', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Router', location: loc },
    ];

    const ctx: FlowContext = {
      executeNode: async (name) => {
        const output = name === 'Router' ? { score: 10 } : { text: 'fallback' };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      outputs: new Map(),
      input: {},
      getConditionalEdge: (source) => {
        if (source === 'Router') {
          return {
            branches: [
              { target: 'HighPath', condition: mkCond('score', '>=', 80) },
              { target: 'LowPath', condition: undefined },
            ],
            transforms: [],
          };
        }
        return null;
      },
    };

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(nodeResults[1].node).toBe('LowPath');
  });
});
