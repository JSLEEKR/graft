/**
 * M2-6: Rustc-style error formatting tests
 */
import { describe, it, expect } from 'vitest';
import { GraftError, didYouMean } from '../src/errors/diagnostics.js';
import { compile } from '../src/compiler.js';

describe('GraftError.format()', () => {
  it('produces rustc-style error format', () => {
    const err = new GraftError(
      "'Foo' is not declared",
      { line: 3, column: 10, offset: 40 },
      'error',
      'SCOPE_UNDEFINED_REF',
    );
    const source = 'line1\nline2\n  reads: [Foo]';
    const formatted = err.format(source, 'test.gft');

    expect(formatted).toContain('error[SCOPE_UNDEFINED_REF]');
    expect(formatted).toContain('--> test.gft:3:10');
    expect(formatted).toContain('reads: [Foo]');
    expect(formatted).toContain('^');
  });

  it('includes help when provided', () => {
    const err = new GraftError(
      "'Inpt' is not declared",
      { line: 2, column: 5, offset: 15 },
      'error',
      'SCOPE_UNDEFINED_REF',
      "did you mean 'Input'?",
    );
    const formatted = err.format('line1\n    Inpt', 'test.gft');
    expect(formatted).toContain("= help: did you mean 'Input'?");
  });

  it('uses underline length when available', () => {
    const err = new GraftError(
      'test error',
      { line: 1, column: 1, offset: 0, length: 5 },
      'error',
    );
    const formatted = err.format('hello world');
    expect(formatted).toContain('^^^^^');
  });

  it('handles warning severity', () => {
    const err = new GraftError(
      'something might be wrong',
      { line: 1, column: 1, offset: 0 },
      'warning',
      'BUDGET_EXCEEDED',
    );
    const formatted = err.format('code');
    expect(formatted).toContain('warning[BUDGET_EXCEEDED]');
  });

  it('uses <source> when no filename provided', () => {
    const err = new GraftError('msg', { line: 1, column: 1, offset: 0 }, 'error');
    const formatted = err.format('code');
    expect(formatted).toContain('--> <source>:1:1');
  });
});

describe('didYouMean()', () => {
  const candidates = ['Input', 'Output', 'Analysis', 'ReviewResult', 'Task'];

  it('finds close match', () => {
    expect(didYouMean('Inpt', candidates)).toBe('Input');
    expect(didYouMean('Outpt', candidates)).toBe('Output');
    expect(didYouMean('Analyss', candidates)).toBe('Analysis');
  });

  it('returns undefined for distant names', () => {
    expect(didYouMean('FooBarBaz', candidates)).toBeUndefined();
    expect(didYouMean('XYZ', candidates)).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(didYouMean('input', candidates)).toBe('Input');
    expect(didYouMean('TASK', candidates)).toBe('Task');
  });

  it('handles empty candidates', () => {
    expect(didYouMean('foo', [])).toBeUndefined();
  });

  it('picks closest match when multiple are close', () => {
    expect(didYouMean('Tsk', candidates)).toBe('Task');
  });
});

describe('Integrated error messages with suggestions', () => {
  it('suggests close context name', () => {
    const source = `
context Input(max_tokens: 500) {
  question: String
}
node A(model: sonnet, budget: 2k/1k) {
  reads: [Inpt]
  produces Out { answer: String }
}
graph G(input: Input, output: Out, budget: 5k) { A -> done }
`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(false);
    const err = result.errors[0];
    expect(err.help).toContain("did you mean 'Input'?");
  });

  it('no suggestion for completely unknown name', () => {
    const source = `
context Input(max_tokens: 500) {
  question: String
}
node A(model: sonnet, budget: 2k/1k) {
  reads: [XyzUnknown]
  produces Out { answer: String }
}
graph G(input: Input, output: Out, budget: 5k) { A -> done }
`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors[0].help).toBeUndefined();
  });

  it('formats full rustc-style output for scope error', () => {
    const source = `context Input(max_tokens: 500) {
  question: String
}
node A(model: sonnet, budget: 2k/1k) {
  reads: [Inpt]
  produces Out { answer: String }
}
graph G(input: Input, output: Out, budget: 5k) { A -> done }`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(false);
    const formatted = result.errors[0].format(source, 'test.gft');
    expect(formatted).toContain('error[SCOPE_UNDEFINED_REF]');
    expect(formatted).toContain('--> test.gft:');
    expect(formatted).toContain(' | ');
    expect(formatted).toContain("= help: did you mean 'Input'?");
  });
});
