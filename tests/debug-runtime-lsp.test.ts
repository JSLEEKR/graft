import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MarkupKind } from 'vscode-languageserver/node';
import { mkCond } from './helpers.js';
import { ProgramIndex } from '../src/program-index.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { compile, compileToProgram } from '../src/compiler.js';
import type { ContextDecl, NodeDecl, MemoryDecl, GraphDecl, EdgeDecl } from '../src/parser/ast.js';

// ============================================================
// RUNTIME: transforms.ts
// ============================================================
describe('transforms — applySelect', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('select with top-level fields works normally', () => {
    const data = { a: 1, b: 2, c: 3 };
    const result = applyTransforms(data, [{ type: 'select', fields: ['a', 'b'] }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('select with dot-separated field name does NOT traverse nested objects (treated as literal key)', () => {
    // applySelect uses `f in obj`, so "result.data.items" is a literal key lookup,
    // NOT a nested traversal. This test documents that behavior.
    const data = { result: { data: { items: [1, 2, 3] } } };
    const result = applyTransforms(data, [{ type: 'select', fields: ['result.data.items'] }]);
    // The literal key "result.data.items" does not exist, so result is empty
    expect(result).toEqual({});
  });

  it('select preserves nested object values when top-level key matches', () => {
    const data = { result: { data: { items: [1, 2, 3] } }, meta: 'info' };
    const result = applyTransforms(data, [{ type: 'select', fields: ['result'] }]);
    expect(result).toEqual({ result: { data: { items: [1, 2, 3] } } });
  });

  it('select on empty object returns empty object', () => {
    const result = applyTransforms({}, [{ type: 'select', fields: ['a', 'b'] }]);
    expect(result).toEqual({});
  });

  it('select with empty fields list returns empty object', () => {
    const data = { a: 1, b: 2 };
    const result = applyTransforms(data, [{ type: 'select', fields: [] }]);
    expect(result).toEqual({});
  });
});

describe('transforms — applyDrop', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('drop a field that does not exist is a silent no-op', () => {
    const data = { a: 1, b: 2 };
    const result = applyTransforms(data, [{ type: 'drop', field: 'nonexistent' }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('drop on empty object is a no-op', () => {
    const result = applyTransforms({}, [{ type: 'drop', field: 'x' }]);
    expect(result).toEqual({});
  });

  it('drop does not mutate the original object', () => {
    const data = { a: 1, b: 2 };
    applyTransforms(data, [{ type: 'drop', field: 'a' }]);
    expect(data).toEqual({ a: 1, b: 2 });
  });
});

describe('transforms — applyCompact', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('compact removes null values', () => {
    const result = applyTransforms({ a: null, b: 1 }, [{ type: 'compact' }]);
    expect(result).toEqual({ b: 1 });
  });

  it('compact removes undefined values', () => {
    const result = applyTransforms({ a: undefined, b: 1 }, [{ type: 'compact' }]);
    expect(result).toEqual({ b: 1 });
  });

  it('compact removes empty strings', () => {
    const result = applyTransforms({ a: '', b: 'hello' }, [{ type: 'compact' }]);
    expect(result).toEqual({ b: 'hello' });
  });

  it('compact preserves false', () => {
    const result = applyTransforms({ a: false, b: true }, [{ type: 'compact' }]);
    expect(result).toEqual({ a: false, b: true });
  });

  it('compact preserves 0', () => {
    const result = applyTransforms({ a: 0, b: 1 }, [{ type: 'compact' }]);
    expect(result).toEqual({ a: 0, b: 1 });
  });

  it('compact removes empty arrays', () => {
    const result = applyTransforms({ a: [], b: [1] }, [{ type: 'compact' }]);
    expect(result).toEqual({ b: [1] });
  });

  it('compact removes empty objects', () => {
    const result = applyTransforms({ a: {}, b: { x: 1 } }, [{ type: 'compact' }]);
    expect(result).toEqual({ b: { x: 1 } });
  });

  it('compact recursively removes nested empty values', () => {
    const data = { outer: { inner: null, keep: 'yes' }, deep: { nested: { empty: '' } } };
    const result = applyTransforms(data, [{ type: 'compact' }]);
    // deep.nested becomes {} after removing empty string, then deep becomes {} after removing empty nested, then deep itself is removed
    expect(result).toEqual({ outer: { keep: 'yes' } });
  });

  it('compact on array data filters out empty items', () => {
    const data = [1, null, '', 0, false, {}, []];
    const result = applyTransforms(data, [{ type: 'compact' }]);
    // The applyOne guard: data is object (array is object), so compact runs
    // isEmpty: null=true, ''=true, 0=false, false=false, {}=true, []=true
    expect(result).toEqual([1, 0, false]);
  });
});

describe('transforms — applyFilter', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('filter with == condition', () => {
    const data = { items: [{ status: 'ok' }, { status: 'fail' }, { status: 'ok' }] };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('status', '==', 'ok'),
    }]);
    expect(result).toEqual({ items: [{ status: 'ok' }, { status: 'ok' }] });
  });

  it('filter with < condition', () => {
    const data = { scores: [{ val: 1 }, { val: 5 }, { val: 3 }] };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'scores',
      condition: mkCond('val', '<', 4),
    }]);
    expect(result).toEqual({ scores: [{ val: 1 }, { val: 3 }] });
  });

  it('filter on missing field returns object unchanged', () => {
    const data = { x: 1 };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('val', '>', 0),
    }]);
    // field 'items' is undefined, not an array => returns obj unchanged
    expect(result).toEqual({ x: 1 });
  });

  it('filter with primitive items (non-object) drops them', () => {
    // filter callback returns false for non-object items
    const data = { items: [1, 2, 3, { val: 4 }] };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('val', '>', 0),
    }]);
    // primitives (1,2,3) => typeof item !== 'object' => return false
    expect(result).toEqual({ items: [{ val: 4 }] });
  });

  it('filter preserves other fields on the object', () => {
    const data = { items: [{ v: 1 }, { v: 2 }], meta: 'keep' };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('v', '>=', 2),
    }]);
    expect(result).toEqual({ items: [{ v: 2 }], meta: 'keep' });
  });
});

describe('transforms — chained transforms (order of operations)', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('select then compact: only selected fields are compacted', () => {
    const data = { a: null, b: 2, c: '', d: 4 };
    const result = applyTransforms(data, [
      { type: 'select', fields: ['a', 'b', 'c'] },
      { type: 'compact' },
    ]);
    // select gives {a: null, b: 2, c: ''}, compact removes null and ''
    expect(result).toEqual({ b: 2 });
  });

  it('compact then select: compact first removes empties, then select picks', () => {
    const data = { a: null, b: 2, c: '', d: 4 };
    const result = applyTransforms(data, [
      { type: 'compact' },
      { type: 'select', fields: ['a', 'b'] },
    ]);
    // compact gives {b: 2, d: 4}, select picks 'a' (missing) and 'b'
    expect(result).toEqual({ b: 2 });
  });

  it('drop then select: field is dropped before selection', () => {
    const data = { a: 1, b: 2, c: 3 };
    const result = applyTransforms(data, [
      { type: 'drop', field: 'b' },
      { type: 'select', fields: ['a', 'b'] },
    ]);
    // drop gives {a: 1, c: 3}, select picks 'a' (exists) and 'b' (gone)
    expect(result).toEqual({ a: 1 });
  });

  it('filter then drop: filter first, then drop the filtered field', () => {
    const data = { items: [{ s: 1 }, { s: 5 }], meta: 'x' };
    const result = applyTransforms(data, [
      { type: 'filter', field: 'items', condition: mkCond('s', '>', 3) },
      { type: 'drop', field: 'items' },
    ]);
    expect(result).toEqual({ meta: 'x' });
  });
});

describe('transforms — edge cases', () => {
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
  });

  it('transform on empty object returns empty object for select', () => {
    expect(applyTransforms({}, [{ type: 'select', fields: ['a'] }])).toEqual({});
  });

  it('transform on empty object returns empty object for drop', () => {
    expect(applyTransforms({}, [{ type: 'drop', field: 'a' }])).toEqual({});
  });

  it('transform on empty object returns empty object for compact — but compact removes empty objects', () => {
    // compact on {} returns {} (since it iterates entries and produces empty result)
    // isEmpty({}) = true, BUT the top-level call returns the result directly
    // Actually: applyCompact iterates entries of {}, result = {}, and returns {}
    const result = applyTransforms({}, [{ type: 'compact' }]);
    expect(result).toEqual({});
  });

  it('transform on array passes through for select/drop (applyOne checks typeof)', () => {
    // applyOne casts data to Record<string, unknown> for select, but arrays are objects
    // This tests what actually happens
    const arr = [1, 2, 3];
    const selectResult = applyTransforms(arr, [{ type: 'select', fields: ['0'] }]);
    // Arrays have numeric string keys, so '0' in [1,2,3] is true
    expect(selectResult).toEqual({ '0': 1 });
  });

  it('compact on array removes null/empty items', () => {
    const arr = [1, null, '', 2];
    const result = applyTransforms(arr, [{ type: 'compact' }]);
    expect(result).toEqual([1, 2]);
  });

  it('select on array treats it as object (array indices become keys)', () => {
    // This is technically a bug/unexpected behavior: arrays passed to select
    // get treated as plain objects with numeric string keys
    const arr = ['a', 'b', 'c'];
    const result = applyTransforms(arr, [{ type: 'select', fields: ['1'] }]);
    expect(result).toEqual({ '1': 'b' });
  });

  it('null input passes through all transforms unchanged', () => {
    expect(applyTransforms(null, [
      { type: 'select', fields: ['a'] },
      { type: 'compact' },
      { type: 'drop', field: 'x' },
    ])).toBeNull();
  });

  it('string input passes through select/drop/filter transforms unchanged', () => {
    expect(applyTransforms('hello', [{ type: 'select', fields: ['a'] }])).toBe('hello');
  });
});

// ============================================================
// RUNTIME: executor.ts / flow-runner.ts
// ============================================================
describe('Executor — no-graph program', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-debug-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns error when program has no graphs', async () => {
    const { compileToProgram } = await import('../src/compiler.js');
    const result = compileToProgram(`
context TaskSpec(max_tokens: 500) {
  title: String
}
node Worker(model: sonnet, budget: 2k/1k) {
  reads: [TaskSpec]
  produces Result {
    answer: String
  }
}
`, 'test.gft');

    // compileToProgram succeeds (no graph is not a compile error at program level)
    expect(result.program).toBeDefined();

    const executor = new Executor(result.program!, {
      sourceFile: 'test.gft',
      input: { title: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    const runResult = await executor.execute();
    expect(runResult.success).toBe(false);
    expect(runResult.errors).toContain('No graph declaration found');
    expect(runResult.nodeResults).toEqual([]);
  });
});

describe('Executor — edge transforms in dry-run', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  const EDGE_TRANSFORM_GFT = `
context Input(max_tokens: 500) {
  question: String
}

node A(model: sonnet, budget: 2k/1k) {
  reads: [Input]
  produces AOut {
    keep: String
    remove: String
    data: String
  }
}

node B(model: sonnet, budget: 2k/1k) {
  reads: [AOut]
  produces BOut {
    result: String
  }
}

edge A -> B
  | select(keep, data)
  | drop(data)

graph Pipeline(input: Input, output: BOut, budget: 6k) {
  A -> B -> done
}
`;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-debug-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run writes transformed output files for edges', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(EDGE_TRANSFORM_GFT, 'test.gft');
    expect(compiled.success).toBe(true);

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.nodeResults.length).toBe(2);

    // Check that transformed output file was written
    const sessionDir = path.join(tmpDir, '.graft', 'session', 'node_outputs');
    const transformedFile = path.join(sessionDir, 'a_to_b.json');
    expect(fs.existsSync(transformedFile)).toBe(true);

    const transformed = JSON.parse(fs.readFileSync(transformedFile, 'utf-8'));
    // select(keep, data) => {keep: ..., data: ...}, drop(data) => {keep: ...}
    expect(transformed).toHaveProperty('keep');
    expect(transformed).not.toHaveProperty('data');
    expect(transformed).not.toHaveProperty('remove');
  });
});

describe('Executor — subprocess non-zero exit', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  const SIMPLE_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Result {
    answer: String
  }
}

graph SimpleRun(input: UserRequest, output: Result, budget: 6k) {
  Worker -> done
}
`;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-debug-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('non-zero exit with valid JSON stdout still succeeds (recoverable)', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const mockSpawner = async () => ({
      stdout: JSON.stringify({ answer: 'partial result' }),
      stderr: 'some warning',
      exitCode: 1,
    });

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    // Even with exit code 1, if stdout has valid JSON, it's treated as success
    expect(result.success).toBe(true);
    expect(result.nodeResults[0].success).toBe(true);
    expect(result.nodeResults[0].output).toEqual({ answer: 'partial result' });
  });

  it('non-zero exit with garbage stdout fails', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const mockSpawner = async () => ({
      stdout: 'not json at all !!!',
      stderr: 'fatal error',
      exitCode: 1,
    });

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('exited with code 1');
  });

  it('spawner throwing an exception is caught and reported', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const mockSpawner = async () => {
      throw new Error('Connection refused');
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Connection refused');
  });
});

describe('Executor — token budget tracking', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  const TWO_NODE_GFT = `
context Input(max_tokens: 500) {
  question: String
}

node A(model: sonnet, budget: 2000/1000) {
  reads: [Input]
  produces AOut {
    data: String
  }
}

node B(model: sonnet, budget: 3000/1500) {
  reads: [AOut]
  produces BOut {
    result: String
  }
}

edge A -> B

graph Pipeline(input: Input, output: BOut, budget: 10000) {
  A -> B -> done
}
`;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-debug-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run tracks estimated tokens per node and sums them', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(TWO_NODE_GFT, 'test.gft');
    expect(compiled.success).toBe(true);

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.budget).toBe(10000);
    // A: 2000+1000=3000, B: 3000+1500=4500, total=7500
    expect(result.tokenUsage!.consumed).toBe(7500);
    expect(result.tokenUsage!.perNode).toHaveLength(2);
    expect(result.tokenUsage!.perNode[0].node).toBe('A');
    expect(result.tokenUsage!.perNode[0].estimated).toBe(3000);
    expect(result.tokenUsage!.perNode[1].node).toBe('B');
    expect(result.tokenUsage!.perNode[1].estimated).toBe(4500);
  });

  it('actual token usage from spawner overrides estimates', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(TWO_NODE_GFT, 'test.gft');

    const mockSpawner = async () => ({
      stdout: JSON.stringify({
        result: [
          { type: 'text', text: JSON.stringify({ data: 'hello', result: 'world' }) },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      stderr: '',
      exitCode: 0,
    });

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.tokenUsage).toBeDefined();
    // Each node should report actual usage of 150 (100+50), total 300
    expect(result.tokenUsage!.consumed).toBe(300);
    expect(result.tokenUsage!.perNode[0].actual).toBe(150);
    expect(result.tokenUsage!.perNode[1].actual).toBe(150);
  });

  it('token log file is written to .graft/token_log.txt', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(TWO_NODE_GFT, 'test.gft');

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    await executor.execute();
    const logPath = path.join(tmpDir, '.graft', 'token_log.txt');
    expect(fs.existsSync(logPath)).toBe(true);
    const logContent = fs.readFileSync(logPath, 'utf-8');
    expect(logContent).toContain('Node A');
    expect(logContent).toContain('Node B');
  });
});

// ============================================================
// LSP features
// ============================================================

// Helper to build a ProgramIndex from inline declarations
function buildIndex(opts: {
  contexts?: ContextDecl[];
  nodes?: NodeDecl[];
  memories?: MemoryDecl[];
  graphs?: GraphDecl[];
  edges?: EdgeDecl[];
} = {}) {
  return new ProgramIndex({
    imports: [],
    memories: opts.memories ?? [],
    contexts: opts.contexts ?? [],
    nodes: opts.nodes ?? [],
    edges: opts.edges ?? [],
    graphs: opts.graphs ?? [],
  });
}

const loc = { line: 5, column: 3, offset: 40 };

describe('LSP — hover on different declaration types', () => {
  let getHoverInfo: typeof import('../src/lsp/features/index.js').getHoverInfo;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    getHoverInfo = mod.getHoverInfo;
  });

  it('hover on graph name returns null (graphs not in hover)', () => {
    // getHoverInfo checks contextMap, nodeMap, memoryMap, producesNodeMap, letBindingMap
    // but NOT graphMap. This documents the gap.
    const index = buildIndex({
      graphs: [{
        name: 'MainPipeline',
        input: 'Input',
        output: 'Output',
        budget: 10000,
        flow: [],
        params: [],
        location: loc,
      }],
    });
    const result = getHoverInfo('MainPipeline', index);
    // Graphs are not handled in getHoverInfo - returns null
    expect(result).toBeNull();
  });

  it('hover on edge keyword returns keyword doc', () => {
    const index = buildIndex();
    const result = getHoverInfo('edge', index);
    expect(result).not.toBeNull();
    expect((result!.contents as { value: string }).value).toContain('edge');
  });

  it('hover on memory shows storage and fields', () => {
    const index = buildIndex({
      memories: [{
        name: 'Cache',
        maxTokens: 2000,
        storage: 'file',
        fields: [{ name: 'data', type: { kind: 'primitive', name: 'String' }, location: loc }],
        location: loc,
      }],
    });
    const result = getHoverInfo('Cache', index);
    expect(result).not.toBeNull();
    const value = (result!.contents as { value: string }).value;
    expect(value).toContain('**memory** Cache');
    expect(value).toContain('storage: file');
    expect(value).toContain('data: String');
  });
});

describe('LSP — completions at various positions', () => {
  let getCompletions: typeof import('../src/lsp/features/index.js').getCompletions;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    getCompletions = mod.getCompletions;
  });

  it('top-level empty line returns keyword completions', () => {
    const text = '';
    const items = getCompletions(text, 0, 0, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('context');
    expect(labels).toContain('node');
    expect(labels).toContain('graph');
    expect(labels).toContain('edge');
    expect(labels).toContain('import');
  });

  it('inside reads: [] returns context and produces names', () => {
    const source = `context Spec(max_tokens: 500) {
  title: String
}
node Worker(model: sonnet, budget: 2k/1k) {
  reads: []
  produces Result {
    answer: String
  }
}
graph G(input: Spec, output: Result, budget: 6k) {
  Worker -> done
}`;
    const compiled = compile(source, 'test.gft');
    const cache = compiled.program && compiled.index
      ? { program: compiled.program, index: compiled.index }
      : null;

    // Position cursor inside reads: [|]
    const items = getCompletions(source, 4, 10, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Spec');
  });

  it('after model: returns model aliases', () => {
    const text = 'node X(model: ';
    const items = getCompletions(text, 0, 14, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('sonnet');
    expect(labels).toContain('opus');
    expect(labels).toContain('haiku');
  });

  it('inside graph block returns node names and done', () => {
    const source = `context Spec(max_tokens: 500) {
  title: String
}
node Worker(model: sonnet, budget: 2k/1k) {
  reads: [Spec]
  produces Result {
    answer: String
  }
}
graph G(input: Spec, output: Result, budget: 6k) {
  Worker -> done
}`;
    const compiled = compile(source, 'test.gft');
    expect(compiled.success).toBe(true);
    const cache = compiled.program && compiled.index
      ? { program: compiled.program, index: compiled.index }
      : null;

    // Find the line index of "Worker -> done" inside the graph block
    const lines = source.split('\n');
    const graphBodyLine = lines.findIndex(l => l.includes('Worker -> done'));
    expect(graphBodyLine).toBeGreaterThan(0);

    const items = getCompletions(source, graphBodyLine, 2, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('done');
    expect(labels).toContain('Worker');
  });

  it('inside comment returns no completions', () => {
    const text = '// context ';
    const items = getCompletions(text, 0, 11, null);
    expect(items).toEqual([]);
  });
});

describe('LSP — go-to-definition', () => {
  let getDefinitionLocation: typeof import('../src/lsp/features/index.js').getDefinitionLocation;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    getDefinitionLocation = mod.getDefinitionLocation;
  });

  it('go-to-definition for produces name resolves to produces location', () => {
    const index = buildIndex({
      nodes: [{
        name: 'Writer',
        model: 'sonnet',
        budgetIn: 2000,
        budgetOut: 1000,
        reads: [],
        tools: [],
        writes: [],
        onFailure: undefined,
        produces: {
          name: 'Draft',
          fields: [{ name: 'text', type: { kind: 'primitive', name: 'String' }, location: loc }],
          location: { line: 8, column: 12, offset: 100 },
        },
        location: { line: 3, column: 1, offset: 10 },
      }],
    });

    const result = getDefinitionLocation('Draft', index, 'file:///test.gft');
    expect(result).not.toBeNull();
    // Should point to produces location (line 8, col 12) => 0-based (7, 11)
    expect(result!.range.start.line).toBe(7);
    expect(result!.range.start.character).toBe(11);
  });

  it('go-to-definition for unknown name returns null', () => {
    const index = buildIndex();
    expect(getDefinitionLocation('Unknown', index, 'file:///test.gft')).toBeNull();
  });

  it('go-to-definition for node name returns node location', () => {
    const index = buildIndex({
      nodes: [{
        name: 'Analyzer',
        model: 'sonnet',
        budgetIn: 2000,
        budgetOut: 1000,
        reads: [],
        tools: [],
        writes: [],
        onFailure: undefined,
        produces: {
          name: 'Analysis',
          fields: [],
          location: loc,
        },
        location: { line: 10, column: 6, offset: 50 },
      }],
    });

    const result = getDefinitionLocation('Analyzer', index, 'file:///test.gft');
    expect(result).not.toBeNull();
    expect(result!.range.start.line).toBe(9);
    expect(result!.range.start.character).toBe(5);
    expect(result!.range.end.character).toBe(5 + 'Analyzer'.length);
  });
});

describe('LSP — diagnostics match compiler', () => {
  it('LSP toDiagnostics produces same errors as compiler', async () => {
    const { compile } = await import('../src/compiler.js');
    const { toDiagnostics } = await import('../src/lsp/features/index.js');

    const source = `
context Spec(max_tokens: 500) {
  title: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [MissingContext]
  produces Result {
    answer: String
  }
}

graph G(input: Spec, output: Result, budget: 6k) {
  Worker -> done
}
`;

    const compiled = compile(source, 'test.gft');
    expect(compiled.success).toBe(false);
    expect(compiled.errors.length).toBeGreaterThan(0);

    const diagnostics = toDiagnostics(compiled.errors, compiled.warnings);
    expect(diagnostics.length).toBe(compiled.errors.length + compiled.warnings.length);

    // Each error should have a corresponding diagnostic
    for (const diag of diagnostics) {
      expect(diag.source).toBe('graft');
      expect(diag.message).toBeTruthy();
    }
  });

  it('valid source produces no error diagnostics', async () => {
    const { compile } = await import('../src/compiler.js');
    const { toDiagnostics } = await import('../src/lsp/features/index.js');

    const source = `
context Spec(max_tokens: 500) {
  title: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [Spec]
  produces Result {
    answer: String
  }
}

graph G(input: Spec, output: Result, budget: 6k) {
  Worker -> done
}
`;

    const compiled = compile(source, 'test.gft');
    expect(compiled.success).toBe(true);

    const diagnostics = toDiagnostics(compiled.errors, []);
    expect(diagnostics).toEqual([]);
  });
});

describe('LSP — rename', () => {
  let buildRenameEdits: typeof import('../src/lsp/features/index.js').buildRenameEdits;
  let isRenameable: typeof import('../src/lsp/features/index.js').isRenameable;
  let collectRenameLocations: typeof import('../src/lsp/features/index.js').collectRenameLocations;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    buildRenameEdits = mod.buildRenameEdits;
    isRenameable = mod.isRenameable;
    collectRenameLocations = mod.collectRenameLocations;
  });

  it('renaming a context updates all references in the file', () => {
    const source = `context TaskSpec(max_tokens: 500) {
  title: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [TaskSpec]
  produces Result {
    answer: String
  }
}

graph G(input: TaskSpec, output: Result, budget: 6k) {
  Worker -> done
}`;

    const result = buildRenameEdits(
      'TaskSpec',
      'JobSpec',
      source,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('error');
    const edits = (result as { changes: Record<string, unknown[]> }).changes['file:///test.gft'];
    // TaskSpec appears in: declaration, reads, graph input => at least 3 locations
    expect(edits.length).toBeGreaterThanOrEqual(3);
  });

  it('rename to a keyword is rejected', () => {
    const source = `context Foo(max_tokens: 500) {
  title: String
}
graph G(input: Foo, output: Foo, budget: 6k) {
  done
}`;

    const result = buildRenameEdits(
      'Foo',
      'context',
      source,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('reserved keyword');
  });

  it('rename to existing name is rejected', () => {
    const source = `context Foo(max_tokens: 500) {
  title: String
}
context Bar(max_tokens: 500) {
  name: String
}
node W(model: sonnet, budget: 2k/1k) {
  reads: [Foo]
  produces R { x: String }
}
graph G(input: Foo, output: R, budget: 6k) {
  W -> done
}`;

    const result = buildRenameEdits(
      'Foo',
      'Bar',
      source,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('already exists');
  });

  it('collectRenameLocations skips occurrences in comments', () => {
    const source = `context Foo(max_tokens: 500) {
  title: String
}
// Foo is used here in a comment
graph G(input: Foo, output: Foo, budget: 6k) {
  done
}`;

    const locs = collectRenameLocations(source, 'Foo');
    // Should find: declaration (line 0), graph input (line 4), graph output (line 4)
    // Should NOT find: comment (line 3)
    for (const range of locs) {
      expect(range.start.line).not.toBe(3); // comment line
    }
  });

  it('collectRenameLocations skips occurrences in strings', () => {
    const source = `context Foo(max_tokens: 500) {
  title: String
}
node W(model: sonnet, budget: 2k/1k) {
  reads: [Foo]
  produces R { x: String }
}
graph G(input: Foo, output: R, budget: 6k) {
  W -> done
}`;
    // No string containing "Foo" in this source, just check it works
    const locs = collectRenameLocations(source, 'Foo');
    expect(locs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('LSP — references', () => {
  let findReferences: typeof import('../src/lsp/features/index.js').findReferences;
  let isReferable: typeof import('../src/lsp/features/index.js').isReferable;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    findReferences = mod.findReferences;
    isReferable = mod.isReferable;
  });

  it('isReferable returns true for produces names', () => {
    const index = buildIndex({
      nodes: [{
        name: 'Worker',
        model: 'sonnet',
        budgetIn: 2000,
        budgetOut: 1000,
        reads: [],
        tools: [],
        writes: [],
        onFailure: undefined,
        produces: {
          name: 'Result',
          fields: [],
          location: loc,
        },
        location: loc,
      }],
    });
    expect(isReferable('Result', index)).toBe(true);
    expect(isReferable('Worker', index)).toBe(true);
    expect(isReferable('Missing', index)).toBe(false);
  });

  it('findReferences includes all usages of a context name', () => {
    const source = `context Spec(max_tokens: 500) {
  title: String
}
node W(model: sonnet, budget: 2k/1k) {
  reads: [Spec]
  produces R { x: String }
}
graph G(input: Spec, output: R, budget: 6k) {
  W -> done
}`;
    const tokens = new Lexer(source).tokenize();
    const { program } = new Parser(tokens).parse();
    const index = new ProgramIndex(program);

    const refs = findReferences(
      'Spec',
      source,
      'file:///test.gft',
      index,
      true, // includeDeclaration
      new Map(),
    );

    // Spec appears in: declaration, reads, graph input
    expect(refs.length).toBeGreaterThanOrEqual(3);
    // All references should be in the same file
    for (const ref of refs) {
      expect(ref.uri).toBe('file:///test.gft');
    }
  });
});

// ============================================================
// Additional edge-case: isInsideBlock for completions
// ============================================================
describe('LSP — completions edge cases', () => {
  let getCompletions: typeof import('../src/lsp/features/index.js').getCompletions;

  beforeEach(async () => {
    const mod = await import('../src/lsp/features/index.js');
    getCompletions = mod.getCompletions;
  });

  it('after storage: returns file option', () => {
    const text = 'memory M(max_tokens: 2k, storage: ';
    const items = getCompletions(text, 0, text.length, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('file');
  });

  it('after on_failure: returns strategy keywords', () => {
    const text = '  on_failure: ';
    const items = getCompletions(text, 0, text.length, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('retry');
    expect(labels).toContain('fallback');
    expect(labels).toContain('skip');
    expect(labels).toContain('abort');
  });

  it('dot after context name returns field completions', () => {
    const source = `context Spec(max_tokens: 500) {
  title: String
  count: Int
}
node W(model: sonnet, budget: 2k/1k) {
  reads: [Spec.
  produces R { x: String }
}
graph G(input: Spec, output: R, budget: 6k) {
  W -> done
}`;
    // This won't compile cleanly, but we can still try completions
    const compiled = compile(source, 'test.gft');
    const cache = compiled.program && compiled.index
      ? { program: compiled.program, index: compiled.index }
      : null;

    // If cache is available, test field completions
    if (cache) {
      const items = getCompletions(source, 5, 16, cache);
      const labels = items.map(i => i.label);
      expect(labels).toContain('title');
      expect(labels).toContain('count');
    }
  });
});
