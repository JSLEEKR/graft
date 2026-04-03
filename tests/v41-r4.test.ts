import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { resolveNestedField, evaluateExpr, executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, GraphDecl, Expr } from '../src/parser/ast.js';
import { compile, compileToProgram } from '../src/compiler.js';

const loc = { line: 1, column: 1, offset: 0 };

function mkMultiCond(segments: string[], op: '<' | '>' | '<=' | '>=' | '==' | '!=', value: string | number | boolean): Expr {
  return {
    kind: 'binary',
    op,
    left: { kind: 'field_access', segments, location: loc },
    right: { kind: 'literal', value, location: loc },
    location: loc,
  };
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

// ── Cross-feature: multi-segment condition + graph call + variable ──

describe('Cross-feature: multi-segment condition + variable', () => {
  it('multi-segment condition in conditional routing works at runtime', async () => {
    // Simulate conditional edge: when(result.score >= 80): HighPath
    const flow: FlowNode[] = [
      { kind: 'node', name: 'Analyzer', location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { result: { score: 90, label: 'good' } };
        ctx.outputs.set(name, output);
        return { node: name, output, durationMs: 5, success: true };
      },
      getConditionalEdge: (source) => {
        if (source === 'Analyzer') {
          return {
            branches: [
              { target: 'HighPath', condition: mkMultiCond(['result', 'score'], '>=', 80) },
              { target: 'LowPath', condition: undefined },
            ],
            transforms: [],
          };
        }
        return null;
      },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    // Should have executed Analyzer + HighPath (routed via multi-segment condition)
    expect(nodeResults.length).toBeGreaterThanOrEqual(2);
    expect(nodeResults[1].node).toBe('HighPath');
  });
});

// ── Regression: all v4.0 patterns unchanged after output isolation ──

describe('Regression: v4.0 patterns after output isolation', () => {
  it('graph call with params still works', async () => {
    const subGraph: GraphDecl = {
      name: 'Sub', input: 'In', output: 'Out', budget: 3000,
      params: [{ name: 'limit', type: 'Int', default: 10, location: loc }],
      location: loc,
      flow: [
        { kind: 'let', name: 'threshold', value: { kind: 'field_access', segments: ['limit'], location: loc }, location: loc },
        { kind: 'node', name: 'Worker', location: loc },
      ],
    };

    const flow: FlowNode[] = [
      { kind: 'graph_call', name: 'Sub', args: [
        { name: 'limit', value: { kind: 'literal', value: 42, location: loc }, location: loc },
      ], location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { data: name };
        return { node: name, output, durationMs: 5, success: true };
      },
      getGraphDecl: (name) => name === 'Sub' ? subGraph : undefined,
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(nodeResults).toHaveLength(1);
    expect(nodeResults[0].node).toBe('Worker');
  });

  it('let bindings still work in basic flow', async () => {
    const flow: FlowNode[] = [
      { kind: 'node', name: 'A', location: loc },
      { kind: 'let', name: 'x', value: { kind: 'literal', value: 42, location: loc }, location: loc },
      { kind: 'node', name: 'B', location: loc },
    ];

    const ctx = makeCtx({
      executeNode: async (name) => {
        const output = { data: name };
        return { node: name, output, durationMs: 5, success: true };
      },
    });

    const nodeResults: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, nodeResults, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx.variables?.get('x')).toBe(42);
    expect(nodeResults).toHaveLength(2);
  });
});

// ── Regression: conditionFieldName removal didn't break transforms ──

describe('Regression: transform filter with conditions', () => {
  it('single-segment filter condition still works', () => {
    const cond = mkCond('severity', '>=', 5);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 8 } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ severity: 2 } as Record<string, unknown>)))).toBe(false);
  });

  it('multi-segment filter condition now works', () => {
    const cond = mkMultiCond(['info', 'level'], '==', 'critical');
    expect(!!evaluateExpr(cond, new Map(Object.entries({ info: { level: 'critical' } } as Record<string, unknown>)))).toBe(true);
    expect(!!evaluateExpr(cond, new Map(Object.entries({ info: { level: 'low' } } as Record<string, unknown>)))).toBe(false);
  });
});

// ── Regression: resolveNestedField edge cases ───────────────────────

describe('resolveNestedField edge cases', () => {
  it('empty segments returns the object itself', () => {
    const obj = { a: 1 };
    expect(resolveNestedField([], obj)).toEqual({ a: 1 });
  });

  it('single segment works like direct property access', () => {
    expect(resolveNestedField(['score'], { score: 42 })).toBe(42);
  });

  it('non-object intermediate returns undefined', () => {
    expect(resolveNestedField(['a', 'b'], { a: 'string' })).toBeUndefined();
  });
});

// ── Scale: compile complex pipeline with all v4.0 + v4.1 features ──

describe('Scale: full pipeline compilation', () => {
  it('complex pipeline with let + graph call + params compiles', () => {
    const source = `
      context Input(max_tokens: 500) { query: String }
      context Mid(max_tokens: 1k) { data: String }
      node Classifier(model: sonnet, budget: 2k/1k) {
        reads: [Input]
        produces ClassResult { category: String }
      }
      node Processor(model: haiku, budget: 1k/500) {
        reads: [Mid]
        produces Output { result: String }
      }
      graph Main(input: Input, output: Output, budget: 15k, mode: String = "fast") {
        Classifier -> let cat = Classifier.category -> Sub() -> done
      }
      graph Sub(input: Mid, output: Output, budget: 5k) {
        Processor -> done
      }
    `;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    const orch = result.files?.find(f => f.path.includes('CLAUDE.md'));
    expect(orch).toBeDefined();
    expect(orch!.content).toContain('data binding');
    expect(orch!.content).toContain('sub-pipeline');
    expect(orch!.content).toContain('Parameters');
  });

  it('scope checker extraction did not break error detection', () => {
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
    expect(result.errors.some(e => e.code === 'SCOPE_VAR_ORDER')).toBe(true);
  });
});
