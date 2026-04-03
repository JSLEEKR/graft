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
  | 'SCOPE_BINDING_COLLISION'
  | 'SCOPE_VAR_COLLISION'
  | 'SCOPE_VAR_UNDECLARED'
  | 'SCOPE_VAR_ORDER'
  | 'SCOPE_GRAPH_RECURSION'
  | 'SCOPE_GRAPH_PARAM_MISSING'
  | 'SCOPE_GRAPH_PARAM_TYPE'
  | 'SCOPE_UNKNOWN_FUNCTION';

export type TypeErrorCode =
  | 'TYPE_FIELD_NOT_FOUND'
  | 'TYPE_SCHEMA_MISMATCH'
  | 'TYPE_WRITE_FIELD_OVERLAP'
  | 'TYPE_CONDITION_MISMATCH'
  | 'TYPE_EXPR_MISMATCH'
  | 'TYPE_VAR_CONDITION'
  | 'TYPE_FUNC_ARITY'
  | 'TYPE_CONDITIONAL_MISMATCH';

export type BudgetErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_NODE_EXCEEDED'
  | 'BUDGET_CHAIN_CYCLE'
  | 'BUDGET_CHAIN_DEPTH';

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
    public readonly help?: string,
  ) {
    super(message);
    this.name = 'GraftError';
  }

  format(source: string, filename?: string): string {
    const lines = source.split('\n');
    const lineIdx = this.location.line - 1;
    const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
    const col = Math.max(0, this.location.column - 1);
    const lineNumStr = String(this.location.line);
    const gutter = ' '.repeat(lineNumStr.length);

    // Underline: use length if available, otherwise single caret
    const underlineLen = this.location.length && this.location.length > 0
      ? this.location.length
      : 1;
    const underline = '^'.repeat(underlineLen);

    const label = this.severity === 'warning' ? 'warning' : 'error';
    const codeStr = this.code ? `[${this.code}]` : '';
    const file = filename || '<source>';

    const result = [
      `${label}${codeStr}: ${this.message}`,
      ` ${gutter}--> ${file}:${this.location.line}:${this.location.column}`,
      ` ${gutter} |`,
      ` ${lineNumStr} | ${line}`,
      ` ${gutter} | ${' '.repeat(col)}${underline}`,
    ];

    if (this.help) {
      result.push(` ${gutter} |`);
      result.push(` ${gutter} = help: ${this.help}`);
    }

    return result.join('\n');
  }
}

/**
 * Find the closest match to `name` from `candidates` using Levenshtein distance.
 * Returns the best match if distance <= maxDistance, otherwise undefined.
 */
export function didYouMean(name: string, candidates: string[], maxDistance = 3): string | undefined {
  let best: string | undefined;
  let bestDist = maxDistance + 1;

  for (const candidate of candidates) {
    const dist = levenshtein(name.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return bestDist <= maxDistance ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,     // insert
        prev[j] + 1,          // delete
        prev[j - 1] + cost,   // replace
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}
