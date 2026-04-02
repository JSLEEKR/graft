import { describe, it, expect } from 'vitest';
import { evaluateExpr as evalFromExprEval, resolveNestedField as resolveFromExprEval } from '../src/runtime/expr-eval.js';
import { evaluateExpr as evalFromFlowRunner, resolveNestedField as resolveFromFlowRunner } from '../src/runtime/flow-runner.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Re-export compatibility ─────────────────────────────────────

describe('expr-eval.ts re-export compatibility', () => {
  it('evaluateExpr importable from expr-eval.ts', () => {
    expect(typeof evalFromExprEval).toBe('function');
  });

  it('evaluateExpr importable from flow-runner.ts (re-export)', () => {
    expect(typeof evalFromFlowRunner).toBe('function');
  });

  it('resolveNestedField importable from expr-eval.ts', () => {
    expect(typeof resolveFromExprEval).toBe('function');
  });

  it('resolveNestedField importable from flow-runner.ts (re-export)', () => {
    expect(typeof resolveFromFlowRunner).toBe('function');
  });

  it('evaluateExpr from both sources is the same function', () => {
    expect(evalFromExprEval).toBe(evalFromFlowRunner);
  });

  it('resolveNestedField from both sources is the same function', () => {
    expect(resolveFromExprEval).toBe(resolveFromFlowRunner);
  });
});

// ── Smoke tests via expr-eval.ts ────────────────────────────────

describe('evaluateExpr from expr-eval.ts (smoke)', () => {
  it('literal evaluation', () => {
    const expr: Expr = { kind: 'literal', value: 42, location: loc };
    expect(evalFromExprEval(expr, new Map())).toBe(42);
  });

  it('binary addition', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 3, location: loc },
      right: { kind: 'literal', value: 4, location: loc },
      location: loc,
    };
    expect(evalFromExprEval(expr, new Map())).toBe(7);
  });

  it('function call (len)', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{ kind: 'field_access', segments: ['items'], location: loc }],
      location: loc,
    };
    expect(evalFromExprEval(expr, outputs)).toBe(3);
  });

  it('field access with variables', () => {
    const vars = new Map<string, unknown>([['x', 99]]);
    const expr: Expr = { kind: 'field_access', segments: ['x'], location: loc };
    expect(evalFromExprEval(expr, new Map(), vars)).toBe(99);
  });
});

describe('resolveNestedField from expr-eval.ts (smoke)', () => {
  it('resolves nested path', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(resolveFromExprEval(['a', 'b', 'c'], obj)).toBe(42);
  });
});
