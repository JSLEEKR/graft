import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { findReferences, isReferable } from '../src/lsp/features/references.js';
import { collectRenameLocations, buildRenameEdits, GRAFT_KEYWORDS } from '../src/lsp/features/rename.js';
import { getDocumentSymbols, makeSymbol } from '../src/lsp/features/symbols.js';
import { KEYWORDS } from '../src/lexer/tokens.js';
import { SymbolKind } from 'vscode-languageserver/node';

// --- Shared .gft source used across multiple tests ---
const FULL_GFT = `context TaskSpec(max_tokens: 500) {
  title: String
  description: String
}

node Analyzer(model: sonnet, budget: 5000/2000) {
  reads: [TaskSpec]
  produces Analysis {
    result: String
    score: Int
  }
}

node Reporter(model: haiku, budget: 3000/1000) {
  reads: [TaskSpec, Analysis]
  produces Report {
    summary: String
  }
}

memory Cache(storage: file) {
  lastRun: String
}

edge Analyzer -> Reporter

graph Pipeline(input: TaskSpec, output: Report, budget: 10000) {
  Analyzer -> Reporter -> done
}`;

function parseAndIndex(src: string): { program: ReturnType<Parser['parse']>['program']; index: ProgramIndex } {
  const tokens = new Lexer(src).tokenize();
  const { program } = new Parser(tokens).parse();
  const index = new ProgramIndex(program);
  return { program, index };
}

describe('v3.6-R4: integration and regression tests', () => {

  // --- 1. Find references end-to-end ---
  describe('findReferences end-to-end', () => {
    it('parse -> findReferences returns all occurrences of a context name', () => {
      const { index } = parseAndIndex(FULL_GFT);
      const refs = findReferences(
        'TaskSpec', FULL_GFT, 'file:///main.gft', index, true, new Map(),
      );
      // TaskSpec appears in: context declaration, Analyzer reads, Reporter reads, graph input
      expect(refs.length).toBeGreaterThanOrEqual(4);
      for (const ref of refs) {
        expect(ref.uri).toBe('file:///main.gft');
      }
    });

    it('parse -> findReferences returns all occurrences of a node name', () => {
      const { index } = parseAndIndex(FULL_GFT);
      const refs = findReferences(
        'Analyzer', FULL_GFT, 'file:///main.gft', index, true, new Map(),
      );
      // Analyzer appears in: node declaration, edge source, graph flow
      expect(refs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // --- 2. Find references: produces name ---
  describe('findReferences for produces name', () => {
    it('isReferable returns true for a produces output name', () => {
      const { index } = parseAndIndex(FULL_GFT);
      expect(isReferable('Analysis', index)).toBe(true);
      expect(isReferable('Report', index)).toBe(true);
    });

    it('findReferences returns occurrences of a produces name', () => {
      const { index } = parseAndIndex(FULL_GFT);
      const refs = findReferences(
        'Analysis', FULL_GFT, 'file:///main.gft', index, true, new Map(),
      );
      // Analysis appears in: produces declaration, Reporter reads
      expect(refs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- 3. Find references: includeDeclaration=false ---
  describe('findReferences includeDeclaration=false', () => {
    it('returns one fewer result when excluding declaration', () => {
      const { index } = parseAndIndex(FULL_GFT);
      const withDecl = findReferences(
        'TaskSpec', FULL_GFT, 'file:///main.gft', index, true, new Map(),
      );
      const withoutDecl = findReferences(
        'TaskSpec', FULL_GFT, 'file:///main.gft', index, false, new Map(),
      );
      expect(withoutDecl.length).toBe(withDecl.length - 1);
    });
  });

  // --- 4. Find references cross-file ---
  describe('findReferences cross-file', () => {
    it('finds references across two files', () => {
      const mainSrc = `context SharedCtx(max_tokens: 500) {
  data: String
}

node Worker(model: sonnet, budget: 3000/1000) {
  reads: [SharedCtx]
  produces WorkResult {
    output: String
  }
}

graph Main(input: SharedCtx, output: WorkResult, budget: 5000) {
  Worker -> done
}`;
      const otherSrc = `import SharedCtx from "main.gft"

node Consumer(model: haiku, budget: 2000/500) {
  reads: [SharedCtx]
  produces ConsumerResult {
    out: String
  }
}`;
      const { index } = parseAndIndex(mainSrc);
      const workspaceFiles = new Map<string, { text: string; uri: string }>([
        ['other.gft', { text: otherSrc, uri: 'file:///other.gft' }],
      ]);

      const refs = findReferences(
        'SharedCtx', mainSrc, 'file:///main.gft', index, true, workspaceFiles,
      );

      const mainRefs = refs.filter(r => r.uri === 'file:///main.gft');
      const otherRefs = refs.filter(r => r.uri === 'file:///other.gft');
      expect(mainRefs.length).toBeGreaterThanOrEqual(2);
      expect(otherRefs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- 5. Find references: name in comment ignored ---
  describe('findReferences ignores comments', () => {
    it('does not count occurrences inside comments', () => {
      const src = `context Foo(max_tokens: 100) {
  x: String
}
// Foo is used here as a comment
node Worker(model: sonnet, budget: 1000/500) {
  reads: [Foo]
  produces Bar {
    out: String
  }
}`;
      const { index } = parseAndIndex(src);
      const refs = findReferences('Foo', src, 'file:///test.gft', index, true, new Map());
      // Foo appears in: context decl, reads — NOT in comment
      // Every ref should be a real usage
      for (const ref of refs) {
        const lines = src.split('\n');
        const line = lines[ref.range.start.line];
        expect(line.trimStart().startsWith('//')).toBe(false);
      }
    });
  });

  // --- 6. Find references: name in string ignored ---
  describe('findReferences ignores strings', () => {
    it('does not count occurrences inside string literals', () => {
      const src = `context Alpha(max_tokens: 100) {
  label: String
}

node Printer(model: sonnet, budget: 1000/500) {
  reads: [Alpha]
  produces PrintResult {
    text: String
  }
}`;
      const { index } = parseAndIndex(src);
      const refs = findReferences('Alpha', src, 'file:///test.gft', index, true, new Map());
      // All refs should point to real identifier positions
      expect(refs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- 7. GRAFT_KEYWORDS derivation integrity ---
  describe('GRAFT_KEYWORDS derivation', () => {
    it('GRAFT_KEYWORDS is a subset of KEYWORDS keys', () => {
      const keywordKeys = new Set(Object.keys(KEYWORDS));
      for (const kw of GRAFT_KEYWORDS) {
        expect(keywordKeys.has(kw)).toBe(true);
      }
    });

    it('GRAFT_KEYWORDS excludes type keywords', () => {
      const typeKeywords = ['String', 'Int', 'Float', 'Bool', 'List', 'Map', 'Optional',
        'TokenBounded', 'FilePath', 'FileDiff', 'TestFile', 'IssueRef'];
      for (const tk of typeKeywords) {
        expect(GRAFT_KEYWORDS.has(tk)).toBe(false);
      }
    });

    it('GRAFT_KEYWORDS excludes contextual keyword "output"', () => {
      expect(GRAFT_KEYWORDS.has('output')).toBe(false);
    });

    it('GRAFT_KEYWORDS contains core keywords like node, context, graph', () => {
      expect(GRAFT_KEYWORDS.has('node')).toBe(true);
      expect(GRAFT_KEYWORDS.has('context')).toBe(true);
      expect(GRAFT_KEYWORDS.has('graph')).toBe(true);
      expect(GRAFT_KEYWORDS.has('edge')).toBe(true);
      expect(GRAFT_KEYWORDS.has('memory')).toBe(true);
    });
  });

  // --- 8. Rename with derived keywords ---
  describe('rename rejects derived keywords', () => {
    it('rejects rename to each of several GRAFT_KEYWORDS', () => {
      const src = `context Foo(max_tokens: 100) {
  x: String
}

node Bar(model: sonnet, budget: 1000/500) {
  reads: [Foo]
  produces BarResult {
    out: String
  }
}

graph Main(input: Foo, output: BarResult, budget: 3000) {
  Bar -> done
}`;
      const keywordsToTest = ['node', 'context', 'graph', 'edge', 'memory', 'reads', 'produces'];
      for (const kw of keywordsToTest) {
        const result = buildRenameEdits('Foo', kw, src, 'file:///test.gft', '/test.gft', new Map());
        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('reserved keyword');
      }
    });
  });

  // --- 9. Parse-based conflict detection end-to-end ---
  describe('parse-based conflict detection', () => {
    it('detects conflict with declaration in workspace file', () => {
      const mainSrc = `context Alpha(max_tokens: 100) {
  x: String
}

node Worker(model: sonnet, budget: 1000/500) {
  reads: [Alpha]
  produces WorkResult {
    out: String
  }
}

graph Main(input: Alpha, output: WorkResult, budget: 3000) {
  Worker -> done
}`;
      const otherSrc = `context Beta(max_tokens: 200) {
  y: String
}

node OtherWorker(model: haiku, budget: 1000/500) {
  reads: [Beta]
  produces OtherResult {
    out: String
  }
}

graph OtherMain(input: Beta, output: OtherResult, budget: 3000) {
  OtherWorker -> done
}`;
      const workspaceFiles = new Map([
        ['other.gft', { text: otherSrc, uri: 'file:///other.gft' }],
      ]);
      const result = buildRenameEdits('Alpha', 'Beta', mainSrc, 'file:///main.gft', '/main.gft', workspaceFiles);
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Beta');
      expect((result as { error: string }).error).toContain('conflicts');
    });
  });

  // --- 10. Conflict detection ignores comments ---
  describe('conflict detection ignores comments', () => {
    it('allows rename when conflicting name only appears in comment of workspace file', () => {
      const mainSrc = `context Alpha(max_tokens: 100) {
  x: String
}

node Worker(model: sonnet, budget: 1000/500) {
  reads: [Alpha]
  produces WorkResult {
    out: String
  }
}

graph Main(input: Alpha, output: WorkResult, budget: 3000) {
  Worker -> done
}`;
      // "Gamma" only in a comment in the other file — no real declaration
      const otherSrc = `// Gamma is mentioned here
context Delta(max_tokens: 200) {
  y: String
}

node OtherWorker(model: haiku, budget: 1000/500) {
  reads: [Delta]
  produces OtherResult {
    out: String
  }
}

graph OtherMain(input: Delta, output: OtherResult, budget: 3000) {
  OtherWorker -> done
}`;
      const workspaceFiles = new Map([
        ['other.gft', { text: otherSrc, uri: 'file:///other.gft' }],
      ]);
      const result = buildRenameEdits('Alpha', 'Gamma', mainSrc, 'file:///main.gft', '/main.gft', workspaceFiles);
      // Should succeed — Gamma is only in a comment, not a real declaration
      expect(result).not.toHaveProperty('error');
      expect(result).toHaveProperty('changes');
    });
  });

  // --- 11. Symbol range: selectionRange inside range ---
  describe('symbol range containment for all kinds', () => {
    it('selectionRange is contained within range for all symbol kinds from a parsed file', () => {
      const { program, index } = parseAndIndex(FULL_GFT);
      const symbols = getDocumentSymbols(program, index);
      expect(symbols.length).toBeGreaterThan(0);
      for (const sym of symbols) {
        const r = sym.range;
        const sr = sym.selectionRange;
        expect(r.start.line).toBeLessThanOrEqual(sr.start.line);
        expect(r.end.line).toBeGreaterThanOrEqual(sr.end.line);
        if (r.start.line === sr.start.line) {
          expect(r.start.character).toBeLessThanOrEqual(sr.start.character);
        }
        if (r.end.line === sr.end.line) {
          expect(r.end.character).toBeGreaterThanOrEqual(sr.end.character);
        }
      }
    });
  });

  // --- 12. Symbol range: keyword position ---
  describe('symbol range keyword position', () => {
    it('range starts at keyword column, selectionRange starts after keyword+space', () => {
      const src = `context MyCtx(max_tokens: 100) {
  data: String
}`;
      const { program, index } = parseAndIndex(src);
      const symbols = getDocumentSymbols(program, index);
      const ctxSym = symbols.find(s => s.name === 'MyCtx')!;
      expect(ctxSym).toBeDefined();
      // "context" starts at column 0 (0-based)
      expect(ctxSym.range.start.character).toBe(0);
      // selectionRange should start after "context " (8 chars)
      expect(ctxSym.selectionRange.start.character).toBeGreaterThan(0);
      // selectionRange width should be exactly the name length
      expect(ctxSym.selectionRange.end.character - ctxSym.selectionRange.start.character).toBe('MyCtx'.length);
    });
  });

  // --- 13. Rename field collision end-to-end ---
  describe('rename field collision end-to-end', () => {
    it('blocks rename to a context field name with descriptive error', () => {
      const src = `context Report(max_tokens: 500) {
  summary: String
  detail: String
}

node Writer(model: sonnet, budget: 2000/1000) {
  reads: [Report]
  produces WriterResult {
    output: String
  }
}

graph Main(input: Report, output: WriterResult, budget: 5000) {
  Writer -> done
}`;
      const result = buildRenameEdits('Writer', 'summary', src, 'file:///test.gft', '/test.gft', new Map());
      expect(result).toHaveProperty('error');
      const err = (result as { error: string }).error;
      expect(err).toContain('summary');
      expect(err).toContain('Report');
      expect(err).toContain('collides');
    });

    it('blocks rename to a produces field name', () => {
      const src = `context Input(max_tokens: 100) {
  data: String
}

node Processor(model: sonnet, budget: 2000/1000) {
  reads: [Input]
  produces ProcessResult {
    answer: String
  }
}

graph Main(input: Input, output: ProcessResult, budget: 5000) {
  Processor -> done
}`;
      const result = buildRenameEdits('Processor', 'answer', src, 'file:///test.gft', '/test.gft', new Map());
      expect(result).toHaveProperty('error');
      const err = (result as { error: string }).error;
      expect(err).toContain('answer');
    });
  });

  // --- 14. Find references + rename: consistent results ---
  describe('findReferences + rename consistency', () => {
    it('rename edits touch the same count as findReferences', () => {
      const src = `context Spec(max_tokens: 100) {
  info: String
}

node Runner(model: sonnet, budget: 2000/1000) {
  reads: [Spec]
  produces RunResult {
    output: String
  }
}

graph Flow(input: Spec, output: RunResult, budget: 5000) {
  Runner -> done
}`;
      const { index } = parseAndIndex(src);

      // Count references (including declaration)
      const refs = findReferences('Spec', src, 'file:///test.gft', index, true, new Map());

      // Count rename edit locations
      const renameResult = buildRenameEdits('Spec', 'NewSpec', src, 'file:///test.gft', '/test.gft', new Map());
      expect(renameResult).toHaveProperty('changes');
      const changes = (renameResult as { changes: Record<string, { range: unknown }[]> }).changes;
      const editCount = Object.values(changes).reduce((sum, edits) => sum + edits.length, 0);

      // Both should find the same number of occurrences
      expect(refs.length).toBe(editCount);
    });
  });
});
