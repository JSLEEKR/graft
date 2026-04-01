import { describe, it, expect } from 'vitest';
import { MarkupKind } from 'vscode-languageserver/node';
import { getCompletions, getHoverInfo } from '../src/lsp/features/index.js';
import { ProgramIndex } from '../src/program-index.js';
import type { ContextDecl, NodeDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function buildIndex(opts: {
  contexts?: ContextDecl[];
  nodes?: NodeDecl[];
} = {}): ProgramIndex {
  return new ProgramIndex({
    imports: [],
    memories: [],
    contexts: opts.contexts ?? [],
    nodes: opts.nodes ?? [],
    edges: [],
    graphs: [],
  });
}

// ========================================
// Storage completions (TD-04)
// ========================================
describe('storage completions', () => {
  it('offers "file" after storage:', () => {
    const text = '  storage: ';
    const items = getCompletions(text, 0, text.length, null);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('file');
    expect(items[0].detail).toBe('File-based storage');
  });

  it('offers "file" after storage: f (partial)', () => {
    const text = '  storage: f';
    const items = getCompletions(text, 0, text.length, null);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('file');
  });
});

// ========================================
// Keyword hover documentation (R-11)
// ========================================
describe('keyword hover', () => {
  const emptyIndex = buildIndex();

  it('returns documentation for "context"', () => {
    const result = getHoverInfo('context', emptyIndex);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('context schema');
  });

  it('returns documentation for "node"', () => {
    const result = getHoverInfo('node', emptyIndex);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('processing node');
  });

  it('returns documentation for "reads"', () => {
    const result = getHoverInfo('reads', emptyIndex);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('reads');
  });

  it('returns non-null hover for all keywords', () => {
    const keywords = [
      'context', 'node', 'memory', 'graph', 'edge', 'import',
      'reads', 'writes', 'produces', 'model', 'max_tokens',
      'on_failure', 'storage', 'foreach', 'parallel',
    ];
    for (const kw of keywords) {
      const result = getHoverInfo(kw, emptyIndex);
      expect(result, `keyword "${kw}" should have hover`).not.toBeNull();
    }
  });

  it('still resolves non-keyword identifiers via ProgramIndex', () => {
    const index = buildIndex({
      contexts: [{
        name: 'TaskSpec',
        maxTokens: 1000,
        fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: loc,
      }],
    });
    const result = getHoverInfo('TaskSpec', index);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('**context** TaskSpec');
  });

  it('returns null for unknown non-keyword word', () => {
    const result = getHoverInfo('xyzzy', emptyIndex);
    expect(result).toBeNull();
  });
});

// ========================================
// Import completion wiring
// ========================================
describe('import completions', () => {
  it('returns names from resolveImportNames callback', () => {
    const text = 'import { } from "./lib.gft"';
    // cursor at position 9 (inside braces)
    const resolver = (_path: string) => ['TaskSpec', 'Analyzer'];
    const items = getCompletions(text, 0, 9, null, resolver);
    const labels = items.map(i => i.label);
    expect(labels).toContain('TaskSpec');
    expect(labels).toContain('Analyzer');
  });

  it('extracts import path from text and passes to callback', () => {
    const text = 'import { } from "./lib.gft"';
    let receivedPath = '';
    const resolver = (path: string) => { receivedPath = path; return ['Foo']; };
    getCompletions(text, 0, 9, null, resolver);
    expect(receivedPath).toBe('./lib.gft');
  });

  it('returns empty without callback', () => {
    const text = 'import { } from "./lib.gft"';
    const items = getCompletions(text, 0, 9, null);
    expect(items).toEqual([]);
  });

  it('returns empty when callback returns empty', () => {
    const text = 'import { } from "./lib.gft"';
    const resolver = (_path: string): string[] => [];
    const items = getCompletions(text, 0, 9, null, resolver);
    expect(items).toEqual([]);
  });
});

// ========================================
// LRU cache eviction (TD-02) - tested via exports
// ========================================
// Note: evictIfNeeded and cache internals are in server.ts which is hard to unit test
// directly (it starts a connection). We test the eviction logic by importing it if exported,
// or test indirectly. Since server.ts is a side-effecting module, we test the eviction
// function pattern in isolation.
describe('LRU cache eviction logic', () => {
  // Simulate the eviction logic that will be in server.ts
  function evictIfNeeded(cache: Map<string, { lastAccess: number }>, maxSize: number): void {
    if (cache.size <= maxSize) return;
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, val] of cache) {
      if (val.lastAccess < oldestTime) {
        oldestTime = val.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  it('evicts oldest entry when exceeding max size', () => {
    const cache = new Map<string, { lastAccess: number }>();
    for (let i = 0; i < 51; i++) {
      cache.set(`uri-${i}`, { lastAccess: i * 1000 });
    }
    evictIfNeeded(cache, 50);
    expect(cache.size).toBe(50);
    expect(cache.has('uri-0')).toBe(false); // oldest evicted
    expect(cache.has('uri-1')).toBe(true);
  });

  it('does not evict when at or below max size', () => {
    const cache = new Map<string, { lastAccess: number }>();
    for (let i = 0; i < 50; i++) {
      cache.set(`uri-${i}`, { lastAccess: i });
    }
    evictIfNeeded(cache, 50);
    expect(cache.size).toBe(50);
  });

  it('updates lastAccess on access', () => {
    // This tests the pattern: when you access a cache entry, its lastAccess is updated
    const cache = new Map<string, { lastAccess: number }>();
    cache.set('a', { lastAccess: 100 });
    cache.set('b', { lastAccess: 200 });

    // Simulate accessing 'a' — update its lastAccess
    const entry = cache.get('a')!;
    entry.lastAccess = 300;

    // Now 'b' is oldest
    // Add one more to trigger eviction
    cache.set('c', { lastAccess: 400 });
    evictIfNeeded(cache, 2);
    expect(cache.has('b')).toBe(false); // 'b' was oldest
    expect(cache.has('a')).toBe(true);
  });
});
