import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { generate } from '../src/codegen/codegen.js';

// ── Codegen: let binding expression display ────────────────────

describe('Codegen: let binding expressions in orchestration', () => {
  function getOrchestration(source: string): string {
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const files = generate(result.program!, result.report!, 'test.gft');
    const orch = files.find(f => f.path.includes('CLAUDE.md'));
    return orch?.content ?? '';
  }

  it('let binding shows arithmetic expression', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let x = A.score + 10 -> done',
      '}',
    ].join('\n');
    const orch = getOrchestration(source);
    expect(orch).toContain('let x');
    expect(orch).toContain('A.score + 10');
  });

  it('let binding shows conditional expression', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { score: Int }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let label = if A.score > 50 then "high" else "low" -> done',
      '}',
    ].join('\n');
    const orch = getOrchestration(source);
    expect(orch).toContain('let label');
    expect(orch).toContain('if');
    expect(orch).toContain('then');
  });

  it('let binding shows null coalescing expression', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { name: String }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let safe = A.name ?? "anonymous" -> done',
      '}',
    ].join('\n');
    const orch = getOrchestration(source);
    expect(orch).toContain('??');
    expect(orch).toContain('"anonymous"');
  });

  it('let binding shows function call expression', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { name: String }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let length = len(A.name) -> done',
      '}',
    ].join('\n');
    const orch = getOrchestration(source);
    expect(orch).toContain('len(A.name)');
  });

  it('let binding shows logical expression', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    status: String',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> let valid = A.score > 50 && A.status == "ok" -> done',
      '}',
    ].join('\n');
    const orch = getOrchestration(source);
    expect(orch).toContain('let valid');
    expect(orch).toContain('&&');
  });
});

// ── Regression: codegen still works ────────────────────────────

describe('Regression: codegen flow types', () => {
  it('node step generates correctly', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { result: String }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    expect(result.success).toBe(true);
    const files = generate(result.program!, result.report!, 'test.gft');
    const orch = files.find(f => f.path.includes('CLAUDE.md'));
    expect(orch?.content).toContain('Step');
  });

  it('full pipeline generates all files', () => {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out { result: String }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      '  A -> done',
      '}',
    ].join('\n');
    const result = compile(source, 'test.gft');
    const files = generate(result.program!, result.report!, 'test.gft');
    expect(files.length).toBeGreaterThan(0);
    const paths = files.map(f => f.path);
    expect(paths.some(p => p.includes('CLAUDE.md'))).toBe(true);
    expect(paths.some(p => p.includes('agents'))).toBe(true);
  });
});
