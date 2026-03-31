# Convergence Report -- T4: Recursive Descent Parser

## Summary

The parser follows the plan's recursive descent design with four targeted fixes applied based on the debate. The architecture is sound: one class, one entry point, private methods per grammar production, LL(1) with LL(2) only for inline structs, throw-on-first-error. The critical keyword-identifier collision bug (A3's Bug #8) is **fixed now** via `expectIdentifierOrKeyword()`, not deferred. The `parseProduces()` location bug is fixed. The dead `source` parameter is removed. Graph flow requires `done` termination. Tests cover all failure strategies and the keyword-as-field-name case.

## Forced Dissent Rulings

A4-Specialist was the forced dissenter (highest Step 1 score: 4/5, tied with A1 and A2).

| Argument | Ruling | Basis |
|----------|--------|-------|
| A4 initially declared "No collision" for keyword-identifier bug (Step 1, Section 8) | **REJECT** -- A4 self-corrected in Step 2 | A4 tested only model names (sonnet, haiku, opus) which are not keywords. Field names like `input`, `output`, `model`, `budget`, `select`, `filter`, `drop`, `compact`, `skip` ARE keywords and WILL crash `expectIdentifier()`. A4 acknowledged confirmation bias in self-rebuttal. |
| A4 revised recommendation: fix keyword collision via regex-based `expectIdentifier()` | **REJECT approach, ACCEPT intent** | A4's regex approach (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) is overly permissive. A1's `KEYWORD_TYPES` Set approach is cleaner: build a `Set<TokenType>` from `KEYWORDS` values, check membership. Separate `expectIdentifierOrKeyword()` preserves strict `expectIdentifier()` for declaration names. |
| A4: Map value position does not support inline structs | **ACCEPT as v1 limitation** | Spec never shows `Map<K, InlineStruct { ... }>`. Acceptable for v1. |
| A4: Conditional edges cannot have transforms | **ACCEPT as v1 limitation** | Spec does not show this pattern. |

## Per-Agent Accept/Reject

### A1-Architect
- **Accepted**: `parseProduces()` should consume its own `produces` keyword -- cleanest fix for the location bug.
- **Accepted**: `expectIdentifierOrKeyword()` with `KEYWORD_TYPES` Set approach -- clean O(1) lookup, separate from strict `expectIdentifier()`.
- **Accepted**: parseInt k-suffix comment -- low cost, prevents future confusion.
- **Accepted**: Graph flow should require `done` terminator.
- **Accepted**: Additional tests for skip/abort/fallback strategies.
- **Rejected**: LAngle/RAngle alias -- cosmetic, no value.

### A2-Pragmatist
- **Accepted**: Remove dead `source` parameter from constructor -- it is never referenced in the parser.
- **Accepted**: Tests are not redundant; each targets a distinct grammar production.
- **Rejected**: Defer keyword-identifier collision to v2 -- A3 and A1 (Step 2) make a compelling case that `input: String` as a field name is entirely plausible. The fix is 15 lines. Deferring creates a user-facing crash for a common word.

### A3-Skeptic
- **Accepted**: Bug #8 (keyword-identifier collision) -- the critical finding of this debate cycle. Fix now.
- **Accepted**: Bug #1 (parseProduces location) -- all agents agree.
- **Accepted**: Bug #12 (graph done enforcement) -- require `done` in the parser.
- **Accepted**: Missing tests for skip/abort/fallback.
- **Rejected**: Convergence score of 4/10 is too low -- 7 of 12 bugs were self-corrected during analysis. The parser architecture is sound. 6/10 is more appropriate (A4 Step 2 assessment).
- Self-corrections on Bugs 2, 3, 4, 5, 6, 7, 11 are noted and appreciated for intellectual honesty.

### A4-Specialist
- **Accepted**: LL(k) grammar analysis -- thorough and correct.
- **Accepted**: Method decomposition 1:1 with grammar productions -- confirmed by all agents.
- **Accepted**: `parseType()` vs `parseTypeOrInlineStruct()` distinction analysis -- most thorough of all agents.
- **Accepted**: Map value inline struct limitation -- valid, deferred.
- **Accepted**: Self-rebuttal on keyword collision -- honest acknowledgment of confirmation bias.
- **Rejected**: Original Step 1 claim of "No collision" -- wrong, as A4 acknowledged.

## Implementation Spec

### File List
- Create: `src/parser/parser.ts`
- Test: `tests/parser.test.ts`

### Key Design Decisions Applied

1. **Keyword-identifier collision: FIX NOW.** Add `expectIdentifierOrKeyword()` helper. Use it at: `parseFields()` (field names), `parseIdentifierList()` (tool names), enum values in `parseType()`, `parseTransform()` select/drop (field names), `parseCondition()` (field name), `parseConditionValue()` (bare identifier values), `parseContextRefList()` dot-field names. Keep strict `expectIdentifier()` for: declaration names (context, node, edge, graph), produces name, context ref context-part, graph flow nodes, edge source/target, conditional target node names.

2. **parseProduces() location fix.** `parseProduces()` consumes the `produces` keyword itself. The `parseNode()` body does NOT advance past `produces` before calling `parseProduces()`.

3. **Remove dead `source` parameter.** Constructor takes only `Token[]`.

4. **Require `done` terminator in graph flow.** After the arrow loop, check `sawDone` flag. Throw if false.

5. **parseInt k-suffix comment.** Document that `parseInt("5k", 10)` returns `5` per the JS spec.

### Implementation Code

```typescript
// src/parser/parser.ts
import { Token, TokenType, KEYWORDS } from '../lexer/tokens.js';
import { GraftError } from '../errors/diagnostics.js';
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl,
  Field, TypeExpr, ContextRef, ProducesDecl,
  Transform, Condition, FailureStrategy,
  EdgeTarget, ConditionalBranch,
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
      const field = this.expectIdentifierOrKeyword();
      this.expect(TokenType.RParen);
      return { type: 'select', field };
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

    // Body: { Node -> Node -> done }
    this.expect(TokenType.LBrace);
    const flow: string[] = [];
    flow.push(this.expectIdentifier());
    let sawDone = false;
    while (this.check(TokenType.Arrow)) {
      this.advance();
      if (this.check(TokenType.Done)) {
        this.advance();
        sawDone = true;
        break;
      }
      flow.push(this.expectIdentifier());
    }
    if (!sawDone) {
      throw this.error("Expected '-> done' to terminate graph flow");
    }
    this.expect(TokenType.RBrace);

    return { name, input, output, budget, flow, location: loc };
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

### Test Code

```typescript
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
        node Optional(model: haiku, budget: 1k/500) {
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

    it('reports error on graph flow without done terminator', () => {
      expect(() => parse(`
        graph Bad(input: A, output: B, budget: 1k) {
          X -> Y
        }
      `)).toThrow("Expected '-> done' to terminate graph flow");
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
        { type: 'select', field: 'input' },
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

### Verification Commands

```bash
npx vitest run tests/parser.test.ts
```

Expected: All tests PASS. The test suite covers:
- 3 context tests (basic, k-suffix, collection types)
- 7 node tests (basic, k-suffix, partial reads, tools+on_failure, inline struct, retry_then_fallback, skip, abort, standalone fallback, missing produces error)
- 5 edge tests (simple, pipe transforms, filter, truncate, conditional routing)
- 2 graph tests (basic, missing done error)
- 1 full program test (hello.gft integration)
- 5 type expression tests (Optional, Map, TokenBounded, Float range, nested generics)
- 5 keyword-as-identifier tests (field names, enum values, tool names, select/drop args, condition field)
- 2 error tests (missing brace, unexpected token)

Total: 30 test cases.

## Ratchet-Locked Items

- [T4-R01] Parser constructor takes `Token[]` only (no `source` parameter) -- LOCKED
- [T4-R02] `expectIdentifierOrKeyword()` for field names, tool names, enum values, transform args, condition fields; strict `expectIdentifier()` for declaration names -- LOCKED
- [T4-R03] `parseProduces()` consumes its own `produces` keyword (location captured correctly) -- LOCKED
- [T4-R04] Graph flow requires `done` terminator; parser throws if absent -- LOCKED
- [T4-R05] `KEYWORD_TYPES` Set built from `Object.values(KEYWORDS)` at module scope -- LOCKED
- [T4-R06] Throw-on-first-error via `GraftError` (consistent with T2-R02) -- LOCKED
- [T4-R07] LL(1) with LL(2) only for inline structs (`Identifier + LBrace` in `parseTypeOrInlineStruct`) -- LOCKED

## Convergence Metrics

- Final convergence score: 9/10
- Unresolved issues: None. All debate points resolved.
- Accepted v1 limitations (not bugs):
  - `Map<K, V>` value position does not support inline structs
  - Conditional edges cannot have pipe transforms
  - Graph/node parameter order is fixed
- Notes for next task:
  - T5 analyzer can rely on `expectIdentifierOrKeyword()` ensuring field/tool names are valid strings
  - Parser constructor no longer takes `source` -- T5 `parse()` helper in tests must be updated accordingly
  - `parseProduces()` location now correctly points to the `produces` keyword
