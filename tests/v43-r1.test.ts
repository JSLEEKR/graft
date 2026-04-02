import { describe, it, expect } from 'vitest';
import { evaluateExpr } from '../src/runtime/flow-runner.js';
import { compile, compileToProgram } from '../src/compiler.js';
import { Parser } from '../src/parser/parser.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function parseExprFrom(source: string): Expr {
  const full = `
    context In(max_tokens: 500) { data: String }
    node A(model: sonnet, budget: 2k/1k) {
      reads: [In]
      produces Out { result: String }
    }
    graph G(input: In, output: Out, budget: 5k) {
      A -> let x = ${source} -> done
    }
  `;
  const tokens = new Lexer(full).tokenize();
  const { program } = new Parser(tokens).parse();
  const letNode = program.graphs[0].flow.find(f => f.kind === 'let');
  if (!letNode || letNode.kind !== 'let') throw new Error('No let node found');
  return letNode.value;
}

// ── Parse: multiplication and modulo ─────────────────────────────

describe('Parse: multiplication and modulo operators', () => {
  it('parses a * b as binary expression', () => {
    const expr = parseExprFrom('3 * 4');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('*');
    }
  });

  it('parses a % b as binary expression', () => {
    const expr = parseExprFrom('10 % 3');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('%');
    }
  });

  it('multiplication has higher precedence than addition', () => {
    // 2 + 3 * 4 should parse as 2 + (3 * 4)
    const expr = parseExprFrom('2 + 3 * 4');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('+');
      expect(expr.right.kind).toBe('binary');
      if (expr.right.kind === 'binary') {
        expect(expr.right.op).toBe('*');
      }
    }
  });

  it('modulo has same precedence as multiplication', () => {
    // 10 % 3 * 2 should parse left-to-right: (10 % 3) * 2
    const expr = parseExprFrom('10 % 3 * 2');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('*');
      expect(expr.left.kind).toBe('binary');
      if (expr.left.kind === 'binary') {
        expect(expr.left.op).toBe('%');
      }
    }
  });
});

// ── Evaluate: multiplication and modulo ──────────────────────────

describe('Evaluate: multiplication and modulo', () => {
  it('multiplication returns correct result', () => {
    const expr: Expr = {
      kind: 'binary', op: '*',
      left: { kind: 'literal', value: 6, location: loc },
      right: { kind: 'literal', value: 7, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(42);
  });

  it('modulo returns correct result', () => {
    const expr: Expr = {
      kind: 'binary', op: '%',
      left: { kind: 'literal', value: 10, location: loc },
      right: { kind: 'literal', value: 3, location: loc },
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(1);
  });

  it('modulo by zero warns and returns 0', () => {
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
});

// ── Parse + Evaluate: new builtins ───────────────────────────────

describe('New builtin functions', () => {
  it('abs(-5) returns 5', () => {
    const expr: Expr = {
      kind: 'call', name: 'abs',
      args: [{ kind: 'literal', value: -5, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(5);
  });

  it('round(3.7) returns 4', () => {
    const expr: Expr = {
      kind: 'call', name: 'round',
      args: [{ kind: 'literal', value: 3.7, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(4);
  });

  it('round(3.2) returns 3', () => {
    const expr: Expr = {
      kind: 'call', name: 'round',
      args: [{ kind: 'literal', value: 3.2, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(3);
  });

  it('keys() returns object keys', () => {
    const outputs = new Map<string, unknown>([['A', { x: 1, y: 2, z: 3 }]]);
    const expr: Expr = {
      kind: 'call', name: 'keys',
      args: [{ kind: 'field_access', segments: ['A'], location: loc }],
      location: loc,
    };
    const result = evaluateExpr(expr, outputs);
    expect(result).toEqual(['x', 'y', 'z']);
  });

  it('len(keys(obj)) composition works', () => {
    const outputs = new Map<string, unknown>([['A', { x: 1, y: 2 }]]);
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{
        kind: 'call', name: 'keys',
        args: [{ kind: 'field_access', segments: ['A'], location: loc }],
        location: loc,
      }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(2);
  });

  it('parses abs() in source', () => {
    const expr = parseExprFrom('abs(-5)');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('abs');
    }
  });
});

// ── Integration: pipeline with new operators + builtins ──────────

describe('Integration: pipeline with * and %', () => {
  it('pipeline with multiplication compiles', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { count: Int }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let doubled = A.count * 2 -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('pipeline with modulo and abs compiles', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { score: Int }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let remainder = A.score % 10 -> let positive = abs(A.score) -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
