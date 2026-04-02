import { describe, it, expect } from 'vitest';
import { getDocumentSymbols, makeSymbol } from '../src/lsp/features/symbols.js';
import { buildRenameEdits } from '../src/lsp/features/rename.js';
import { SymbolKind } from 'vscode-languageserver/node';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import type { SourceLocation } from '../src/errors/diagnostics.js';

describe('v3.6-R3: symbol range improvement + rename field collision guard', () => {
  // --- Part 1: Symbol range improvement ---

  describe('makeSymbol range vs selectionRange', () => {
    it('range contains selectionRange for a context symbol', () => {
      // "context TaskSpec" — keyword at column 1, name at column 9
      const loc: SourceLocation = { line: 1, column: 1, offset: 0, length: 30 };
      const sym = makeSymbol('TaskSpec', SymbolKind.Class, loc);
      const r = sym.range;
      const sr = sym.selectionRange;
      // selectionRange must be contained within range
      expect(r.start.line).toBeLessThanOrEqual(sr.start.line);
      expect(r.end.line).toBeGreaterThanOrEqual(sr.end.line);
      if (r.start.line === sr.start.line) {
        expect(r.start.character).toBeLessThanOrEqual(sr.start.character);
      }
      if (r.end.line === sr.end.line) {
        expect(r.end.character).toBeGreaterThanOrEqual(sr.end.character);
      }
    });

    it('range starts at keyword position (column 0 for line-start declarations)', () => {
      // loc.column is 1-based, so column 1 => character 0
      const loc: SourceLocation = { line: 3, column: 1, offset: 20, length: 50 };
      const sym = makeSymbol('MyNode', SymbolKind.Function, loc);
      expect(sym.range.start.line).toBe(2); // 0-based
      expect(sym.range.start.character).toBe(0); // column 1 => char 0
    });

    it('selectionRange is name only', () => {
      const loc: SourceLocation = { line: 1, column: 1, offset: 0, length: 30 };
      const sym = makeSymbol('TaskSpec', SymbolKind.Class, loc);
      const sr = sym.selectionRange;
      // selectionRange should span exactly the name length
      expect(sr.end.character - sr.start.character).toBe('TaskSpec'.length);
    });

    it('range for node uses loc.length when available', () => {
      // loc.length = keyword length (e.g., 4 for "node")
      const loc: SourceLocation = { line: 5, column: 1, offset: 40, length: 4 };
      const sym = makeSymbol('Summarizer', SymbolKind.Function, loc);
      // range should be wider than just the name: keyword(4) + space(1) + name(10) = 15
      const rangeWidth = sym.range.end.character - sym.range.start.character;
      expect(rangeWidth).toBeGreaterThan('Summarizer'.length);
      expect(rangeWidth).toBe(4 + 1 + 'Summarizer'.length); // keyword + space + name
    });

    it('range for memory falls back to name length when length is absent', () => {
      const loc: SourceLocation = { line: 2, column: 1, offset: 10 };
      const sym = makeSymbol('Cache', SymbolKind.Variable, loc);
      // Without loc.length, range width should be at least the name length
      const rangeWidth = sym.range.end.character - sym.range.start.character;
      expect(rangeWidth).toBe('Cache'.length);
    });
  });

  describe('getDocumentSymbols integration', () => {
    it('context symbol range encompasses selectionRange', () => {
      const src = `context TaskSpec(max_tokens: 500) {
  task: String
}`;
      const tokens = new Lexer(src).tokenize();
      const { program } = new Parser(tokens).parse();
      const index = new ProgramIndex(program);
      const symbols = getDocumentSymbols(program, index);
      const ctxSym = symbols.find(s => s.name === 'TaskSpec')!;
      expect(ctxSym).toBeDefined();
      // range must contain selectionRange
      const r = ctxSym.range;
      const sr = ctxSym.selectionRange;
      expect(r.start.character).toBeLessThanOrEqual(sr.start.character);
      expect(r.end.character).toBeGreaterThanOrEqual(sr.end.character);
    });
  });

  // --- Part 2: Rename field collision guard ---

  describe('rename field collision guard', () => {
    const graftSrc = `context Report(max_tokens: 500) {
  summary: String
  title: String
}

node Summarizer(model: sonnet, budget: 2000/1000) {
  reads: [Report]
  produces SummaryResult {
    output: String
  }
}

graph Main(input: Report, output: SummaryResult, budget: 5000) {
  Summarizer -> done
}`;

    it('blocks rename when newName matches a field name', () => {
      const result = buildRenameEdits(
        'Summarizer', 'summary', graftSrc, 'file:///test.gft',
        '/test.gft', new Map(),
      );
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('summary');
    });

    it('allows rename when newName does not match any field', () => {
      const result = buildRenameEdits(
        'Summarizer', 'Analyzer', graftSrc, 'file:///test.gft',
        '/test.gft', new Map(),
      );
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('error');
      expect(result).toHaveProperty('changes');
    });

    it('error message identifies the conflicting field and its parent', () => {
      const result = buildRenameEdits(
        'Summarizer', 'title', graftSrc, 'file:///test.gft',
        '/test.gft', new Map(),
      );
      expect(result).not.toBeNull();
      const err = result as { error: string };
      expect(err.error).toContain('title');
      expect(err.error).toContain('Report');
    });
  });
});
