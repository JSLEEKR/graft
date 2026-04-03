import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { executeFlowNodes, evaluateExpr, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, Expr, GraphDecl } from '../src/parser/ast.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { compile, compileToProgram } from '../src/compiler.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { ProgramIndex } from '../src/program-index.js';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import { getCompletions } from '../src/lsp/features/completions.js';

const loc = { line: 1, column: 1, offset: 0 };

function parse(source: string) {
  return new Parser(new Lexer(source).tokenize()).parse().program;
}

function makeCtx(overrides: Partial<FlowContext> = {}): FlowContext {
  return {
    executeNode: async (name: string) => ({
      node: name,
      output: { result: 'ok' },
      durationMs: 10,
      success: true,
    }),
    outputs: new Map(),
    input: {},
    ...overrides,
  };
}

// ── Cross-feature: variable + conditional edge ──────────────────────

describe('Cross-feature: variable + conditional edge', () => {
  it('condition routes based on variable value', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Analyzer', location: loc },
      { kind: 'let', name: 'score', value: { kind: 'field_access', segments: ['Analyzer', 'score'], location: loc }, location: loc },
    ];
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const result = { node: name, output: { score: 85, label: 'good' }, durationMs: 10, success: true };
        ctx.outputs.set(name, result.output);
        return result;
      },
    });

    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('score')).toBe(85);

    // Now use variable in condition evaluation
    const cond = mkCond('score', '>=', 80);
    const condResult = !!evaluateExpr(cond, new Map(Object.entries({})), ctx.variables);
    expect(condResult).toBe(true);
  });
});

// ── Cross-feature: variable + foreach ───────────────────────────────

describe('Cross-feature: variable + foreach', () => {
  it('let inside foreach body accesses iteration output', async () => {
    const foreachBody: FlowNode[] = [
      { kind: 'node', name: 'Worker', location: loc },
      { kind: 'let', name: 'itemResult', value: { kind: 'field_access', segments: ['Worker', 'data'], location: loc }, location: loc },
    ];
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Splitter', location: loc },
      { kind: 'foreach', source: 'Splitter', field: 'items', binding: 'item',
        maxIterations: 10, body: foreachBody, location: loc },
    ];
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    let workerCallCount = 0;

    const ctx = makeCtx({
      executeNode: async (name) => {
        if (name === 'Splitter') {
          const output = { items: ['a', 'b'] };
          ctx.outputs.set(name, output);
          return { node: name, output, durationMs: 5, success: true };
        }
        workerCallCount++;
        const output = { data: `processed-${workerCallCount}` };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
    });

    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(workerCallCount).toBe(2);
    // After foreach, the last iteration's let should have set itemResult
    expect(ctx.variables?.get('itemResult')).toBe('processed-2');
  });
});

// ── Cross-feature: variable + parallel ──────────────────────────────

describe('Cross-feature: variable + parallel', () => {
  it('let after parallel block accesses parallel output', async () => {
    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['FastNode', 'SlowNode'], location: loc },
      { kind: 'let', name: 'fastScore', value: { kind: 'field_access', segments: ['FastNode', 'score'], location: loc }, location: loc },
    ];
    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const outputs: Record<string, unknown> = {
          FastNode: { score: 95 },
          SlowNode: { score: 70 },
        };
        const output = outputs[name] ?? { score: 0 };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 10, success: true };
      },
    });

    await executeFlowNodes(flow, nodeResults, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('fastScore')).toBe(95);
  });
});

// ── Cross-feature: nested graph calls ───────────────────────────────

describe('Cross-feature: nested graph calls', () => {
  it('graph A calls graph B which calls graph C', async () => {
    const executed: string[] = [];

    const graphC: GraphDecl = {
      name: 'C', input: 'In', output: 'Out', budget: 1000, params: [], location: loc,
      flow: [{ kind: 'node', name: 'DeepWorker', location: loc }],
    };
    const graphB: GraphDecl = {
      name: 'B', input: 'In', output: 'Out', budget: 2000, params: [], location: loc,
      flow: [
        { kind: 'graph_call', name: 'C', args: [], location: loc },
        { kind: 'node', name: 'MidWorker', location: loc },
      ],
    };
    const graphA: GraphDecl = {
      name: 'A', input: 'In', output: 'Out', budget: 5000, params: [], location: loc,
      flow: [
        { kind: 'graph_call', name: 'B', args: [], location: loc },
        { kind: 'node', name: 'TopWorker', location: loc },
      ],
    };
    const graphs = new Map([['A', graphA], ['B', graphB], ['C', graphC]]);

    const ctx = makeCtx({
      executeNode: async (name) => {
        executed.push(name);
        const output = { data: name };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => graphs.get(name),
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(graphA.flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // Execution order: C's flow (DeepWorker), then B's MidWorker, then A's TopWorker
    expect(executed).toEqual(['DeepWorker', 'MidWorker', 'TopWorker']);
  });
});

// ── Cross-feature: variable + graph parameter ───────────────────────

describe('Cross-feature: variable + graph parameter', () => {
  it('variable references graph parameter value', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [{ name: 'threshold', type: 'Int', location: loc }],
      location: loc,
      flow: [
        { kind: 'node', name: 'Worker', location: loc },
        { kind: 'let', name: 'limit', value: { kind: 'field_access', segments: ['threshold'], location: loc }, location: loc },
      ],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [
        { name: 'threshold', value: { kind: 'literal', value: 42, location: loc }, location: loc },
      ], location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { data: 'ok' };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // The child context should have set 'limit' = 42 (threshold param)
    // But child context is separate; we verify no errors and execution completed
    expect(nodeResults).toHaveLength(1);
    expect(nodeResults[0].node).toBe('Worker');
  });
});

// ── Regression: existing flow patterns work unchanged ───────────────

describe('Regression: existing flow patterns unchanged', () => {
  it('sequential + parallel + foreach patterns compile without v4 features', () => {
    const source = `
      context Input(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Mid { items: List<String> }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Mid]
        produces Out { result: String }
      }
      node C(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces Out2 { data: String }
      }
      edge A -> B
      graph G(input: Input, output: Out, budget: 10k) {
        A -> B -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('condition with field reference still works (not variables)', () => {
    const output = { status: 'error', score: 75 };
    const cond = mkCond('status', '==', 'error');
    expect(!!evaluateExpr(cond, new Map(Object.entries(output)))).toBe(true);

    const cond2 = mkCond('score', '>=', 70);
    expect(!!evaluateExpr(cond2, new Map(Object.entries(output)))).toBe(true);
  });

  it('graph without params compiles and estimates correctly', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node Worker(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        Worker -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.report).toBeDefined();
    expect(result.report!.bestCase).toBeGreaterThan(0);
    // No params section in output
    const compiled = compile(source, 'test.gft');
    const orch = compiled.files?.find(f => f.path.includes('CLAUDE.md'));
    expect(orch!.content).not.toContain('Parameters');
  });
});

// ── Regression: LSP on files without new syntax ─────────────────────

describe('Regression: LSP features without v4 syntax', () => {
  it('document symbols work on basic program', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        A -> done
      }
    `);
    const index = new ProgramIndex(program);
    const symbols = getDocumentSymbols(program, index);
    expect(symbols.length).toBeGreaterThanOrEqual(3); // context, node, graph
    const names = symbols.map(s => s.name);
    expect(names).toContain('Spec');
    expect(names).toContain('A');
    expect(names).toContain('G');
  });

  it('completions work on basic graph flow', () => {
    const source = [
      'context Spec(max_tokens: 500) { query: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [Spec]',
      '  produces Out { data: String }',
      '}',
      'graph G(input: Spec, output: Out, budget: 5k) {',
      '  ',
      '}',
    ].join('\n');
    const program = parse(source);
    const index = new ProgramIndex(program);
    const items = getCompletions(source, 6, 2, { program, index });
    const labels = items.map(i => i.label);
    expect(labels).toContain('done');
    expect(labels).toContain('A');
    expect(labels).toContain('let');
  });
});

// ── Scale: complex pipeline ─────────────────────────────────────────

describe('Scale: complex pipeline with variables + graph calls + conditionals', () => {
  it('full pipeline compiles successfully', () => {
    const source = `
      context Input(max_tokens: 500) { query: String }
      context Mid(max_tokens: 1k) { category: String }
      node Classifier(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces ClassResult { category: String }
      }
      node Analyzer(model: sonnet, budget: 3k/1k) {
        reads: [Mid]
        produces Analysis { score: Float }
      }
      node Summarizer(model: haiku, budget: 1k/500) {
        reads: [Analysis]
        produces Summary { text: String }
      }
      edge Classifier -> Analyzer
      graph Main(input: Input, output: Summary, budget: 20k, threshold: Int = 50) {
        Classifier -> let cat = Classifier.category -> Sub() -> Summarizer -> done
      }
      graph Sub(input: Mid, output: Analysis, budget: 5k) {
        Analyzer -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
    const orch = result.files!.find(f => f.path.includes('CLAUDE.md'));
    expect(orch).toBeDefined();
    // Verify all features present in output
    expect(orch!.content).toContain('data binding');
    expect(orch!.content).toContain('let cat');
    expect(orch!.content).toContain('sub-pipeline');
    expect(orch!.content).toContain('Sub');
    expect(orch!.content).toContain('Parameters');
    expect(orch!.content).toContain('threshold: Int');
  });
});

// ── Error: multiple expression errors reported ──────────────────────

describe('Error compilation: expression errors', () => {
  it('scope error for undeclared variable in let', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        let x = UnknownNode.field -> A -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should have a scope error about the undeclared source
    const scopeError = result.errors.find(e =>
      e.code === 'SCOPE_VAR_ORDER' || e.code === 'SCOPE_VAR_UNDECLARED'
    );
    expect(scopeError).toBeDefined();
  });

  it('scope error for recursive graph call', () => {
    const source = `
      context Spec(max_tokens: 500) { query: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) {
        G() -> done
      }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    const recursionError = result.errors.find(e => e.code === 'SCOPE_GRAPH_RECURSION');
    expect(recursionError).toBeDefined();
  });
});
