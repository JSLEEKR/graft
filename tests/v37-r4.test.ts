import { describe, it, expect } from 'vitest';
import { executeFlowNodes, FlowContext, evaluateCondition } from '../src/runtime/flow-runner.js';
import { FlowNode, ConditionalBranch, Program } from '../src/parser/ast.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { findReferences } from '../src/lsp/features/references.js';
import { ScopeChecker } from '../src/analyzer/scope.js';

// --- Helpers ---

function makeFlowCtx(opts: {
  nodeOutputs?: Record<string, Record<string, unknown>>;
  conditionalEdges?: Record<string, ConditionalBranch[]>;
  failNodes?: string[];
  failureStrategies?: Record<string, any>;
  customHandler?: (name: string) => Promise<NodeResult>;
}): FlowContext & { _executedNodes: string[] } {
  const outputs = new Map<string, unknown>();
  const executedNodes: string[] = [];

  const handler = opts.customHandler ?? (async (name: string): Promise<NodeResult> => {
    if (opts.failNodes?.includes(name)) {
      return { node: name, output: null, durationMs: 1, success: false, error: `${name} failed` };
    }
    const output = opts.nodeOutputs?.[name] ?? {};
    outputs.set(name, output);
    return { node: name, output, durationMs: 1, success: true };
  });

  return {
    outputs,
    input: {},
    executeNode: async (name: string): Promise<NodeResult> => {
      executedNodes.push(name);
      const result = await handler(name);
      if (result.success && result.output) {
        outputs.set(result.node, result.output);
      }
      return result;
    },
    getConditionalEdge: (sourceName: string) => {
      return opts.conditionalEdges?.[sourceName] ?? null;
    },
    getFailureStrategy: (name: string) => {
      return opts.failureStrategies?.[name] ?? undefined;
    },
    get _executedNodes() { return executedNodes; },
  } as FlowContext & { _executedNodes: string[] };
}

function parseAndIndex(src: string): { program: ReturnType<Parser['parse']>['program']; index: ProgramIndex } {
  const tokens = new Lexer(src).tokenize();
  const { program } = new Parser(tokens).parse();
  const index = new ProgramIndex(program);
  return { program, index };
}

// --- Cross-feature integration: foreach + conditional routing ---

describe('v3.7-R4: cross-feature integration (foreach + conditional routing)', () => {
  it('foreach body node triggers multi-hop conditional routing', async () => {
    // Flow: Source -> foreach(Source.items as item) { A }
    // A has conditional edge: A -> B (when status == "go"), B -> C (when status == "continue")
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Source: { items: ['x', 'y'] },
        A: { status: 'go' },
        B: { status: 'continue' },
        C: { result: 'final' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'continue' }, target: 'C' }],
      },
    });

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Source' },
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'A' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Each iteration should execute A -> B -> C (2 iterations)
    const aCalls = ctx._executedNodes.filter(n => n === 'A');
    const bCalls = ctx._executedNodes.filter(n => n === 'B');
    const cCalls = ctx._executedNodes.filter(n => n === 'C');
    expect(aCalls).toHaveLength(2);
    expect(bCalls).toHaveLength(2);
    expect(cCalls).toHaveLength(2);
  });

  it('foreach source node with conditional edges: source fails, routing does not apply', async () => {
    // Source has conditional edges, but Source fails with skip strategy.
    // The conditional routing should NOT kick in because Source failed.
    // Foreach body should be skipped.
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Backup: { items: ['a'] },
        Worker: { result: 'ok' },
      },
      conditionalEdges: {
        Source: [{ condition: { field: 'status', op: '==', value: 'redirect' }, target: 'Backup' }],
      },
      failNodes: ['Source'],
      failureStrategies: { Source: { type: 'skip' } },
    });

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Source' },
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Source was skipped, so foreach gets no source data and skips
    expect(ctx._executedNodes).toEqual(['Source']);
    expect(ctx._executedNodes).not.toContain('Worker');
  });
});

// --- Foreach failure + multi-hop interaction ---

describe('v3.7-R4: foreach failure + multi-hop interaction', () => {
  it('fallback node feeds foreach, foreach iterates over fallback output', async () => {
    // Planner fails -> BackupPlanner (fallback) produces items -> foreach uses them
    // BackupPlanner output has conditional edges that route to Summarizer
    let plannerCalled = false;
    const outputs = new Map<string, unknown>();
    const executedNodes: string[] = [];

    const ctx: FlowContext & { _executedNodes: string[] } = {
      outputs,
      input: {},
      executeNode: async (name: string): Promise<NodeResult> => {
        executedNodes.push(name);
        if (name === 'Planner') {
          plannerCalled = true;
          return { node: name, output: null, durationMs: 1, success: false, error: 'Planner failed' };
        }
        if (name === 'BackupPlanner') {
          const out = { tasks: ['t1', 't2', 't3'] };
          outputs.set('BackupPlanner', out);
          return { node: 'BackupPlanner', output: out, durationMs: 1, success: true };
        }
        const out = { result: 'ok' };
        outputs.set(name, out);
        return { node: name, output: out, durationMs: 1, success: true };
      },
      getFailureStrategy: (name: string) => {
        if (name === 'Planner') return { type: 'fallback' as const, node: 'BackupPlanner' };
        return undefined;
      },
      getConditionalEdge: () => null,
      get _executedNodes() { return executedNodes; },
    } as FlowContext & { _executedNodes: string[] };

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Planner' },
      {
        kind: 'foreach',
        source: 'Planner',
        field: 'tasks',
        binding: 'task',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(plannerCalled).toBe(true);
    // Fallback output is aliased under 'Planner', so foreach finds items
    expect(ctx.outputs.get('Planner')).toEqual({ tasks: ['t1', 't2', 't3'] });
    const workerCalls = executedNodes.filter(n => n === 'Worker');
    expect(workerCalls).toHaveLength(3);
  });

  it('retry exhausted source with conditional edge: error propagated, foreach skipped', async () => {
    // Source node has retry(2) strategy. All retries fail.
    // Source also has conditional edges (should never fire because Source failed).
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Worker: { result: 'ok' },
      },
      conditionalEdges: {
        Source: [{ condition: { field: 'status', op: '==', value: 'ready' }, target: 'AltSource' }],
      },
      failNodes: ['Source'],
      failureStrategies: { Source: { type: 'retry', max: 2 } },
    });

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Source' },
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Source failed');
    expect(ctx._executedNodes).not.toContain('Worker');
  });
});

// --- Multi-hop edge cases ---

describe('v3.7-R4: multi-hop edge cases', () => {
  it('mid-chain fallback: intermediate node fails, fallback output propagates through remaining hops', async () => {
    // A -> B (conditional). B fails, fallback D succeeds. D's output has conditional -> C.
    const outputs = new Map<string, unknown>();
    const executedNodes: string[] = [];

    const ctx: FlowContext & { _executedNodes: string[] } = {
      outputs,
      input: {},
      executeNode: async (name: string): Promise<NodeResult> => {
        executedNodes.push(name);
        if (name === 'B') {
          return { node: name, output: null, durationMs: 1, success: false, error: 'B failed' };
        }
        if (name === 'D') {
          const out = { status: 'continue' };
          outputs.set('D', out);
          return { node: 'D', output: out, durationMs: 1, success: true };
        }
        if (name === 'C') {
          const out = { result: 'final' };
          outputs.set('C', out);
          return { node: 'C', output: out, durationMs: 1, success: true };
        }
        const out = { status: 'go' };
        outputs.set(name, out);
        return { node: name, output: out, durationMs: 1, success: true };
      },
      getConditionalEdge: (sourceName: string) => {
        if (sourceName === 'A') {
          return [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }];
        }
        // B's conditional edge should apply even when fallback D handles it
        // since D's output is aliased under B
        if (sourceName === 'B') {
          return [{ condition: { field: 'status', op: '==', value: 'continue' }, target: 'C' }];
        }
        return null;
      },
      getFailureStrategy: (name: string) => {
        if (name === 'B') return { type: 'fallback' as const, node: 'D' };
        return undefined;
      },
      get _executedNodes() { return executedNodes; },
    } as FlowContext & { _executedNodes: string[] };

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    // A executes, B fails, D (fallback) executes, output aliased under B,
    // then B's conditional edge (status==continue) routes to C
    expect(executedNodes).toContain('A');
    expect(executedNodes).toContain('B');
    expect(executedNodes).toContain('D');
    expect(executedNodes).toContain('C');
  });

  it('done target mid-chain terminates routing immediately', async () => {
    // A -> B (conditional). B routes to done. Chain stops, no further nodes.
    const ctx = makeFlowCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { status: 'finished' },
        C: { result: 'should not run' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
        B: [{ condition: { field: 'status', op: '==', value: 'finished' }, target: 'done' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    // A runs, routes to B. B runs, routes to done. C never runs.
    expect(ctx._executedNodes).toEqual(['A', 'B']);
    expect(ctx._executedNodes).not.toContain('C');
  });

  it('parallel node followed by conditional edges on each branch', async () => {
    // parallel [X, Y], then X has conditional edge -> Z
    // The parallel branches complete, then next flow node runs
    const ctx = makeFlowCtx({
      nodeOutputs: {
        X: { status: 'route' },
        Y: { result: 'ok' },
        Z: { result: 'routed' },
      },
      conditionalEdges: {
        // Note: parallel branches don't trigger conditional routing themselves
        // because parallel node execution doesn't go through the 'node' case
      },
    });

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['X', 'Y'] },
      { kind: 'node', name: 'Z' },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toContain('X');
    expect(ctx._executedNodes).toContain('Y');
    expect(ctx._executedNodes).toContain('Z');
  });
});

// --- Regression tests ---

describe('v3.7-R4: regression tests', () => {
  it('findDeclNamePosition returns correct positions for context, node, and produces keywords', () => {
    const src = `context Spec(max_tokens: 500) {
  title: String
}

node Worker(model: sonnet, budget: 1000/500) {
  reads: [Spec]
  produces Output {
    result: String
  }
}

graph Pipeline(input: Spec, output: Output, budget: 5000) {
  Worker -> done
}`;
    const { index } = parseAndIndex(src);

    // Test context keyword - "context" loc.length = 7
    // Spec appears at: declaration (line 0), reads (line 5), graph input (line 12)
    const contextRefs = findReferences('Spec', src, 'file:///test.gft', index, true, new Map());
    const contextDeclRefs = findReferences('Spec', src, 'file:///test.gft', index, false, new Map());
    expect(contextRefs.length).toBe(contextDeclRefs.length + 1);

    // Test node keyword - "node" loc.length = 4
    // Worker appears at: declaration (line 4), graph flow (line 13)
    const nodeRefs = findReferences('Worker', src, 'file:///test.gft', index, true, new Map());
    const nodeDeclRefs = findReferences('Worker', src, 'file:///test.gft', index, false, new Map());
    expect(nodeRefs.length).toBe(nodeDeclRefs.length + 1);

    // Test produces keyword - "produces" loc.length = 8
    // Output appears at: declaration (line 6), graph output (line 12)
    const prodRefs = findReferences('Output', src, 'file:///test.gft', index, true, new Map());
    const prodDeclRefs = findReferences('Output', src, 'file:///test.gft', index, false, new Map());
    expect(prodRefs.length).toBe(prodDeclRefs.length + 1);
  });

  it('foreach with missing source data (source not executed): foreach silently skips', async () => {
    // Regression: after removing `?? ctx.input` fallback, if source has no output,
    // foreach should break (skip) rather than fallback to input
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Worker: { result: 'ok' },
      },
    });

    // Source was never executed, so outputs.get('Source') === undefined
    const flow: FlowNode[] = [
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    // No error, no Worker calls - foreach silently skips when source has no output
    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toHaveLength(0);
  });

  it('single-hop conditional still works (backward compat)', async () => {
    // Simple single conditional edge: A -> B. No chain beyond B.
    const ctx = makeFlowCtx({
      nodeOutputs: {
        A: { status: 'go' },
        B: { result: 'done' },
      },
      conditionalEdges: {
        A: [{ condition: { field: 'status', op: '==', value: 'go' }, target: 'B' }],
      },
    });

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes([{ kind: 'node', name: 'A' }], results, errors, ctx);

    expect(errors).toHaveLength(0);
    expect(ctx._executedNodes).toEqual(['A', 'B']);
  });

  it('ScopeChecker allows done in conditional branches but rejects undefined nodes', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const program: Program = {
      imports: [],
      memories: [],
      contexts: [
        { name: 'Input', maxTokens: 500, fields: [{ name: 'data', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
      ],
      nodes: [
        {
          name: 'A', model: 'sonnet', budgetIn: 2000, budgetOut: 1000,
          reads: [{ context: 'Input', location: loc }], tools: [], writes: [],
          produces: { name: 'Out', fields: [{ name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc }], location: loc },
          location: loc,
        },
      ],
      edges: [
        {
          source: 'A',
          target: {
            kind: 'conditional',
            branches: [
              { condition: { field: 'status', op: '==', value: 'ok' }, target: 'done' },
              { condition: { field: 'status', op: '==', value: 'error' }, target: 'NonExistent' },
            ],
          },
          transforms: [],
          location: loc,
        },
      ],
      graphs: [{ name: 'G', input: 'Input', output: 'Out', budget: 10000, flow: [{ kind: 'node', name: 'A' }], location: loc }],
    };

    const checker = new ScopeChecker(program);
    const diagnostics = checker.check();
    // 'done' should NOT produce an error
    const doneError = diagnostics.find(d => d.code === 'SCOPE_UNDEFINED_REF' && d.message.includes('done'));
    expect(doneError).toBeUndefined();
    // 'NonExistent' SHOULD produce an error
    const nonExistentError = diagnostics.find(d => d.code === 'SCOPE_UNDEFINED_REF' && d.message.includes('NonExistent'));
    expect(nonExistentError).toBeDefined();
  });

  it('evaluateCondition handles all comparison operators correctly', () => {
    // Verify the condition evaluation used in multi-hop routing
    expect(evaluateCondition({ field: 'x', op: '==', value: 'a' }, { x: 'a' })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: '==', value: 'a' }, { x: 'b' })).toBe(false);
    expect(evaluateCondition({ field: 'x', op: '!=', value: 'a' }, { x: 'b' })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: '!=', value: 'a' }, { x: 'a' })).toBe(false);
    expect(evaluateCondition({ field: 'x', op: '>=', value: 5 }, { x: 10 })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: '>=', value: 5 }, { x: 3 })).toBe(false);
    expect(evaluateCondition({ field: 'x', op: '>', value: 5 }, { x: 6 })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: '<=', value: 5 }, { x: 5 })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: '<', value: 5 }, { x: 3 })).toBe(true);
    // undefined field: only != returns true
    expect(evaluateCondition({ field: 'missing', op: '==', value: 'a' }, {})).toBe(false);
    expect(evaluateCondition({ field: 'missing', op: '!=', value: 'a' }, {})).toBe(true);
  });

  it('foreach skip with empty source data does not error (no ctx.input fallback)', async () => {
    // Source succeeds but field is empty array. Foreach runs 0 iterations.
    // This confirms the removal of `?? ctx.input` doesn't break empty-array case.
    const ctx = makeFlowCtx({
      nodeOutputs: {
        Source: { items: [] },
        Worker: { result: 'ok' },
      },
    });

    const flow: FlowNode[] = [
      { kind: 'node', name: 'Source' },
      {
        kind: 'foreach',
        source: 'Source',
        field: 'items',
        binding: 'item',
        maxIterations: 100,
        body: [{ kind: 'node', name: 'Worker' }],
      },
    ];

    const results: NodeResult[] = [];
    const errors: string[] = [];
    await executeFlowNodes(flow, results, errors, ctx);

    expect(errors).toHaveLength(0);
    // Source runs but Worker never runs (empty array)
    expect(ctx._executedNodes).toEqual(['Source']);
  });
});
