import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { compileToProgram } from '../src/compiler.js';
import { ProgramIndex } from '../src/program-index.js';
import { getCompletions, getHoverInfo } from '../src/lsp/features/index.js';

// ========================================
// 1. Parser error recovery integration
// ========================================
describe('parser error recovery integration', () => {
  it('file with multiple parse errors + valid declarations reports all errors and retains valid declarations', () => {
    const source = [
      'context ValidCtx(max_tokens: 1k) {',
      '  name: String',
      '}',
      '',
      'context Broken1(max_tokens: {) {',  // parse error: bad max_tokens
      '  x: String',
      '}',
      '',
      'context ValidCtx2(max_tokens: 2k) {',
      '  title: String',
      '}',
    ].join('\n');

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const { program, errors } = new Parser(tokens).parse();

    // Should have parse errors
    expect(errors.length).toBeGreaterThan(0);
    // Should retain valid declarations
    expect(program.contexts.length).toBeGreaterThanOrEqual(1);
    // The program object should always be non-null
    expect(program).toBeDefined();
    expect(program.contexts).toBeDefined();
  });

  it('broken first declaration + valid second: compiler returns errors plus program with valid declarations', () => {
    const source = [
      'context Broken(max_tokens: {invalid) {',  // parse error
      '  x: String',
      '}',
      '',
      'context Valid(max_tokens: 1k) {',
      '  name: String',
      '}',
    ].join('\n');

    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Even with parse errors, program should be returned
    expect(result.program).toBeDefined();
  });

  it('parse error in first decl + scope error in second: parse errors surfaced (compiler bails before scope check)', () => {
    // First declaration has parse error, second has a scope error (undefined ref).
    // Since compiler bails early on parse errors, only parse errors should appear.
    const source = [
      'context Broken(max_tokens: {) {',  // parse error
      '  x: String',
      '}',
      '',
      'node Worker(model: sonnet, budget: 5k/2k) {',
      '  reads: [NonExistentContext]',  // scope error - but compiler won't reach this
      '  produces Output {',
      '    result: String',
      '  }',
      '}',
      '',
      'graph Main(input: Broken, output: Output, budget: 10k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    // Parse errors should be present
    const parseErrors = result.errors.filter(e => e.code?.startsWith('PARSE_'));
    expect(parseErrors.length).toBeGreaterThan(0);
    // Scope errors should NOT be present (compiler bails early)
    const scopeErrors = result.errors.filter(e => e.code?.startsWith('SCOPE_'));
    expect(scopeErrors).toHaveLength(0);
  });
});

// ========================================
// 2. LSP polish integration
// ========================================
describe('LSP polish integration', () => {
  const loc = { line: 1, column: 1, offset: 0 };

  function buildIndex(opts: { contexts?: any[]; nodes?: any[]; memories?: any[] } = {}): ProgramIndex {
    return new ProgramIndex({
      imports: [],
      memories: opts.memories ?? [],
      contexts: opts.contexts ?? [],
      nodes: opts.nodes ?? [],
      edges: [],
      graphs: [],
    });
  }

  it('keyword hover vs ProgramIndex hover: "context" returns keyword docs, context name returns ProgramIndex info', () => {
    const index = buildIndex({
      contexts: [{
        name: 'TaskSpec',
        maxTokens: 1000,
        fields: [{ name: 'title', type: { kind: 'primitive', name: 'String' } }],
        location: loc,
      }],
    });

    // "context" keyword should return keyword docs
    const keywordHover = getHoverInfo('context', index);
    expect(keywordHover).not.toBeNull();
    expect((keywordHover!.contents as any).value).toContain('Declares a context schema');

    // "TaskSpec" should return ProgramIndex info
    const nameHover = getHoverInfo('TaskSpec', index);
    expect(nameHover).not.toBeNull();
    expect((nameHover!.contents as any).value).toContain('**context** TaskSpec');
    expect((nameHover!.contents as any).value).toContain('title');
  });

  it('storage completion and model completion do not interfere', () => {
    // After "storage: " -> should get "file"
    const storageItems = getCompletions('  storage: ', 0, 11, null);
    expect(storageItems.length).toBe(1);
    expect(storageItems[0].label).toBe('file');

    // After "model: " -> should get model aliases
    const modelItems = getCompletions('  model: ', 0, 9, null);
    expect(modelItems.length).toBeGreaterThanOrEqual(3); // sonnet, opus, haiku
    const labels = modelItems.map(i => i.label);
    expect(labels).toContain('sonnet');
    expect(labels).toContain('opus');
    expect(labels).toContain('haiku');
  });

  it('completions suppressed inside comments and strings', () => {
    // Inside single-line comment
    const commentItems = getCompletions('// model: ', 0, 10, null);
    expect(commentItems).toHaveLength(0);

    // Inside string literal
    const stringItems = getCompletions('  name: "model: "', 0, 15, null);
    expect(stringItems).toHaveLength(0);
  });

  it('import completion with callback returns names, without callback returns empty', () => {
    const importText = 'import { } from "./lib.gft"';
    // Cursor inside braces at position 9
    const withCallback = getCompletions(importText, 0, 9, null, (_path: string) => ['Foo', 'Bar']);
    expect(withCallback.length).toBe(2);
    expect(withCallback.map(i => i.label)).toEqual(['Foo', 'Bar']);

    // Without callback
    const withoutCallback = getCompletions(importText, 0, 9, null);
    expect(withoutCallback).toHaveLength(0);
  });
});

// ========================================
// 3. Backward compatibility sweep
// ========================================
describe('backward compatibility', () => {
  it('valid programs produce ParseResult with empty errors', () => {
    const source = [
      'context Input(max_tokens: 1k) {',
      '  query: String',
      '}',
      '',
      'node Worker(model: sonnet, budget: 5k/2k) {',
      '  reads: [Input]',
      '  produces Output {',
      '    result: String',
      '  }',
      '}',
      '',
      'graph Main(input: Input, output: Output, budget: 10k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const { program, errors } = new Parser(tokens).parse();

    expect(errors).toHaveLength(0);
    expect(program.contexts).toHaveLength(1);
    expect(program.nodes).toHaveLength(1);
    expect(program.graphs).toHaveLength(1);
  });

  it('compileToProgram returns success with correct program structure for valid input', () => {
    const source = [
      'context Input(max_tokens: 1k) {',
      '  query: String',
      '}',
      '',
      'node Worker(model: sonnet, budget: 5k/2k) {',
      '  reads: [Input]',
      '  produces Output {',
      '    result: String',
      '  }',
      '}',
      '',
      'graph Main(input: Input, output: Output, budget: 10k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.program!.contexts).toHaveLength(1);
    expect(result.program!.nodes).toHaveLength(1);
    expect(result.program!.graphs).toHaveLength(1);
    expect(result.index).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('all sub-path exports exist in package.json', () => {
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const expectedExports = ['.', './ast', './compiler', './runtime', './types', './format'];

    for (const exp of expectedExports) {
      expect(pkg.exports).toHaveProperty(exp);
      expect(pkg.exports[exp]).toHaveProperty('import');
      expect(pkg.exports[exp]).toHaveProperty('types');
    }
  });
});

// ========================================
// 4. Cross-feature interactions
// ========================================
describe('cross-feature interactions', () => {
  it('file with parse error still allows completions via cached valid state', () => {
    // Simulate: LSP has a cached valid program, then file gets parse error.
    // Completions should still work against the cached state.
    const loc = { line: 1, column: 1, offset: 0 };
    const program = {
      imports: [],
      memories: [],
      contexts: [{
        name: 'TaskInput',
        maxTokens: 1000,
        fields: [{ name: 'query', type: { kind: 'primitive' as const, name: 'String' } }],
        location: loc,
      }],
      nodes: [{
        name: 'Analyzer',
        model: 'sonnet',
        budgetIn: 5000,
        budgetOut: 2000,
        reads: [{ context: 'TaskInput' }],
        writes: [],
        produces: {
          name: 'Analysis',
          fields: [{ name: 'result', type: { kind: 'primitive' as const, name: 'String' } }],
          location: loc,
        },
        location: loc,
      }],
      edges: [],
      graphs: [],
    };
    const index = new ProgramIndex(program as any);
    const cache = { program: program as any, index };

    // Even with broken text, completions work from cache
    const brokenText = '  reads: [';
    const items = getCompletions(brokenText, 0, brokenText.length, cache);
    expect(items.length).toBeGreaterThan(0);
    const labels = items.map(i => i.label);
    expect(labels).toContain('TaskInput');
  });

  it('program with both parse-level and compile-level issues reports errors correctly', () => {
    // A program with parse errors should only show parse errors
    // (compiler bails before reaching analyzer)
    const withParseError = [
      'context A(max_tokens: {bad) {',
      '  x: String',
      '}',
    ].join('\n');

    const parseResult = compileToProgram(withParseError, 'test.gft');
    expect(parseResult.success).toBe(false);
    expect(parseResult.errors.length).toBeGreaterThan(0);
    // All errors should be parse-level
    for (const err of parseResult.errors) {
      if (err.code) {
        expect(err.code).toMatch(/^PARSE_/);
      }
    }

    // A valid-parse program with scope errors should show scope errors
    const withScopeError = [
      'node Worker(model: sonnet, budget: 5k/2k) {',
      '  reads: [NonExistent]',
      '  produces Output {',
      '    result: String',
      '  }',
      '}',
      '',
      'graph Main(input: NonExistent, output: Output, budget: 10k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const scopeResult = compileToProgram(withScopeError, 'test.gft');
    expect(scopeResult.success).toBe(false);
    expect(scopeResult.errors.length).toBeGreaterThan(0);
    // Should have scope errors (not parse errors)
    const scopeErrors = scopeResult.errors.filter(e => e.code?.startsWith('SCOPE_'));
    expect(scopeErrors.length).toBeGreaterThan(0);
  });
});
