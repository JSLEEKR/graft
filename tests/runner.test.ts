import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { mkCond } from './helpers.js';

// --- Transform tests ---
describe('transforms', () => {
  // Lazy import to verify module exists
  let applyTransforms: typeof import('../src/runtime/transforms.js').applyTransforms;
  let evalCondition: typeof import('../src/runtime/transforms.js').evalCondition;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    applyTransforms = mod.applyTransforms;
    evalCondition = mod.evalCondition;
  });

  it('select picks specified fields', () => {
    const data = { a: 1, b: 2, c: 3 };
    const result = applyTransforms(data, [{ type: 'select', fields: ['a', 'c'] }]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('select ignores missing fields', () => {
    const data = { a: 1 };
    const result = applyTransforms(data, [{ type: 'select', fields: ['a', 'missing'] }]);
    expect(result).toEqual({ a: 1 });
  });

  it('filter keeps matching items', () => {
    const data = { items: [{ score: 5 }, { score: 8 }, { score: 3 }] };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('score', '>=', 5),
    }]);
    expect(result).toEqual({ items: [{ score: 5 }, { score: 8 }] });
  });

  it('filter on non-array field returns object unchanged', () => {
    const data = { items: 'not an array' };
    const result = applyTransforms(data, [{
      type: 'filter', field: 'items',
      condition: mkCond('score', '>=', 5),
    }]);
    expect(result).toEqual({ items: 'not an array' });
  });

  it('drop removes a field', () => {
    const data = { a: 1, b: 2, c: 3 };
    const result = applyTransforms(data, [{ type: 'drop', field: 'b' }]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('compact removes nulls, empty strings, empty arrays, empty objects', () => {
    const data = {
      a: 1,
      b: null,
      c: '',
      d: [],
      e: {},
      f: { nested: null, keep: 'yes' },
    };
    const result = applyTransforms(data, [{ type: 'compact' }]);
    expect(result).toEqual({ a: 1, f: { keep: 'yes' } });
  });

  it('truncate shortens large string data', () => {
    const longStr = 'x'.repeat(10000);
    const data = { content: longStr };
    const result = applyTransforms(data, [{ type: 'truncate', tokens: 100 }]) as Record<string, unknown>;
    expect((result.content as string).length).toBeLessThan(longStr.length);
  });

  it('truncate leaves small data unchanged', () => {
    const data = { content: 'short' };
    const result = applyTransforms(data, [{ type: 'truncate', tokens: 1000 }]);
    expect(result).toEqual({ content: 'short' });
  });

  it('pipeline of transforms applied in order', () => {
    const data = { a: 1, b: null, c: 3, d: 4 };
    const result = applyTransforms(data, [
      { type: 'drop', field: 'd' },
      { type: 'compact' },
      { type: 'select', fields: ['a', 'c'] },
    ]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('returns null/undefined input as-is', () => {
    expect(applyTransforms(null, [{ type: 'compact' }])).toBeNull();
    expect(applyTransforms(undefined, [{ type: 'compact' }])).toBeUndefined();
  });

  it('returns primitive input as-is', () => {
    expect(applyTransforms(42, [{ type: 'compact' }])).toBe(42);
  });
});

describe('evalCondition', () => {
  let evalCondition: typeof import('../src/runtime/transforms.js').evalCondition;

  beforeEach(async () => {
    const mod = await import('../src/runtime/transforms.js');
    evalCondition = mod.evalCondition;
  });

  it('== operator', () => {
    expect(evalCondition({ status: 'ok' }, mkCond('status', '==', 'ok'))).toBe(true);
    expect(evalCondition({ status: 'fail' }, mkCond('status', '==', 'ok'))).toBe(false);
  });

  it('!= operator', () => {
    expect(evalCondition({ status: 'fail' }, mkCond('status', '!=', 'ok'))).toBe(true);
  });

  it('> operator', () => {
    expect(evalCondition({ score: 8 }, mkCond('score', '>', 5))).toBe(true);
    expect(evalCondition({ score: 5 }, mkCond('score', '>', 5))).toBe(false);
  });

  it('>= operator', () => {
    expect(evalCondition({ score: 5 }, mkCond('score', '>=', 5))).toBe(true);
  });

  it('< operator', () => {
    expect(evalCondition({ score: 3 }, mkCond('score', '<', 5))).toBe(true);
  });

  it('<= operator', () => {
    expect(evalCondition({ score: 5 }, mkCond('score', '<=', 5))).toBe(true);
  });

  it('returns false for non-object items', () => {
    expect(evalCondition('not-object', mkCond('x', '==', 1))).toBe(false);
    expect(evalCondition(null, mkCond('x', '==', 1))).toBe(false);
  });
});

// --- extractJson tests ---
describe('extractJson', () => {
  let extractJson: typeof import('../src/runtime/subprocess.js').extractJson;

  beforeEach(async () => {
    const mod = await import('../src/runtime/subprocess.js');
    extractJson = mod.extractJson;
  });

  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON with surrounding whitespace', () => {
    expect(extractJson('  \n{"a":1}\n  ')).toEqual({ a: 1 });
  });

  it('extracts JSON from prefixed output', () => {
    expect(extractJson('Some text before\n{"result":"ok"}\nSome text after')).toEqual({ result: 'ok' });
  });

  it('extracts arrays', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('throws on invalid content', () => {
    expect(() => extractJson('no json here')).toThrow(/Failed to parse JSON/);
  });
});

// --- Executor tests ---
describe('Executor', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  const SIMPLE_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node Analyzer(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Analysis {
    result: String
  }
}

graph SimpleRun(input: UserRequest, output: Analysis, budget: 6k) {
  Analyzer -> done
}
`;

  const PARALLEL_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node A(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces AOut {
    data: String
  }
}

node B(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces BOut {
    data: String
  }
}

node C(model: sonnet, budget: 2k/1k) {
  reads: [AOut, BOut]
  produces COut {
    merged: String
  }
}

edge A -> C
edge B -> C
graph ParallelRun(input: UserRequest, output: COut, budget: 10k) {
  parallel { A, B } -> C -> done
}
`;

  const FOREACH_GFT = `
context Items(max_tokens: 1k) {
  list: List<String>
}

node Planner(model: sonnet, budget: 1k/500) {
  reads: [Items]
  produces Plan {
    steps: List<String>
  }
}

node Processor(model: haiku, budget: 1k/500) {
  reads: [Plan]
  produces ProcessedItem {
    value: String
  }
}

graph ForeachRun(input: Items, output: ProcessedItem, budget: 10k) {
  Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {
    Processor
  } -> done
}
`;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function compileSource(source: string) {
    // Use the real compiler
    const { compile } = require('../src/compiler.js');
    return compile(source, 'test.gft');
  }

  it('single-node dry-run produces result', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');
    expect(compiled.success).toBe(true);

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(result.nodeResults.length).toBe(1);
    expect(result.nodeResults[0].node).toBe('Analyzer');
    expect(result.nodeResults[0].success).toBe(true);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('dry-run writes output to session directory', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    await executor.execute();
    const sessionDir = path.join(tmpDir, '.graft', 'session', 'node_outputs');
    expect(fs.existsSync(sessionDir)).toBe(true);
  });

  it('mock spawner receives correct args', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const calls: Array<{ args: string[] }> = [];
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      calls.push({ args: opts.args });
      return {
        stdout: JSON.stringify({ result: 'mock-output' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(calls.length).toBe(1);
    // Should use --output-format json for structured output
    expect(calls[0].args).toContain('--output-format');
  });

  it('parallel nodes execute concurrently via mock', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(PARALLEL_GFT, 'test.gft');

    const callOrder: string[] = [];
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      // Extract node name from prompt
      const promptArg = opts.args.find(a => a.includes('Agent'));
      const nodeName = promptArg?.match(/# (\w+) Agent/)?.[1] ?? 'unknown';
      callOrder.push(nodeName);
      return {
        stdout: JSON.stringify({ data: `from-${nodeName}`, merged: 'result' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    // A and B should both run, then C
    expect(result.nodeResults.length).toBe(3);
  });

  it('foreach iterates over items', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(FOREACH_GFT, 'test.gft');
    expect(compiled.success).toBe(true);

    let callCount = 0;
    const mockSpawner = async () => {
      callCount++;
      if (callCount === 1) {
        // First call is Planner, return steps
        return {
          stdout: JSON.stringify({ steps: ['step-a', 'step-b', 'step-c'] }),
          stderr: '',
          exitCode: 0,
        };
      }
      // Subsequent calls are Processor iterations
      return {
        stdout: JSON.stringify({ value: `processed-${callCount}` }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { list: ['a', 'b', 'c'] },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    // 1 Planner + 3 Processor iterations = 4
    expect(callCount).toBe(4);
  });

  it('edge transforms are applied between nodes', async () => {
    const TRANSFORM_GFT = `
context UserRequest(max_tokens: 500) {
  question: String
}

node A(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces AOut {
    keep: String
    drop_me: String
    extra: String
  }
}

node B(model: sonnet, budget: 2k/1k) {
  reads: [AOut]
  produces BOut {
    result: String
  }
}

edge A -> B
  | select(keep, extra)
  | drop(extra)

graph TransformRun(input: UserRequest, output: BOut, budget: 6k) {
  A -> B -> done
}
`;
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(TRANSFORM_GFT, 'test.gft');

    let bInput: unknown = null;
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      const promptArg = opts.args.find(a => a.includes('Agent'));
      if (promptArg?.includes('B Agent')) {
        // Read what was passed as context to B
        const sessionDir = path.join(opts.cwd, '.graft', 'session', 'node_outputs');
        if (fs.existsSync(path.join(sessionDir, 'a_transformed_for_b.json'))) {
          bInput = JSON.parse(fs.readFileSync(path.join(sessionDir, 'a_transformed_for_b.json'), 'utf-8'));
        } else if (fs.existsSync(path.join(sessionDir, 'aout.json'))) {
          bInput = JSON.parse(fs.readFileSync(path.join(sessionDir, 'aout.json'), 'utf-8'));
        }
      }
      return {
        stdout: JSON.stringify({ keep: 'kept', drop_me: 'dropped', extra: 'extra', result: 'done' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
  });

  it('session cleanup before each run', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    // Create a stale session file
    const sessionDir = path.join(tmpDir, '.graft', 'session', 'node_outputs');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'stale.json'), '{}');
    // Also create .gitkeep
    fs.writeFileSync(path.join(sessionDir, '.gitkeep'), '');

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    await executor.execute();
    // Stale file should be removed
    expect(fs.existsSync(path.join(sessionDir, 'stale.json'))).toBe(false);
    // .gitkeep should be preserved
    expect(fs.existsSync(path.join(sessionDir, '.gitkeep'))).toBe(true);
  });

  it('abort on node failure', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const mockSpawner = async () => {
      return {
        stdout: 'garbage output not json',
        stderr: 'something went wrong',
        exitCode: 1,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// --- run() integration tests ---
describe('run()', () => {
  let run: typeof import('../src/runner.js').run;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import('../src/runner.js');
    run = mod.run;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-run-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns error for missing source file', async () => {
    const result = await run({ sourceFile: '/nonexistent/file.gft' });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('returns error for invalid source', async () => {
    const srcFile = path.join(tmpDir, 'bad.gft');
    fs.writeFileSync(srcFile, 'this is not valid gft syntax @@@@');
    const result = await run({ sourceFile: srcFile });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('dry-run end-to-end with valid source', async () => {
    const srcFile = path.join(tmpDir, 'test.gft');
    fs.writeFileSync(srcFile, `
context UserRequest(max_tokens: 500) {
  question: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Result {
    answer: String
  }
}

graph TestGraph(input: UserRequest, output: Result, budget: 6k) {
  Worker -> done
}
`);
    const inputFile = path.join(tmpDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify({ question: 'hello' }));

    const result = await run({
      sourceFile: srcFile,
      inputFile,
      dryRun: true,
    });
    expect(result.success).toBe(true);
    expect(result.graph).toBe('TestGraph');
    expect(result.nodeResults.length).toBe(1);
  });

  it('returns error for missing input file', async () => {
    const srcFile = path.join(tmpDir, 'test.gft');
    fs.writeFileSync(srcFile, `
context UserRequest(max_tokens: 500) {
  question: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Result {
    answer: String
  }
}

graph TestGraph(input: UserRequest, output: Result, budget: 6k) {
  Worker -> done
}
`);
    const result = await run({
      sourceFile: srcFile,
      inputFile: '/nonexistent/input.json',
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('returns error for malformed input JSON', async () => {
    const srcFile = path.join(tmpDir, 'test.gft');
    fs.writeFileSync(srcFile, `
context UserRequest(max_tokens: 500) {
  question: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Result {
    answer: String
  }
}

graph TestGraph(input: UserRequest, output: Result, budget: 6k) {
  Worker -> done
}
`);
    const inputFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(inputFile, 'not json {{{');

    const result = await run({
      sourceFile: srcFile,
      inputFile,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('parse');
  });
});

// --- Executor memory tests ---
describe('Executor — memory support', () => {
  let Executor: typeof import('../src/runtime/executor.js').Executor;
  let tmpDir: string;

  const MEMORY_GFT = `
memory UserProfile(max_tokens: 2k, storage: file) {
  preferences: String
  name: String
}

context Spec(max_tokens: 500) {
  question: String
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [Spec, UserProfile]
  writes: [UserProfile]
  produces Result {
    answer: String
    name: String
  }
}

graph MemRun(input: Spec, output: Result, budget: 6k) {
  Worker -> done
}
`;

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-mem-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('memory load — file exists, returns parsed JSON in context', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');
    expect(compiled.success).toBe(true);

    // Pre-populate memory file
    const memDir = path.join(tmpDir, '.graft', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'userprofile.json'), JSON.stringify({ preferences: { theme: 'dark' }, name: 'Alice' }));

    let promptSeen = '';
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      const pIdx = opts.args.indexOf('-p');
      if (pIdx >= 0) promptSeen = opts.args[pIdx + 1];
      return {
        stdout: JSON.stringify({ answer: 'done', name: 'Alice' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    // The prompt should contain the memory data
    expect(promptSeen).toContain('dark');
  });

  it('memory load — file missing (first run), context shows no data', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    let promptSeen = '';
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      const pIdx = opts.args.indexOf('-p');
      if (pIdx >= 0) promptSeen = opts.args[pIdx + 1];
      return {
        stdout: JSON.stringify({ answer: 'done', name: 'Bob' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(promptSeen).toContain('No data available');
  });

  it('memory load — corrupted JSON, returns null gracefully', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    // Write corrupted JSON
    const memDir = path.join(tmpDir, '.graft', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'userprofile.json'), '{broken json!!!');

    let promptSeen = '';
    const mockSpawner = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      const pIdx = opts.args.indexOf('-p');
      if (pIdx >= 0) promptSeen = opts.args[pIdx + 1];
      return {
        stdout: JSON.stringify({ answer: 'done', name: 'Bob' }),
        stderr: '',
        exitCode: 0,
      };
    };

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    // Corrupted memory = null = deleted from outputs = "No data available"
    expect(promptSeen).toContain('No data available');
  });

  it('memory save — writes to .graft/memory/<name>.json after node execution', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    const mockSpawner = async () => ({
      stdout: JSON.stringify({ answer: 'done', name: 'Alice' }),
      stderr: '',
      exitCode: 0,
    });

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    await executor.execute();
    const memFile = path.join(tmpDir, '.graft', 'memory', 'userprofile.json');
    expect(fs.existsSync(memFile)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(memFile, 'utf-8'));
    expect(saved.name).toBe('Alice');
  });

  it('memory save — field-matching merge preserves unrelated fields', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    // Pre-populate memory with existing data
    const memDir = path.join(tmpDir, '.graft', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'userprofile.json'), JSON.stringify({ preferences: { theme: 'dark' }, name: 'OldName' }));

    const mockSpawner = async () => ({
      // Node output only has 'name', not 'preferences'
      stdout: JSON.stringify({ answer: 'done', name: 'NewName' }),
      stderr: '',
      exitCode: 0,
    });

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner,
    });

    await executor.execute();
    const memFile = path.join(tmpDir, '.graft', 'memory', 'userprofile.json');
    const saved = JSON.parse(fs.readFileSync(memFile, 'utf-8'));
    // name updated, preferences preserved
    expect(saved.name).toBe('NewName');
    expect(saved.preferences).toEqual({ theme: 'dark' });
  });

  it('dry run — does NOT write memory files', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    await executor.execute();
    const memFile = path.join(tmpDir, '.graft', 'memory', 'userprofile.json');
    expect(fs.existsSync(memFile)).toBe(false);
  });

  it('memory not cleaned by session cleanup', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    // Pre-populate memory
    const memDir = path.join(tmpDir, '.graft', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'userprofile.json'), JSON.stringify({ name: 'Persist' }));

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    await executor.execute();
    // Memory file should still exist after session cleanup
    expect(fs.existsSync(path.join(memDir, 'userprofile.json'))).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(memDir, 'userprofile.json'), 'utf-8'));
    expect(saved.name).toBe('Persist');
  });

  it('memory persists across executor instances', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(MEMORY_GFT, 'test.gft');

    // Run 1: write memory
    const mockSpawner1 = async () => ({
      stdout: JSON.stringify({ answer: 'run1', name: 'FirstRun' }),
      stderr: '',
      exitCode: 0,
    });
    const exec1 = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      spawner: mockSpawner1,
    });
    await exec1.execute();

    // Run 2: read memory from previous run
    let promptSeen = '';
    const mockSpawner2 = async (opts: { args: string[]; cwd: string; timeoutMs: number }) => {
      const pIdx = opts.args.indexOf('-p');
      if (pIdx >= 0) promptSeen = opts.args[pIdx + 1];
      return {
        stdout: JSON.stringify({ answer: 'run2', name: 'SecondRun' }),
        stderr: '',
        exitCode: 0,
      };
    };
    const exec2 = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test2' },
      workDir: tmpDir,
      spawner: mockSpawner2,
    });
    await exec2.execute();

    // Second run should see first run's memory data
    expect(promptSeen).toContain('FirstRun');
  });
});
