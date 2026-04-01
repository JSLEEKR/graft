import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { generateAgent } from '../src/codegen/agents.js';
import { generateOrchestration } from '../src/codegen/orchestration.js';
import { ProgramIndex } from '../src/program-index.js';
import { compileToProgram, compileAndGenerate } from '../src/compiler.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- WriteRef Parsing ---

describe('v3.0-R2: WriteRef parsing', () => {
  it('parses writes as WriteRef objects with memory field', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { entry: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].writes).toHaveLength(1);
    expect(program.nodes[0].writes[0].memory).toBe('Log');
    expect(program.nodes[0].writes[0].location).toBeDefined();
  });

  it('parses writes with field-level targeting', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) {
        entry: String
        count: Int
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log.entry]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].writes[0]).toMatchObject({
      memory: 'Log',
      field: 'entry',
    });
  });

  it('parses multiple WriteRef targets', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { entry: String }
      memory Audit(max_tokens: 1k, storage: file) { action: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log, Audit.action]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].writes).toHaveLength(2);
    expect(program.nodes[0].writes[0]).toMatchObject({ memory: 'Log' });
    expect(program.nodes[0].writes[0].field).toBeUndefined();
    expect(program.nodes[0].writes[1]).toMatchObject({ memory: 'Audit', field: 'action' });
  });
});

// --- Multi-field Partial Reads ---

describe('v3.0-R2: multi-field partial reads', () => {
  it('parses single field as string array', () => {
    const program = parse(`
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Research.findings]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].reads[0].field).toEqual(['findings']);
  });

  it('parses multi-field brace syntax', () => {
    const program = parse(`
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Research.{findings, confidence}]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].reads[0].field).toEqual(['findings', 'confidence']);
  });

  it('parses full-context read (no field) as undefined', () => {
    const program = parse(`
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Research]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].reads[0].field).toBeUndefined();
  });

  it('mixed full and partial reads in same node', () => {
    const program = parse(`
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [TaskSpec, Research.findings]
        produces Result { text: String }
      }
    `);
    expect(program.nodes[0].reads[0].field).toBeUndefined();
    expect(program.nodes[0].reads[1].field).toEqual(['findings']);
  });
});

// --- Scope Validation ---

describe('v3.0-R2: scope validation for WriteRef', () => {
  it('errors on undeclared writes target', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Nonexistent]
        produces Result { text: String }
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_INVALID_WRITES')).toBe(true);
  });

  it('errors on invalid field in writes target', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { entry: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log.nonexistent]
        produces Result { text: String }
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FIELD_NOT_FOUND')).toBe(true);
  });

  it('validates multi-field partial reads against context schema', () => {
    const program = parse(`
      context Input(max_tokens: 1k) {
        question: String
        topic: String
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{question, badField}]
        produces Result { text: String }
      }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FIELD_NOT_FOUND' && e.message.includes('badField'))).toBe(true);
  });

  it('passes validation for correct multi-field reads', () => {
    const program = parse(`
      context Input(max_tokens: 1k) {
        question: String
        topic: String
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{question, topic}]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `);
    const checker = new ScopeChecker(program);
    const errors = checker.check();
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });
});

// --- Type Checker ---

describe('v3.0-R2: type checker with WriteRef', () => {
  it('warns on schema mismatch between produces and memory', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { uniqueField: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log]
        produces Result { text: String }
      }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'TYPE_SCHEMA_MISMATCH')).toBe(true);
  });
});

// --- Token Estimator ---

describe('v3.0-R2: estimator multi-field scaling', () => {
  it('scales multi-field reads by PARTIAL_FIELD_FACTOR * count', () => {
    const program = parse(`
      context Input(max_tokens: 1000) {
        q: String
        topic: String
        detail: String
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{q, topic}]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const nodeReport = report.nodes.find(n => n.name === 'Writer');
    // PARTIAL_FIELD_FACTOR = 0.3, 2 fields = 0.6, so 1000 * 0.6 = 600
    expect(nodeReport!.estimatedIn).toBe(600);
  });

  it('caps multi-field scaling at 1.0', () => {
    const program = parse(`
      context Input(max_tokens: 1000) {
        a: String
        b: String
        c: String
        d: String
        e: String
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{a, b, c, d, e}]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    const nodeReport = report.nodes.find(n => n.name === 'Writer');
    // 5 fields * 0.3 = 1.5, capped at 1.0 -> 1000
    expect(nodeReport!.estimatedIn).toBe(1000);
  });
});

// --- Codegen Formatting ---

describe('v3.0-R2: codegen formatting', () => {
  it('formats single-field reads with dot notation in agents', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { question: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.question]
        produces Result { text: String }
      }
    `);
    const memoryNames = new Set<string>();
    const output = generateAgent(program.nodes[0], memoryNames);
    expect(output).toContain('Input.question');
  });

  it('formats multi-field reads with brace notation in agents', () => {
    const program = parse(`
      context Input(max_tokens: 1k) {
        question: String
        topic: String
      }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{question, topic}]
        produces Result { text: String }
      }
    `);
    const memoryNames = new Set<string>();
    const output = generateAgent(program.nodes[0], memoryNames);
    expect(output).toContain('Input.{question, topic}');
  });

  it('formats WriteRef memory saves in agent output', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { text: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log]
        produces Result { text: String }
      }
    `);
    const memoryNames = new Set(program.memories.map(m => m.name));
    const output = generateAgent(program.nodes[0], memoryNames);
    expect(output).toContain('Memory Saving');
    expect(output).toContain('.graft/memory/log.json');
  });

  it('includes memory annotations in orchestration', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      memory Log(max_tokens: 2k, storage: file) { text: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const output = generateOrchestration(program, report);
    expect(output).toContain('Memory save: `.graft/memory/log.json`');
  });
});

// --- Integration ---

describe('v3.0-R2: integration', () => {
  it('compileToProgram handles WriteRef and multi-field reads', () => {
    const source = `
      context Input(max_tokens: 1k) {
        question: String
        topic: String
      }
      memory Log(max_tokens: 2k, storage: file) { text: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input.{question, topic}]
        writes: [Log]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.program!.nodes[0].writes[0].memory).toBe('Log');
    expect(result.program!.nodes[0].reads[0].field).toEqual(['question', 'topic']);
  });

  it('compileAndGenerate produces valid output with new types', () => {
    const source = `
      context Input(max_tokens: 1k) { question: String }
      memory Log(max_tokens: 2k, storage: file) { text: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [Log]
        produces Result { text: String }
      }
      graph G(input: Input, output: Result, budget: 20k) { Writer -> done }
    `;
    const result = compileAndGenerate(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.files!.length).toBeGreaterThan(0);
  });
});
