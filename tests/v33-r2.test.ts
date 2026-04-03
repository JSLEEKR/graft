import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateCondition } from '../src/runtime/flow-runner.js';
import { ConditionalBranch, Expr } from '../src/parser/ast.js';
import { FlowContext, executeFlowNodes } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';

describe('evaluateCondition', () => {
  it('== match', () => {
    const cond: Expr = mkCond('status', '==', 'done');
    expect(evaluateCondition(cond, { status: 'done' })).toBe(true);
  });

  it('== no match', () => {
    const cond: Expr = mkCond('status', '==', 'done');
    expect(evaluateCondition(cond, { status: 'pending' })).toBe(false);
  });

  it('!= match', () => {
    const cond: Expr = mkCond('status', '!=', 'done');
    expect(evaluateCondition(cond, { status: 'pending' })).toBe(true);
  });

  it('>= numeric', () => {
    const cond: Expr = mkCond('score', '>=', 70);
    expect(evaluateCondition(cond, { score: 80 })).toBe(true);
  });

  it('> numeric (boundary false)', () => {
    const cond: Expr = mkCond('score', '>', 70);
    expect(evaluateCondition(cond, { score: 70 })).toBe(false);
  });

  it('<= numeric', () => {
    const cond: Expr = mkCond('score', '<=', 50);
    expect(evaluateCondition(cond, { score: 50 })).toBe(true);
  });

  it('< numeric (boundary false)', () => {
    const cond: Expr = mkCond('score', '<', 50);
    expect(evaluateCondition(cond, { score: 50 })).toBe(false);
  });

  it('missing field with == returns false', () => {
    const cond: Expr = mkCond('status', '==', 'x');
    expect(evaluateCondition(cond, {})).toBe(false);
  });

  it('missing field with != returns true', () => {
    const cond: Expr = mkCond('status', '!=', 'x');
    expect(evaluateCondition(cond, {})).toBe(true);
  });

  it('boolean value', () => {
    const cond: Expr = mkCond('flag', '==', true);
    expect(evaluateCondition(cond, { flag: true })).toBe(true);
  });
});

describe('conditional edge routing', () => {
  function makeCtx(opts: {
    nodeOutputs: Record<string, Record<string, unknown>>;
    conditionalEdges: Record<string, ConditionalBranch[]>;
  }): FlowContext {
    const outputs = new Map<string, unknown>();
    const executedNodes: string[] = [];

    return {
      outputs,
      input: {},
      executeNode: async (name: string): Promise<NodeResult> => {
        executedNodes.push(name);
        const output = opts.nodeOutputs[name] ?? {};
        outputs.set(name, output);
        return { node: name, output, durationMs: 1, success: true };
      },
      getConditionalEdge: (sourceName: string) => {
        const branches = opts.conditionalEdges[sourceName];
        return branches ? { branches, transforms: [] } : null;
      },
      // expose executedNodes for assertions
      get _executedNodes() { return executedNodes; },
    } as FlowContext & { _executedNodes: string[] };
  }

  it('first matching branch wins', async () => {
    const branches: ExpralBranch[] = [
      { condition: mkCond('severity', '>=', 5), target: 'DetailedReview' },
      { condition: mkCond('severity', '>=', 3), target: 'QuickCheck' },
      { target: 'Skip' },
    ];

    const ctx = makeCtx({
      nodeOutputs: { Analyzer: { severity: 7 }, DetailedReview: { result: 'ok' } },
      conditionalEdges: { Analyzer: branches },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(
      [{ kind: 'node', name: 'Analyzer' }],
      nodeResults, errors, ctx,
    );

    expect(errors).toHaveLength(0);
    const executed = (ctx as any)._executedNodes;
    expect(executed).toEqual(['Analyzer', 'DetailedReview']);
  });

  it('else branch when no condition matches', async () => {
    const branches: ExpralBranch[] = [
      { condition: mkCond('severity', '>=', 10), target: 'DetailedReview' },
      { target: 'Skip' },
    ];

    const ctx = makeCtx({
      nodeOutputs: { Analyzer: { severity: 2 }, Skip: { done: true } },
      conditionalEdges: { Analyzer: branches },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(
      [{ kind: 'node', name: 'Analyzer' }],
      nodeResults, errors, ctx,
    );

    expect(errors).toHaveLength(0);
    const executed = (ctx as any)._executedNodes;
    expect(executed).toEqual(['Analyzer', 'Skip']);
  });

  it('no match and no else: skip silently', async () => {
    const branches: ExpralBranch[] = [
      { condition: mkCond('severity', '>=', 10), target: 'DetailedReview' },
    ];

    const ctx = makeCtx({
      nodeOutputs: { Analyzer: { severity: 2 } },
      conditionalEdges: { Analyzer: branches },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(
      [{ kind: 'node', name: 'Analyzer' }],
      nodeResults, errors, ctx,
    );

    expect(errors).toHaveLength(0);
    const executed = (ctx as any)._executedNodes;
    expect(executed).toEqual(['Analyzer']);
  });
});
