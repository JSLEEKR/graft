// src/parser/parser.ts
import { Token, TokenType, KEYWORDS } from '../lexer/tokens.js';
import { GraftError } from '../errors/diagnostics.js';
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl,
  ImportDecl, MemoryDecl,
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
      imports: [],
      memories: [],
      contexts: [],
      nodes: [],
      edges: [],
      graphs: [],
    };
    let seenNonImport = false;
    while (!this.isAtEnd()) {
      const token = this.current();
      switch (token.type) {
        case TokenType.Import:
          if (seenNonImport) {
            throw this.error('Import declarations must appear before all other declarations');
          }
          program.imports.push(this.parseImportDecl());
          break;
        case TokenType.Memory:
          seenNonImport = true;
          program.memories.push(this.parseMemoryDecl());
          break;
        case TokenType.Context:
          seenNonImport = true;
          program.contexts.push(this.parseContext());
          break;
        case TokenType.Node:
          seenNonImport = true;
          program.nodes.push(this.parseNode());
          break;
        case TokenType.Edge:
          seenNonImport = true;
          program.edges.push(this.parseEdge());
          break;
        case TokenType.Graph:
          seenNonImport = true;
          program.graphs.push(this.parseGraph());
          break;
        default:
          throw this.error(`Unexpected token '${token.value}', expected 'import', 'memory', 'context', 'node', 'edge', or 'graph'`);
      }
    }

    return program;
  }

  // --- Import ------------------------------------------------

  private parseImportDecl(): ImportDecl {
    const loc = this.current().location;
    this.expect(TokenType.Import);
    this.expect(TokenType.LBrace);
    const names: string[] = [];
    while (!this.check(TokenType.RBrace)) {
      if (names.length > 0) this.expect(TokenType.Comma);
      names.push(this.expectIdentifier());
    }
    if (names.length === 0) {
      throw this.error('Import must specify at least one name');
    }
    this.expect(TokenType.RBrace);
    this.expect(TokenType.From);
    const pathToken = this.expect(TokenType.StringLiteral);
    const path = pathToken.value;
    if (path === '') {
      throw this.error('Import path cannot be empty');
    }
    return { names, path, location: loc };
  }

  // --- Memory ------------------------------------------------

  private parseMemoryDecl(): MemoryDecl {
    const loc = this.current().location;
    this.expect(TokenType.Memory);
    const name = this.expectIdentifier();
    this.expect(TokenType.LParen);
    this.expect(TokenType.MaxTokens);
    this.expect(TokenType.Colon);
    const maxTokens = this.parseTokenValue();
    let storage: 'file' = 'file';
    if (this.check(TokenType.Comma)) {
      this.advance();
      this.expect(TokenType.Storage);
      this.expect(TokenType.Colon);
      const storageValue = this.expectIdentifierOrKeyword();
      if (storageValue !== 'file') {
        throw this.error(`Unknown storage type '${storageValue}', expected 'file'`);
      }
      storage = 'file';
    }
    this.expect(TokenType.RParen);
    this.expect(TokenType.LBrace);
    const fields = this.parseFields();
    this.expect(TokenType.RBrace);
    return { name, maxTokens, storage, fields, location: loc };
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
    let writes: string[] = [];
    let onFailure: FailureStrategy | undefined;
    let produces: ProducesDecl | undefined;
    let hasWrites = false;

    while (!this.check(TokenType.RBrace)) {
      if (this.check(TokenType.Reads)) {
        this.advance();
        this.expect(TokenType.Colon);
        reads = this.parseContextRefList();
      } else if (this.check(TokenType.Tools)) {
        this.advance();
        this.expect(TokenType.Colon);
        tools = this.parseIdentifierList();
      } else if (this.check(TokenType.Writes)) {
        if (hasWrites) {
          throw this.error('Duplicate writes clause in node');
        }
        hasWrites = true;
        this.advance();
        this.expect(TokenType.Colon);
        writes = this.parseIdentifierList();
      } else if (this.check(TokenType.OnFailure)) {
        this.advance();
        this.expect(TokenType.Colon);
        onFailure = this.parseFailureStrategy();
      } else if (this.check(TokenType.Produces)) {
        produces = this.parseProduces();
      } else {
        throw this.error(`Unexpected token '${this.current().value}' in node body`);
      }
    }
    this.expect(TokenType.RBrace);

    if (!produces) {
      throw new GraftError('Node must have a produces declaration', loc);
    }

    return { name, model, budgetIn, budgetOut, reads, tools, writes, onFailure, produces, location: loc };
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
