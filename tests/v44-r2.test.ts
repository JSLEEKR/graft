import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';
import { Expr } from '../src/parser/ast.js';
import { evaluateExpr } from '../src/runtime/expr-eval.js';
import { compile } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

// ── Lexer: template strings ────────────────────────────────────

describe('Lexer: template string tokens', () => {
  it('string without interpolation remains StringLiteral', () => {
    const tokens = new Lexer('"hello world"', 'test.gft').tokenize();
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe('hello world');
  });

  it('string with ${} produces TemplateString token', () => {
    const tokens = new Lexer('"hello ${name}"', 'test.gft').tokenize();
    expect(tokens[0].type).toBe(TokenType.TemplateString);
    expect(tokens[0].value).toBe('hello ${name}');
  });

  it('string with escaped \\${ remains StringLiteral', () => {
    const tokens = new Lexer('"hello \\${name}"', 'test.gft').tokenize();
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe('hello ${name}');
  });

  it('multiple interpolations produce TemplateString', () => {
    const tokens = new Lexer('"${a} and ${b}"', 'test.gft').tokenize();
    expect(tokens[0].type).toBe(TokenType.TemplateString);
  });
});

// ── Parser: template expressions ────────────────────────────────

describe('Parser: template expressions', () => {
  function parseExprFromLet(source: string): Expr {
    const fullSource = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { name: String }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let x = ${source} -> done
      }
    `;
    const result = compile(fullSource, 'test.gft');
    if (!result.success) throw new Error(result.errors.map(e => e.message).join(', '));
    const graph = result.program!.graphs[0];
    const letNode = graph.flow.find(f => f.kind === 'let');
    if (!letNode || letNode.kind !== 'let') throw new Error('No let node found');
    return letNode.value;
  }

  it('simple template parses to template expr', () => {
    const expr = parseExprFromLet('"hello ${A.name}"');
    expect(expr.kind).toBe('template');
    if (expr.kind === 'template') {
      expect(expr.parts).toHaveLength(2);
      expect(expr.parts[0]).toEqual({ kind: 'text', value: 'hello ' });
      expect(expr.parts[1].kind).toBe('expr');
    }
  });

  it('template with multiple interpolations', () => {
    const expr = parseExprFromLet('"${A.name} scored ${A.name}"');
    expect(expr.kind).toBe('template');
    if (expr.kind === 'template') {
      expect(expr.parts).toHaveLength(3);
      expect(expr.parts[0].kind).toBe('expr');
      expect(expr.parts[1]).toEqual({ kind: 'text', value: ' scored ' });
      expect(expr.parts[2].kind).toBe('expr');
    }
  });

  it('template with expression inside interpolation', () => {
    const fullSource = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    name: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let x = "result: ${A.score * 2}" -> done',
      '}',
    ].join('\n');
    const result = compile(fullSource, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('template with function call inside interpolation', () => {
    const fullSource = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { items: List<String> }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let x = "count: ${len(A.items)}" -> done',
      '}',
    ].join('\n');
    const result = compile(fullSource, 'test.gft');
    expect(result.success).toBe(true);
  });

  it('plain string without interpolation stays as literal', () => {
    const expr = parseExprFromLet('"hello world"');
    expect(expr.kind).toBe('literal');
    expect((expr as any).value).toBe('hello world');
  });
});

// ── Runtime: template evaluation ────────────────────────────────

describe('Runtime: template evaluation', () => {
  it('simple substitution', () => {
    const outputs = new Map<string, unknown>([['name', 'Alice']]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Hello, ' },
        { kind: 'expr', value: { kind: 'field_access', segments: ['name'], location: loc } },
        { kind: 'text', value: '!' },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Hello, Alice!');
  });

  it('numeric auto-conversion', () => {
    const outputs = new Map<string, unknown>([['score', 42]]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Score: ' },
        { kind: 'expr', value: { kind: 'field_access', segments: ['score'], location: loc } },
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Score: 42');
  });

  it('expression inside template', () => {
    const outputs = new Map<string, unknown>();
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Result: ' },
        { kind: 'expr', value: {
          kind: 'binary', op: '+',
          left: { kind: 'literal', value: 3, location: loc },
          right: { kind: 'literal', value: 4, location: loc },
          location: loc,
        }},
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Result: 7');
  });

  it('function call inside template', () => {
    const outputs = new Map<string, unknown>([['items', [1, 2, 3]]]);
    const expr: Expr = {
      kind: 'template',
      parts: [
        { kind: 'text', value: 'Count: ' },
        { kind: 'expr', value: {
          kind: 'call', name: 'len',
          args: [{ kind: 'field_access', segments: ['items'], location: loc }],
          location: loc,
        }},
      ],
      location: loc,
    };
    expect(evaluateExpr(expr, outputs)).toBe('Count: 3');
  });

  it('empty template parts produce empty string', () => {
    const expr: Expr = {
      kind: 'template',
      parts: [],
      location: loc,
    };
    expect(evaluateExpr(expr, new Map())).toBe('');
  });
});

// ── Type checker: template type inference ───────────────────────

describe('Type checker: template expressions', () => {
  it('template infers to string type', () => {
    const source = `
      context In(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [In]
        produces Out { score: Int }
      }
      graph G(input: In, output: Out, budget: 5k) {
        A -> let msg = "Score: \${A.score}" -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
