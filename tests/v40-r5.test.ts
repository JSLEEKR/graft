import { describe, it, expect } from 'vitest';
import { SymbolKind, CompletionItemKind } from 'vscode-languageserver/node';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import { getCompletions } from '../src/lsp/features/completions.js';
import type { Program, FlowNode } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

const loc = { line: 5, column: 3, offset: 40 };
const loc2 = { line: 6, column: 5, offset: 60 };

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

function parse(source: string) {
  const tokens = new Lexer(source).tokenize();
  return new Parser(tokens).parse().program;
}

describe('Document Symbols — let and graph_call', () => {
  it('let binding appears as Variable symbol in graph flow', () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Analyzer', location: loc },
      { kind: 'let', name: 'score', value: { kind: 'literal', value: 42, location: loc2 }, location: loc2 },
    ];
    const program = makeProgram({
      contexts: [{ name: 'Spec', maxTokens: 500, fields: [], location: loc }],
      nodes: [{
        name: 'Analyzer', model: 'sonnet', budgetIn: 2000, budgetOut: 1000,
        reads: [{ context: 'Spec', location: loc }], tools: [], writes: [],
        produces: { name: 'Out', fields: [], location: loc }, location: loc,
      }],
      graphs: [{ name: 'G', input: 'Spec', output: 'Out', budget: 5000, params: [], flow, location: loc }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'G');
    expect(graphSym).toBeDefined();
    const letSym = graphSym!.children?.find(s => s.name === 'let score');
    expect(letSym).toBeDefined();
    expect(letSym!.kind).toBe(SymbolKind.Variable);
  });

  it('graph_call appears as Function symbol in graph flow', () => {
    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'SubPipeline', args: [
        { name: 'count', value: { kind: 'literal', value: 5, location: loc2 }, location: loc2 },
      ], location: loc2 },
    ];
    const program = makeProgram({
      contexts: [{ name: 'Spec', maxTokens: 500, fields: [], location: loc }],
      graphs: [{ name: 'Main', input: 'Spec', output: 'Spec', budget: 5000, params: [], flow, location: loc }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'Main');
    expect(graphSym).toBeDefined();
    const callSym = graphSym!.children?.find(s => s.name.includes('SubPipeline'));
    expect(callSym).toBeDefined();
    expect(callSym!.kind).toBe(SymbolKind.Function);
  });
});

describe('Completions — let and graph names in flow', () => {
  it('let keyword offered in graph flow context', () => {
    const source = [
      'context Spec(max_tokens: 500) { query: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [Spec]',
      '  produces Out { data: String }',
      '}',
      'graph G(input: Spec, output: Out, budget: 5k) {',
      '  A ->',
      '  ',
      '}',
    ].join('\n');
    const program = parse(source);
    const index = new ProgramIndex(program);
    const items = getCompletions(
      source,
      7,
      2,
      { program, index },
    );
    const letItem = items.find(i => i.label === 'let');
    expect(letItem).toBeDefined();
    expect(letItem!.kind).toBe(CompletionItemKind.Keyword);
  });

  it('graph names offered in graph flow context', () => {
    const source = [
      'context Spec(max_tokens: 500) { query: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [Spec]',
      '  produces Out { data: String }',
      '}',
      'graph Sub(input: Spec, output: Out, budget: 3k) {',
      '  A -> done',
      '}',
      'graph Main(input: Spec, output: Out, budget: 5k) {',
      '  ',
      '}',
    ].join('\n');
    const program = parse(source);
    const index = new ProgramIndex(program);
    const items = getCompletions(
      source,
      9,
      2,
      { program, index },
    );
    const graphItem = items.find(i => i.label === 'Sub');
    expect(graphItem).toBeDefined();
    expect(graphItem!.kind).toBe(CompletionItemKind.Module);
  });
});
