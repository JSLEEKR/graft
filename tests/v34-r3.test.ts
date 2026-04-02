import { describe, it, expect } from 'vitest';
import { SymbolKind, CodeActionKind } from 'vscode-languageserver/node';
import type { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import { buildAutoImportActions } from '../src/lsp/features/code-actions.js';
import type { Program, Field, FlowNode } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';

const loc = { line: 5, column: 3, offset: 40 };
const loc2 = { line: 6, column: 5, offset: 60 };
const loc3 = { line: 7, column: 5, offset: 80 };

function makeField(name: string, lineLoc = loc2): Field {
  return {
    name,
    type: { kind: 'primitive' as const, name: 'String' as const },
    location: lineLoc,
  };
}

function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    imports: [],
    memories: [],
    contexts: [],
    nodes: [],
    edges: [],
    graphs: [],
    ...overrides,
  };
}

// ========================================
// Hierarchical Document Symbols
// ========================================
describe('Hierarchical Document Symbols', () => {
  it('context has field children', () => {
    const program = makeProgram({
      contexts: [{
        name: 'TaskSpec',
        maxTokens: 1000,
        fields: [makeField('title'), makeField('description', loc3)],
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('TaskSpec');
    expect(symbols[0].children).toHaveLength(2);
    expect(symbols[0].children![0].name).toBe('title');
    expect(symbols[0].children![0].kind).toBe(SymbolKind.Field);
    expect(symbols[0].children![1].name).toBe('description');
    expect(symbols[0].children![1].kind).toBe(SymbolKind.Field);
  });

  it('node has produces field children', () => {
    const program = makeProgram({
      nodes: [{
        name: 'Analyzer',
        model: 'sonnet',
        budgetIn: 5000,
        budgetOut: 2000,
        reads: [],
        tools: [],
        writes: [],
        produces: {
          name: 'Research',
          fields: [makeField('findings'), makeField('confidence', loc3)],
          location: loc2,
        },
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('Analyzer');
    expect(symbols[0].children).toHaveLength(2);
    expect(symbols[0].children![0].name).toBe('findings');
    expect(symbols[0].children![0].kind).toBe(SymbolKind.Field);
    expect(symbols[0].children![1].name).toBe('confidence');
  });

  it('memory has field children', () => {
    const program = makeProgram({
      memories: [{
        name: 'ConversationLog',
        maxTokens: 5000,
        storage: 'file' as const,
        fields: [makeField('entries'), makeField('summary', loc3)],
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('ConversationLog');
    expect(symbols[0].children).toHaveLength(2);
    expect(symbols[0].children![0].name).toBe('entries');
    expect(symbols[0].children![0].kind).toBe(SymbolKind.Field);
    expect(symbols[0].children![1].name).toBe('summary');
  });

  it('graph has flow node children (all flow node kinds)', () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Researcher' },
      { kind: 'parallel', branches: ['A', 'B'] },
      { kind: 'node', name: 'Writer' },
    ];
    const program = makeProgram({
      graphs: [{
        name: 'SimpleQA',
        input: 'TaskSpec',
        output: 'Result',
        budget: 10000,
        flow,
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('SimpleQA');
    // All flow node kinds appear as children
    expect(symbols[0].children).toHaveLength(3);
    expect(symbols[0].children![0].name).toBe('Researcher');
    expect(symbols[0].children![0].kind).toBe(SymbolKind.Function);
    expect(symbols[0].children![1].name).toBe('parallel(A, B)');
    expect(symbols[0].children![1].kind).toBe(SymbolKind.Function);
    expect(symbols[0].children![2].name).toBe('Writer');
    expect(symbols[0].children![2].kind).toBe(SymbolKind.Function);
  });

  it('edge has no children', () => {
    const program = makeProgram({
      edges: [{
        source: 'A',
        target: { kind: 'direct' as const, node: 'B' },
        transforms: [],
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('A -> B');
    expect(symbols[0].children).toBeUndefined();
  });

  it('children have correct SymbolKind', () => {
    const program = makeProgram({
      contexts: [{
        name: 'Ctx',
        maxTokens: 100,
        fields: [makeField('f1')],
        location: loc,
      }],
      graphs: [{
        name: 'G',
        input: 'Ctx',
        output: 'Out',
        budget: 1000, params: [], flow: [{ kind: 'node', name: 'N1' }],
        location: loc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    // Context child is Field
    const ctxSymbol = symbols.find(s => s.name === 'Ctx')!;
    expect(ctxSymbol.children![0].kind).toBe(SymbolKind.Field);

    // Graph child is Function
    const graphSymbol = symbols.find(s => s.name === 'G')!;
    expect(graphSymbol.children![0].kind).toBe(SymbolKind.Function);
  });
});

// ========================================
// buildAutoImportActions
// ========================================
describe('buildAutoImportActions', () => {
  function makeDiag(code: string, message: string, line: number, character: number): Diagnostic {
    return {
      range: {
        start: { line, character },
        end: { line, character: character + 5 },
      },
      message,
      severity: DiagnosticSeverity.Error,
      source: 'graft',
      code,
    };
  }

  it('returns empty for no SCOPE_UNDEFINED_REF diagnostics', () => {
    const diags: Diagnostic[] = [
      makeDiag('TYPE_FIELD_NOT_FOUND', 'field not found', 3, 5),
    ];
    const exports = new Map<string, string[]>();
    exports.set('/other/file.gft', ['Foo']);

    const actions = buildAutoImportActions(
      'node Test { reads Foo }',
      'file:///current/file.gft',
      '/current/file.gft',
      diags,
      exports,
    );
    expect(actions).toEqual([]);
  });

  it('returns action for matching workspace export', () => {
    const diags: Diagnostic[] = [
      makeDiag('SCOPE_UNDEFINED_REF', "Undefined reference 'TaskSpec'", 2, 8),
    ];
    const exports = new Map<string, string[]>();
    exports.set('/workspace/contexts.gft', ['TaskSpec']);

    const docText = 'node Analyzer {\n  reads TaskSpec\n}';
    const actions = buildAutoImportActions(
      docText,
      'file:///workspace/main.gft',
      '/workspace/main.gft',
      diags,
      exports,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain('TaskSpec');
    expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    expect(actions[0].edit).toBeDefined();
  });

  it('skips already-imported names', () => {
    const diags: Diagnostic[] = [
      makeDiag('SCOPE_UNDEFINED_REF', "Undefined reference 'TaskSpec'", 3, 8),
    ];
    const exports = new Map<string, string[]>();
    exports.set('/workspace/contexts.gft', ['TaskSpec']);

    const docText = 'import { TaskSpec } from "./contexts"\nnode Analyzer {\n  reads TaskSpec\n}';
    const actions = buildAutoImportActions(
      docText,
      'file:///workspace/main.gft',
      '/workspace/main.gft',
      diags,
      exports,
    );

    expect(actions).toEqual([]);
  });

  it('skips self-file matches', () => {
    const diags: Diagnostic[] = [
      makeDiag('SCOPE_UNDEFINED_REF', "Undefined reference 'TaskSpec'", 2, 8),
    ];
    const exports = new Map<string, string[]>();
    // The export is from the same file
    exports.set('/workspace/main.gft', ['TaskSpec']);

    const docText = 'node Analyzer {\n  reads TaskSpec\n}';
    const actions = buildAutoImportActions(
      docText,
      'file:///workspace/main.gft',
      '/workspace/main.gft',
      diags,
      exports,
    );

    expect(actions).toEqual([]);
  });
});
