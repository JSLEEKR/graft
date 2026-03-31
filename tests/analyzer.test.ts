import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator, TokenReport } from '../src/analyzer/estimator.js';
import { Program } from '../src/parser/ast.js';
import { GraftError } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}

describe('ScopeChecker', () => {
  it('passes valid reads references', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) {
        question: String
      }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1k/500) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for undeclared context in reads', () => {
    const program = parse(`
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UnknownContext]
        produces Research { findings: List<String> }
      }
      graph Q(input: UnknownContext, output: Research, budget: 5k) {
        Researcher -> done
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('UnknownContext');
  });

  it('reports error for invalid partial reference field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.nonexistent]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent');
  });

  it('reports error for undeclared node in edge', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      edge A -> GhostNode
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('GhostNode');
  });

  it('reports error for undeclared node in graph flow', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> MissingNode -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('MissingNode');
  });

  it('reports error for undeclared graph input context', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [FakeInput]
        produces Out { data: String }
      }
      graph G(input: FakeInput, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const inputError = errors.find(e => e.message.includes('FakeInput') && e.message.includes('input'));
    expect(inputError).toBeDefined();
  });

  it('reports error for undeclared graph output produces', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: GhostOutput, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    const outputError = errors.find(e => e.message.includes('GhostOutput') && e.message.includes('output'));
    expect(outputError).toBeDefined();
  });

  it('accumulates multiple errors', () => {
    const program = parse(`
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ghost1, Ghost2]
        produces Out { data: String }
      }
      graph G(input: Ghost1, output: Out, budget: 5k) { A -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    // At least 2 errors: Ghost1 undeclared read + Ghost2 undeclared read
    // (plus Ghost1 undeclared graph input)
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('TypeChecker', () => {
  it('passes valid edge transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          findings: List<String>
          score: Float(0..1)
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out.findings]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings)
        | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors).toEqual([]);
  });

  it('reports error for select on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(nonexistent_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('nonexistent_field');
  });

  it('reports error for drop on non-existent field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { findings: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | drop(ghost_field)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('ghost_field');
  });
});

describe('TokenEstimator', () => {
  it('estimates tokens for a simple pipeline', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
        | select(findings)
        | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
  });

  it('warns when worst case exceeds budget', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 3k/2k) {
        reads: [Spec]
        on_failure: retry(3)
        produces Out { data: String }
      }
      node B(model: haiku, budget: 3k/2k) {
        reads: [Out]
        on_failure: retry(3)
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('warns when node estimated input exceeds budgetIn', () => {
    const program = parse(`
      context BigContext(max_tokens: 5k) { data: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [BigContext]
        produces Out { result: String }
      }
      graph G(input: BigContext, output: Out, budget: 10k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // BigContext is 5000 tokens, budgetIn is 1000 -- should warn
    const nodeWarning = report.warnings.find(w => w.message.includes('exceeds budgetIn'));
    expect(nodeWarning).toBeDefined();
  });
});
