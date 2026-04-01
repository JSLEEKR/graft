import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { KEYWORDS } from '../src/lexer/tokens.js';

const root = resolve(import.meta.dirname, '..');

function readJSON(relPath: string): Record<string, unknown> {
  const content = readFileSync(resolve(root, relPath), 'utf-8');
  return JSON.parse(content);
}

describe('packaging', () => {
  describe('package.json', () => {
    it('has correct exports and files fields', () => {
      const pkg = readJSON('package.json');

      // exports
      const exports = pkg.exports as Record<string, Record<string, string>>;
      expect(exports['.']).toEqual({
        import: './dist/index.js',
        types: './dist/index.d.ts',
      });
      expect(exports['./ast']).toEqual({
        import: './dist/parser/ast.js',
        types: './dist/parser/ast.d.ts',
      });

      // files
      expect(pkg.files).toEqual(['dist/', 'README.md', 'LICENSE']);

      // other required fields
      expect(pkg.name).toBe('@graft-lang/graft');
      expect(pkg.license).toBe('MIT');
      expect(pkg.main).toBe('./dist/index.js');
      expect(pkg.types).toBe('./dist/index.d.ts');
    });
  });

  describe('VS Code extension', () => {
    it('package.json has required fields', () => {
      const pkg = readJSON('editors/vscode/package.json');

      expect(pkg.name).toBe('graft-lang');
      expect(pkg.version).toBeDefined();
      expect(pkg.engines).toBeDefined();
      expect((pkg.engines as Record<string, string>).vscode).toBeDefined();
      expect(pkg.main).toBe('./out/extension.js');

      const contributes = pkg.contributes as Record<string, unknown[]>;
      expect(contributes.languages).toBeDefined();
      expect(contributes.languages.length).toBeGreaterThan(0);
      expect(contributes.grammars).toBeDefined();
      expect(contributes.grammars.length).toBeGreaterThan(0);
    });

    it('TextMate grammar is valid JSON with all keywords from tokens.ts', () => {
      const grammar = readJSON('editors/vscode/syntaxes/graft.tmGrammar.json');

      expect(grammar.scopeName).toBe('source.graft');
      expect(grammar.repository).toBeDefined();

      const repo = grammar.repository as Record<string, { name?: string; match?: string }>;

      // Extract keywords from the grammar's keyword match pattern
      const keywordMatch = repo.keywords.match as string;
      expect(keywordMatch).toBeDefined();

      // Get all lowercase keywords from tokens.ts (exclude type keywords, domain types, true/false)
      const typeKeywords = ['String', 'Int', 'Float', 'Bool', 'List', 'Map', 'Optional', 'TokenBounded'];
      const domainTypes = ['FilePath', 'FileDiff', 'TestFile', 'IssueRef'];
      const constants = ['true', 'false'];
      const excluded = new Set([...typeKeywords, ...domainTypes, ...constants]);

      const expectedKeywords = Object.keys(KEYWORDS).filter(k => !excluded.has(k));

      for (const kw of expectedKeywords) {
        expect(keywordMatch, `keyword "${kw}" missing from grammar`).toContain(kw);
      }

      // Verify type keywords are in their own pattern
      const typeMatch = repo['type-keywords'].match as string;
      for (const tk of typeKeywords) {
        expect(typeMatch, `type keyword "${tk}" missing from grammar`).toContain(tk);
      }

      // Verify domain types are in their own pattern
      const domainMatch = repo['domain-types'].match as string;
      for (const dt of domainTypes) {
        expect(domainMatch, `domain type "${dt}" missing from grammar`).toContain(dt);
      }

      // Verify k-integers appear before integers in patterns array
      const patterns = grammar.patterns as { include: string }[];
      const kIntIdx = patterns.findIndex(p => p.include === '#k-integers');
      const intIdx = patterns.findIndex(p => p.include === '#integers');
      expect(kIntIdx).toBeLessThan(intIdx);
    });

    it('language-configuration.json has correct comment syntax', () => {
      const config = readJSON('editors/vscode/language-configuration.json');

      const comments = config.comments as { lineComment: string; blockComment: string[] };
      expect(comments.lineComment).toBe('//');
      expect(comments.blockComment).toEqual(['/*', '*/']);
    });
  });
});
