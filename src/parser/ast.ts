import { SourceLocation } from '../errors/diagnostics.js';

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

// Flow control nodes (v1.1)
export type FlowNode =
  | { kind: 'node'; name: string; location?: SourceLocation }
  | { kind: 'parallel'; branches: string[]; location?: SourceLocation }
  | { kind: 'foreach'; source: string; field: string; binding: string;
      maxIterations: number; body: FlowNode[]; location?: SourceLocation };

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
