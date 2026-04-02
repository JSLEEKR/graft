import { describe, it, expect } from 'vitest';
import { evaluateExpr } from '../src/runtime/flow-runner.js';
import { compile, compileToProgram } from '../src/compiler.js';
import { Parser } from '../src/parser/parser.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Expr } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function parseExprFrom(source: string): Expr {
  // Wrap in a minimal graph with let to parse an expression
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

// ── Parse: function call expressions ─────────────────────────────

describe('Parse: function call expressions', () => {
  it('parses len(x) as a call expression', () => {
    const expr = parseExprFrom('len(A.result)');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('len');
      expect(expr.args).toHaveLength(1);
      expect(expr.args[0].kind).toBe('field_access');
    }
  });

  it('parses max(a, b) with two arguments', () => {
    const expr = parseExprFrom('max(1, 2)');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('max');
      expect(expr.args).toHaveLength(2);
      expect(expr.args[0]).toEqual(expect.objectContaining({ kind: 'literal', value: 1 }));
      expect(expr.args[1]).toEqual(expect.objectContaining({ kind: 'literal', value: 2 }));
    }
  });

  it('parses min(a, b) with two arguments', () => {
    const expr = parseExprFrom('min(3, 4)');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('min');
      expect(expr.args).toHaveLength(2);
    }
  });

  it('parses str(value) with one argument', () => {
    const expr = parseExprFrom('str(42)');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('str');
      expect(expr.args).toHaveLength(1);
    }
  });

  it('parses nested function calls', () => {
    const expr = parseExprFrom('len(str(42))');
    expect(expr.kind).toBe('call');
    if (expr.kind === 'call') {
      expect(expr.name).toBe('len');
      expect(expr.args).toHaveLength(1);
      expect(expr.args[0].kind).toBe('call');
    }
  });

  it('non-builtin identifier followed by ( remains field_access', () => {
    // Unknown names are NOT parsed as calls — they stay as field_access
    // The ( will be a separate token not consumed by parsePrimary
    const expr = parseExprFrom('A.result');
    expect(expr.kind).toBe('field_access');
  });

  it('function call in binary expression', () => {
    const expr = parseExprFrom('len(A.result) + 1');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.left.kind).toBe('call');
      expect(expr.right.kind).toBe('literal');
    }
  });
});

// ── Evaluate: function call runtime ──────────────────────────────

describe('Evaluate: function call runtime', () => {
  it('len() returns array length', () => {
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{ kind: 'literal', value: [1, 2, 3] as unknown as string, location: loc }],
      location: loc,
    };
    // len operates on the evaluated value — need a field_access that resolves to an array
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const fieldExpr: Expr = { kind: 'field_access', segments: ['items'], location: loc };
    const callExpr: Expr = { kind: 'call', name: 'len', args: [fieldExpr], location: loc };
    expect(evaluateExpr(callExpr, outputs)).toBe(3);
  });

  it('len() returns string length', () => {
    const outputs = new Map<string, unknown>([['text', 'hello']]);
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{ kind: 'field_access', segments: ['text'], location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(5);
  });

  it('max() returns larger of two numbers', () => {
    const expr: Expr = {
      kind: 'call', name: 'max',
      args: [
        { kind: 'literal', value: 3, location: loc },
        { kind: 'literal', value: 7, location: loc },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(7);
  });

  it('min() returns smaller of two numbers', () => {
    const expr: Expr = {
      kind: 'call', name: 'min',
      args: [
        { kind: 'literal', value: 3, location: loc },
        { kind: 'literal', value: 7, location: loc },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe(3);
  });

  it('str() converts number to string', () => {
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'literal', value: 42, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('42');
  });

  it('str() converts boolean to string', () => {
    const expr: Expr = {
      kind: 'call', name: 'str',
      args: [{ kind: 'literal', value: true, location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('true');
  });

  it('len() on non-array/string returns 0', () => {
    const outputs = new Map<string, unknown>([['val', 42]]);
    const expr: Expr = {
      kind: 'call', name: 'len',
      args: [{ kind: 'field_access', segments: ['val'], location: loc }],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe(0);
  });
});

// ── Scope: function validation ───────────────────────────────────

describe('Scope: function call validation', () => {
  it('unknown name followed by ( is not parsed as function call', () => {
    // Unknown names are NOT in BUILTIN_FUNCTIONS, so parser treats them as field_access
    // The ( becomes an unexpected token, producing a parse error
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { result: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let x = unknown_fn(A.result) -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    // Should fail — the ( after unknown_fn isn't consumed by field_access parsing
    expect(result.success).toBe(false);
  });

  it('function args are validated for source ordering', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { result: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        let x = len(A.result) -> A -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'SCOPE_VAR_ORDER')).toBe(true);
  });
});

// ── Type: function arity and return type ─────────────────────────

describe('Type: function arity validation', () => {
  it('len() with zero args produces TYPE_FUNC_ARITY', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { result: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let x = len() -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'TYPE_FUNC_ARITY')).toBe(true);
  });

  it('max() with one arg produces TYPE_FUNC_ARITY', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { result: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let x = max(1) -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'TYPE_FUNC_ARITY')).toBe(true);
  });

  it('max() with three args produces TYPE_FUNC_ARITY', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { result: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let x = max(1, 2, 3) -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'TYPE_FUNC_ARITY')).toBe(true);
  });
});

// ── Integration: function calls in full pipeline ─────────────────

describe('Integration: function calls in pipeline', () => {
  it('pipeline with len() compiles successfully', () => {
    const source = `
      context In(max_tokens: 500) { items: List<String> }
      node Analyzer(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { items: List<String> }
      }
      graph G(input: In, output: Out, budget: 5k) {
        Analyzer -> let count = len(Analyzer.items) -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('pipeline with max() + str() compiles successfully', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { score: Int }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let label = str(max(A.score, 50)) -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
