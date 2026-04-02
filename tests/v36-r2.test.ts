import { describe, it, expect } from 'vitest';
import { buildRenameEdits, GRAFT_KEYWORDS } from '../src/lsp/features/rename.js';
import { KEYWORDS } from '../src/lexer/tokens.js';

describe('v3.6-R2: keyword unification + cross-file conflict detection', () => {
  // --- Part 1: GRAFT_KEYWORDS derived from lexer KEYWORDS ---

  describe('GRAFT_KEYWORDS includes language keywords', () => {
    it('contains context, node, memory, graph, edge, parallel, foreach', () => {
      expect(GRAFT_KEYWORDS.has('context')).toBe(true);
      expect(GRAFT_KEYWORDS.has('node')).toBe(true);
      expect(GRAFT_KEYWORDS.has('memory')).toBe(true);
      expect(GRAFT_KEYWORDS.has('graph')).toBe(true);
      expect(GRAFT_KEYWORDS.has('edge')).toBe(true);
      expect(GRAFT_KEYWORDS.has('parallel')).toBe(true);
      expect(GRAFT_KEYWORDS.has('foreach')).toBe(true);
    });
  });

  describe('GRAFT_KEYWORDS excludes type keywords', () => {
    it('does not contain String, Int, Float, Bool, List, Map', () => {
      expect(GRAFT_KEYWORDS.has('String')).toBe(false);
      expect(GRAFT_KEYWORDS.has('Int')).toBe(false);
      expect(GRAFT_KEYWORDS.has('Float')).toBe(false);
      expect(GRAFT_KEYWORDS.has('Bool')).toBe(false);
      expect(GRAFT_KEYWORDS.has('List')).toBe(false);
      expect(GRAFT_KEYWORDS.has('Map')).toBe(false);
      expect(GRAFT_KEYWORDS.has('Optional')).toBe(false);
      expect(GRAFT_KEYWORDS.has('TokenBounded')).toBe(false);
      expect(GRAFT_KEYWORDS.has('FilePath')).toBe(false);
      expect(GRAFT_KEYWORDS.has('FileDiff')).toBe(false);
      expect(GRAFT_KEYWORDS.has('TestFile')).toBe(false);
      expect(GRAFT_KEYWORDS.has('IssueRef')).toBe(false);
    });
  });

  describe('GRAFT_KEYWORDS excludes contextual keyword output', () => {
    it('does not contain output', () => {
      expect(GRAFT_KEYWORDS.has('output')).toBe(false);
    });
  });

  describe('GRAFT_KEYWORDS is derived from lexer KEYWORDS', () => {
    it('every entry in GRAFT_KEYWORDS exists in lexer KEYWORDS', () => {
      const lexerKeys = new Set(Object.keys(KEYWORDS));
      for (const kw of GRAFT_KEYWORDS) {
        expect(lexerKeys.has(kw)).toBe(true);
      }
    });
  });

  describe('GRAFT_KEYWORDS rejects rename to keyword', () => {
    it('returns error when newName is a keyword', () => {
      const source = [
        'context Alpha(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      const result = buildRenameEdits(
        'Alpha', 'context', source,
        'file:///a.gft', '/a.gft',
        new Map(),
      );

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('reserved keyword');
    });
  });

  // --- Part 2: Parse-based cross-file conflict detection ---

  describe('cross-file conflict detection: parse-based catches real conflict', () => {
    it('detects conflict when workspace file has a declaration with the new name', () => {
      const source = [
        'context Alpha(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      const fileB = {
        text: 'context Foo(max_tokens: 1k) {\n  info: String\n}\n',
        uri: 'file:///b.gft',
      };

      const result = buildRenameEdits(
        'Alpha', 'Foo', source,
        'file:///a.gft', '/a.gft',
        new Map([['/b.gft', fileB]]),
      );

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Foo');
    });
  });

  describe('cross-file conflict detection: ignores conflicts in comments', () => {
    it('succeeds when workspace file only has the name in a comment', () => {
      const source = [
        'context Alpha(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      // The workspace file has "context Gamma" only in a comment, no real declaration
      const fileB = {
        text: '// context Gamma is used elsewhere\ncontext Other(max_tokens: 1k) {\n  x: String\n}\n',
        uri: 'file:///b.gft',
      };

      const result = buildRenameEdits(
        'Alpha', 'Gamma', source,
        'file:///a.gft', '/a.gft',
        new Map([['/b.gft', fileB]]),
      );

      // Should succeed because 'Gamma' is only in a comment, not a real declaration
      expect(result).toHaveProperty('changes');
    });
  });

  describe('cross-file conflict detection: parse failure does not block rename', () => {
    it('proceeds with rename when workspace file has invalid syntax', () => {
      const source = [
        'context Alpha(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      const fileB = {
        text: 'this is not valid graft syntax at all {{{',
        uri: 'file:///b.gft',
      };

      const result = buildRenameEdits(
        'Alpha', 'NewName', source,
        'file:///a.gft', '/a.gft',
        new Map([['/b.gft', fileB]]),
      );

      // Should succeed — parse failure means we skip conflict check
      expect(result).toHaveProperty('changes');
    });
  });
});
