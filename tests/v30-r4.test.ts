import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- ProgramIndex Field Maps ---

describe('v3.0-R4: ProgramIndex field maps', () => {
  it('producesFieldsMap stores field types by node name', () => {
    const program = parse(`
      node A(model: sonnet, budget: 5k/2k) {
        reads: []
        produces OutA {
          result: String
          score: Float
        }
      }
    `);
    const index = new ProgramIndex(program);
    const fields = index.producesFieldsMap.get('A');
    expect(fields).toBeDefined();
    expect(fields!.size).toBe(2);
    expect(fields!.get('result')!.kind).toBe('primitive');
    expect(fields!.get('score')!.kind).toBe('primitive');
  });

  it('producesFieldsMap also accessible by produces name', () => {
    const program = parse(`
      node A(model: sonnet, budget: 5k/2k) {
        reads: []
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    expect(index.producesFieldsMap.get('OutA')).toBeDefined();
    expect(index.producesFieldsMap.get('OutA')!.has('result')).toBe(true);
  });

  it('memoryFieldsMap stores field types by memory name', () => {
    const program = parse(`
      memory Log(max_tokens: 2k, storage: file) {
        entry: String
        count: Int
      }
    `);
    const index = new ProgramIndex(program);
    const fields = index.memoryFieldsMap.get('Log');
    expect(fields).toBeDefined();
    expect(fields!.size).toBe(2);
    expect(fields!.get('entry')!.kind).toBe('primitive');
    expect(fields!.get('count')!.kind).toBe('primitive');
  });

  it('returns undefined for non-existent entries', () => {
    const program = parse(`
      node A(model: sonnet, budget: 5k/2k) {
        reads: []
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    expect(index.producesFieldsMap.get('Nonexistent')).toBeUndefined();
    expect(index.memoryFieldsMap.get('Nonexistent')).toBeUndefined();
  });
});

// --- ScopeChecker uses ProgramIndex ---

describe('v3.0-R4: ScopeChecker uses ProgramIndex field maps', () => {
  it('validates produces field references via index', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA.nonexistent]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'SCOPE_FIELD_NOT_FOUND' && e.message.includes('nonexistent'))).toBe(true);
  });

  it('passes for valid produces field references', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA.result]
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new ScopeChecker(program, index);
    const errors = checker.check();
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });
});

// --- TypeChecker with ProgramIndex ---

describe('v3.0-R4: TypeChecker with ProgramIndex', () => {
  it('accepts ProgramIndex parameter', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    const checker = new TypeChecker(program, index);
    const errors = checker.check();
    expect(errors).toHaveLength(0);
  });

  it('works without ProgramIndex (backward compat)', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
    `);
    const checker = new TypeChecker(program);
    const errors = checker.check();
    expect(errors).toHaveLength(0);
  });

  it('detects edge transform on nonexistent field via index', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      edge A -> B | select(nonexistent)
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const checker = new TypeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'TYPE_FIELD_NOT_FOUND')).toBe(true);
  });

  it('warns on schema mismatch using index field maps', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      memory Log(max_tokens: 2k, storage: file) { uniqueField: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        writes: [Log]
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    const checker = new TypeChecker(program, index);
    const errors = checker.check();
    expect(errors.some(e => e.code === 'TYPE_SCHEMA_MISMATCH')).toBe(true);
  });
});

// --- TYPE_WRITE_FIELD_OVERLAP ---

describe('v3.0-R4: TYPE_WRITE_FIELD_OVERLAP error code', () => {
  it('error code exists in GraftErrorCode union', async () => {
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'warning', 'TYPE_WRITE_FIELD_OVERLAP');
    expect(err.code).toBe('TYPE_WRITE_FIELD_OVERLAP');
  });
});
