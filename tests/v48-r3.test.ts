import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { getHoverInfo } from '../src/lsp/features/hover.js';
import { getDefinitionLocation } from '../src/lsp/features/definition.js';
import { ProgramIndex, LetBinding } from '../src/program-index.js';

// ── Cross-feature: LSP + expressions integration ───────────────

describe('Cross-feature: LSP expression intelligence integration', () => {
  function makeResult() {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    name: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let x = A.score ?? 0 -> let y = if x > 50 && len(A.name) > 0 then "valid" else "unknown" -> done',
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('hover on ?? expression variable', () => {
    const result = makeResult();
    const hover = getHoverInfo('x', result.index!);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as any).value;
    expect(value).toContain('??');
  });

  it('hover on conditional expression variable', () => {
    const result = makeResult();
    const hover = getHoverInfo('y', result.index!);
    const value = (hover!.contents as any).value;
    expect(value).toContain('if');
    expect(value).toContain('then');
    expect(value).toContain('else');
  });

  it('letBindingMap has both variables', () => {
    const result = makeResult();
    expect(result.index!.letBindingMap.has('x')).toBe(true);
    expect(result.index!.letBindingMap.has('y')).toBe(true);
  });

  it('go-to-def works for both variables', () => {
    const result = makeResult();
    const locX = getDefinitionLocation('x', result.index!, 'file:///test.gft');
    const locY = getDefinitionLocation('y', result.index!, 'file:///test.gft');
    expect(locX).not.toBeNull();
    expect(locY).not.toBeNull();
  });
});

// ── Regression: existing LSP features unaffected ───────────────

describe('Regression: existing LSP features still work', () => {
  function makeResult() {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> done',
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('hover on context still works', () => {
    const result = makeResult();
    const hover = getHoverInfo('In', result.index!);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as any).value;
    expect(value).toContain('context');
  });

  it('hover on node still works', () => {
    const result = makeResult();
    const hover = getHoverInfo('A', result.index!);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as any).value;
    expect(value).toContain('node');
  });

  it('hover on builtin function still works', () => {
    const result = makeResult();
    const hover = getHoverInfo('len', result.index!);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as any).value;
    expect(value).toContain('len');
  });

  it('go-to-def on context still works', () => {
    const result = makeResult();
    const loc = getDefinitionLocation('In', result.index!, 'file:///test.gft');
    expect(loc).not.toBeNull();
  });

  it('go-to-def on node still works', () => {
    const result = makeResult();
    const loc = getDefinitionLocation('A', result.index!, 'file:///test.gft');
    expect(loc).not.toBeNull();
  });
});
