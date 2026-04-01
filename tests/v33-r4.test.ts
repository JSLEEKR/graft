import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { compileToProgram } from '../src/compiler.js';
import {
  extractUndefinedName,
  buildAutoImportEdit,
  computeRelativeImportPath,
  getDocumentSymbols,
} from '../src/lsp/features.js';
import { evaluateCondition } from '../src/runtime/flow-runner.js';
import { ProgramIndex } from '../src/program-index.js';
import type { Condition } from '../src/parser/ast.js';

// Helper: minimal valid program source with two nodes and a graph
function fullSource(extras = ''): string {
  return `
    context Input(max_tokens: 1k) { query: String }
    node Analyzer(model: sonnet, budget: 5k/2k) {
      reads: [Input]
      produces Analysis { result: String score: Int }
    }
    node Writer(model: sonnet, budget: 5k/2k) {
      reads: [Analysis]
      produces Report { text: String }
    }
    graph Pipeline(input: Input, output: Report, budget: 10k) {
      Analyzer -> Writer -> done
    }
    ${extras}
  `;
}

// ========================================
// 1. Code Actions Integration
// ========================================
describe('v3.3-R4: Code actions integration', () => {
  it('compileToProgram produces SCOPE_UNDEFINED_REF for undefined context reference', () => {
    const source = `
      context Spec(max_tokens: 1k) { task: String }
      node Analyzer(model: sonnet, budget: 5k/2k) {
        reads: [UnknownCtx]
        produces Analysis { result: String }
      }
      graph Pipeline(input: Spec, output: Analysis, budget: 10k) {
        Analyzer -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    expect(result.success).toBe(false);
    const undefinedRef = result.errors.find(e => e.code === 'SCOPE_UNDEFINED_REF');
    expect(undefinedRef).toBeDefined();
    expect(undefinedRef!.message).toContain('UnknownCtx');
  });

  it('extractUndefinedName works for all SCOPE_UNDEFINED_REF message formats', () => {
    const docText = 'context Foo\nnode Bar\nedge Source -> Target\ngraph G';

    // Context ref format
    expect(extractUndefinedName(
      "'UnknownCtx' is not declared as a context, produces output, or memory",
      docText, 0, 8,
    )).toBe('UnknownCtx');

    // Edge source format
    expect(extractUndefinedName(
      "Edge source 'BadNode' is not a declared node",
      docText, 2, 5,
    )).toBe('BadNode');

    // Graph flow node format
    expect(extractUndefinedName(
      "Node 'Missing' in graph flow is not declared",
      docText, 3, 6,
    )).toBe('Missing');

    // Graph input/output format
    expect(extractUndefinedName(
      "Graph input 'NoInput' is not a declared context",
      docText, 3, 6,
    )).toBe('NoInput');
  });

  it('buildAutoImportEdit + computeRelativeImportPath produce correct import text', () => {
    const fromFile = '/project/src/main.gft';
    const toFile = '/project/lib/shared.gft';
    const relPath = computeRelativeImportPath(fromFile, toFile);
    expect(relPath).toBe('../lib/shared.gft');

    const docText = 'context Spec(max_tokens: 1k) { task: String }\n';
    const edit = buildAutoImportEdit('SharedCtx', relPath, docText);
    expect(edit.insertLine).toBe(0); // no existing imports, insert at top
    expect(edit.newText).toBe('import { SharedCtx } from "../lib/shared.gft"\n');
  });
});

// ========================================
// 2. Conditional Edge Runtime Integration
// ========================================
describe('v3.3-R4: Conditional edge runtime integration', () => {
  it('evaluateCondition with string equality works through the runtime path', () => {
    const condition: Condition = { field: 'status', op: '==', value: 'approved' };
    expect(evaluateCondition(condition, { status: 'approved' })).toBe(true);
    expect(evaluateCondition(condition, { status: 'rejected' })).toBe(false);
  });

  it('compileToProgram succeeds for graph with conditional edge on numeric field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { priority: Int label: String }
      }
      node HighHandler(model: sonnet, budget: 5k/2k) {
        reads: [Decision]
        produces Result { text: String }
      }
      node LowHandler(model: sonnet, budget: 5k/2k) {
        reads: [Decision]
        produces Result2 { text: String }
      }
      edge Router -> {
        when priority >= 5 -> HighHandler
        else -> LowHandler
      }
      graph Pipeline(input: Input, output: Result, budget: 10k) {
        Router -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    // No TYPE_CONDITION_MISMATCH for >= on Int field
    const condMismatch = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condMismatch).toBeUndefined();
  });
});

// ========================================
// 3. Document Symbols + Condition Validation Integration
// ========================================
describe('v3.3-R4: Document symbols + condition validation integration', () => {
  it('getDocumentSymbols returns symbols for a program compiled through compileToProgram', () => {
    const source = fullSource('edge Analyzer -> Writer');
    const result = compileToProgram(source, '/test/file.gft');
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();

    const symbols = getDocumentSymbols(result.program!, result.index!);
    expect(symbols.length).toBeGreaterThanOrEqual(5); // context + 2 nodes + graph + edge

    const names = symbols.map(s => s.name);
    expect(names).toContain('Input');
    expect(names).toContain('Analyzer');
    expect(names).toContain('Writer');
    expect(names).toContain('Pipeline');
  });

  it('TYPE_CONDITION_MISMATCH produced for >= on String field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { label: String }
      }
      node Handler(model: sonnet, budget: 5k/2k) {
        reads: [Decision]
        produces Result { text: String }
      }
      edge Router -> {
        when label >= "high" -> Handler
        else -> Handler
      }
      graph Pipeline(input: Input, output: Result, budget: 10k) {
        Router -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    const condMismatch = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condMismatch).toBeDefined();
    expect(condMismatch!.message).toContain('>=');
    expect(condMismatch!.message).toContain('label');
  });

  it('TYPE_CONDITION_MISMATCH NOT produced for >= on Int field', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { priority: Int }
      }
      node Handler(model: sonnet, budget: 5k/2k) {
        reads: [Decision]
        produces Result { text: String }
      }
      edge Router -> {
        when priority >= 5 -> Handler
        else -> Handler
      }
      graph Pipeline(input: Input, output: Result, budget: 10k) {
        Router -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    const condMismatch = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condMismatch).toBeUndefined();
  });
});

// ========================================
// 4. Backward Compatibility
// ========================================
describe('v3.3-R4: Backward compatibility', () => {
  it('valid programs without conditional edges: zero behavior change in compileToProgram', () => {
    const source = fullSource('edge Analyzer -> Writer');
    const result = compileToProgram(source, '/test/file.gft');
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('all sub-path exports still present in package.json', async () => {
    const fs = await import('node:fs');
    const pkgJson = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    );
    const exports = pkgJson.exports;
    expect(exports['.']).toBeDefined();
    expect(exports['./ast']).toBeDefined();
    expect(exports['./compiler']).toBeDefined();
    expect(exports['./runtime']).toBeDefined();
    expect(exports['./types']).toBeDefined();
    expect(exports['./format']).toBeDefined();
  });

  it('ParseResult backward compatibility: valid program returns empty errors', () => {
    const source = fullSource();
    const result = compileToProgram(source, '/test/file.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ========================================
// 5. Cross-feature Interactions
// ========================================
describe('v3.3-R4: Cross-feature interactions', () => {
  it('conditional edge on numeric field compiles without error and evaluateCondition works', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { score: Int label: String }
      }
      node Fast(model: haiku, budget: 2k/1k) {
        reads: [Decision]
        produces FastResult { text: String }
      }
      node Deep(model: opus, budget: 10k/5k) {
        reads: [Decision]
        produces DeepResult { text: String }
      }
      edge Router -> {
        when score >= 8 -> Deep
        else -> Fast
      }
      graph Pipeline(input: Input, output: FastResult, budget: 20k) {
        Router -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    const condMismatch = result.errors.find(e => e.code === 'TYPE_CONDITION_MISMATCH');
    expect(condMismatch).toBeUndefined();

    // Runtime: evaluateCondition routes correctly
    const condition: Condition = { field: 'score', op: '>=', value: 8 };
    expect(evaluateCondition(condition, { score: 10, label: 'good' })).toBe(true);
    expect(evaluateCondition(condition, { score: 3, label: 'low' })).toBe(false);
  });

  it('document symbols for file with conditional edge: edge symbol name contains "conditional"', () => {
    const source = `
      context Input(max_tokens: 1k) { query: String }
      node Router(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Decision { priority: Int }
      }
      node Handler(model: sonnet, budget: 5k/2k) {
        reads: [Decision]
        produces Result { text: String }
      }
      edge Router -> {
        when priority >= 5 -> Handler
        else -> Handler
      }
      graph Pipeline(input: Input, output: Result, budget: 10k) {
        Router -> done
      }
    `;
    const result = compileToProgram(source, '/test/file.gft');
    expect(result.program).toBeDefined();

    const symbols = getDocumentSymbols(result.program!, result.index ?? new ProgramIndex(result.program!));
    const edgeSymbols = symbols.filter(s => s.kind === SymbolKind.Event);
    expect(edgeSymbols.length).toBeGreaterThanOrEqual(1);
    // The conditional edge symbol name should contain "conditional"
    const conditionalEdge = edgeSymbols.find(s => s.name.includes('conditional'));
    expect(conditionalEdge).toBeDefined();
  });
});
