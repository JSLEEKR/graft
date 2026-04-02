import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { findReferences, isReferable } from '../src/lsp/features/references.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

describe('v3.7-R1: findDeclNamePosition uses location.length', () => {
  it('correctly positions context declaration name using loc.length', () => {
    const { index } = parseAndIndex(FULL_GFT);
    // "context TaskSpec(...)" — context keyword has length via loc.length
    // findReferences with includeDeclaration=false should skip the declaration
    const refs = findReferences('TaskSpec', FULL_GFT, 'file:///test.gft', index, false, new Map());
    // With includeDeclaration=false, the declaration position (line 0, after "context ") should be excluded
    // The remaining references should be in reads and graph lines
    const declLine0Refs = refs.filter(r => r.range.start.line === 0);
    expect(declLine0Refs).toHaveLength(0);
    // But references in other lines should still exist
    expect(refs.length).toBeGreaterThan(0);
  });

  it('correctly positions node declaration name using loc.length', () => {
    const src = `context Input(max_tokens: 100) {
  data: String
}

node Worker(model: sonnet, budget: 1000/500) {
  reads: [Input]
  produces Output {
    result: String
  }
}

graph Main(input: Input, output: Output, budget: 5000) {
  Worker -> done
}`;
    const { index } = parseAndIndex(src);
    // "node Worker" — Worker is at line 4
    const refs = findReferences('Worker', src, 'file:///test.gft', index, false, new Map());
    // Should exclude the declaration at line 4 (after "node ")
    const declLineRefs = refs.filter(r => r.range.start.line === 4);
    expect(declLineRefs).toHaveLength(0);
    // Should still find Worker in graph flow
    expect(refs.length).toBeGreaterThan(0);
  });

  it('correctly positions memory declaration name using loc.length', () => {
    const src = `context Input(max_tokens: 100) {
  data: String
}

node Worker(model: sonnet, budget: 1000/500) {
  reads: [Input]
  writes: [Store.lastRun]
  produces Output {
    result: String
  }
}

memory Store(storage: file) {
  lastRun: String
}

graph Main(input: Input, output: Output, budget: 5000) {
  Worker -> done
}`;
    const { index } = parseAndIndex(src);
    // "memory Store" — Store is at line 13
    const refs = findReferences('Store', src, 'file:///test.gft', index, false, new Map());
    // Should exclude the declaration at line 13
    const declLineRefs = refs.filter(r => r.range.start.line === 13);
    expect(declLineRefs).toHaveLength(0);
    // Should still find Store in writes
    expect(refs.length).toBeGreaterThan(0);
  });

  it('correctly positions produces declaration name using loc.length', () => {
    const { index } = parseAndIndex(FULL_GFT);
    // "produces Analysis {" — Analysis is produced by Analyzer
    const refs = findReferences('Analysis', FULL_GFT, 'file:///test.gft', index, false, new Map());
    // The produces declaration line should be excluded
    // "produces Analysis" is on line 7 (0-based)
    const declLineRefs = refs.filter(r => r.range.start.line === 7);
    expect(declLineRefs).toHaveLength(0);
    // Analysis should appear in Reporter's reads
    expect(refs.length).toBeGreaterThan(0);
  });

  it('includeDeclaration=true includes all occurrences', () => {
    const { index } = parseAndIndex(FULL_GFT);
    const refsInclude = findReferences('TaskSpec', FULL_GFT, 'file:///test.gft', index, true, new Map());
    const refsExclude = findReferences('TaskSpec', FULL_GFT, 'file:///test.gft', index, false, new Map());
    // includeDeclaration=true should have one more reference than false
    expect(refsInclude.length).toBe(refsExclude.length + 1);
  });

  it('cross-file findReferences still works after refactor', () => {
    const { index } = parseAndIndex(FULL_GFT);
    // Simulate a workspace file that imports and uses TaskSpec
    const otherFile = `import { TaskSpec } from "./main"

context Extended(max_tokens: 200) {
  ref: String
}

node Consumer(model: sonnet, budget: 1000/500) {
  reads: [TaskSpec]
  produces Result {
    output: String
  }
}

graph Sub(input: TaskSpec, output: Result, budget: 3000) {
  Consumer -> done
}`;
    const wsFiles = new Map<string, { text: string; uri: string }>();
    wsFiles.set('/other.gft', { text: otherFile, uri: 'file:///other.gft' });

    const refs = findReferences('TaskSpec', FULL_GFT, 'file:///test.gft', index, false, wsFiles);
    // Should find TaskSpec in the other file
    const otherFileRefs = refs.filter(r => r.uri === 'file:///other.gft');
    expect(otherFileRefs.length).toBeGreaterThan(0);
  });

  it('server.ts is smaller after helper extraction', () => {
    const serverPath = path.resolve(__dirname, '../src/lsp/server.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');
    const lineCount = content.split('\n').length;
    // After extracting helpers, server.ts should be at most the same or fewer lines
    // The extraction replaces duplicated code with helper calls
    expect(lineCount).toBeLessThanOrEqual(394);
  });
});
