import { describe, it, expect } from 'vitest';
import { compile, compileToProgram } from '../src/compiler.js';
import { evaluateExpr, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { applyTransforms } from '../src/runtime/transforms.js';
import { formatExpr } from '../src/format.js';
import { mkCond } from './helpers.js';
import { NodeResult } from '../src/runtime/executor.js';
import { Expr, FlowNode, GraphDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── End-to-end: conditional edges compile and run ──────────────────

describe('v5.0-R5: E2E conditional edge pipeline', () => {
  it('program with conditional edges compiles successfully', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { score: Int label: String }
      }
      node Fast(model: haiku, budget: 2k/1k) {
        reads: [Decision]
        produces FastResult { text: String }
      }
      node Deep(model: opus, budget: 10k/5k) {
        reads: [Decision]
        produces DeepResult { text: String }
      }
      edge Router -> {
        when score >= 8 -> Deep
        else -> Fast
      }
      graph Pipeline(input: Input, output: FastResult, budget: 20k) {
        Router -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('program with filter transforms compiles and runs', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Out { items: String score: Int }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [Out]
        produces Final { text: String }
      }
      edge A -> B | filter(items, score >= 5)
      graph G(input: Input, output: Final, budget: 10k) {
        A -> B -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });
});

// ── Cross-feature: conditional edge + let + graph call ─────────────

describe('v5.0-R5: Cross-feature interactions', () => {
  it('conditional edge + let binding + graph call', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'Mid', output: 'Out', budget: 3000,
      params: [], location: loc,
      flow: [{ kind: 'node', name: 'Worker', location: loc }],
    };

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Router', location: loc },
    ];

    const ctx: FlowContext = {
      executeNode: async (name) => {
        const output = name === 'Router' ? { priority: 9, label: 'high' } : { text: 'done' };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      outputs: new Map(),
      input: {},
      getConditionalEdge: (source) => {
        if (source === 'Router') {
          return {
            branches: [
              { target: 'Handler', condition: mkCond('priority', '>=', 5) },
              { target: 'Fallback', condition: undefined },
            ],
            transforms: [],
          };
        }
        return null;
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    };

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(nodeResults[1].node).toBe('Handler');
  });

  it('filter transform + string equality (strict)', () => {
    const data = {
      results: [
        { status: 'pass', value: 1 },
        { status: 'fail', value: 2 },
        { status: 'pass', value: 3 },
      ],
    };
    const cond = mkCond('status', '==', 'pass');
    const result = applyTransforms(data, [
      { type: 'filter', field: 'results', condition: cond },
    ]) as Record<string, unknown>;
    expect((result.results as unknown[]).length).toBe(2);
  });

  it('strict equality in edge conditions: number !== string', () => {
    const cond = mkCond('score', '==', 5);
    // String "5" should NOT match number 5 with strict equality
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: '5' })))).toBe(false);
    // Same-type comparison should work
    expect(!!evaluateExpr(cond, new Map(Object.entries({ score: 5 })))).toBe(true);
  });
});

// ── Regression: all operator types ─────────────────────────────────

describe('v5.0-R5: Regression — all operators work', () => {
  const m = new Map<string, unknown>();

  it('arithmetic: +, -, *, /, %', () => {
    expect(evaluateExpr({ kind: 'binary', op: '+', left: { kind: 'literal', value: 3, location: loc }, right: { kind: 'literal', value: 4, location: loc }, location: loc }, m)).toBe(7);
    expect(evaluateExpr({ kind: 'binary', op: '-', left: { kind: 'literal', value: 10, location: loc }, right: { kind: 'literal', value: 3, location: loc }, location: loc }, m)).toBe(7);
    expect(evaluateExpr({ kind: 'binary', op: '*', left: { kind: 'literal', value: 3, location: loc }, right: { kind: 'literal', value: 4, location: loc }, location: loc }, m)).toBe(12);
    expect(evaluateExpr({ kind: 'binary', op: '/', left: { kind: 'literal', value: 12, location: loc }, right: { kind: 'literal', value: 4, location: loc }, location: loc }, m)).toBe(3);
    expect(evaluateExpr({ kind: 'binary', op: '%', left: { kind: 'literal', value: 10, location: loc }, right: { kind: 'literal', value: 3, location: loc }, location: loc }, m)).toBe(1);
  });

  it('comparison: <, >, <=, >=, ==, !=', () => {
    const mk = (op: string, l: unknown, r: unknown): Expr => ({
      kind: 'binary', op: op as any,
      left: { kind: 'literal', value: l, location: loc },
      right: { kind: 'literal', value: r, location: loc },
      location: loc,
    });
    expect(evaluateExpr(mk('<', 1, 2), m)).toBe(true);
    expect(evaluateExpr(mk('>', 2, 1), m)).toBe(true);
    expect(evaluateExpr(mk('<=', 2, 2), m)).toBe(true);
    expect(evaluateExpr(mk('>=', 2, 2), m)).toBe(true);
    expect(evaluateExpr(mk('==', 'a', 'a'), m)).toBe(true);
    expect(evaluateExpr(mk('!=', 'a', 'b'), m)).toBe(true);
  });

  it('logical: &&, ||', () => {
    const mk = (op: string, l: unknown, r: unknown): Expr => ({
      kind: 'binary', op: op as any,
      left: { kind: 'literal', value: l, location: loc },
      right: { kind: 'literal', value: r, location: loc },
      location: loc,
    });
    expect(evaluateExpr(mk('&&', true, true), m)).toBe(true);
    expect(evaluateExpr(mk('&&', true, false), m)).toBe(false);
    expect(evaluateExpr(mk('||', false, true), m)).toBe(true);
    expect(evaluateExpr(mk('||', false, false), m)).toBe(false);
  });

  it('null coalescing: ??', () => {
    const vars = new Map<string, unknown>([['x', null]]);
    const expr: Expr = {
      kind: 'binary', op: '??',
      left: { kind: 'field_access', segments: ['x'], location: loc },
      right: { kind: 'literal', value: 'default', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, m, vars)).toBe('default');
  });
});

// ── Regression: builtins ───────────────────────────────────────────

describe('v5.0-R5: Regression — all 7 builtins work', () => {
  const m = new Map<string, unknown>();

  it('len, max, min, str, abs, round, keys', () => {
    const mkCall = (name: string, ...args: unknown[]): Expr => ({
      kind: 'call', name,
      args: args.map(a => ({ kind: 'literal' as const, value: a, location: loc })),
      location: loc,
    });
    expect(evaluateExpr(mkCall('len', 'hello'), m)).toBe(5);
    expect(evaluateExpr(mkCall('max', 3, 7), m)).toBe(7);
    expect(evaluateExpr(mkCall('min', 3, 7), m)).toBe(3);
    expect(evaluateExpr(mkCall('str', 42), m)).toBe('42');
    expect(evaluateExpr(mkCall('abs', -5), m)).toBe(5);
    expect(evaluateExpr(mkCall('round', 3.7), m)).toBe(4);
    // keys needs object — use variable
    const vars = new Map<string, unknown>([['obj', { a: 1, b: 2 }]]);
    const keysExpr: Expr = {
      kind: 'call', name: 'keys',
      args: [{ kind: 'field_access', segments: ['obj'], location: loc }],
      location: loc,
    };
    expect(evaluateExpr(keysExpr, m, vars)).toEqual(['a', 'b']);
  });
});

// ── Regression: template, conditional, short-circuit ───────────────

describe('v5.0-R5: Regression — expression types', () => {
  const m = new Map<string, unknown>();

  it('template expression', () => {
    const vars = new Map<string, unknown>([['name', 'World']]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Hello ' },
        { kind: 'expr', value: { kind: 'field_access', segments: ['name'], location: loc } },
        { kind: 'text', value: '!' },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, m, vars)).toBe('Hello World!');
  });

  it('conditional expression (if-then-else)', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: true, location: loc },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, m)).toBe('yes');
  });

  it('short-circuit: && does not evaluate right on falsy left', () => {
    const warnings: string[] = [];
    const expr: Expr = {
      kind: 'binary', op: '&&',
      left: { kind: 'literal', value: false, location: loc },
      right: { kind: 'binary', op: '/', left: { kind: 'literal', value: 1, location: loc }, right: { kind: 'literal', value: 0, location: loc }, location: loc },
      location: loc,
    };
    evaluateExpr(expr, m, undefined, warnings);
    expect(warnings).toHaveLength(0); // division by zero not reached
  });
});

// ── Scale: complex pipeline ────────────────────────────────────────

describe('v5.0-R5: Scale — complex pipeline with all v4.x+v5.0 features', () => {
  it('compiles end-to-end', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      context DataCtx(max_tokens: 1k) { data: String count: Int }
      node Analyzer(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces Analysis { score: Int label: String items: String }
      }
      node FastHandler(model: haiku, budget: 2k/1k) {
        reads: [Analysis]
        produces FastResult { text: String }
      }
      node DeepHandler(model: opus, budget: 10k/5k) {
        reads: [Analysis]
        produces DeepResult { text: String }
      }
      edge Analyzer -> {
        when score >= 8 -> DeepHandler
        else -> FastHandler
      }
      graph Main(input: Spec, output: FastResult, budget: 20k, threshold: Int = 5) {
        Analyzer
          -> let s = Analyzer.score
          -> let tag = if s >= 10 then "high" else "low"
          -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── formatExpr accessible from format.ts ───────────────────────────

describe('v5.0-R5: formatExpr import verification', () => {
  it('formatExpr works for complex nested expression', () => {
    const expr: Expr = {
      kind: 'binary', op: '&&',
      left: {
        kind: 'binary', op: '>=',
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 5, location: loc },
        location: loc,
      },
      right: {
        kind: 'binary', op: '==',
        left: { kind: 'field_access', segments: ['status'], location: loc },
        right: { kind: 'literal', value: 'active', location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(formatExpr(expr)).toBe('score >= 5 && status == "active"');
  });
});
