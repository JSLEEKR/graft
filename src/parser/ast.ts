import { SourceLocation } from '../errors/diagnostics.js';

export type TemplatePart =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; value: Expr };

export type Expr =
  | { kind: 'literal'; value: string | number | boolean; location: SourceLocation }
  | { kind: 'field_access'; segments: string[]; location: SourceLocation }
  | { kind: 'binary'; op: '+' | '-' | '/' | '*' | '%' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&&' | '||'; left: Expr; right: Expr; location: SourceLocation }
  | { kind: 'unary'; op: '-' | '!'; operand: Expr; location: SourceLocation }
  | { kind: 'group'; inner: Expr; location: SourceLocation }
  | { kind: 'call'; name: string; args: Expr[]; location: SourceLocation }
  | { kind: 'template'; parts: TemplatePart[]; location: SourceLocation }
  | { kind: 'conditional'; condition: Expr; consequent: Expr; alternate: Expr; location: SourceLocation };

/** Built-in expression functions with metadata for type checking and LSP. */
export const BUILTIN_FUNCTIONS: Record<string, {
  arity: number;
  returnType: 'number' | 'string' | 'unknown';
  signature: string;
  description: string;
}> = {
  len: { arity: 1, returnType: 'number', signature: 'len(value) -> number', description: 'Returns the length of an array or string.' },
  max: { arity: 2, returnType: 'number', signature: 'max(a, b) -> number', description: 'Returns the larger of two numbers.' },
  min: { arity: 2, returnType: 'number', signature: 'min(a, b) -> number', description: 'Returns the smaller of two numbers.' },
  str: { arity: 1, returnType: 'string', signature: 'str(value) -> string', description: 'Converts a value to its string representation. Objects are JSON-stringified.' },
  abs: { arity: 1, returnType: 'number', signature: 'abs(n) -> number', description: 'Returns the absolute value of a number.' },
  round: { arity: 1, returnType: 'number', signature: 'round(n) -> number', description: 'Rounds a number to the nearest integer.' },
  keys: { arity: 1, returnType: 'unknown', signature: 'keys(obj) -> array', description: 'Returns the keys of an object as an array.' },
};

export interface ImportDecl {
  names: string[];
  path: string;
  resolvedPath?: string;
  location: SourceLocation;
}

export interface MemoryDecl {
  name: string;
  maxTokens: number;
  storage: 'file';
  fields: Field[];
  location: SourceLocation;
}

// Top-level program
export interface Program {
  imports: ImportDecl[];
  memories: MemoryDecl[];
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
  sourceFile?: string;
}

// node Analyzer(model: sonnet, budget: 5k/2k) { ... }
export interface NodeDecl {
  name: string;
  model: string;
  budgetIn: number;
  budgetOut: number;
  reads: ContextRef[];
  tools: string[];
  writes: WriteRef[];
  onFailure?: FailureStrategy;
  produces: ProducesDecl;
  location: SourceLocation;
  sourceFile?: string;
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

// Flow control nodes (v1.1+)
export type FlowNode =
  | { kind: 'node'; name: string; location?: SourceLocation }
  | { kind: 'parallel'; branches: string[]; location?: SourceLocation }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: FlowNode[]; location?: SourceLocation }
  | { kind: 'let'; name: string; value: Expr; location?: SourceLocation }
  | { kind: 'graph_call'; name: string; args: GraphArg[]; location?: SourceLocation };

// graph SimpleQA(...) { Researcher -> Writer -> done }
export interface GraphDecl {
  name: string;
  input: string;
  output: string;
  budget: number;
  params: GraphParam[];
  flow: FlowNode[];
  location: SourceLocation;
}

export interface GraphParam {
  name: string;
  type: 'Node' | 'Int' | 'String' | 'Bool';
  default?: string | number | boolean;
  location: SourceLocation;
}

export interface GraphArg {
  name: string;
  value: Expr;
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
  field?: string[];  // partial read: Research.findings or Research.{findings, confidence}
  location: SourceLocation;
}

// Write references in writes
export interface WriteRef {
  memory: string;
  field?: string;
  location: SourceLocation;
}

// Conditions (edge routing, filter)
export interface Condition {
  left: Expr;
  op: '>=' | '>' | '<' | '<=' | '==' | '!=';
  value: string | number | boolean;
}

export function conditionFieldName(condition: Condition): string {
  if (condition.left.kind === 'field_access') {
    return condition.left.segments.join('.');
  }
  if (condition.left.kind === 'call') {
    return `${condition.left.name}(...)`;
  }
  return '<expr>';
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
