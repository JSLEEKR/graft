import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { compileToProgram } from '../src/compiler.js';
import { getCompletions } from '../src/lsp/features/index.js';
import { Executor } from '../src/runtime/executor.js';
import { formatTokenReport } from '../src/format.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().program;
}

// ========================================
// 1. LSP completion integration (end-to-end)
// ========================================

describe('v3.1-R5: LSP completion integration', () => {
  const FULL_SOURCE = `
    context TaskSpec(max_tokens: 1k) {
      title: String
      priority: Int
    }

    memory Log(max_tokens: 2k, storage: file) {
      entry: String
      count: Int
    }

    node Analyzer(model: sonnet, budget: 5k/2k) {
      reads: [TaskSpec.{title, priority}]
      writes: [Log.entry]
      on_failure: retry(2)
      produces Analysis {
        findings: List<String>
        score: Float(0..1)
      }
    }

    node Summarizer(model: haiku, budget: 3k/1k) {
      reads: [Analysis]
      on_failure: skip
      produces Summary { result: String }
    }

    edge Analyzer -> Summarizer | select(findings)

    graph Pipeline(input: TaskSpec, output: Summary, budget: 20k) {
      Analyzer -> Summarizer -> done
    }
  `;

  it('end-to-end: parse source -> build ProgramIndex -> getCompletions at various positions', () => {
    const result = compileToProgram(FULL_SOURCE, 'test.gft');
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
    const cache = { program: result.program!, index: result.index! };

    // Top-level keyword completions
    const topLevel = getCompletions(FULL_SOURCE, 0, 0, cache);
    const topLabels = topLevel.map(i => i.label);
    expect(topLabels).toContain('context');
    expect(topLabels).toContain('node');

    // Field completions after dot: reads: [TaskSpec.
    const dotLine = '  reads: [TaskSpec.';
    const dotItems = getCompletions(dotLine, 0, dotLine.length, cache);
    const dotLabels = dotItems.map(i => i.label);
    expect(dotLabels).toContain('title');
    expect(dotLabels).toContain('priority');

    // Memory field completions: writes: [Log.
    const writeDotLine = '  writes: [Log.';
    const writeItems = getCompletions(writeDotLine, 0, writeDotLine.length, cache);
    const writeLabels = writeItems.map(i => i.label);
    expect(writeLabels).toContain('entry');
    expect(writeLabels).toContain('count');
  });

  it('completions with null cache still returns keyword completions', () => {
    const items = getCompletions('', 0, 0, null);
    const labels = items.map(i => i.label);
    expect(labels).toContain('context');
    expect(labels).toContain('node');
    expect(labels).toContain('memory');
    expect(labels).toContain('graph');
    expect(labels).toContain('edge');
    expect(labels).toContain('import');
  });

  it('field completion through full pipeline: compileToProgram -> ProgramIndex -> getCompletions', () => {
    const result = compileToProgram(FULL_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    const cache = { program: result.program!, index: result.index! };

    // Produces field completions
    const producesLine = '  reads: [Analysis.';
    const producesItems = getCompletions(producesLine, 0, producesLine.length, cache);
    const producesLabels = producesItems.map(i => i.label);
    expect(producesLabels).toContain('findings');
    expect(producesLabels).toContain('score');

    // reads: [ should offer all readable names
    const readsLine = '  reads: [';
    const readsItems = getCompletions(readsLine, 0, readsLine.length, cache);
    const readsLabels = readsItems.map(i => i.label);
    expect(readsLabels).toContain('TaskSpec');
    expect(readsLabels).toContain('Analysis');
    expect(readsLabels).toContain('Log');
  });
});

// ========================================
// 2. Parallel + failure strategy integration
// ========================================

describe('v3.1-R5: parallel + failure strategy integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-r5-'));
    fs.mkdirSync(path.join(tmpDir, '.graft', 'session', 'node_outputs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parallel block with mixed failure strategies (retry + skip) via Executor', async () => {
    const program = parse(`
      context Spec(max_tokens: 500) { task: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: retry(2)
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        on_failure: skip
        produces OutB { result: String }
      }
      node C(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces OutC { result: String }
      }
      graph G(input: Spec, output: OutC, budget: 10k) {
        parallel { A B } -> C -> done
      }
    `);

    let aAttempts = 0;
    const executor = new Executor(program, {
      sourceFile: 'test.gft',
      input: { task: 'test' },
      workDir: tmpDir,
      dryRun: false,
      spawner: async (opts) => {
        const prompt = opts.args.join(' ');
        if (prompt.includes('You are the A node')) {
          aAttempts++;
          if (aAttempts < 2) {
            return { stdout: '', stderr: 'transient error', exitCode: 1 };
          }
          return {
            stdout: JSON.stringify([{ type: 'result', result: JSON.stringify({ result: 'from A' }), duration_ms: 10, is_error: false, total_cost_usd: 0.001 }]),
            stderr: '',
            exitCode: 0,
          };
        }
        if (prompt.includes('You are the B node')) {
          // B always fails, but has skip strategy
          return { stdout: '', stderr: 'permanent failure', exitCode: 1 };
        }
        // C succeeds
        return {
          stdout: JSON.stringify([{ type: 'result', result: JSON.stringify({ result: 'from C' }), duration_ms: 10, is_error: false, total_cost_usd: 0.001 }]),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    const result = await executor.execute();
    // A should retry and succeed; B should skip; C should succeed
    expect(result.success).toBe(true);
    expect(aAttempts).toBeGreaterThanOrEqual(2);
  });

  it('parallel block where node without strategy aborts on failure', async () => {
    const program = parse(`
      context Spec(max_tokens: 500) { task: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 10k) {
        parallel { A B } -> done
      }
    `);

    const executor = new Executor(program, {
      sourceFile: 'test.gft',
      input: { task: 'test' },
      workDir: tmpDir,
      dryRun: false,
      spawner: async (opts) => {
        const prompt = opts.args.join(' ');
        if (prompt.includes('You are the A node')) {
          return { stdout: '', stderr: 'hard failure', exitCode: 1 };
        }
        return {
          stdout: JSON.stringify([{ type: 'result', result: JSON.stringify({ result: 'from B' }), duration_ms: 10, is_error: false, total_cost_usd: 0.001 }]),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    const result = await executor.execute();
    // No failure strategy on A => pipeline should fail
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ========================================
// 3. Fallback cycle detection integration
// ========================================

describe('v3.1-R5: fallback cycle detection integration', () => {
  it('compileToProgram detects self-referencing fallback cycle', () => {
    const source = `
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        on_failure: fallback(A)
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 20k) { A -> done }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toBe(true);
  });

  it('compileToProgram detects mutual fallback cycle (A->B->A)', () => {
    const source = `
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
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'SCOPE_FALLBACK_CYCLE')).toBe(true);
  });
});

// ========================================
// 4. API surface integration
// ========================================

describe('v3.1-R5: API surface integration', () => {
  it('src/types.ts exports key types and values', async () => {
    const types = await import('../src/types.js');

    // GraftError is the only non-type export -- verify it is a constructor
    expect(types.GraftError).toBeDefined();
    expect(typeof types.GraftError).toBe('function');

    // Construct a GraftError to verify usability
    const err = new types.GraftError('test error', { line: 1, column: 1, offset: 0 }, 'error', 'PARSE_UNEXPECTED_TOKEN');
    expect(err.message).toBe('test error');
    expect(err.code).toBe('PARSE_UNEXPECTED_TOKEN');
  });

  it('ProgramIndex from compiled program works with getCompletions', () => {
    const source = `
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 20k) { A -> done }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.index).toBeDefined();

    const cache = { program: result.program!, index: result.index! };

    // Use the index with getCompletions -- field completions for Spec
    const line = '  reads: [Spec.';
    const items = getCompletions(line, 0, line.length, cache);
    const labels = items.map(i => i.label);
    expect(labels).toContain('task');

    // Graph flow completions should offer node names
    const graphLine = 'graph X(input: Spec, output: Out, budget: 10k) {\n  ';
    const graphItems = getCompletions(graphLine, 1, 2, cache);
    const graphLabels = graphItems.map(i => i.label);
    expect(graphLabels).toContain('done');
    expect(graphLabels).toContain('A');
  });
});

// ========================================
// 5. Tech debt verification: formatTokenReport
// ========================================

describe('v3.1-R5: formatTokenReport output format', () => {
  it('produces expected output format with node lines and path summary', () => {
    const source = `
      context Spec(max_tokens: 1k) { task: String }
      node Analyzer(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces Analysis { result: String }
      }
      node Writer(model: haiku, budget: 3k/1k) {
        reads: [Analysis]
        produces Draft { text: String }
      }
      graph G(input: Spec, output: Draft, budget: 20k) {
        Analyzer -> Writer -> done
      }
    `;
    const program = parse(source);
    const index = new ProgramIndex(program);
    const report = new TokenEstimator(program, index).estimate();
    const output = formatTokenReport(report);

    // Should contain node names
    expect(output).toContain('Analyzer');
    expect(output).toContain('Writer');

    // Should contain "in ~" and "out ~" columns
    expect(output).toContain('in ~');
    expect(output).toContain('out ~');

    // Should contain best/worst path summary
    expect(output).toContain('Best path:');
    expect(output).toContain('Worst path:');
    expect(output).toContain('tokens');

    // With showBudget option, should include budget comparison
    const budgetOutput = formatTokenReport(report, { showBudget: true });
    expect(budgetOutput).toContain('budget');
    expect(budgetOutput).toMatch(/within|exceeds/);
  });
});
