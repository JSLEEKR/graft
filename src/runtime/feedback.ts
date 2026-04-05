/**
 * Feedback generator — produces .gft modification suggestions from quality reports.
 */
import { Program } from '../parser/ast.js';
import { ProgramIndex } from '../program-index.js';
import { QualityReport, Check } from './result-validator.js';

export interface Suggestion {
  type: 'budget' | 'retry' | 'transform' | 'schema';
  severity: 'info' | 'warning' | 'error';
  node: string;
  message: string;
  fix?: string;  // Suggested .gft code change
}

/**
 * Generate .gft modification suggestions from a quality report.
 */
export function generateFeedback(report: QualityReport, program: Program): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const index = new ProgramIndex(program);

  for (const check of report.checks) {
    if (check.status === 'pass') continue;

    const suggestion = checkToSuggestion(check, index);
    if (suggestion) suggestions.push(suggestion);
  }

  return suggestions;
}

function checkToSuggestion(check: Check, index: ProgramIndex): Suggestion | null {
  switch (check.category) {
    case 'budget':
      return budgetSuggestion(check, index);
    case 'empty':
      return emptySuggestion(check, index);
    case 'schema':
      return schemaSuggestion(check, index);
    case 'type':
      return typeSuggestion(check);
    case 'range':
      return rangeSuggestion(check);
    default:
      return null;
  }
}

function budgetSuggestion(check: Check, index: ProgramIndex): Suggestion {
  if (check.status === 'fail') {
    // Budget nearly exhausted — suggest adding edge transforms
    const edges = [...index.edgesBySource.entries()];
    const edgeHints = edges.length > 0
      ? `Add edge transforms to reduce token flow. Example:\n  edge ${edges[0][0]} -> ... | truncate(500)`
      : 'Increase graph budget or reduce node budgets.';

    return {
      type: 'transform',
      severity: 'error',
      node: '*',
      message: 'Token budget nearly exhausted.',
      fix: edgeHints,
    };
  }

  return {
    type: 'budget',
    severity: 'warning',
    node: '*',
    message: 'Token budget usage is high. Consider adding compact or truncate transforms.',
  };
}

function emptySuggestion(check: Check, index: ProgramIndex): Suggestion {
  const nodeDecl = check.node !== '*' ? index.nodeMap.get(check.node) : undefined;

  if (nodeDecl) {
    const currentOut = nodeDecl.budgetOut;
    const suggestedOut = currentOut * 2;
    return {
      type: 'budget',
      severity: 'warning',
      node: check.node,
      message: `Field '${check.field}' is empty. The node may need more output tokens.`,
      fix: `Increase ${check.node} output budget: budget: ${formatTokens(nodeDecl.budgetIn)}/${formatTokens(suggestedOut)}`,
    };
  }

  return {
    type: 'budget',
    severity: 'warning',
    node: check.node,
    message: `Field '${check.field}' is empty.`,
  };
}

function schemaSuggestion(check: Check, index: ProgramIndex): Suggestion | null {
  if (check.message.includes('failed') || check.message.includes('Failed')) {
    const nodeDecl = check.node !== '*' ? index.nodeMap.get(check.node) : undefined;
    if (nodeDecl && !nodeDecl.onFailure) {
      return {
        type: 'retry',
        severity: 'error',
        node: check.node,
        message: `Node '${check.node}' failed. Add a failure strategy.`,
        fix: `Add to ${check.node}: on_failure: retry(2)`,
      };
    }
    return {
      type: 'retry',
      severity: 'error',
      node: check.node,
      message: `Node '${check.node}' failed.`,
    };
  }

  if (check.message.includes('Missing field')) {
    return {
      type: 'schema',
      severity: 'error',
      node: check.node,
      message: check.message,
      fix: `Check that ${check.node}'s prompt clearly requests the '${check.field}' field in its output.`,
    };
  }

  if (check.message.includes('null')) {
    return {
      type: 'schema',
      severity: 'error',
      node: check.node,
      message: `Node '${check.node}' produced null output. It may have silently failed.`,
      fix: `Add to ${check.node}: on_failure: retry(2)`,
    };
  }

  return null;
}

function typeSuggestion(check: Check): Suggestion {
  return {
    type: 'schema',
    severity: 'error',
    node: check.node,
    message: `Type mismatch in ${check.node}.${check.field}: ${check.message}`,
  };
}

function rangeSuggestion(check: Check): Suggestion {
  return {
    type: 'schema',
    severity: 'error',
    node: check.node,
    message: `Range violation in ${check.node}.${check.field}: ${check.message}`,
  };
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * Format suggestions for human-readable output.
 */
export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return '';

  const lines: string[] = [];
  lines.push('\n\u2500\u2500 Suggestions ' + '\u2500'.repeat(35));

  for (const s of suggestions) {
    const icon = s.severity === 'error' ? '\u2717' : s.severity === 'warning' ? '\u26a0' : '\u2139';
    lines.push(`  ${icon} ${s.message}`);
    if (s.fix) {
      lines.push(`    \u2192 ${s.fix}`);
    }
  }

  lines.push('\u2500'.repeat(48));
  return lines.join('\n');
}
