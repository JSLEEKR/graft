import { describe, it, expect } from 'vitest';
import { getCompletions } from '../src/lsp/features/completions.js';
import { getHoverInfo } from '../src/lsp/features/hover.js';
import { compileToProgram } from '../src/compiler.js';
import { ProgramIndex } from '../src/program-index.js';

function makeCache(source: string) {
  const result = compileToProgram(source, 'test.gft');
  if (!result.program) return null;
  return { program: result.program, index: new ProgramIndex(result.program) };
}

const basicSource = `
context In(max_tokens: 500) { data: String }
node A(model: sonnet, budget: 2k/1k) {
  reads: [In]
  produces Out { result: String }
}
graph G(input: In, output: Out, budget: 5k) {
  A -> done
}
`;

// ── Completions: builtin functions in graph flow ─────────────────

describe('Completions: builtin functions in graph flow', () => {
  it('suggests builtin function names in graph flow context', () => {
    const source = basicSource.replace('A -> done', 'A -> let x = \n  -> done');
    const cache = makeCache(basicSource);
    // cursor inside graph block
    const lines = basicSource.split('\n');
    // Find the line with graph flow content
    const graphLine = lines.findIndex(l => l.includes('A -> done'));
    const completions = getCompletions(basicSource, graphLine, 2, cache);
    const labels = completions.map(c => c.label);
    expect(labels).toContain('len');
    expect(labels).toContain('max');
    expect(labels).toContain('min');
    expect(labels).toContain('str');
  });

  it('builtin functions have Function kind', () => {
    const cache = makeCache(basicSource);
    const lines = basicSource.split('\n');
    const graphLine = lines.findIndex(l => l.includes('A -> done'));
    const completions = getCompletions(basicSource, graphLine, 2, cache);
    const lenCompletion = completions.find(c => c.label === 'len');
    expect(lenCompletion).toBeDefined();
    // CompletionItemKind.Function = 3
    expect(lenCompletion!.kind).toBe(3);
  });
});

// ── Hover: builtin function documentation ────────────────────────

describe('Hover: builtin function documentation', () => {
  it('hover on len shows signature', () => {
    const cache = makeCache(basicSource);
    const hover = getHoverInfo('len', cache!.index);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toEqual(expect.objectContaining({
      value: expect.stringContaining('len'),
    }));
  });

  it('hover on max shows signature', () => {
    const cache = makeCache(basicSource);
    const hover = getHoverInfo('max', cache!.index);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toEqual(expect.objectContaining({
      value: expect.stringContaining('max'),
    }));
  });

  it('hover on unknown name returns null', () => {
    const cache = makeCache(basicSource);
    const hover = getHoverInfo('unknown_fn', cache!.index);
    expect(hover).toBeNull();
  });
});
