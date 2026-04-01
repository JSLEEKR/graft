import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { compile } from '../src/compiler.js';
import { resolve } from '../src/resolver/resolver.js';
import { Program } from '../src/parser/ast.js';
import { GraftError, GraftErrorCode } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

function findByCode(errors: GraftError[], code: GraftErrorCode): GraftError | undefined {
  return errors.find(e => e.code === code);
}

describe('GraftError code field', () => {
  it('code is optional and undefined by default', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 });
    expect(err.code).toBeUndefined();
  });

  it('code is set when provided as 4th param', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING');
    expect(err.code).toBe('GRAPH_MISSING');
  });

  it('severity defaults to error when code provided', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, undefined, 'GRAPH_MISSING');
    expect(err.severity).toBe('error');
  });
});

describe('ScopeChecker error codes', () => {
  it('SCOPE_UNDEFINED_REF on unknown reads reference', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_UNDEFINED_REF')).toBeDefined();
  });

  it('SCOPE_FIELD_NOT_FOUND on invalid partial read field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec.nonexistent]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_FIELD_NOT_FOUND')).toBeDefined();
  });

  it('SCOPE_INVALID_WRITES on writes to non-memory', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [NonExistentMem]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_INVALID_WRITES')).toBeDefined();
  });

  it('SCOPE_DUPLICATE_NAME on memory/context collision', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      memory Spec(max_tokens: 1k, storage: file) { data: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_DUPLICATE_NAME')).toBeDefined();
  });

  it('SCOPE_MAX_TOKENS_INVALID on zero max_tokens', () => {
    const program = parse(`
      context Spec(max_tokens: 0) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_MAX_TOKENS_INVALID')).toBeDefined();
  });

  it('SCOPE_PARALLEL_WRITES warning on parallel memory conflict', () => {
    const program = parse(`
      memory Log(max_tokens: 1k, storage: file) { data: String }
      context Spec(max_tokens: 500) { q: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces BOut { data: String }
      }
      graph G(input: Spec, output: AOut, budget: 4k) {
        parallel { A, B } -> done
      }
    `);
    const errors = new ScopeChecker(program).check();
    const warning = findByCode(errors, 'SCOPE_PARALLEL_WRITES');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });
});

describe('TypeChecker error codes', () => {
  it('TYPE_FIELD_NOT_FOUND on select with invalid field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [AOut]
        produces BOut { r: String }
      }
      edge A -> B | select(nonexistent)
      graph G(input: Spec, output: BOut, budget: 4k) { A -> B -> done }
    `);
    const errors = new TypeChecker(program).check();
    expect(findByCode(errors, 'TYPE_FIELD_NOT_FOUND')).toBeDefined();
  });

  it('TYPE_SCHEMA_MISMATCH on writes with no field overlap', () => {
    const program = parse(`
      memory Log(max_tokens: 1k, storage: file) { history: String }
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces Out { unrelated: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new TypeChecker(program).check();
    const warning = findByCode(errors, 'TYPE_SCHEMA_MISMATCH');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });
});

describe('Resolver error codes', () => {
  it('IMPORT_INVALID_PATH on non-.gft import', () => {
    const program = parse('import { Foo } from "./bar.txt"');
    const result = resolve(program, 'test.gft', () => { throw new Error('not found'); });
    expect(findByCode(result.errors, 'IMPORT_INVALID_PATH')).toBeDefined();
  });

  it('IMPORT_NOT_FOUND on missing file', () => {
    const program = parse('import { Foo } from "./missing.gft"');
    const result = resolve(program, 'test.gft', () => { throw new Error('ENOENT'); });
    expect(findByCode(result.errors, 'IMPORT_NOT_FOUND')).toBeDefined();
  });

  it('IMPORT_NAME_NOT_FOUND on missing export', () => {
    const program = parse('import { NonExistent } from "./lib.gft"');
    const result = resolve(program, 'test.gft', () => 'context Foo(max_tokens: 100) { x: String }');
    expect(findByCode(result.errors, 'IMPORT_NAME_NOT_FOUND')).toBeDefined();
  });
});

describe('Compiler error codes', () => {
  it('GRAPH_MISSING when no graph declared', () => {
    const result = compile(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
    `, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('GRAPH_MISSING');
  });
});

describe('Estimator error codes', () => {
  it('BUDGET_EXCEEDED when worst case exceeds budget', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 1k) { N -> done }
    `);
    const report = new TokenEstimator(program).estimate();
    expect(findByCode(report.warnings, 'BUDGET_EXCEEDED')).toBeDefined();
  });
});
