import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { evaluateCondition } from '../src/runtime/flow-runner.js';
import { evalCondition } from '../src/runtime/transforms.js';
import { Condition } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function mkMultiCond(segments: string[], op: Condition['op'], value: string | number | boolean): Condition {
  return {
    left: { kind: 'field_access', segments, location: loc },
    op,
    value,
  };
}

// ── evaluateCondition: multi-segment LHS ────────────────────────────

describe('evaluateCondition — multi-segment LHS', () => {
  it('2-segment: resolves nested field from output', () => {
    const cond = mkMultiCond(['result', 'score'], '>=', 80);
    expect(evaluateCondition(cond, { result: { score: 85 } })).toBe(true);
    expect(evaluateCondition(cond, { result: { score: 50 } })).toBe(false);
  });

  it('3-segment: resolves deeply nested field', () => {
    const cond = mkMultiCond(['data', 'meta', 'status'], '==', 'done');
    expect(evaluateCondition(cond, { data: { meta: { status: 'done' } } })).toBe(true);
    expect(evaluateCondition(cond, { data: { meta: { status: 'pending' } } })).toBe(false);
  });

  it('multi-segment with undefined intermediate returns false for ==', () => {
    const cond = mkMultiCond(['missing', 'field'], '==', 'x');
    expect(evaluateCondition(cond, {})).toBe(false);
  });

  it('multi-segment with undefined intermediate returns true for !=', () => {
    const cond = mkMultiCond(['missing', 'field'], '!=', 'x');
    expect(evaluateCondition(cond, {})).toBe(true);
  });

  it('multi-segment with null intermediate returns false for ==', () => {
    const cond = mkMultiCond(['data', 'value'], '>=', 5);
    expect(evaluateCondition(cond, { data: null })).toBe(false);
  });
});

// ── evaluateCondition: single-segment backward compat ───────────────

describe('evaluateCondition — single-segment backward compat', () => {
  it('single-segment still works (string ==)', () => {
    expect(evaluateCondition(mkCond('status', '==', 'done'), { status: 'done' })).toBe(true);
  });

  it('single-segment still works (numeric >=)', () => {
    expect(evaluateCondition(mkCond('score', '>=', 70), { score: 80 })).toBe(true);
  });

  it('single-segment with variables still resolves variable first', () => {
    const vars = new Map<string, unknown>([['score', 95]]);
    expect(evaluateCondition(mkCond('score', '>=', 90), { score: 10 }, vars)).toBe(true);
  });
});

// ── evalCondition (transforms.ts): multi-segment LHS ────────────────

describe('evalCondition (transforms) — multi-segment LHS', () => {
  it('2-segment: resolves nested field from item', () => {
    const cond = mkMultiCond(['meta', 'priority'], '>=', 5);
    expect(evalCondition({ meta: { priority: 8 } }, cond)).toBe(true);
    expect(evalCondition({ meta: { priority: 2 } }, cond)).toBe(false);
  });

  it('single-segment backward compat', () => {
    const cond = mkCond('severity', '==', 'high');
    expect(evalCondition({ severity: 'high' }, cond)).toBe(true);
    expect(evalCondition({ severity: 'low' }, cond)).toBe(false);
  });

  it('multi-segment with missing intermediate returns false', () => {
    const cond = mkMultiCond(['deep', 'field'], '==', 'x');
    expect(evalCondition({ other: 1 }, cond)).toBe(false);
  });
});
