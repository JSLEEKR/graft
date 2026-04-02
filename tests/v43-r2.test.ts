import { describe, it, expect } from 'vitest';
import { evaluateExpr, resolveNestedField } from '../src/runtime/flow-runner.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── str() JSON.stringify improvement ─────────────────────────────

describe('str() JSON.stringify improvement', () => {
  it('str() on object returns JSON string', () => {
    const outputs = new Map<string, unknown>([['data', { a: 1, b: 2 }]]);
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'field_access', segments: ['data'], location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('{"a":1,"b":2}');
  });

  it('str() on array returns JSON string', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'field_access', segments: ['items'], location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('[1,2,3]');
  });

  it('str() on number still works', () => {
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'literal', value: 42, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('42');
    var outputs = new Map<string, unknown>();
  });

  it('str() on null returns "null"', () => {
    const outputs = new Map<string, unknown>([['val', null]]);
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'field_access', segments: ['val'], location: loc }],
      location: loc,
    };
    // null is technically an object in JS, but JSON.stringify(null) = "null"
    expect(evaluateExpr(expr, outputs)).toBe('null');
  });
});

// ── resolveNestedField still exported from flow-runner ────────────

describe('resolveNestedField accessibility', () => {
  it('resolveNestedField is importable and works', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(resolveNestedField(['a', 'b', 'c'], obj)).toBe(42);
  });
});

// ── Precedence: division now at multiplicative level ─────────────

describe('Division at multiplicative precedence', () => {
  it('2 + 6 / 3 = 4 (division before addition)', () => {
    // Previously division was at additive level, now at multiplicative
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 2, location: loc },
      right: {
        kind: 'binary', op: '/',
        left: { kind: 'literal', value: 6, location: loc },
        right: { kind: 'literal', value: 3, location: loc },
        location: loc,
      },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(4);
  });
});
