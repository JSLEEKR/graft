import { describe, it, expect } from 'vitest';
import { isRenameable, collectRenameLocations } from '../src/lsp/features.js';
import type { ContextDecl, NodeDecl, MemoryDecl, GraphDecl } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';

// --- Helper to build a minimal ProgramIndex ---
const loc = { line: 1, column: 1, offset: 0 };

function buildIndex(opts: {
  contexts?: ContextDecl[];
  nodes?: NodeDecl[];
  memories?: MemoryDecl[];
  graphs?: GraphDecl[];
} = {}): ProgramIndex {
  return new ProgramIndex({
    imports: [],
    memories: opts.memories ?? [],
    contexts: opts.contexts ?? [],
    nodes: opts.nodes ?? [],
    edges: [],
    graphs: opts.graphs ?? [],
  });
}

// ========================================
// isRenameable
// ========================================
describe('isRenameable', () => {
  const index = buildIndex({
    contexts: [{
      name: 'TaskSpec',
      maxTokens: 1000,
      fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc }],
      location: loc,
    }],
    nodes: [{
      name: 'Analyzer',
      model: 'sonnet',
      budgetIn: 5000,
      budgetOut: 2000,
      reads: [],
      tools: [],
      writes: [],
      onFailure: undefined,
      produces: {
        name: 'Analysis',
        fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: loc,
      },
      location: loc,
    }],
    memories: [{
      name: 'SessionLog',
      maxTokens: 2000,
      storage: 'file',
      fields: [{ name: 'entries', type: { kind: 'list', element: { kind: 'primitive', name: 'String' } }, location: loc }],
      location: loc,
    }],
    graphs: [{
      name: 'MainFlow',
      input: 'TaskSpec',
      output: 'Analysis',
      budget: 10000,
      flow: [{ kind: 'node', name: 'Analyzer' }],
      location: loc,
    }],
  });

  it('returns true for context names', () => {
    expect(isRenameable('TaskSpec', index)).toBe(true);
  });

  it('returns true for node names', () => {
    expect(isRenameable('Analyzer', index)).toBe(true);
  });

  it('returns true for memory names', () => {
    expect(isRenameable('SessionLog', index)).toBe(true);
  });

  it('returns true for graph names', () => {
    expect(isRenameable('MainFlow', index)).toBe(true);
  });

  it('returns false for field names', () => {
    expect(isRenameable('title', index)).toBe(false);
  });

  it('returns false for unknown names', () => {
    expect(isRenameable('Unknown', index)).toBe(false);
  });
});

// ========================================
// collectRenameLocations
// ========================================
describe('collectRenameLocations', () => {
  it('finds declaration name', () => {
    const text = 'context TaskSpec(max_tokens: 1k) {\n  title: String\n}';
    const locs = collectRenameLocations(text, 'TaskSpec');
    expect(locs.length).toBeGreaterThanOrEqual(1);
    // First occurrence is at line 0, character 8
    expect(locs[0]).toEqual({
      start: { line: 0, character: 8 },
      end: { line: 0, character: 16 },
    });
  });

  it('finds reads reference', () => {
    const text = 'node Analyzer(model: sonnet, budget: 5k/2k) {\n  reads: [TaskSpec]\n  produces Output { result: String }\n}';
    const locs = collectRenameLocations(text, 'TaskSpec');
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(1);
  });

  it('finds writes reference', () => {
    const text = 'node Writer(model: sonnet, budget: 5k/2k) {\n  writes: [SessionLog]\n  produces Output { text: String }\n}';
    const locs = collectRenameLocations(text, 'SessionLog');
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(1);
  });

  it('finds edge source', () => {
    const text = 'edge Analyzer -> Reviewer | select(result)';
    const locs = collectRenameLocations(text, 'Analyzer');
    expect(locs).toHaveLength(1);
    expect(locs[0]).toEqual({
      start: { line: 0, character: 5 },
      end: { line: 0, character: 13 },
    });
  });

  it('finds edge target', () => {
    const text = 'edge Analyzer -> Reviewer | select(result)';
    const locs = collectRenameLocations(text, 'Reviewer');
    expect(locs).toHaveLength(1);
    expect(locs[0]).toEqual({
      start: { line: 0, character: 17 },
      end: { line: 0, character: 25 },
    });
  });

  it('finds graph flow reference', () => {
    const text = 'graph Main(input: TaskSpec, output: Analysis, budget: 10k) {\n  Analyzer -> Reviewer -> done\n}';
    const locs = collectRenameLocations(text, 'Analyzer');
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(1);
  });

  it('finds graph input/output reference', () => {
    const text = 'graph Main(input: TaskSpec, output: Analysis, budget: 10k) {\n  Analyzer -> done\n}';
    const locs = collectRenameLocations(text, 'TaskSpec');
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(0);
  });

  it('does NOT match partial names (word boundaries)', () => {
    const text = 'context TaskSpecExtended(max_tokens: 1k) {\n  title: String\n}\ncontext TaskSpec(max_tokens: 1k) {\n  title: String\n}';
    const locs = collectRenameLocations(text, 'TaskSpec');
    // Should only match "TaskSpec" on line 3, not "TaskSpecExtended" on line 0
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(3);
  });

  it('finds import name', () => {
    const text = 'import { TaskSpec } from "./lib.gft"';
    const locs = collectRenameLocations(text, 'TaskSpec');
    expect(locs).toHaveLength(1);
    expect(locs[0]).toEqual({
      start: { line: 0, character: 9 },
      end: { line: 0, character: 17 },
    });
  });

  it('finds on_failure fallback reference', () => {
    const text = 'node Analyzer(model: sonnet, budget: 5k/2k) {\n  reads: [TaskSpec]\n  on_failure: fallback(BackupNode)\n  produces Output { result: String }\n}';
    const locs = collectRenameLocations(text, 'BackupNode');
    expect(locs).toHaveLength(1);
    expect(locs[0].start.line).toBe(2);
  });

  it('finds multiple occurrences across lines', () => {
    const text = [
      'context TaskSpec(max_tokens: 1k) {',
      '  title: String',
      '}',
      'node Analyzer(model: sonnet, budget: 5k/2k) {',
      '  reads: [TaskSpec]',
      '  produces Output { result: String }',
      '}',
      'graph Main(input: TaskSpec, output: Output, budget: 10k) {',
      '  Analyzer -> done',
      '}',
    ].join('\n');
    const locs = collectRenameLocations(text, 'TaskSpec');
    expect(locs).toHaveLength(3); // declaration, reads, graph input
  });
});
