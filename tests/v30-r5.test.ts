import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { executeFlowNodes, FlowContext } from '../src/runtime/flow-runner.js';
import { NodeResult } from '../src/runtime/executor.js';
import { FlowNode, FailureStrategy } from '../src/parser/ast.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- executeWithFailureStrategy ---

describe('v3.0-R5: failure strategy runtime', () => {
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

  function nodeFlow(name: string): FlowNode[] {
    return [{ kind: 'node', name }];
  }

  it('successful node does not invoke failure strategy', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      getFailureStrategy: () => ({ type: 'retry', max: 3 }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it('abort strategy pushes error', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 10, success: false, error: 'boom',
      }),
      getFailureStrategy: () => ({ type: 'abort' }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('boom');
  });

  it('skip strategy does not push error', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 10, success: false, error: 'boom',
      }),
      getFailureStrategy: () => ({ type: 'skip' }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(1); // failed result still recorded
  });

  it('retry strategy retries up to max times', async () => {
    let attempts = 0;
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        attempts++;
        if (attempts >= 3) {
          return { node: name, output: { ok: true }, durationMs: 10, success: true };
        }
        return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
      },
      getFailureStrategy: () => ({ type: 'retry', max: 3 }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(attempts).toBe(3); // 1 initial + 2 retries, success on 3rd
  });

  it('retry strategy exhausts and pushes error', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 10, success: false, error: 'fail',
      }),
      getFailureStrategy: () => ({ type: 'retry', max: 2 }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(1);
  });

  it('fallback strategy calls fallback node on failure', async () => {
    const called: string[] = [];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        called.push(name);
        if (name === 'A') {
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { fallback: true }, durationMs: 10, success: true };
      },
      getFailureStrategy: (name) => name === 'A' ? { type: 'fallback', node: 'B' } : undefined,
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    expect(called).toEqual(['A', 'B']);
    expect(results).toHaveLength(1);
    expect(results[0].node).toBe('B');
  });

  it('fallback node also failing pushes error', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 10, success: false, error: `${name} fail`,
      }),
      getFailureStrategy: () => ({ type: 'fallback', node: 'Backup' }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Backup');
  });

  it('retry_then_fallback retries first, then falls back', async () => {
    let attempts = 0;
    const called: string[] = [];
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => {
        called.push(name);
        if (name === 'A') {
          attempts++;
          return { node: name, output: null, durationMs: 10, success: false, error: 'fail' };
        }
        return { node: name, output: { ok: true }, durationMs: 10, success: true };
      },
      getFailureStrategy: () => ({ type: 'retry_then_fallback', max: 2, node: 'Backup' }),
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(0);
    // 1 initial + 2 retries + 1 fallback
    expect(called).toEqual(['A', 'A', 'A', 'Backup']);
    expect(results).toHaveLength(1);
    expect(results[0].node).toBe('Backup');
  });

  it('no failure strategy defaults to abort', async () => {
    const results: NodeResult[] = [];
    const errors: string[] = [];
    const ctx = makeCtx({
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 10, success: false, error: 'boom',
      }),
      // no getFailureStrategy
    });
    await executeFlowNodes(nodeFlow('A'), results, errors, ctx);
    expect(errors).toHaveLength(1);
  });
});

// --- ScopeChecker fallback validation ---

describe('v3.0-R5: SCOPE_INVALID_FALLBACK', () => {
  it('detects fallback referencing non-existent node', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(NonExistent)
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_INVALID_FALLBACK')).toBe(true);
  });

  it('passes for fallback referencing valid node', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(B)
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 2k/1k) {
        reads: [Spec]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.filter(e => e.code === 'SCOPE_INVALID_FALLBACK')).toHaveLength(0);
  });

  it('detects retry_then_fallback referencing non-existent node', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: retry(2, fallback(Ghost))
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_INVALID_FALLBACK')).toBe(true);
  });

  it('error code exists in GraftErrorCode union', async () => {
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'SCOPE_INVALID_FALLBACK');
    expect(err.code).toBe('SCOPE_INVALID_FALLBACK');
  });
});
