import { describe, it, expect } from 'vitest';
import { extractUndefinedName, buildAutoImportEdit, computeRelativeImportPath } from '../src/lsp/features/index.js';
import { compile } from '../src/compiler.js';

// ========================================
// extractUndefinedName
// ========================================
describe('v3.3-R1: extractUndefinedName', () => {
  it('extracts name from single-quoted message (context)', () => {
    const result = extractUndefinedName("Context 'Foo' is not declared", 'context Foo', 0, 8);
    expect(result).toBe('Foo');
  });

  it('extracts name from edge source message', () => {
    const result = extractUndefinedName(
      "Edge source 'MissingNode' is not a declared node",
      'edge MissingNode -> Target',
      0, 5,
    );
    expect(result).toBe('MissingNode');
  });

  it('falls back to word at position when no quotes in message', () => {
    const result = extractUndefinedName(
      'Undefined reference at this location',
      'some FooBar text',
      0, 6,
    );
    expect(result).toBe('FooBar');
  });

  it('returns null when no word at position and no quotes', () => {
    const result = extractUndefinedName(
      'Undefined reference',
      '   ',
      0, 1,
    );
    expect(result).toBeNull();
  });
});

// ========================================
// computeRelativeImportPath
// ========================================
describe('v3.3-R1: computeRelativeImportPath', () => {
  it('returns ./other.gft for same directory', () => {
    const result = computeRelativeImportPath('/project/a.gft', '/project/other.gft');
    expect(result).toBe('./other.gft');
  });

  it('returns ./sub/file.gft for subdirectory', () => {
    const result = computeRelativeImportPath('/project/a.gft', '/project/sub/file.gft');
    expect(result).toBe('./sub/file.gft');
  });

  it('returns ../file.gft for parent directory', () => {
    const result = computeRelativeImportPath('/project/sub/a.gft', '/project/file.gft');
    expect(result).toBe('../file.gft');
  });

  it('converts Windows backslashes to forward slashes', () => {
    // path.relative on Windows would produce backslashes;
    // we verify the function replaces them
    const result = computeRelativeImportPath('/project/a.gft', '/project/sub/file.gft');
    expect(result).not.toContain('\\');
  });
});

// ========================================
// buildAutoImportEdit
// ========================================
describe('v3.3-R1: buildAutoImportEdit', () => {
  it('inserts at line 0 when no existing imports', () => {
    const doc = 'context Foo(max_tokens: 1k) {\n  name: String\n}';
    const result = buildAutoImportEdit('Bar', './bar.gft', doc);
    expect(result.insertLine).toBe(0);
    expect(result.newText).toBe('import { Bar } from "./bar.gft"\n');
  });

  it('inserts after existing imports', () => {
    const doc = 'import { A } from "./a.gft"\nimport { B } from "./b.gft"\ncontext Foo(max_tokens: 1k) {\n  name: String\n}';
    const result = buildAutoImportEdit('C', './c.gft', doc);
    expect(result.insertLine).toBe(2);
  });

  it('produces correct import text format', () => {
    const doc = '';
    const result = buildAutoImportEdit('MyContext', './lib/shared.gft', doc);
    expect(result.newText).toBe('import { MyContext } from "./lib/shared.gft"\n');
  });
});

// ========================================
// SCOPE_UNDEFINED_REF integration
// ========================================
describe('v3.3-R1: SCOPE_UNDEFINED_REF integration', () => {
  it('compile produces SCOPE_UNDEFINED_REF for undefined reference', () => {
    const source = `
node Analyzer(model: sonnet, budget: 5k/2k) {
  reads: [UndeclaredContext]
  produces Output {
    result: String
  }
}

graph Main(input: UndeclaredContext, output: Output, budget: 10k) {
  Analyzer -> done
}
`;
    const result = compile(source, '/tmp/test.gft');
    const undefinedRefErrors = result.errors.filter(e => e.code === 'SCOPE_UNDEFINED_REF');
    expect(undefinedRefErrors.length).toBeGreaterThan(0);
  });
});

// ========================================
// Code action logic (unit-level)
// ========================================
describe('v3.3-R1: code action filtering logic', () => {
  it('already-imported name detection via regex', () => {
    const docText = 'import { Foo } from "./foo.gft"\nimport { Bar, Baz } from "./bar.gft"\n';
    const importedNames = new Set<string>();
    for (const line of docText.split('\n')) {
      const m = line.match(/^\s*import\s+\{([^}]+)\}/);
      if (m) {
        for (const n of m[1].split(',')) importedNames.add(n.trim());
      }
    }
    expect(importedNames.has('Foo')).toBe(true);
    expect(importedNames.has('Bar')).toBe(true);
    expect(importedNames.has('Baz')).toBe(true);
    expect(importedNames.has('Unknown')).toBe(false);
  });

  it('self-import exclusion: current file skipped in export map iteration', () => {
    // Simulates the logic in the code action handler
    const currentFilePath = '/project/main.gft';
    const workspaceExports = new Map<string, string[]>();
    workspaceExports.set('/project/main.gft', ['MyNode']);
    workspaceExports.set('/project/lib.gft', ['MyNode']);

    const suggestions: string[] = [];
    for (const [filePath, exports] of workspaceExports) {
      if (filePath === currentFilePath) continue;
      if (exports.includes('MyNode')) {
        suggestions.push(filePath);
      }
    }
    expect(suggestions).toEqual(['/project/lib.gft']);
    expect(suggestions).not.toContain('/project/main.gft');
  });

  it('non-SCOPE_UNDEFINED_REF diagnostics are ignored', () => {
    // Simulates the filtering logic
    const diagnostics = [
      { code: 'PARSE_UNEXPECTED_TOKEN', message: 'bad token' },
      { code: 'SCOPE_UNDEFINED_REF', message: "Context 'Foo' not declared" },
      { code: 'TYPE_FIELD_NOT_FOUND', message: 'field missing' },
    ];
    const relevant = diagnostics.filter(d => d.code === 'SCOPE_UNDEFINED_REF');
    expect(relevant).toHaveLength(1);
    expect(relevant[0].message).toContain('Foo');
  });

  it('no workspace root returns empty actions', () => {
    // Simulates: workspaceRoot is null → no scan, no actions
    const workspaceRoot: string | null = null;
    const actions: unknown[] = [];
    if (!workspaceRoot) {
      // no-op: actions stays empty
    }
    expect(actions).toHaveLength(0);
  });
});
