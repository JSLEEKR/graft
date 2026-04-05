/**
 * Result formatter — formats RunResult into human-readable output.
 */
import { RunResult, NodeResult } from './executor.js';
import { Program } from '../parser/ast.js';
import { ProgramIndex } from '../program-index.js';
import { MODEL_MAP } from '../constants.js';

export interface FormatOptions {
  json?: boolean;
  verbose?: boolean;
}

/**
 * Format a RunResult for human-readable CLI output.
 */
export function formatRunResult(result: RunResult, program?: Program, options?: FormatOptions): string {
  if (options?.json) {
    return JSON.stringify({
      success: result.success,
      graph: result.graph,
      duration_ms: result.totalDurationMs,
      nodes: result.nodeResults.map(nr => ({
        node: nr.node,
        success: nr.success,
        duration_ms: nr.durationMs,
        tokens: nr.tokenUsage
          ? { input: nr.tokenUsage.inputTokens, output: nr.tokenUsage.outputTokens }
          : undefined,
        error: nr.error,
      })),
      token_usage: result.tokenUsage,
      output: result.finalOutput,
      errors: result.errors,
    }, null, 2);
  }

  const lines: string[] = [];
  const durationSec = (result.totalDurationMs / 1000).toFixed(1);

  if (result.success) {
    lines.push(`Graph '${result.graph}' completed in ${durationSec}s\n`);
  } else {
    lines.push(`Graph '${result.graph}' FAILED after ${durationSec}s\n`);
  }

  // Node results table
  const index = program ? new ProgramIndex(program) : undefined;

  for (const nr of result.nodeResults) {
    const icon = nr.success ? '\u2713' : '\u2717';
    const nodeName = nr.node.padEnd(20);
    const model = getModelShortName(nr.node, index);
    const modelStr = model.padEnd(8);
    const duration = `${(nr.durationMs / 1000).toFixed(1)}s`.padStart(6);
    const tokens = formatNodeTokens(nr);

    lines.push(`  ${icon} ${nodeName} ${modelStr} ${duration}  ${tokens}`);

    if (!nr.success && nr.error) {
      lines.push(`    Error: ${nr.error}`);
    }
  }

  // Token usage summary
  if (result.tokenUsage) {
    const { budget, consumed, fraction } = result.tokenUsage;
    const pct = Math.round(fraction * 100);
    const bar = renderBar(fraction, 30);
    lines.push('');
    lines.push(`Token usage: ${consumed.toLocaleString()} / ${budget.toLocaleString()} (${pct}%)`);
    lines.push(`  ${bar}`);

    if (fraction > 0.9) {
      lines.push('  \u26a0 WARNING: >90% of budget consumed');
    }
  }

  // Final output summary
  if (result.finalOutput !== null && result.finalOutput !== undefined) {
    lines.push('');
    const outputName = getOutputName(result, program);
    lines.push(`\u2500\u2500 Final Output (${outputName}) ${'─'.repeat(Math.max(0, 40 - outputName.length))}`);
    lines.push(formatOutput(result.finalOutput, options?.verbose));
    lines.push('─'.repeat(48));
  }

  // Errors
  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const err of result.errors) {
      lines.push(`  \u2717 ${err}`);
    }
  }

  return lines.join('\n');
}

function getModelShortName(nodeName: string, index?: ProgramIndex): string {
  if (!index) return '';
  const node = index.nodeMap.get(nodeName);
  if (!node) return '';
  return node.model;
}

function formatNodeTokens(nr: NodeResult): string {
  if (!nr.tokenUsage) return '';
  const total = nr.tokenUsage.inputTokens + nr.tokenUsage.outputTokens;
  return `${total.toLocaleString()} tok`;
}

function renderBar(fraction: number, width: number): string {
  const filled = Math.round(fraction * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  return `[${bar}]`;
}

function getOutputName(result: RunResult, program?: Program): string {
  if (program && program.graphs.length > 0) {
    return program.graphs[0].output;
  }
  return 'Result';
}

function formatOutput(output: unknown, verbose?: boolean): string {
  if (output === null || output === undefined) return '  (empty)';

  if (typeof output === 'string') {
    return verbose ? output : truncate(output, 200);
  }

  if (typeof output !== 'object') {
    return String(output);
  }

  const lines: string[] = [];
  const obj = output as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`  ${key}: ${value.length} items`);
      if (verbose) {
        for (const item of value.slice(0, 5)) {
          lines.push(`    - ${truncate(String(item), 100)}`);
        }
        if (value.length > 5) lines.push(`    ... and ${value.length - 5} more`);
      }
    } else if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      lines.push(`  ${key}: {${keys.length} fields}`);
    } else if (typeof value === 'string') {
      lines.push(`  ${key}: ${truncate(value, verbose ? 500 : 80)}`);
    } else {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}
