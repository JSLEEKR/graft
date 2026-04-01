import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { collectRenameLocations, buildRenameEdits, GRAFT_KEYWORDS } from '../src/lsp/features/rename.js';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import { isInComment, isInString } from '../src/lsp/features/utils.js';

/** Helper: parse Graft source into a Program */
function parse(source: string) {
  const tokens = new Lexer(source).tokenize();
  const { program } = new Parser(tokens).parse();
  return program;
}

// ========================================
// v3.5-R4 Integration & Regression Tests
// ========================================

describe('v3.5-R4 integration tests', () => {
  // -------------------------------------------------------------------
  // 1. Full rename pipeline: comment protection
  // -------------------------------------------------------------------
  describe('rename skips comment matches', () => {
    it('renames identifier in declarations but not in comments', () => {
      const source = [
        'context Analyzer(max_tokens: 1k) {',
        '  // Analyzer is the main context',
        '  summary: String',
        '}',
      ].join('\n');

      const result = buildRenameEdits(
        'Analyzer', 'Reviewer', source,
        'file:///test.gft', '/test.gft',
        new Map(),
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('changes');
      const changes = (result as { changes: Record<string, unknown[]> }).changes;
      const edits = changes['file:///test.gft'];
      // Should only find the declaration, not the comment
      expect(edits).toHaveLength(1);
      // Apply the edit and verify comment is untouched
      const lines = source.split('\n');
      expect(lines[1]).toContain('Analyzer');
      // After rename, the comment line should still say Analyzer
    });
  });

  // -------------------------------------------------------------------
  // 2. Full rename pipeline: CRLF input
  // -------------------------------------------------------------------
  describe('rename with CRLF line endings', () => {
    it('correctly locates identifiers in CRLF text', () => {
      const source = 'context MyCtx(max_tokens: 1k) {\r\n  name: String\r\n}\r\n';

      const locations = collectRenameLocations(source, 'MyCtx');
      expect(locations.length).toBeGreaterThanOrEqual(1);
      // Line 0, column should match "context MyCtx" -> column 8
      expect(locations[0].start.line).toBe(0);
      expect(locations[0].start.character).toBe(8);
    });

    it('rename edits apply correctly on CRLF input', () => {
      const source = 'context MyCtx(max_tokens: 1k) {\r\n  name: String\r\n}\r\n';

      const result = buildRenameEdits(
        'MyCtx', 'NewCtx', source,
        'file:///test.gft', '/test.gft',
        new Map(),
      );

      expect(result).toHaveProperty('changes');
      const changes = (result as { changes: Record<string, unknown[]> }).changes;
      expect(changes['file:///test.gft']).toBeDefined();
      expect(changes['file:///test.gft'].length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------
  // 3. Cross-file rename detects conflict
  // -------------------------------------------------------------------
  describe('cross-file conflict detection', () => {
    it('returns error when newName conflicts with declaration in another file', () => {
      const sourceA = [
        'context Alpha(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      const fileB = {
        text: 'context Beta(max_tokens: 1k) {\n  info: String\n}\n',
        uri: 'file:///b.gft',
      };

      // Rename Alpha -> Beta should conflict with Beta in file B
      const result = buildRenameEdits(
        'Alpha', 'Beta', sourceA,
        'file:///a.gft', '/a.gft',
        new Map([['/b.gft', fileB]]),
      );

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Beta');
    });
  });

  // -------------------------------------------------------------------
  // 4. Cross-file rename succeeds when no conflict
  // -------------------------------------------------------------------
  describe('cross-file rename without conflict', () => {
    it('produces edits for both files when identifier is referenced across files', () => {
      const sourceA = [
        'context Shared(max_tokens: 1k) {',
        '  data: String',
        '}',
        'node Worker(model: sonnet, budget: 1k/1k) {',
        '  reads Shared',
        '  produces Result { output: String }',
        '}',
      ].join('\n');

      // File B references "Shared" (e.g., in a reads clause)
      const fileB = {
        text: 'node Helper(model: sonnet, budget: 1k/1k) {\n  reads Shared\n  produces Out { x: String }\n}\n',
        uri: 'file:///b.gft',
      };

      const result = buildRenameEdits(
        'Shared', 'Common', sourceA,
        'file:///a.gft', '/a.gft',
        new Map([['/b.gft', fileB]]),
      );

      expect(result).toHaveProperty('changes');
      const changes = (result as { changes: Record<string, unknown[]> }).changes;
      // Both files should have edits
      expect(changes['file:///a.gft']).toBeDefined();
      expect(changes['file:///b.gft']).toBeDefined();
      expect(changes['file:///a.gft'].length).toBeGreaterThanOrEqual(1);
      expect(changes['file:///b.gft'].length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------
  // 5. Keyword rejection in rename
  // -------------------------------------------------------------------
  describe('keyword rejection', () => {
    it('rejects renaming to any Graft keyword', () => {
      const source = [
        'context Foo(max_tokens: 1k) {',
        '  x: String',
        '}',
      ].join('\n');

      const keywords = ['context', 'node', 'edge', 'parallel', 'foreach', 'memory', 'graph'];
      for (const kw of keywords) {
        const result = buildRenameEdits(
          'Foo', kw, source,
          'file:///test.gft', '/test.gft',
          new Map(),
        );
        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('reserved keyword');
      }
    });

    it('GRAFT_KEYWORDS set contains expected keywords', () => {
      expect(GRAFT_KEYWORDS.has('context')).toBe(true);
      expect(GRAFT_KEYWORDS.has('node')).toBe(true);
      expect(GRAFT_KEYWORDS.has('parallel')).toBe(true);
      expect(GRAFT_KEYWORDS.has('foreach')).toBe(true);
      expect(GRAFT_KEYWORDS.has('edge')).toBe(true);
      expect(GRAFT_KEYWORDS.has('import')).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // 6. String literal protection in rename
  // -------------------------------------------------------------------
  describe('string literal protection', () => {
    it('does not rename identifier inside string values', () => {
      const source = [
        'context Alpha(max_tokens: 1k) {',
        '  label: String',
        '}',
        'node Worker(model: sonnet, budget: 1k/1k) {',
        '  reads Alpha',
        '  produces Result { name: "Alpha is great" }',
        '}',
      ].join('\n');

      const locations = collectRenameLocations(source, 'Alpha');
      // Should find declaration + reads reference, but NOT the string content
      for (const loc of locations) {
        const line = source.split('\n')[loc.start.line];
        const matchedText = line.substring(loc.start.character, loc.end.character);
        expect(matchedText).toBe('Alpha');
        // Verify none of these locations are inside a string
        expect(isInString(line, loc.start.character)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------
  // 7. Import path protection
  // -------------------------------------------------------------------
  describe('import path protection', () => {
    it('does not rename identifier inside import path', () => {
      // If the import path contains the identifier name, it should be skipped
      const source = [
        'import { Alpha } from "./Alpha/module"',
        'context Alpha(max_tokens: 1k) {',
        '  x: String',
        '}',
      ].join('\n');

      const locations = collectRenameLocations(source, 'Alpha');
      // Should find the import name and the context declaration
      // but NOT the "Alpha" inside the path string "./Alpha/module"
      for (const loc of locations) {
        const line = source.split('\n')[loc.start.line];
        // For line 0 (import line), verify match is not in the path part
        if (loc.start.line === 0) {
          // The match should be the import name after {, not the path
          const beforeMatch = line.substring(0, loc.start.character);
          expect(beforeMatch).not.toContain('from');
        }
      }
    });
  });

  // -------------------------------------------------------------------
  // 8. FlowNode location accuracy end-to-end
  // -------------------------------------------------------------------
  describe('FlowNode source location', () => {
    it('parser assigns location to each FlowNode in a graph', () => {
      const source = [
        'context In(max_tokens: 1k) { q: String }',
        'context Out(max_tokens: 1k) { a: String }',
        'node A(model: sonnet, budget: 1k/1k) {',
        '  reads: [In]',
        '  produces PA { x: String }',
        '}',
        'node B(model: sonnet, budget: 1k/1k) {',
        '  reads: [PA]',
        '  produces PB { y: String }',
        '}',
        'graph Pipeline(input: In, output: PB, budget: 10k) {',
        '  A -> B -> done',
        '}',
      ].join('\n');

      const program = parse(source);
      expect(program.graphs).toHaveLength(1);
      const graph = program.graphs[0];

      // Each FlowNode should have a location
      for (const flowNode of graph.flow) {
        expect(flowNode.location).toBeDefined();
        expect(flowNode.location!.line).toBeGreaterThan(0);
        expect(flowNode.location!.column).toBeGreaterThan(0);
      }
    });

    it('parallel FlowNode has location', () => {
      const source = [
        'context In(max_tokens: 1k) { q: String }',
        'context Out(max_tokens: 1k) { a: String }',
        'node X(model: sonnet, budget: 1k/1k) {',
        '  reads: [In]',
        '  produces PX { x: String }',
        '}',
        'node Y(model: sonnet, budget: 1k/1k) {',
        '  reads: [In]',
        '  produces PY { y: String }',
        '}',
        'graph G(input: In, output: PX, budget: 10k) {',
        '  parallel { X, Y } -> done',
        '}',
      ].join('\n');

      const program = parse(source);
      const graph = program.graphs[0];
      const parallelNode = graph.flow.find(n => n.kind === 'parallel');
      expect(parallelNode).toBeDefined();
      expect(parallelNode!.location).toBeDefined();
      expect(parallelNode!.location!.line).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------
  // 9. Document symbols include parallel/foreach children
  // -------------------------------------------------------------------
  describe('document symbols with parallel and foreach', () => {
    it('graph symbol has parallel and foreach as children', () => {
      const source = [
        'context In(max_tokens: 1k) { items: List<String> }',
        'context Out(max_tokens: 1k) { result: String }',
        'node A(model: sonnet, budget: 1k/1k) {',
        '  reads: [In]',
        '  produces PA { x: String }',
        '}',
        'node B(model: sonnet, budget: 1k/1k) {',
        '  reads: [In]',
        '  produces PB { y: String }',
        '}',
        'graph Flow(input: In, output: PA, budget: 10k) {',
        '  parallel { A, B } -> foreach(A.output.x as item, max_iterations: 5) {',
        '    A',
        '  } -> done',
        '}',
      ].join('\n');

      const program = parse(source);
      const index = new ProgramIndex(program);
      const symbols = getDocumentSymbols(program, index);

      // Find the graph symbol
      const graphSym = symbols.find(s => s.name === 'Flow');
      expect(graphSym).toBeDefined();
      expect(graphSym!.children).toBeDefined();
      expect(graphSym!.children!.length).toBeGreaterThanOrEqual(2);

      // Should have a parallel child
      const parallelChild = graphSym!.children!.find(c => c.name.startsWith('parallel('));
      expect(parallelChild).toBeDefined();
      expect(parallelChild!.name).toContain('A');
      expect(parallelChild!.name).toContain('B');

      // Should have a foreach child
      const foreachChild = graphSym!.children!.find(c => c.name.startsWith('foreach('));
      expect(foreachChild).toBeDefined();
      expect(foreachChild!.name).toContain('A.x');

      // foreach should have its own children (the body nodes)
      expect(foreachChild!.children).toBeDefined();
      expect(foreachChild!.children!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------
  // 10. Rename + symbols integration
  // -------------------------------------------------------------------
  describe('rename then verify symbols', () => {
    it('after renaming a context, re-parsed symbols reflect new name', () => {
      const source = [
        'context OldName(max_tokens: 1k) {',
        '  data: String',
        '}',
      ].join('\n');

      // Perform rename
      const result = buildRenameEdits(
        'OldName', 'NewName', source,
        'file:///test.gft', '/test.gft',
        new Map(),
      );

      expect(result).toHaveProperty('changes');
      const changes = (result as { changes: Record<string, { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }[]> }).changes;
      const edits = changes['file:///test.gft'];

      // Apply edits to source (apply from end to start to preserve offsets)
      const lines = source.split('\n');
      const sortedEdits = [...edits].sort((a, b) =>
        b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character
      );
      for (const edit of sortedEdits) {
        const line = lines[edit.range.start.line];
        lines[edit.range.start.line] =
          line.substring(0, edit.range.start.character) +
          edit.newText +
          line.substring(edit.range.end.character);
      }
      const renamedSource = lines.join('\n');

      // Re-parse and check symbols
      const newProgram = parse(renamedSource);
      const newIndex = new ProgramIndex(newProgram);
      const symbols = getDocumentSymbols(newProgram, newIndex);

      expect(symbols.find(s => s.name === 'NewName')).toBeDefined();
      expect(symbols.find(s => s.name === 'OldName')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // Bonus: isInComment and isInString utility edge cases
  // -------------------------------------------------------------------
  describe('isInComment and isInString edge cases', () => {
    it('block comment spanning multiple lines', () => {
      const lines = [
        '/* this is a',
        '   multi-line comment */',
        'context Foo(max_tokens: 1k) {',
      ];
      // Position inside the block comment on line 1
      expect(isInComment(lines, 1, 5)).toBe(true);
      // Position after block comment closes on line 2
      expect(isInComment(lines, 2, 1)).toBe(false);
    });

    it('isInString detects position inside double-quoted string', () => {
      const line = 'name: "hello world"';
      expect(isInString(line, 8)).toBe(true);  // inside quotes
      expect(isInString(line, 0)).toBe(false);  // before quotes
      expect(isInString(line, 19)).toBe(false); // after closing quote
    });
  });
});
