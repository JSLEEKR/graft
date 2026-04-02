import { describe, it, expect } from 'vitest';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { evaluateExpr as evalFromFlowRunner, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, Expr } from '../src/parser/ast.js';
import { compile } from '../src/compiler.js';

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

// ── Cross-feature: template with function call ──────────────────

describe('Cross-feature: template with function call', () => {
  it('template with len() inside', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Found ' },
        { kind: 'expr', value: {
          kind: 'call', name: 'len',
          args: [{ kind: 'field_access', segments: ['items'], location: loc }],
          location: loc,
        }},
        { kind: 'text', value: ' items' },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Found 3 items');
  });

  it('template with multiplication inside', () => {
    const outputs = new Map<string, unknown>([['score', 21]]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Doubled: ' },
        { kind: 'expr', value: {
          kind: 'binary', op: '*',
          left: { kind: 'field_access', segments: ['score'], location: loc },
          right: { kind: 'literal', value: 2, location: loc },
          location: loc,
        }},
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Doubled: 42');
  });
});

// ── Cross-feature: template in let binding at runtime ───────────

describe('Cross-feature: template in let binding at runtime', () => {
  it('let binding with template evaluates correctly', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A', location: loc },
      { kind: 'let', name: 'msg', value: {
        kind: 'template',
        parts: [
          { kind: 'text', value: 'Score: ' },
          { kind: 'expr', value: { kind: 'field_access', segments: ['A', 'score'], location: loc } },
        ],
        location: loc,
      }, location: loc },
    ];
    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { score: 42 };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
    });
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(ctx.variables?.get('msg')).toBe('Score: 42');
  });
});

// ── Regression: imports from flow-runner still work ─────────────

describe('Regression: imports from flow-runner', () => {
  it('evaluateExpr from flow-runner is same as from expr-eval', () => {
    expect(evalFromFlowRunner).toBe(evaluateExpr);
  });

  it('evaluateExpr from flow-runner works correctly', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 32, location: loc },
      location: loc,
    };
    expect(evalFromFlowRunner(expr, new Map())).toBe(42);
  });
});

// ── Regression: all expression types still work ─────────────────

describe('Regression: all expression types', () => {
  it('literal, field_access, binary, unary, group, call, template', () => {
    const outputs = new Map<string, unknown>([['x', 5], ['items', [1, 2]]]);
    const vars = new Map<string, unknown>([['y', 10]]);

    // literal
    expect(evaluateExpr({ kind: 'literal', value: 42, location: loc }, outputs)).toBe(42);
    // field_access (output)
    expect(evaluateExpr({ kind: 'field_access', segments: ['x'], location: loc }, outputs)).toBe(5);
    // field_access (variable)
    expect(evaluateExpr({ kind: 'field_access', segments: ['y'], location: loc }, outputs, vars)).toBe(10);
    // binary
    expect(evaluateExpr({ kind: 'binary', op: '*', left: { kind: 'literal', value: 6, location: loc }, right: { kind: 'literal', value: 7, location: loc }, location: loc }, outputs)).toBe(42);
    // unary
    expect(evaluateExpr({ kind: 'unary', op: '-', operand: { kind: 'literal', value: 5, location: loc }, location: loc }, outputs)).toBe(-5);
    // group
    expect(evaluateExpr({ kind: 'group', inner: { kind: 'literal', value: 99, location: loc }, location: loc }, outputs)).toBe(99);
    // call
    expect(evaluateExpr({ kind: 'call', name: 'len', args: [{ kind: 'field_access', segments: ['items'], location: loc }], location: loc }, outputs)).toBe(2);
    // template
    expect(evaluateExpr({ kind: 'template', parts: [{ kind: 'text', value: 'hi ' }, { kind: 'expr', value: { kind: 'field_access', segments: ['x'], location: loc } }], location: loc }, outputs)).toBe('hi 5');
  });
});

// ── Scale: complex pipeline with templates ──────────────────────

describe('Scale: pipeline with templates', () => {
  it('pipeline with template + operators + builtins compiles', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    items: List<String>',
      '    name: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A',
      '  -> let doubled = A.score * 2',
      '  -> let count = len(A.items)',
      '  -> let msg = "Hello ${A.name}, score: ${A.score}"',
      '  -> let positive = abs(A.score)',
      '  -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('template with nested expression compiles', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    items: List<String>',
      '    score: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let report = "Items: ${len(A.items)}, Score: ${A.score + 10}" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
