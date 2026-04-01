import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode } from '../src/parser/ast.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().program;
}

// ========================================
// Bug 1: Parallel branches must use failure strategies
// ========================================

describe('v3.1-R2: parallel branches use failure strategies', () => {
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

  it('parallel node with on_failure: retry(N) retries within parallel block', async () => {
    const attemptCounts: Record<string, number> = { A: 0, B: 0 };
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'] },
    ];

    const ctx = makeCtx({
      executeNode: async (name: string) => {
        attemptCounts[name] = (attemptCounts[name] ?? 0) + 1;
        if (name === 'A' && attemptCounts[name] < 3) {
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      },
      getFailureStrategy: (name) => name === 'A' ? { type: 'retry', max: 3 } : undefined,
    });

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(attemptCounts['A']).toBe(3); // 1 initial + 2 retries, success on 3rd
    expect(results.some(r => r.node === 'A' && r.success)).toBe(true);
    expect(results.some(r => r.node === 'B' && r.success)).toBe(true);
  });

  it('parallel node with on_failure: skip produces null output (pipeline continues)', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'] },
    ];

    const ctx = makeCtx({
      executeNode: async (name: string) => {
        if (name === 'A') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'boom' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      },
      getFailureStrategy: (name) => name === 'A' ? { type: 'skip' } : undefined,
    });

    await executeFlowNodes(flow, results, errors, ctx);
    // skip means no error pushed, pipeline continues
    expect(errors).toHaveLength(0);
    // B should have succeeded
    expect(results.some(r => r.node === 'B' && r.success)).toBe(true);
  });

  it('parallel node with on_failure: fallback(X) executes fallback', async () => {
    const called: string[] = [];
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'] },
    ];

    const ctx = makeCtx({
      executeNode: async (name: string) => {
        called.push(name);
        if (name === 'A') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      },
      getFailureStrategy: (name) => name === 'A' ? { type: 'fallback', node: 'C' } : undefined,
    });

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    // C should have been called as fallback for A
    expect(called).toContain('C');
    expect(results.some(r => r.node === 'C' && r.success)).toBe(true);
    expect(results.some(r => r.node === 'B' && r.success)).toBe(true);
  });

  it('parallel node with retry_then_fallback works', async () => {
    let aAttempts = 0;
    const called: string[] = [];
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'] },
    ];

    const ctx = makeCtx({
      executeNode: async (name: string) => {
        called.push(name);
        if (name === 'A') {
          aAttempts++;
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      },
      getFailureStrategy: (name) => name === 'A' ? { type: 'retry_then_fallback', max: 2, node: 'C' } : undefined,
    });

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(0);
    // A tried 1 initial + 2 retries = 3, then fallback to C
    expect(aAttempts).toBe(3);
    expect(called).toContain('C');
    expect(results.some(r => r.node === 'C' && r.success)).toBe(true);
  });

  it('parallel node without failure strategy still aborts on failure', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [
      { kind: 'parallel', branches: ['A', 'B'] },
    ];

    const ctx = makeCtx({
      executeNode: async (name: string) => {
        if (name === 'A') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'boom' };
        }
        return { node: name, output: { result: 'ok' }, durationMs: 10, success: true };
      },
      // no getFailureStrategy — defaults to abort behavior
    });

    await executeFlowNodes(flow, results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('boom');
  });
});

// ========================================
// Bug 2: Fallback cycle detection
// ========================================

describe('v3.1-R2: SCOPE_FALLBACK_CYCLE detection', () => {
  it('detects self-referencing fallback', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(A)
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toBe(true);
  });

  it('detects mutual fallback cycle (A->B->A)', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(B)
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 2k/1k) {
        reads: [Spec]
        on_failure: fallback(A)
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toBe(true);
  });

  it('detects retry_then_fallback self-reference cycle', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: retry(2, fallback(A))
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toBe(true);
  });

  it('allows chain without cycle (A->B->C, no cycle)', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(B)
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 2k/1k) {
        reads: [Spec]
        on_failure: fallback(C)
        produces OutB { result: String }
      }
      node C(model: haiku, budget: 2k/1k) {
        reads: [Spec]
        produces OutC { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.filter(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toHaveLength(0);
  });

  it('SCOPE_FALLBACK_CYCLE error code exists in GraftErrorCode union', async () => {
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'SCOPE_FALLBACK_CYCLE');
    expect(err.code).toBe('SCOPE_FALLBACK_CYCLE');
  });
});
