import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Cross-feature: ?? with all expression features ─────────────

describe('Cross-feature: null coalescing integration', () => {
  function compileGraph(flowLine: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    name: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> ${flowLine} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('?? with conditional compiles', () => {
    const result = compileGraph('let x = if (A.name ?? "anon") == "anon" then 0 else A.score');
    expect(result.success).toBe(true);
  });

  it('?? with logical operators compiles', () => {
    const result = compileGraph('let x = A.score > 50 && (A.name ?? "default") != "default"');
    expect(result.success).toBe(true);
  });

  it('?? with function call compiles', () => {
    const result = compileGraph('let x = len(A.name ?? "")');
    expect(result.success).toBe(true);
  });

  it('?? with arithmetic compiles', () => {
    const result = compileGraph('let x = (A.score ?? 0) + 10');
    expect(result.success).toBe(true);
  });

  it('complex expression with all operator types compiles', () => {
    const result = compileGraph('let x = if (A.score ?? 0) > 50 && len(A.name ?? "") > 0 then A.name ?? "unknown" else "anonymous"');
    expect(result.success).toBe(true);
  });
});

// ── Runtime: ?? with other operators ───────────────────────────

describe('Runtime: null coalescing with other operators', () => {
  it('?? combined with comparison', () => {
    const outputs = new Map<string, unknown>();
    const expr: Expr = {
      kind: 'binary', op: '>' as any,
      left: {
        kind: 'binary', op: '??' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 0, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 50, location: loc },
      location: loc,
    };
    // score is undefined → ?? returns 0 → 0 > 50 → false
    expect(evaluateExpr(expr, outputs)).toBe(false);
  });

  it('?? with non-null value skips default', () => {
    const outputs = new Map<string, unknown>([['score', 75]]);
    const expr: Expr = {
      kind: 'binary', op: '>' as any,
      left: {
        kind: 'binary', op: '??' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 0, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 50, location: loc },
      location: loc,
    };
    // score is 75 → ?? returns 75 → 75 > 50 → true
    expect(evaluateExpr(expr, outputs)).toBe(true);
  });
});

// ── Regression: full expression system ─────────────────────────

describe('Regression: all 10 binary operators work', () => {
  function mkBinary(op: string, left: number, right: number): Expr {
    return {
      kind: 'binary', op: op as any,
      left: { kind: 'literal', value: left, location: loc },
      right: { kind: 'literal', value: right, location: loc },
      location: loc,
    };
  }

  it('+', () => expect(evaluateExpr(mkBinary('+', 3, 4), new Map())).toBe(7));
  it('-', () => expect(evaluateExpr(mkBinary('-', 10, 3), new Map())).toBe(7));
  it('*', () => expect(evaluateExpr(mkBinary('*', 3, 4), new Map())).toBe(12));
  it('/', () => expect(evaluateExpr(mkBinary('/', 10, 2), new Map())).toBe(5));
  it('%', () => expect(evaluateExpr(mkBinary('%', 10, 3), new Map())).toBe(1));
  it('>', () => expect(evaluateExpr(mkBinary('>', 10, 5), new Map())).toBe(true));
  it('<', () => expect(evaluateExpr(mkBinary('<', 5, 10), new Map())).toBe(true));
  it('>=', () => expect(evaluateExpr(mkBinary('>=', 10, 10), new Map())).toBe(true));
  it('<=', () => expect(evaluateExpr(mkBinary('<=', 10, 10), new Map())).toBe(true));
  it('==', () => expect(evaluateExpr(mkBinary('==', 5, 5), new Map())).toBe(true));
  it('!=', () => expect(evaluateExpr(mkBinary('!=', 5, 6), new Map())).toBe(true));
});
