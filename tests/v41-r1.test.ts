import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateExpr } from '../src/runtime/flow-runner.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function mkMultiCond(segments: string[], op: '<' | '>' | '<=' | '>=' | '==' | '!=', value: string | number | boolean): Expr {
  return {
    kind: 'binary',
    op,
    left: { kind: 'field_access', segments, location: loc },
    right: { kind: 'literal', value, location: loc },
    location: loc,
  };
}

// ── evaluateCondition: multi-segment LHS ────────────────────────────

describe('evaluateExpr — multi-segment LHS', () => {
  it('2-segment: resolves nested field from output', () => {
    const cond = mkMultiCond(['result', 'score'], '>=', 80);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ result: { score: 85 } })))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ result: { score: 50 } })))).toBe(false);
  });

  it('3-segment: resolves deeply nested field', () => {
    const cond = mkMultiCond(['data', 'meta', 'status'], '==', 'done');
    expect(!!evaluateExpr(cond, new Map(Object.entries({ data: { meta: { status: 'done' } } })))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ data: { meta: { status: 'pending' } } })))).toBe(false);
  });

  it('multi-segment with undefined intermediate returns false for ==', () => {
    const cond = mkMultiCond(['missing', 'field'], '==', 'x');
    expect(!!evaluateExpr(cond, new Map(Object.entries({})))).toBe(false);
  });

  it('multi-segment with undefined intermediate returns true for !=', () => {
    const cond = mkMultiCond(['missing', 'field'], '!=', 'x');
    expect(!!evaluateExpr(cond, new Map(Object.entries({})))).toBe(true);
  });

  it('multi-segment with null intermediate returns false for ==', () => {
    const cond = mkMultiCond(['data', 'value'], '>=', 5);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ data: null })))).toBe(false);
  });
});

// ── evaluateCondition: single-segment backward compat ───────────────

describe('evaluateExpr — single-segment backward compat', () => {
  it('single-segment still works (string ==)', () => {
    expect(!!evaluateExpr(mkCond('status', '==', 'done'), new Map(Object.entries({ status: 'done' })))).toBe(true);
  });

  it('single-segment still works (numeric >=)', () => {
    expect(!!evaluateExpr(mkCond('score', '>=', 70), new Map(Object.entries({ score: 80 })))).toBe(true);
  });

  it('single-segment with variables still resolves variable first', () => {
    const vars = new Map<string, unknown>([['score', 95]]);
    expect(!!evaluateExpr(mkCond('score', '>=', 90), new Map(Object.entries({ score: 10 })), vars)).toBe(true);
  });
});

// ── evalCondition (transforms.ts): multi-segment LHS ────────────────

describe('evaluateExpr (transforms replacement) — multi-segment LHS', () => {
  it('2-segment: resolves nested field from item', () => {
    const cond = mkMultiCond(['meta', 'priority'], '>=', 5);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ meta: { priority: 8 } } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ meta: { priority: 2 } } as Record<string, unknown>)))).toBe(false);
  });

  it('single-segment backward compat', () => {
    const cond = mkCond('severity', '==', 'high');
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 'high' } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 'low' } as Record<string, unknown>)))).toBe(false);
  });

  it('multi-segment with missing intermediate returns false', () => {
    const cond = mkMultiCond(['deep', 'field'], '==', 'x');
    expect(!!evaluateExpr(cond, new Map(Object.entries({ other: 1 } as Record<string, unknown>)))).toBe(false);
  });
});
