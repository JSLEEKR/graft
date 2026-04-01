import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { compileToProgram } from '../src/compiler.js';
import { Executor, RunOptions } from '../src/runtime/executor.js';
import { generate } from '../src/codegen/codegen.js';
import { ClaudeCodeBackend } from '../src/codegen/claude-backend.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- End-to-end pipeline integration ---

describe('v3.0-R8: end-to-end pipeline', () => {
  const FULL_PROGRAM = `
    context Spec(max_tokens: 1k) {
      task: String
      priority: Int
    }

    memory Log(max_tokens: 2k, storage: file) {
      entry: String
      count: Int
    }

    node Analyzer(model: sonnet, budget: 5k/2k) {
      reads: [Spec.{task, priority}]
      writes: [Log.entry]
      on_failure: retry(2)
      produces Analysis {
        findings: List<String>
        score: Float(0..1)
      }
    }

    node Synthesizer(model: haiku, budget: 3k/1k) {
      reads: [Analysis]
      on_failure: skip
      produces Summary { result: String }
    }

    edge Analyzer -> Synthesizer | select(findings)

    graph Pipeline(input: Spec, output: Summary, budget: 20k) {
      Analyzer -> Synthesizer -> done
    }
  `;

  it('compileToProgram processes full v3.0 syntax', () => {
    const result = compileToProgram(FULL_PROGRAM, 'test.gft');
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('ProgramIndex has all maps populated', () => {
    const program = parse(FULL_PROGRAM);
    const index = new ProgramIndex(program);

    expect(index.contextMap.has('Spec')).toBe(true);
    expect(index.nodeMap.has('Analyzer')).toBe(true);
    expect(index.nodeMap.has('Synthesizer')).toBe(true);
    expect(index.memoryMap.has('Log')).toBe(true);
    expect(index.graphMap.has('Pipeline')).toBe(true);
    expect(index.producesFieldsMap.has('Analysis')).toBe(true);
    expect(index.memoryFieldsMap.has('Log')).toBe(true);
  });

  it('ScopeChecker passes for valid v3.0 program', () => {
    const program = parse(FULL_PROGRAM);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('TypeChecker passes with ProgramIndex', () => {
    const program = parse(FULL_PROGRAM);
    const index = new ProgramIndex(program);
    const checker = new TypeChecker(program, index);
    const errors = checker.check();
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('codegen with explicit ClaudeCodeBackend matches default', () => {
    const program = parse(FULL_PROGRAM);
    const index = new ProgramIndex(program);
    const report = new TokenEstimator(program).estimate();

    const defaultFiles = generate(program, report, 'test.gft', index);
    const explicitFiles = generate(program, report, 'test.gft', index, new ClaudeCodeBackend());

    expect(defaultFiles.length).toBe(explicitFiles.length);
    for (let i = 0; i < defaultFiles.length; i++) {
      expect(defaultFiles[i].path).toBe(explicitFiles[i].path);
      // Settings file has compiled_at timestamp that may differ by ms
      if (defaultFiles[i].path.includes('settings')) {
        const strip = (s: string) => s.replace(/"compiled_at":\s*"[^"]*"/, '"compiled_at": "STRIPPED"');
        expect(strip(defaultFiles[i].content)).toBe(strip(explicitFiles[i].content));
      } else {
        expect(defaultFiles[i].content).toBe(explicitFiles[i].content);
      }
    }
  });
});

// --- Failure strategies integration ---

describe('v3.0-R8: failure strategies integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-r8-'));
    fs.mkdirSync(path.join(tmpDir, '.graft', 'session', 'node_outputs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retry strategy succeeds after transient failure via executor', async () => {
    const program = parse(`
      context Spec(max_tokens: 500) { task: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: retry(3)
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 10k) { A -> done }
    `);

    let attempts = 0;
    const executor = new Executor(program, {
      sourceFile: 'test.gft',
      input: { task: 'test' },
      workDir: tmpDir,
      dryRun: false,
      spawner: async () => {
        attempts++;
        if (attempts < 3) {
          return { stdout: '', stderr: 'transient', exitCode: 1 };
        }
        return {
          stdout: JSON.stringify([{ type: 'result', result: JSON.stringify({ result: 'ok' }), duration_ms: 10, is_error: false, total_cost_usd: 0.001 }]),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    const result = await executor.execute();
    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('skip strategy allows pipeline to continue past failed node', async () => {
    const program = parse(`
      context Spec(max_tokens: 500) { task: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: skip
        produces OutA { result: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutB, budget: 10k) { A -> B -> done }
    `);

    const executor = new Executor(program, {
      sourceFile: 'test.gft',
      input: { task: 'test' },
      workDir: tmpDir,
      dryRun: false,
      spawner: async (opts) => {
        // A fails, B succeeds
        if (opts.args.includes('You are the A node')) {
          return { stdout: '', stderr: 'fail', exitCode: 1 };
        }
        return {
          stdout: JSON.stringify([{ type: 'result', result: JSON.stringify({ result: 'from B' }), duration_ms: 10, is_error: false, total_cost_usd: 0.001 }]),
          stderr: '',
          exitCode: 0,
        };
      },
    });

    const result = await executor.execute();
    // skip doesn't push errors, so pipeline continues
    expect(result.success).toBe(true);
  });
});

// --- WriteRef field-level writes integration ---

describe('v3.0-R8: WriteRef field-level writes', () => {
  it('WriteRef with field parsed correctly', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      memory Log(max_tokens: 2k, storage: file) {
        entry: String
        count: Int
      }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        writes: [Log.entry]
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 20k) { A -> done }
    `);
    expect(program.nodes[0].writes).toHaveLength(1);
    expect(program.nodes[0].writes[0].memory).toBe('Log');
    expect(program.nodes[0].writes[0].field).toBe('entry');
  });

  it('ScopeChecker catches invalid field-level write', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      memory Log(max_tokens: 2k, storage: file) {
        entry: String
        count: Int
      }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        writes: [Log.nonexistent]
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FIELD_NOT_FOUND')).toBe(true);
  });
});

// --- Multi-field reads integration ---

describe('v3.0-R8: multi-field reads integration', () => {
  it('multi-field read with brace syntax parsed correctly', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) {
        task: String
        priority: Int
      }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec.{task, priority}]
        produces Out { result: String }
      }
      graph G(input: Spec, output: Out, budget: 20k) { A -> done }
    `);
    const ref = program.nodes[0].reads[0];
    expect(ref.field).toEqual(['task', 'priority']);
  });
});

// --- PARSE_ error codes integration ---

describe('v3.0-R8: parse error codes in compileToProgram', () => {
  it('parse errors have structured codes', () => {
    const result = compileToProgram('node {', 'test.gft');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('PARSE_UNEXPECTED_TOKEN');
  });
});

// --- SourceLocation length propagation ---

describe('v3.0-R8: SourceLocation length propagation', () => {
  it('parser-emitted locations carry length from tokens', () => {
    const program = parse(`
      context MyContext(max_tokens: 1k) { task: String }
    `);
    // The context location should have length from the 'context' keyword token
    expect(program.contexts[0].location.length).toBeDefined();
  });
});
