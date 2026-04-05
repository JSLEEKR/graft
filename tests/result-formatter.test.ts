import { describe, it, expect } from 'vitest';
import { formatRunResult } from '../src/runtime/result-formatter.js';
import { RunResult } from '../src/runtime/executor.js';

function makeResult(overrides?: Partial<RunResult>): RunResult {
  return {
    success: true,
    graph: 'TestPipeline',
    nodeResults: [
      { node: 'Analyzer', output: { score: 0.8 }, durationMs: 1200, success: true, tokenUsage: { inputTokens: 500, outputTokens: 1000 } },
      { node: 'Reviewer', output: { approved: true }, durationMs: 800, success: true, tokenUsage: { inputTokens: 300, outputTokens: 500 } },
    ],
    finalOutput: { approved: true, summary: 'All checks passed', items: ['fix-1', 'fix-2'] },
    totalDurationMs: 2000,
    errors: [],
    tokenUsage: { budget: 10000, consumed: 2300, fraction: 0.23, perNode: [] },
    ...overrides,
  };
}

describe('formatRunResult', () => {
  it('formats successful result', () => {
    const output = formatRunResult(makeResult());
    expect(output).toContain('TestPipeline');
    expect(output).toContain('completed');
    expect(output).toContain('2.0s');
    expect(output).toContain('Analyzer');
    expect(output).toContain('Reviewer');
    expect(output).toContain('1,500 tok');
    expect(output).toContain('2,300 / 10,000');
    expect(output).toContain('23%');
  });

  it('formats failed result', () => {
    const output = formatRunResult(makeResult({
      success: false,
      errors: ['Node Analyzer failed after 2 retries'],
      nodeResults: [
        { node: 'Analyzer', output: null, durationMs: 3000, success: false, error: 'Timeout' },
      ],
    }));
    expect(output).toContain('FAILED');
    expect(output).toContain('Timeout');
    expect(output).toContain('Node Analyzer failed');
  });

  it('shows budget warning at >90%', () => {
    const output = formatRunResult(makeResult({
      tokenUsage: { budget: 10000, consumed: 9500, fraction: 0.95, perNode: [] },
    }));
    expect(output).toContain('WARNING');
    expect(output).toContain('95%');
  });

  it('formats final output with field summary', () => {
    const output = formatRunResult(makeResult());
    expect(output).toContain('approved: true');
    expect(output).toContain('summary: All checks passed');
    expect(output).toContain('items: 2 items');
  });

  it('handles null final output', () => {
    const output = formatRunResult(makeResult({ finalOutput: null }));
    expect(output).not.toContain('Final Output');
  });

  it('outputs JSON with --json', () => {
    const output = formatRunResult(makeResult(), undefined, { json: true });
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.graph).toBe('TestPipeline');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.output.approved).toBe(true);
  });

  it('truncates long string values', () => {
    const longString = 'A'.repeat(300);
    const output = formatRunResult(makeResult({
      finalOutput: { text: longString },
    }));
    expect(output).toContain('...');
    expect(output.length).toBeLessThan(1000);
  });

  it('shows verbose output when requested', () => {
    const output = formatRunResult(makeResult({
      finalOutput: { items: ['item1', 'item2', 'item3'] },
    }), undefined, { verbose: true });
    expect(output).toContain('- item1');
    expect(output).toContain('- item2');
  });

  it('renders token bar', () => {
    const output = formatRunResult(makeResult({
      tokenUsage: { budget: 10000, consumed: 5000, fraction: 0.5, perNode: [] },
    }));
    // Should contain block characters for the bar
    expect(output).toContain('[');
    expect(output).toContain(']');
  });

  it('handles nodes without token usage', () => {
    const output = formatRunResult(makeResult({
      nodeResults: [
        { node: 'DryNode', output: {}, durationMs: 100, success: true },
      ],
    }));
    expect(output).toContain('DryNode');
    expect(output).not.toContain('NaN');
  });
});
