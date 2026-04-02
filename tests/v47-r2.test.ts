import { describe, it, expect } from 'vitest';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Runtime: expression edge cases & hardening ─────────────────

describe('Runtime: expression edge cases', () => {
  it('field access on undefined source returns undefined', () => {
    const expr: Expr = {
      kind: 'field_access', segments: ['missing', 'field'], location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBeUndefined();
  });

  it('nested field access on null returns undefined', () => {
    const outputs = new Map<string, unknown>([['obj', null]]);
    const expr: Expr = {
      kind: 'field_access', segments: ['obj', 'nested'], location: loc,
    };
    expect(evaluateExpr(expr, new Map([['obj', null]]))).toBeUndefined();
  });

  it('division by zero returns 0 with warning', () => {
    const warnings: string[] = [];
    const expr: Expr = {
      kind: 'binary', op: '/',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map(), undefined, warnings)).toBe(0);
    expect(warnings).toContain('division by zero in expression');
  });

  it('modulo by zero returns 0 with warning', () => {
    const warnings: string[] = [];
    const expr: Expr = {
      kind: 'binary', op: '%',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map(), undefined, warnings)).toBe(0);
    expect(warnings).toContain('division by zero in expression');
  });

  it('?? with null field and complex default', () => {
    const outputs = new Map<string, unknown>();
    const expr: Expr = {
      kind: 'binary', op: '??' as any,
      left: { kind: 'field_access', segments: ['missing'], location: loc },
      right: {
        kind: 'binary', op: '+',
        left: { kind: 'literal', value: 10, location: loc },
        right: { kind: 'literal', value: 20, location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(30);
  });

  it('conditional with ?? in condition', () => {
    const outputs = new Map<string, unknown>();
    const expr: Expr = {
      kind: 'conditional',
      condition: {
        kind: 'binary', op: '??' as any,
        left: { kind: 'field_access', segments: ['flag'], location: loc },
        right: { kind: 'literal', value: false, location: loc },
        location: loc,
      },
      consequent: { kind: 'literal', value: 'yes', location: loc },
      alternate: { kind: 'literal', value: 'no', location: loc },
      location: loc,
    };
    // flag is undefined → ?? returns false → falsy → alternate
    expect(evaluateExpr(expr, outputs)).toBe('no');
  });

  it('template with undefined interpolation produces "undefined"', () => {
    const outputs = new Map<string, unknown>();
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Hello ' },
        { kind: 'expr', value: { kind: 'field_access', segments: ['name'], location: loc } },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Hello undefined');
  });

  it('variables take priority over outputs in field access', () => {
    const outputs = new Map<string, unknown>([['x', 'from-output']]);
    const variables = new Map<string, unknown>([['x', 'from-variable']]);
    const expr: Expr = {
      kind: 'field_access', segments: ['x'], location: loc,
    };
    expect(evaluateExpr(expr, outputs, variables)).toBe('from-variable');
  });
});
