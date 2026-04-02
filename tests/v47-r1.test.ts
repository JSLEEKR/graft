import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Parse: null coalescing ─────────────────────────────────────

describe('Parse: null coalescing operator', () => {
  function compileWithExpr(exprSource: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    name: String',
      '    score: Int',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> let x = ${exprSource} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('A.name ?? "default" compiles', () => {
    const result = compileWithExpr('A.name ?? "default"');
    expect(result.success).toBe(true);
  });

  it('A.score ?? 0 compiles', () => {
    const result = compileWithExpr('A.score ?? 0');
    expect(result.success).toBe(true);
  });

  it('chained ?? compiles', () => {
    const result = compileWithExpr('A.name ?? A.score ?? 0');
    expect(result.success).toBe(true);
  });

  it('?? with conditional compiles', () => {
    const result = compileWithExpr('if (A.name ?? "anon") == "anon" then 0 else 1');
    expect(result.success).toBe(true);
  });

  it('precedence: ?? is lower than ||', () => {
    const result = compileWithExpr('A.score > 50 || A.score == 0 ?? false');
    expect(result.success).toBe(true);
    // Should parse as: (A.score > 50 || A.score == 0) ?? false
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    if (letNode?.kind === 'let' && letNode.value.kind === 'binary') {
      expect(letNode.value.op).toBe('??');
    }
  });
});

// ── Evaluate: null coalescing ──────────────────────────────────

describe('Evaluate: null coalescing operator', () => {
  it('non-null left returns left', () => {
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'literal', value: 'hello', location: loc },
      right: { kind: 'literal', value: 'default', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('hello');
  });

  it('null-ish field returns right (default)', () => {
    const outputs = new Map<string, unknown>(); // 'name' not in map → undefined
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'field_access', segments: ['name'], location: loc },
      right: { kind: 'literal', value: 'anonymous', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('anonymous');
  });

  it('0 is NOT nullish (returns 0)', () => {
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'literal', value: 0, location: loc },
      right: { kind: 'literal', value: 42, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(0);
  });

  it('false is NOT nullish (returns false)', () => {
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'literal', value: false, location: loc },
      right: { kind: 'literal', value: true, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(false);
  });

  it('empty string is NOT nullish (returns "")', () => {
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'literal', value: '', location: loc },
      right: { kind: 'literal', value: 'fallback', location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('');
  });

  it('chained ?? picks first non-null', () => {
    const outputs = new Map<string, unknown>();
    // first ?? second ?? 'default' — both first and second are undefined
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'field_access', segments: ['first'], location: loc },
      right: {
        kind: 'binary', op: '??' as any,
        left: { kind: 'field_access', segments: ['second'], location: loc },
        right: { kind: 'literal', value: 'default', location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('default');
  });

  it('chained ?? stops at first non-null', () => {
    const outputs = new Map<string, unknown>([['second', 'found']]);
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'field_access', segments: ['first'], location: loc },
      right: {
        kind: 'binary', op: '??' as any,
        left: { kind: 'field_access', segments: ['second'], location: loc },
        right: { kind: 'literal', value: 'default', location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('found');
  });
});
