import { describe, it, expect } from 'vitest';

describe('v3.1-R4: Programmatic API Surface', () => {
  describe('src/types.ts barrel exports', () => {
    it('exports Program type', async () => {
      const mod = await import('../src/types.js');
      // Program is a type-only export, so it won't be in the runtime module
      // But GraftError is a class, so it should be importable
      expect(mod.GraftError).toBeDefined();
      expect(typeof mod.GraftError).toBe('function');
    });

    it('exports GraftError as a constructable class', async () => {
      const mod = await import('../src/types.js');
      const err = new mod.GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'PARSE_UNEXPECTED_TOKEN');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('test');
    });

    it('re-exports are consistent with source modules', async () => {
      const types = await import('../src/types.js');
      const diagnostics = await import('../src/errors/diagnostics.js');
      expect(types.GraftError).toBe(diagnostics.GraftError);
    });
  });

  describe('compiler module exports', () => {
    it('exports compileToProgram from compiler', async () => {
      const mod = await import('../src/compiler.js');
      expect(typeof mod.compileToProgram).toBe('function');
      expect(typeof mod.compile).toBe('function');
      expect(typeof mod.compileAndGenerate).toBe('function');
      expect(typeof mod.compileAndWrite).toBe('function');
    });

    it('compileToProgram produces a valid ProgramResult', async () => {
      const { compileToProgram } = await import('../src/compiler.js');
      const result = compileToProgram('context Foo(max_tokens: 1k) { name: String }', 'test.gft');
      expect(result.success).toBe(true);
      expect(result.program).toBeDefined();
      expect(result.errors).toEqual([]);
    });
  });

  describe('runtime module exports', () => {
    it('exports Executor class from runtime/executor', async () => {
      const mod = await import('../src/runtime/executor.js');
      expect(mod.Executor).toBeDefined();
      expect(typeof mod.Executor).toBe('function');
    });
  });

  describe('existing exports still work', () => {
    it('ast subpath exports are intact', async () => {
      const mod = await import('../src/parser/ast.js');
      expect(mod).toBeDefined();
    });
  });

  describe('package.json exports structure', () => {
    it('has all required export entries', async () => {
      const fs = await import('node:fs');
      const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['./ast']).toBeDefined();
      expect(pkg.exports['./compiler']).toEqual({
        import: './dist/compiler.js',
        types: './dist/compiler.d.ts',
      });
      expect(pkg.exports['./runtime']).toEqual({
        import: './dist/runtime/executor.js',
        types: './dist/runtime/executor.d.ts',
      });
      expect(pkg.exports['./types']).toEqual({
        import: './dist/types.js',
        types: './dist/types.d.ts',
      });
    });
  });
});
