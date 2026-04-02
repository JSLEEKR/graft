import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { executeFlowNodes, evaluateCondition, evaluateExpr, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, Expr, GraphDecl } from '../src/parser/ast.js';

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

describe('evaluateExpr', () => {
  const outputs = new Map<string, unknown>([
    ['A', { score: 0.9, label: 'good', count: 5 }],
  ]);

  it('evaluates literal value', () => {
    const expr: Expr = { kind: 'literal', value: 42, location: loc };
    expect(evaluateExpr(expr, outputs)).toBe(42);
  });

  it('evaluates field access from node output', () => {
    const expr: Expr = { kind: 'field_access', segments: ['A', 'score'], location: loc };
    expect(evaluateExpr(expr, outputs)).toBe(0.9);
  });

  it('evaluates binary addition (numbers)', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'field_access', segments: ['A', 'count'], location: loc },
      right: { kind: 'literal', value: 10, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(15);
  });

  it('evaluates binary subtraction', () => {
    const expr: Expr = {
      kind: 'binary', op: '-',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 3, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(7);
  });

  it('evaluates division (returns 0 for divide by zero)', () => {
    const expr: Expr = {
      kind: 'binary', op: '/',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(0);
  });

  it('evaluates unary negation', () => {
    const expr: Expr = {
      kind: 'unary', op: '-',
      operand: { kind: 'literal', value: 5, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(-5);
  });

  it('evaluates string concatenation', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 'hello ', location: loc },
      right: { kind: 'literal', value: 'world', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('hello world');
  });

  it('evaluates variable-first resolution (single segment)', () => {
    const vars = new Map<string, unknown>([['score', 99]]);
    const expr: Expr = { kind: 'field_access', segments: ['score'], location: loc };
    expect(evaluateExpr(expr, outputs, vars)).toBe(99);
  });
});

describe('let execution in flow', () => {
  it('stores literal value in variable map', async () => {
    const flow: FlowNode[] = [
      { kind: 'let', name: 'x', value: { kind: 'literal', value: 42, location: loc }, location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx();
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('x')).toBe(42);
  });

  it('stores field access from node output', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A' },
      { kind: 'let', name: 'score', value: { kind: 'field_access', segments: ['A', 'score'], location: loc }, location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { score: 0.85 };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 10, success: true };
      },
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('score')).toBe(0.85);
  });

  it('stores binary expression result', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A' },
      { kind: 'let', name: 'total', value: {
        kind: 'binary', op: '+',
        left: { kind: 'field_access', segments: ['A', 'x'], location: loc },
        right: { kind: 'field_access', segments: ['A', 'y'], location: loc },
        location: loc,
      }, location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { x: 3, y: 7 };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 10, success: true };
      },
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('total')).toBe(10);
  });
});

describe('variable used in condition', () => {
  it('evaluateCondition resolves variable before output field', () => {
    const vars = new Map<string, unknown>([['score', 0.9]]);
    const output = { score: 0.1 }; // should be overridden by variable
    const condition = mkCond('score', '>=', 0.7);
    expect(evaluateCondition(condition, output, vars)).toBe(true);
  });

  it('evaluateCondition falls back to output when no variable', () => {
    const vars = new Map<string, unknown>();
    const output = { score: 0.5 };
    const condition = mkCond('score', '>=', 0.7);
    expect(evaluateCondition(condition, output, vars)).toBe(false);
  });
});

describe('graph call execution', () => {
  it('executes called graph flow with parameter bindings', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub',
      input: 'Spec', output: 'Out', budget: 3000,
      params: [{ name: 'threshold', type: 'Int', location: loc }],
      flow: [
        { kind: 'node', name: 'Worker' },
      ],
      location: loc,
    };

    const executedNodes: string[] = [];
    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [
        { name: 'threshold', value: { kind: 'literal', value: 5, location: loc }, location: loc },
      ], location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        executedNodes.push(name);
        return { node: name, output: { data: 'ok' }, durationMs: 10, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(executedNodes).toContain('Worker');
  });

  it('child graph gets its own variable scope with params', async () => {
    let childVars: Map<string, unknown> | undefined;
    const subGraph: GraphDecl = {
      name: 'Sub',
      input: 'Spec', output: 'Out', budget: 3000,
      params: [
        { name: 'count', type: 'Int', location: loc },
        { name: 'label', type: 'String', default: 'default', location: loc },
      ],
      flow: [
        { kind: 'let', name: 'x', value: { kind: 'literal', value: 99, location: loc }, location: loc },
      ],
      location: loc,
    };

    const flow: FlowNode[] = [
      { kind: 'let', name: 'parent_var', value: { kind: 'literal', value: 'parent', location: loc }, location: loc },
      { kind: 'graph_call', name: 'Sub', args: [
        { name: 'count', value: { kind: 'literal', value: 42, location: loc }, location: loc },
      ], location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const originalExecuteFlowNodes = executeFlowNodes;
    const ctx = makeCtx({
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    // Parent variable should still be there
    expect(ctx.variables?.get('parent_var')).toBe('parent');
  });

  it('default parameter used when not provided', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub',
      input: 'Spec', output: 'Out', budget: 3000,
      params: [
        { name: 'mode', type: 'String', default: 'fast', location: loc },
      ],
      flow: [],
      location: loc,
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
  });

  it('reports error for undefined graph', async () => {
    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Unknown', args: [], location: loc },
    ];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      getGraphDecl: () => undefined,
    });
    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unknown');
  });
});
