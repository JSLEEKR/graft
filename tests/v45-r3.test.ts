import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Cross-feature: conditional + comparison + template ─────────

describe('Cross-feature: conditional with comparison condition', () => {
  function compileGraph(flowLine: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    status: String',
      '    count: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> ${flowLine} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('conditional with >= comparison compiles', () => {
    const result = compileGraph('let r = if A.score >= 80 then "pass" else "fail"');
    expect(result.success).toBe(true);
  });

  it('conditional with == comparison compiles', () => {
    const result = compileGraph('let r = if A.status == "ok" then 1 else 0');
    expect(result.success).toBe(true);
  });

  it('conditional with != comparison compiles', () => {
    const result = compileGraph('let r = if A.status != "error" then A.score else 0');
    expect(result.success).toBe(true);
  });

  it('conditional with arithmetic in condition compiles', () => {
    const result = compileGraph('let r = if A.score + 10 > 100 then 100 else A.score + 10');
    expect(result.success).toBe(true);
  });

  it('chained let with conditional compiles', () => {
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
      '  A -> let tier = if A.score > 80 then "gold" else "silver" -> let msg = if A.score > 50 then tier else "bronze" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('conditional with function call in branches compiles', () => {
    const result = compileGraph('let r = if len(A.status) > 3 then abs(A.score) else 0');
    expect(result.success).toBe(true);
  });
});

// ── Runtime: conditional + comparison evaluation ───────────────

describe('Runtime: conditional with comparison evaluation', () => {
  it('comparison true → consequent branch', () => {
    const outputs = new Map<string, unknown>([['score', 90]]);
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '>=' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 80, location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 'pass', location: loc },
      alternate: { kind: 'literal', value: 'fail', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('pass');
  });

  it('comparison false → alternate branch', () => {
    const outputs = new Map<string, unknown>([['score', 50]]);
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '>=' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 80, location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 'pass', location: loc },
      alternate: { kind: 'literal', value: 'fail', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('fail');
  });

  it('nested conditional evaluates correctly', () => {
    const outputs = new Map<string, unknown>([['score', 65]]);
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '>' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 80, location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 'A', location: loc },
      alternate: {
        kind: 'conditional',
        condition: {
          kind: 'binary', op: '>' as any,
          left: { kind: 'field_access', segments: ['score'], location: loc },
          right: { kind: 'literal', value: 50, location: loc },
          location: loc,
        },
        consequent: { kind: 'literal', value: 'B', location: loc },
        alternate: { kind: 'literal', value: 'C', location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('B');
  });

  it('conditional with equality check', () => {
    const outputs = new Map<string, unknown>([['status', 'ok']]);
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '==' as any,
        left: { kind: 'field_access', segments: ['status'], location: loc },
        right: { kind: 'literal', value: 'ok', location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 1, location: loc },
      alternate: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(1);
  });
});

// ── Regression: existing features still work with new keywords ─

describe('Regression: if/then keywords do not break existing features', () => {
  it('node named "iffy" does not conflict with if keyword', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node iffy(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { value: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  iffy -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('field named "then_value" does not conflict with then keyword', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { then_value: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('template strings still work alongside conditionals', () => {
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
      '  A -> let label = if A.score > 50 then "high" else "low" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('arithmetic expressions still work', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    x: Int',
      '    y: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let sum = A.x + A.y * 2 -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('builtin functions still work in conditionals', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    items: String',
      '    score: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let result = if len(A.items) > 0 then max(A.score, 50) else min(A.score, 10) -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });
});
