import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { getCompletions } from '../src/lsp/features/completions.js';

function makeSource(flowLine: string = 'A -> let myvar = A.score + 10 -> done') {
  return [
    'context In(max_tokens: 500) { data: String }',
    'node A(model: sonnet, budget: 2k/1k) {',
    '  reads: [In]',
    '  produces Out {',
    '    score: Int',
    '    status: String',
    '  }',
    '}',
    'graph G(input: In, output: Out, budget: 5k) {',
    `  ${flowLine}`,
    '}',
  ].join('\n');
}

// ── Completions: expression context ────────────────────────────

describe('LSP Completions: expression context in graph flow', () => {
  // The flow line is at index 15 (0-indexed) in the source
  const FLOW_LINE = 9;

  it('provides if keyword in graph flow', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('if');
  });

  it('provides true/false literals in graph flow', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('true');
    expect(labels).toContain('false');
  });

  it('provides builtin functions in graph flow', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('len');
    expect(labels).toContain('max');
    expect(labels).toContain('min');
    expect(labels).toContain('str');
  });

  it('provides let binding variable names in graph flow', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('myvar');
  });

  it('variable completion has correct detail', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const varCompletion = completions.find(c => c.label === 'myvar');
    expect(varCompletion?.detail).toContain('variable');
    expect(varCompletion?.detail).toContain('graph G');
  });

  it('provides node names in graph flow', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    const completions = getCompletions(source, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('A');
    expect(labels).toContain('done');
    expect(labels).toContain('let');
  });

  it('provides field completions after dot', () => {
    const source = makeSource();
    const result = compile(source, 'test.gft');
    // Create a source with cursor after "A."
    const lines = source.split('\n');
    lines[FLOW_LINE] = '  A.';
    const modSource = lines.join('\n');
    const completions = getCompletions(modSource, FLOW_LINE, 4, { program: result.program!, index: result.index! });
    const labels = completions.map(c => c.label);
    expect(labels).toContain('score');
    expect(labels).toContain('status');
  });
});
