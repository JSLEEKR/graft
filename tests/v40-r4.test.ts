import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { compile } from '../src/compiler.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

describe('TokenEstimator — let and graph_call', () => {
  it('let node has zero token cost', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { score: Float }
      }
      graph G(input: Spec, output: Out, budget: 10k) {
        A -> let s = A.score -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Let should not inflate the cost
    // A reads Spec(500 tokens), produces 1k output → 500 + 1000 = 1500
    expect(report.bestCase).toBe(1500);
    expect(report.worstCase).toBe(1500);
  });

  it('graph call estimates called graph flow cost', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { query: String }
      node Worker(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph Sub(input: Spec, output: Out, budget: 3k) {
        Worker -> done
      }
      graph Main(input: Spec, output: Out, budget: 10k) {
        Sub() -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Main calls Sub which has Worker. Worker reads Spec(500) + produces 1k = 1500
    expect(report.bestCase).toBe(1500);
  });

  it('graph with variables + nodes has correct total', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Mid { score: Float }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Mid]
        produces Out { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Out, budget: 10k) {
        A -> let s = A.score -> B -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: reads Spec(500)+out(1k)=1500, B: reads Mid(1k)+out(500)=1500, let: 0
    expect(report.bestCase).toBe(3000);
  });
});

describe('Codegen — let and graph_call', () => {
  it('orchestration with let bindings includes data binding step', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { score: Float }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        A -> let s = A.score -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const orch = result.files?.find(f => f.path.includes('orchestration.md'));
    expect(orch).toBeDefined();
    expect(orch!.content).toContain('data binding');
    expect(orch!.content).toContain('let s');
  });

  it('orchestration with graph call includes sub-pipeline step', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node Worker(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph Main(input: Spec, output: Out, budget: 10k) {
        Sub() -> done
      }
      graph Sub(input: Spec, output: Out, budget: 3k) {
        Worker -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const orch = result.files?.find(f => f.path.includes('orchestration.md'));
    expect(orch).toBeDefined();
    expect(orch!.content).toContain('sub-pipeline');
    expect(orch!.content).toContain('Sub');
  });

  it('graph parameters documented in orchestration output', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node Worker(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k, count: Int, label: String = "default") {
        Worker -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const orch = result.files?.find(f => f.path.includes('orchestration.md'));
    expect(orch).toBeDefined();
    expect(orch!.content).toContain('Parameters');
    expect(orch!.content).toContain('count: Int');
    expect(orch!.content).toContain('label: String');
    expect(orch!.content).toContain('default');
  });

  it('backward compat — graph without params generates unchanged output', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        A -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const orch = result.files?.find(f => f.path.includes('orchestration.md'));
    expect(orch).toBeDefined();
    // No params section for parameterless graph
    expect(orch!.content).not.toContain('Parameters');
  });
});
