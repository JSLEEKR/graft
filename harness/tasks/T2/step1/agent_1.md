# A1-Architect Independent Analysis -- T2

## Proposed Implementation

### Key Design Decisions

- [D1] **Token interface uses shared SourceLocation type**: The `Token.location` field should reference the `SourceLocation` interface from `diagnostics.ts` rather than inlining `{ line, column, offset }`. This creates a single canonical location type used by tokens, AST nodes, and errors -- preventing drift. The plan's code inlines the shape in `Token` but imports `SourceLocation` in the lexer. Fix: import and use `SourceLocation` in the `Token` interface definition itself.

- [D2] **Separate type keywords from language keywords in the enum**: The plan lumps `String`, `Int`, `Float`, `Bool`, `List`, `Map`, `Optional`, `TokenBounded`, `FilePath`, `FileDiff`, `TestFile`, `IssueRef` into the same `TokenType` enum alongside language keywords like `node`, `edge`, `graph`. This is acceptable for v1 but should be organized with clear comment grouping. Adding v2 type keywords (e.g., `Sequential`, `Indexed`, `Parallel`) means extending the enum -- which is fine for string enums (no binary compatibility concern). No structural change needed, but the comment grouping in the plan is already correct.

- [D3] **GraftError should carry a `phase` discriminator**: The plan's `GraftError` has `message`, `location`, `severity`. For reuse across lexer, parser, analyzer, and codegen, add an optional `phase` field (`'lexer' | 'parser' | 'analyzer' | 'codegen'`). This enables filtering errors by phase in diagnostics output and helps the user understand which stage produced the error. Keep it optional with a default so each phase sets it naturally.

- [D4] **Error collection vs. throwing**: The plan's lexer throws `GraftError` on the first unexpected character or unterminated string. The spec says "all errors collected and reported together" and the research explicitly recommends skip-and-continue. The plan contradicts itself -- the tests expect `toThrow()` but the research says collect. I recommend: collect errors into an array, continue lexing, and throw an aggregate error (or return a result object) only after the full scan. The tests for error cases would change from `toThrow()` to checking a returned errors array or a wrapper result.

- [D5] **Lexer API: return a result object, not bare Token[]**: Instead of `tokenize(): Token[]` that throws, use `tokenize(): LexResult` where `LexResult = { tokens: Token[]; errors: GraftError[] }`. This is cleaner for multi-error reporting, avoids try/catch control flow in the compiler pipeline, and matches what the analyzer and parser will also need to do (collect multiple errors). If there are errors, the caller decides whether to halt or continue. This is the standard pattern in production compilers (Roslyn, rustc, TypeScript).

- [D6] **KEYWORDS as a module-level const is correct**: The `Record<string, TokenType>` approach is right. No Map needed. The lex-as-identifier-then-lookup pattern handles snake_case keywords (`on_failure`, `max_tokens`) naturally since `_` is in the alpha set.

- [D7] **Token.value for string literals should store the unescaped content (no quotes)**: The plan does this correctly -- `readString()` builds `value` without the surrounding quotes. Worth calling out because this is a common mistake.

- [D8] **Dependency DAG: diagnostics.ts is a leaf**: `diagnostics.ts` imports nothing from the project. `tokens.ts` imports `SourceLocation` from `diagnostics.ts`. `lexer.ts` imports from both `tokens.ts` and `diagnostics.ts`. This forms a clean DAG: `diagnostics -> tokens -> lexer`. The parser will import from all three. This is correct per common_memory and research consensus.

### Code Structure

#### `src/errors/diagnostics.ts` -- improved

```typescript
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export type CompilerPhase = 'lexer' | 'parser' | 'analyzer' | 'codegen';

export class GraftError {
  constructor(
    public readonly message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
    public readonly phase?: CompilerPhase,
  ) {}

  format(source: string): string {
    const lines = source.split('\n');
    const line = lines[this.location.line - 1] || '';
    const pointer = ' '.repeat(this.location.column - 1) + '^';
    const prefix = this.phase ? `[${this.phase}] ` : '';
    return [
      `${this.severity === 'error' ? 'x' : '!'} ${prefix}${this.severity} at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

Key changes from plan:
- Added `CompilerPhase` type and optional `phase` field for cross-phase reuse.
- Changed emoji in `format()` to ASCII (`x` / `!`) -- avoids encoding issues on Windows terminals and in CI logs. The plan uses unicode characters that may render incorrectly.

#### `src/lexer/tokens.ts` -- improved

```typescript
import { SourceLocation } from '../errors/diagnostics.js';

export enum TokenType {
  // Language keywords
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
  // Type keywords (PascalCase)
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

Key change from plan: `Token.location` is now typed as `SourceLocation` (imported), not an inline object type. This enforces a single source of truth.

#### `src/lexer/lexer.ts` -- improved

```typescript
import { Token, TokenType, KEYWORDS } from './tokens.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

export interface LexResult {
  tokens: Token[];
  errors: GraftError[];
}

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private errors: GraftError[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): LexResult {
    this.tokens = [];
    this.errors = [];

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

      // Numbers
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

      // Error recovery: record error and skip character
      this.errors.push(new GraftError(
        `Unexpected character '${ch}'`,
        this.location(),
        'error',
        'lexer',
      ));
      this.pos++;
      this.column++;
    }

    this.tokens.push({ type: TokenType.EOF, value: '', location: this.location() });
    return { tokens: this.tokens, errors: this.errors };
  }

  // ... (skipWhitespace, skipLineComment, skipBlockComment, readNumber,
  //      readIdentifierOrKeyword, readSymbol -- same as plan)

  private readString(): void {
    const loc = this.location();
    this.pos++; // skip opening "
    this.column++;
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\n') {
        // Unterminated string -- record error, emit what we have, continue
        this.errors.push(new GraftError(
          'Unterminated string literal',
          loc,
          'error',
          'lexer',
        ));
        this.tokens.push({ type: TokenType.StringLiteral, value, location: loc });
        return;
      }
      value += this.source[this.pos];
      this.pos++;
      this.column++;
    }
    if (this.pos >= this.source.length) {
      this.errors.push(new GraftError(
        'Unterminated string literal',
        loc,
        'error',
        'lexer',
      ));
      this.tokens.push({ type: TokenType.StringLiteral, value, location: loc });
      return;
    }
    this.pos++; // skip closing "
    this.column++;
    this.tokens.push({ type: TokenType.StringLiteral, value, location: loc });
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
    // Unterminated block comment -- record error, don't throw
    this.errors.push(new GraftError(
      'Unterminated block comment',
      loc,
      'error',
      'lexer',
    ));
  }

  // peek, location, isDigit, isAlpha, isAlphaNumeric -- same as plan
  // skipWhitespace -- same as plan (handles \r\n correctly)
  // readNumber -- same as plan
  // readIdentifierOrKeyword -- same as plan
  // readSymbol -- same as plan

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

#### Test adjustments for `LexResult`

Error tests change from `toThrow` to checking the errors array:

```typescript
it('reports error on unterminated string', () => {
  const lexer = new Lexer('"unterminated');
  const result = lexer.tokenize();
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toMatch(/unterminated string/i);
});

it('reports error on unexpected character', () => {
  const lexer = new Lexer('node @');
  const result = lexer.tokenize();
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toMatch(/unexpected character/i);
  // Lexer continues past the error -- node token is still present
  expect(result.tokens[0].type).toBe(TokenType.Node);
});
```

Happy-path tests use `result.tokens`:

```typescript
it('tokenizes keywords', () => {
  const result = new Lexer('node edge graph context').tokenize();
  expect(result.errors).toEqual([]);
  expect(result.tokens.map(t => t.type)).toEqual([
    TokenType.Node, TokenType.Edge, TokenType.Graph, TokenType.Context, TokenType.EOF,
  ]);
});
```

### Trade-offs

**Pros:**
- `LexResult` pattern makes error collection explicit and composable -- the compiler pipeline can accumulate errors across phases without try/catch.
- `SourceLocation` as a shared type prevents location shape drift between tokens, AST nodes, and errors.
- `CompilerPhase` on `GraftError` enables filtered diagnostics output (e.g., "show only parser errors").
- Error recovery (skip-and-continue) aligns with the spec requirement for batch error reporting and maximizes diagnostic density.
- ASCII format characters avoid Windows terminal encoding issues.

**Cons:**
- `LexResult` wrapper is slightly more verbose at call sites than bare `Token[]`. Every consumer must destructure `{ tokens, errors }`.
- Adding `phase` to `GraftError` is a mild YAGNI concern -- but the cost is one optional field and the benefit materializes in T4 (parser errors) and T5 (analyzer errors).
- Error recovery for unterminated strings emits a partial `StringLiteral` token, which downstream phases must tolerate. However, if errors exist, the compiler will typically halt before parsing, so this is low risk.

### Potential Issues

- [P1] **SINGLE_CHAR map recreated on every `readSymbol()` call**: The plan defines the `Record<string, TokenType>` inside the method body. This allocates a new object on every symbol token. Move it to a module-level `const` or a `static readonly` on the class. Minor perf issue but trivially fixable.

- [P2] **CRLF offset tracking**: The plan's `skipWhitespace` handles `\r\n` by advancing `pos` twice (once for `\r`, once for `\n`). This means `offset` in `SourceLocation` reflects raw byte positions in the original source, which is correct. But if a `\r` appears without a following `\n` (bare CR, rare but possible), the plan increments `line` -- this is arguably correct (old Mac line endings) but could surprise users. Low risk.

- [P3] **String concatenation in readString/readNumber**: Building `value` with `+=` in a loop creates intermediate strings. For v1 with small source files this is fine. If performance matters later, use `source.slice(startPos, endPos)` instead. Not worth optimizing now (YAGNI).

- [P4] **No escape sequences in string literals**: The spec shows `'"' [^"]* '"'` for strings -- no backslash escapes. This is correct for v1 but worth noting: adding escape sequences later requires changes to `readString()`. The current implementation correctly follows the spec.

- [P5] **`Float` type keyword vs `FloatLiteral` token**: Both exist in the enum. The keyword `Float` is used in type positions (e.g., `risk_score: Float(0..1)`), while `FloatLiteral` is for numeric values like `0.7`. The parser must distinguish these by context. No lexer issue, but worth documenting for T4.

## Self-Assessment

- Convergence score: **8** -- high confidence
- Basis: The plan's lexer is fundamentally sound. My proposals are refinements, not rewrites. The two substantive changes are (1) `LexResult` return type for error collection, which aligns with the spec and research but changes the API surface, and (2) using `SourceLocation` in the `Token` interface, which is a small but important type-safety improvement. The `CompilerPhase` addition is optional and low-cost. The core scanning logic (maximal munch, keyword lookup, number lexing with k-suffix and `..` disambiguation) is correct as-is. Score is 8 not 10 because the error-collection-vs-throwing question is genuinely debatable -- throwing is simpler, collecting is more correct per spec.
