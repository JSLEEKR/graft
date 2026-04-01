import { describe, it, expect } from 'vitest';
import { SymbolKind, CodeActionKind, DiagnosticSeverity } from 'vscode-languageserver/node';
import type { Diagnostic } from 'vscode-languageserver/node';
import { compileToProgram } from '../src/compiler.js';
import { isRenameable, collectRenameLocations } from '../src/lsp/features/rename.js';
import { getDocumentSymbols } from '../src/lsp/features/symbols.js';
import { buildAutoImportActions, computeRelativeImportPath, buildAutoImportEdit } from '../src/lsp/features/code-actions.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { ProgramIndex } from '../src/program-index.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import type { Program } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

const FULL_PROGRAM = `
  context TaskSpec(max_tokens: 1000) {
    title: String
    description: String
  }

  memory SessionLog(max_tokens: 2000, storage: file) {
    entries: List<String>
  }

  node Analyzer(model: sonnet, budget: 5k/2k) {
    reads: [TaskSpec]
    writes: [SessionLog]
    produces Analysis {
      result: String
      confidence: Int
    }
  }

  node Reviewer(model: opus, budget: 3k/1k) {
    reads: [Analysis]
    produces Review {
      verdict: String
    }
  }

  edge Analyzer -> Reviewer | select(result)

  graph MainFlow(input: TaskSpec, output: Review, budget: 50k) {
    Analyzer -> Reviewer -> done
  }
`;

// ========================================
// Cross-cutting: rename + compile
// ========================================
describe('v3.4-R4 integration tests', () => {
  describe('rename + compile cross-cutting', () => {
    it('isRenameable works for all declaration types in a compiled program', () => {
      const result = compileToProgram(FULL_PROGRAM, 'test.gft');
      expect(result.success).toBe(true);
      const index = result.index!;

      expect(isRenameable('TaskSpec', index)).toBe(true);
      expect(isRenameable('Analyzer', index)).toBe(true);
      expect(isRenameable('SessionLog', index)).toBe(true);
      expect(isRenameable('MainFlow', index)).toBe(true);
      // Field names and unknown names should not be renameable
      expect(isRenameable('title', index)).toBe(false);
      expect(isRenameable('NonExistent', index)).toBe(false);
    });

    it('collectRenameLocations finds references across reads, writes, edges, and graph flow', () => {
      const locs = collectRenameLocations(FULL_PROGRAM, 'Analyzer');
      // Should find: node declaration, edge source, graph flow reference
      expect(locs.length).toBeGreaterThanOrEqual(3);

      const locsTaskSpec = collectRenameLocations(FULL_PROGRAM, 'TaskSpec');
      // Should find: context declaration, reads reference, graph input reference
      expect(locsTaskSpec.length).toBeGreaterThanOrEqual(3);

      const locsSessionLog = collectRenameLocations(FULL_PROGRAM, 'SessionLog');
      // Should find: memory declaration, writes reference
      expect(locsSessionLog.length).toBeGreaterThanOrEqual(2);
    });

    it('collectRenameLocations finds import references', () => {
      const source = `import { TaskSpec } from "./lib.gft"
node Worker(model: sonnet, budget: 1k/500) {
  reads: [TaskSpec]
  produces Out { x: String }
}`;
      const locs = collectRenameLocations(source, 'TaskSpec');
      // Should find: import reference and reads reference
      expect(locs.length).toBeGreaterThanOrEqual(2);
      // First location should be in the import line
      expect(locs[0].start.line).toBe(0);
    });
  });

  // ========================================
  // Cross-cutting: estimation + conditional routing
  // ========================================
  describe('estimation + conditional routing cross-cutting', () => {
    it('conditional edges produce correct best/worst case estimates', () => {
      const program = parse(`
        context Spec(max_tokens: 500) { name: String }
        node Router(model: sonnet, budget: 1k/500) {
          reads: [Spec]
          produces RouterOut { result: String }
        }
        node Fast(model: haiku, budget: 500/200) {
          reads: [RouterOut]
          produces FastOut { result: String }
        }
        node Thorough(model: opus, budget: 3k/2k) {
          reads: [RouterOut]
          produces ThoroughOut { result: String }
        }
        edge Router -> {
          when complexity > 0.7 -> Thorough
          else -> Fast
        }
        graph G(input: Spec, output: RouterOut, budget: 50k) { Router -> done }
      `);
      const estimator = new TokenEstimator(program);
      const report = estimator.estimate();

      // Router: 500 in + 500 out = 1000
      // Fast: 500 (RouterOut budget) + 200 = 700
      // Thorough: 500 (RouterOut budget) + 2000 = 2500
      expect(report.bestCase).toBe(1000 + 700);
      expect(report.worstCase).toBe(1000 + 2500);
    });

    it('mixed direct and conditional edges produce correct estimates', () => {
      const program = parse(`
        context Spec(max_tokens: 500) { name: String }
        node A(model: sonnet, budget: 1k/500) {
          reads: [Spec]
          produces OutA { result: String }
        }
        node B(model: sonnet, budget: 1k/500) {
          reads: [OutA]
          produces OutB { result: String }
        }
        node C(model: haiku, budget: 500/100) {
          reads: [OutA]
          produces OutC { result: String }
        }
        node D(model: opus, budget: 2k/1k) {
          reads: [OutA]
          produces OutD { result: String }
        }
        edge A -> B | select(result)
        edge A -> {
          when score > 0.5 -> D
          else -> C
        }
        graph G(input: Spec, output: OutB, budget: 50k) { A -> B -> done }
      `);
      const estimator = new TokenEstimator(program);
      const report = estimator.estimate();

      // A: 500 in + 500 out = 1000
      // B reads OutA via edge A->B with select(result): floor(500*0.3)=150 in + 500 out = 650
      // C reads OutA (no edge transform): 500 in + 100 out = 600
      // D reads OutA (no edge transform): 500 in + 1000 out = 1500
      // Best: A(1000) + B(650) + C(600) = 2250
      // Worst: A(1000) + B(650) + D(1500) = 3150
      expect(report.bestCase).toBe(1000 + 650 + 600);
      expect(report.worstCase).toBe(1000 + 650 + 1500);
    });
  });

  // ========================================
  // Cross-cutting: hierarchical symbols + compile
  // ========================================
  describe('hierarchical symbols + compile cross-cutting', () => {
    it('getDocumentSymbols returns symbols with correct children for a full program', () => {
      const result = compileToProgram(FULL_PROGRAM, 'test.gft');
      expect(result.success).toBe(true);
      const symbols = getDocumentSymbols(result.program!, result.index!);

      // Should have: context, memory, 2 nodes, 1 edge, 1 graph = 6 symbols
      expect(symbols.length).toBe(6);

      const contextSym = symbols.find(s => s.name === 'TaskSpec')!;
      expect(contextSym).toBeDefined();
      expect(contextSym.kind).toBe(SymbolKind.Class);
      expect(contextSym.children).toHaveLength(2); // title, description
      expect(contextSym.children![0].kind).toBe(SymbolKind.Field);

      const memorySym = symbols.find(s => s.name === 'SessionLog')!;
      expect(memorySym).toBeDefined();
      expect(memorySym.children).toHaveLength(1); // entries
      expect(memorySym.children![0].kind).toBe(SymbolKind.Field);
    });

    it('context symbol has field children with SymbolKind.Field', () => {
      const result = compileToProgram(FULL_PROGRAM, 'test.gft');
      const symbols = getDocumentSymbols(result.program!, result.index!);
      const contextSym = symbols.find(s => s.name === 'TaskSpec')!;

      for (const child of contextSym.children!) {
        expect(child.kind).toBe(SymbolKind.Field);
      }
      expect(contextSym.children!.map(c => c.name)).toEqual(['title', 'description']);
    });

    it('graph symbol has flow node children with SymbolKind.Function', () => {
      const result = compileToProgram(FULL_PROGRAM, 'test.gft');
      const symbols = getDocumentSymbols(result.program!, result.index!);
      const graphSym = symbols.find(s => s.name === 'MainFlow')!;

      expect(graphSym).toBeDefined();
      expect(graphSym.kind).toBe(SymbolKind.Module);
      expect(graphSym.children).toHaveLength(2); // Analyzer, Reviewer
      for (const child of graphSym.children!) {
        expect(child.kind).toBe(SymbolKind.Function);
      }
      expect(graphSym.children!.map(c => c.name)).toEqual(['Analyzer', 'Reviewer']);
    });
  });

  // ========================================
  // Code action extraction cross-cutting
  // ========================================
  describe('code action extraction cross-cutting', () => {
    it('buildAutoImportActions produces correct actions for SCOPE_UNDEFINED_REF diagnostics', () => {
      const docText = 'node Worker(model: sonnet, budget: 1k/500) {\n  reads: [TaskSpec]\n  produces Out { x: String }\n}';
      const diags: Diagnostic[] = [{
        range: {
          start: { line: 1, character: 10 },
          end: { line: 1, character: 18 },
        },
        message: "Undefined reference 'TaskSpec'",
        severity: DiagnosticSeverity.Error,
        source: 'graft',
        code: 'SCOPE_UNDEFINED_REF',
      }];
      const exports = new Map<string, string[]>();
      exports.set('/project/contexts.gft', ['TaskSpec']);

      const actions = buildAutoImportActions(
        docText,
        'file:///project/main.gft',
        '/project/main.gft',
        diags,
        exports,
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].title).toContain('TaskSpec');
      expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
      expect(actions[0].edit).toBeDefined();
    });

    it('computeRelativeImportPath produces correct relative paths', () => {
      // Same directory
      expect(computeRelativeImportPath('/project/main.gft', '/project/lib.gft'))
        .toBe('./lib.gft');

      // Subdirectory
      expect(computeRelativeImportPath('/project/main.gft', '/project/sub/lib.gft'))
        .toBe('./sub/lib.gft');

      // Parent directory
      expect(computeRelativeImportPath('/project/sub/main.gft', '/project/lib.gft'))
        .toBe('../lib.gft');

      // Sibling directory
      expect(computeRelativeImportPath('/project/a/main.gft', '/project/b/lib.gft'))
        .toBe('../b/lib.gft');
    });
  });

  // ========================================
  // Regression tests
  // ========================================
  describe('regression tests', () => {
    it('direct edges still estimated correctly after conditional edge support', () => {
      const program = parse(`
        context Spec(max_tokens: 500) { name: String }
        node A(model: sonnet, budget: 1k/500) {
          reads: [Spec]
          produces OutA { result: String }
        }
        node B(model: sonnet, budget: 1k/500) {
          reads: [OutA]
          produces OutB { result: String }
        }
        edge A -> B | select(result)
        graph G(input: Spec, output: OutB, budget: 50k) { A -> B -> done }
      `);
      const estimator = new TokenEstimator(program);
      const report = estimator.estimate();

      // A: 500 in + 500 out = 1000
      // B reads OutA via edge A->B with select(result): floor(500*0.3)=150 in + 500 out = 650
      // Total: 1650
      expect(report.bestCase).toBe(1650);
      expect(report.worstCase).toBe(1650);
    });

    it('features/ split: all previously exported functions are still accessible via index', async () => {
      const mod = await import('../src/lsp/features/index.js');

      // All public functions from pre-split features.ts must still be available
      expect(typeof mod.toDiagnostics).toBe('function');
      expect(typeof mod.extractUndefinedName).toBe('function');
      expect(typeof mod.getHoverInfo).toBe('function');
      expect(typeof mod.formatType).toBe('function');
      expect(typeof mod.getCompletions).toBe('function');
      expect(typeof mod.getDefinitionLocation).toBe('function');
      expect(typeof mod.getDocumentSymbols).toBe('function');
      expect(typeof mod.buildAutoImportActions).toBe('function');
      expect(typeof mod.buildAutoImportEdit).toBe('function');
      expect(typeof mod.computeRelativeImportPath).toBe('function');
      expect(typeof mod.isRenameable).toBe('function');
      expect(typeof mod.collectRenameLocations).toBe('function');
      expect(typeof mod.getWordAtPosition).toBe('function');
      expect(typeof mod.makeSymbol).toBe('function');
    });
  });
});
