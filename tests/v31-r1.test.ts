import { describe, it, expect } from 'vitest';
import { getCompletions } from '../src/lsp/features.js';
import { ProgramIndex } from '../src/program-index.js';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import type { ContextDecl, NodeDecl, MemoryDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function buildIndex(opts: {
  contexts?: ContextDecl[];
  nodes?: NodeDecl[];
  memories?: MemoryDecl[];
} = {}): ProgramIndex {
  return new ProgramIndex({
    imports: [],
    memories: opts.memories ?? [],
    contexts: opts.contexts ?? [],
    nodes: opts.nodes ?? [],
    edges: [],
    graphs: [],
  });
}

function makeIndex() {
  return buildIndex({
    contexts: [{
      name: 'TaskSpec',
      maxTokens: 1000,
      fields: [
        { name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc },
        { name: 'priority', type: { kind: 'primitive', name: 'Int' }, location: loc },
      ],
      location: loc,
    }],
    nodes: [{
      name: 'Analyzer',
      model: 'sonnet',
      budgetIn: 5000,
      budgetOut: 2000,
      reads: [{ context: 'TaskSpec', location: loc }],
      tools: [],
      writes: [],
      onFailure: undefined,
      produces: {
        name: 'Analysis',
        fields: [
          { name: 'findings', type: { kind: 'list', element: { kind: 'primitive', name: 'String' } }, location: loc },
          { name: 'score', type: { kind: 'primitive', name: 'Float' }, location: loc },
        ],
        location: loc,
      },
      location: loc,
    }, {
      name: 'Writer',
      model: 'haiku',
      budgetIn: 2000,
      budgetOut: 1000,
      reads: [],
      tools: [],
      writes: [],
      onFailure: undefined,
      produces: {
        name: 'Draft',
        fields: [{ name: 'text', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: loc,
      },
      location: loc,
    }],
    memories: [{
      name: 'Log',
      maxTokens: 2000,
      storage: 'file',
      fields: [
        { name: 'entry', type: { kind: 'primitive', name: 'String' }, location: loc },
        { name: 'count', type: { kind: 'primitive', name: 'Int' }, location: loc },
      ],
      location: loc,
    }],
  });
}

// ========================================
// Top-level keyword completions
// ========================================
describe('v3.1-R1: top-level keyword completions', () => {
  it('returns keyword completions at empty line', () => {
    const items = getCompletions('', 0, 0, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('context');
    expect(labels).toContain('node');
    expect(labels).toContain('memory');
    expect(labels).toContain('graph');
    expect(labels).toContain('edge');
    expect(labels).toContain('import');
  });

  it('returns keyword completions with partial typing', () => {
    const items = getCompletions('con', 0, 3, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('context');
  });

  it('keyword completions work without ProgramIndex (null)', () => {
    const items = getCompletions('', 0, 0, null);
    expect(items.length).toBeGreaterThan(0);
  });

  it('keyword completions include snippet format', () => {
    const items = getCompletions('', 0, 0, null);
    const nodeItem = items.find(i => i.label === 'node');
    expect(nodeItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
    expect(nodeItem?.insertText).toContain('$');
  });
});

// ========================================
// Name completions in reads/writes
// ========================================
describe('v3.1-R1: name completions in reads/writes', () => {
  const index = makeIndex();

  it('offers context + memory + produces names inside reads: [', () => {
    const text = '  reads: [';
    const items = getCompletions(text, 0, text.length, { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index });
    const labels = items.map(i => i.label);
    expect(labels).toContain('TaskSpec');
    expect(labels).toContain('Analysis');
    expect(labels).toContain('Log');
  });

  it('offers only memory names inside writes: [', () => {
    const text = '  writes: [';
    const items = getCompletions(text, 0, text.length, { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index });
    const labels = items.map(i => i.label);
    expect(labels).toContain('Log');
    expect(labels).not.toContain('TaskSpec');
    expect(labels).not.toContain('Analyzer');
  });

  it('offers names after comma in reads list', () => {
    const text = '  reads: [TaskSpec, ';
    const items = getCompletions(text, 0, text.length, { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index });
    const labels = items.map(i => i.label);
    expect(labels).toContain('Log');
  });
});

// ========================================
// Field completions after dot
// ========================================
describe('v3.1-R1: field completions after dot', () => {
  const index = makeIndex();
  const cache = { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index };

  it('offers context fields after ContextName.', () => {
    const text = '  reads: [TaskSpec.';
    const items = getCompletions(text, 0, text.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('title');
    expect(labels).toContain('priority');
  });

  it('offers memory fields after MemoryName.', () => {
    const text = '  writes: [Log.';
    const items = getCompletions(text, 0, text.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('entry');
    expect(labels).toContain('count');
  });

  it('offers produces fields after ProducesName.', () => {
    const text = '  reads: [Analysis.';
    const items = getCompletions(text, 0, text.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('findings');
    expect(labels).toContain('score');
  });

  it('offers fields inside multi-field brace syntax', () => {
    const text = '  reads: [TaskSpec.{title, ';
    const items = getCompletions(text, 0, text.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('priority');
  });

  it('returns empty for unknown name dot access', () => {
    const text = '  reads: [Unknown.';
    const items = getCompletions(text, 0, text.length, cache);
    expect(items).toHaveLength(0);
  });
});

// ========================================
// Model alias completions
// ========================================
describe('v3.1-R1: model alias completions', () => {
  it('offers model aliases after model:', () => {
    const text = '  model: ';
    const items = getCompletions(text, 0, text.length, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('sonnet');
    expect(labels).toContain('opus');
    expect(labels).toContain('haiku');
  });
});

// ========================================
// Failure strategy completions
// ========================================
describe('v3.1-R1: failure strategy completions', () => {
  it('offers strategies after on_failure:', () => {
    const text = '  on_failure: ';
    const items = getCompletions(text, 0, text.length, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('retry');
    expect(labels).toContain('fallback');
    expect(labels).toContain('skip');
    expect(labels).toContain('abort');
    expect(labels).toContain('retry_then_fallback');
  });

  it('offers node names inside fallback(', () => {
    const index = makeIndex();
    const cache = { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index };
    const text = '  on_failure: fallback(';
    const items = getCompletions(text, 0, text.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Analyzer');
    expect(labels).toContain('Writer');
  });
});

// ========================================
// Graph flow completions
// ========================================
describe('v3.1-R1: graph flow completions', () => {
  it('offers node names + done inside graph block', () => {
    const text = 'graph G(input: Spec, output: Out, budget: 10k) {\n  ';
    const index = makeIndex();
    const cache = { program: { imports: [], contexts: [], nodes: [], edges: [], graphs: [], memories: [] }, index };
    const items = getCompletions(text, 1, 2, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('done');
    expect(labels).toContain('Analyzer');
    expect(labels).toContain('Writer');
  });
});

// ========================================
// Comment suppression
// ========================================
describe('v3.1-R1: comment suppression', () => {
  it('returns no completions inside line comment', () => {
    const text = '// reads: [';
    const items = getCompletions(text, 0, text.length, null);
    expect(items).toHaveLength(0);
  });

  it('returns no completions inside block comment', () => {
    const text = '/* some\nreads: [';
    const items = getCompletions(text, 1, 8, null);
    expect(items).toHaveLength(0);
  });

  it('returns completions after block comment ends', () => {
    const text = '/* comment */\n';
    const items = getCompletions(text, 1, 0, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('context');
  });
});

// ========================================
// Import name completions
// ========================================
describe('v3.1-R1: import name completions', () => {
  it('offers names via resolveImportNames callback', () => {
    const text = 'import { ';
    const resolver = () => ['SharedCtx', 'Helper'];
    const items = getCompletions(text, 0, text.length, null, resolver);
    const labels = items.map(i => i.label);
    expect(labels).toContain('SharedCtx');
    expect(labels).toContain('Helper');
  });

  it('returns empty when resolver returns empty', () => {
    const text = 'import { ';
    const resolver = () => [];
    const items = getCompletions(text, 0, text.length, null, resolver);
    expect(items).toHaveLength(0);
  });

  it('returns empty when no resolver provided', () => {
    const text = 'import { ';
    const items = getCompletions(text, 0, text.length, null);
    expect(items).toHaveLength(0);
  });
});

// ========================================
// CRLF handling
// ========================================
describe('v3.1-R1: CRLF handling', () => {
  it('works with CRLF line endings', () => {
    const text = '  model: \r\n';
    const items = getCompletions(text, 0, 9, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('sonnet');
  });
});

// ========================================
// Edge cases
// ========================================
describe('v3.1-R1: edge cases', () => {
  it('returns empty for out-of-bounds line', () => {
    const items = getCompletions('hello', 5, 0, null);
    expect(items).toHaveLength(0);
  });

  it('handles empty file', () => {
    const items = getCompletions('', 0, 0, null);
    expect(items.length).toBeGreaterThan(0);
  });

  it('does not offer completions inside string literals', () => {
    const text = 'import { X } from "path.';
    const items = getCompletions(text, 0, text.length, null);
    // Should not offer field completions for "path"
    expect(items.every(i => i.kind !== CompletionItemKind.Field)).toBe(true);
  });
});
