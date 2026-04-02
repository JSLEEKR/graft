import { describe, it, expect } from 'vitest';
import { GRAFT_KEYWORDS } from '../src/lsp/features/rename.js';
import { isReferable, findReferences } from '../src/lsp/features/references.js';
import type { ContextDecl, NodeDecl, MemoryDecl, GraphDecl } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';

// --- Helper to build a minimal ProgramIndex ---
const loc = { line: 1, column: 1, offset: 0 };
const loc2 = { line: 3, column: 1, offset: 30 };
const loc3 = { line: 5, column: 1, offset: 60 };
const loc4 = { line: 7, column: 1, offset: 90 };
const loc5 = { line: 9, column: 1, offset: 120 };

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
      fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc2 }],
      location: loc2,
    },
    location: loc2,
  }],
  memories: [{
    name: 'SessionLog',
    maxTokens: 2000,
    storage: 'file',
    fields: [{ name: 'entries', type: { kind: 'list', element: { kind: 'primitive', name: 'String' } }, location: loc3 }],
    location: loc3,
  }],
  graphs: [{
    name: 'MainFlow',
    input: 'TaskSpec',
    output: 'Analysis',
    budget: 10000,
    flow: [{ kind: 'node', name: 'Analyzer' }],
    location: loc4,
  }],
});

// ========================================
// isReferable
// ========================================
describe('isReferable', () => {
  it('returns true for context names', () => {
    expect(isReferable('TaskSpec', index)).toBe(true);
  });

  it('returns true for node names', () => {
    expect(isReferable('Analyzer', index)).toBe(true);
  });

  it('returns true for memory names', () => {
    expect(isReferable('SessionLog', index)).toBe(true);
  });

  it('returns true for graph names', () => {
    expect(isReferable('MainFlow', index)).toBe(true);
  });

  it('returns true for produces names', () => {
    expect(isReferable('Analysis', index)).toBe(true);
  });

  it('returns false for unknown names', () => {
    expect(isReferable('Unknown', index)).toBe(false);
  });

  it('returns false for keywords', () => {
    for (const kw of ['context', 'node', 'memory', 'graph', 'import', 'reads']) {
      expect(isReferable(kw, index)).toBe(false);
    }
  });
});

// ========================================
// findReferences
// ========================================
describe('findReferences', () => {
  const docUri = 'file:///test/main.gft';

  it('finds declaration + reads reference', () => {
    const text = 'context TaskSpec(max_tokens: 1k) {\n  title: String\n}\nnode Analyzer(model: sonnet, budget_in: 5k, budget_out: 2k) {\n  reads TaskSpec\n  produces Analysis {\n    result: String\n  }\n}';
    const idx = buildIndex({
      contexts: [{
        name: 'TaskSpec', maxTokens: 1000,
        fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: loc,
      }],
      nodes: [{
        name: 'Analyzer', model: 'sonnet', budgetIn: 5000, budgetOut: 2000,
        reads: [], tools: [], writes: [], onFailure: undefined,
        produces: { name: 'Analysis', fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
        location: loc,
      }],
    });
    const results = findReferences('TaskSpec', text, docUri, idx, true, new Map());
    expect(results.length).toBe(2); // declaration + reads
    expect(results.every(r => r.uri === docUri)).toBe(true);
  });

  it('finds edge source/target references', () => {
    const text = 'node A(model: sonnet, budget_in: 1k, budget_out: 1k) {\n  produces AOut { x: String }\n}\nnode B(model: sonnet, budget_in: 1k, budget_out: 1k) {\n  produces BOut { x: String }\n}\nedge A -> B';
    const results = findReferences('A', text, docUri, buildIndex({
      nodes: [{
        name: 'A', model: 'sonnet', budgetIn: 1000, budgetOut: 1000,
        reads: [], tools: [], writes: [], onFailure: undefined,
        produces: { name: 'AOut', fields: [{ name: 'x', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
        location: loc,
      }],
    }), true, new Map());
    // 'A' appears in: node A, produces AOut (no - AOut != A), edge A
    // Actually A appears: "node A(" line 0, "edge A" line 6 = 2 matches
    expect(results.length).toBe(2);
  });

  it('finds graph input/output references', () => {
    const text = 'context In(max_tokens: 1k) {\n  x: String\n}\ncontext Out(max_tokens: 1k) {\n  y: String\n}\ngraph G(In -> Out, budget: 10k) {\n}';
    const idx = buildIndex({
      contexts: [
        { name: 'In', maxTokens: 1000, fields: [{ name: 'x', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
        { name: 'Out', maxTokens: 1000, fields: [{ name: 'y', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
    });
    const results = findReferences('In', text, docUri, idx, true, new Map());
    // 'In' appears: "context In(" line 0, "graph G(In" line 6 = 2 matches
    expect(results.length).toBe(2);
  });

  it('finds foreach source reference', () => {
    const text = 'context Items(max_tokens: 1k) {\n  list: String[]\n}\nnode Worker(model: sonnet, budget_in: 1k, budget_out: 1k) {\n  produces WorkerOut { x: String }\n}\ngraph G(Items -> WorkerOut, budget: 10k) {\n  foreach Items as item {\n    Worker\n  }\n}';
    const idx = buildIndex({
      contexts: [{ name: 'Items', maxTokens: 1000, fields: [], location: loc }],
    });
    const results = findReferences('Items', text, docUri, idx, true, new Map());
    // 'Items' appears: "context Items" line 0, "graph G(Items" line 6, "foreach Items" line 7 = 3
    expect(results.length).toBe(3);
  });

  it('finds fallback node reference', () => {
    const text = 'node Primary(model: sonnet, budget_in: 1k, budget_out: 1k) {\n  produces POut { x: String }\n  on_failure fallback Backup\n}\nnode Backup(model: haiku, budget_in: 1k, budget_out: 1k) {\n  produces BOut { x: String }\n}';
    const idx = buildIndex({
      nodes: [{
        name: 'Backup', model: 'haiku', budgetIn: 1000, budgetOut: 1000,
        reads: [], tools: [], writes: [], onFailure: undefined,
        produces: { name: 'BOut', fields: [{ name: 'x', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
        location: loc,
      }],
    });
    const results = findReferences('Backup', text, docUri, idx, true, new Map());
    // 'Backup' appears: "fallback Backup" line 2, "node Backup" line 4 = 2
    expect(results.length).toBe(2);
  });

  it('includeDeclaration=false excludes declaration', () => {
    // Context declaration is at line 1, col 1 => keyword "context" at (0, 0) in 0-based
    // The name "TaskSpec" appears at column 9 (0-based: 8) on line 0
    // Declaration location from ProgramIndex: loc = {line:1, column:1} => 0-based (0,0) which is keyword pos
    // collectRenameLocations finds "TaskSpec" at (0, 8) via regex
    // Our declMatch uses keyword length. "context" = 7 chars, so name starts at column 1-1+7+1 = 8. Match!
    const text = 'context TaskSpec(max_tokens: 1k) {\n  title: String\n}\nnode Analyzer(model: sonnet, budget_in: 5k, budget_out: 2k) {\n  reads TaskSpec\n  produces Analysis {\n    result: String\n  }\n}';
    const idx = buildIndex({
      contexts: [{
        name: 'TaskSpec', maxTokens: 1000,
        fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: { line: 1, column: 1, offset: 0, length: 7 },
      }],
    });
    const results = findReferences('TaskSpec', text, docUri, idx, false, new Map());
    // Should exclude the declaration at (0, 8), keep only the reads reference
    expect(results.length).toBe(1);
    expect(results[0].range.start.line).toBe(4); // "reads TaskSpec" line
  });

  it('cross-file references via workspaceFiles map', () => {
    const mainText = 'context TaskSpec(max_tokens: 1k) {\n  title: String\n}';
    const otherText = 'import { TaskSpec } from "./main.gft"\nnode Worker(model: sonnet, budget_in: 1k, budget_out: 1k) {\n  reads TaskSpec\n  produces Out { x: String }\n}';
    const otherUri = 'file:///test/other.gft';
    const idx = buildIndex({
      contexts: [{
        name: 'TaskSpec', maxTokens: 1000,
        fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: { line: 1, column: 1, offset: 0 },
      }],
    });
    const wsFiles = new Map([
      ['/test/other.gft', { text: otherText, uri: otherUri }],
    ]);
    const results = findReferences('TaskSpec', mainText, docUri, idx, true, wsFiles);
    // main.gft: "context TaskSpec" = 1, other.gft: "import { TaskSpec }" + "reads TaskSpec" = 2
    expect(results.length).toBe(3);
    const mainResults = results.filter(r => r.uri === docUri);
    const otherResults = results.filter(r => r.uri === otherUri);
    expect(mainResults.length).toBe(1);
    expect(otherResults.length).toBe(2);
  });
});
