import { describe, it, expect } from 'vitest';
import { formatExpr } from '../src/format.js';
import { formatExpr as formatExprFromHover } from '../src/lsp/features/hover.js';
import { mkCond } from './helpers.js';
import { compileToProgram } from '../src/compiler.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── formatExpr extraction ──────────────────────────────────────────

describe('v5.0-R1: formatExpr lives in src/format.ts', () => {
  it('formatExpr is importable from src/format.ts', () => {
    expect(typeof formatExpr).toBe('function');
  });

  it('formatExpr re-exported from hover.ts is the same function', () => {
    expect(formatExprFromHover).toBe(formatExpr);
  });

  it('handles literal (number)', () => {
    expect(formatExpr({ kind: 'literal', value: 42, location: loc })).toBe('42');
  });

  it('handles literal (string)', () => {
    expect(formatExpr({ kind: 'literal', value: 'hello', location: loc })).toBe('"hello"');
  });

  it('handles literal (boolean)', () => {
    expect(formatExpr({ kind: 'literal', value: true, location: loc })).toBe('true');
  });

  it('handles field_access', () => {
    expect(formatExpr({ kind: 'field_access', segments: ['a', 'b', 'c'], location: loc })).toBe('a.b.c');
  });

  it('handles binary', () => {
    const expr: Expr = {
      kind: 'binary', op: '+',
      left: { kind: 'literal', value: 1, location: loc },
      right: { kind: 'literal', value: 2, location: loc },
      location: loc,
    };
    expect(formatExpr(expr)).toBe('1 + 2');
  });

  it('handles unary', () => {
    const expr: Expr = {
      kind: 'unary', op: '-',
      operand: { kind: 'literal', value: 5, location: loc },
      location: loc,
    };
    expect(formatExpr(expr)).toBe('-5');
  });

  it('handles group', () => {
    const expr: Expr = {
      kind: 'group',
      inner: { kind: 'literal', value: 3, location: loc },
      location: loc,
    };
    expect(formatExpr(expr)).toBe('(3)');
  });

  it('handles call', () => {
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{ kind: 'field_access', segments: ['x'], location: loc }],
      location: loc,
    };
    expect(formatExpr(expr)).toBe('len(x)');
  });

  it('handles template', () => {
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'hello ' },
        { kind: 'expr', value: { kind: 'field_access', segments: ['name'], location: loc } },
      ],
      location: loc,
    };
    expect(formatExpr(expr)).toBe('"hello ${name}"');
  });

  it('handles conditional', () => {
    const expr: Expr = {
      kind: 'conditional',
      condition: { kind: 'literal', value: true, location: loc },
      consequent: { kind: 'literal', value: 1, location: loc },
      alternate: { kind: 'literal', value: 0, location: loc },
      location: loc,
    };
    expect(formatExpr(expr)).toBe('if true then 1 else 0');
  });
});

// ── Condition → Expr AST unification ───────────────────────────────

describe('v5.0-R1: Condition interface removed, replaced by Expr', () => {
  it('mkCond() returns a binary Expr', () => {
    const cond = mkCond('score', '>=', 80);
    expect(cond.kind).toBe('binary');
    expect(cond).toMatchObject({
      kind: 'binary',
      op: '>=',
      left: { kind: 'field_access', segments: ['score'] },
      right: { kind: 'literal', value: 80 },
    });
  });

  it('ConditionalBranch.condition is now Expr (parsed from source)', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node R(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Decision { priority: Int }
      }
      node H(model: sonnet, budget: 2k/1k) {
        reads: [Decision]
        produces Out { text: String }
      }
      edge R -> {
        when priority >= 5 -> H
        else -> H
      }
      graph G(input: Input, output: Out, budget: 10k) {
        R -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.program).toBeDefined();
    const edge = result.program!.edges.find(e => e.source === 'R');
    expect(edge).toBeDefined();
    expect(edge!.target.kind).toBe('conditional');
    if (edge!.target.kind === 'conditional') {
      const branch = edge!.target.branches[0];
      expect(branch.condition).toBeDefined();
      expect(branch.condition!.kind).toBe('binary');
      if (branch.condition!.kind === 'binary') {
        expect(branch.condition!.op).toBe('>=');
        expect(branch.condition!.left).toMatchObject({ kind: 'field_access', segments: ['priority'] });
        expect(branch.condition!.right).toMatchObject({ kind: 'literal', value: 5 });
      }
    }
  });

  it('Transform filter condition is Expr (parsed from source)', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Out { score: Int label: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [Out]
        produces Final { text: String }
      }
      edge A -> B | filter(score, score >= 5)
      graph G(input: Input, output: Final, budget: 10k) {
        A -> B -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.program).toBeDefined();
    const edge = result.program!.edges.find(e => e.source === 'A');
    expect(edge).toBeDefined();
    const filter = edge!.transforms.find(t => t.type === 'filter');
    expect(filter).toBeDefined();
    if (filter && filter.type === 'filter') {
      expect(filter.condition.kind).toBe('binary');
      if (filter.condition.kind === 'binary') {
        expect(filter.condition.op).toBe('>=');
        expect(filter.condition.left).toMatchObject({ kind: 'field_access', segments: ['score'] });
        expect(filter.condition.right).toMatchObject({ kind: 'literal', value: 5 });
      }
    }
  });
});

// ── conditionFieldName removed ─────────────────────────────────────

describe('v5.0-R1: conditionFieldName removed', () => {
  it('conditionFieldName is no longer exported from ast.ts', async () => {
    const ast = await import('../src/parser/ast.js');
    expect('conditionFieldName' in ast).toBe(false);
  });

  it('Condition interface is no longer exported from ast.ts', async () => {
    const ast = await import('../src/parser/ast.js');
    expect('Condition' in ast).toBe(false);
  });
});

// ── Type checker works through Expr path ───────────────────────────

describe('v5.0-R1: Type checker validates conditions via Expr', () => {
  it('TYPE_CONDITION_MISMATCH on ordered comparison with String field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node R(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Decision { label: String }
      }
      node H(model: sonnet, budget: 2k/1k) {
        reads: [Decision]
        produces Out { text: String }
      }
      edge R -> {
        when label >= "high" -> H
        else -> H
      }
      graph G(input: Input, output: Out, budget: 10k) {
        R -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    const condErr = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condErr).toBeDefined();
    expect(condErr!.message).toContain('label');
    expect(condErr!.message).toContain('>=');
  });

  it('no TYPE_CONDITION_MISMATCH on == with String field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node R(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Decision { label: String }
      }
      node H(model: sonnet, budget: 2k/1k) {
        reads: [Decision]
        produces Out { text: String }
      }
      edge R -> {
        when label == "high" -> H
        else -> H
      }
      graph G(input: Input, output: Out, budget: 10k) {
        R -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    const condErr = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condErr).toBeUndefined();
  });

  it('no TYPE_CONDITION_MISMATCH on >= with Int field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node R(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Decision { score: Int }
      }
      node H(model: sonnet, budget: 2k/1k) {
        reads: [Decision]
        produces Out { text: String }
      }
      edge R -> {
        when score >= 5 -> H
        else -> H
      }
      graph G(input: Input, output: Out, budget: 10k) {
        R -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    const condErr = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condErr).toBeUndefined();
  });
});

// ── Scope checker validates condition field via Expr ────────────────

describe('v5.0-R1: Scope checker condition field validation', () => {
  it('programs with valid condition fields compile cleanly', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node R(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Decision { score: Int label: String }
      }
      node A(model: haiku, budget: 1k/500) {
        reads: [Decision]
        produces Out { text: String }
      }
      edge R -> {
        when score >= 8 -> A
        else -> A
      }
      graph G(input: Input, output: Out, budget: 10k) {
        R -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });
});
