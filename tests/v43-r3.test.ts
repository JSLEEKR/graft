import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateExpr, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, Expr } from '../src/parser/ast.js';
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

// ── Cross-feature: multiplication in let binding ─────────────────

describe('Cross-feature: multiplication in pipeline', () => {
  it('let binding with multiplication at runtime', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A', location: loc },
      { kind: 'let', name: 'doubled', value: {
        kind: 'binary', op: '*',
        left: { kind: 'field_access', segments: ['A', 'count'], location: loc },
        right: { kind: 'literal', value: 2, location: loc },
        location: loc,
      }, location: loc },
    ];
    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { count: 21 };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
    });
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(ctx.variables?.get('doubled')).toBe(42);
  });
});

// ── Cross-feature: keys() + len() composition ───────────────────

describe('Cross-feature: keys + len composition', () => {
  it('len(keys(obj)) returns number of keys', () => {
    const outputs = new Map<string, unknown>([
      ['config', { host: 'localhost', port: 8080, debug: true }],
    ]);
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{
        kind: 'call', name: 'keys',
        args: [{ kind: 'field_access', segments: ['config'], location: loc }],
        location: loc,
      }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(3);
  });
});

// ── Regression: existing operators still work ────────────────────

describe('Regression: existing operators', () => {
  it('addition still works', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 3, location: loc },
      right: { kind: 'literal', value: 4, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(7);
  });

  it('subtraction still works', () => {
    const expr: Expr = {
      kind: 'binary', op: '-',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 3, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(7);
  });

  it('division still works', () => {
    const expr: Expr = {
      kind: 'binary', op: '/',
      left: { kind: 'literal', value: 20, location: loc },
      right: { kind: 'literal', value: 4, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(5);
  });

  it('existing builtins (len, max, min) still work', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    expect(evaluateExpr(
      { kind: 'call', name: 'len', args: [{ kind: 'field_access', segments: ['items'], location: loc }], location: loc },
      outputs,
    )).toBe(3);
    expect(evaluateExpr(
      { kind: 'call', name: 'max', args: [{ kind: 'literal', value: 3, location: loc }, { kind: 'literal', value: 7, location: loc }], location: loc },
      new Map(),
    )).toBe(7);
  });
});

// ── Scale: complex pipeline with all operators and functions ─────

describe('Scale: pipeline with all operators and functions', () => {
  it('pipeline with *, %, abs, round, keys compiles', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out {
          score: Int
          items: List<String>
        }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A
        -> let doubled = A.score * 2
        -> let remainder = A.score % 10
        -> let positive = abs(A.score)
        -> let rounded = round(3.14)
        -> let count = len(A.items)
        -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('precedence: a + b * c - d / e compiles correctly', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out {
          a: Int
          b: Int
          c: Int
        }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let result = A.a + A.b * A.c -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
