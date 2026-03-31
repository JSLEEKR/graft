# Graft Compiler v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end compiler that takes `.gft` files and produces Claude Code harness structures (`.claude/` directory), with `graft compile` and `graft check` CLI commands.

**Architecture:** Hand-written recursive descent parser in TypeScript. Pipeline: Lexer → Parser → Analyzer (scope/type/token) → CodeGen. Outputs `.claude/` directory with agent .md files, hook .sh scripts, CLAUDE.md orchestration, and settings.json.

**Tech Stack:** TypeScript, Node.js, commander (CLI), vitest (testing), no parser generator.

**Spec:** `docs/superpowers/specs/2026-03-31-graft-compiler-v1-design.md`

---

## File Structure

```
graft/
├── src/
│   ├── index.ts              # CLI entry (commander setup)
│   ├── compiler.ts           # Orchestrates lex→parse→analyze→codegen
│   ├── lexer/
│   │   ├── tokens.ts         # TokenType enum, Token interface
│   │   └── lexer.ts          # Lexer class: source → Token[]
│   ├── parser/
│   │   ├── ast.ts            # AST node type definitions
│   │   └── parser.ts         # Parser class: Token[] → Program AST
│   ├── analyzer/
│   │   ├── scope.ts          # ScopeChecker: validates reads/edge refs
│   │   ├── types.ts          # TypeChecker: validates edge transforms
│   │   └── tokens.ts         # TokenEstimator: budget analysis
│   ├── codegen/
│   │   ├── codegen.ts        # CodeGenerator: orchestrates output
│   │   ├── agents.ts         # generateAgent(): node → .md
│   │   ├── hooks.ts          # generateHook(): edge → .sh
│   │   ├── orchestration.ts  # generateOrchestration(): graph → CLAUDE.md
│   │   └── settings.ts       # generateSettings(): → settings.json
│   └── errors/
│       └── diagnostics.ts    # GraftError class, formatError()
├── tests/
│   ├── lexer.test.ts
│   ├── parser.test.ts
│   ├── analyzer.test.ts
│   ├── codegen.test.ts
│   └── integration.test.ts
├── examples/
│   └── hello.gft             # Redesigned hello example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `examples/hello.gft`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd /c/Users/user/OneDrive/Documents/Graft
npm init -y
npm install commander
npm install -D typescript vitest @types/node
```

- [ ] **Step 2: Configure TypeScript**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Configure vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Add scripts to package.json**

Update `package.json` scripts:
```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "graft": "node --loader ts-node/esm src/index.ts"
  },
  "type": "module",
  "bin": {
    "graft": "dist/index.js"
  }
}
```

Also install ts-node for development:
```bash
npm install -D ts-node
```

- [ ] **Step 5: Create the redesigned hello.gft example**

Overwrite `examples/hello.gft`:
```graft
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]

  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]

  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p src/lexer src/parser src/analyzer src/codegen src/errors tests
```

- [ ] **Step 7: Verify setup**

Create a minimal `src/index.ts`:
```typescript
console.log('graft');
```

Run:
```bash
npx tsc --noEmit
npx vitest run
```
Expected: TypeScript compiles clean, vitest reports "no test files found" (not an error).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts examples/hello.gft src/index.ts
git commit -m "chore: scaffold project with TypeScript, vitest, commander"
```

---

### Task 2: Token Types & Lexer

**Files:**
- Create: `src/lexer/tokens.ts`
- Create: `src/lexer/lexer.ts`
- Create: `src/errors/diagnostics.ts`
- Create: `tests/lexer.test.ts`

- [ ] **Step 1: Define error types**

Create `src/errors/diagnostics.ts`:
```typescript
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export class GraftError {
  constructor(
    public readonly message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
  ) {}

  format(source: string): string {
    const lines = source.split('\n');
    const line = lines[this.location.line - 1] || '';
    const pointer = ' '.repeat(this.location.column - 1) + '^';
    return [
      `${this.severity === 'error' ? '✗' : '⚠'} ${this.severity} at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

- [ ] **Step 2: Define token types**

Create `src/lexer/tokens.ts`:
```typescript
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
  LBrace = 'LBrace',         // {
  RBrace = 'RBrace',         // }
  LParen = 'LParen',         // (
  RParen = 'RParen',         // )
  LBracket = 'LBracket',     // [
  RBracket = 'RBracket',     // ]
  Colon = 'Colon',           // :
  Comma = 'Comma',           // ,
  Dot = 'Dot',               // .
  Arrow = 'Arrow',           // ->
  Pipe = 'Pipe',             // |
  Slash = 'Slash',           // /
  DotDot = 'DotDot',         // ..
  GreaterEqual = 'GreaterEqual', // >=
  Greater = 'Greater',       // >
  LessEqual = 'LessEqual',   // <=
  Less = 'Less',             // <
  EqualEqual = 'EqualEqual', // ==
  BangEqual = 'BangEqual',   // !=

  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  location: { line: number; column: number; offset: number };
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

- [ ] **Step 3: Write failing lexer tests**

Create `tests/lexer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

describe('Lexer', () => {
  it('tokenizes keywords', () => {
    const lexer = new Lexer('node edge graph context');
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Edge, TokenType.Graph, TokenType.Context, TokenType.EOF,
    ]);
  });

  it('tokenizes integer literals', () => {
    const lexer = new Lexer('42');
    const tokens = lexer.tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.IntegerLiteral, value: '42' });
  });

  it('tokenizes k-suffix integers', () => {
    const lexer = new Lexer('4k');
    const tokens = lexer.tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.KIntegerLiteral, value: '4k' });
  });

  it('tokenizes float literals', () => {
    const lexer = new Lexer('0.7');
    const tokens = lexer.tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.FloatLiteral, value: '0.7' });
  });

  it('tokenizes string literals', () => {
    const lexer = new Lexer('"hello world"');
    const tokens = lexer.tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.StringLiteral, value: 'hello world' });
  });

  it('tokenizes symbols', () => {
    const lexer = new Lexer('{ } ( ) [ ] : , . -> | / .. >= > <= < == !=');
    const tokens = lexer.tokenize();
    const types = tokens.slice(0, -1).map(t => t.type); // exclude EOF
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

  it('tokenizes identifiers (PascalCase and snake_case)', () => {
    const lexer = new Lexer('Analyzer risk_score');
    const tokens = lexer.tokenize();
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'Analyzer' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Identifier, value: 'risk_score' });
  });

  it('skips single-line comments', () => {
    const lexer = new Lexer('node // this is a comment\nedge');
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Edge, TokenType.EOF,
    ]);
  });

  it('skips multi-line comments', () => {
    const lexer = new Lexer('node /* skip\nthis */ edge');
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Edge, TokenType.EOF,
    ]);
  });

  it('tracks source locations', () => {
    const lexer = new Lexer('node\n  edge');
    const tokens = lexer.tokenize();
    expect(tokens[0].location).toEqual({ line: 1, column: 1, offset: 0 });
    expect(tokens[1].location).toEqual({ line: 2, column: 3, offset: 7 });
  });

  it('tokenizes budget shorthand', () => {
    const lexer = new Lexer('budget: 4k/2k');
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Budget, TokenType.Colon,
      TokenType.KIntegerLiteral, TokenType.Slash, TokenType.KIntegerLiteral,
      TokenType.EOF,
    ]);
  });

  it('tokenizes a minimal node declaration', () => {
    const source = 'node Analyzer(model: sonnet, budget: 5k/2k) {';
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.Node, TokenType.Identifier,
      TokenType.LParen,
      TokenType.Model, TokenType.Colon, TokenType.Identifier, TokenType.Comma,
      TokenType.Budget, TokenType.Colon, TokenType.KIntegerLiteral,
      TokenType.Slash, TokenType.KIntegerLiteral,
      TokenType.RParen, TokenType.LBrace, TokenType.EOF,
    ]);
  });

  it('distinguishes type keywords from identifiers', () => {
    const lexer = new Lexer('String Int Float Bool List Map Optional');
    const tokens = lexer.tokenize();
    expect(tokens.map(t => t.type)).toEqual([
      TokenType.String, TokenType.Int, TokenType.Float, TokenType.Bool,
      TokenType.List, TokenType.Map, TokenType.Optional, TokenType.EOF,
    ]);
  });

  it('reports error on unterminated string', () => {
    const lexer = new Lexer('"unterminated');
    expect(() => lexer.tokenize()).toThrow(/unterminated string/i);
  });

  it('reports error on unexpected character', () => {
    const lexer = new Lexer('node @');
    expect(() => lexer.tokenize()).toThrow(/unexpected character/i);
  });

  it('handles on_failure as a single keyword', () => {
    const lexer = new Lexer('on_failure');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toEqual(TokenType.OnFailure);
  });

  it('handles max_tokens as a single keyword', () => {
    const lexer = new Lexer('max_tokens');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toEqual(TokenType.MaxTokens);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/lexer.test.ts
```
Expected: FAIL — `../src/lexer/lexer.js` module not found.

- [ ] **Step 5: Implement the Lexer**

Create `src/lexer/lexer.ts`:
```typescript
import { Token, TokenType, KEYWORDS } from './tokens.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

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
    this.pos += 2; // skip //
    this.column += 2;
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.pos++;
      this.column++;
    }
  }

  private skipBlockComment(): void {
    this.pos += 2; // skip /*
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
    throw new GraftError('Unterminated block comment', this.location());
  }

  private readString(): void {
    const loc = this.location();
    this.pos++; // skip opening "
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
    this.pos++; // skip closing "
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

    // Check for float
    if (this.pos < this.source.length && this.source[this.pos] === '.') {
      // Look ahead: if next is another '.', this is DotDot, not a float
      if (this.peek(1) === '.') {
        this.tokens.push({ type: TokenType.IntegerLiteral, value, location: loc });
        return;
      }
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
    if (keywordType !== undefined) {
      this.tokens.push({ type: keywordType, value, location: loc });
    } else {
      this.tokens.push({ type: TokenType.Identifier, value, location: loc });
    }
  }

  private readSymbol(): boolean {
    const loc = this.location();
    const ch = this.source[this.pos];
    const next = this.peek(1);

    // Two-character symbols
    if (ch === '-' && next === '>') {
      this.tokens.push({ type: TokenType.Arrow, value: '->', location: loc });
      this.pos += 2; this.column += 2; return true;
    }
    if (ch === '>' && next === '=') {
      this.tokens.push({ type: TokenType.GreaterEqual, value: '>=', location: loc });
      this.pos += 2; this.column += 2; return true;
    }
    if (ch === '<' && next === '=') {
      this.tokens.push({ type: TokenType.LessEqual, value: '<=', location: loc });
      this.pos += 2; this.column += 2; return true;
    }
    if (ch === '=' && next === '=') {
      this.tokens.push({ type: TokenType.EqualEqual, value: '==', location: loc });
      this.pos += 2; this.column += 2; return true;
    }
    if (ch === '!' && next === '=') {
      this.tokens.push({ type: TokenType.BangEqual, value: '!=', location: loc });
      this.pos += 2; this.column += 2; return true;
    }
    if (ch === '.' && next === '.') {
      this.tokens.push({ type: TokenType.DotDot, value: '..', location: loc });
      this.pos += 2; this.column += 2; return true;
    }

    // Single-character symbols
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

    const singleType = SINGLE_CHAR[ch];
    if (singleType !== undefined) {
      this.tokens.push({ type: singleType, value: ch, location: loc });
      this.pos++; this.column++; return true;
    }

    return false;
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

- [ ] **Step 6: Run lexer tests**

```bash
npx vitest run tests/lexer.test.ts
```
Expected: All 16 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lexer/ src/errors/ tests/lexer.test.ts
git commit -m "feat: implement lexer with token types, k-suffix, comments"
```

---

### Task 3: AST Types

**Files:**
- Create: `src/parser/ast.ts`

- [ ] **Step 1: Define AST node types**

Create `src/parser/ast.ts`:
```typescript
import { SourceLocation } from '../errors/diagnostics.js';

// Top-level program
export interface Program {
  contexts: ContextDecl[];
  nodes: NodeDecl[];
  edges: EdgeDecl[];
  graphs: GraphDecl[];
}

// context TaskSpec(max_tokens: 1k) { ... }
export interface ContextDecl {
  name: string;
  maxTokens: number;
  fields: Field[];
  location: SourceLocation;
}

// node Analyzer(model: sonnet, budget: 5k/2k) { ... }
export interface NodeDecl {
  name: string;
  model: string;
  budgetIn: number;
  budgetOut: number;
  reads: ContextRef[];
  tools: string[];
  onFailure?: FailureStrategy;
  produces: ProducesDecl;
  location: SourceLocation;
}

// produces Research { ... }
export interface ProducesDecl {
  name: string;
  fields: Field[];
  location: SourceLocation;
}

// edge Analyzer -> Reviewer | select(...) | compact
export interface EdgeDecl {
  source: string;
  target: EdgeTarget;
  transforms: Transform[];
  location: SourceLocation;
}

export type EdgeTarget =
  | { kind: 'direct'; node: string }
  | { kind: 'conditional'; branches: ConditionalBranch[] };

export interface ConditionalBranch {
  condition?: Condition;  // absent = else branch
  target: string;
}

// graph SimpleQA(...) { Researcher -> Writer -> done }
export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  flow: string[];  // v1: sequential node names, ending with 'done' excluded
  location: SourceLocation;
}

// Schema fields
export interface Field {
  name: string;
  type: TypeExpr;
  location: SourceLocation;
}

// Type expressions
export type TypeExpr =
  | { kind: 'primitive'; name: string }
  | { kind: 'primitive_range'; name: string; min: number; max: number }
  | { kind: 'list'; element: TypeExpr }
  | { kind: 'map'; key: TypeExpr; value: TypeExpr }
  | { kind: 'optional'; inner: TypeExpr }
  | { kind: 'token_bounded'; inner: TypeExpr; max: number }
  | { kind: 'enum'; values: string[] }
  | { kind: 'struct'; name: string; fields: Field[] }
  | { kind: 'domain'; name: string };

// Context references in reads
export interface ContextRef {
  context: string;
  field?: string;  // partial read: Research.findings
  location: SourceLocation;
}

// Conditions (edge routing, filter)
export interface Condition {
  field: string;
  op: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value: string | number | boolean;
}

// Transform operations on edges
export type Transform =
  | { type: 'select'; field: string }
  | { type: 'filter'; field: string; condition: Condition }
  | { type: 'drop'; field: string }
  | { type: 'compact' }
  | { type: 'truncate'; tokens: number };

// Failure strategies
export type FailureStrategy =
  | { type: 'retry'; max: number }
  | { type: 'fallback'; node: string }
  | { type: 'retry_then_fallback'; max: number; node: string }
  | { type: 'skip' }
  | { type: 'abort' };
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/parser/ast.ts
git commit -m "feat: define AST node types for Graft v1 grammar"
```

---

### Task 4: Parser

**Files:**
- Create: `src/parser/parser.ts`
- Create: `tests/parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `tests/parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source);
  return parser.parse();
}

describe('Parser', () => {
  describe('context', () => {
    it('parses a basic context declaration', () => {
      const program = parse(`
        context UserRequest(max_tokens: 500) {
          question: String
        }
      `);
      expect(program.contexts).toHaveLength(1);
      const ctx = program.contexts[0];
      expect(ctx.name).toBe('UserRequest');
      expect(ctx.maxTokens).toBe(500);
      expect(ctx.fields).toHaveLength(1);
      expect(ctx.fields[0].name).toBe('question');
      expect(ctx.fields[0].type).toEqual({ kind: 'primitive', name: 'String' });
    });

    it('parses context with k-suffix max_tokens', () => {
      const program = parse(`
        context Spec(max_tokens: 1k) {
          name: String
        }
      `);
      expect(program.contexts[0].maxTokens).toBe(1000);
    });

    it('parses context with multiple fields and collection types', () => {
      const program = parse(`
        context TaskSpec(max_tokens: 1k) {
          description: String
          criteria: List<String>
          issues: List<IssueRef>
        }
      `);
      const ctx = program.contexts[0];
      expect(ctx.fields).toHaveLength(3);
      expect(ctx.fields[1].type).toEqual({ kind: 'list', element: { kind: 'primitive', name: 'String' } });
      expect(ctx.fields[2].type).toEqual({ kind: 'list', element: { kind: 'domain', name: 'IssueRef' } });
    });
  });

  describe('node', () => {
    it('parses a basic node declaration', () => {
      const program = parse(`
        node Writer(model: haiku, budget: 1500/800) {
          reads: [UserRequest]

          produces Answer {
            response: String
          }
        }
      `);
      expect(program.nodes).toHaveLength(1);
      const node = program.nodes[0];
      expect(node.name).toBe('Writer');
      expect(node.model).toBe('haiku');
      expect(node.budgetIn).toBe(1500);
      expect(node.budgetOut).toBe(800);
      expect(node.reads).toHaveLength(1);
      expect(node.reads[0].context).toBe('UserRequest');
      expect(node.produces.name).toBe('Answer');
      expect(node.produces.fields).toHaveLength(1);
    });

    it('parses node with k-suffix budget', () => {
      const program = parse(`
        node Analyzer(model: sonnet, budget: 5k/2k) {
          reads: [TaskSpec]
          produces Result {
            score: Float(0..1)
          }
        }
      `);
      const node = program.nodes[0];
      expect(node.budgetIn).toBe(5000);
      expect(node.budgetOut).toBe(2000);
    });

    it('parses node with partial reads', () => {
      const program = parse(`
        node Writer(model: haiku, budget: 1k/500) {
          reads: [Research.findings]
          produces Answer {
            response: String
          }
        }
      `);
      expect(program.nodes[0].reads[0]).toMatchObject({
        context: 'Research',
        field: 'findings',
      });
    });

    it('parses node with tools and on_failure', () => {
      const program = parse(`
        node Impl(model: sonnet, budget: 8k/4k) {
          reads: [Plan]
          tools: [file_read, file_write, terminal]
          on_failure: retry(2)
          produces Implementation {
            files: List<FileDiff>
          }
        }
      `);
      const node = program.nodes[0];
      expect(node.tools).toEqual(['file_read', 'file_write', 'terminal']);
      expect(node.onFailure).toEqual({ type: 'retry', max: 2 });
    });

    it('parses node with inline struct type', () => {
      const program = parse(`
        node Analyzer(model: sonnet, budget: 5k/2k) {
          reads: [TaskSpec]
          produces AnalysisResult {
            issues: List<Issue {
              file: FilePath
              severity: enum(low, medium, high)
            }>
          }
        }
      `);
      const issueType = program.nodes[0].produces.fields[0].type;
      expect(issueType.kind).toBe('list');
      if (issueType.kind === 'list') {
        expect(issueType.element.kind).toBe('struct');
        if (issueType.element.kind === 'struct') {
          expect(issueType.element.name).toBe('Issue');
          expect(issueType.element.fields).toHaveLength(2);
        }
      }
    });

    it('parses node with fallback failure strategy', () => {
      const program = parse(`
        node Main(model: opus, budget: 10k/5k) {
          reads: [Spec]
          on_failure: retry(2, fallback(Simple))
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({
        type: 'retry_then_fallback',
        max: 2,
        node: 'Simple',
      });
    });
  });

  describe('edge', () => {
    it('parses a simple edge', () => {
      const program = parse('edge Researcher -> Writer');
      expect(program.edges).toHaveLength(1);
      const edge = program.edges[0];
      expect(edge.source).toBe('Researcher');
      expect(edge.target).toEqual({ kind: 'direct', node: 'Writer' });
      expect(edge.transforms).toEqual([]);
    });

    it('parses edge with pipe transforms', () => {
      const program = parse(`
        edge Analyzer -> Reviewer
          | select(findings)
          | drop(reasoning_trace)
          | compact
      `);
      const edge = program.edges[0];
      expect(edge.transforms).toEqual([
        { type: 'select', field: 'findings' },
        { type: 'drop', field: 'reasoning_trace' },
        { type: 'compact' },
      ]);
    });

    it('parses edge with filter transform', () => {
      const program = parse(`
        edge Analyzer -> Reviewer
          | filter(issues, severity >= medium)
      `);
      const edge = program.edges[0];
      expect(edge.transforms).toEqual([
        { type: 'filter', field: 'issues', condition: { field: 'severity', op: '>=', value: 'medium' } },
      ]);
    });

    it('parses edge with truncate', () => {
      const program = parse(`
        edge A -> B
          | truncate(500)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'truncate', tokens: 500 },
      ]);
    });

    it('parses conditional edge routing', () => {
      const program = parse(`
        edge Analyzer -> {
          when risk_score > 0.7 -> DetailedReviewer
          when risk_score > 0.3 -> StandardReviewer
          else -> AutoApprove
        }
      `);
      const edge = program.edges[0];
      expect(edge.target).toEqual({
        kind: 'conditional',
        branches: [
          { condition: { field: 'risk_score', op: '>', value: 0.7 }, target: 'DetailedReviewer' },
          { condition: { field: 'risk_score', op: '>', value: 0.3 }, target: 'StandardReviewer' },
          { condition: undefined, target: 'AutoApprove' },
        ],
      });
    });
  });

  describe('graph', () => {
    it('parses a basic graph', () => {
      const program = parse(`
        graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
          Researcher -> Writer -> done
        }
      `);
      expect(program.graphs).toHaveLength(1);
      const graph = program.graphs[0];
      expect(graph.name).toBe('SimpleQA');
      expect(graph.input).toBe('UserRequest');
      expect(graph.output).toBe('Answer');
      expect(graph.budget).toBe(6000);
      expect(graph.flow).toEqual(['Researcher', 'Writer']);
    });
  });

  describe('full program', () => {
    it('parses hello.gft', () => {
      const source = `
        context UserRequest(max_tokens: 500) {
          question: String
        }

        node Researcher(model: sonnet, budget: 2k/1k) {
          reads: [UserRequest]
          produces Research {
            findings: List<String>
            confidence: Float(0..1)
          }
        }

        node Writer(model: haiku, budget: 1500/800) {
          reads: [Research.findings]
          produces Answer {
            response: String
          }
        }

        edge Researcher -> Writer
          | select(findings)
          | compact

        graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
          Researcher -> Writer -> done
        }
      `;
      const program = parse(source);
      expect(program.contexts).toHaveLength(1);
      expect(program.nodes).toHaveLength(2);
      expect(program.edges).toHaveLength(1);
      expect(program.graphs).toHaveLength(1);
    });
  });

  describe('type expressions', () => {
    it('parses Optional type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          notes: Optional<String>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'optional',
        inner: { kind: 'primitive', name: 'String' },
      });
    });

    it('parses Map type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          data: Map<String, Int>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'map',
        key: { kind: 'primitive', name: 'String' },
        value: { kind: 'primitive', name: 'Int' },
      });
    });

    it('parses TokenBounded type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          summary: TokenBounded<String, 100>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'token_bounded',
        inner: { kind: 'primitive', name: 'String' },
        max: 100,
      });
    });

    it('parses Float with range', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          score: Float(0..1)
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'primitive_range',
        name: 'Float',
        min: 0,
        max: 1,
      });
    });
  });

  describe('error handling', () => {
    it('reports error on missing closing brace', () => {
      expect(() => parse('context Spec(max_tokens: 500) {')).toThrow();
    });

    it('reports error on unexpected token', () => {
      expect(() => parse('node 123')).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/parser.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Parser**

Create `src/parser/parser.ts`:
```typescript
import { Token, TokenType } from '../lexer/tokens.js';
import { GraftError } from '../errors/diagnostics.js';
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl,
  Field, TypeExpr, ContextRef, ProducesDecl,
  Transform, Condition, FailureStrategy,
  EdgeTarget, ConditionalBranch,
} from './ast.js';

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private source: string;

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens;
    this.source = source;
  }

  parse(): Program {
    const program: Program = {
      contexts: [],
      nodes: [],
      edges: [],
      graphs: [],
    };

    while (!this.isAtEnd()) {
      const token = this.current();
      switch (token.type) {
        case TokenType.Context:
          program.contexts.push(this.parseContext());
          break;
        case TokenType.Node:
          program.nodes.push(this.parseNode());
          break;
        case TokenType.Edge:
          program.edges.push(this.parseEdge());
          break;
        case TokenType.Graph:
          program.graphs.push(this.parseGraph());
          break;
        default:
          throw this.error(`Unexpected token '${token.value}', expected 'context', 'node', 'edge', or 'graph'`);
      }
    }

    return program;
  }

  // ─── Context ────────────────────────────────────

  private parseContext(): ContextDecl {
    const loc = this.current().location;
    this.expect(TokenType.Context);
    const name = this.expectIdentifier();

    // Parameters: (max_tokens: <Int>)
    this.expect(TokenType.LParen);
    this.expect(TokenType.MaxTokens);
    this.expect(TokenType.Colon);
    const maxTokens = this.parseTokenValue();
    this.expect(TokenType.RParen);

    // Body: { fields }
    this.expect(TokenType.LBrace);
    const fields = this.parseFields();
    this.expect(TokenType.RBrace);

    return { name, maxTokens, fields, location: loc };
  }

  // ─── Node ───────────────────────────────────────

  private parseNode(): NodeDecl {
    const loc = this.current().location;
    this.expect(TokenType.Node);
    const name = this.expectIdentifier();

    // Parameters: (model: <id>, budget: <in>/<out>)
    this.expect(TokenType.LParen);
    this.expect(TokenType.Model);
    this.expect(TokenType.Colon);
    const model = this.expectIdentifier();
    this.expect(TokenType.Comma);
    this.expect(TokenType.Budget);
    this.expect(TokenType.Colon);
    const budgetIn = this.parseTokenValue();
    this.expect(TokenType.Slash);
    const budgetOut = this.parseTokenValue();
    this.expect(TokenType.RParen);

    // Body
    this.expect(TokenType.LBrace);

    let reads: ContextRef[] = [];
    let tools: string[] = [];
    let onFailure: FailureStrategy | undefined;
    let produces: ProducesDecl | undefined;

    while (!this.check(TokenType.RBrace)) {
      if (this.check(TokenType.Reads)) {
        this.advance();
        this.expect(TokenType.Colon);
        reads = this.parseContextRefList();
      } else if (this.check(TokenType.Tools)) {
        this.advance();
        this.expect(TokenType.Colon);
        tools = this.parseIdentifierList();
      } else if (this.check(TokenType.OnFailure)) {
        this.advance();
        this.expect(TokenType.Colon);
        onFailure = this.parseFailureStrategy();
      } else if (this.check(TokenType.Produces)) {
        this.advance();
        produces = this.parseProduces();
      } else {
        throw this.error(`Unexpected token '${this.current().value}' in node body`);
      }
    }
    this.expect(TokenType.RBrace);

    if (!produces) {
      throw new GraftError('Node must have a produces declaration', loc);
    }

    return { name, model, budgetIn, budgetOut, reads, tools, onFailure, produces, location: loc };
  }

  private parseProduces(): ProducesDecl {
    const loc = this.current().location;
    const name = this.expectIdentifier();
    this.expect(TokenType.LBrace);
    const fields = this.parseFields();
    this.expect(TokenType.RBrace);
    return { name, fields, location: loc };
  }

  private parseContextRefList(): ContextRef[] {
    this.expect(TokenType.LBracket);
    const refs: ContextRef[] = [];
    while (!this.check(TokenType.RBracket)) {
      if (refs.length > 0) this.expect(TokenType.Comma);
      const loc = this.current().location;
      const context = this.expectIdentifier();
      let field: string | undefined;
      if (this.check(TokenType.Dot)) {
        this.advance();
        field = this.expectIdentifier();
      }
      refs.push({ context, field, location: loc });
    }
    this.expect(TokenType.RBracket);
    return refs;
  }

  private parseIdentifierList(): string[] {
    this.expect(TokenType.LBracket);
    const ids: string[] = [];
    while (!this.check(TokenType.RBracket)) {
      if (ids.length > 0) this.expect(TokenType.Comma);
      ids.push(this.expectIdentifier());
    }
    this.expect(TokenType.RBracket);
    return ids;
  }

  private parseFailureStrategy(): FailureStrategy {
    if (this.check(TokenType.Retry)) {
      this.advance();
      this.expect(TokenType.LParen);
      const max = this.parseIntValue();
      // Check for: retry(2, fallback(NodeName))
      if (this.check(TokenType.Comma)) {
        this.advance();
        this.expect(TokenType.Fallback);
        this.expect(TokenType.LParen);
        const node = this.expectIdentifier();
        this.expect(TokenType.RParen);
        this.expect(TokenType.RParen);
        return { type: 'retry_then_fallback', max, node };
      }
      this.expect(TokenType.RParen);
      return { type: 'retry', max };
    }
    if (this.check(TokenType.Fallback)) {
      this.advance();
      this.expect(TokenType.LParen);
      const node = this.expectIdentifier();
      this.expect(TokenType.RParen);
      return { type: 'fallback', node };
    }
    if (this.check(TokenType.Skip)) {
      this.advance();
      return { type: 'skip' };
    }
    if (this.check(TokenType.Abort)) {
      this.advance();
      return { type: 'abort' };
    }
    throw this.error('Expected failure strategy (retry, fallback, skip, abort)');
  }

  // ─── Edge ───────────────────────────────────────

  private parseEdge(): EdgeDecl {
    const loc = this.current().location;
    this.expect(TokenType.Edge);
    const source = this.expectIdentifier();
    this.expect(TokenType.Arrow);

    let target: EdgeTarget;
    let transforms: Transform[] = [];

    if (this.check(TokenType.LBrace)) {
      // Conditional routing
      target = this.parseConditionalTarget();
    } else {
      // Direct target
      const node = this.expectIdentifier();
      target = { kind: 'direct', node };

      // Parse pipe transforms
      while (this.check(TokenType.Pipe)) {
        this.advance();
        transforms.push(this.parseTransform());
      }
    }

    return { source, target, transforms, location: loc };
  }

  private parseConditionalTarget(): EdgeTarget {
    this.expect(TokenType.LBrace);
    const branches: ConditionalBranch[] = [];
    while (!this.check(TokenType.RBrace)) {
      if (this.check(TokenType.When)) {
        this.advance();
        const condition = this.parseCondition();
        this.expect(TokenType.Arrow);
        const target = this.expectIdentifier();
        branches.push({ condition, target });
      } else if (this.check(TokenType.Else)) {
        this.advance();
        this.expect(TokenType.Arrow);
        const target = this.expectIdentifier();
        branches.push({ condition: undefined, target });
      } else {
        throw this.error(`Expected 'when' or 'else' in conditional edge`);
      }
    }
    this.expect(TokenType.RBrace);
    return { kind: 'conditional', branches };
  }

  private parseTransform(): Transform {
    if (this.check(TokenType.Select)) {
      this.advance();
      this.expect(TokenType.LParen);
      const field = this.expectIdentifier();
      this.expect(TokenType.RParen);
      return { type: 'select', field };
    }
    if (this.check(TokenType.Filter)) {
      this.advance();
      this.expect(TokenType.LParen);
      const field = this.expectIdentifier();
      this.expect(TokenType.Comma);
      const condition = this.parseCondition();
      this.expect(TokenType.RParen);
      return { type: 'filter', field, condition };
    }
    if (this.check(TokenType.Drop)) {
      this.advance();
      this.expect(TokenType.LParen);
      const field = this.expectIdentifier();
      this.expect(TokenType.RParen);
      return { type: 'drop', field };
    }
    if (this.check(TokenType.Compact)) {
      this.advance();
      return { type: 'compact' };
    }
    if (this.check(TokenType.Truncate)) {
      this.advance();
      this.expect(TokenType.LParen);
      const tokens = this.parseTokenValue();
      this.expect(TokenType.RParen);
      return { type: 'truncate', tokens };
    }
    throw this.error('Expected transform operation (select, filter, drop, compact, truncate)');
  }

  private parseCondition(): Condition {
    const field = this.expectIdentifier();
    const opToken = this.current();
    let op: Condition['op'];
    switch (opToken.type) {
      case TokenType.GreaterEqual: op = '>='; break;
      case TokenType.Greater: op = '>'; break;
      case TokenType.LessEqual: op = '<='; break;
      case TokenType.Less: op = '<'; break;
      case TokenType.EqualEqual: op = '=='; break;
      case TokenType.BangEqual: op = '!='; break;
      default:
        throw this.error(`Expected comparison operator, got '${opToken.value}'`);
    }
    this.advance();

    const value = this.parseConditionValue();
    return { field, op, value };
  }

  private parseConditionValue(): string | number | boolean {
    const token = this.current();
    if (token.type === TokenType.IntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10);
    }
    if (token.type === TokenType.KIntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10) * 1000;
    }
    if (token.type === TokenType.FloatLiteral) {
      this.advance();
      return parseFloat(token.value);
    }
    if (token.type === TokenType.StringLiteral) {
      this.advance();
      return token.value;
    }
    if (token.type === TokenType.True) {
      this.advance();
      return true;
    }
    if (token.type === TokenType.False) {
      this.advance();
      return false;
    }
    // Allow bare identifiers as string values (e.g., severity >= medium)
    if (token.type === TokenType.Identifier) {
      this.advance();
      return token.value;
    }
    throw this.error(`Expected value in condition, got '${token.value}'`);
  }

  // ─── Graph ──────────────────────────────────────

  private parseGraph(): GraphDecl {
    const loc = this.current().location;
    this.expect(TokenType.Graph);
    const name = this.expectIdentifier();

    // Parameters: (input: X, output: Y, budget: Nk)
    this.expect(TokenType.LParen);
    this.expect(TokenType.Input);
    this.expect(TokenType.Colon);
    const input = this.expectIdentifier();
    this.expect(TokenType.Comma);
    this.expect(TokenType.Output);
    this.expect(TokenType.Colon);
    const output = this.expectIdentifier();
    this.expect(TokenType.Comma);
    this.expect(TokenType.Budget);
    this.expect(TokenType.Colon);
    const budget = this.parseTokenValue();
    this.expect(TokenType.RParen);

    // Body: { Node -> Node -> done }
    this.expect(TokenType.LBrace);
    const flow: string[] = [];
    flow.push(this.expectIdentifier());
    while (this.check(TokenType.Arrow)) {
      this.advance();
      if (this.check(TokenType.Done)) {
        this.advance();
        break;
      }
      flow.push(this.expectIdentifier());
    }
    this.expect(TokenType.RBrace);

    return { name, input, output, budget, flow, location: loc };
  }

  // ─── Types ──────────────────────────────────────

  private parseType(): TypeExpr {
    const token = this.current();

    // List<T>
    if (token.type === TokenType.List) {
      this.advance();
      this.expect(TokenType.Less);
      // Check if next identifier is followed by '{' (inline struct)
      const element = this.parseTypeOrInlineStruct();
      this.expect(TokenType.Greater);
      return { kind: 'list', element };
    }

    // Map<K, V>
    if (token.type === TokenType.Map) {
      this.advance();
      this.expect(TokenType.Less);
      const key = this.parseType();
      this.expect(TokenType.Comma);
      const value = this.parseType();
      this.expect(TokenType.Greater);
      return { kind: 'map', key, value };
    }

    // Optional<T>
    if (token.type === TokenType.Optional) {
      this.advance();
      this.expect(TokenType.Less);
      const inner = this.parseTypeOrInlineStruct();
      this.expect(TokenType.Greater);
      return { kind: 'optional', inner };
    }

    // TokenBounded<T, max>
    if (token.type === TokenType.TokenBounded) {
      this.advance();
      this.expect(TokenType.Less);
      const inner = this.parseType();
      this.expect(TokenType.Comma);
      const max = this.parseIntValue();
      this.expect(TokenType.Greater);
      return { kind: 'token_bounded', inner, max };
    }

    // Float — could be Float or Float(min..max)
    if (token.type === TokenType.Float) {
      this.advance();
      if (this.check(TokenType.LParen)) {
        this.advance();
        const min = this.parseNumericValue();
        this.expect(TokenType.DotDot);
        const max = this.parseNumericValue();
        this.expect(TokenType.RParen);
        return { kind: 'primitive_range', name: 'Float', min, max };
      }
      return { kind: 'primitive', name: 'Float' };
    }

    // enum(val1, val2, ...)
    if (token.type === TokenType.Enum) {
      this.advance();
      this.expect(TokenType.LParen);
      const values: string[] = [];
      values.push(this.expectIdentifier());
      while (this.check(TokenType.Comma)) {
        this.advance();
        values.push(this.expectIdentifier());
      }
      this.expect(TokenType.RParen);
      return { kind: 'enum', values };
    }

    // Primitives
    if (token.type === TokenType.String) { this.advance(); return { kind: 'primitive', name: 'String' }; }
    if (token.type === TokenType.Int) { this.advance(); return { kind: 'primitive', name: 'Int' }; }
    if (token.type === TokenType.Bool) { this.advance(); return { kind: 'primitive', name: 'Bool' }; }

    // Domain types
    if (token.type === TokenType.FilePath) { this.advance(); return { kind: 'domain', name: 'FilePath' }; }
    if (token.type === TokenType.FileDiff) { this.advance(); return { kind: 'domain', name: 'FileDiff' }; }
    if (token.type === TokenType.TestFile) { this.advance(); return { kind: 'domain', name: 'TestFile' }; }
    if (token.type === TokenType.IssueRef) { this.advance(); return { kind: 'domain', name: 'IssueRef' }; }

    throw this.error(`Expected type, got '${token.value}'`);
  }

  // Parses a type that could be an inline struct: Name { fields }
  private parseTypeOrInlineStruct(): TypeExpr {
    // Check for Identifier followed by '{'
    if (this.current().type === TokenType.Identifier && this.peekType(1) === TokenType.LBrace) {
      const name = this.expectIdentifier();
      this.expect(TokenType.LBrace);
      const fields = this.parseFields();
      this.expect(TokenType.RBrace);
      return { kind: 'struct', name, fields };
    }
    return this.parseType();
  }

  // ─── Fields ─────────────────────────────────────

  private parseFields(): Field[] {
    const fields: Field[] = [];
    while (!this.check(TokenType.RBrace)) {
      const loc = this.current().location;
      const name = this.expectIdentifier();
      this.expect(TokenType.Colon);
      const type = this.parseTypeOrInlineStruct();
      fields.push({ name, type, location: loc });
    }
    return fields;
  }

  // ─── Helpers ────────────────────────────────────

  private parseTokenValue(): number {
    const token = this.current();
    if (token.type === TokenType.IntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10);
    }
    if (token.type === TokenType.KIntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10) * 1000;
    }
    throw this.error(`Expected integer or k-integer, got '${token.value}'`);
  }

  private parseIntValue(): number {
    const token = this.current();
    if (token.type === TokenType.IntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10);
    }
    throw this.error(`Expected integer, got '${token.value}'`);
  }

  private parseNumericValue(): number {
    const token = this.current();
    if (token.type === TokenType.IntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10);
    }
    if (token.type === TokenType.FloatLiteral) {
      this.advance();
      return parseFloat(token.value);
    }
    throw this.error(`Expected number, got '${token.value}'`);
  }

  private expectIdentifier(): string {
    const token = this.current();
    if (token.type === TokenType.Identifier) {
      this.advance();
      return token.value;
    }
    throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw this.error(`Expected '${type}', got '${token.value}' (${token.type})`);
    }
    this.advance();
    return token;
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    if (!this.isAtEnd()) this.pos++;
    return token;
  }

  private peekType(offset: number): TokenType | undefined {
    const idx = this.pos + offset;
    if (idx < this.tokens.length) return this.tokens[idx].type;
    return undefined;
  }

  private isAtEnd(): boolean {
    return this.current().type === TokenType.EOF;
  }

  private error(message: string): GraftError {
    return new GraftError(message, this.current().location);
  }
}
```

- [ ] **Step 4: Run parser tests**

```bash
npx vitest run tests/parser.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/ tests/parser.test.ts
git commit -m "feat: implement recursive descent parser for Graft v1 grammar"
```

---

### Task 5: Analyzer (Scope, Type, Token)

**Files:**
- Create: `src/analyzer/scope.ts`
- Create: `src/analyzer/types.ts`
- Create: `src/analyzer/tokens.ts`
- Create: `tests/analyzer.test.ts`

- [ ] **Step 1: Write failing analyzer tests**

Create `tests/analyzer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator, TokenReport } from '../src/analyzer/tokens.js';
import { Program } from '../src/parser/ast.js';
import { GraftError } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens, source).parse();
}

describe('ScopeChecker', () => {
  it('passes valid reads references', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) {
        question: String
      }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1k/500) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for undeclared context in reads', () => {
    const program = parse(`
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UnknownContext]
        produces Research { findings: List<String> }
      }
      graph Q(input: UnknownContext, output: Research, budget: 5k) {
        Researcher -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('UnknownContext');
  });

  it('reports error for invalid partial reference field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.nonexistent]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent');
  });

  it('reports error for undeclared node in edge', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      edge A -> GhostNode
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('GhostNode');
  });

  it('reports error for undeclared node in graph flow', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> MissingNode -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('MissingNode');
  });
});

describe('TypeChecker', () => {
  it('passes valid edge transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          findings: List<String>
          score: Float(0..1)
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.findings]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings)
        | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for select on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(nonexistent_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent_field');
  });

  it('reports error for drop on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | drop(ghost_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('ghost_field');
  });
});

describe('TokenEstimator', () => {
  it('estimates tokens for a simple pipeline', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
        | select(findings)
        | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
  });

  it('warns when worst case exceeds budget', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 3k/2k) {
        reads: [Spec]
        on_failure: retry(3)
        produces Out { data: String }
      }
      node B(model: haiku, budget: 3k/2k) {
        reads: [Out]
        on_failure: retry(3)
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/analyzer.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ScopeChecker**

Create `src/analyzer/scope.ts`:
```typescript
import { Program, EdgeTarget } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // nodeName/producesName -> field names

  constructor(program: Program) {
    this.program = program;
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.producesMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesMap.set(node.produces.name, fieldNames);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkNodeReads(errors);
    this.checkEdges(errors);
    this.checkGraphFlow(errors);
    return errors;
  }

  private checkNodeReads(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const ref of node.reads) {
        // ref.context could be a context name or a produces name
        const isContext = this.contextNames.has(ref.context);
        const isProduces = this.producesMap.has(ref.context);

        if (!isContext && !isProduces) {
          errors.push(new GraftError(
            `'${ref.context}' is not declared as a context or produces output`,
            ref.location,
          ));
          continue;
        }

        // Check partial reference field
        if (ref.field) {
          if (isContext) {
            const ctx = this.program.contexts.find(c => c.name === ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            if (!fieldNames.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in context '${ref.context}'`,
                ref.location,
              ));
            }
          } else if (isProduces) {
            const fields = this.producesMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in produces '${ref.context}'`,
                ref.location,
              ));
            }
          }
        }
      }
    }
  }

  private checkEdges(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      if (!this.nodeNames.has(edge.source)) {
        errors.push(new GraftError(
          `Edge source '${edge.source}' is not a declared node`,
          edge.location,
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.nodeNames.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (!this.nodeNames.has(branch.target)) {
            errors.push(new GraftError(
              `Edge target '${branch.target}' is not a declared node`,
              edge.location,
            ));
          }
        }
      }
    }
  }

  private checkGraphFlow(errors: GraftError[]): void {
    for (const graph of this.program.graphs) {
      for (const nodeName of graph.flow) {
        if (!this.nodeNames.has(nodeName)) {
          errors.push(new GraftError(
            `Node '${nodeName}' in graph flow is not declared`,
            graph.location,
          ));
        }
      }
    }
  }
}
```

- [ ] **Step 4: Implement TypeChecker**

Create `src/analyzer/types.ts`:
```typescript
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class TypeChecker {
  private program: Program;
  private producesFieldsMap: Map<string, Set<string>>; // node source name -> produces field names

  constructor(program: Program) {
    this.program = program;
    this.producesFieldsMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesFieldsMap.set(node.name, fieldNames);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkEdgeTransforms(errors);
    return errors;
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        if (transform.type === 'select') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `select: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
            ));
          }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Implement TokenEstimator**

Create `src/analyzer/tokens.ts`:
```typescript
import { Program, NodeDecl, EdgeDecl, Transform } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export interface NodeTokenReport {
  name: string;
  estimatedIn: number;
  estimatedOut: number;
}

export interface TokenReport {
  graphName: string;
  budget: number;
  bestCase: number;
  worstCase: number;
  nodes: NodeTokenReport[];
  warnings: GraftError[];
}

export class TokenEstimator {
  private program: Program;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl>; // "source->target" key

  constructor(program: Program) {
    this.program = program;
    this.nodeMap = new Map();
    this.edgeMap = new Map();

    for (const node of program.nodes) {
      this.nodeMap.set(node.name, node);
    }
    for (const edge of program.edges) {
      if (edge.target.kind === 'direct') {
        this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
      }
    }
  }

  estimate(): TokenReport {
    const graph = this.program.graphs[0]; // v1: single graph
    if (!graph) {
      return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
    }

    const warnings: GraftError[] = [];
    const nodeReports: NodeTokenReport[] = [];
    let bestCase = 0;
    let worstCase = 0;

    for (let i = 0; i < graph.flow.length; i++) {
      const nodeName = graph.flow[i];
      const node = this.nodeMap.get(nodeName);
      if (!node) continue;

      // Estimate input: sum of reads token costs
      let estimatedIn = 0;
      for (const ref of node.reads) {
        // If reading a context
        const ctx = this.program.contexts.find(c => c.name === ref.context);
        if (ctx) {
          estimatedIn += ref.field ? Math.floor(ctx.maxTokens * 0.3) : ctx.maxTokens;
          continue;
        }
        // If reading a produces output from upstream node
        const sourceNode = this.program.nodes.find(n => n.produces.name === ref.context);
        if (sourceNode) {
          let upstreamTokens = sourceNode.budgetOut;
          // Check for edge transform reductions
          const edgeKey = `${sourceNode.name}->${nodeName}`;
          const edge = this.edgeMap.get(edgeKey);
          if (edge) {
            upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
          }
          estimatedIn += ref.field ? Math.floor(upstreamTokens * 0.3) : upstreamTokens;
        }
      }

      const estimatedOut = node.budgetOut;
      const nodeTokens = estimatedIn + estimatedOut;
      bestCase += nodeTokens;

      // Worst case: account for retries
      const retryMultiplier = this.getRetryMultiplier(node);
      worstCase += nodeTokens * retryMultiplier;

      nodeReports.push({ name: nodeName, estimatedIn, estimatedOut });
    }

    if (worstCase > graph.budget) {
      warnings.push(new GraftError(
        `Worst-case token usage (${worstCase.toLocaleString()}) exceeds budget (${graph.budget.toLocaleString()})`,
        graph.location,
        'warning',
      ));
    }

    return {
      graphName: graph.name,
      budget: graph.budget,
      bestCase,
      worstCase,
      nodes: nodeReports,
      warnings,
    };
  }

  private applyTransformReductions(tokens: number, transforms: Transform[]): number {
    let result = tokens;
    for (const t of transforms) {
      switch (t.type) {
        case 'select':
          result = Math.floor(result * 0.3); // keep ~one field
          break;
        case 'filter':
          result = Math.floor(result * 0.5); // filter reduces ~50%
          break;
        case 'drop':
          result = Math.floor(result * 0.85); // drop one field ~15% savings
          break;
        case 'compact':
          result = Math.floor(result * 0.7); // compact ~30% reduction
          break;
        case 'truncate':
          result = Math.min(result, t.tokens);
          break;
      }
    }
    return result;
  }

  private getRetryMultiplier(node: NodeDecl): number {
    if (!node.onFailure) return 1;
    switch (node.onFailure.type) {
      case 'retry':
        return 1 + node.onFailure.max;
      case 'retry_then_fallback':
        return 1 + node.onFailure.max;
      default:
        return 1;
    }
  }
}
```

- [ ] **Step 6: Run analyzer tests**

```bash
npx vitest run tests/analyzer.test.ts
```
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/analyzer/ tests/analyzer.test.ts
git commit -m "feat: implement analyzer (scope, type, token estimation)"
```

---

### Task 6: Code Generator

**Files:**
- Create: `src/codegen/agents.ts`
- Create: `src/codegen/hooks.ts`
- Create: `src/codegen/orchestration.ts`
- Create: `src/codegen/settings.ts`
- Create: `src/codegen/codegen.ts`
- Create: `tests/codegen.test.ts`

- [ ] **Step 1: Write failing codegen tests**

Create `tests/codegen.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { generateAgent } from '../src/codegen/agents.js';
import { generateHook } from '../src/codegen/hooks.js';
import { generateOrchestration } from '../src/codegen/orchestration.js';
import { generateSettings } from '../src/codegen/settings.js';
import { Program } from '../src/parser/ast.js';
import { TokenReport } from '../src/analyzer/tokens.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens, source).parse();
}

describe('generateAgent', () => {
  it('generates agent markdown for a node', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Research {
          findings: List<String>
          confidence: Float(0..1)
        }
      }
      graph G(input: Spec, output: Research, budget: 5k) { Researcher -> done }
    `);
    const node = program.nodes[0];
    const md = generateAgent(node);

    expect(md).toContain('name: researcher');
    expect(md).toContain('claude-sonnet-4-20250514');
    expect(md).toContain('# Researcher Agent');
    expect(md).toContain('"findings"');
    expect(md).toContain('"confidence"');
    expect(md).toContain('2000'); // budgetIn
    expect(md).toContain('1000'); // budgetOut
    expect(md).toContain('===NODE_COMPLETE:researcher===');
  });

  it('includes tools in frontmatter', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Impl(model: sonnet, budget: 8k/4k) {
        reads: [Spec]
        tools: [file_read, file_write, terminal]
        produces Out { files: List<FileDiff> }
      }
      graph G(input: Spec, output: Out, budget: 15k) { Impl -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('Read');
    expect(md).toContain('Write');
    expect(md).toContain('Edit');
    expect(md).toContain('Bash');
  });

  it('includes failure protocol', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: retry(2)
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('retry');
    expect(md).toContain('2');
  });
});

describe('generateHook', () => {
  it('generates bash hook script for edge with transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String>, score: Float(0..1) }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings)
        | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const edge = program.edges[0];
    const sh = generateHook(edge);

    expect(sh).toContain('#!/bin/bash');
    expect(sh).toContain('set -euo pipefail');
    expect(sh).toContain('a.json');
    expect(sh).toContain('a_to_b.json');
    expect(sh).toContain('jq');
    expect(sh).toContain('findings');
  });

  it('returns null for edge without transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).toBeNull();
  });
});

describe('generateOrchestration', () => {
  it('generates CLAUDE.md with execution plan', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer | select(findings) | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const report: TokenReport = {
      graphName: 'SimpleQA',
      budget: 6000,
      bestCase: 5300,
      worstCase: 5300,
      nodes: [
        { name: 'Researcher', estimatedIn: 2000, estimatedOut: 1000 },
        { name: 'Writer', estimatedIn: 1500, estimatedOut: 800 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);

    expect(md).toContain('Graft Orchestration: SimpleQA');
    expect(md).toContain('6,000');
    expect(md).toContain('Researcher');
    expect(md).toContain('Writer');
    expect(md).toContain('Step 1');
    expect(md).toContain('Step 2');
    expect(md).toContain('===NODE_COMPLETE:researcher===');
  });
});

describe('generateSettings', () => {
  it('generates settings.json with model routing', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');

    expect(settings.model).toBe('claude-sonnet-4-20250514');
    expect(settings.graft.budget.total).toBe(5000);
    expect(settings.graft.model_routing.overrides.b).toBe('claude-haiku-4-5-20251001');
    expect(settings.hooks).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/codegen.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement generateAgent**

Create `src/codegen/agents.ts`:
```typescript
import { NodeDecl, Field, TypeExpr } from '../parser/ast.js';

const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

const TOOL_MAP: Record<string, string[]> = {
  file_read: ['Read'],
  file_write: ['Write', 'Edit'],
  terminal: ['Bash'],
  ast_parse: ['Bash'],
  test_run: ['Bash'],
  lint: ['Bash'],
  browser: ['Bash'],
};

export function generateAgent(node: NodeDecl): string {
  const name = node.name.toLowerCase();
  const resolvedModel = MODEL_MAP[node.model] || node.model;
  const tools = resolveTools(node.tools);
  const jsonSchema = fieldsToJsonExample(node.produces.fields);
  const failureSection = formatFailure(node);

  return `---
name: ${name}
model: ${resolvedModel}
tools: [${tools.join(', ')}]
---

# ${node.name} Agent

## Context Loading
${formatReads(node)}

## Output Contract
Produce JSON output matching this schema:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

## Token Discipline
- Input budget: ${node.budgetIn} tokens. Read only what is necessary.
- Output budget: ${node.budgetOut} tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to \`.graft/session/node_outputs/${name}.json\`
2. Output: \`===NODE_COMPLETE:${name}===\`

${failureSection}`;
}

function resolveTools(tools: string[]): string[] {
  const resolved = new Set<string>();
  for (const tool of tools) {
    const mapped = TOOL_MAP[tool];
    if (mapped) {
      for (const t of mapped) resolved.add(t);
    } else {
      resolved.add(tool);
    }
  }
  return [...resolved];
}

function formatReads(node: NodeDecl): string {
  if (node.reads.length === 0) return 'No external context required.';
  return node.reads.map(ref => {
    if (ref.field) {
      return `- Load \`${ref.context}.${ref.field}\` from \`.graft/session/\``;
    }
    return `- Load \`${ref.context}\` from \`.graft/session/\``;
  }).join('\n');
}

function formatFailure(node: NodeDecl): string {
  if (!node.onFailure) {
    return `## Failure Protocol\nOn failure, output: \`===NODE_FAILED:${node.name.toLowerCase()}===\``;
  }
  const name = node.name.toLowerCase();
  switch (node.onFailure.type) {
    case 'retry':
      return `## Failure Protocol\nRetry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, output: \`===NODE_FAILED:${name}===\``;
    case 'fallback':
      return `## Failure Protocol\nOn failure, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
    case 'retry_then_fallback':
      return `## Failure Protocol\nRetry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
    case 'skip':
      return `## Failure Protocol\nOn failure, skip this node. Output: \`===NODE_SKIPPED:${name}===\``;
    case 'abort':
      return `## Failure Protocol\nOn failure, abort the entire pipeline. Output: \`===PIPELINE_ABORTED:${name}===\``;
  }
}

function fieldsToJsonExample(fields: Field[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = typeToExample(field.type);
  }
  return obj;
}

function typeToExample(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return '<string>';
        case 'Int': return 0;
        case 'Float': return 0.0;
        case 'Bool': return false;
        default: return '<unknown>';
      }
    case 'primitive_range':
      return type.min;
    case 'list':
      return [typeToExample(type.element)];
    case 'map':
      return {};
    case 'optional':
      return typeToExample(type.inner);
    case 'token_bounded':
      return typeToExample(type.inner);
    case 'enum':
      return type.values.join('|');
    case 'struct':
      return fieldsToJsonExample(type.fields);
    case 'domain':
      return `<${type.name}>`;
  }
}
```

- [ ] **Step 4: Implement generateHook**

Create `src/codegen/hooks.ts`:
```typescript
import { EdgeDecl, Transform } from '../parser/ast.js';

export function generateHook(edge: EdgeDecl): string | null {
  if (edge.transforms.length === 0) return null;
  if (edge.target.kind !== 'direct') return null;

  const source = edge.source.toLowerCase();
  const target = edge.target.node.toLowerCase();
  const jqExpr = transformsToJq(edge.transforms);

  return `#!/bin/bash
# Auto-generated by Graft Compiler
# Edge: ${edge.source} -> ${edge.target.node}
set -euo pipefail

INPUT=".graft/session/node_outputs/${source}.json"
OUTPUT=".graft/session/node_outputs/${source}_to_${target}.json"
TOKEN_LOG=".graft/token_log.txt"

if [ ! -f "$INPUT" ]; then
  echo "[Graft] ERROR: ${edge.source} output not found at $INPUT" >&2
  exit 1
fi

jq ${jqExpr} "$INPUT" > "$OUTPUT"

# Token accounting
ORIGINAL=$(wc -c < "$INPUT")
TRANSFORMED=$(wc -c < "$OUTPUT")
if [ "$ORIGINAL" -gt 0 ]; then
  REDUCTION=$(( (ORIGINAL - TRANSFORMED) * 100 / ORIGINAL ))
else
  REDUCTION=0
fi
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Edge ${edge.source}->${edge.target.node} | \${ORIGINAL}B -> \${TRANSFORMED}B (\${REDUCTION}% reduction)" >> "$TOKEN_LOG"
`;
}

function transformsToJq(transforms: Transform[]): string {
  const selectFields: string[] = [];
  const dropFields: string[] = [];
  const filterExprs: string[] = [];
  let isCompact = false;

  for (const t of transforms) {
    switch (t.type) {
      case 'select':
        selectFields.push(t.field);
        break;
      case 'drop':
        dropFields.push(t.field);
        break;
      case 'filter':
        filterExprs.push(filterToJq(t));
        break;
      case 'compact':
        isCompact = true;
        break;
      case 'truncate':
        // Best-effort: truncate handled at string level
        break;
    }
  }

  const parts: string[] = [];

  if (selectFields.length > 0) {
    const fields = selectFields.map(f => `${f}: .${f}`).join(', ');
    parts.push(`{${fields}}`);
  }

  for (const f of dropFields) {
    parts.push(`del(.${f})`);
  }

  for (const expr of filterExprs) {
    parts.push(expr);
  }

  let expression = parts.length > 0 ? `'${parts.join(' | ')}'` : "'.'";

  if (isCompact) {
    expression = `-c ${expression}`;
  }

  return expression;
}

function filterToJq(t: Extract<Transform, { type: 'filter' }>): string {
  const { field, condition } = t;
  const valueStr = typeof condition.value === 'string'
    ? `"${condition.value}"`
    : String(condition.value);
  return `{${field}: [.${field}[] | select(.${condition.field} ${condition.op} ${valueStr})]}`;
}
```

- [ ] **Step 5: Implement generateOrchestration**

Create `src/codegen/orchestration.ts`:
```typescript
import { Program } from '../parser/ast.js';
import { TokenReport } from '../analyzer/tokens.js';

export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const edgeMap = new Map<string, boolean>();
  for (const edge of program.edges) {
    if (edge.target.kind === 'direct' && edge.transforms.length > 0) {
      edgeMap.set(`${edge.source}->${edge.target.node}`, true);
    }
  }

  let steps = '';
  for (let i = 0; i < graph.flow.length; i++) {
    const nodeName = graph.flow[i];
    const nodeReport = report.nodes.find(n => n.name === nodeName);
    const lowerName = nodeName.toLowerCase();

    let inputSource = '';
    if (i > 0) {
      const prevNode = graph.flow[i - 1];
      const hasTransform = edgeMap.has(`${prevNode}->${nodeName}`);
      if (hasTransform) {
        inputSource = `\n- Input: \`.graft/session/node_outputs/${prevNode.toLowerCase()}_to_${lowerName}.json\``;
      } else {
        inputSource = `\n- Input: \`.graft/session/node_outputs/${prevNode.toLowerCase()}.json\``;
      }
    }

    steps += `
### Step ${i + 1}: ${nodeName} [sequential]
- Agent: ${lowerName}${inputSource}
- Expected tokens: input ~${nodeReport?.estimatedIn.toLocaleString() || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString() || '?'}
- Completion: \`===NODE_COMPLETE:${lowerName}===\`
- Output: \`.graft/session/node_outputs/${lowerName}.json\`
`;
  }

  return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: ${graph.budget.toLocaleString()} tokens
Best case: ${report.bestCase.toLocaleString()} tokens
Worst case: ${report.worstCase.toLocaleString()} tokens

## Execution Plan
${steps}
## Token Budget Tracking
Check \`.graft/token_log.txt\` after each step.
- 80% consumed: switch remaining agents to compact mode
- 90% consumed: skip non-critical agents

## Failure Recovery
- Agent failure: follow on_failure policy in each agent definition
- Token overrun: switch to compact mode, then skip non-critical steps
- Complete failure: intermediate results preserved in \`.graft/session/\`
`;
}
```

- [ ] **Step 6: Implement generateSettings**

Create `src/codegen/settings.ts`:
```typescript
import { Program, EdgeDecl } from '../parser/ast.js';

const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

export interface GraftSettings {
  model: string;
  permissions: { allow: string[] };
  graft: {
    version: string;
    source: string;
    compiled_at: string;
    budget: {
      total: number;
      warning_threshold: number;
      critical_threshold: number;
    };
    model_routing: {
      default: string;
      overrides: Record<string, string>;
    };
  };
  hooks: {
    PostToolUse: HookEntry[];
  };
}

interface HookEntry {
  matcher: string;
  command: string;
}

export function generateSettings(program: Program, sourceFile: string): GraftSettings {
  const graph = program.graphs[0];
  const defaultModel = graph
    ? (MODEL_MAP[program.nodes.find(n => n.name === graph.flow[0])?.model || 'sonnet'] || MODEL_MAP.sonnet)
    : MODEL_MAP.sonnet;

  const overrides: Record<string, string> = {};
  for (const node of program.nodes) {
    const resolved = MODEL_MAP[node.model] || node.model;
    if (resolved !== defaultModel) {
      overrides[node.name.toLowerCase()] = resolved;
    }
  }

  const hookEntries: HookEntry[] = [];
  for (const edge of program.edges) {
    if (edge.transforms.length === 0) continue;
    if (edge.target.kind !== 'direct') continue;
    const source = edge.source.toLowerCase();
    const target = edge.target.node.toLowerCase();
    hookEntries.push({
      matcher: `Write(.graft/session/node_outputs/${source}.json)`,
      command: `.claude/hooks/${source}-to-${target}.sh`,
    });
  }

  return {
    model: defaultModel,
    permissions: {
      allow: ['Read', 'Write', 'Edit', 'Bash', 'Skill'],
    },
    graft: {
      version: '0.1.0',
      source: sourceFile,
      compiled_at: new Date().toISOString(),
      budget: {
        total: graph?.budget || 0,
        warning_threshold: 0.8,
        critical_threshold: 0.9,
      },
      model_routing: {
        default: defaultModel,
        overrides,
      },
    },
    hooks: {
      PostToolUse: hookEntries,
    },
  };
}
```

- [ ] **Step 7: Implement CodeGenerator orchestrator**

Create `src/codegen/codegen.ts`:
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Program } from '../parser/ast.js';
import { TokenReport } from '../analyzer/tokens.js';
import { generateAgent } from './agents.js';
import { generateHook } from './hooks.js';
import { generateOrchestration } from './orchestration.js';
import { generateSettings } from './settings.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Agents
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node),
    });
  }

  // Hooks
  for (const edge of program.edges) {
    const hook = generateHook(edge);
    if (hook && edge.target.kind === 'direct') {
      const source = edge.source.toLowerCase();
      const target = edge.target.node.toLowerCase();
      files.push({
        path: `.claude/hooks/${source}-to-${target}.sh`,
        content: hook,
      });
    }
  }

  // Orchestration
  files.push({
    path: '.claude/CLAUDE.md',
    content: generateOrchestration(program, report),
  });

  // Settings
  const settings = generateSettings(program, sourceFile);
  files.push({
    path: '.claude/settings.json',
    content: JSON.stringify(settings, null, 2),
  });

  // Runtime scaffold
  files.push({ path: '.graft/session/node_outputs/.gitkeep', content: '' });
  files.push({ path: '.graft/token_log.txt', content: '' });

  return files;
}

export function writeFiles(files: GeneratedFile[], outDir: string): void {
  for (const file of files) {
    const fullPath = path.join(outDir, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf-8');
  }
}
```

- [ ] **Step 8: Run codegen tests**

```bash
npx vitest run tests/codegen.test.ts
```
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/codegen/ tests/codegen.test.ts
git commit -m "feat: implement code generator (agents, hooks, orchestration, settings)"
```

---

### Task 7: Compiler Pipeline & CLI

**Files:**
- Create: `src/compiler.ts`
- Modify: `src/index.ts`
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Implement compiler pipeline**

Create `src/compiler.ts`:
```typescript
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { ScopeChecker } from './analyzer/scope.js';
import { TypeChecker } from './analyzer/types.js';
import { TokenEstimator, TokenReport } from './analyzer/tokens.js';
import { generate, GeneratedFile, writeFiles } from './codegen/codegen.js';
import { GraftError } from './errors/diagnostics.js';
import { Program } from './parser/ast.js';

export interface CompileResult {
  success: boolean;
  program?: Program;
  report?: TokenReport;
  files?: GeneratedFile[];
  errors: GraftError[];
  warnings: GraftError[];
}

export function compile(source: string, sourceFile: string): CompileResult {
  const errors: GraftError[] = [];
  const warnings: GraftError[] = [];

  // Lex
  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Parse
  let program: Program;
  try {
    const parser = new Parser(tokens, source);
    program = parser.parse();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Analyze: scope
  const scopeErrors = new ScopeChecker(program).check();
  errors.push(...scopeErrors);

  // Analyze: types
  const typeErrors = new TypeChecker(program).check();
  errors.push(...typeErrors);

  if (errors.length > 0) {
    return { success: false, program, errors, warnings };
  }

  // Analyze: tokens
  const report = new TokenEstimator(program).estimate();
  warnings.push(...report.warnings);

  // Generate
  const files = generate(program, report, sourceFile);

  return { success: true, program, report, files, errors, warnings };
}

export function compileAndWrite(source: string, sourceFile: string, outDir: string): CompileResult {
  const result = compile(source, sourceFile);
  if (result.success && result.files) {
    writeFiles(result.files, outDir);
  }
  return result;
}
```

- [ ] **Step 2: Implement CLI**

Overwrite `src/index.ts`:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, compileAndWrite } from './compiler.js';

const program = new Command();

program
  .name('graft')
  .description('Graft compiler — graph-native language for AI agent harness engineering')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile .gft source to Claude Code harness structure')
  .argument('<file>', '.gft source file')
  .option('--out-dir <dir>', 'output directory', '.')
  .action((file: string, opts: { outDir: string }) => {
    const source = readSource(file);
    const result = compileAndWrite(source, path.basename(file), path.resolve(opts.outDir));

    if (!result.success) {
      console.error('\n✗ Compilation failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source));
        console.error('');
      }
      process.exit(1);
    }

    console.log('\n✓ Parse OK');
    console.log('✓ Scope check OK');
    console.log('✓ Type check OK');

    if (result.report) {
      console.log('✓ Token analysis:');
      for (const node of result.report.nodes) {
        console.log(`    ${node.name.padEnd(20)} in ~${node.estimatedIn.toLocaleString().padStart(6)}  out ~${node.estimatedOut.toLocaleString().padStart(6)}`);
      }
      console.log(`    Best path:  ${result.report.bestCase.toLocaleString().padStart(8)} tokens ${result.report.bestCase <= result.report.budget ? '✓' : '✗'} ${result.report.bestCase <= result.report.budget ? 'within' : 'exceeds'} budget (${result.report.budget.toLocaleString()})`);
      console.log(`    Worst path: ${result.report.worstCase.toLocaleString().padStart(8)} tokens ${result.report.worstCase <= result.report.budget ? '✓' : '⚠'} ${result.report.worstCase <= result.report.budget ? 'within' : 'exceeds'} budget (${result.report.budget.toLocaleString()})`);
    }

    for (const w of result.warnings) {
      console.log(`\n⚠ ${w.message}`);
    }

    if (result.files) {
      console.log('\nGenerated:');
      for (const f of result.files) {
        console.log(`  ${f.path}`);
      }
    }
    console.log('');
  });

program
  .command('check')
  .description('Check .gft source (parse + analyze, no generation)')
  .argument('<file>', '.gft source file')
  .action((file: string) => {
    const source = readSource(file);
    const result = compile(source, path.basename(file));

    if (!result.success) {
      console.error('\n✗ Check failed:\n');
      for (const err of result.errors) {
        console.error(err.format(source));
        console.error('');
      }
      process.exit(1);
    }

    console.log('\n✓ Parse OK');
    console.log('✓ Scope check OK');
    console.log('✓ Type check OK');

    if (result.report) {
      console.log('✓ Token analysis:');
      for (const node of result.report.nodes) {
        console.log(`    ${node.name.padEnd(20)} in ~${node.estimatedIn.toLocaleString().padStart(6)}  out ~${node.estimatedOut.toLocaleString().padStart(6)}`);
      }
      console.log(`    Best path:  ${result.report.bestCase.toLocaleString().padStart(8)} tokens`);
      console.log(`    Worst path: ${result.report.worstCase.toLocaleString().padStart(8)} tokens`);
    }

    for (const w of result.warnings) {
      console.log(`\n⚠ ${w.message}`);
    }
    console.log('');
  });

function readSource(file: string): string {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

program.parse();
```

- [ ] **Step 3: Write integration test**

Create `tests/integration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';

const HELLO_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]

  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]

  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
`;

describe('end-to-end compilation', () => {
  it('compiles hello.gft successfully', () => {
    const result = compile(HELLO_GFT, 'hello.gft');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.program).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.files).toBeDefined();
  });

  it('generates correct file set', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const filePaths = result.files!.map(f => f.path).sort();

    expect(filePaths).toContain('.claude/CLAUDE.md');
    expect(filePaths).toContain('.claude/agents/researcher.md');
    expect(filePaths).toContain('.claude/agents/writer.md');
    expect(filePaths).toContain('.claude/hooks/researcher-to-writer.sh');
    expect(filePaths).toContain('.claude/settings.json');
    expect(filePaths).toContain('.graft/session/node_outputs/.gitkeep');
    expect(filePaths).toContain('.graft/token_log.txt');
  });

  it('reports token analysis within budget', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const report = result.report!;

    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
    expect(report.warnings).toEqual([]);
  });

  it('generates valid JSON in settings', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const settingsFile = result.files!.find(f => f.path === '.claude/settings.json');
    expect(settingsFile).toBeDefined();

    const settings = JSON.parse(settingsFile!.content);
    expect(settings.model).toBe('claude-sonnet-4-20250514');
    expect(settings.graft.budget.total).toBe(6000);
    expect(settings.graft.model_routing.overrides.writer).toBe('claude-haiku-4-5-20251001');
  });

  it('generates agent markdown with correct structure', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const researcherAgent = result.files!.find(f => f.path === '.claude/agents/researcher.md');
    expect(researcherAgent).toBeDefined();
    expect(researcherAgent!.content).toContain('claude-sonnet-4-20250514');
    expect(researcherAgent!.content).toContain('===NODE_COMPLETE:researcher===');
  });

  it('generates hook script with jq transforms', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const hook = result.files!.find(f => f.path === '.claude/hooks/researcher-to-writer.sh');
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('jq');
    expect(hook!.content).toContain('findings');
  });

  it('rejects invalid programs', () => {
    const badSource = `
      node A(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { data: String }
      }
      graph G(input: NonExistent, output: Out, budget: 5k) { A -> done }
    `;
    const result = compile(badSource, 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass across all test files.

- [ ] **Step 5: Manual smoke test with CLI**

```bash
npx tsx src/index.ts compile examples/hello.gft --out-dir /tmp/graft-test
```
Expected: Compilation output showing token analysis and generated file list. Check that `/tmp/graft-test/.claude/` directory was created with expected files.

- [ ] **Step 6: Commit**

```bash
git add src/compiler.ts src/index.ts tests/integration.test.ts
git commit -m "feat: implement compiler pipeline and CLI (graft compile, graft check)"
```

---

### Task 8: Final Verification & Cleanup

**Files:**
- Modify: `examples/hello.gft` (if needed)
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore for build artifacts**

Ensure `.gitignore` includes:
```
node_modules/
dist/
.graft/
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 3: Build the project**

```bash
npx tsc
```
Expected: Clean compilation to `dist/`.

- [ ] **Step 4: Test the built CLI**

```bash
node dist/index.js compile examples/hello.gft --out-dir /tmp/graft-final
ls -la /tmp/graft-final/.claude/
cat /tmp/graft-final/.claude/CLAUDE.md
```
Expected: All files present and well-formed.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: finalize v1 compiler, update gitignore, verify end-to-end"
```
