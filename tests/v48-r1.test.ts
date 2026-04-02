import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { getHoverInfo } from '../src/lsp/features/hover.js';
import { getDefinitionLocation } from '../src/lsp/features/definition.js';
import { ProgramIndex } from '../src/program-index.js';

function makeIndex(extraFlow: string = 'A -> let score_val = A.score + 10 -> let label = if A.score > 50 then "high" else "low" -> done') {
  const source = [
    'context In(max_tokens: 500) { data: String }',
    'node A(model: sonnet, budget: 2k/1k) {',
    '  reads: [In]',
    '  produces Out {',
    '    score: Int',
    '    status: String',
    '  }',
    '}',
    `graph G(input: In, output: Out, budget: 5k) {`,
    `  ${extraFlow}`,
    '}',
  ].join('\n');
  const result = compile(source, 'test.gft');
  return result;
}

// ── Hover: let binding variables ───────────────────────────────

describe('LSP Hover: let binding variables', () => {
  it('hover on variable name shows let binding', () => {
    const result = makeIndex();
    expect(result.success).toBe(true);
    const hover = getHoverInfo('score_val', result.index!);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty('value');
    const value = (hover!.contents as any).value;
    expect(value).toContain('let');
    expect(value).toContain('score_val');
  });

  it('hover shows the expression', () => {
    const result = makeIndex();
    const hover = getHoverInfo('score_val', result.index!);
    const value = (hover!.contents as any).value;
    expect(value).toContain('A.score');
    expect(value).toContain('+ 10');
  });

  it('hover shows graph name', () => {
    const result = makeIndex();
    const hover = getHoverInfo('score_val', result.index!);
    const value = (hover!.contents as any).value;
    expect(value).toContain('graph G');
  });

  it('hover on conditional variable shows if-then-else', () => {
    const result = makeIndex();
    const hover = getHoverInfo('label', result.index!);
    const value = (hover!.contents as any).value;
    expect(value).toContain('if');
    expect(value).toContain('then');
    expect(value).toContain('else');
  });

  it('hover returns null for unknown variable', () => {
    const result = makeIndex();
    const hover = getHoverInfo('nonexistent', result.index!);
    expect(hover).toBeNull();
  });

  it('hover on node name still works (not shadowed by variable)', () => {
    const result = makeIndex();
    const hover = getHoverInfo('A', result.index!);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as any).value;
    expect(value).toContain('node');
  });
});

// ── Definition: let binding go-to-def ──────────────────────────

describe('LSP Definition: let binding variables', () => {
  it('go-to-def on variable returns location', () => {
    const result = makeIndex();
    const loc = getDefinitionLocation('score_val', result.index!, 'file:///test.gft');
    expect(loc).not.toBeNull();
    expect(loc!.uri).toBe('file:///test.gft');
  });

  it('go-to-def location has valid line', () => {
    const result = makeIndex();
    const loc = getDefinitionLocation('score_val', result.index!, 'file:///test.gft');
    expect(loc!.range.start.line).toBeGreaterThanOrEqual(0);
  });

  it('go-to-def returns null for unknown variable', () => {
    const result = makeIndex();
    const loc = getDefinitionLocation('nonexistent', result.index!, 'file:///test.gft');
    expect(loc).toBeNull();
  });

  it('go-to-def on node still works', () => {
    const result = makeIndex();
    const loc = getDefinitionLocation('A', result.index!, 'file:///test.gft');
    expect(loc).not.toBeNull();
  });
});

// ── ProgramIndex: letBindingMap ────────────────────────────────

describe('ProgramIndex: letBindingMap', () => {
  it('indexes let bindings from graph flow', () => {
    const result = makeIndex();
    expect(result.index!.letBindingMap.has('score_val')).toBe(true);
    expect(result.index!.letBindingMap.has('label')).toBe(true);
  });

  it('binding has correct graph name', () => {
    const result = makeIndex();
    const binding = result.index!.letBindingMap.get('score_val');
    expect(binding?.graphName).toBe('G');
  });

  it('binding has expression', () => {
    const result = makeIndex();
    const binding = result.index!.letBindingMap.get('score_val');
    expect(binding?.value.kind).toBe('binary');
  });

  it('binding has location', () => {
    const result = makeIndex();
    const binding = result.index!.letBindingMap.get('score_val');
    expect(binding?.location).toBeDefined();
  });
});
