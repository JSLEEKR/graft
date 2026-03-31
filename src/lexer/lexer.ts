import { Token, TokenType, KEYWORDS } from './tokens.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

const SINGLE_CHAR: Record<string, TokenType> = {
  '{': TokenType.LBrace,
  '}': TokenType.RBrace,
  '(': TokenType.LParen,
  ')': TokenType.RParen,
  '[': TokenType.LBracket,
  ']': TokenType.RBracket,
  ':': TokenType.Colon,
  ',': TokenType.Comma,
  '.': TokenType.Dot,
  '|': TokenType.Pipe,
  '/': TokenType.Slash,
  '>': TokenType.Greater,
  '<': TokenType.Less,
};

export class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    this.tokens = [];

    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Comments
      if (ch === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }
      if (ch === '/' && this.peek(1) === '*') {
        this.skipBlockComment();
        continue;
      }

      // String literals
      if (ch === '"') {
        this.readString();
        continue;
      }

      // Numbers (integer, k-integer, float)
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Identifiers and keywords
      if (this.isAlpha(ch)) {
        this.readIdentifierOrKeyword();
        continue;
      }

      // Symbols
      if (this.readSymbol()) {
        continue;
      }

      throw new GraftError(
        `Unexpected character '${ch}'`,
        this.location(),
      );
    }

    this.tokens.push({ type: TokenType.EOF, value: '', location: this.location() });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\n') {
        this.pos++;
        this.line++;
        this.column = 1;
      } else if (ch === '\r') {
        this.pos++;
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          this.pos++;
        }
        this.line++;
        this.column = 1;
      } else if (ch === ' ' || ch === '\t') {
        this.pos++;
        this.column++;
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    this.pos += 2;
    this.column += 2;
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.pos++;
      this.column++;
    }
  }

  private skipBlockComment(): void {
    const loc = this.location();
    this.pos += 2;
    this.column += 2;
    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '*' && this.peek(1) === '/') {
        this.pos += 2;
        this.column += 2;
        return;
      }
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
        this.pos++;
      } else {
        this.pos++;
        this.column++;
      }
    }
    throw new GraftError('Unterminated block comment', loc);
  }

  private readString(): void {
    const loc = this.location();
    this.pos++;
    this.column++;
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\n') {
        throw new GraftError('Unterminated string literal', loc);
      }
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }
    if (this.pos >= this.source.length) {
      throw new GraftError('Unterminated string literal', loc);
    }
    this.pos++;
    this.column++;
    this.tokens.push({ type: TokenType.StringLiteral, value, location: loc });
  }

  private readNumber(): void {
    const loc = this.location();
    let value = '';
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }

    // Check for k-suffix
    if (this.pos < this.source.length && this.source[this.pos] === 'k') {
      value += 'k';
      this.pos++;
      this.column++;
      this.tokens.push({ type: TokenType.KIntegerLiteral, value, location: loc });
      return;
    }

    // Check for float (requires digit after dot; dot-dot is range operator)
    if (
      this.pos < this.source.length &&
      this.source[this.pos] === '.' &&
      this.peek(1) !== undefined &&
      this.isDigit(this.peek(1)!)
    ) {
      value += '.';
      this.pos++;
      this.column++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
      this.tokens.push({ type: TokenType.FloatLiteral, value, location: loc });
      return;
    }

    this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
  }

  private readIdentifierOrKeyword(): void {
    const loc = this.location();
    let value = '';
    while (this.pos < this.source.length && this.isAlphaNumeric(this.source[this.pos])) {
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }
    const keywordType = KEYWORDS[value];
    this.tokens.push({
      type: keywordType ?? TokenType.Identifier,
      value,
      location: loc,
    });
  }

  private readSymbol(): boolean {
    const loc = this.location();
    const ch = this.source[this.pos];
    const next = this.peek(1);

    // Two-character symbols first (maximal munch)
    const twoChar = this.matchTwoChar(ch, next);
    if (twoChar) {
      this.tokens.push({ type: twoChar[0], value: twoChar[1], location: loc });
      this.pos += 2;
      this.column += 2;
      return true;
    }

    // Single-character symbols
    const singleType = SINGLE_CHAR[ch];
    if (singleType !== undefined) {
      this.tokens.push({ type: singleType, value: ch, location: loc });
      this.pos++;
      this.column++;
      return true;
    }

    return false;
  }

  private matchTwoChar(ch: string, next: string | undefined): [TokenType, string] | null {
    if (ch === '-' && next === '>') return [TokenType.Arrow, '->'];
    if (ch === '.' && next === '.') return [TokenType.DotDot, '..'];
    if (ch === '>' && next === '=') return [TokenType.GreaterEqual, '>='];
    if (ch === '<' && next === '=') return [TokenType.LessEqual, '<='];
    if (ch === '=' && next === '=') return [TokenType.EqualEqual, '=='];
    if (ch === '!' && next === '=') return [TokenType.BangEqual, '!='];
    return null;
  }

  private peek(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private location(): SourceLocation {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }
}
