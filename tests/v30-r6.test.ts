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

// --- SourceLocation length ---

describe('v3.0-R6: SourceLocation length', () => {
  it('tokens carry length property', () => {
    const tokens = new Lexer('node A').tokenize();
    expect(tokens[0].location.length).toBe(4); // "node"
    expect(tokens[1].location.length).toBe(1); // "A"
  });

  it('integer tokens carry correct length', () => {
    const tokens = new Lexer('123').tokenize();
    expect(tokens[0].location.length).toBe(3);
  });

  it('k-integer tokens carry correct length', () => {
    const tokens = new Lexer('5k').tokenize();
    expect(tokens[0].location.length).toBe(2);
  });

  it('float tokens carry correct length', () => {
    const tokens = new Lexer('3.14').tokenize();
    expect(tokens[0].location.length).toBe(4);
  });

  it('string tokens carry correct length (includes quotes)', () => {
    const tokens = new Lexer('"hello"').tokenize();
    expect(tokens[0].location.length).toBe(7);
  });

  it('symbol tokens carry correct length', () => {
    const tokens = new Lexer('->').tokenize();
    expect(tokens[0].location.length).toBe(2);
    const tokens2 = new Lexer('{').tokenize();
    expect(tokens2[0].location.length).toBe(1);
  });
});

// --- PARSE_ error codes ---

describe('v3.0-R6: PARSE_ error codes', () => {
  it('parser errors have PARSE_UNEXPECTED_TOKEN code', () => {
    const tokens = new Lexer('node 123').tokenize();
    const result = new Parser(tokens).parse();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].code).toBe('PARSE_UNEXPECTED_TOKEN');
  });

  it('missing produces has PARSE_MISSING_FIELD code', () => {
    const tokens = new Lexer(`
      node A(model: sonnet, budget: 5k/2k) {
        reads: []
      }
    `).tokenize();
    const result = new Parser(tokens).parse();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].code).toBe('PARSE_MISSING_FIELD');
  });
});

// --- SCOPE_TRANSFORM_CONDITIONAL removed in v3.9 (transforms now applied at runtime) ---

describe('v3.0-R6: SCOPE_TRANSFORM_CONDITIONAL removed', () => {
  it('no longer emits SCOPE_TRANSFORM_CONDITIONAL warning (v3.9: transforms on conditional edges supported)', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const program = {
      imports: [],
      memories: [],
      contexts: [{ name: 'Spec', maxTokens: 500, fields: [{ name: 'name', type: { kind: 'primitive' as const, name: 'String' }, location: loc }], location: loc }],
      nodes: [
        { name: 'A', model: 'sonnet', budgetIn: 2000, budgetOut: 1000, reads: [{ context: 'Spec', location: loc }], tools: [], writes: [], produces: { name: 'Out', fields: [{ name: 'findings', type: { kind: 'list' as const, element: { kind: 'primitive' as const, name: 'String' } }, location: loc }], location: loc }, location: loc },
        { name: 'B', model: 'haiku', budgetIn: 1000, budgetOut: 500, reads: [{ context: 'Out', location: loc }], tools: [], writes: [], produces: { name: 'Final', fields: [{ name: 'result', type: { kind: 'primitive' as const, name: 'String' }, location: loc }], location: loc }, location: loc },
      ],
      edges: [{
        source: 'A',
        target: { kind: 'conditional' as const, branches: [{ condition: { field: 'score', op: '>=', value: 0.5 }, target: 'B' }, { condition: undefined, target: 'B' }] },
        transforms: [{ type: 'select' as const, fields: ['findings'] }],
        location: loc,
      }],
      graphs: [{ name: 'G', input: 'Spec', output: 'Final', budget: 10000, flow: [{ kind: 'node' as const, name: 'A' }, { kind: 'node' as const, name: 'B' }], location: loc }],
    };
    const checker = new ScopeChecker(program as any);
    const diagnostics = checker.check();
    const warning = diagnostics.find(d => d.code === 'SCOPE_TRANSFORM_CONDITIONAL');
    expect(warning).toBeUndefined();
  });
});

// --- GraftErrorCode sub-unions ---

describe('v3.0-R6: GraftErrorCode sub-unions', () => {
  it('sub-union types are importable', async () => {
    const mod = await import('../src/errors/diagnostics.js');
    const err = new mod.GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'PARSE_UNEXPECTED_TOKEN');
    expect(err.code).toBe('PARSE_UNEXPECTED_TOKEN');
  });
});

// --- Foreach binding cleanup ---

describe('v3.0-R6: foreach binding cleanup', () => {
  it('cleans up binding after foreach completes', async () => {
    const outputs = new Map<string, unknown>();
    outputs.set('Source', { items: ['a', 'b', 'c'] });
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [{
      kind: 'foreach',
      source: 'Source',
      field: 'items',
      binding: 'item',
      maxIterations: 10,
      body: [{ kind: 'node', name: 'done' }],
    }];

    const ctx: FlowContext = {
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 0, success: true,
      }),
      outputs,
      input: {},
    };

    await executeFlowNodes(flow, results, errors, ctx);
    expect(outputs.has('item')).toBe(false);
  });

  it('restores pre-existing binding value after foreach', async () => {
    const outputs = new Map<string, unknown>();
    outputs.set('Source', { items: ['x'] });
    outputs.set('item', 'original');
    const results: NodeResult[] = [];
    const errors: string[] = [];

    const flow: FlowNode[] = [{
      kind: 'foreach',
      source: 'Source',
      field: 'items',
      binding: 'item',
      maxIterations: 10,
      body: [{ kind: 'node', name: 'done' }],
    }];

    const ctx: FlowContext = {
      executeNode: async (name) => ({
        node: name, output: null, durationMs: 0, success: true,
      }),
      outputs,
      input: {},
    };

    await executeFlowNodes(flow, results, errors, ctx);
    expect(outputs.get('item')).toBe('original');
  });
});

// --- Dead bench script removed ---

describe('v3.0-R6: dead bench script removed', () => {
  it('package.json does not have bench script', async () => {
    const fs = await import('node:fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts.bench).toBeUndefined();
  });
});
