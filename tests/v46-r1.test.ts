import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Parse: logical operators ───────────────────────────────────

describe('Parse: logical operators in expressions', () => {
  function compileWithExpr(exprSource: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    status: String',
      '    retries: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> let x = ${exprSource} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('A.score > 50 && A.status == "ok" compiles', () => {
    const result = compileWithExpr('A.score > 50 && A.status == "ok"');
    expect(result.success).toBe(true);
  });

  it('A.score < 10 || A.retries > 3 compiles', () => {
    const result = compileWithExpr('A.score < 10 || A.retries > 3');
    expect(result.success).toBe(true);
  });

  it('combined && and || compiles', () => {
    const result = compileWithExpr('A.score > 50 && A.status == "ok" || A.retries > 5');
    expect(result.success).toBe(true);
  });

  it('precedence: a || b && c parses as a || (b && c)', () => {
    const result = compileWithExpr('A.score > 80 || A.score > 50 && A.status == "ok"');
    expect(result.success).toBe(true);
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    expect(letNode?.kind).toBe('let');
    if (letNode?.kind === 'let') {
      // Top-level should be ||
      expect(letNode.value.kind).toBe('binary');
      if (letNode.value.kind === 'binary') {
        expect(letNode.value.op).toBe('||');
        // Right side should be &&
        expect(letNode.value.right.kind).toBe('binary');
        if (letNode.value.right.kind === 'binary') {
          expect(letNode.value.right.op).toBe('&&');
        }
      }
    }
  });

  it('precedence: a && b > c parses as a && (b > c)', () => {
    const result = compileWithExpr('A.score > 50 && A.retries > 3');
    expect(result.success).toBe(true);
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    if (letNode?.kind === 'let' && letNode.value.kind === 'binary') {
      expect(letNode.value.op).toBe('&&');
      // Both sides should be comparison binaries
      expect(letNode.value.left.kind).toBe('binary');
      expect(letNode.value.right.kind).toBe('binary');
    }
  });

  it('logical ops with conditional compiles', () => {
    const result = compileWithExpr('if A.score > 50 && A.status == "ok" then "go" else "stop"');
    expect(result.success).toBe(true);
  });
});

// ── Evaluate: logical operators ────────────────────────────────

describe('Evaluate: logical operators', () => {
  function mkLiteral(value: unknown): Expr {
    return { kind: 'literal', value: value as any, location: loc };
  }

  function mkLogical(op: '&&' | '||', left: unknown, right: unknown): Expr {
    return {
      kind: 'binary', op,
      left: mkLiteral(left),
      right: mkLiteral(right),
      location: loc,
    };
  }

  it('true && true = true', () => {
    expect(evaluateExpr(mkLogical('&&', true, true), new Map())).toBe(true);
  });

  it('true && false = false', () => {
    expect(evaluateExpr(mkLogical('&&', true, false), new Map())).toBe(false);
  });

  it('false && true = false (short-circuit)', () => {
    expect(evaluateExpr(mkLogical('&&', false, true), new Map())).toBe(false);
  });

  it('true || false = true', () => {
    expect(evaluateExpr(mkLogical('||', true, false), new Map())).toBe(true);
  });

  it('false || true = true', () => {
    expect(evaluateExpr(mkLogical('||', false, true), new Map())).toBe(true);
  });

  it('false || false = false', () => {
    expect(evaluateExpr(mkLogical('||', false, false), new Map())).toBe(false);
  });

  it('&& short-circuits: falsy left returns left value', () => {
    expect(evaluateExpr(mkLogical('&&', 0, 'never'), new Map())).toBe(0);
  });

  it('|| short-circuits: truthy left returns left value', () => {
    expect(evaluateExpr(mkLogical('||', 42, 'never'), new Map())).toBe(42);
  });

  it('&& with truthy left returns right value', () => {
    expect(evaluateExpr(mkLogical('&&', 1, 'yes'), new Map())).toBe('yes');
  });

  it('|| with falsy left returns right value', () => {
    expect(evaluateExpr(mkLogical('||', 0, 'fallback'), new Map())).toBe('fallback');
  });
});

// ── Type inference: logical operators ──────────────────────────

describe('Type inference: logical operators', () => {
  it('boolean && boolean infers boolean', () => {
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
      '  A -> let valid = A.score > 50 && A.status == "ok" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
