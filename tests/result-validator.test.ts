import { describe, it, expect } from 'vitest';
import { validateResult, formatQualityReport } from '../src/runtime/result-validator.js';
import { RunResult } from '../src/runtime/executor.js';
import { Program } from '../src/parser/ast.js';
import { compileToProgram } from '../src/compiler.js';

function parse(source: string): Program {
  const result = compileToProgram(source, 'test.gft');
  if (!result.success || !result.program) throw new Error('Parse failed: ' + result.errors.map(e => e.message).join(', '));
  return result.program;
}

const SOURCE = `
context Input(max_tokens: 1k) {
  query: String
}

node Analyzer(model: sonnet, budget: 4k/2k) {
  reads: [Input]
  produces Analysis {
    score: Float(0..1)
    items: List<String>
    summary: String
    count: Int
    flag: Bool
  }
}

graph Pipeline(input: Input, output: Analysis, budget: 10k) {
  Analyzer -> done
}
`;

function makeRunResult(nodeOutput: unknown, overrides?: Partial<RunResult>): RunResult {
  return {
    success: true,
    graph: 'Pipeline',
    nodeResults: [
      { node: 'Analyzer', output: nodeOutput, durationMs: 1000, success: true, tokenUsage: { inputTokens: 500, outputTokens: 1000 } },
    ],
    finalOutput: nodeOutput,
    totalDurationMs: 1000,
    errors: [],
    tokenUsage: { budget: 10000, consumed: 1500, fraction: 0.15, perNode: [] },
    ...overrides,
  };
}

describe('validateResult', () => {
  const program = parse(SOURCE);

  it('passes for valid output', () => {
    const result = makeRunResult({
      score: 0.85,
      items: ['item1', 'item2'],
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.failed).toBe(0);
    expect(report.score).toBeGreaterThan(0.5);
  });

  it('fails on missing field', () => {
    const result = makeRunResult({
      score: 0.85,
      // items missing
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.failed).toBeGreaterThan(0);
    expect(report.checks.some(c => c.status === 'fail' && c.field === 'items')).toBe(true);
  });

  it('fails on wrong type', () => {
    const result = makeRunResult({
      score: 'not a number',
      items: ['item1'],
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.status === 'fail' && c.category === 'type')).toBe(true);
  });

  it('fails on range violation', () => {
    const result = makeRunResult({
      score: 1.5,  // out of 0..1
      items: ['item1'],
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.status === 'fail' && c.category === 'range')).toBe(true);
  });

  it('warns on empty list', () => {
    const result = makeRunResult({
      score: 0.5,
      items: [],
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.status === 'warn' && c.category === 'empty')).toBe(true);
  });

  it('warns on empty string', () => {
    const result = makeRunResult({
      score: 0.5,
      items: ['item1'],
      summary: '',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.status === 'warn' && c.category === 'empty')).toBe(true);
  });

  it('fails on null output', () => {
    const result = makeRunResult(null);
    const report = validateResult(result, program);
    expect(report.failed).toBeGreaterThan(0);
  });

  it('checks budget usage', () => {
    const result = makeRunResult(
      { score: 0.5, items: ['a'], summary: 'x', count: 1, flag: true },
      { tokenUsage: { budget: 10000, consumed: 9600, fraction: 0.96, perNode: [] } },
    );
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.category === 'budget' && c.status === 'fail')).toBe(true);
  });

  it('warns on high budget usage', () => {
    const result = makeRunResult(
      { score: 0.5, items: ['a'], summary: 'x', count: 1, flag: true },
      { tokenUsage: { budget: 10000, consumed: 8500, fraction: 0.85, perNode: [] } },
    );
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.category === 'budget' && c.status === 'warn')).toBe(true);
  });

  it('handles failed node', () => {
    const result: RunResult = {
      success: false,
      graph: 'Pipeline',
      nodeResults: [
        { node: 'Analyzer', output: null, durationMs: 500, success: false, error: 'Timeout' },
      ],
      finalOutput: null,
      totalDurationMs: 500,
      errors: ['Analyzer failed'],
      tokenUsage: { budget: 10000, consumed: 500, fraction: 0.05, perNode: [] },
    };
    const report = validateResult(result, program);
    expect(report.checks.some(c => c.status === 'fail' && c.message.includes('Timeout'))).toBe(true);
  });
});

describe('formatQualityReport', () => {
  const program = parse(SOURCE);

  it('formats a passing report', () => {
    const result = makeRunResult({
      score: 0.85,
      items: ['item1'],
      summary: 'Good',
      count: 5,
      flag: true,
    });
    const report = validateResult(result, program);
    const output = formatQualityReport(report);
    expect(output).toContain('Quality');
    expect(output).toContain('OK');
  });

  it('formats a failing report', () => {
    const result = makeRunResult({ score: 'bad' });
    const report = validateResult(result, program);
    const output = formatQualityReport(report);
    expect(output).toContain('Quality');
  });
});
