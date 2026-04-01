import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity, MarkupKind } from 'vscode-languageserver/node';
import { toDiagnostics, getWordAtPosition, getHoverInfo, getDefinitionLocation, formatType } from '../src/lsp/features.js';
import { GraftError } from '../src/errors/diagnostics.js';
import type { TypeExpr, ContextDecl, NodeDecl, MemoryDecl } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';
import { compile } from '../src/compiler.js';

// --- Helper to build a minimal ProgramIndex ---
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

const loc = { line: 5, column: 3, offset: 40 };

// ========================================
// toDiagnostics
// ========================================
describe('toDiagnostics', () => {
  it('maps error to severity Error with 0-based position', () => {
    const err = new GraftError('bad field', { line: 10, column: 5, offset: 100 }, 'error', 'SCOPE_FIELD_NOT_FOUND');
    const result = toDiagnostics([err], []);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(DiagnosticSeverity.Error);
    expect(result[0].range.start.line).toBe(9);
    expect(result[0].range.start.character).toBe(4);
    expect(result[0].message).toBe('bad field');
    expect(result[0].source).toBe('graft');
    expect(result[0].code).toBe('SCOPE_FIELD_NOT_FOUND');
  });

  it('maps warning to severity Warning', () => {
    const warn = new GraftError('budget exceeded', { line: 3, column: 1, offset: 20 }, 'warning', 'BUDGET_EXCEEDED');
    const result = toDiagnostics([], [warn]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe(DiagnosticSeverity.Warning);
  });

  it('includes error code when present', () => {
    const err = new GraftError('msg', { line: 1, column: 1, offset: 0 }, 'error', 'TYPE_FIELD_NOT_FOUND');
    const result = toDiagnostics([err], []);
    expect(result[0].code).toBe('TYPE_FIELD_NOT_FOUND');
  });

  it('produces empty array for empty inputs', () => {
    const result = toDiagnostics([], []);
    expect(result).toEqual([]);
  });
});

// ========================================
// getWordAtPosition
// ========================================
describe('getWordAtPosition', () => {
  it('returns identifier at cursor position', () => {
    const text = 'context TaskSpec';
    expect(getWordAtPosition(text, 0, 8)).toBe('TaskSpec');
  });

  it('returns null for punctuation', () => {
    const text = 'a + b';
    expect(getWordAtPosition(text, 0, 2)).toBeNull();
  });

  it('returns null for out-of-bounds line', () => {
    const text = 'hello';
    expect(getWordAtPosition(text, 5, 0)).toBeNull();
  });

  it('returns null for whitespace position', () => {
    const text = 'foo bar';
    expect(getWordAtPosition(text, 0, 3)).toBeNull();
  });

  it('handles multi-line text', () => {
    const text = 'line one\nline two\nline three';
    expect(getWordAtPosition(text, 1, 5)).toBe('two');
    expect(getWordAtPosition(text, 2, 5)).toBe('three');
  });
});

// ========================================
// getHoverInfo
// ========================================
describe('getHoverInfo', () => {
  it('shows context info with fields and max_tokens', () => {
    const index = buildIndex({
      contexts: [{
        name: 'TaskSpec',
        maxTokens: 1000,
        fields: [
          { name: 'title', type: { kind: 'primitive', name: 'String' }, location: loc },
          { name: 'count', type: { kind: 'primitive', name: 'Int' }, location: loc },
        ],
        location: loc,
      }],
    });
    const result = getHoverInfo('TaskSpec', index);
    expect(result).not.toBeNull();
    expect(result!.contents).toEqual({
      kind: MarkupKind.Markdown,
      value: expect.stringContaining('**context** TaskSpec (max_tokens: 1000)'),
    });
    expect((result!.contents as { value: string }).value).toContain('title: String');
    expect((result!.contents as { value: string }).value).toContain('count: Int');
  });

  it('shows node info with model, budget, reads, produces', () => {
    const index = buildIndex({
      nodes: [{
        name: 'Analyzer',
        model: 'sonnet',
        budgetIn: 5000,
        budgetOut: 2000,
        reads: [
          { context: 'TaskSpec', location: loc },
          { context: 'Research', field: 'findings', location: loc },
        ],
        tools: [],
        writes: ['session_log'],
        onFailure: undefined,
        produces: {
          name: 'Analysis',
          fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }],
          location: loc,
        },
        location: loc,
      }],
    });
    const result = getHoverInfo('Analyzer', index);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('**node** Analyzer');
    expect(value).toContain('model: sonnet');
    expect(value).toContain('budget: 5000/2000');
    expect(value).toContain('reads: TaskSpec, Research.findings');
    expect(value).toContain('writes: session_log');
    expect(value).toContain('produces: Analysis');
  });

  it('shows memory info with fields and storage', () => {
    const index = buildIndex({
      memories: [{
        name: 'SessionLog',
        maxTokens: 2000,
        storage: 'file',
        fields: [{ name: 'entries', type: { kind: 'list', element: { kind: 'primitive', name: 'String' } }, location: loc }],
        location: loc,
      }],
    });
    const result = getHoverInfo('SessionLog', index);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('**memory** SessionLog (max_tokens: 2000, storage: file)');
    expect(value).toContain('entries: List<String>');
  });

  it('shows produces info with parent node name', () => {
    const index = buildIndex({
      nodes: [{
        name: 'Writer',
        model: 'haiku',
        budgetIn: 1000,
        budgetOut: 500,
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
    });
    const result = getHoverInfo('Draft', index);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('**produces** Draft (from node Writer)');
    expect(value).toContain('text: String');
  });

  it('returns null for unknown word', () => {
    const index = buildIndex();
    expect(getHoverInfo('Unknown', index)).toBeNull();
  });
});

// ========================================
// getDefinitionLocation
// ========================================
describe('getDefinitionLocation', () => {
  it('returns location with correct 0-based position for context', () => {
    const index = buildIndex({
      contexts: [{
        name: 'TaskSpec',
        maxTokens: 1000,
        fields: [],
        location: { line: 5, column: 9, offset: 40 },
      }],
    });
    const result = getDefinitionLocation('TaskSpec', index, 'file:///current.gft');
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(4);
    expect(result!.range.start.character).toBe(8);
    expect(result!.range.end.character).toBe(8 + 'TaskSpec'.length);
    expect(result!.uri).toBe('file:///current.gft');
  });

  it('returns cross-file URI for node with sourceFile', () => {
    const sourceFile = 'C:/project/lib.gft';
    const index = buildIndex({
      nodes: [{
        name: 'Helper',
        model: 'sonnet',
        budgetIn: 1000,
        budgetOut: 500,
        reads: [],
        tools: [],
        writes: [],
        onFailure: undefined,
        produces: { name: 'HelpResult', fields: [], location: loc },
        location: { line: 3, column: 1, offset: 0 },
        sourceFile,
      }],
    });
    const result = getDefinitionLocation('Helper', index, 'file:///current.gft');
    expect(result).not.toBeNull();
    expect(result!.uri).toContain('lib.gft');
    expect(result!.uri.startsWith('file:///')).toBe(true);
  });

  it('returns null for unknown name', () => {
    const index = buildIndex();
    expect(getDefinitionLocation('Unknown', index, 'file:///current.gft')).toBeNull();
  });

  it('returns currentUri for memory (no sourceFile)', () => {
    const index = buildIndex({
      memories: [{
        name: 'SessionLog',
        maxTokens: 2000,
        storage: 'file',
        fields: [],
        location: { line: 10, column: 8, offset: 100 },
      }],
    });
    const result = getDefinitionLocation('SessionLog', index, 'file:///current.gft');
    expect(result).not.toBeNull();
    expect(result!.uri).toBe('file:///current.gft');
    expect(result!.range.start.line).toBe(9);
    expect(result!.range.start.character).toBe(7);
  });
});

// ========================================
// formatType
// ========================================
describe('formatType', () => {
  it('returns name for primitive', () => {
    expect(formatType({ kind: 'primitive', name: 'String' })).toBe('String');
  });

  it('formats List<String> for nested list', () => {
    const type: TypeExpr = { kind: 'list', element: { kind: 'primitive', name: 'String' } };
    expect(formatType(type)).toBe('List<String>');
  });

  it('formats complex nested types', () => {
    // Optional list
    const optList: TypeExpr = { kind: 'optional', inner: { kind: 'list', element: { kind: 'primitive', name: 'Int' } } };
    expect(formatType(optList)).toBe('List<Int>?');

    // Struct
    const struct: TypeExpr = {
      kind: 'struct',
      name: 'Inline',
      fields: [
        { name: 'a', type: { kind: 'primitive', name: 'String' }, location: loc },
        { name: 'b', type: { kind: 'primitive', name: 'Int' }, location: loc },
      ],
    };
    expect(formatType(struct)).toBe('{ a: String, b: Int }');

    // Enum
    const enumType: TypeExpr = { kind: 'enum', values: ['low', 'medium', 'high'] };
    expect(formatType(enumType)).toBe('low | medium | high');

    // Map
    const mapType: TypeExpr = {
      kind: 'map',
      key: { kind: 'primitive', name: 'String' },
      value: { kind: 'primitive', name: 'Int' },
    };
    expect(formatType(mapType)).toBe('Map<String, Int>');

    // Domain
    const domain: TypeExpr = { kind: 'domain', name: 'FilePath' };
    expect(formatType(domain)).toBe('FilePath');

    // primitive_range
    const range: TypeExpr = { kind: 'primitive_range', name: 'Float', min: 0, max: 1 };
    expect(formatType(range)).toBe('Float(0..1)');

    // token_bounded
    const bounded: TypeExpr = { kind: 'token_bounded', inner: { kind: 'primitive', name: 'String' }, max: 500 };
    expect(formatType(bounded)).toBe('String(max: 500)');
  });
});

// ========================================
// compile() GRAPH_MISSING fix
// ========================================
describe('compile() GRAPH_MISSING fix', () => {
  it('returns program even when no graph declaration exists', () => {
    const source = `context TaskSpec(max_tokens: 1k) {
  title: String
}`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'GRAPH_MISSING')).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.program!.contexts).toHaveLength(1);
    expect(result.program!.contexts[0].name).toBe('TaskSpec');
  });
});
