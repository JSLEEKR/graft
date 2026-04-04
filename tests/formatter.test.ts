import { describe, it, expect } from 'vitest';
import { formatProgram } from '../src/formatter.js';
import { compileToProgram } from '../src/compiler.js';

function fmt(source: string): string {
  const result = compileToProgram(source, 'test.gft');
  if (!result.success || !result.program) {
    throw new Error(`Parse failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return formatProgram(result.program);
}

describe('graft fmt', () => {
  it('formats a simple context', () => {
    const out = fmt(`context Input(max_tokens: 500) { question: String }`);
    expect(out).toContain('context Input(max_tokens: 500)');
    expect(out).toContain('  question: String');
  });

  it('formats a node with reads and produces', () => {
    const source = `
context Input(max_tokens: 500) { question: String }
node Analyst(model: sonnet, budget: 4k/2k) {
  reads: [Input]
  produces Analysis { answer: String  confidence: Float(0..1) }
}
graph P(input: Input, output: Analysis, budget: 10k) { Analyst -> done }
`;
    const out = fmt(source);
    expect(out).toContain('node Analyst(model: sonnet, budget: 4k/2k)');
    expect(out).toContain('  reads: [Input]');
    expect(out).toContain('  produces Analysis {');
    expect(out).toContain('    answer: String');
    expect(out).toContain('    confidence: Float(0..1)');
  });

  it('formats edge with transforms', () => {
    const source = `
context Input(max_tokens: 500) { question: String }
node A(model: sonnet, budget: 4k/2k) { reads: [Input] produces AOut { answer: String } }
node B(model: haiku, budget: 2k/1k) { reads: [AOut] produces BOut { result: String } }
edge A -> B | select(answer) | compact
graph P(input: Input, output: BOut, budget: 10k) { A -> B -> done }
`;
    const out = fmt(source);
    expect(out).toContain('edge A -> B');
    expect(out).toContain('  | select(answer)');
    expect(out).toContain('  | compact');
  });

  it('formats conditional edge', () => {
    const source = `
context Input(max_tokens: 500) { score: Float }
node Assessor(model: sonnet, budget: 4k/2k) { reads: [Input] produces Assessment { risk_score: Float(0..1) } }
node HighRisk(model: opus, budget: 6k/3k) { reads: [Assessment] produces Result { decision: String } }
node LowRisk(model: haiku, budget: 2k/1k) { reads: [Assessment] produces Result { decision: String } }
edge Assessor -> { when risk_score > 0.5 -> HighRisk  else -> LowRisk }
graph P(input: Input, output: Result, budget: 20k) { Assessor -> done }
`;
    const out = fmt(source);
    expect(out).toContain('edge Assessor -> {');
    expect(out).toContain('  when');
    expect(out).toContain('  else -> LowRisk');
  });

  it('formats graph with parallel', () => {
    const source = `
context Input(max_tokens: 500) { data: String }
node A(model: sonnet, budget: 4k/2k) { reads: [Input] produces AOut { x: String } }
node B(model: sonnet, budget: 4k/2k) { reads: [Input] produces BOut { y: String } }
node C(model: sonnet, budget: 4k/2k) { reads: [AOut, BOut] produces COut { z: String } }
graph P(input: Input, output: COut, budget: 20k) {
  parallel { A  B } -> C -> done
}
`;
    const out = fmt(source);
    expect(out).toContain('parallel {');
    expect(out).toContain('-> done');
  });

  it('formats memory declaration', () => {
    const source = `
memory Log(max_tokens: 2k, storage: file) { entries: List<String>  summary: Optional<String> }
context Input(max_tokens: 500) { text: String }
node Proc(model: sonnet, budget: 4k/2k) { reads: [Input, Log] writes: [Log] produces Out { result: String } }
graph P(input: Input, output: Out, budget: 10k) { Proc -> done }
`;
    const out = fmt(source);
    expect(out).toContain('memory Log(max_tokens: 2k, storage: file)');
    expect(out).toContain('  entries: List<String>');
    expect(out).toContain('  summary: Optional<String>');
  });

  it('formats import declaration', () => {
    // Construct a minimal Program with imports since compileToProgram resolves them
    const program = {
      imports: [{ names: ['UserMessage', 'Config'], path: './shared.gft' }],
      memories: [], contexts: [], nodes: [], edges: [], graphs: [],
    } as any;
    const out = formatProgram(program);
    expect(out).toContain('import { UserMessage, Config } from "./shared.gft"');
  });

  it('formats on_failure strategy', () => {
    const source = `
context Input(max_tokens: 500) { q: String }
node N(model: sonnet, budget: 4k/2k) { reads: [Input] on_failure: retry(3) produces Out { r: String } }
graph P(input: Input, output: Out, budget: 10k) { N -> done }
`;
    const out = fmt(source);
    expect(out).toContain('  on_failure: retry(3)');
  });

  it('formats tools list', () => {
    const source = `
context Input(max_tokens: 500) { q: String }
node N(model: sonnet, budget: 4k/2k) { reads: [Input] tools: [file_read, terminal] produces Out { r: String } }
graph P(input: Input, output: Out, budget: 10k) { N -> done }
`;
    const out = fmt(source);
    expect(out).toContain('  tools: [file_read, terminal]');
  });

  it('round-trips: formatting twice produces the same output', () => {
    const source = `
context Input(max_tokens: 500) { question: String }
node A(model: sonnet, budget: 4k/2k) { reads: [Input] produces AOut { answer: String  confidence: Float(0..1) } }
node B(model: haiku, budget: 2k/1k) { reads: [AOut] produces BOut { result: String } }
edge A -> B | select(answer) | compact
graph P(input: Input, output: BOut, budget: 10k) { A -> B -> done }
`;
    const first = fmt(source);
    const second = fmt(first);
    expect(first).toBe(second);
  });

  it('formats type variants: List, Map, Optional, enum, TokenBounded', () => {
    const source = `
context Input(max_tokens: 1k) {
  items: List<String>
  tags: Map<String, Int>
  maybe: Optional<Bool>
  severity: enum(low, medium, high)
  content: TokenBounded<String, 100>
}
node N(model: sonnet, budget: 4k/2k) { reads: [Input] produces Out { ok: Bool } }
graph P(input: Input, output: Out, budget: 10k) { N -> done }
`;
    const out = fmt(source);
    expect(out).toContain('items: List<String>');
    expect(out).toContain('tags: Map<String, Int>');
    expect(out).toContain('maybe: Optional<Bool>');
    expect(out).toContain('severity: enum(low, medium, high)');
    expect(out).toContain('content: TokenBounded<String, 100>');
  });

  it('formatTokens uses k suffix for multiples of 1000', () => {
    const out = fmt(`
context Input(max_tokens: 2000) { q: String }
node N(model: sonnet, budget: 4000/2000) { reads: [Input] produces Out { r: String } }
graph P(input: Input, output: Out, budget: 10000) { N -> done }
`);
    expect(out).toContain('max_tokens: 2k');
    expect(out).toContain('budget: 4k/2k');
    expect(out).toContain('budget: 10k');
  });
});
