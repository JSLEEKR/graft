/**
 * Runtime result validator — checks pipeline output against .gft schema.
 */
import { Program, NodeDecl, Field, TypeExpr } from '../parser/ast.js';
import { RunResult, NodeResult } from './executor.js';
import { ProgramIndex } from '../program-index.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Check {
  status: CheckStatus;
  category: 'schema' | 'type' | 'range' | 'empty' | 'budget';
  node: string;
  field?: string;
  message: string;
}

export interface QualityReport {
  score: number;        // 0.0 to 1.0
  checks: Check[];
  passed: number;
  warned: number;
  failed: number;
}

/**
 * Validate a RunResult against the Program's produces schemas.
 */
export function validateResult(result: RunResult, program: Program): QualityReport {
  const checks: Check[] = [];
  const index = new ProgramIndex(program);

  // Validate each node's output
  for (const nr of result.nodeResults) {
    if (!nr.success) {
      checks.push({ status: 'fail', category: 'schema', node: nr.node, message: `Node failed: ${nr.error ?? 'unknown error'}` });
      continue;
    }

    const nodeDecl = index.nodeMap.get(nr.node);
    if (!nodeDecl) continue;

    validateNodeOutput(nr, nodeDecl, checks);
  }

  // Budget check
  if (result.tokenUsage) {
    const { fraction } = result.tokenUsage;
    if (fraction > 0.95) {
      checks.push({ status: 'fail', category: 'budget', node: '*', message: `Token budget nearly exhausted: ${Math.round(fraction * 100)}%` });
    } else if (fraction > 0.8) {
      checks.push({ status: 'warn', category: 'budget', node: '*', message: `Token budget high: ${Math.round(fraction * 100)}%` });
    } else {
      checks.push({ status: 'pass', category: 'budget', node: '*', message: `Token budget OK: ${Math.round(fraction * 100)}%` });
    }
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const total = checks.length;
  const score = total > 0 ? passed / total : 1.0;

  return { score, checks, passed, warned, failed };
}

function validateNodeOutput(nr: NodeResult, nodeDecl: NodeDecl, checks: Check[]): void {
  const output = nr.output;
  if (output === null || output === undefined) {
    checks.push({ status: 'fail', category: 'schema', node: nr.node, message: 'Output is null' });
    return;
  }

  if (typeof output !== 'object' || Array.isArray(output)) {
    checks.push({ status: 'fail', category: 'schema', node: nr.node, message: `Output is ${typeof output}, expected object` });
    return;
  }

  const obj = output as Record<string, unknown>;
  const fields = nodeDecl.produces.fields;

  // Check each declared field
  for (const field of fields) {
    const value = obj[field.name];

    // Schema: field exists?
    if (value === undefined) {
      checks.push({ status: 'fail', category: 'schema', node: nr.node, field: field.name, message: `Missing field: ${field.name}` });
      continue;
    }

    // Type check
    const typeCheck = checkType(value, field.type);
    if (typeCheck !== null) {
      checks.push({ status: 'fail', category: 'type', node: nr.node, field: field.name, message: typeCheck });
      continue;
    }

    // Empty check
    if (isEmpty(value)) {
      checks.push({ status: 'warn', category: 'empty', node: nr.node, field: field.name, message: `Field '${field.name}' is empty` });
      continue;
    }

    // Range check for Float(min..max)
    if (field.type.kind === 'primitive_range' && typeof value === 'number') {
      if (value < field.type.min || value > field.type.max) {
        checks.push({
          status: 'fail', category: 'range', node: nr.node, field: field.name,
          message: `Value ${value} out of range [${field.type.min}..${field.type.max}]`,
        });
        continue;
      }
    }

    checks.push({ status: 'pass', category: 'schema', node: nr.node, field: field.name, message: `${field.name} OK` });
  }
}

function checkType(value: unknown, type: TypeExpr): string | null {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return typeof value === 'string' ? null : `Expected String, got ${typeof value}`;
        case 'Int': return typeof value === 'number' && Number.isInteger(value) ? null : `Expected Int, got ${typeof value}`;
        case 'Float': return typeof value === 'number' ? null : `Expected Float, got ${typeof value}`;
        case 'Bool': return typeof value === 'boolean' ? null : `Expected Bool, got ${typeof value}`;
        default: return null; // Unknown primitive, skip
      }
    case 'primitive_range':
      return typeof value === 'number' ? null : `Expected Float, got ${typeof value}`;
    case 'list':
      return Array.isArray(value) ? null : `Expected List, got ${typeof value}`;
    case 'map':
      return (typeof value === 'object' && value !== null && !Array.isArray(value)) ? null : `Expected Map, got ${typeof value}`;
    case 'optional':
      return null; // null is valid for Optional
    default:
      return null; // Unknown type, skip
  }
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

/**
 * Format a QualityReport for human-readable output.
 */
export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [];
  lines.push('\u2500\u2500 Quality Check ' + '\u2500'.repeat(33));

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '\u2713' : check.status === 'warn' ? '\u26a0' : '\u2717';
    const fieldStr = check.field ? ` ${check.node}.${check.field}` : '';
    lines.push(`  ${icon} ${check.message}${fieldStr ? ` [${check.node}.${check.field}]` : ''}`);
  }

  lines.push('\u2500'.repeat(48));
  const pct = Math.round(report.score * 100);
  lines.push(`Quality: ${pct}% (${report.passed}/${report.passed + report.warned + report.failed} checks passed)`);

  return lines.join('\n');
}
