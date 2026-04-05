import { describe, it, expect } from 'vitest';
import { generateFeedback, formatSuggestions } from '../src/runtime/feedback.js';
import { validateResult } from '../src/runtime/result-validator.js';
import { RunResult } from '../src/runtime/executor.js';
import { Program } from '../src/parser/ast.js';
import { compileToProgram } from '../src/compiler.js';

function parse(source: string): Program {
  const result = compileToProgram(source, 'test.gft');
  if (!result.success || !result.program) throw new Error('Parse failed');
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

describe('generateFeedback', () => {
  const program = parse(SOURCE);

  it('returns no suggestions for perfect output', () => {
    const result = makeRunResult({ score: 0.85, items: ['a'], summary: 'Good' });
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions).toHaveLength(0);
  });

  it('suggests budget increase for empty fields', () => {
    const result = makeRunResult({ score: 0.5, items: [], summary: 'OK' });
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions.some(s => s.type === 'budget' && s.message.includes('empty'))).toBe(true);
    expect(suggestions.some(s => s.fix?.includes('budget'))).toBe(true);
  });

  it('suggests retry for failed nodes', () => {
    const result: RunResult = {
      success: false, graph: 'Pipeline',
      nodeResults: [{ node: 'Analyzer', output: null, durationMs: 500, success: false, error: 'Timeout' }],
      finalOutput: null, totalDurationMs: 500, errors: ['failed'],
      tokenUsage: { budget: 10000, consumed: 500, fraction: 0.05, perNode: [] },
    };
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions.some(s => s.type === 'retry' && s.fix?.includes('retry'))).toBe(true);
  });

  it('suggests edge transforms for budget exhaustion', () => {
    const result = makeRunResult(
      { score: 0.5, items: ['a'], summary: 'OK' },
      { tokenUsage: { budget: 10000, consumed: 9700, fraction: 0.97, perNode: [] } },
    );
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions.some(s => s.type === 'transform')).toBe(true);
  });

  it('suggests fix for missing fields', () => {
    const result = makeRunResult({ score: 0.5 }); // items and summary missing
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions.some(s => s.type === 'schema' && s.message.includes('Missing'))).toBe(true);
  });

  it('suggests fix for null output', () => {
    const result = makeRunResult(null);
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    expect(suggestions.some(s => s.message.includes('null'))).toBe(true);
  });
});

describe('formatSuggestions', () => {
  const program = parse(SOURCE);

  it('formats suggestions with fix hints', () => {
    const result = makeRunResult({ score: 0.5, items: [], summary: 'OK' });
    const report = validateResult(result, program);
    const suggestions = generateFeedback(report, program);
    const output = formatSuggestions(suggestions);
    expect(output).toContain('Suggestions');
    expect(output).toContain('\u2192'); // arrow for fix
  });

  it('returns empty string for no suggestions', () => {
    expect(formatSuggestions([])).toBe('');
  });
});
