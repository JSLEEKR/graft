import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import type { Program, Field, FlowNode } from '../src/parser/ast.js';
import { ProgramIndex } from '../src/program-index.js';

// Helper to parse a Graft source and return the program
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const result = parser.parse();
  return result.program;
}

// Minimal program factory for symbol tests
const loc = { line: 5, column: 3, offset: 40 };

function makeField(name: string): Field {
  return {
    name,
    type: { kind: 'primitive' as const, name: 'String' as const },
    location: loc,
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
// Part 1: Parser — FlowNode location
// ========================================
describe('v3.5-R3: FlowNode location in parser', () => {
  const graphSource = [
    'context Input(max_tokens: 100) { text: String }',
    'node Alpha(model: sonnet, budget: 1k/500) {',
    '  reads: [Input]',
    '  produces Output { result: String }',
    '}',
    'node Beta(model: sonnet, budget: 1k/500) {',
    '  reads: [Input]',
    '  produces Output2 { result: String }',
    '}',
    'graph Flow(input: Input, output: Output, budget: 5k) {',
    '  Alpha -> Beta -> done',
    '}',
  ].join('\n');

  it('FlowNode "node" has location', () => {
    const program = parse(graphSource);
    expect(program.graphs).toHaveLength(1);
    const flow = program.graphs[0].flow;
    expect(flow.length).toBeGreaterThanOrEqual(2);
    expect(flow[0].kind).toBe('node');
    expect(flow[0]).toHaveProperty('location');
    expect(flow[0].location).toBeDefined();
    expect(flow[0].location!.line).toBeGreaterThan(0);
    expect(flow[0].location!.column).toBeGreaterThan(0);
  });

  it('FlowNode "node" location points to correct token', () => {
    const program = parse(graphSource);
    const flow = program.graphs[0].flow;
    // "Alpha" is the first identifier on the flow line
    const alpha = flow[0];
    expect(alpha.kind).toBe('node');
    expect((alpha as any).name).toBe('Alpha');
    // It should be on line 11 (the flow line)
    expect(alpha.location!.line).toBe(11);
  });

  it('FlowNode "parallel" has location', () => {
    const parallelSource = [
      'context Input(max_tokens: 100) { text: String }',
      'node A(model: sonnet, budget: 1k/500) {',
      '  reads: [Input]',
      '  produces O1 { r: String }',
      '}',
      'node B(model: sonnet, budget: 1k/500) {',
      '  reads: [Input]',
      '  produces O2 { r: String }',
      '}',
      'graph G(input: Input, output: O1, budget: 5k) {',
      '  parallel { A B } -> done',
      '}',
    ].join('\n');
    const program = parse(parallelSource);
    const flow = program.graphs[0].flow;
    const par = flow.find(n => n.kind === 'parallel');
    expect(par).toBeDefined();
    expect(par!.location).toBeDefined();
    expect(par!.location!.line).toBe(11);
  });

  it('FlowNode "foreach" has location', () => {
    const foreachSource = [
      'context Input(max_tokens: 100) { items: String }',
      'node Planner(model: sonnet, budget: 1k/500) {',
      '  reads: [Input]',
      '  produces Plan { steps: String[] }',
      '}',
      'node Worker(model: sonnet, budget: 1k/500) {',
      '  reads: [Input]',
      '  produces Result { out: String }',
      '}',
      'graph G(input: Input, output: Result, budget: 10k) {',
      '  Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {',
      '    Worker',
      '  } -> done',
      '}',
    ].join('\n');
    const program = parse(foreachSource);
    const flow = program.graphs[0].flow;
    const fe = flow.find(n => n.kind === 'foreach');
    expect(fe).toBeDefined();
    expect(fe!.location).toBeDefined();
    expect(fe!.location!.line).toBe(11);
  });
});

// ========================================
// Part 2: Symbols — FlowNode location usage
// ========================================
describe('v3.5-R3: Document symbols with FlowNode location', () => {
  const nodeLoc = { line: 10, column: 3, offset: 100 };
  const graphLoc = { line: 1, column: 1, offset: 0 };

  it('flow node uses its own location instead of graph location', () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Alpha', location: nodeLoc },
    ];
    const program = makeProgram({
      graphs: [{
        name: 'G',
        input: 'Input',
        output: 'Output',
        budget: 5000,
        flow,
        location: graphLoc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'G');
    expect(graphSym).toBeDefined();
    expect(graphSym!.children).toHaveLength(1);
    // The child should use nodeLoc (line 10), not graphLoc (line 1)
    expect(graphSym!.children![0].range.start.line).toBe(nodeLoc.line - 1);
  });

  it('parallel appears as child symbol', () => {
    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'], location: nodeLoc },
    ];
    const program = makeProgram({
      graphs: [{
        name: 'G',
        input: 'Input',
        output: 'Output',
        budget: 5000,
        flow,
        location: graphLoc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'G');
    expect(graphSym!.children).toHaveLength(1);
    expect(graphSym!.children![0].name).toBe('parallel(A, B)');
    expect(graphSym!.children![0].kind).toBe(SymbolKind.Function);
  });

  it('foreach appears as child with nested children', () => {
    const feLoc = { line: 8, column: 5, offset: 70 };
    const bodyNodeLoc = { line: 9, column: 7, offset: 90 };
    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Planner',
        field: 'steps',
        binding: 'step',
        maxIterations: 5,
        body: [{ kind: 'node', name: 'Worker', location: bodyNodeLoc }],
        location: feLoc,
      },
    ];
    const program = makeProgram({
      graphs: [{
        name: 'G',
        input: 'Input',
        output: 'Output',
        budget: 5000,
        flow,
        location: graphLoc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'G');
    expect(graphSym!.children).toHaveLength(1);
    expect(graphSym!.children![0].name).toBe('foreach(Planner.steps)');
    expect(graphSym!.children![0].kind).toBe(SymbolKind.Function);
    // Foreach should have nested children
    expect(graphSym!.children![0].children).toHaveLength(1);
    expect(graphSym!.children![0].children![0].name).toBe('Worker');
  });

  it('mixed flow (node + parallel + foreach) all appear', () => {
    const loc1 = { line: 10, column: 3, offset: 100 };
    const loc2 = { line: 11, column: 3, offset: 120 };
    const loc3 = { line: 12, column: 3, offset: 140 };
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Start', location: loc1 },
      { kind: 'parallel', branches: ['X', 'Y'], location: loc2 },
      {
        kind: 'foreach',
        source: 'P',
        field: 'items',
        binding: 'item',
        maxIterations: 3,
        body: [{ kind: 'node', name: 'Inner', location: loc3 }],
        location: loc3,
      },
    ];
    const program = makeProgram({
      graphs: [{
        name: 'Pipeline',
        input: 'Input',
        output: 'Output',
        budget: 10000,
        flow,
        location: graphLoc,
      }],
    });
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    const graphSym = symbols.find(s => s.name === 'Pipeline');
    expect(graphSym!.children).toHaveLength(3);
    expect(graphSym!.children![0].name).toBe('Start');
    expect(graphSym!.children![1].name).toBe('parallel(X, Y)');
    expect(graphSym!.children![2].name).toBe('foreach(P.items)');
  });
});
