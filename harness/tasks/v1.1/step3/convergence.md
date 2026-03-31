# Convergence Report: v1.1 parallel + foreach + multi-field select

## Convergence Agent Rulings

### Decision 1: Recursive vs flat body

**Ruling: Recursive `body: FlowNode[]`**

A1 (forced dissenter in Step 2) argued for flat `body: string[]`, claiming recursive walks are dead code. A2 reversed to recursive in Step 2. A3 and A4 held recursive throughout.

The quality-of-argument winner is A2's Step 2 reversal. A2 correctly identified that `body: FlowNode[]` produces LESS code than `body: string[]` because every consumer (parser, scope, estimator, codegen) already has a recursive function for the top-level flow. The flat body forces each consumer to maintain TWO code paths: recursive for top-level, flat for foreach body. The recursive type is code reuse, not premature abstraction.

A1's dissent argument ("cannot test nested code against benchmarks") is valid but insufficient -- the parser enforces depth=1, so the recursive code path is exercised with `kind: 'node'` entries in the body. The recursive call IS tested; only the nested `parallel`/`foreach` paths are dead (and blocked by parser validation).

### Decision 2: Benchmark SecurityReviewer duplication

**Ruling: Fix the benchmark. This is a bug.**

The file's own comment (line 2) says "Three reviewers run in parallel, then aggregate." It does NOT say "SecurityReviewer runs first, then all three run in parallel." All three reviewer nodes `reads: [CodeDiff]` -- they read the shared context, not each other's output. Running SecurityReviewer sequentially before the parallel block produces output that no edge consumes before it runs again inside the parallel block. The second run overwrites the first.

A1 argued it tests duplicate handling. But the compiler handles duplicates correctly regardless -- the parser does not deduplicate, and the scope checker does not prevent repeat references. The benchmark should test intended behavior, not accidental duplication. Fixing it does not reduce test coverage of the parser.

Fix: remove line 62's `SecurityReviewer` so the flow starts with `parallel { ... }`.

### Decision 3: Foreach path parsing

**Ruling: `expect(TokenType.Output)` for middle segment (A2/A4 position)**

All agents agree on the 3-part `NodeName.output.FieldName` pattern. A2's `expect(TokenType.Output)` is tighter than A1's `expectIdentifierOrKeyword()` + string check. The middle segment is always the keyword `output`; using the specific token type makes the grammar enforcement explicit.

### Decision 4: Multi-field select

**Ruling: `fields: string[]`, reduction = `Math.min(0.3 * fields.length, 1.0)` applied as multiplier**

All agents converge. The formula: `result = Math.floor(result * Math.min(0.3 * fields.length, 1.0))`. This caps at 100% (can't select more data than exists). 1 field = 30%, 2 fields = 60%, 3 fields = 90%, 4+ = 100%.

### Decision 5: Type name

**Ruling: `FlowNode` (not `FlowStep`)**

3-to-1 consensus (A1, A3, A4 prefer `FlowNode`; A2 prefers `FlowStep`). Codebase convention uses nouns: `NodeDecl`, `EdgeDecl`, `EdgeTarget`, `ContextRef`. `FlowNode` follows the pattern.

### Decision 6: Nesting depth enforcement

**Ruling: Enforce in parser (A4 Step 2 position)**

A4 correctly identified that scope checker runs after AST construction. If the parser allows nested foreach/parallel, the AST is structurally valid but semantically unsupported. Better to reject at parse time. The parser validates that foreach body contains only `kind: 'node'` entries in v1.1.

## Summary of Resolved Positions

| Topic | Resolution | Rationale |
|-------|-----------|-----------|
| Type name | `FlowNode` | Codebase noun convention |
| `branches` vs `nodes` | `branches` | Avoids collision with `Program.nodes` |
| `body` type | `FlowNode[]` (recursive) | Code reuse > flat duplication |
| Depth enforcement | Parser | Reject before AST construction |
| `.output.` parsing | `expect(TokenType.Output)` | Tight grammar enforcement |
| Select fields | `fields: string[]` | Multi-field with comma separation |
| Select reduction | `Math.min(0.3 * fields.length, 1.0)` | Cap at 100% |
| Parallel estimation | Sum for best and worst | Tokens consumed regardless of parallelism |
| Foreach estimation | best=1x body, worst=Nx body | Per-node retry multipliers preserved inside body |
| Binding variable | Cosmetic in v1.1 | No scope validation |
| `done` inside foreach | Parser error | `done` terminates graphs only |
| Parallel min branches | 2 | Single branch = sequential |
| SecurityReviewer dup | Fix benchmark | Bug, not intentional |
| `when(!passed)` | Out of scope | v1.2 work |

## Files Modified

1. `src/lexer/tokens.ts` -- +4 enum values, +4 KEYWORDS entries
2. `src/parser/ast.ts` -- +`FlowNode` type, `GraphDecl.flow: FlowNode[]`, `select.fields: string[]`
3. `src/parser/parser.ts` -- +parseFlowNodes, +parseFlowNode, +parseParallelStep, +parseForeachStep; rewrite parseGraph body; update parseTransform
4. `src/analyzer/scope.ts` -- recursive walkFlowNodes
5. `src/analyzer/estimator.ts` -- recursive computeFlowCosts, multi-field select
6. `src/analyzer/types.ts` -- update select field check for multi-field
7. `src/codegen/orchestration.ts` -- FlowNode-aware step generation
8. `src/codegen/hooks.ts` -- multi-field select jq
9. `src/codegen/settings.ts` -- handle FlowNode for first-node model lookup
10. `tests/parser.test.ts` -- update flow assertions + new parallel/foreach/multi-field tests
11. `tests/analyzer.test.ts` -- update + new tests
12. `tests/codegen.test.ts` -- update select tests
13. `tests/integration.test.ts` -- add parallel/foreach integration tests
14. `tests/lexer.test.ts` -- add keyword tokenization tests
15. `benchmarks/correctness/parallel_flow.gft` -- fix SecurityReviewer duplication

## Complete Modified Source Files

All files below are COMPLETE (not patches). Every file is ready to replace its existing counterpart.

---

### `src/lexer/tokens.ts`

```ts
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
  Parallel = 'Parallel',
  Foreach = 'Foreach',
  As = 'As',
  MaxIterations = 'MaxIterations',

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
  parallel: TokenType.Parallel,
  foreach: TokenType.Foreach,
  as: TokenType.As,
  max_iterations: TokenType.MaxIterations,
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

---

### `src/parser/ast.ts`

```ts
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
  /** When undefined, this branch represents the `else` case (default target). */
  condition?: Condition;
  target: string;
}

// Flow control nodes (v1.1)
export type FlowNode =
  | { kind: 'node'; name: string }
  | { kind: 'parallel'; branches: string[] }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: FlowNode[] };

// graph SimpleQA(...) { Researcher -> Writer -> done }
export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  flow: FlowNode[];
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
  | { kind: 'primitive'; name: 'String' | 'Int' | 'Float' | 'Bool' }
  | { kind: 'primitive_range'; name: 'Float'; min: number; max: number }
  | { kind: 'list'; element: TypeExpr }
  | { kind: 'map'; key: TypeExpr; value: TypeExpr }
  | { kind: 'optional'; inner: TypeExpr }
  | { kind: 'token_bounded'; inner: TypeExpr; max: number }
  | { kind: 'enum'; values: string[] }
  | { kind: 'struct'; name: string; fields: Field[] }
  | { kind: 'domain'; name: 'FilePath' | 'FileDiff' | 'TestFile' | 'IssueRef' };

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
  | { type: 'select'; fields: string[] }
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

---

### `src/parser/parser.ts`

```ts
// src/parser/parser.ts
import { Token, TokenType, KEYWORDS } from '../lexer/tokens.js';
import { GraftError } from '../errors/diagnostics.js';
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl,
  Field, TypeExpr, ContextRef, ProducesDecl,
  Transform, Condition, FailureStrategy,
  EdgeTarget, ConditionalBranch,
  FlowNode,
} from './ast.js';

// Build a Set of all keyword token types for O(1) lookup.
// Used by expectIdentifierOrKeyword() to accept keywords as contextual identifiers.
const KEYWORD_TYPES: Set<TokenType> = new Set(Object.values(KEYWORDS));

export class Parser {
  private pos: number = 0;

  constructor(private readonly tokens: Token[]) {}

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

  // --- Context ------------------------------------------------

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

  // --- Node ---------------------------------------------------

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
        // Do NOT advance here -- parseProduces() consumes the keyword itself
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
    this.expect(TokenType.Produces);
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
        field = this.expectIdentifierOrKeyword();
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
      ids.push(this.expectIdentifierOrKeyword());
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

  // --- Edge ---------------------------------------------------

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
      const fields: string[] = [];
      fields.push(this.expectIdentifierOrKeyword());
      while (this.check(TokenType.Comma)) {
        this.advance();
        fields.push(this.expectIdentifierOrKeyword());
      }
      this.expect(TokenType.RParen);
      return { type: 'select', fields };
    }
    if (this.check(TokenType.Filter)) {
      this.advance();
      this.expect(TokenType.LParen);
      const field = this.expectIdentifierOrKeyword();
      this.expect(TokenType.Comma);
      const condition = this.parseCondition();
      this.expect(TokenType.RParen);
      return { type: 'filter', field, condition };
    }
    if (this.check(TokenType.Drop)) {
      this.advance();
      this.expect(TokenType.LParen);
      const field = this.expectIdentifierOrKeyword();
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
    const field = this.expectIdentifierOrKeyword();
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
      // parseInt("5k", 10) returns 5 per the JS spec: parseInt stops at first non-digit.
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
    if (token.type === TokenType.Identifier || KEYWORD_TYPES.has(token.type)) {
      this.advance();
      return token.value;
    }
    throw this.error(`Expected value in condition, got '${token.value}'`);
  }

  // --- Graph --------------------------------------------------

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

    // Body: { FlowNodes -> done }
    this.expect(TokenType.LBrace);
    const flow = this.parseFlowNodes(/* insideBlock */ false);
    this.expect(TokenType.RBrace);

    return { name, input, output, budget, flow, location: loc };
  }

  /**
   * Parse a sequence of flow nodes separated by arrows.
   * When insideBlock=true, stops when no more arrows (next token should be RBrace).
   * When insideBlock=false, expects -> done to terminate.
   */
  private parseFlowNodes(insideBlock: boolean): FlowNode[] {
    const steps: FlowNode[] = [];

    // Parse first step
    steps.push(this.parseFlowNode());

    while (this.check(TokenType.Arrow)) {
      this.advance(); // consume ->

      // Check for 'done'
      if (this.check(TokenType.Done)) {
        this.advance();
        if (insideBlock) {
          throw this.error("'done' is not allowed inside a foreach or parallel block");
        }
        return steps;
      }

      // Check for RBrace -- end of foreach body after arrow would be an error
      if (this.check(TokenType.RBrace)) {
        throw this.error("Expected flow step after '->'");
      }

      steps.push(this.parseFlowNode());
    }

    // If we get here without 'done' at top level, that's an error
    if (!insideBlock) {
      throw this.error("Expected '-> done' to terminate graph flow");
    }

    // insideBlock: we stop when no more arrows (next token should be RBrace)
    return steps;
  }

  /**
   * Parse a single flow node: identifier, parallel block, or foreach block.
   */
  private parseFlowNode(): FlowNode {
    if (this.check(TokenType.Parallel)) {
      return this.parseParallelStep();
    }
    if (this.check(TokenType.Foreach)) {
      return this.parseForeachStep();
    }
    // Regular node reference
    const name = this.expectIdentifier();
    return { kind: 'node', name };
  }

  /**
   * parallel { SecurityReviewer  PerformanceReviewer  StyleReviewer }
   *
   * Branches are whitespace-separated identifiers (no commas required).
   * Optional commas are accepted for user convenience.
   */
  private parseParallelStep(): FlowNode {
    this.expect(TokenType.Parallel);
    this.expect(TokenType.LBrace);

    const branches: string[] = [];
    while (!this.check(TokenType.RBrace)) {
      if (branches.length > 0 && this.check(TokenType.Comma)) {
        this.advance(); // optional comma
      }
      branches.push(this.expectIdentifier());
    }
    this.expect(TokenType.RBrace);

    if (branches.length < 2) {
      throw this.error('parallel block must contain at least 2 branches');
    }

    return { kind: 'parallel', branches };
  }

  /**
   * foreach(Planner.output.steps as step, max_iterations: 5) {
   *   Implementer -> Verifier
   * }
   */
  private parseForeachStep(): FlowNode {
    this.expect(TokenType.Foreach);
    this.expect(TokenType.LParen);

    // Source: Planner.output.steps
    const source = this.expectIdentifier();     // "Planner"
    this.expect(TokenType.Dot);
    this.expect(TokenType.Output);               // "output" keyword token
    this.expect(TokenType.Dot);
    const field = this.expectIdentifierOrKeyword(); // "steps"

    // Binding: as step
    this.expect(TokenType.As);
    const binding = this.expectIdentifierOrKeyword(); // "step"

    // max_iterations: 5
    this.expect(TokenType.Comma);
    this.expect(TokenType.MaxIterations);
    this.expect(TokenType.Colon);
    const maxIterations = this.parseIntValue();

    if (maxIterations < 1) {
      throw this.error('max_iterations must be at least 1');
    }

    this.expect(TokenType.RParen);

    // Body: { Implementer -> Verifier }
    this.expect(TokenType.LBrace);
    const body = this.parseFlowNodes(/* insideBlock */ true);
    this.expect(TokenType.RBrace);

    if (body.length === 0) {
      throw this.error('foreach body must contain at least one step');
    }

    // v1.1: enforce no nesting (body must contain only 'node' kind entries)
    for (const step of body) {
      if (step.kind !== 'node') {
        throw this.error('Nested parallel or foreach inside foreach is not supported in v1.1');
      }
    }

    return { kind: 'foreach', source, field, binding, maxIterations, body };
  }

  // --- Types --------------------------------------------------

  private parseType(): TypeExpr {
    const token = this.current();

    // List<T>
    if (token.type === TokenType.List) {
      this.advance();
      this.expect(TokenType.Less);
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

    // Float -- could be Float or Float(min..max)
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
      values.push(this.expectIdentifierOrKeyword());
      while (this.check(TokenType.Comma)) {
        this.advance();
        values.push(this.expectIdentifierOrKeyword());
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
    // Check for Identifier followed by '{' -- inline struct
    if (this.current().type === TokenType.Identifier && this.peekType(1) === TokenType.LBrace) {
      const name = this.expectIdentifier();
      this.expect(TokenType.LBrace);
      const fields = this.parseFields();
      this.expect(TokenType.RBrace);
      return { kind: 'struct', name, fields };
    }
    return this.parseType();
  }

  // --- Fields -------------------------------------------------

  private parseFields(): Field[] {
    const fields: Field[] = [];
    while (!this.check(TokenType.RBrace)) {
      const loc = this.current().location;
      const name = this.expectIdentifierOrKeyword();
      this.expect(TokenType.Colon);
      const type = this.parseTypeOrInlineStruct();
      fields.push({ name, type, location: loc });
    }
    return fields;
  }

  // --- Helpers ------------------------------------------------

  private parseTokenValue(): number {
    const token = this.current();
    if (token.type === TokenType.IntegerLiteral) {
      this.advance();
      return parseInt(token.value, 10);
    }
    if (token.type === TokenType.KIntegerLiteral) {
      this.advance();
      // parseInt("5k", 10) returns 5 per the JS spec: parseInt stops at first non-digit.
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

  /**
   * Strict identifier: only accepts TokenType.Identifier.
   * Used for declaration names (context, node, edge, graph), produces names,
   * context ref context-part, graph flow nodes, edge source/target.
   * These are PascalCase by convention and must not collide with keywords.
   */
  private expectIdentifier(): string {
    const token = this.current();
    if (token.type === TokenType.Identifier) {
      this.advance();
      return token.value;
    }
    throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
  }

  /**
   * Permissive identifier: accepts TokenType.Identifier OR any keyword token.
   * Used for field names, tool names, enum values, transform field arguments,
   * condition field names -- positions where a keyword-like word is valid as a name.
   */
  private expectIdentifierOrKeyword(): string {
    const token = this.current();
    if (token.type === TokenType.Identifier || KEYWORD_TYPES.has(token.type)) {
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

---

### `src/analyzer/scope.ts`

```ts
import { Program, FlowNode } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // produces name -> field names

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
      // Validate graph input references a declared context
      if (!this.contextNames.has(graph.input)) {
        errors.push(new GraftError(
          `Graph input '${graph.input}' is not a declared context`,
          graph.location,
        ));
      }

      // Validate graph output references a declared produces type
      if (!this.producesMap.has(graph.output)) {
        errors.push(new GraftError(
          `Graph output '${graph.output}' is not a declared produces type`,
          graph.location,
        ));
      }

      // Walk FlowNode tree
      this.walkFlowNodes(graph.flow, graph.location, errors);
    }
  }

  private walkFlowNodes(nodes: FlowNode[], location: SourceLocation, errors: GraftError[]): void {
    for (const step of nodes) {
      switch (step.kind) {
        case 'node':
          if (!this.nodeNames.has(step.name)) {
            errors.push(new GraftError(
              `Node '${step.name}' in graph flow is not declared`,
              location,
            ));
          }
          break;
        case 'parallel':
          for (const branch of step.branches) {
            if (!this.nodeNames.has(branch)) {
              errors.push(new GraftError(
                `Node '${branch}' in parallel block is not declared`,
                location,
              ));
            }
          }
          break;
        case 'foreach': {
          // Validate source node exists
          if (!this.nodeNames.has(step.source)) {
            errors.push(new GraftError(
              `Foreach source node '${step.source}' is not declared`,
              location,
            ));
          }
          // Validate source node produces the referenced field
          const sourceNode = this.program.nodes.find(n => n.name === step.source);
          if (sourceNode) {
            const fieldNames = new Set(sourceNode.produces.fields.map(f => f.name));
            if (!fieldNames.has(step.field)) {
              errors.push(new GraftError(
                `Field '${step.field}' does not exist in '${step.source}' produces output`,
                location,
              ));
            }
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              'foreach max_iterations must be at least 1',
              location,
            ));
          }
          // Recurse into body
          this.walkFlowNodes(step.body, location, errors);
          break;
        }
      }
    }
  }
}
```

---

### `src/analyzer/estimator.ts`

```ts
import { Program, NodeDecl, EdgeDecl, Transform, FlowNode } from '../parser/ast.js';
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
      // TODO: store conditional edge branches for token estimation (v2)
    }
  }

  estimate(): TokenReport {
    const graph = this.program.graphs[0]; // v1: single graph
    if (!graph) {
      return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
    }

    const warnings: GraftError[] = [];
    const nodeReports: NodeTokenReport[] = [];

    // Populate node reports (for display)
    this.collectNodeReports(graph.flow, nodeReports, warnings);

    // Compute best/worst case costs
    const { best, worst } = this.computeFlowCosts(graph.flow);
    const bestCase = best;
    const worstCase = worst;

    if (worstCase > graph.budget) {
      warnings.push(new GraftError(
        `Worst-case token usage (${worstCase}) exceeds budget (${graph.budget})`,
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

  private collectNodeReports(steps: FlowNode[], reports: NodeTokenReport[], warnings: GraftError[]): void {
    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const estimatedIn = this.getEstimatedIn(step.name, node);
          if (estimatedIn > node.budgetIn) {
            warnings.push(new GraftError(
              `Node '${step.name}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
              node.location,
              'warning',
            ));
          }
          reports.push({ name: step.name, estimatedIn, estimatedOut: node.budgetOut });
          break;
        }
        case 'parallel':
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const estimatedIn = this.getEstimatedIn(branchName, node);
            if (estimatedIn > node.budgetIn) {
              warnings.push(new GraftError(
                `Node '${branchName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
                node.location,
                'warning',
              ));
            }
            reports.push({ name: branchName, estimatedIn, estimatedOut: node.budgetOut });
          }
          break;
        case 'foreach':
          this.collectNodeReports(step.body, reports, warnings);
          break;
      }
    }
  }

  private computeFlowCosts(steps: FlowNode[]): { best: number; worst: number } {
    let best = 0;
    let worst = 0;

    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const cost = this.getNodeCost(step.name, node);
          const retryMul = this.getRetryMultiplier(node);
          best += cost;
          worst += cost * retryMul;
          break;
        }
        case 'parallel': {
          // Parallel: all branches run. Total tokens = sum of all branches.
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const cost = this.getNodeCost(branchName, node);
            const retryMul = this.getRetryMultiplier(node);
            best += cost;
            worst += cost * retryMul;
          }
          break;
        }
        case 'foreach': {
          // Foreach: body runs up to maxIterations times.
          // Best case = 1 iteration. Worst case = maxIterations iterations.
          const bodyCosts = this.computeFlowCosts(step.body);
          best += bodyCosts.best * 1;
          worst += bodyCosts.worst * step.maxIterations;
          break;
        }
      }
    }

    return { best, worst };
  }

  private getNodeCost(nodeName: string, node: NodeDecl): number {
    return this.getEstimatedIn(nodeName, node) + node.budgetOut;
  }

  private getEstimatedIn(nodeName: string, node: NodeDecl): number {
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
    return estimatedIn;
  }

  private applyTransformReductions(tokens: number, transforms: Transform[]): number {
    let result = tokens;
    for (const t of transforms) {
      switch (t.type) {
        case 'select':
          result = Math.floor(result * Math.min(0.3 * t.fields.length, 1.0));
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

---

### `src/analyzer/types.ts`

```ts
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class TypeChecker {
  private program: Program;
  private producesFieldsMap: Map<string, Set<string>>; // node name -> produces field names

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
        // TODO: condition type compatibility -- e.g., >= on String fields (v2)
        if (transform.type === 'select') {
          for (const f of transform.fields) {
            if (!sourceFields.has(f)) {
              errors.push(new GraftError(
                `select: field '${f}' does not exist in '${edge.source}' output`,
                edge.location,
              ));
            }
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

---

### `src/codegen/orchestration.ts`

```ts
import { Program, FlowNode } from '../parser/ast.js';
import { TokenReport, NodeTokenReport } from '../analyzer/estimator.js';

export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const edgeMap = new Map<string, boolean>();
  for (const edge of program.edges) {
    if (edge.target.kind === 'direct' && edge.transforms.length > 0) {
      edgeMap.set(`${edge.source}->${edge.target.node}`, true);
    }
  }

  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null);

  return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: ${graph.budget.toLocaleString('en-US')} tokens
Best case: ${report.bestCase.toLocaleString('en-US')} tokens
Worst case: ${report.worstCase.toLocaleString('en-US')} tokens

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

function generateSteps(
  flow: FlowNode[],
  report: TokenReport,
  edgeMap: Map<string, boolean>,
  startStep: number,
  prevNode: string | null,
): { text: string; nextStep: number; lastNode: string | null } {
  let text = '';
  let stepNum = startStep;
  let prev = prevNode;

  for (const step of flow) {
    switch (step.kind) {
      case 'node': {
        const lowerName = step.name.toLowerCase();
        const nodeReport = report.nodes.find(n => n.name === step.name);

        let inputSource = '';
        if (prev) {
          const hasTransform = edgeMap.has(`${prev}->${step.name}`);
          if (hasTransform) {
            inputSource = `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json\``;
          } else {
            inputSource = `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}.json\``;
          }
        }

        text += `
### Step ${stepNum}: ${step.name} [sequential]
- Agent: ${lowerName}${inputSource}
- Expected tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}
- Completion: \`===NODE_COMPLETE:${lowerName}===\`
- Output: \`.graft/session/node_outputs/${lowerName}.json\`
`;
        prev = step.name;
        stepNum++;
        break;
      }

      case 'parallel': {
        const branchList = step.branches.join(', ');
        text += `
### Step ${stepNum}: [parallel] ${branchList}
- Run concurrently, wait for all to complete
`;
        for (const branchName of step.branches) {
          const lowerName = branchName.toLowerCase();
          const nodeReport = report.nodes.find(n => n.name === branchName);
          text += `- Agent: ${lowerName} -- tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}
`;
        }
        text += `- Completion: all ${step.branches.length} \`===NODE_COMPLETE===\` signals received
`;
        // After parallel, prev is ambiguous; set to null
        prev = null;
        stepNum++;
        break;
      }

      case 'foreach': {
        text += `
### Step ${stepNum}: [foreach over ${step.source}.output.${step.field}, max ${step.maxIterations} iterations]
- For each \`${step.binding}\` in list:
`;
        let subLetter = 'a';
        for (const bodyStep of step.body) {
          if (bodyStep.kind === 'node') {
            text += `  - Sub-step ${stepNum}${subLetter}: ${bodyStep.name} [foreach-body]
`;
            subLetter = String.fromCharCode(subLetter.charCodeAt(0) + 1);
          }
        }
        text += `- Completion: all iterations done or list exhausted
`;
        prev = null;
        stepNum++;
        break;
      }
    }
  }

  return { text, nextStep: stepNum, lastNode: prev };
}
```

---

### `src/codegen/hooks.ts`

```ts
import { EdgeDecl, Transform } from '../parser/ast.js';

// Note: Generated scripts require bash (Git Bash on Windows).
// If hook execution fails on Windows, prefix commands with `bash` in settings.ts.

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
        selectFields.push(...t.fields);
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

---

### `src/codegen/settings.ts`

```ts
import { Program, EdgeDecl, FlowNode } from '../parser/ast.js';

// Keep in sync with agents.ts MODEL_MAP
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

/**
 * Find the first 'node'-kind FlowNode name from a FlowNode array.
 * Returns undefined if no node-kind step exists.
 */
function findFirstNodeName(flow: FlowNode[]): string | undefined {
  for (const step of flow) {
    switch (step.kind) {
      case 'node':
        return step.name;
      case 'parallel':
        return step.branches[0];
      case 'foreach':
        return findFirstNodeName(step.body);
    }
  }
  return undefined;
}

export function generateSettings(program: Program, sourceFile: string): GraftSettings {
  const graph = program.graphs[0];
  const firstNodeName = graph ? findFirstNodeName(graph.flow) : undefined;
  const firstNodeModel = firstNodeName
    ? program.nodes.find(n => n.name === firstNodeName)?.model
    : undefined;
  const defaultModel = firstNodeModel
    ? (MODEL_MAP[firstNodeModel] || firstNodeModel)
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

---

### `benchmarks/correctness/parallel_flow.gft`

```graft
// parallel_flow.gft — Tests parallel execution in graph flow
// Three reviewers run in parallel, then aggregate

context CodeDiff(max_tokens: 2k) {
  diff: String
  files: List<FilePath>
}

node SecurityReviewer(model: sonnet, budget: 4k/1k) {
  reads: [CodeDiff]
  tools: [file_read]

  produces SecurityReport {
    vulnerabilities: List<String>
    risk: enum(safe, low, medium, high, critical)
  }
}

node PerformanceReviewer(model: haiku, budget: 3k/1k) {
  reads: [CodeDiff]
  tools: [file_read]

  produces PerfReport {
    issues: List<String>
    impact: enum(none, minor, major)
  }
}

node StyleReviewer(model: haiku, budget: 2k/500) {
  reads: [CodeDiff]
  tools: [file_read]

  produces StyleReport {
    violations: List<String>
    clean: Bool
  }
}

node Aggregator(model: haiku, budget: 3k/1k) {
  reads: [SecurityReport, PerfReport, StyleReport]

  produces FinalReview {
    approved: Bool
    blocking: List<String>
    suggestions: List<String>
  }
}

edge SecurityReviewer -> Aggregator
  | select(vulnerabilities, risk)
  | compact

edge PerformanceReviewer -> Aggregator
  | select(issues, impact)
  | compact

edge StyleReviewer -> Aggregator
  | select(violations)
  | compact

graph ParallelReview(input: CodeDiff, output: FinalReview, budget: 20k) {
  parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

---

### `tests/lexer.test.ts`

```ts
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
```

---

### `tests/parser.test.ts`

```ts
// tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
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

    it('parses node with retry_then_fallback failure strategy', () => {
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

    it('parses node with skip failure strategy', () => {
      const program = parse(`
        node Optionality(model: haiku, budget: 1k/500) {
          reads: [Data]
          on_failure: skip
          produces Result {
            value: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'skip' });
    });

    it('parses node with abort failure strategy', () => {
      const program = parse(`
        node Critical(model: sonnet, budget: 5k/2k) {
          reads: [Input]
          on_failure: abort
          produces Output {
            data: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'abort' });
    });

    it('parses node with standalone fallback failure strategy', () => {
      const program = parse(`
        node Primary(model: opus, budget: 10k/5k) {
          reads: [Spec]
          on_failure: fallback(Backup)
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'fallback', node: 'Backup' });
    });

    it('reports error when node is missing produces', () => {
      expect(() => parse(`
        node Bad(model: haiku, budget: 1k/500) {
          reads: [Data]
        }
      `)).toThrow('Node must have a produces declaration');
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
        { type: 'select', fields: ['findings'] },
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

    it('parses multi-field select', () => {
      const program = parse(`
        edge A -> B
          | select(vulnerabilities, risk)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['vulnerabilities', 'risk'] },
      ]);
    });

    it('parses single-field select as fields array', () => {
      const program = parse(`
        edge A -> B
          | select(findings)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['findings'] },
      ]);
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
      expect(graph.flow).toEqual([
        { kind: 'node', name: 'Researcher' },
        { kind: 'node', name: 'Writer' },
      ]);
    });

    it('parses graph with parallel block', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          parallel { A B C } -> D -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow).toEqual([
        { kind: 'parallel', branches: ['A', 'B', 'C'] },
        { kind: 'node', name: 'D' },
      ]);
    });

    it('parses graph with parallel block using optional commas', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          parallel { A, B, C } -> D -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow[0]).toEqual({ kind: 'parallel', branches: ['A', 'B', 'C'] });
    });

    it('parses graph with foreach block', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {
            Worker -> Checker
          } -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow).toHaveLength(2);
      expect(graph.flow[0]).toEqual({ kind: 'node', name: 'Planner' });
      const fe = graph.flow[1];
      expect(fe.kind).toBe('foreach');
      if (fe.kind === 'foreach') {
        expect(fe.source).toBe('Planner');
        expect(fe.field).toBe('steps');
        expect(fe.binding).toBe('step');
        expect(fe.maxIterations).toBe(5);
        expect(fe.body).toEqual([
          { kind: 'node', name: 'Worker' },
          { kind: 'node', name: 'Checker' },
        ]);
      }
    });

    it('reports error on graph flow without done terminator', () => {
      expect(() => parse(`
        graph Bad(input: A, output: B, budget: 1k) {
          X -> Y
        }
      `)).toThrow("Expected '-> done' to terminate graph flow");
    });

    it('reports error on parallel block with fewer than 2 branches', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          parallel { A } -> done
        }
      `)).toThrow('parallel block must contain at least 2 branches');
    });

    it('reports error on done inside foreach body', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 1) {
            D -> done
          } -> done
        }
      `)).toThrow("'done' is not allowed inside a foreach or parallel block");
    });

    it('reports error on foreach max_iterations < 1', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 0) {
            D
          } -> done
        }
      `)).toThrow('max_iterations must be at least 1');
    });

    it('reports error on nested foreach', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 1) {
            foreach(D.output.e as f, max_iterations: 1) {
              G
            }
          } -> done
        }
      `)).toThrow('Nested parallel or foreach inside foreach is not supported in v1.1');
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

    it('parses nested generic types', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          data: List<Optional<String>>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'list',
        element: { kind: 'optional', inner: { kind: 'primitive', name: 'String' } },
      });
    });
  });

  describe('keyword-as-identifier (contextual keywords)', () => {
    it('parses field named with a keyword', () => {
      const program = parse(`
        context Foo(max_tokens: 500) {
          input: String
          output: Int
          model: Bool
        }
      `);
      expect(program.contexts[0].fields[0].name).toBe('input');
      expect(program.contexts[0].fields[1].name).toBe('output');
      expect(program.contexts[0].fields[2].name).toBe('model');
    });

    it('parses enum with keyword values', () => {
      const program = parse(`
        context Foo(max_tokens: 500) {
          mode: enum(skip, abort, compact)
        }
      `);
      const enumType = program.contexts[0].fields[0].type;
      expect(enumType).toEqual({ kind: 'enum', values: ['skip', 'abort', 'compact'] });
    });

    it('parses tool names that are keywords', () => {
      const program = parse(`
        node Worker(model: sonnet, budget: 2k/1k) {
          reads: [Data]
          tools: [compact, filter, select]
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].tools).toEqual(['compact', 'filter', 'select']);
    });

    it('parses select/drop with keyword field names', () => {
      const program = parse(`
        edge A -> B
          | select(input)
          | drop(output)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['input'] },
        { type: 'drop', field: 'output' },
      ]);
    });

    it('parses condition with keyword field name', () => {
      const program = parse(`
        edge A -> B
          | filter(items, budget >= 100)
      `);
      expect(program.edges[0].transforms[0]).toEqual({
        type: 'filter',
        field: 'items',
        condition: { field: 'budget', op: '>=', value: 100 },
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

---

### `tests/analyzer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator, TokenReport } from '../src/analyzer/estimator.js';
import { Program } from '../src/parser/ast.js';
import { GraftError } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
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

  it('reports error for undeclared graph input context', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [FakeInput]
        produces Out { data: String }
      }
      graph G(input: FakeInput, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const inputError = errors.find(e => e.message.includes('FakeInput') && e.message.includes('input'));
    expect(inputError).toBeDefined();
  });

  it('reports error for undeclared graph output produces', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: GhostOutput, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const outputError = errors.find(e => e.message.includes('GhostOutput') && e.message.includes('output'));
    expect(outputError).toBeDefined();
  });

  it('accumulates multiple errors', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ghost1, Ghost2]
        produces Out { data: String }
      }
      graph G(input: Ghost1, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    // At least 2 errors: Ghost1 undeclared read + Ghost2 undeclared read
    // (plus Ghost1 undeclared graph input)
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('reports error for undeclared node in parallel block', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces Out2 { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        parallel { A, B, GhostNode } -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const ghostError = errors.find(e => e.message.includes('GhostNode'));
    expect(ghostError).toBeDefined();
  });

  it('reports error for undeclared foreach source node', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        foreach(GhostSource.output.data as item, max_iterations: 3) {
          A
        } -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const srcError = errors.find(e => e.message.includes('GhostSource'));
    expect(srcError).toBeDefined();
  });

  it('reports error for missing field in foreach source produces', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Planner(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Plan { steps: List<String> }
      }
      node Worker(model: haiku, budget: 1k/500) {
        reads: [Plan]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        Planner -> foreach(Planner.output.nonexistent as item, max_iterations: 3) {
          Worker
        } -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const fieldError = errors.find(e => e.message.includes('nonexistent'));
    expect(fieldError).toBeDefined();
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

  it('validates multi-field select against source produces', () => {
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
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings, score)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for multi-field select with non-existent field', () => {
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
        | select(findings, ghost)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('ghost');
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

  it('warns when node estimated input exceeds budgetIn', () => {
    const program = parse(`
      context BigContext(max_tokens: 5k) { data: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [BigContext]
        produces Out { result: String }
      }
      graph G(input: BigContext, output: Out, budget: 10k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // BigContext is 5000 tokens, budgetIn is 1000 -- should warn
    const nodeWarning = report.warnings.find(w => w.message.includes('exceeds budgetIn'));
    expect(nodeWarning).toBeDefined();
  });

  it('estimates parallel as sum of all branch costs', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces OutB { data: String }
      }
      graph G(input: Spec, output: OutA, budget: 10k) {
        parallel { A, B } -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: 500 in + 500 out = 1000; B: 500 in + 500 out = 1000; total = 2000
    expect(report.bestCase).toBe(2000);
    expect(report.nodes).toHaveLength(2);
  });

  it('estimates foreach as best=1x worst=Nx body cost', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Planner(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Plan { steps: List<String> }
      }
      node Worker(model: haiku, budget: 1k/500) {
        reads: [Plan]
        produces Out { data: String }
      }
      edge Planner -> Worker
      graph G(input: Spec, output: Out, budget: 20k) {
        Planner -> foreach(Planner.output.steps as step, max_iterations: 3) {
          Worker
        } -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Planner: 500 in + 500 out = 1000
    // Worker: 500 in (reads Plan) + 500 out = 1000; body cost = 1000
    // Best = 1000 (Planner) + 1000 * 1 (foreach best) = 2000
    // Worst = 1000 (Planner) + 1000 * 3 (foreach worst) = 4000
    expect(report.bestCase).toBe(2000);
    expect(report.worstCase).toBe(4000);
  });

  it('scales multi-field select reduction by field count', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          a: String
          b: String
          c: String
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(a, b)
      graph G(input: Spec, output: Final, budget: 10k) { A -> B -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A output = 1000; select(a,b) = 1000 * 0.3 * 2 = 600; B reads Out = 600 in + 500 out
    const writerNode = report.nodes.find(n => n.name === 'B');
    expect(writerNode).toBeDefined();
    expect(writerNode!.estimatedIn).toBe(600);
  });
});
```

---

### `tests/codegen.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { generateAgent } from '../src/codegen/agents.js';
import { generateHook } from '../src/codegen/hooks.js';
import { generateOrchestration } from '../src/codegen/orchestration.js';
import { generateSettings } from '../src/codegen/settings.js';
import { generate } from '../src/codegen/codegen.js';
import { Program } from '../src/parser/ast.js';
import { TokenReport } from '../src/analyzer/estimator.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}

// ---------------------------------------------------------------------------
// generateAgent
// ---------------------------------------------------------------------------
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

  it('includes failure protocol for retry', () => {
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
    expect(md).toContain('Retry up to 2 times');
    expect(md).toContain('===NODE_FAILED:a===');
  });

  it('includes failure protocol for skip', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: skip
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('skip this node');
    expect(md).toContain('===NODE_SKIPPED:a===');
  });

  it('includes failure protocol for abort', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: abort
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('abort the entire pipeline');
    expect(md).toContain('===PIPELINE_ABORTED:a===');
  });

  it('includes default failure protocol when on_failure is absent', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('Failure Protocol');
    expect(md).toContain('===NODE_FAILED:a===');
  });

  it('handles node with no reads', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: []
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('No external context required');
  });

  it('handles partial reads', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
      graph G(input: Spec, output: Answer, budget: 6k) { Researcher -> Writer -> done }
    `);
    const md = generateAgent(program.nodes[1]);
    expect(md).toContain('Research.findings');
  });

  it('resolves unknown model name as pass-through', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: gpt4o, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('model: gpt4o');
  });

  it('generates JSON example for struct types', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          meta: Meta {
            title: String
            count: Int
          }
        }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('"title"');
    expect(md).toContain('"count"');
  });
});

// ---------------------------------------------------------------------------
// generateHook
// ---------------------------------------------------------------------------
describe('generateHook', () => {
  it('generates bash hook script for edge with transforms', () => {
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

    expect(sh).not.toBeNull();
    expect(sh).toContain('#!/bin/bash');
    expect(sh).toContain('set -euo pipefail');
    expect(sh).toContain('a.json');
    expect(sh).toContain('a_to_b.json');
    expect(sh).toContain('jq');
    expect(sh).toContain('findings');
    expect(sh).toContain('-c');
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

  it('generates drop transform as del()', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          data: String
          debug: String
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | drop(debug)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).not.toBeNull();
    expect(sh).toContain('del(.debug)');
  });

  it('generates select projection for multiple fields via multi-field select', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          a: String
          b: String
          c: String
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(a, b)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).not.toBeNull();
    expect(sh).toContain('a: .a');
    expect(sh).toContain('b: .b');
  });
});

// ---------------------------------------------------------------------------
// generateOrchestration
// ---------------------------------------------------------------------------
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
    expect(md).toContain('researcher_to_writer.json');
  });

  it('shows direct input for edge without transforms', () => {
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
    const report: TokenReport = {
      graphName: 'G',
      budget: 5000,
      bestCase: 3500,
      worstCase: 3500,
      nodes: [
        { name: 'A', estimatedIn: 500, estimatedOut: 1000 },
        { name: 'B', estimatedIn: 1000, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toContain('a.json');
    expect(md).not.toContain('a_to_b.json');
  });

  it('returns empty string when no graphs', () => {
    const program: Program = { contexts: [], nodes: [], edges: [], graphs: [] };
    const report: TokenReport = {
      graphName: '',
      budget: 0,
      bestCase: 0,
      worstCase: 0,
      nodes: [],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toBe('');
  });

  it('generates parallel step output', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces OutB { data: String }
      }
      node C(model: haiku, budget: 1k/500) {
        reads: [OutA, OutB]
        produces Final { result: String }
      }
      graph G(input: Spec, output: Final, budget: 10k) {
        parallel { A, B } -> C -> done
      }
    `);
    const report: TokenReport = {
      graphName: 'G',
      budget: 10000,
      bestCase: 3000,
      worstCase: 3000,
      nodes: [
        { name: 'A', estimatedIn: 500, estimatedOut: 500 },
        { name: 'B', estimatedIn: 500, estimatedOut: 500 },
        { name: 'C', estimatedIn: 1000, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toContain('[parallel]');
    expect(md).toContain('===NODE_COMPLETE===');
  });

  it('generates foreach step output', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Planner(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Plan { steps: List<String> }
      }
      node Worker(model: haiku, budget: 1k/500) {
        reads: [Plan]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 20k) {
        Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {
          Worker
        } -> done
      }
    `);
    const report: TokenReport = {
      graphName: 'G',
      budget: 20000,
      bestCase: 2000,
      worstCase: 6000,
      nodes: [
        { name: 'Planner', estimatedIn: 500, estimatedOut: 500 },
        { name: 'Worker', estimatedIn: 500, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toContain('[foreach');
    expect(md).toContain('max 5 iterations');
    expect(md).toContain('foreach-body');
  });
});

// ---------------------------------------------------------------------------
// generateSettings
// ---------------------------------------------------------------------------
describe('generateSettings', () => {
  it('generates settings with model routing', () => {
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
    expect(settings.hooks.PostToolUse.length).toBe(1);
    expect(settings.hooks.PostToolUse[0].matcher).toContain('a.json');
  });

  it('has no overrides when all nodes use same model', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    expect(Object.keys(settings.graft.model_routing.overrides)).toHaveLength(0);
  });

  it('includes valid compiled_at ISO timestamp', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    // Verify it is a valid ISO date string (non-deterministic, so just check format)
    expect(new Date(settings.graft.compiled_at).toISOString()).toBe(settings.graft.compiled_at);
  });

  it('passes through custom model strings', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: gpt4o, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    expect(settings.model).toBe('gpt4o');
  });
});

// ---------------------------------------------------------------------------
// generate (full pipeline)
// ---------------------------------------------------------------------------
describe('generate', () => {
  it('produces correct number of GeneratedFile entries', () => {
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
    const files = generate(program, report, 'hello.gft');

    // 2 agents + 1 hook + 1 CLAUDE.md + 1 settings.json + 2 scaffold = 7
    expect(files).toHaveLength(7);
    expect(files.map(f => f.path)).toContain('.claude/agents/researcher.md');
    expect(files.map(f => f.path)).toContain('.claude/agents/writer.md');
    expect(files.map(f => f.path)).toContain('.claude/hooks/researcher-to-writer.sh');
    expect(files.map(f => f.path)).toContain('.claude/CLAUDE.md');
    expect(files.map(f => f.path)).toContain('.claude/settings.json');
    expect(files.map(f => f.path)).toContain('.graft/session/node_outputs/.gitkeep');
    expect(files.map(f => f.path)).toContain('.graft/token_log.txt');
  });

  it('produces fewer files when edge has no transforms', () => {
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
    const report: TokenReport = {
      graphName: 'G',
      budget: 5000,
      bestCase: 3500,
      worstCase: 3500,
      nodes: [
        { name: 'A', estimatedIn: 500, estimatedOut: 1000 },
        { name: 'B', estimatedIn: 1000, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const files = generate(program, report, 'test.gft');

    // 2 agents + 0 hooks + 1 CLAUDE.md + 1 settings.json + 2 scaffold = 6
    expect(files).toHaveLength(6);
    expect(files.map(f => f.path)).not.toContain(expect.stringContaining('hooks/'));
  });
});
```

---

### `tests/integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';

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

  it('catches lexer errors', () => {
    const result = compile('@@@', 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toBeInstanceOf(GraftError);
  });

  it('rejects programs with no graph declaration', () => {
    const noGraphSource = `
      context Ctx(max_tokens: 100) {
        data: String
      }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ctx]
        produces Out { data: String }
      }
    `;
    const result = compile(noGraphSource, 'nograph.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('No graph declaration found');
  });

  it('compiles parallel_flow.gft end-to-end', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/parallel_flow.gft'), 'utf-8');
    const result = compile(source, 'parallel_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    expect(result.report!.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('compiles foreach_flow.gft end-to-end', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/foreach_flow.gft'), 'utf-8');
    const result = compile(source, 'foreach_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    // Foreach best case should be much less than worst case
    expect(result.report!.worstCase).toBeGreaterThan(result.report!.bestCase);
  });
});
```
