import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// --- parseCLIOutput tests ---
describe('parseCLIOutput', () => {
  let parseCLIOutput: typeof import('../src/runtime/subprocess.js').parseCLIOutput;

  beforeEach(async () => {
    const mod = await import('../src/runtime/subprocess.js');
    parseCLIOutput = mod.parseCLIOutput;
  });

  it('structured output with usage: returns unwrapped content + tokenUsage', () => {
    const stdout = JSON.stringify({
      result: '{"answer":"hello"}',
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-sonnet-4-20250514',
    });
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ answer: 'hello' });
    expect(out.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('structured output without usage: returns content, tokenUsage undefined', () => {
    const stdout = JSON.stringify({
      result: '{"answer":"hello"}',
      model: 'claude-sonnet-4-20250514',
    });
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ answer: 'hello' });
    expect(out.tokenUsage).toBeUndefined();
  });

  it('raw JSON without metadata fields: falls to extractJson (backward compat)', () => {
    const stdout = JSON.stringify({ answer: 'test' });
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ answer: 'test' });
    expect(out.tokenUsage).toBeUndefined();
  });

  it('result is string containing JSON: inner JSON parsed', () => {
    const stdout = JSON.stringify({
      result: '{"nested":"value"}',
      model: 'test-model',
    });
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ nested: 'value' });
  });

  it('result is object (not string): returned as-is', () => {
    const stdout = JSON.stringify({
      result: { direct: 'object' },
      model: 'test-model',
    });
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ direct: 'object' });
  });

  it('non-JSON text: falls to extractJson', () => {
    const stdout = 'Some preamble\n{"answer":"found"}\nSome postamble';
    const out = parseCLIOutput(stdout);
    expect(out.content).toEqual({ answer: 'found' });
    expect(out.tokenUsage).toBeUndefined();
  });
});

// --- TokenTracker tests ---
describe('TokenTracker', () => {
  let TokenTracker: typeof import('../src/runtime/token-tracker.js').TokenTracker;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import('../src/runtime/token-tracker.js');
    TokenTracker = mod.TokenTracker;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-tracker-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('record with actual: consumed = inputTokens + outputTokens', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('NodeA', { inputTokens: 200, outputTokens: 100 }, { in: 500, out: 300 });
    expect(tracker.totalConsumed).toBe(300); // actual: 200+100
  });

  it('record without actual: consumed = estimated in + out', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('NodeA', undefined, { in: 500, out: 300 });
    expect(tracker.totalConsumed).toBe(800); // estimated: 500+300
  });

  it('cumulative across multiple records', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('A', { inputTokens: 100, outputTokens: 50 }, { in: 200, out: 100 });
    tracker.record('B', { inputTokens: 200, outputTokens: 100 }, { in: 400, out: 200 });
    expect(tracker.totalConsumed).toBe(450); // 150 + 300
  });

  it('isWarning at exactly 80%', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('A', { inputTokens: 5000, outputTokens: 3000 }, { in: 0, out: 0 });
    expect(tracker.totalConsumed).toBe(8000);
    expect(tracker.isWarning).toBe(true);
    expect(tracker.isCritical).toBe(false);
  });

  it('isCritical at exactly 90%', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('A', { inputTokens: 5000, outputTokens: 4000 }, { in: 0, out: 0 });
    expect(tracker.totalConsumed).toBe(9000);
    expect(tracker.isCritical).toBe(true);
  });

  it('not warning below 80%', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('A', { inputTokens: 3000, outputTokens: 1000 }, { in: 0, out: 0 });
    expect(tracker.totalConsumed).toBe(4000);
    expect(tracker.isWarning).toBe(false);
    expect(tracker.isCritical).toBe(false);
  });

  it('fraction is 0 when budget is 0', () => {
    const tracker = new TokenTracker(0);
    tracker.record('A', { inputTokens: 100, outputTokens: 50 }, { in: 0, out: 0 });
    expect(tracker.fraction).toBe(0);
  });

  it('getSummary returns correct structure', () => {
    const tracker = new TokenTracker(10000);
    tracker.record('A', { inputTokens: 100, outputTokens: 50 }, { in: 200, out: 100 });
    tracker.record('B', undefined, { in: 300, out: 200 });
    const summary = tracker.getSummary();
    expect(summary.budget).toBe(10000);
    expect(summary.consumed).toBe(650); // 150 actual + 500 estimated
    expect(summary.fraction).toBeCloseTo(0.065);
    expect(summary.perNode).toHaveLength(2);
    expect(summary.perNode[0]).toEqual({ node: 'A', actual: 150, estimated: 300 });
    expect(summary.perNode[1]).toEqual({ node: 'B', actual: undefined, estimated: 500 });
  });

  it('log file created with entries in correct format', () => {
    const logPath = path.join(tmpDir, 'token_log.txt');
    const tracker = new TokenTracker(10000, logPath);
    tracker.record('NodeA', { inputTokens: 100, outputTokens: 50 }, { in: 200, out: 100 });
    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('Node NodeA');
    expect(content).toContain('estimated: 300');
    expect(content).toContain('actual: 150');
    expect(content).toContain('cumulative: 150/10000');
  });
});

// --- Executor token tracking integration tests ---
describe('Executor — token tracking', () => {
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

  beforeEach(async () => {
    const mod = await import('../src/runtime/executor.js');
    Executor = mod.Executor;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-token-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('RunResult includes tokenUsage after dry run', async () => {
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
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.budget).toBe(6000);
    expect(result.tokenUsage!.consumed).toBeGreaterThan(0);
    expect(typeof result.tokenUsage!.fraction).toBe('number');
  });

  it('tokenUsage.perNode entries match executed nodes', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const executor = new Executor(compiled.program!, {
      sourceFile: 'test.gft',
      input: { question: 'test' },
      workDir: tmpDir,
      dryRun: true,
    });

    const result = await executor.execute();
    expect(result.tokenUsage!.perNode).toHaveLength(1);
    expect(result.tokenUsage!.perNode[0].node).toBe('Analyzer');
    expect(result.tokenUsage!.perNode[0].estimated).toBe(3000); // 2k in + 1k out
  });

  it('token log file created with entries', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

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
    expect(logContent).toContain('Node Analyzer');
  });

  it('mock spawner with CLI envelope returns tokenUsage in NodeResult', async () => {
    const { compile } = await import('../src/compiler.js');
    const compiled = compile(SIMPLE_GFT, 'test.gft');

    const mockSpawner = async () => ({
      stdout: JSON.stringify({
        result: '{"result":"mock-output"}',
        usage: { input_tokens: 500, output_tokens: 200 },
        model: 'claude-sonnet-4-20250514',
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
    expect(result.nodeResults[0].tokenUsage).toEqual({
      inputTokens: 500,
      outputTokens: 200,
    });
    expect(result.tokenUsage!.perNode[0].actual).toBe(700);
  });
});
