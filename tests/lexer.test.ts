import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';
import { GraftError } from '../src/errors/diagnostics.js';

describe('Lexer', () => {
  // --- Keywords ---

  it('tokenizes keywords', () => {
    const tokens = new Lexer('node edge graph context').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Edge, TokenType.Graph, TokenType.Context, TokenType.EOF,
    ]);
  });

  it('tokenizes type keywords', () => {
    const tokens = new Lexer('String Int Float Bool List Map Optional').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.String, TokenType.Int, TokenType.Float, TokenType.Bool,
      TokenType.List, TokenType.Map, TokenType.Optional, TokenType.EOF,
    ]);
  });

  it('handles snake_case keywords', () => {
    const tokens = new Lexer('on_failure max_tokens').tokenize();
    expect(tokens[0].type).toBe(TokenType.OnFailure);
    expect(tokens[1].type).toBe(TokenType.MaxTokens);
  });

  it('tokenizes parallel keyword', () => {
    const tokens = new Lexer('parallel').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Parallel, value: 'parallel' });
  });

  it('tokenizes foreach keyword', () => {
    const tokens = new Lexer('foreach').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Foreach, value: 'foreach' });
  });

  it('tokenizes as keyword', () => {
    const tokens = new Lexer('as').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.As, value: 'as' });
  });

  it('tokenizes max_iterations keyword', () => {
    const tokens = new Lexer('max_iterations').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.MaxIterations, value: 'max_iterations' });
  });

  // --- Identifiers ---

  it('tokenizes identifiers', () => {
    const tokens = new Lexer('Analyzer risk_score').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'Analyzer' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: 'risk_score' });
  });

  it('does not treat keyword prefix as keyword', () => {
    const tokens = new Lexer('nodeType edgeCase').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'nodeType' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: 'edgeCase' });
  });

  // --- Literals ---

  it('tokenizes integer literals', () => {
    const tokens = new Lexer('42').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.IntegerLiteral, value: '42' });
  });

  it('tokenizes k-suffix integers', () => {
    const tokens = new Lexer('4k').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.KIntegerLiteral, value: '4k' });
  });

  it('tokenizes float literals', () => {
    const tokens = new Lexer('0.7').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.FloatLiteral, value: '0.7' });
  });

  it('tokenizes string literals', () => {
    const tokens = new Lexer('"hello world"').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.StringLiteral, value: 'hello world' });
  });

  it('handles empty string literal', () => {
    const tokens = new Lexer('""').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.StringLiteral, value: '' });
  });

  // --- Symbols ---

  it('tokenizes all symbols', () => {
    const tokens = new Lexer('{ } ( ) [ ] : , . -> | / .. >= > <= < == !=').tokenize();
    const types = tokens.slice(0, -1).map(t => t.type);
    expect(types).toEqual([
      TokenType.LBrace, TokenType.RBrace,
      TokenType.LParen, TokenType.RParen,
      TokenType.LBracket, TokenType.RBracket,
      TokenType.Colon, TokenType.Comma, TokenType.Dot,
      TokenType.Arrow, TokenType.Pipe, TokenType.Slash,
      TokenType.DotDot,
      TokenType.GreaterEqual, TokenType.Greater,
      TokenType.LessEqual, TokenType.Less,
      TokenType.EqualEqual, TokenType.BangEqual,
    ]);
  });

  // --- Comments ---

  it('skips single-line comments', () => {
    const tokens = new Lexer('node // comment\nedge').tokenize();
    expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
  });

  it('skips multi-line comments', () => {
    const tokens = new Lexer('node /* skip\nthis */ edge').tokenize();
    expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
  });

  // --- Source locations ---

  it('tracks source locations', () => {
    const tokens = new Lexer('node\n  edge').tokenize();
    expect(tokens[0].location).toEqual({ line: 1, column: 1, offset: 0 });
    expect(tokens[1].location).toEqual({ line: 2, column: 3, offset: 7 });
  });

  // --- Compound expressions ---

  it('tokenizes a node declaration', () => {
    const tokens = new Lexer('node Analyzer(model: sonnet, budget: 5k/2k) {').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Identifier,
      TokenType.LParen,
      TokenType.Model, TokenType.Colon, TokenType.Identifier, TokenType.Comma,
      TokenType.Budget, TokenType.Colon, TokenType.KIntegerLiteral,
      TokenType.Slash, TokenType.KIntegerLiteral,
      TokenType.RParen, TokenType.LBrace, TokenType.EOF,
    ]);
  });

  it('handles Float(0..1) pattern from spec', () => {
    const tokens = new Lexer('Float(0..1)').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Float, TokenType.LParen,
      TokenType.IntegerLiteral, TokenType.DotDot, TokenType.IntegerLiteral,
      TokenType.RParen, TokenType.EOF,
    ]);
  });

  // --- Edge cases: numbers ---

  it('does not treat integer followed by dot-non-digit as float', () => {
    const tokens = new Lexer('42.}').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.IntegerLiteral, value: '42' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Dot, value: '.' });
    expect(tokens[2]).toMatchObject({ type: TokenType.RBrace, value: '}' });
  });

  it('handles leading-dot as Dot + Integer, not float', () => {
    const tokens = new Lexer('.5').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Dot });
    expect(tokens[1]).toMatchObject({ type: TokenType.IntegerLiteral, value: '5' });
  });

  it('correctly lexes range expression 0..1', () => {
    const tokens = new Lexer('0..1').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.IntegerLiteral, TokenType.DotDot, TokenType.IntegerLiteral, TokenType.EOF,
    ]);
  });

  // --- Edge cases: whitespace and empty input ---

  it('handles empty input', () => {
    const tokens = new Lexer('').tokenize();
    expect(tokens).toEqual([{ type: TokenType.EOF, value: '', location: { line: 1, column: 1, offset: 0 } }]);
  });

  it('handles CRLF line endings', () => {
    const tokens = new Lexer('node\r\nedge').tokenize();
    expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
    expect(tokens[1].location).toEqual({ line: 2, column: 1, offset: 6 });
  });

  // --- Error cases ---

  it('throws on unterminated string', () => {
    expect(() => new Lexer('"unterminated').tokenize()).toThrow(/unterminated string/i);
  });

  it('throws on unexpected character', () => {
    expect(() => new Lexer('node @').tokenize()).toThrow(/unexpected character/i);
  });

  it('throws on unterminated block comment', () => {
    expect(() => new Lexer('/* never closed').tokenize()).toThrow(/unterminated block comment/i);
  });

  // --- GraftError ---

  it('GraftError is an instance of Error', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GraftError');
    expect(err.message).toBe('test');
  });

  it('GraftError.format() produces readable output', () => {
    const err = new GraftError('bad token', { line: 1, column: 5, offset: 4 });
    const output = err.format('node @foo');
    expect(output).toContain('line 1:5');
    expect(output).toContain('node @foo');
    expect(output).toContain('    ^');
    expect(output).toContain('bad token');
  });
});
