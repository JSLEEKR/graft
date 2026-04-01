import { describe, it, expect, beforeEach } from 'vitest';
import { compile } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';
import { ProgramIndex } from '../src/program-index.js';
import { PARTIAL_FIELD_FACTOR } from '../src/constants.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { toDiagnostics, getHoverInfo } from '../src/lsp/features/index.js';
import { DiagnosticSeverity, MarkupKind } from 'vscode-languageserver/node';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ========================================
// 1. End-to-end compile with all v2.2 changes
// ========================================
describe('v2.2 end-to-end compile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graft-v22-'));
  });

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('compile with imports: ProgramIndex resolves context/node/memory lookups', () => {
    const sharedSource = `
context SharedCtx(max_tokens: 500) {
  data: String
}
`;
    const mainSource = `
import { SharedCtx } from "./shared.gft"

memory Log(max_tokens: 1k, storage: file) {
  entries: List<String>
}

node Worker(model: sonnet, budget: 2k/1k) {
  reads: [SharedCtx, Log]
  writes: [Log]
  produces Result {
    output: String
  }
}

graph Pipeline(input: SharedCtx, output: Result, budget: 5k) {
  Worker -> done
}
`;
    writeFile('shared.gft', sharedSource);
    const mainPath = writeFile('main.gft', mainSource);
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    const result = compile(mainContent, mainPath);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    // Build ProgramIndex and verify all lookups succeed
    const index = new ProgramIndex(result.program!);
    expect(index.contextMap.has('SharedCtx')).toBe(true);
    expect(index.nodeMap.has('Worker')).toBe(true);
    expect(index.memoryMap.has('Log')).toBe(true);
    expect(index.producesNodeMap.has('Result')).toBe(true);
  });

  it('compile with error codes: GraftError has code field on diagnostics', () => {
    // Source that triggers a scope error (undefined reference)
    const source = `
node Worker(model: sonnet, budget: 2k/1k) {
  reads: [NonExistentCtx]
  produces Result {
    output: String
  }
}

graph Pipeline(input: NonExistentCtx, output: Result, budget: 5k) {
  Worker -> done
}
`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // Every error should be a GraftError with a code
    for (const err of result.errors) {
      expect(err).toBeInstanceOf(GraftError);
      expect(err.code).toBeDefined();
      expect(typeof err.code).toBe('string');
    }
  });

  it('compile with sourceFile tracking: imported declarations have sourceFile set', () => {
    const sharedSource = `
context ImportedCtx(max_tokens: 300) {
  value: String
}
`;
    const mainSource = `
import { ImportedCtx } from "./shared.gft"

node Reader(model: haiku, budget: 1k/500) {
  reads: [ImportedCtx]
  produces Output { text: String }
}

graph G(input: ImportedCtx, output: Output, budget: 3k) {
  Reader -> done
}
`;
    writeFile('shared.gft', sharedSource);
    const mainPath = writeFile('main.gft', mainSource);
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    const result = compile(mainContent, mainPath);
    expect(result.success).toBe(true);

    // The imported context should have sourceFile set to the shared.gft path
    const importedCtx = result.program!.contexts.find(c => c.name === 'ImportedCtx');
    expect(importedCtx).toBeDefined();
    expect(importedCtx!.sourceFile).toBeDefined();
    expect(importedCtx!.sourceFile).toContain('shared.gft');
  });
});

// ========================================
// 2. LSP integration tests
// ========================================
describe('v2.2 LSP integration', () => {
  it('round-trip: .gft source -> compile -> toDiagnostics -> LSP diagnostic format', () => {
    // Source with a budget warning (worst case exceeds budget)
    const source = `
context BigCtx(max_tokens: 5000) {
  data: String
}

node Heavy(model: sonnet, budget: 4k/3k) {
  reads: [BigCtx]
  produces Out { result: String }
}

graph G(input: BigCtx, output: Out, budget: 3k) {
  Heavy -> done
}
`;
    const result = compile(source, 'test.gft');
    // This should compile but produce warnings (budget exceeded)
    const diagnostics = toDiagnostics(result.errors, result.warnings);

    // If there are warnings, verify LSP format
    if (diagnostics.length > 0) {
      for (const d of diagnostics) {
        // 0-based positions
        expect(d.range.start.line).toBeGreaterThanOrEqual(0);
        expect(d.range.start.character).toBeGreaterThanOrEqual(0);
        expect(d.source).toBe('graft');
        expect(d.message).toBeDefined();
        expect(typeof d.message).toBe('string');
        // severity is a number (DiagnosticSeverity enum)
        expect([DiagnosticSeverity.Error, DiagnosticSeverity.Warning]).toContain(d.severity);
      }
    }

    // Also verify with a broken source that produces errors
    const badResult = compile('@@@', 'bad.gft');
    const errorDiags = toDiagnostics(badResult.errors, badResult.warnings);
    expect(errorDiags.length).toBeGreaterThan(0);
    expect(errorDiags[0].severity).toBe(DiagnosticSeverity.Error);
    expect(errorDiags[0].source).toBe('graft');
    // Code should be present if the GraftError has one
    if (badResult.errors[0].code) {
      expect(errorDiags[0].code).toBe(badResult.errors[0].code);
    }
  });

  it('hover after compile: compile -> getHoverInfo on context name -> verify fields', () => {
    const source = `
context TaskSpec(max_tokens: 1000) {
  title: String
  priority: Int
}

node Processor(model: sonnet, budget: 2k/1k) {
  reads: [TaskSpec]
  produces Result { output: String }
}

graph G(input: TaskSpec, output: Result, budget: 5k) {
  Processor -> done
}
`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);

    const index = new ProgramIndex(result.program!);
    const hover = getHoverInfo('TaskSpec', index);

    expect(hover).not.toBeNull();
    const value = (hover!.contents as { kind: string; value: string }).value;
    expect(value).toContain('**context** TaskSpec');
    expect(value).toContain('max_tokens: 1000');
    expect(value).toContain('title: String');
    expect(value).toContain('priority: Int');
  });
});

// ========================================
// 3. npm package verification
// ========================================
describe('v2.2 npm package verification', () => {
  it('package.json files field includes dist/ and excludes src/, tests/, harness/', () => {
    const root = resolve(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

    const files: string[] = pkg.files;
    expect(files).toBeDefined();

    // Must include dist/
    expect(files.some((f: string) => f.includes('dist'))).toBe(true);

    // Must NOT include src/, tests/, harness/
    expect(files.some((f: string) => f.startsWith('src'))).toBe(false);
    expect(files.some((f: string) => f.startsWith('tests'))).toBe(false);
    expect(files.some((f: string) => f.startsWith('harness'))).toBe(false);
  });

  it('tsconfig outDir targets dist/ for built output', () => {
    const root = resolve(import.meta.dirname, '..');
    const tsconfig = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf-8'));

    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.outDir).toBeDefined();
    expect(tsconfig.compilerOptions.outDir).toContain('dist');
  });
});

// ========================================
// 4. v2.1 adversarial test backlog
// ========================================

// 4a: PARTIAL_FIELD_FACTOR propagation to select transform
describe('v2.2 adversarial: PARTIAL_FIELD_FACTOR with select transform', () => {
  it('select transform uses PARTIAL_FIELD_FACTOR per selected field, not full context budget', () => {
    const source = `
context Input(max_tokens: 1000) {
  alpha: String
  beta: String
  gamma: String
}

node Producer(model: sonnet, budget: 2k/1k) {
  reads: [Input]
  produces Data {
    alpha: String
    beta: String
    gamma: String
  }
}

node Consumer(model: sonnet, budget: 2k/1k) {
  reads: [Data]
  produces Final { result: String }
}

edge Producer -> Consumer
  | select(alpha)

graph G(input: Input, output: Final, budget: 10k) {
  Producer -> Consumer -> done
}
`;
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);

    // Find Consumer's estimated input
    const consumerReport = result.report!.nodes.find(n => n.name === 'Consumer');
    expect(consumerReport).toBeDefined();

    // Producer budgetOut = 1000
    // select(alpha) applies: floor(1000 * PARTIAL_FIELD_FACTOR * 1) = floor(1000 * 0.3) = 300
    const expectedIn = Math.floor(1000 * PARTIAL_FIELD_FACTOR * 1);
    expect(consumerReport!.estimatedIn).toBe(expectedIn);

    // Verify PARTIAL_FIELD_FACTOR is 0.3
    expect(PARTIAL_FIELD_FACTOR).toBe(0.3);
  });
});

// 4b: Three-or-more parallel branches grammar
describe('v2.2 adversarial: parallel with 3+ branches', () => {
  it('parser accepts parallel with 3 branches', () => {
    const source = `
context Req(max_tokens: 500) { data: String }

node A(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RA { x: String }
}
node B(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RB { x: String }
}
node C(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RC { x: String }
}

graph G(input: Req, output: RA, budget: 10k) {
  parallel { A B C } -> done
}
`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse().program;

    const parallelStep = program.graphs[0].flow[0];
    expect(parallelStep.kind).toBe('parallel');
    if (parallelStep.kind === 'parallel') {
      expect(parallelStep.branches).toHaveLength(3);
      expect(parallelStep.branches).toEqual(['A', 'B', 'C']);
    }
  });

  it('parser accepts parallel with 4 branches', () => {
    const source = `
context Req(max_tokens: 500) { data: String }

node A(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RA { x: String }
}
node B(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RB { x: String }
}
node C(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RC { x: String }
}
node D(model: haiku, budget: 1k/500) {
  reads: [Req]
  produces RD { x: String }
}

graph G(input: Req, output: RA, budget: 10k) {
  parallel { A B C D } -> done
}
`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse().program;

    const parallelStep = program.graphs[0].flow[0];
    expect(parallelStep.kind).toBe('parallel');
    if (parallelStep.kind === 'parallel') {
      expect(parallelStep.branches).toHaveLength(4);
      expect(parallelStep.branches).toEqual(['A', 'B', 'C', 'D']);
    }
  });
});

// 4c: Object with `result` but no metadata treated as envelope
describe('v2.2 adversarial: parseCLIOutput envelope detection', () => {
  let parseCLIOutput: typeof import('../src/runtime/subprocess.js').parseCLIOutput;

  beforeEach(async () => {
    const mod = await import('../src/runtime/subprocess.js');
    parseCLIOutput = mod.parseCLIOutput;
  });

  it('object with result but NO metadata fields is NOT treated as envelope', () => {
    // { "result": "hello" } has result but no usage/model/cost_usd
    const stdout = JSON.stringify({ result: 'hello' });
    const out = parseCLIOutput(stdout);

    // Should NOT unwrap result — should return the raw object via extractJson fallback
    // Since it's valid JSON but not an envelope, extractJson returns the whole object
    expect(out.content).toEqual({ result: 'hello' });
    expect(out.tokenUsage).toBeUndefined();
  });

  it('object with result AND usage metadata IS treated as envelope', () => {
    const stdout = JSON.stringify({
      result: 'hello',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const out = parseCLIOutput(stdout);

    // Should unwrap result since usage is a metadata field
    expect(out.content).toBe('hello');
    expect(out.tokenUsage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
  });
});

// 4d: Zero-budget graph with actual token usage
describe('v2.2 adversarial: zero-budget TokenTracker', () => {
  let TokenTracker: typeof import('../src/runtime/token-tracker.js').TokenTracker;

  beforeEach(async () => {
    const mod = await import('../src/runtime/token-tracker.js');
    TokenTracker = mod.TokenTracker;
  });

  it('zero budget with actual usage: fraction is 0, no NaN/Infinity, no warnings', () => {
    const tracker = new TokenTracker(0);
    tracker.record('NodeA', { inputTokens: 500, outputTokens: 200 }, { in: 1000, out: 500 });

    expect(tracker.fraction).toBe(0);
    expect(Number.isNaN(tracker.fraction)).toBe(false);
    expect(Number.isFinite(tracker.fraction)).toBe(true);
    expect(tracker.isWarning).toBe(false);
    expect(tracker.isCritical).toBe(false);

    // totalConsumed should still track actual usage
    expect(tracker.totalConsumed).toBe(700);
  });
});
