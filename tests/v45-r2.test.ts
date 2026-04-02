import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Parse: conditional expressions ──────────────────────────────

describe('Parse: conditional expressions', () => {
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

  it('if A.score > 50 then "high" else "low" compiles', () => {
    const result = compileWithExpr('if A.score > 50 then "high" else "low"');
    expect(result.success).toBe(true);
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    expect(letNode?.kind).toBe('let');
    if (letNode?.kind === 'let') {
      expect(letNode.value.kind).toBe('conditional');
    }
  });

  it('nested conditional compiles', () => {
    const result = compileWithExpr('if A.score > 80 then "A" else if A.score > 50 then "B" else "C"');
    expect(result.success).toBe(true);
  });

  it('conditional with function call compiles', () => {
    const result = compileWithExpr('if len(A.status) > 0 then A.status else "unknown"');
    expect(result.success).toBe(true);
  });

  it('conditional with numeric result compiles', () => {
    const result = compileWithExpr('if A.score > 100 then 100 else A.score');
    expect(result.success).toBe(true);
  });
});

// ── Evaluate: conditional expressions ───────────────────────────

describe('Evaluate: conditional expressions', () => {
  it('truthy condition returns consequent', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: true, location: loc },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('yes');
  });

  it('falsy condition returns alternate', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: false, location: loc },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('no');
  });

  it('numeric condition: 0 is falsy', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: 0, location: loc },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('no');
  });

  it('numeric condition: non-zero is truthy', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: 42, location: loc },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('yes');
  });

  it('comparison condition at runtime', () => {
    const outputs = new Map<string, unknown>([['score', 75]]);
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '>' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 50, location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 'high', location: loc },
      alternate: { kind: 'literal', value: 'low', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('high');
  });
});

// ── Type inference: conditional ─────────────────────────────────

describe('Type inference: conditional expressions', () => {
  it('both branches string -> let infers string', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let label = if A.score > 50 then "high" else "low" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('both branches number -> let infers number', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let capped = if A.score > 100 then 100 else A.score -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
