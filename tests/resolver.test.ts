import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolve, FileReader } from '../src/resolver/resolver.js';

/**
 * Helper: builds a map-based FileReader mock.
 * Keys are absolute paths; values are file contents.
 */
function mockReader(files: Record<string, string>): FileReader {
  return (absPath: string) => {
    // Normalize to forward slashes for cross-platform consistency
    const normalized = absPath.replace(/\\/g, '/');
    for (const [key, value] of Object.entries(files)) {
      const normalizedKey = key.replace(/\\/g, '/');
      if (normalized === normalizedKey || normalized.endsWith(normalizedKey)) {
        return value;
      }
    }
    throw new Error(`ENOENT: no such file or directory, open '${absPath}'`);
  };
}

/** Resolve helper that sets sourceFile to a fixed base path */
function testResolve(source: string, files: Record<string, string> = {}) {
  const sourceFile = path.resolve('/project/main.gft');
  // Remap file keys to absolute paths relative to /project/
  const absFiles: Record<string, string> = {};
  for (const [key, value] of Object.entries(files)) {
    absFiles[path.resolve('/project', key)] = value;
  }
  return resolve(source, sourceFile, mockReader(absFiles));
}

describe('Import Resolver', () => {
  it('passes through program with no imports', () => {
    const source = `
      context Spec(max_tokens: 500) { question: String }
      node Worker(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces Out { answer: String }
      }
    `;
    const result = testResolve(source);
    expect(result.errors).toEqual([]);
    expect(result.program.contexts).toHaveLength(1);
    expect(result.program.nodes).toHaveLength(1);
  });

  it('imports a context from another file', () => {
    const libSource = `
      context SharedCtx(max_tokens: 1k) {
        data: String
      }
    `;
    const mainSource = `import { SharedCtx } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toEqual([]);
    expect(result.program.contexts).toHaveLength(1);
    expect(result.program.contexts[0].name).toBe('SharedCtx');
  });

  it('imports a node from another file', () => {
    const libSource = `
      context Input(max_tokens: 500) { q: String }
      node Helper(model: haiku, budget: 1k/500) {
        reads: [Input]
        produces HOut { answer: String }
      }
    `;
    const mainSource = `import { Helper } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toEqual([]);
    expect(result.program.nodes).toHaveLength(1);
    expect(result.program.nodes[0].name).toBe('Helper');
  });

  it('imports multiple names from one file', () => {
    const libSource = `
      context A(max_tokens: 500) { x: String }
      context B(max_tokens: 500) { y: String }
    `;
    const mainSource = `import { A, B } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toEqual([]);
    expect(result.program.contexts).toHaveLength(2);
  });

  it('sets resolvedPath on ImportDecl (v2.0-R05)', () => {
    const libSource = `context Foo(max_tokens: 500) { x: String }`;
    const mainSource = `import { Foo } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toEqual([]);
    expect(result.program.imports[0].resolvedPath).toBe(
      path.resolve('/project/lib.gft'),
    );
  });

  it('prevents transitive re-export (CRITICAL invariant)', () => {
    // A.gft imports B from b.gft; b.gft imports C from c.gft
    // main imports from a.gft -- should only see A's direct exports, NOT C
    const cSource = `context Deep(max_tokens: 500) { z: String }`;
    const bSource = `
      import { Deep } from "./c.gft"
      context Mid(max_tokens: 500) { y: String }
    `;
    const aSource = `
      import { Mid } from "./b.gft"
      context Top(max_tokens: 500) { x: String }
    `;
    const mainSource = `import { Deep } from "./a.gft"`;
    const result = testResolve(mainSource, {
      'a.gft': aSource,
      'b.gft': bSource,
      'c.gft': cSource,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('"Deep" not found');
    expect(result.errors[0].message).toContain('Available: Top');
  });

  it('detects self-import as circular', () => {
    const mainSource = `import { X } from "./main.gft"`;
    const result = testResolve(mainSource, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Circular import');
  });

  it('detects A -> B -> A circular import', () => {
    const bSource = `
      import { X } from "./main.gft"
      context BCtx(max_tokens: 500) { y: String }
    `;
    const mainSource = `import { BCtx } from "./b.gft"`;
    const result = testResolve(mainSource, { 'b.gft': bSource });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Circular import');
  });

  it('handles diamond imports without duplicate errors', () => {
    // main imports from a.gft and b.gft; both import from shared.gft
    const sharedSource = `context Shared(max_tokens: 500) { x: String }`;
    const aSource = `
      import { Shared } from "./shared.gft"
      context A(max_tokens: 500) { a: String }
    `;
    const bSource = `
      import { Shared } from "./shared.gft"
      context B(max_tokens: 500) { b: String }
    `;
    const mainSource = `
      import { A } from "./a.gft"
      import { B } from "./b.gft"
    `;
    const result = testResolve(mainSource, {
      'a.gft': aSource,
      'b.gft': bSource,
      'shared.gft': sharedSource,
    });
    expect(result.errors).toEqual([]);
    expect(result.program.contexts).toHaveLength(2);
  });

  it('parses diamond import target only once', () => {
    const sharedSource = `context Shared(max_tokens: 500) { x: String }`;
    const aSource = `
      import { Shared } from "./shared.gft"
      context A(max_tokens: 500) { a: String }
    `;
    const bSource = `
      import { Shared } from "./shared.gft"
      context B(max_tokens: 500) { b: String }
    `;
    let readCount = 0;
    const absShared = path.resolve('/project/shared.gft');
    const files: Record<string, string> = {
      [path.resolve('/project/a.gft')]: aSource,
      [path.resolve('/project/b.gft')]: bSource,
      [absShared]: sharedSource,
    };
    const countingReader: FileReader = (p: string) => {
      const normalized = p.replace(/\\/g, '/');
      const normalizedShared = absShared.replace(/\\/g, '/');
      if (normalized === normalizedShared) readCount++;
      const content = files[p];
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    };
    const mainSource = `
      import { A } from "./a.gft"
      import { B } from "./b.gft"
    `;
    resolve(mainSource, path.resolve('/project/main.gft'), countingReader);
    expect(readCount).toBe(1);
  });

  it('reports file not found error', () => {
    const mainSource = `import { X } from "./missing.gft"`;
    const result = testResolve(mainSource, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('not found');
    expect(result.errors[0].message).toContain('missing.gft');
  });

  it('reports name not found with suggestions', () => {
    const libSource = `
      context Alpha(max_tokens: 500) { x: String }
      context Beta(max_tokens: 500) { y: String }
    `;
    const mainSource = `import { Gamma } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('"Gamma" not found');
    expect(result.errors[0].message).toContain('Alpha');
    expect(result.errors[0].message).toContain('Beta');
  });

  it('reports no importable declarations for empty file', () => {
    const emptySource = ``;
    const mainSource = `import { X } from "./empty.gft"`;
    const result = testResolve(mainSource, { 'empty.gft': emptySource });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('no importable declarations');
  });

  it('detects local + imported name conflict', () => {
    const libSource = `context Dup(max_tokens: 500) { x: String }`;
    const mainSource = `
      import { Dup } from "./lib.gft"
      context Dup(max_tokens: 500) { y: String }
    `;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Duplicate name "Dup"');
  });

  it('detects same name imported from two files', () => {
    const lib1 = `context Same(max_tokens: 500) { x: String }`;
    const lib2 = `context Same(max_tokens: 500) { y: String }`;
    const mainSource = `
      import { Same } from "./lib1.gft"
      import { Same } from "./lib2.gft"
    `;
    const result = testResolve(mainSource, {
      'lib1.gft': lib1,
      'lib2.gft': lib2,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Duplicate name "Same"');
  });

  it('rejects import path without .gft extension', () => {
    const mainSource = `import { X } from "./lib.txt"`;
    const result = testResolve(mainSource, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('must end with .gft');
  });

  it('reports parse error in imported file', () => {
    const badSource = `context Broken(max_tokens: ???) { }`;
    const mainSource = `import { Broken } from "./bad.gft"`;
    const result = testResolve(mainSource, { 'bad.gft': badSource });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Error parsing imported file');
  });

  it('handles entry file parse error gracefully', () => {
    const badMain = `context Broken(max_tokens: ???) {`;
    const result = testResolve(badMain, {});
    expect(result.errors).toHaveLength(1);
    expect(result.program.contexts).toEqual([]);
  });

  it('accumulates multiple errors', () => {
    const mainSource = `
      import { X } from "./missing1.gft"
      import { Y } from "./missing2.gft"
    `;
    const result = testResolve(mainSource, {});
    expect(result.errors).toHaveLength(2);
  });

  it('tracks resolvedFiles for all visited files', () => {
    const libSource = `context Lib(max_tokens: 500) { x: String }`;
    const mainSource = `import { Lib } from "./lib.gft"`;
    const result = testResolve(mainSource, { 'lib.gft': libSource });
    expect(result.errors).toEqual([]);
    expect(result.resolvedFiles).toHaveLength(2);
    expect(result.resolvedFiles[0]).toBe(path.resolve('/project/main.gft'));
    expect(result.resolvedFiles[1]).toBe(path.resolve('/project/lib.gft'));
  });
});
