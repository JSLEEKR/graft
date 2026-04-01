import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { saveMemory, loadMemory } from '../src/runtime/memory.js';
import { MemoryDecl } from '../src/parser/ast.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { getHoverInfo } from '../src/lsp/features.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- Field-level saveMemory ---

describe('v3.0-R7: field-level saveMemory', () => {
  let tmpDir: string;
  const loc = { line: 1, column: 1, offset: 0 };

  const mem: MemoryDecl = {
    name: 'Log',
    maxTokens: 2000,
    storage: 'file',
    fields: [
      { name: 'entry', type: { kind: 'primitive', name: 'String' }, location: loc },
      { name: 'count', type: { kind: 'primitive', name: 'Int' }, location: loc },
      { name: 'status', type: { kind: 'primitive', name: 'String' }, location: loc },
    ],
    location: loc,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-r7-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves all fields when no fields parameter', () => {
    saveMemory(tmpDir, mem, { entry: 'hello', count: 1, status: 'ok' });
    const data = loadMemory(tmpDir, 'Log');
    expect(data).toEqual({ entry: 'hello', count: 1, status: 'ok' });
  });

  it('saves only specified fields when fields parameter given', () => {
    // Pre-populate with existing data
    saveMemory(tmpDir, mem, { entry: 'old', count: 0, status: 'init' });

    // Now save only 'entry' field
    saveMemory(tmpDir, mem, { entry: 'new', count: 99, status: 'changed' }, ['entry']);
    const data = loadMemory(tmpDir, 'Log');
    expect(data!.entry).toBe('new');
    expect(data!.count).toBe(0); // unchanged
    expect(data!.status).toBe('init'); // unchanged
  });

  it('field-level save merges with existing data', () => {
    saveMemory(tmpDir, mem, { entry: 'first', count: 1, status: 'active' });
    saveMemory(tmpDir, mem, { count: 2 }, ['count']);
    const data = loadMemory(tmpDir, 'Log');
    expect(data!.entry).toBe('first');
    expect(data!.count).toBe(2);
    expect(data!.status).toBe('active');
  });

  it('empty fields array writes nothing', () => {
    saveMemory(tmpDir, mem, { entry: 'first', count: 1 });
    saveMemory(tmpDir, mem, { entry: 'changed' }, []);
    const data = loadMemory(tmpDir, 'Log');
    expect(data!.entry).toBe('first'); // unchanged
  });
});

// --- LSP multi-field hover ---

describe('v3.0-R7: LSP multi-field hover', () => {
  it('hover shows multi-field reads with brace syntax', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec.task]
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    const hover = getHoverInfo('A', index);
    expect(hover).not.toBeNull();
    expect(hover!.contents).toHaveProperty('value');
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Spec.task');
  });

  it('hover shows field-level writes', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) { task: String }
      memory Log(max_tokens: 2k, storage: file) {
        entry: String
        count: Int
      }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        writes: [Log.entry]
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    const hover = getHoverInfo('A', index);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Log.entry');
  });

  it('hover shows multi-field reads with brace notation', () => {
    const program = parse(`
      context Spec(max_tokens: 1k) {
        task: String
        priority: Int
      }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec.{task, priority}]
        produces OutA { result: String }
      }
    `);
    const index = new ProgramIndex(program);
    const hover = getHoverInfo('A', index);
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Spec.{task, priority}');
  });
});

// --- LSP diagnostic ranges use length ---

describe('v3.0-R7: LSP diagnostic ranges', () => {
  it('diagnostic end character uses location length', async () => {
    const { toDiagnostics } = await import('../src/lsp/features.js');
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test error', { line: 1, column: 1, offset: 0, length: 5 }, 'error', 'SCOPE_UNDEFINED_REF');
    const diagnostics = toDiagnostics([err], []);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.character).toBe(0);
    expect(diagnostics[0].range.end.character).toBe(5);
  });

  it('diagnostic defaults to length 1 when not set', async () => {
    const { toDiagnostics } = await import('../src/lsp/features.js');
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test', { line: 1, column: 3, offset: 2 }, 'warning');
    const diagnostics = toDiagnostics([], [err]);
    expect(diagnostics[0].range.end.character).toBe(3); // column-1 + 1
  });
});
