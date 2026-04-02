import { describe, it, expect } from 'vitest';
import { BUILTIN_FUNCTIONS, Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── BUILTIN_FUNCTIONS registry enrichment ───────────────────────

describe('BUILTIN_FUNCTIONS registry enrichment', () => {
  it('all 7 builtins have returnType, signature, description', () => {
    const names = ['len', 'max', 'min', 'str', 'abs', 'round', 'keys'];
    for (const name of names) {
      const info = BUILTIN_FUNCTIONS[name];
      expect(info).toBeDefined();
      expect(info.arity).toBeTypeOf('number');
      expect(info.returnType).toBeTypeOf('string');
      expect(info.signature).toBeTypeOf('string');
      expect(info.description).toBeTypeOf('string');
      expect(info.signature).toContain(name);
    }
  });

  it('returnType matches expected values', () => {
    expect(BUILTIN_FUNCTIONS['len'].returnType).toBe('number');
    expect(BUILTIN_FUNCTIONS['max'].returnType).toBe('number');
    expect(BUILTIN_FUNCTIONS['min'].returnType).toBe('number');
    expect(BUILTIN_FUNCTIONS['str'].returnType).toBe('string');
    expect(BUILTIN_FUNCTIONS['abs'].returnType).toBe('number');
    expect(BUILTIN_FUNCTIONS['round'].returnType).toBe('number');
    expect(BUILTIN_FUNCTIONS['keys'].returnType).toBe('unknown');
  });
});

// ── inferExprType reads from registry ───────────────────────────

describe('inferExprType reads from registry', () => {
  it('type inference for all builtins still works via compile', () => {
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
      '  A',
      '  -> let c = len(A.items)',
      '  -> let m = max(A.score, 10)',
      '  -> let n = min(A.score, 10)',
      '  -> let s = str(A.score)',
      '  -> let a = abs(A.score)',
      '  -> let r = round(3.14)',
      '  -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('arity validation still works', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let x = len(A.score, A.score) -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.errors.some(e => e.code === 'TYPE_FUNC_ARITY')).toBe(true);
  });
});

// ── Hover docs from registry ────────────────────────────────────

describe('Hover docs from registry', () => {
  it('BUILTIN_FUNCTIONS contains documentation for hover', () => {
    // Verify hover can be generated from registry (the actual hover test is in LSP tests)
    for (const [name, info] of Object.entries(BUILTIN_FUNCTIONS)) {
      const hoverText = `**${info.signature}**\n\n${info.description}`;
      expect(hoverText).toContain(name);
      expect(hoverText.length).toBeGreaterThan(10);
    }
  });
});

// ── All builtins still work at runtime ──────────────────────────

describe('All builtins still work at runtime', () => {
  it('len', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const expr: Expr = { kind: 'call', name: 'len', args: [{ kind: 'field_access', segments: ['items'], location: loc }], location: loc };
    expect(evaluateExpr(expr, outputs)).toBe(3);
  });

  it('max', () => {
    const expr: Expr = { kind: 'call', name: 'max', args: [
      { kind: 'literal', value: 3, location: loc },
      { kind: 'literal', value: 7, location: loc },
    ], location: loc };
    expect(evaluateExpr(expr, new Map())).toBe(7);
  });

  it('min', () => {
    const expr: Expr = { kind: 'call', name: 'min', args: [
      { kind: 'literal', value: 3, location: loc },
      { kind: 'literal', value: 7, location: loc },
    ], location: loc };
    expect(evaluateExpr(expr, new Map())).toBe(3);
  });

  it('str', () => {
    const outputs = new Map<string, unknown>([['obj', { a: 1 }]]);
    const expr: Expr = { kind: 'call', name: 'str', args: [{ kind: 'field_access', segments: ['obj'], location: loc }], location: loc };
    expect(evaluateExpr(expr, outputs)).toBe('{"a":1}');
  });

  it('abs', () => {
    const expr: Expr = { kind: 'call', name: 'abs', args: [{ kind: 'literal', value: -5, location: loc }], location: loc };
    expect(evaluateExpr(expr, new Map())).toBe(5);
  });

  it('round', () => {
    const expr: Expr = { kind: 'call', name: 'round', args: [{ kind: 'literal', value: 3.7, location: loc }], location: loc };
    expect(evaluateExpr(expr, new Map())).toBe(4);
  });

  it('keys', () => {
    const outputs = new Map<string, unknown>([['obj', { x: 1, y: 2 }]]);
    const expr: Expr = { kind: 'call', name: 'keys', args: [{ kind: 'field_access', segments: ['obj'], location: loc }], location: loc };
    const result = evaluateExpr(expr, outputs);
    expect(result).toEqual(['x', 'y']);
  });
});
