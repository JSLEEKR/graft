import { describe, it, expect } from 'vitest';
import { buildPrompt, buildContextSection, resolveField, generateMockOutput, PromptContext } from '../src/runtime/prompt-builder.js';
import { NodeDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function makeNode(overrides: Partial<NodeDecl> = {}): NodeDecl {
  return {
    name: 'TestNode',
    model: 'sonnet',
    budgetIn: 2000,
    budgetOut: 1000,
    reads: [],
    tools: [],
    writes: [],
    produces: {
      name: 'TestOutput',
      fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }],
      location: loc,
    },
    location: loc,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    outputs: new Map(),
    graphInputName: 'UserRequest',
    input: { question: 'test' },
    ...overrides,
  };
}

describe('resolveField', () => {
  it('returns field value from object', () => {
    expect(resolveField({ a: 1, b: 2 }, 'a')).toBe(1);
  });

  it('returns undefined for null/undefined/primitive', () => {
    expect(resolveField(null, 'a')).toBeUndefined();
    expect(resolveField(undefined, 'a')).toBeUndefined();
    expect(resolveField(42, 'a')).toBeUndefined();
  });

  it('returns undefined for missing field', () => {
    expect(resolveField({ a: 1 }, 'b')).toBeUndefined();
  });
});

describe('buildPrompt', () => {
  it('produces prompt with node name and output schema', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('# TestNode Agent');
    expect(prompt).toContain('"result"');
    expect(prompt).toContain('1000 output tokens');
  });

  it('includes context data from outputs map', () => {
    const node = makeNode({
      reads: [{ context: 'Upstream', location: loc }],
    });
    const outputs = new Map<string, unknown>();
    outputs.set('Upstream', { data: 'hello' });
    const ctx = makeCtx({ outputs });
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('### Upstream');
    expect(prompt).toContain('hello');
  });

  it('falls back to input when context matches graph input name', () => {
    const node = makeNode({
      reads: [{ context: 'UserRequest', location: loc }],
    });
    const ctx = makeCtx({ input: { question: 'what is graft?' } });
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('what is graft?');
  });

  it('shows no data available for unknown context', () => {
    const node = makeNode({
      reads: [{ context: 'Unknown', location: loc }],
    });
    const ctx = makeCtx();
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('No data available');
  });
});

describe('buildContextSection', () => {
  it('returns no external context when no reads', () => {
    const node = makeNode({ reads: [] });
    const ctx = makeCtx();
    const section = buildContextSection(node, ctx);
    expect(section).toBe('No external context required.');
  });

  it('handles partial field reads', () => {
    const node = makeNode({
      reads: [{ context: 'UserRequest', field: ['question'], location: loc }],
    });
    const ctx = makeCtx({ input: { question: 'hello', extra: 'ignored' } });
    const section = buildContextSection(node, ctx);
    expect(section).toContain('### UserRequest.question');
    expect(section).toContain('hello');
    expect(section).not.toContain('ignored');
  });

  it('handles partial field reads from outputs', () => {
    const outputs = new Map<string, unknown>();
    outputs.set('Research', { findings: ['a', 'b'], confidence: 0.9 });
    const node = makeNode({
      reads: [{ context: 'Research', field: ['findings'], location: loc }],
    });
    const ctx = makeCtx({ outputs });
    const section = buildContextSection(node, ctx);
    expect(section).toContain('### Research.findings');
    expect(section).toContain('"a"');
    expect(section).not.toContain('confidence');
  });
});

describe('generateMockOutput', () => {
  it('returns schema example from produces fields', () => {
    const node = makeNode();
    const mock = generateMockOutput(node);
    expect(mock).toHaveProperty('result');
    expect(typeof mock.result).toBe('string');
  });
});
