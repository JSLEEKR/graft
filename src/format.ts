import { TokenReport } from './analyzer/estimator.js';
import { Expr } from './parser/ast.js';

export interface FormatOptions {
  /** Include budget comparison on best/worst path lines */
  showBudget?: boolean;
}

/**
 * Format a TokenReport into human-readable lines for CLI output.
 * Returns a single string with newlines.
 */
export function formatTokenReport(report: TokenReport, options?: FormatOptions): string {
  const lines: string[] = [];
  const showBudget = options?.showBudget ?? false;

  for (const node of report.nodes) {
    lines.push(`    ${node.name.padEnd(20)} in ~${node.estimatedIn.toLocaleString('en-US').padStart(6)}  out ~${node.estimatedOut.toLocaleString('en-US').padStart(6)}`);
  }

  if (showBudget) {
    const bestOk = report.bestCase <= report.budget;
    const worstOk = report.worstCase <= report.budget;
    lines.push(`    Best path:  ${report.bestCase.toLocaleString('en-US').padStart(8)} tokens ${bestOk ? '\u2713' : '\u2717'} ${bestOk ? 'within' : 'exceeds'} budget (${report.budget.toLocaleString('en-US')})`);
    lines.push(`    Worst path: ${report.worstCase.toLocaleString('en-US').padStart(8)} tokens ${worstOk ? '\u2713' : '\u26A0'} ${worstOk ? 'within' : 'exceeds'} budget (${report.budget.toLocaleString('en-US')})`);
  } else {
    lines.push(`    Best path:  ${report.bestCase.toLocaleString('en-US').padStart(8)} tokens`);
    lines.push(`    Worst path: ${report.worstCase.toLocaleString('en-US').padStart(8)} tokens`);
  }

  return lines.join('\n');
}

export function formatExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'string' ? `"${expr.value}"` : String(expr.value);
    case 'field_access':
      return expr.segments.join('.');
    case 'binary':
      return `${formatExpr(expr.left)} ${expr.op} ${formatExpr(expr.right)}`;
    case 'unary':
      return `${expr.op}${formatExpr(expr.operand)}`;
    case 'group':
      return `(${formatExpr(expr.inner)})`;
    case 'call':
      return `${expr.name}(${expr.args.map(formatExpr).join(', ')})`;
    case 'template':
      return '"' + expr.parts.map(p => p.kind === 'text' ? p.value : `\${${formatExpr(p.value)}}`).join('') + '"';
    case 'conditional':
      return `if ${formatExpr(expr.condition)} then ${formatExpr(expr.consequent)} else ${formatExpr(expr.alternate)}`;
    default: {
      const _exhaustive: never = expr;
      return _exhaustive;
    }
  }
}
