import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Parse: comparison operators ─────────────────────────────────

describe('Parse: comparison operators in expressions', () => {
  function compileWithExpr(exprSource: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    status: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> let x = ${exprSource} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('A.score > 50 compiles', () => {
    const result = compileWithExpr('A.score > 50');
    expect(result.success).toBe(true);
  });

  it('A.score < 100 compiles', () => {
    const result = compileWithExpr('A.score < 100');
    expect(result.success).toBe(true);
  });

  it('A.score >= 50 compiles', () => {
    const result = compileWithExpr('A.score >= 50');
    expect(result.success).toBe(true);
  });

  it('A.score <= 100 compiles', () => {
    const result = compileWithExpr('A.score <= 100');
    expect(result.success).toBe(true);
  });

  it('A.status == "ok" compiles', () => {
    const result = compileWithExpr('A.status == "ok"');
    expect(result.success).toBe(true);
  });

  it('A.status != "error" compiles', () => {
    const result = compileWithExpr('A.status != "error"');
    expect(result.success).toBe(true);
  });

  it('precedence: A.score + 10 > 50 parses as (A.score + 10) > 50', () => {
    const result = compileWithExpr('A.score + 10 > 50');
    expect(result.success).toBe(true);
    // The comparison should be at lower precedence than addition
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    expect(letNode?.kind).toBe('let');
    if (letNode?.kind === 'let') {
      expect(letNode.value.kind).toBe('binary');
      if (letNode.value.kind === 'binary') {
        expect(letNode.value.op).toBe('>');
        expect(letNode.value.left.kind).toBe('binary'); // A.score + 10
      }
    }
  });
});

// ── Evaluate: comparison operators ──────────────────────────────

describe('Evaluate: comparison operators', () => {
  function mkBinary(op: string, left: number, right: number): Expr {
    return {
      kind: 'binary', op: op as any,
      left: { kind: 'literal', value: left, location: loc },
      right: { kind: 'literal', value: right, location: loc },
      location: loc,
    };
  }

  it('10 > 5 = true', () => {
    expect(evaluateExpr(mkBinary('>', 10, 5), new Map())).toBe(true);
  });

  it('5 > 10 = false', () => {
    expect(evaluateExpr(mkBinary('>', 5, 10), new Map())).toBe(false);
  });

  it('5 < 10 = true', () => {
    expect(evaluateExpr(mkBinary('<', 5, 10), new Map())).toBe(true);
  });

  it('10 >= 10 = true', () => {
    expect(evaluateExpr(mkBinary('>=', 10, 10), new Map())).toBe(true);
  });

  it('9 >= 10 = false', () => {
    expect(evaluateExpr(mkBinary('>=', 9, 10), new Map())).toBe(false);
  });

  it('10 <= 10 = true', () => {
    expect(evaluateExpr(mkBinary('<=', 10, 10), new Map())).toBe(true);
  });

  it('5 == 5 = true (number)', () => {
    expect(evaluateExpr(mkBinary('==', 5, 5), new Map())).toBe(true);
  });

  it('5 != 6 = true', () => {
    expect(evaluateExpr(mkBinary('!=', 5, 6), new Map())).toBe(true);
  });

  it('loose equality: "5" == 5', () => {
    const expr: Expr = {
      kind: 'binary', op: '==' as any,
      left: { kind: 'literal', value: '5', location: loc },
      right: { kind: 'literal', value: 5, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(true);
  });
});

// ── Type inference: comparison result is boolean ────────────────

describe('Type inference: comparison produces boolean', () => {
  it('comparison result used in further expression compiles', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let valid = A.score > 50 -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
