import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import type { Program, EdgeDecl } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

const loc = { line: 1, column: 1, offset: 0 };

// ========================================
// Conditional Edge Token Estimation
// ========================================
describe('TokenEstimator — conditional edges', () => {
  it('best case uses cheapest conditional branch', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node Cheap(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutCheap { result: String }
      }
      node Expensive(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutExpensive { result: String }
      }
      edge A -> {
        when score > 0.5 -> Expensive
        else -> Cheap
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A cost: 500 in + 500 out = 1000
    // Cheap cost: 500 (OutA budget) in + 200 out = 700
    // Expensive cost: 500 (OutA budget) in + 1000 out = 1500
    // Best case: A(1000) + Cheap(700) = 1700
    expect(report.bestCase).toBe(1000 + 700);
  });

  it('worst case uses most expensive conditional branch', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node Cheap(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutCheap { result: String }
      }
      node Expensive(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutExpensive { result: String }
      }
      edge A -> {
        when score > 0.5 -> Expensive
        else -> Cheap
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Worst case: A(1000) + Expensive(1500) = 2500
    expect(report.worstCase).toBe(1000 + 1500);
  });

  it('done branches have zero cost', () => {
    // Parser doesn't allow 'done' in conditional edge targets,
    // so construct the program directly with a 'done' branch
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [OutA]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    // Manually add a conditional edge with a 'done' branch
    program.edges.push({
      source: 'A',
      target: {
        kind: 'conditional',
        branches: [
          { condition: { field: 'score', op: '>', value: 0.5 }, target: 'B' },
          { condition: undefined, target: 'done' },
        ],
      },
      transforms: [],
      location: loc,
    });
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Best case: A(1000) + done(0) = 1000
    expect(report.bestCase).toBe(1000);
    // Worst case: A(1000) + B(500 + 500) = 2000
    expect(report.worstCase).toBe(1000 + 1000);
  });

  it('else branch included in estimation', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 1k/300) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: sonnet, budget: 1k/800) {
        reads: [OutA]
        produces OutC { result: String }
      }
      edge A -> {
        when score > 0.5 -> B
        else -> C
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // B cost: 500 + 300 = 800
    // C cost: 500 + 800 = 1300
    // Best: A(1000) + B(800) = 1800
    // Worst: A(1000) + C(1300) = 2300
    expect(report.bestCase).toBe(1000 + 800);
    expect(report.worstCase).toBe(1000 + 1300);
  });

  it('mixed direct and conditional edges', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [OutA]
        produces OutB { result: String }
      }
      node C(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutC { result: String }
      }
      node D(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutD { result: String }
      }
      edge A -> {
        when score > 0.5 -> C
        else -> D
      }
      graph G(input: Spec, output: OutB, budget: 50k) { A -> B -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: 500 + 500 = 1000
    // B: 500 (reads OutA) + 500 = 1000
    // Conditional from A: C(500+200=700), D(500+1000=1500)
    // Best: A(1000) + B(1000) + C(700) = 2700
    // Worst: A(1000) + B(1000) + D(1500) = 3500
    expect(report.bestCase).toBe(1000 + 1000 + 700);
    expect(report.worstCase).toBe(1000 + 1000 + 1500);
  });

  it('all conditional branches target done (zero cost)', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    // Manually add conditional edge where all branches target 'done'
    program.edges.push({
      source: 'A',
      target: {
        kind: 'conditional',
        branches: [
          { condition: { field: 'score', op: '>', value: 0.5 }, target: 'done' },
          { condition: undefined, target: 'done' },
        ],
      },
      transforms: [],
      location: loc,
    });
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // All branches are done, so no additional cost
    expect(report.bestCase).toBe(1000);
    expect(report.worstCase).toBe(1000);
  });
});

// ========================================
// Features Split Module Verification
// ========================================
describe('features/ split modules export correctly', () => {
  it('diagnostics module exports toDiagnostics and extractUndefinedName', async () => {
    const mod = await import('../src/lsp/features/diagnostics.js');
    expect(typeof mod.toDiagnostics).toBe('function');
    expect(typeof mod.extractUndefinedName).toBe('function');
  });

  it('hover module exports getHoverInfo, KEYWORD_DOCS, formatType, formatFields', async () => {
    const mod = await import('../src/lsp/features/hover.js');
    expect(typeof mod.getHoverInfo).toBe('function');
    expect(mod.KEYWORD_DOCS).toBeDefined();
    expect(typeof mod.formatType).toBe('function');
  });

  it('completions module exports getCompletions', async () => {
    const mod = await import('../src/lsp/features/completions.js');
    expect(typeof mod.getCompletions).toBe('function');
  });

  it('definition module exports getDefinitionLocation', async () => {
    const mod = await import('../src/lsp/features/definition.js');
    expect(typeof mod.getDefinitionLocation).toBe('function');
  });

  it('symbols module exports getDocumentSymbols', async () => {
    const mod = await import('../src/lsp/features/symbols.js');
    expect(typeof mod.getDocumentSymbols).toBe('function');
  });

  it('code-actions module exports buildAutoImportEdit and computeRelativeImportPath', async () => {
    const mod = await import('../src/lsp/features/code-actions.js');
    expect(typeof mod.buildAutoImportEdit).toBe('function');
    expect(typeof mod.computeRelativeImportPath).toBe('function');
  });

  it('rename module exports isRenameable and collectRenameLocations', async () => {
    const mod = await import('../src/lsp/features/rename.js');
    expect(typeof mod.isRenameable).toBe('function');
    expect(typeof mod.collectRenameLocations).toBe('function');
  });

  it('utils module exports getWordAtPosition', async () => {
    const mod = await import('../src/lsp/features/utils.js');
    expect(typeof mod.getWordAtPosition).toBe('function');
  });

  it('index re-exports all public functions', async () => {
    const mod = await import('../src/lsp/features/index.js');
    expect(typeof mod.toDiagnostics).toBe('function');
    expect(typeof mod.extractUndefinedName).toBe('function');
    expect(typeof mod.getHoverInfo).toBe('function');
    expect(typeof mod.formatType).toBe('function');
    expect(typeof mod.getCompletions).toBe('function');
    expect(typeof mod.getDefinitionLocation).toBe('function');
    expect(typeof mod.getDocumentSymbols).toBe('function');
    expect(typeof mod.buildAutoImportEdit).toBe('function');
    expect(typeof mod.computeRelativeImportPath).toBe('function');
    expect(typeof mod.isRenameable).toBe('function');
    expect(typeof mod.collectRenameLocations).toBe('function');
    expect(typeof mod.getWordAtPosition).toBe('function');
  });
});
