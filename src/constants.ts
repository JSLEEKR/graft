export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

/** Fraction of tokens estimated for a single-field read (vs full context). */
export const PARTIAL_FIELD_FACTOR = 0.3;

/** Budget fraction at which to emit a warning. */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/** Budget fraction at which to emit a critical warning. */
export const BUDGET_CRITICAL_THRESHOLD = 0.9;

/** Maximum depth for conditional chain traversal in both estimation and runtime. */
export const MAX_CONDITIONAL_HOPS = 10;
