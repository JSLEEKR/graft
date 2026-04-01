import { describe, it, expect } from 'vitest';
import { compile, compileToProgram, compileAndGenerate } from '../src/compiler.js';
import type { CompileResult } from '../src/compiler.js';

const FULL_SOURCE = `
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]

  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]

  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
`;

const LIBRARY_SOURCE = `
context UserMessage(max_tokens: 500) {
  content: String
  user_id: String
}

context SystemConfig(max_tokens: 200) {
  persona: String
}
`;

describe('compileToProgram', () => {
  it('returns program + index without files', () => {
    const result = compileToProgram(FULL_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.errors).toEqual([]);
    expect((result as CompileResult).files).toBeUndefined();
  });

  it('succeeds for library files (no graph, no GRAPH_MISSING)', () => {
    const result = compileToProgram(LIBRARY_SOURCE, 'lib.gft');
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
    expect(result.errors).toEqual([]);
  });

  it('returns index on analysis error', () => {
    const source = `
      context Ctx(max_tokens: 500) { data: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { data: String }
      }
      graph G(input: Ctx, output: Out, budget: 5k) { A -> done }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.index).toBeDefined();
    expect(result.program).toBeDefined();
  });

  it('returns no index on parse error', () => {
    const result = compileToProgram('@@@', 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.index).toBeUndefined();
  });

  it('returns no index on resolve error', () => {
    const source = `
      import { Foo } from "./nonexistent.gft"
      context Ctx(max_tokens: 100) { data: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ctx]
        produces Out { data: String }
      }
      graph G(input: Ctx, output: Out, budget: 5k) { A -> done }
    `;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.index).toBeUndefined();
  });
});

describe('compileAndGenerate', () => {
  it('returns files for valid source', () => {
    const result = compileAndGenerate(FULL_SOURCE, 'test.gft');
    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
    expect(result.files!.length).toBeGreaterThan(0);
    expect(result.index).toBeDefined();
  });

  it('fails with GRAPH_MISSING for library files', () => {
    const result = compileAndGenerate(LIBRARY_SOURCE, 'lib.gft');
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.code === 'GRAPH_MISSING')).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.index).toBeDefined();
  });
});

describe('compile() backward compatibility', () => {
  it('is identical to compileAndGenerate', () => {
    const a = compile(FULL_SOURCE, 'test.gft');
    const b = compileAndGenerate(FULL_SOURCE, 'test.gft');
    expect(a.success).toBe(b.success);
    expect(a.errors.length).toBe(b.errors.length);
    expect(a.files?.length).toBe(b.files?.length);
  });
});
