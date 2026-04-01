import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

describe('Lexer v2 — import/memory keywords', () => {
  it('tokenizes import and from keywords', () => {
    const tokens = new Lexer('import from').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Import, TokenType.From, TokenType.EOF,
    ]);
  });

  it('tokenizes memory, writes, and storage keywords', () => {
    const tokens = new Lexer('memory writes storage').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Memory, TokenType.Writes, TokenType.Storage, TokenType.EOF,
    ]);
  });

  it('tokenizes a full import statement', () => {
    const tokens = new Lexer('import { Foo, Bar } from "lib/utils.gft"').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Import,
      TokenType.LBrace,
      TokenType.Identifier,
      TokenType.Comma,
      TokenType.Identifier,
      TokenType.RBrace,
      TokenType.From,
      TokenType.StringLiteral,
      TokenType.EOF,
    ]);
    expect(tokens[2].value).toBe('Foo');
    expect(tokens[4].value).toBe('Bar');
    expect(tokens[7].value).toBe('lib/utils.gft');
  });

  it('tokenizes a memory declaration', () => {
    const tokens = new Lexer('memory ConvHistory(max_tokens: 10k, storage: file) { turns: String }').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Memory,
      TokenType.Identifier,
      TokenType.LParen,
      TokenType.MaxTokens,
      TokenType.Colon,
      TokenType.KIntegerLiteral,
      TokenType.Comma,
      TokenType.Storage,
      TokenType.Colon,
      TokenType.Identifier, // 'file' is not a keyword
      TokenType.RParen,
      TokenType.LBrace,
      TokenType.Identifier,
      TokenType.Colon,
      TokenType.String,
      TokenType.RBrace,
      TokenType.EOF,
    ]);
  });
});
