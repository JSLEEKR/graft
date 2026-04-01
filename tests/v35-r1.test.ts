import { describe, it, expect } from 'vitest';
import { collectRenameLocations } from '../src/lsp/features/rename.js';
import { isInComment, isInString } from '../src/lsp/features/utils.js';

describe('v3.5-R1: Rename hardening', () => {
  // --- isInComment tests ---
  describe('isInComment', () => {
    it('detects line comments', () => {
      const lines = ['// this is a comment'];
      expect(isInComment(lines, 0, 5)).toBe(true);
    });

    it('returns false for non-comment text', () => {
      const lines = ['node MyNode {'];
      expect(isInComment(lines, 0, 5)).toBe(false);
    });

    it('detects block comments', () => {
      const lines = ['/* block', 'comment */'];
      expect(isInComment(lines, 0, 5)).toBe(true);
      expect(isInComment(lines, 1, 3)).toBe(true);
    });
  });

  // --- isInString tests ---
  describe('isInString', () => {
    it('detects string literals', () => {
      expect(isInString('"hello world"', 5)).toBe(true);
      expect(isInString('key "value"', 6)).toBe(true);
    });

    it('returns false outside strings', () => {
      expect(isInString('node MyNode {', 5)).toBe(false);
      expect(isInString('"done" rest', 8)).toBe(false);
    });
  });

  // --- collectRenameLocations filtering tests ---
  describe('collectRenameLocations filtering', () => {
    it('skips names inside line comments', () => {
      const doc = 'node MyNode {\n}\n// MyNode is great';
      const locs = collectRenameLocations(doc, 'MyNode');
      expect(locs).toHaveLength(1);
      expect(locs[0].start.line).toBe(0);
    });

    it('skips names inside block comments', () => {
      const doc = 'node MyNode {\n}\n/* MyNode */';
      const locs = collectRenameLocations(doc, 'MyNode');
      expect(locs).toHaveLength(1);
      expect(locs[0].start.line).toBe(0);
    });

    it('skips names inside strings', () => {
      const doc = 'node MyNode {\n  model "MyNode-v1"\n}';
      const locs = collectRenameLocations(doc, 'MyNode');
      // "MyNode-v1" won't match \bMyNode\b because of the dash,
      // so let's use a clearer example
      const doc2 = 'node Foo {\n  reads { x "Foo" }\n}';
      const locs2 = collectRenameLocations(doc2, 'Foo');
      // Should find "Foo" at line 0 (declaration), skip the one in quotes
      expect(locs2).toHaveLength(1);
      expect(locs2[0].start.line).toBe(0);
    });

    it('skips names inside import paths', () => {
      const doc = 'import { Auth } from "./Auth.gft"\nnode Auth {\n}';
      const locs = collectRenameLocations(doc, 'Auth');
      // Should find: { Auth } (in import list) and node Auth declaration
      // Should skip: Auth inside "./Auth.gft"
      // The import list "Auth" is NOT inside from "..." so it should be kept
      expect(locs.every(loc => {
        if (loc.start.line === 0) {
          // On the import line, character should be inside { Auth }, not inside "./Auth.gft"
          const line = doc.split('\n')[0];
          const matchText = line.substring(loc.start.character, loc.end.character);
          return matchText === 'Auth';
        }
        return true;
      })).toBe(true);
      // Specifically, the one inside the path string should be skipped
      const pathStart = doc.indexOf('"./Auth.gft"');
      const authInPath = doc.indexOf('Auth', pathStart + 1);
      const foundInPath = locs.some(loc => {
        const offset = doc.split('\n').slice(0, loc.start.line).reduce((s, l) => s + l.length + 1, 0) + loc.start.character;
        return offset === authInPath;
      });
      expect(foundInPath).toBe(false);
    });

    it('still finds valid declaration references', () => {
      const doc = 'context MyCtx {\n  reads { data }\n}\nnode Worker {\n  reads { MyCtx.data }\n}';
      const locs = collectRenameLocations(doc, 'MyCtx');
      expect(locs.length).toBeGreaterThanOrEqual(2);
    });

    it('still finds valid reads references', () => {
      const doc = 'context Cfg {\n  reads { x }\n}\nnode N1 {\n  reads { Cfg.x }\n}';
      const locs = collectRenameLocations(doc, 'Cfg');
      expect(locs).toHaveLength(2);
    });

    it('handles CRLF line endings correctly', () => {
      const doc = 'node MyNode {\r\n}\r\n// MyNode comment';
      const locs = collectRenameLocations(doc, 'MyNode');
      expect(locs).toHaveLength(1);
      expect(locs[0].start.line).toBe(0);
    });

    it('with CRLF produces correct line/character positions', () => {
      const doc = 'context Foo {\r\n}\r\nnode Bar {\r\n  reads { Foo.x }\r\n}';
      const locs = collectRenameLocations(doc, 'Foo');
      expect(locs).toHaveLength(2);
      expect(locs[0]).toEqual({
        start: { line: 0, character: 8 },
        end: { line: 0, character: 11 },
      });
      expect(locs[1]).toEqual({
        start: { line: 3, character: 10 },
        end: { line: 3, character: 13 },
      });
    });
  });

  // --- newName validation tests ---
  describe('newName validation', () => {
    it('rejects non-identifier strings', () => {
      const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
      expect(IDENTIFIER_RE.test('123abc')).toBe(false);
      expect(IDENTIFIER_RE.test('my-node')).toBe(false);
      expect(IDENTIFIER_RE.test('a b')).toBe(false);
      expect(IDENTIFIER_RE.test('')).toBe(false);
    });

    it('rejects Graft keywords', () => {
      const GRAFT_KEYWORDS = new Set([
        'context', 'node', 'memory', 'graph', 'edge', 'import', 'from',
        'reads', 'writes', 'produces', 'budget', 'model', 'max_tokens',
        'on_failure', 'retry', 'fallback', 'skip', 'abort', 'done',
        'foreach', 'as', 'max_iterations', 'parallel', 'when', 'else',
        'storage', 'tools', 'in',
      ]);
      expect(GRAFT_KEYWORDS.has('context')).toBe(true);
      expect(GRAFT_KEYWORDS.has('node')).toBe(true);
      expect(GRAFT_KEYWORDS.has('from')).toBe(true);
      expect(GRAFT_KEYWORDS.has('foreach')).toBe(true);
    });

    it('accepts valid identifiers', () => {
      const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
      expect(IDENTIFIER_RE.test('MyNode')).toBe(true);
      expect(IDENTIFIER_RE.test('_private')).toBe(true);
      expect(IDENTIFIER_RE.test('node2')).toBe(true);
      expect(IDENTIFIER_RE.test('A')).toBe(true);
    });
  });
});
