import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ProgramIndex } from '../src/program-index.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { CodegenBackend, CodegenContext } from '../src/codegen/backend.js';
import { ClaudeCodeBackend } from '../src/codegen/claude-backend.js';
import { generate, GeneratedFile } from '../src/codegen/codegen.js';
import { generateSettings } from '../src/codegen/settings.js';
import { compileToProgram, compileAndGenerate } from '../src/compiler.js';
import type { NodeDecl, EdgeDecl } from '../src/parser/ast.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().program;
}

const BASIC_SOURCE = `
  context Spec(max_tokens: 2k) { task: String }
  node Researcher(model: sonnet, budget: 5k/2k) {
    reads: [Spec]
    produces Research { findings: String }
  }
  graph G(input: Spec, output: Research, budget: 10k) { Researcher -> done }
`;

// --- ProgramIndex.graphMap ---

describe('v3.0-R3: ProgramIndex.graphMap', () => {
  it('indexes graphs by name', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    expect(index.graphMap.size).toBe(1);
    expect(index.graphMap.get('G')).toBeDefined();
    expect(index.graphMap.get('G')!.name).toBe('G');
  });

  it('returns undefined for non-existent graph', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    expect(index.graphMap.get('Nonexistent')).toBeUndefined();
  });

  it('indexes multiple graphs', () => {
    const program = parse(`
      context Spec(max_tokens: 2k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      graph G1(input: Spec, output: OutA, budget: 10k) { A -> done }
      graph G2(input: Spec, output: OutA, budget: 20k) { A -> done }
    `);
    const index = new ProgramIndex(program);
    expect(index.graphMap.size).toBe(2);
    expect(index.graphMap.get('G1')!.budget).toBe(10000);
    expect(index.graphMap.get('G2')!.budget).toBe(20000);
  });
});

// --- CodegenBackend Interface ---

describe('v3.0-R3: CodegenBackend interface', () => {
  it('ClaudeCodeBackend has name "claude"', () => {
    const backend = new ClaudeCodeBackend();
    expect(backend.name).toBe('claude');
  });

  it('ClaudeCodeBackend generates agent markdown', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const ctx: CodegenContext = { program, report, index, sourceFile: 'test.gft' };
    const backend = new ClaudeCodeBackend();
    const result = backend.generateAgent(program.nodes[0], new Set(), ctx);
    expect(result).toContain('# Researcher Agent');
    expect(result).toContain('model:');
  });

  it('ClaudeCodeBackend generates orchestration', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const ctx: CodegenContext = { program, report, index, sourceFile: 'test.gft' };
    const backend = new ClaudeCodeBackend();
    const result = backend.generateOrchestration(ctx);
    expect(result).toContain('# Graft Orchestration');
  });

  it('ClaudeCodeBackend generates settings', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const ctx: CodegenContext = { program, report, index, sourceFile: 'test.gft' };
    const backend = new ClaudeCodeBackend();
    const result = backend.generateSettings(ctx);
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('graft');
  });

  it('ClaudeCodeBackend returns null for edges without transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 2k) { task: String }
      node A(model: sonnet, budget: 5k/2k) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 5k/2k) {
        reads: [OutA]
        produces OutB { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: OutB, budget: 20k) { A -> B -> done }
    `);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const ctx: CodegenContext = { program, report, index, sourceFile: 'test.gft' };
    const backend = new ClaudeCodeBackend();
    const edge = program.edges[0];
    const result = backend.generateHook(edge, ctx);
    expect(result).toBeNull();
  });
});

// --- Backend-aware generate() ---

describe('v3.0-R3: backend-aware generate()', () => {
  it('uses default backend when none specified', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const files = generate(program, report, 'test.gft', index);
    expect(files.some(f => f.path.includes('agents/'))).toBe(true);
    expect(files.some(f => f.path === '.claude/CLAUDE.md')).toBe(true);
    expect(files.some(f => f.path === '.claude/settings.json')).toBe(true);
  });

  it('uses provided backend', () => {
    const calls: string[] = [];
    const mockBackend: CodegenBackend = {
      name: 'mock',
      generateAgent(_node, _mem, _ctx) { calls.push('agent'); return '# mock agent'; },
      generateHook(_edge, _ctx) { calls.push('hook'); return null; },
      generateOrchestration(_ctx) { calls.push('orchestration'); return '# mock orchestration'; },
      generateSettings(_ctx) { calls.push('settings'); return { mock: true }; },
    };
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const files = generate(program, report, 'test.gft', index, mockBackend);
    expect(calls).toContain('agent');
    expect(calls).toContain('orchestration');
    expect(calls).toContain('settings');
    expect(files.find(f => f.path === '.claude/CLAUDE.md')!.content).toBe('# mock orchestration');
  });

  it('produces same output via backend as direct generate', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const estimator = new TokenEstimator(program, index);
    const report = estimator.estimate();
    const defaultFiles = generate(program, report, 'test.gft', index);
    const backendFiles = generate(program, report, 'test.gft', index, new ClaudeCodeBackend());
    expect(defaultFiles.map(f => f.path).sort()).toEqual(backendFiles.map(f => f.path).sort());
    for (const df of defaultFiles) {
      const bf = backendFiles.find(f => f.path === df.path);
      expect(bf).toBeDefined();
      expect(bf!.content).toBe(df.content);
    }
  });
});

// --- Settings with ProgramIndex ---

describe('v3.0-R3: settings ProgramIndex threading', () => {
  it('accepts ProgramIndex param', () => {
    const program = parse(BASIC_SOURCE);
    const index = new ProgramIndex(program);
    const settings = generateSettings(program, 'test.gft', index);
    expect(settings.model).toBeDefined();
  });

  it('works without ProgramIndex param (backward compat)', () => {
    const program = parse(BASIC_SOURCE);
    const settings = generateSettings(program, 'test.gft');
    expect(settings.model).toBeDefined();
  });
});

// --- Integration ---

describe('v3.0-R3: integration', () => {
  it('compileAndGenerate uses backend-aware generate', () => {
    const result = compileAndGenerate(BASIC_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.files!.some(f => f.path === '.claude/CLAUDE.md')).toBe(true);
  });

  it('CONFIG_UNKNOWN_BACKEND error code exists', async () => {
    const { GraftError } = await import('../src/errors/diagnostics.js');
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'CONFIG_UNKNOWN_BACKEND');
    expect(err.code).toBe('CONFIG_UNKNOWN_BACKEND');
  });
});
