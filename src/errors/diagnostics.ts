export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
  length?: number;
}

export type ParseErrorCode =
  | 'PARSE_UNEXPECTED_TOKEN'
  | 'PARSE_MISSING_FIELD';

export type ScopeErrorCode =
  | 'SCOPE_DUPLICATE_NAME'
  | 'SCOPE_UNDEFINED_REF'
  | 'SCOPE_FIELD_NOT_FOUND'
  | 'SCOPE_INVALID_WRITES'
  | 'SCOPE_INVALID_FOREACH'
  | 'SCOPE_PARALLEL_WRITES'
  | 'SCOPE_MAX_TOKENS_INVALID'
  | 'SCOPE_INVALID_FALLBACK'
  | 'SCOPE_FALLBACK_CYCLE'
  | 'SCOPE_BINDING_COLLISION';

export type TypeErrorCode =
  | 'TYPE_FIELD_NOT_FOUND'
  | 'TYPE_SCHEMA_MISMATCH'
  | 'TYPE_WRITE_FIELD_OVERLAP'
  | 'TYPE_CONDITION_MISMATCH';

export type BudgetErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_NODE_EXCEEDED';

export type ImportErrorCode =
  | 'IMPORT_CIRCULAR'
  | 'IMPORT_NOT_FOUND'
  | 'IMPORT_NAME_NOT_FOUND'
  | 'IMPORT_DUPLICATE_NAME'
  | 'IMPORT_INVALID_PATH'
  | 'IMPORT_PARSE_ERROR';

export type GraphErrorCode =
  | 'GRAPH_MISSING'
  | 'GRAPH_MULTIPLE';

export type ConfigErrorCode =
  | 'CONFIG_UNKNOWN_BACKEND';

export type GraftErrorCode =
  | ParseErrorCode
  | ScopeErrorCode
  | TypeErrorCode
  | BudgetErrorCode
  | ImportErrorCode
  | GraphErrorCode
  | ConfigErrorCode;

export class GraftError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
    public readonly code?: GraftErrorCode,
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
