import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { getDocumentSymbols } from '../src/lsp/features.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { ProgramIndex } from '../src/program-index.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import type { Program } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().program;
}

// ========================================
// Document Symbols
// ========================================
describe('v3.3-R3: Document Symbols', () => {
  it('returns symbols for context, node, memory, graph, and edge', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node Analyzer(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces Analysis { result: String }
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Analysis]
        produces Report { text: String }
      }
      memory Log(max_tokens: 2k, storage: file) { entry: String }
      graph Pipeline(input: Spec, output: Report, budget: 10k) {
        Analyzer -> Writer -> done
      }
      edge Analyzer -> Writer
    `);
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    expect(symbols.length).toBe(6); // context + 2 nodes + memory + graph + edge

    const kinds = symbols.map(s => s.kind);
    expect(kinds).toContain(SymbolKind.Class);     // context
    expect(kinds).toContain(SymbolKind.Function);   // node
    expect(kinds).toContain(SymbolKind.Variable);   // memory
    expect(kinds).toContain(SymbolKind.Module);     // graph
    expect(kinds).toContain(SymbolKind.Event);      // edge
  });

  it('returns empty array for empty program', () => {
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [],
      nodes: [],
      edges: [],
      graphs: [],
    };
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    expect(symbols).toEqual([]);
  });

  it('uses correct symbol names', () => {
    const program = parse(`
      context UserInput(max_tokens: 1k) { query: String }
      node Processor(model: sonnet, budget: 5k/2k) {
        reads: [UserInput]
        produces Output { answer: String }
      }
      node Finalizer(model: sonnet, budget: 5k/2k) {
        reads: [Output]
        produces Result { text: String }
      }
      graph Flow(input: UserInput, output: Result, budget: 10k) {
        Processor -> Finalizer -> done
      }
      edge Processor -> Finalizer
    `);
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    const names = symbols.map(s => s.name);
    expect(names).toContain('UserInput');
    expect(names).toContain('Processor');
    expect(names).toContain('Finalizer');
    expect(names).toContain('Flow');
    expect(names).toContain('Processor -> Finalizer');
  });

  it('uses correct symbol kinds for each declaration type', () => {
    const program = parse(`
      context Ctx(max_tokens: 1k) { f: String }
      node N(model: sonnet, budget: 5k/2k) {
        reads: [Ctx]
        produces Out { r: String }
      }
      memory Mem(max_tokens: 2k, storage: file) { x: String }
      graph G(input: Ctx, output: Out, budget: 10k) { N -> done }
    `);
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    const byName = new Map(symbols.map(s => [s.name, s]));
    expect(byName.get('Ctx')!.kind).toBe(SymbolKind.Class);
    expect(byName.get('N')!.kind).toBe(SymbolKind.Function);
    expect(byName.get('Mem')!.kind).toBe(SymbolKind.Variable);
    expect(byName.get('G')!.kind).toBe(SymbolKind.Module);
  });

  it('names conditional edge as "Source -> conditional"', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { score: Float }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when score >= 0.5 -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);

    const edgeSymbol = symbols.find(s => s.kind === SymbolKind.Event);
    expect(edgeSymbol).toBeDefined();
    expect(edgeSymbol!.name).toBe('A -> conditional');
  });
});

// ========================================
// Condition Type Validation
// ========================================
describe('v3.3-R3: Condition Type Validation', () => {
  it('>= on Int field produces no error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { count: Int }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when count >= 5 -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    expect(errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH')).toHaveLength(0);
  });

  it('>= on Float field produces no error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { score: Float }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when score >= 0.5 -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    expect(errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH')).toHaveLength(0);
  });

  it('>= on Float(0..1) primitive_range produces no error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { confidence: Float(0..1) }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when confidence >= 0.5 -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    expect(errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH')).toHaveLength(0);
  });

  it('>= on String field produces TYPE_CONDITION_MISMATCH error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { label: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when label >= "high" -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    const mismatch = errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(mismatch).toHaveLength(1);
  });

  it('>= on Bool field produces TYPE_CONDITION_MISMATCH error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { flag: Bool }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when flag >= true -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    const mismatch = errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(mismatch).toHaveLength(1);
  });

  it('== on String field produces no error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { status: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when status == "ready" -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    expect(errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH')).toHaveLength(0);
  });

  it('!= on Bool field produces no error', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { active: Bool }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when active != false -> B
        else -> C
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const errors = new TypeChecker(program, index).check();
    expect(errors.filter(e => e.code === 'TYPE_CONDITION_MISMATCH')).toHaveLength(0);
  });
});
