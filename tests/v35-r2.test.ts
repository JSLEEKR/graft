import { describe, it, expect } from 'vitest';
import { buildRenameEdits, GRAFT_KEYWORDS } from '../src/lsp/features/rename.js';

describe('v3.5-R2: buildRenameEdits pure function', () => {
  // Valid Graft syntax for a single-file document
  const singleFileDoc = [
    'context Greeting(max_tokens: 500) { text: String }',
    '',
    'node Greeter(model: sonnet, budget: 1k/500) {',
    '  reads: [Greeting]',
    '  produces Response { answer: String }',
    '}',
    '',
    'graph Flow(input: Greeting, output: Response, budget: 5k) {',
    '  Greeter -> done',
    '}',
  ].join('\n');

  it('returns changes for simple single-file rename', () => {
    const result = buildRenameEdits(
      'Greeting', 'Salutation',
      singleFileDoc,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('error');
    const edits = (result as { changes: Record<string, any[]> }).changes;
    expect(edits['file:///test.gft']).toBeDefined();
    // Should rename: context declaration, reads ref, graph input ref
    expect(edits['file:///test.gft'].length).toBeGreaterThanOrEqual(2);
    for (const edit of edits['file:///test.gft']) {
      expect(edit.newText).toBe('Salutation');
    }
  });

  it('returns error for invalid identifier', () => {
    const result = buildRenameEdits(
      'Greeting', '123bad',
      singleFileDoc,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).toHaveProperty('error');
  });

  it('returns error for keyword name', () => {
    const result = buildRenameEdits(
      'Greeting', 'context',
      singleFileDoc,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).toHaveProperty('error');
  });

  it('detects conflict in current file', () => {
    const docWithTwo = [
      'context Greeting(max_tokens: 500) { text: String }',
      'context Target(max_tokens: 500) { info: String }',
    ].join('\n');
    const result = buildRenameEdits(
      'Greeting', 'Target',
      docWithTwo,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).toHaveProperty('error');
  });

  it('detects conflict in importing file', () => {
    const importingFileText = [
      'import { Greeting } from "./source"',
      'context Salutation(max_tokens: 500) { info: String }',
      'node Worker(model: sonnet, budget: 1k/500) {',
      '  reads: [Greeting, Salutation]',
      '  produces WorkResult { out: String }',
      '}',
      'graph G(input: Greeting, output: WorkResult, budget: 5k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const result = buildRenameEdits(
      'Greeting', 'Salutation',
      singleFileDoc,
      'file:///source.gft',
      '/source.gft',
      new Map([
        ['/other.gft', { text: importingFileText, uri: 'file:///other.gft' }],
      ]),
    );
    expect(result).toHaveProperty('error');
  });

  it('includes cross-file changes for importing files', () => {
    const importingFileText = [
      'import { Greeting } from "./source"',
      'node Worker(model: sonnet, budget: 1k/500) {',
      '  reads: [Greeting]',
      '  produces WorkResult { out: String }',
      '}',
      'graph G(input: Greeting, output: WorkResult, budget: 5k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const result = buildRenameEdits(
      'Greeting', 'Salutation',
      singleFileDoc,
      'file:///source.gft',
      '/source.gft',
      new Map([
        ['/other.gft', { text: importingFileText, uri: 'file:///other.gft' }],
      ]),
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('error');
    const edits = (result as { changes: Record<string, any[]> }).changes;
    expect(edits['file:///other.gft']).toBeDefined();
    expect(edits['file:///other.gft'].length).toBeGreaterThanOrEqual(2);
  });

  it('skips comments/strings in importing files', () => {
    const importingFileText = [
      'import { Greeting } from "./source"',
      '// Greeting is used here',
      'node Worker(model: sonnet, budget: 1k/500) {',
      '  reads: [Greeting]',
      '  produces WorkResult { out: String }',
      '}',
      'graph G(input: Greeting, output: WorkResult, budget: 5k) {',
      '  Worker -> done',
      '}',
    ].join('\n');

    const result = buildRenameEdits(
      'Greeting', 'Salutation',
      singleFileDoc,
      'file:///source.gft',
      '/source.gft',
      new Map([
        ['/other.gft', { text: importingFileText, uri: 'file:///other.gft' }],
      ]),
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('error');
    const edits = (result as { changes: Record<string, any[]> }).changes;
    const otherEdits = edits['file:///other.gft'];
    // Should have: import ref, reads ref, graph input ref -- but NOT the comment
    // The comment line "// Greeting is used here" should be skipped
    for (const edit of otherEdits) {
      // Verify none of the edits are on the comment line (line 1)
      expect(edit.newText).toBe('Salutation');
    }
    // Count: import{Greeting}, reads:[Greeting], input:Greeting = 3, no comment
    const commentLineEdits = otherEdits.filter((e: any) => e.range.start.line === 1);
    expect(commentLineEdits.length).toBe(0);
  });

  it('returns null for non-renameable name', () => {
    const result = buildRenameEdits(
      'UnknownThing', 'NewName',
      singleFileDoc,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('GRAFT_KEYWORDS contains expected keywords', () => {
    expect(GRAFT_KEYWORDS.has('context')).toBe(true);
    expect(GRAFT_KEYWORDS.has('node')).toBe(true);
    expect(GRAFT_KEYWORDS.has('memory')).toBe(true);
    expect(GRAFT_KEYWORDS.has('graph')).toBe(true);
    expect(GRAFT_KEYWORDS.has('import')).toBe(true);
    expect(GRAFT_KEYWORDS.has('foreach')).toBe(true);
    expect(GRAFT_KEYWORDS.has('parallel')).toBe(true);
    expect(GRAFT_KEYWORDS.has('storage')).toBe(true);
    expect(GRAFT_KEYWORDS.has('tools')).toBe(true);
    expect(GRAFT_KEYWORDS.has('MyContext')).toBe(false);
  });

  it('handles no importing files', () => {
    const result = buildRenameEdits(
      'Greeting', 'Salutation',
      singleFileDoc,
      'file:///test.gft',
      '/test.gft',
      new Map(),
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('error');
    const edits = (result as { changes: Record<string, any[]> }).changes;
    expect(Object.keys(edits)).toEqual(['file:///test.gft']);
  });
});
