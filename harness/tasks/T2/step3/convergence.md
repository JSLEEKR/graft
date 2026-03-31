# Convergence Report -- T2: Token Types & Lexer

## Summary

The converged implementation adopts the plan's class-based single-pass scanner architecture with three targeted fixes and a curated test suite. The three fixes are: (1) `GraftError` extends `Error` (unanimous -- fixes `toThrow()` matching and stack traces), (2) float parsing requires a digit after the decimal point (fixes the `42.}` bug per spec grammar `[0-9]+ '.' [0-9]+`), and (3) `SINGLE_CHAR` map hoisted to module scope (eliminates per-call allocation). The error handling strategy is throw-on-first-error for v1, with error collection deferred to a future iteration. Three separate files are maintained: `diagnostics.ts`, `tokens.ts`, `lexer.ts`. The `severity` field is kept on `GraftError` with a default of `'error'` as cheap future-proofing. `CompilerPhase` is deferred to T4. The test suite includes 22 tests covering happy path, edge cases, and error conditions.

## Forced Dissent Rulings

| Argument | Ruling | Basis |
|----------|--------|-------|
| A4's 9/10 score was miscalibrated (missed GraftError extends Error bug) | **Accept** | A4 focused on compiler theory correctness and missed the TypeScript runtime issue. The self-rebuttal is honest and correct -- domain expertise created a blind spot for integration concerns. Adjusted effective confidence: 7/10. |
| Domain expertise verified theory but missed practical issues | **Accept** | The float bug was caught by A4, but the `Error` inheritance bug was not. This validates that multiple perspectives (A2-Pragmatist, A3-Skeptic) are necessary to catch all bug categories. |
| Confirmation bias in characterizing scope as "one fix" | **Accept** | There were at least three issues (float guard, Error inheritance, SINGLE_CHAR allocation). Calling it "one targeted fix" minimized the scope of needed changes. The corrected framing is "three fixes, one structural." |

## Per-Agent Accept/Reject

### A1-Architect
- Accepted: `SourceLocation` as shared type in `Token` interface -- Reason: Single source of truth for location shape prevents drift between tokens, AST nodes, and errors. Structural typing makes this free.
- Accepted: Keep `tokens.ts` as separate file -- Reason: DAG `diagnostics -> tokens -> lexer` is cleaner; parser (T4) imports token types without depending on Lexer class.
- Accepted: Keep `severity` on `GraftError` -- Reason: Defaulted parameter costs nothing; analyzer (T5) will need warnings. Not YAGNI -- it is a defaulted constructor parameter that documents intent.
- Accepted: ASCII format output -- Reason: Avoids encoding issues on Windows terminals and CI.
- Accepted: `format()` defensive guard -- Reason: `Math.max(0, column - 1)` prevents `RangeError` crash on invalid locations.
- Rejected: `LexResult` return type -- Reason: YAGNI for v1. No consumer benefits from error collection when the compiler halts on first error. Upgrade path is straightforward.
- Rejected: `CompilerPhase` field on `GraftError` -- Reason: YAGNI for T2. Only one phase produces errors. Add in T4 when parser errors exist and make it required, not optional.

### A2-Pragmatist
- Accepted: `GraftError extends Error` -- Reason: Correctness fix. Without it, `toThrow(/pattern/)` relies on Vitest-specific behavior, `instanceof Error` fails, stack traces are lost. Most important single fix.
- Accepted: `SINGLE_CHAR` at module scope -- Reason: Free performance improvement, no downsides.
- Accepted: Throw-on-first-error for v1 -- Reason: Simpler control flow, sufficient for v1, easy upgrade path.
- Accepted: `matchTwoChar()` helper extraction -- Reason: Clean separation of two-char operator logic from push/advance boilerplate.
- Rejected: Merge `tokens.ts` into `lexer.ts` -- Reason: A1's DAG argument wins. Parser (T4) should import token types without depending on Lexer implementation. A2 retracted this in Step 2.
- Rejected: Remove `severity` field -- Reason: Cost is one defaulted parameter. Benefit materializes in T5. Removing creates a gratuitous API change later.

### A3-Skeptic
- Accepted: Float without trailing digits bug (issue #1/#8) -- Reason: Most important correctness bug. `42.}` producing `FloatLiteral("42.")` violates spec grammar. Fix: require `isDigit(peek(1))` before entering float mode.
- Accepted: `GraftError extends Error` (issue #11) -- Reason: Same as A2. Independent confirmation strengthens the case.
- Accepted: `format()` defensive guard (issue #5) -- Reason: Prevents `RangeError` on `' '.repeat(-1)`. One-line fix.
- Accepted: Additional test cases -- Reason: Covers critical edge cases (`42.}`, `0..1`, `Float(0..1)`, `.5`, empty input, CRLF, keyword prefix, empty string, unterminated block comment).
- Rejected: Escape sequences in strings (issue #3) -- Reason: Spec explicitly defines `string := '"' [^"]* '"'`. No escape sequences in v1. Out of scope.
- Rejected: Better error messages for bare operators (issue #7) -- Reason: Nice-to-have, not v1 requirement. Generic "unexpected character" message is sufficient.
- Rejected: Error collection as primary strategy (issue #6) -- Reason: Throw-on-first-error is simpler and sufficient for v1. A3 themselves acknowledged "for unterminated strings and block comments, continuing is hard."

### A4-Specialist
- Accepted: Float digit-guard fix -- Reason: Cleanest expression of the fix. Compound condition handles all three cases in one guard.
- Accepted: TokenType completeness verification -- Reason: Cross-check against spec Section 3.2 confirms no missing types. Valuable validation.
- Accepted: Throw-on-first-error for v1 -- Reason: Pragmatically correct. Document as known v1 limitation.
- Accepted: `Token[]` return type (not `TokenStream` wrapper) -- Reason: Parser manages its own cursor via array indexing. No abstraction needed.
- Accepted (self-rebuttal): 9/10 was miscalibrated -- Reason: Missing the `Error` inheritance bug while scoring 9/10 demonstrates that domain confidence must be tempered by integration testing perspective.

## Implementation Spec

### File List
- Create: `src/errors/diagnostics.ts`
- Create: `src/lexer/tokens.ts`
- Create: `src/lexer/lexer.ts`
- Create: `tests/lexer.test.ts`

### Implementation Code

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
    public readonly severity: 'error' | 'warning' = 'error',
  ) {
    super(message);
    this.name = 'GraftError';
  }

  format(source: string): string {
    const lines = source.split('\n');
    const lineIdx = this.location.line - 1;
    const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
    const col = Math.max(0, this.location.column - 1);
    const pointer = ' '.repeat(col) + '^';
    return [
      `Error at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

#### `src/lexer/tokens.ts`

```typescript
import { SourceLocation } from '../errors/diagnostics.js';

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

export const KEYWORDS: Record<string, TokenType> = {
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
```

#### `src/lexer/lexer.ts`

```typescript
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
```

### Test Code

#### `tests/lexer.test.ts`

```typescript
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
```

### Verification Commands

```bash
# 1. Create directories
mkdir -p src/errors src/lexer

# 2. Build (type-check)
npx tsc --noEmit

# 3. Run tests
npx vitest run tests/lexer.test.ts

# Expected: 22 tests passing, 0 failures
```

## Ratchet-Locked Items

- [T2-R01] `GraftError extends Error` -- LOCKED
- [T2-R02] Throw-on-first-error for v1 (not error collection) -- LOCKED
- [T2-R03] `tokens.ts` and `lexer.ts` as separate files (DAG: diagnostics -> tokens -> lexer) -- LOCKED
- [T2-R04] `diagnostics.ts` is dependency-free (DAG leaf) -- LOCKED
- [T2-R05] Float parsing requires digit after decimal point (`[0-9]+ '.' [0-9]+`) -- LOCKED
- [T2-R06] `SINGLE_CHAR` map at module scope, not inside method -- LOCKED
- [T2-R07] ASCII-only in error format output (no emoji) -- LOCKED
- [T2-R08] `Token.location` typed as `SourceLocation` (imported from diagnostics) -- LOCKED
- [T2-R09] `KEYWORDS` as `Record<string, TokenType>` with identifier-then-lookup pattern -- LOCKED
- [T2-R10] `SINGLE_CHAR` includes `.`, `>`, `<` as fallback; `matchTwoChar` checks `..`, `>=`, `<=` first via maximal munch -- LOCKED

## Convergence Metrics

- Final convergence score: 9
- Unresolved issues: None for v1. Error collection (LexResult pattern) deferred to future task.
- Notes for next task:
  - T3 (AST types) should import `SourceLocation` from `src/errors/diagnostics.ts` (not re-define it)
  - T4 (parser) should import `Token`, `TokenType`, `KEYWORDS` from `src/lexer/tokens.ts` (not from `lexer.ts`)
  - T4 may add `CompilerPhase` to `GraftError` if parser needs phase-differentiated errors
  - `GraftError.severity` field exists with default `'error'`; T5 analyzer can use `'warning'` without API changes
