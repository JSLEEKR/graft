import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateExpr, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, GraphDecl, Expr } from '../src/parser/ast.js';
import { compile, compileToProgram } from '../src/compiler.js';

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

// ── Cross-feature: function call + variable + condition ──────────

describe('Cross-feature: function + variable + condition', () => {
  it('len() result used in variable then accessible', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A', location: loc },
      { kind: 'let', name: 'count', value: {
        kind: 'call', name: 'len',
        args: [{ kind: 'field_access', segments: ['A', 'items'], location: loc }],
        location: loc,
      }, location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { items: ['a', 'b', 'c'] };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('count')).toBe(3);
  });

  it('max() + str() composition works at runtime', () => {
    const outputs = new Map<string, unknown>([['A', { score: 30 }]]);
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{
        kind: 'call', name: 'max',
        args: [
          { kind: 'field_access', segments: ['A', 'score'], location: loc },
          { kind: 'literal', value: 50, location: loc },
        ],
        location: loc,
      }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('50');
  });
});

// ── Cross-feature: function call + graph call return value ───────

describe('Cross-feature: function + graph call return', () => {
  it('len() on graph call return value works', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [], location: loc,
      flow: [{ kind: 'node', name: 'Worker', location: loc }],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [], location: loc },
      { kind: 'let', name: 'count', value: {
        kind: 'call', name: 'len',
        args: [{ kind: 'field_access', segments: ['Sub', 'items'], location: loc }],
        location: loc,
      }, location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { items: [1, 2, 3, 4, 5] };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('count')).toBe(5);
  });
});

// ── Cross-feature: function in condition filter ──────────────────

describe('Cross-feature: function expressions', () => {
  it('evaluateExpr with function call in binary expression', () => {
    const outputs = new Map<string, unknown>([['items', ['a', 'b', 'c']]]);
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'call', name: 'len', args: [
        { kind: 'field_access', segments: ['items'], location: loc },
      ], location: loc },
      right: { kind: 'literal', value: 10, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(13);
  });
});

// ── Regression: existing v4.0/v4.1 patterns unchanged ────────────

describe('Regression: existing patterns unchanged', () => {
  it('let bindings without functions still work', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A', location: loc },
      { kind: 'let', name: 'x', value: { kind: 'literal', value: 42, location: loc }, location: loc },
    ];
    const ctx = makeCtx({
      executeNode: async (name) => ({ node: name, output: {}, durationMs: 5, success: true }),
    });
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(ctx.variables?.get('x')).toBe(42);
  });

  it('evaluateExpr still works with field_access LHS', () => {
    const cond = mkCond('score', '>=', 80);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 90 })))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 70 })))).toBe(false);
  });

  it('evaluateExpr still works with field_access LHS (transform replacement)', () => {
    const cond = mkCond('severity', '==', 'high');
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 'high' } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 'low' } as Record<string, unknown>)))).toBe(false);
  });

  it('unified equality: routing and transform agree on numeric strings', () => {
    const cond = mkCond('status', '==', 200);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ status: '200' } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ status: '200' } as Record<string, unknown>)))).toBe(true);
  });
});

// ── Scale: complex pipeline with functions + graph returns ───────

describe('Scale: full pipeline with functions', () => {
  it('complex pipeline compiles end-to-end', () => {
    const source = `
      context Input(max_tokens: 500) { items: List<String> }
      context Mid(max_tokens: 1k) { data: String }
      node Analyzer(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Analysis {
          items: List<String>
          score: Int
        }
      }
      node Formatter(model: haiku, budget: 1k/500) {
        reads: [Mid]
        produces Output { result: String }
      }
      graph Sub(input: Mid, output: Output, budget: 5k) {
        Formatter -> done
      }
      graph Main(input: Input, output: Output, budget: 15k) {
        Analyzer
        -> let count = len(Analyzer.items)
        -> let label = str(max(Analyzer.score, 50))
        -> Sub()
        -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('function arity error in full pipeline', () => {
    const source = `
      context Input(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Out { items: List<String> }
      }
      graph G(input: Input, output: Out, budget: 5k) {
        A -> let x = len(A.items, 42) -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'TYPE_FUNC_ARITY')).toBe(true);
  });
});
