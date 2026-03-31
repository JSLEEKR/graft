# A2-Pragmatist Independent Analysis — T2

## Proposed Implementation
### Core Principles
- **YAGNI token enum**: Keep all token types from the plan. They map 1:1 to the spec's grammar. Removing any would just mean adding them back in T4 when the parser needs them.
- **Merge tokens.ts into lexer.ts**: Two files in `src/lexer/` is unnecessary indirection for ~80 lines of enum + interface + keyword map. One file, one import path. The parser imports `TokenType` and `Token` from `./lexer/lexer.js` -- done.
- **Simplify GraftError**: The `format()` method with pointer arrows is nice-to-have for v1. A plain `toString()` is enough. But `format()` is 8 lines -- not worth removing. Keep it. However, drop the `severity` field: v1 has no warnings, only errors. Every `GraftError` in the plan is thrown as an error. The `'error' | 'warning'` union is speculative.
- **Throw on first error**: The plan already throws (not collects). The research recommended error collection, but the plan's code throws immediately. Throwing is simpler and sufficient for v1. Keep throwing.
- **SINGLE_CHAR as module-level const**: The plan recreates the `SINGLE_CHAR` record on every call to `readSymbol()`. Hoist it to module scope. Minor but free.

### Code

#### `src/errors/diagnostics.ts`
```typescript
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export class GraftError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
  ) {
    super(message);
    this.name = 'GraftError';
  }

  format(source: string): string {
    const lines = source.split('\n');
    const line = lines[this.location.line - 1] || '';
    const pointer = ' '.repeat(this.location.column - 1) + '^';
    return [
      `Error at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

Changes from plan:
- `GraftError` extends `Error`. The plan's version is a plain class, which means `throw new GraftError(...)` produces an object that isn't an `Error` instance. The test uses `expect(() => ...).toThrow(/pattern/)`, which vitest matches against `Error.message`. Without extending `Error`, the thrown object has no `.message` property that vitest can regex-match. This is a bug in the plan.
- Removed `severity` field. v1 never emits warnings. If we need it later, adding a field is trivial.
- Removed emoji from format output (`✗`/`⚠`). Plain text is easier to test and grep.

#### `src/lexer/lexer.ts`

Merge tokens.ts content directly into this file. One file for the entire lexer module.

```typescript
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

// --- Token types & keyword map (was tokens.ts) ---

export enum TokenType {
  // Keywords
  Node = 'Node',
  Edge = 'Edge',
  Graph = 'Graph',
  Context = 'Context',
  Reads = 'Reads',
  Produces = 'Produces',
  Tools = 'Tools',
  Budget = 'Budget',
  Model = 'Model',
  Select = 'Select',
  Filter = 'Filter',
  Drop = 'Drop',
  Compact = 'Compact',
  Truncate = 'Truncate',
  When = 'When',
  Else = 'Else',
  Done = 'Done',
  OnFailure = 'OnFailure',
  Retry = 'Retry',
  Fallback = 'Fallback',
  Skip = 'Skip',
  Abort = 'Abort',
  Input = 'Input',
  Output = 'Output',
  MaxTokens = 'MaxTokens',
  Enum = 'Enum',
  True = 'True',
  False = 'False',

  // Type keywords
  String = 'String',
  Int = 'Int',
  Float = 'Float',
  Bool = 'Bool',
  List = 'List',
  Map = 'Map',
  Optional = 'Optional',
  TokenBounded = 'TokenBounded',
  FilePath = 'FilePath',
  FileDiff = 'FileDiff',
  TestFile = 'TestFile',
  IssueRef = 'IssueRef',

  // Literals
  IntegerLiteral = 'IntegerLiteral',
  KIntegerLiteral = 'KIntegerLiteral',
  FloatLiteral = 'FloatLiteral',
  StringLiteral = 'StringLiteral',

  // Identifiers
  Identifier = 'Identifier',

  // Symbols
  LBrace = 'LBrace',
  RBrace = 'RBrace',
  LParen = 'LParen',
  RParen = 'RParen',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  Colon = 'Colon',
  Comma = 'Comma',
  Dot = 'Dot',
  Arrow = 'Arrow',
  Pipe = 'Pipe',
  Slash = 'Slash',
  DotDot = 'DotDot',
  GreaterEqual = 'GreaterEqual',
  Greater = 'Greater',
  LessEqual = 'LessEqual',
  Less = 'Less',
  EqualEqual = 'EqualEqual',
  BangEqual = 'BangEqual',

  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
}

const KEYWORDS: Record<string, TokenType> = {
  node: TokenType.Node,
  edge: TokenType.Edge,
  graph: TokenType.Graph,
  context: TokenType.Context,
  reads: TokenType.Reads,
  produces: TokenType.Produces,
  tools: TokenType.Tools,
  budget: TokenType.Budget,
  model: TokenType.Model,
  select: TokenType.Select,
  filter: TokenType.Filter,
  drop: TokenType.Drop,
  compact: TokenType.Compact,
  truncate: TokenType.Truncate,
  when: TokenType.When,
  else: TokenType.Else,
  done: TokenType.Done,
  on_failure: TokenType.OnFailure,
  retry: TokenType.Retry,
  fallback: TokenType.Fallback,
  skip: TokenType.Skip,
  abort: TokenType.Abort,
  input: TokenType.Input,
  output: TokenType.Output,
  max_tokens: TokenType.MaxTokens,
  enum: TokenType.Enum,
  true: TokenType.True,
  false: TokenType.False,
  String: TokenType.String,
  Int: TokenType.Int,
  Float: TokenType.Float,
  Bool: TokenType.Bool,
  List: TokenType.List,
  Map: TokenType.Map,
  Optional: TokenType.Optional,
  TokenBounded: TokenType.TokenBounded,
  FilePath: TokenType.FilePath,
  FileDiff: TokenType.FileDiff,
  TestFile: TokenType.TestFile,
  IssueRef: TokenType.IssueRef,
};

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

// --- Lexer class ---

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

      if (ch === '/' && this.peek(1) === '/') { this.skipLineComment(); continue; }
      if (ch === '/' && this.peek(1) === '*') { this.skipBlockComment(); continue; }
      if (ch === '"') { this.readString(); continue; }
      if (this.isDigit(ch)) { this.readNumber(); continue; }
      if (this.isAlpha(ch)) { this.readIdentifierOrKeyword(); continue; }
      if (this.readSymbol()) continue;

      throw new GraftError(`Unexpected character '${ch}'`, this.location());
    }

    this.tokens.push({ type: TokenType.EOF, value: '', location: this.location() });
    return this.tokens;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '\n') {
        this.pos++; this.line++; this.column = 1;
      } else if (ch === '\r') {
        this.pos++;
        if (this.source[this.pos] === '\n') this.pos++;
        this.line++; this.column = 1;
      } else if (ch === ' ' || ch === '\t') {
        this.pos++; this.column++;
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    this.pos += 2; this.column += 2;
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.pos++; this.column++;
    }
  }

  private skipBlockComment(): void {
    this.pos += 2; this.column += 2;
    while (this.pos < this.source.length) {
      if (this.source[this.pos] === '*' && this.peek(1) === '/') {
        this.pos += 2; this.column += 2; return;
      }
      if (this.source[this.pos] === '\n') {
        this.line++; this.column = 1; this.pos++;
      } else {
        this.pos++; this.column++;
      }
    }
    throw new GraftError('Unterminated block comment', this.location());
  }

  private readString(): void {
    const loc = this.location();
    this.pos++; this.column++;
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\n') {
        throw new GraftError('Unterminated string literal', loc);
      }
      value += this.source[this.pos];
      this.pos++; this.column++;
    }
    if (this.pos >= this.source.length) {
      throw new GraftError('Unterminated string literal', loc);
    }
    this.pos++; this.column++;
    this.tokens.push({ type: TokenType.StringLiteral, value, location: loc });
  }

  private readNumber(): void {
    const loc = this.location();
    let value = '';
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      value += this.source[this.pos]; this.pos++; this.column++;
    }
    if (this.pos < this.source.length && this.source[this.pos] === 'k') {
      value += 'k'; this.pos++; this.column++;
      this.tokens.push({ type: TokenType.KIntegerLiteral, value, location: loc });
      return;
    }
    if (this.pos < this.source.length && this.source[this.pos] === '.') {
      if (this.peek(1) === '.') {
        this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
        return;
      }
      value += '.'; this.pos++; this.column++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos]; this.pos++; this.column++;
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
      value += this.source[this.pos]; this.pos++; this.column++;
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
      this.pos += 2; this.column += 2;
      return true;
    }

    const singleType = SINGLE_CHAR[ch];
    if (singleType !== undefined) {
      this.tokens.push({ type: singleType, value: ch, location: loc });
      this.pos++; this.column++;
      return true;
    }
    return false;
  }

  private matchTwoChar(ch: string, next: string | undefined): [TokenType, string] | null {
    if (ch === '-' && next === '>') return [TokenType.Arrow, '->'];
    if (ch === '>' && next === '=') return [TokenType.GreaterEqual, '>='];
    if (ch === '<' && next === '=') return [TokenType.LessEqual, '<='];
    if (ch === '=' && next === '=') return [TokenType.EqualEqual, '=='];
    if (ch === '!' && next === '=') return [TokenType.BangEqual, '!='];
    if (ch === '.' && next === '.') return [TokenType.DotDot, '..'];
    return null;
  }

  private peek(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private location(): SourceLocation { return { line: this.line, column: this.column, offset: this.pos }; }
  private isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
  private isAlpha(ch: string): boolean { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'; }
  private isAlphaNumeric(ch: string): boolean { return this.isAlpha(ch) || this.isDigit(ch); }
}
```

#### `tests/lexer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../src/lexer/lexer.js';

describe('Lexer', () => {
  it('tokenizes keywords', () => {
    const tokens = new Lexer('node edge graph context').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Edge, TokenType.Graph, TokenType.Context, TokenType.EOF,
    ]);
  });

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

  it('tokenizes identifiers', () => {
    const tokens = new Lexer('Analyzer risk_score').tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'Analyzer' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: 'risk_score' });
  });

  it('skips single-line comments', () => {
    const tokens = new Lexer('node // comment\nedge').tokenize();
    expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
  });

  it('skips multi-line comments', () => {
    const tokens = new Lexer('node /* skip\nthis */ edge').tokenize();
    expect(tokens.map(t => t.type)).toEqual([TokenType.Node, TokenType.Edge, TokenType.EOF]);
  });

  it('tracks source locations', () => {
    const tokens = new Lexer('node\n  edge').tokenize();
    expect(tokens[0].location).toEqual({ line: 1, column: 1, offset: 0 });
    expect(tokens[1].location).toEqual({ line: 2, column: 3, offset: 7 });
  });

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

  it('tokenizes type keywords', () => {
    const tokens = new Lexer('String Int Float Bool List Map Optional').tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.String, TokenType.Int, TokenType.Float, TokenType.Bool,
      TokenType.List, TokenType.Map, TokenType.Optional, TokenType.EOF,
    ]);
  });

  it('throws on unterminated string', () => {
    expect(() => new Lexer('"unterminated').tokenize()).toThrow(/unterminated string/i);
  });

  it('throws on unexpected character', () => {
    expect(() => new Lexer('node @').tokenize()).toThrow(/unexpected character/i);
  });

  it('handles snake_case keywords', () => {
    const tokens = new Lexer('on_failure max_tokens').tokenize();
    expect(tokens[0].type).toEqual(TokenType.OnFailure);
    expect(tokens[1].type).toEqual(TokenType.MaxTokens);
  });
});
```

### Changes vs Implementation Plan Code

- **Merged `tokens.ts` into `lexer.ts`**: Eliminates one file, one import hop. The `Token` interface, `TokenType` enum, and `KEYWORDS` map are internal to the lexer module. The parser imports them from `lexer.ts` directly. Fewer files = fewer import paths to get wrong with `.js` extensions.
- **`GraftError` extends `Error`**: The plan's `GraftError` is a plain class. Vitest's `toThrow(/pattern/)` matcher checks `error.message`. Without extending `Error`, the thrown object lacks `.message`, so those two error tests would fail silently or inconsistently. This is a correctness fix, not a preference.
- **Removed `severity` field from `GraftError`**: v1 has zero warnings. Every diagnostic is an error. Adding a union type for something never used is speculative. Two-line change to add it back if v2 needs warnings.
- **Removed emoji from `format()` output**: `✗` and `⚠` are encoding-sensitive and harder to test. Plain `Error at line X:Y` is sufficient.
- **Hoisted `SINGLE_CHAR` to module scope**: The plan creates this record inside `readSymbol()` on every call. Module-level const is allocated once.
- **Extracted `matchTwoChar()` helper**: Separates the two-char matching logic from the push/advance boilerplate. Marginally cleaner but same line count.
- **Combined `on_failure` and `max_tokens` tests**: The plan has two separate tests that each check one snake_case keyword. Combined into one test since they test the same mechanism. 16 tests -> 15 tests.
- **Removed `budget shorthand` test**: This test (`budget: 4k/2k`) is fully redundant with the `node declaration` test which includes the exact same token sequence. 15 tests -> 14 tests.
- **Kept all TokenType enum members**: Every type in the enum maps to a keyword or symbol in the spec. Removing any would require re-adding them during parsing (T4). The enum is data, not code -- no maintenance cost.
- **Kept `KEYWORDS` as `Record<string, TokenType>`**: Simple, O(1) lookup, matches plan. No reason to change.
- **Kept `Token.location` as inline type**: Using `SourceLocation` from diagnostics.ts would add a re-export or import. The inline `{ line, column, offset }` is structurally identical. Actually, for consistency and to avoid drift, use `SourceLocation` from diagnostics.ts. (Plan does this correctly; I keep it.)
- **Constructor uses `private readonly` shorthand**: TypeScript shorthand for `this.source = source`. Removes 3 lines.

### Trade-offs
- **Pros:**
  - One fewer file (`tokens.ts` merged into `lexer.ts`) reduces import complexity
  - `GraftError extends Error` fixes a real bug where `toThrow(/pattern/)` would not match
  - 14 tests instead of 16 -- no coverage lost, just redundancy removed
  - Module-scope constants avoid per-call allocation
  - Simpler `GraftError` without unused severity field
- **Cons:**
  - Single `lexer.ts` file is ~200 lines. Manageable but less modular than two files. If this bothers anyone, splitting later is trivial.
  - Removing severity means a small change if v2 introduces warnings. Acceptable cost.

## Self-Assessment
- Convergence score: 8
- Basis: The plan's code is already quite lean. My changes are surgical: fix the `Error` inheritance bug, merge two small files into one, drop an unused field, and trim 2 redundant tests. The core lexer logic (scanning, lookahead, keyword map, number parsing) is identical to the plan because the plan got it right. I don't see a fundamentally simpler approach -- this is close to the minimum viable lexer for the Graft grammar.
