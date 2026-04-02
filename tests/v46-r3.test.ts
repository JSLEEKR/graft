import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Cross-feature: logical + conditional + comparison ──────────

describe('Cross-feature: logical operators with conditionals', () => {
  function compileGraph(flowLine: string) {
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
      `  A -> ${flowLine} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('conditional with && in condition compiles', () => {
    const result = compileGraph('let r = if A.score > 50 && A.status == "ok" then "go" else "stop"');
    expect(result.success).toBe(true);
  });

  it('conditional with || in condition compiles', () => {
    const result = compileGraph('let r = if A.score > 90 || A.retries > 5 then "escalate" else "retry"');
    expect(result.success).toBe(true);
  });

  it('logical ops combined with arithmetic compiles', () => {
    const result = compileGraph('let r = A.score + 10 > 50 && A.retries < 3');
    expect(result.success).toBe(true);
  });

  it('chained let with logical + conditional compiles', () => {
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
      '  A -> let ok = A.score > 50 && A.status == "ok" -> let result = if ok then "pass" else "fail" -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
  });
});

// ── Runtime: logical + conditional evaluation ──────────────────

describe('Runtime: logical operators with comparison', () => {
  it('&& with both comparisons true', () => {
    const outputs = new Map<string, unknown>([['score', 75], ['retries', 1]]);
    const expr: Expr = {
      kind: 'binary', op: '&&',
      left: {
        kind: 'binary', op: '>' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 50, location: loc },
        location: loc,
      },
      right: {
        kind: 'binary', op: '<' as any,
        left: { kind: 'field_access', segments: ['retries'], location: loc },
        right: { kind: 'literal', value: 3, location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(true);
  });

  it('&& short-circuits on false left', () => {
    const outputs = new Map<string, unknown>([['score', 30]]);
    const expr: Expr = {
      kind: 'binary', op: '&&',
      left: {
        kind: 'binary', op: '>' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 50, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 'should not reach', location: loc },
      location: loc,
    };
    // Returns the falsy value (false from comparison), not 'should not reach'
    expect(evaluateExpr(expr, outputs)).toBe(false);
  });

  it('|| with first condition true short-circuits', () => {
    const outputs = new Map<string, unknown>([['score', 95]]);
    const expr: Expr = {
      kind: 'binary', op: '||',
      left: {
        kind: 'binary', op: '>' as any,
        left: { kind: 'field_access', segments: ['score'], location: loc },
        right: { kind: 'literal', value: 90, location: loc },
        location: loc,
      },
      right: { kind: 'literal', value: 'fallback', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(true);
  });
});

// ── Regression: all expression features still work ─────────────

describe('Regression: expression system integrity', () => {
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

  it('arithmetic still works', () => {
    expect(compileGraph('let x = A.score + 10 * 2').success).toBe(true);
  });

  it('comparison still works', () => {
    expect(compileGraph('let x = A.score > 50').success).toBe(true);
  });

  it('conditional still works', () => {
    expect(compileGraph('let x = if A.score > 50 then "hi" else "lo"').success).toBe(true);
  });

  it('function calls still work', () => {
    expect(compileGraph('let x = len(A.name)').success).toBe(true);
  });

  it('complex expression: logical + conditional + comparison + arithmetic', () => {
    const result = compileGraph('let x = if A.score * 2 > 100 && len(A.name) > 0 then max(A.score, 50) else min(A.score, 10)');
    expect(result.success).toBe(true);
  });
});
