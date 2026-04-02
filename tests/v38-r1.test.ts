import { describe, it, expect } from 'vitest';
import { applyFallbackAlias, executeConditionalChain, MAX_CONDITIONAL_HOPS } from '../src/runtime/flow-runner.js';
import { FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { ConditionalBranch } from '../src/parser/ast.js';

/**
 * Create a FlowContext mock for extraction tests.
 */
function makeCtx(opts: {
  nodeOutputs?: Record<string, Record<string, unknown>>;
  conditionalEdges?: Record<string, ConditionalBranch[]>;
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

describe('v3.8-R1: flow-runner extraction', () => {
  describe('applyFallbackAlias', () => {
    it('stores output under original name when result.node differs', () => {
      const ctx = makeCtx();
      const result: NodeResult = {
        node: 'fallback_node',
        output: { data: 'from-fallback' },
        durationMs: 1,
        success: true,
      };
      applyFallbackAlias('original_node', result, ctx);
      expect(ctx.outputs.get('original_node')).toEqual({ data: 'from-fallback' });
    });

    it('is a no-op when result.node matches the name', () => {
      const ctx = makeCtx();
      const result: NodeResult = {
        node: 'same_node',
        output: { data: 'direct' },
        durationMs: 1,
        success: true,
      };
      applyFallbackAlias('same_node', result, ctx);
      // outputs should NOT have 'same_node' set by applyFallbackAlias
      // (it may have been set by executeNode, but applyFallbackAlias itself should not set it)
      expect(ctx.outputs.has('same_node')).toBe(false);
    });
  });

  describe('executeConditionalChain', () => {
    it('is callable independently for a single-hop chain', async () => {
      const ctx = makeCtx({
        nodeOutputs: {
          A: { status: 'go' },
          B: { result: 'done' },
        },
        conditionalEdges: {
          A: [{ target: 'B', condition: { field: 'status', op: '==', value: 'go' } }],
        },
      });
      const initialResult: NodeResult = {
        node: 'A',
        output: { status: 'go' },
        durationMs: 1,
        success: true,
      };
      const nodeResults: NodeResult[] = [initialResult];
      const errors: string[] = [];

      await executeConditionalChain('A', initialResult, ctx, nodeResults, errors);

      expect(errors).toHaveLength(0);
      expect(ctx._executedNodes).toEqual(['B']);
      expect(nodeResults).toHaveLength(2); // initial + B
      expect(nodeResults[1].node).toBe('B');
    });

    it('is a no-op when no conditional edges exist', async () => {
      const ctx = makeCtx({
        nodeOutputs: { X: { val: 1 } },
        conditionalEdges: {},
      });
      const initialResult: NodeResult = {
        node: 'X',
        output: { val: 1 },
        durationMs: 1,
        success: true,
      };
      const nodeResults: NodeResult[] = [initialResult];
      const errors: string[] = [];

      await executeConditionalChain('X', initialResult, ctx, nodeResults, errors);

      expect(errors).toHaveLength(0);
      expect(ctx._executedNodes).toHaveLength(0);
      expect(nodeResults).toHaveLength(1); // only initial, nothing added
    });
  });

  it('MAX_CONDITIONAL_HOPS is exported and equals 10', () => {
    expect(MAX_CONDITIONAL_HOPS).toBe(10);
  });
});
