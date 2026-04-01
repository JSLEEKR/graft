import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { ProgramIndex } from '../src/program-index.js';
import { compile } from '../src/compiler.js';

// D-01: Executor uses index maps (covered by existing runner tests; verify no regression)
describe('D-01: Executor duplicate state removal', () => {
  it('should not have nodeMap or edgeMap as own properties distinct from index', async () => {
    // Import executor and verify the class no longer declares its own nodeMap/edgeMap
    const { Executor } = await import('../src/runtime/executor.js');
    const source = `
context Input(max_tokens: 1k) { query: String }
node A(model: sonnet, budget: 1k/1k) {
  reads: [Input]
  produces AOut { answer: String }
}
graph Pipeline(input: Input, output: AOut, budget: 10k) {
  A -> done
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse().program;
    const index = new ProgramIndex(program);

    const executor = new Executor(program, {
      sourceFile: 'test.gft',
      input: { query: 'test' },
      workDir: '/tmp/test',
      dryRun: true,
    }, index);

    // After D-01, executor should NOT have own nodeMap or edgeMap fields
    expect((executor as any).nodeMap).toBeUndefined();
    expect((executor as any).edgeMap).toBeUndefined();
    // But index should still be accessible
    expect((executor as any).index).toBeDefined();
    expect((executor as any).index.nodeMap.has('A')).toBe(true);
  });
});

// D-02: ScopeChecker derives from ProgramIndex
describe('D-02: ScopeChecker derives from ProgramIndex', () => {
  it('should not have contextNames, nodeNames, or memoryNames Sets', () => {
    const source = `
context Input(max_tokens: 1k) { query: String }
memory Notes(max_tokens: 2k) { content: String }
node A(model: sonnet, budget: 1k/1k) {
  reads: [Input]
  produces AOut { answer: String }
}
graph Pipeline(input: Input, output: AOut, budget: 10k) {
  A -> done
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse().program;
    const index = new ProgramIndex(program);

    const checker = new ScopeChecker(program, index);

    // After D-02, checker should NOT have these Set fields
    expect((checker as any).contextNames).toBeUndefined();
    expect((checker as any).nodeNames).toBeUndefined();
    expect((checker as any).memoryNames).toBeUndefined();

    // Scope check should still work correctly
    const errors = checker.check();
    expect(errors.length).toBe(0);
  });

  it('should still detect scope errors correctly after refactoring', () => {
    const source = `
context Input(max_tokens: 1k) { query: String }
node A(model: sonnet, budget: 1k/1k) {
  reads: [NonExistent]
  produces AOut { answer: String }
}
graph Pipeline(input: Input, output: AOut, budget: 10k) {
  A -> done
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse().program;
    const index = new ProgramIndex(program);

    const checker = new ScopeChecker(program, index);
    const errors = checker.check();

    // Should still detect that NonExistent is not a declared context/produces/memory
    const scopeError = errors.find(e => e.message.includes('NonExistent'));
    expect(scopeError).toBeDefined();
  });
});

// D-03: CLI formatTokenReport extraction
describe('D-03: formatTokenReport extraction', () => {
  it('should export formatTokenReport function', async () => {
    const mod = await import('../src/format.js');
    expect(typeof mod.formatTokenReport).toBe('function');
  });

  it('should format a token report correctly', async () => {
    const { formatTokenReport } = await import('../src/format.js');
    const report = {
      graphName: 'TestGraph',
      budget: 10000,
      bestCase: 3000,
      worstCase: 8000,
      nodes: [
        { name: 'Analyzer', estimatedIn: 1000, estimatedOut: 2000 },
        { name: 'Generator', estimatedIn: 2000, estimatedOut: 3000 },
      ],
      warnings: [],
    };

    const output = formatTokenReport(report);
    expect(output).toContain('Analyzer');
    expect(output).toContain('Generator');
    expect(output).toContain('Best path');
    expect(output).toContain('Worst path');
  });
});

// D-04: Foreach nesting error message
describe('D-04: Foreach nesting error message', () => {
  it('should not mention a specific version in the foreach nesting error', () => {
    const source = `
context Input(max_tokens: 1k) { query: String }
node A(model: sonnet, budget: 1k/1k) {
  reads: [Input]
  produces AOut { items: List<String> }
}
node B(model: sonnet, budget: 1k/1k) {
  reads: [Input]
  produces BOut { answer: String }
}
node C(model: sonnet, budget: 1k/1k) {
  reads: [Input]
  produces COut { answer: String }
}
graph Pipeline(input: Input, output: BOut, budget: 10k) {
  A -> foreach(A.output.items as item, max_iterations: 5) {
    foreach(A.output.items as item2, max_iterations: 3) {
      C
    }
  } -> done
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);

    const result = parser.parse();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].message).toContain('not supported');
    // Should NOT mention any version number like "v1.1"
    expect(result.errors[0].message).not.toMatch(/v\d+\.\d+/);
  });
});
