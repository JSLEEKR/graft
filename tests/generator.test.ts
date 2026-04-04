import { describe, it, expect, vi } from 'vitest';
import { extractGftSource, buildSystemPrompt, generateGft, LLMCaller } from '../src/generator.js';

describe('extractGftSource', () => {
  it('extracts from ```gft fence', () => {
    const response = 'Here is your pipeline:\n\n```gft\ncontext Foo(max_tokens: 1k) {\n  bar: String\n}\n```\n\nEnjoy!';
    expect(extractGftSource(response)).toBe('context Foo(max_tokens: 1k) {\n  bar: String\n}');
  });

  it('extracts from any ``` fence', () => {
    const response = 'Result:\n\n```\ncontext Bar(max_tokens: 2k) {\n  baz: Int\n}\n```';
    expect(extractGftSource(response)).toBe('context Bar(max_tokens: 2k) {\n  baz: Int\n}');
  });

  it('falls back to bare response', () => {
    const response = 'context Raw(max_tokens: 500) {\n  x: String\n}';
    expect(extractGftSource(response)).toBe('context Raw(max_tokens: 500) {\n  x: String\n}');
  });

  it('strips markdown headers in bare mode', () => {
    const response = '# My Pipeline\n\ncontext Foo(max_tokens: 1k) {\n  x: String\n}';
    expect(extractGftSource(response)).toBe('context Foo(max_tokens: 1k) {\n  x: String\n}');
  });

  it('handles empty response', () => {
    expect(extractGftSource('')).toBe('');
  });

  it('prefers gft fence over generic fence', () => {
    const response = '```\ngeneric\n```\n\n```gft\nspecific\n```';
    expect(extractGftSource(response)).toBe('specific');
  });
});

describe('buildSystemPrompt', () => {
  it('returns non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('contains key syntax elements', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('context');
    expect(prompt).toContain('node');
    expect(prompt).toContain('edge');
    expect(prompt).toContain('graph');
    expect(prompt).toContain('produces');
    expect(prompt).toContain('reads');
  });

  it('contains the example', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('SecurityReviewer');
    expect(prompt).toContain('AdversarialReview');
  });

  it('instructs no imports', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Do NOT use import');
  });
});

describe('generateGft', () => {
  it('throws on empty description', async () => {
    const caller: LLMCaller = vi.fn();
    await expect(generateGft('', { llmCaller: caller })).rejects.toThrow('empty');
    await expect(generateGft('   ', { llmCaller: caller })).rejects.toThrow('empty');
  });

  it('generates valid .gft with mock caller', async () => {
    const validGft = `context Input(max_tokens: 1k) {
  query: String
}

node Processor(model: sonnet, budget: 4k/2k) {
  reads: [Input]

  produces Output {
    result: String
  }
}

graph Pipeline(input: Input, output: Output, budget: 10k) {
  Processor -> done
}`;

    const caller: LLMCaller = vi.fn().mockResolvedValue('```gft\n' + validGft + '\n```');

    const result = await generateGft('simple processor pipeline', { llmCaller: caller });
    expect(result.errors).toHaveLength(0);
    expect(result.source).toContain('Processor');
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it('retries on validation failure then succeeds', async () => {
    const invalidGft = 'node Bad() {}';
    const validGft = `context Input(max_tokens: 1k) {
  query: String
}

node Good(model: sonnet, budget: 4k/2k) {
  reads: [Input]

  produces Output {
    result: String
  }
}

graph Pipeline(input: Input, output: Output, budget: 10k) {
  Good -> done
}`;

    const caller: LLMCaller = vi.fn()
      .mockResolvedValueOnce('```gft\n' + invalidGft + '\n```')
      .mockResolvedValueOnce('```gft\n' + validGft + '\n```');

    const result = await generateGft('a pipeline', { llmCaller: caller });
    expect(result.errors).toHaveLength(0);
    expect(result.source).toContain('Good');
    expect(caller).toHaveBeenCalledTimes(2);

    // Verify retry includes error feedback
    const retryCall = (caller as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(retryCall[0].userMessage).toContain('compilation errors');
  });

  it('returns best attempt after max retries', async () => {
    const badGft = 'this is not valid gft at all';

    const caller: LLMCaller = vi.fn().mockResolvedValue('```gft\n' + badGft + '\n```');

    const result = await generateGft('impossible pipeline', { llmCaller: caller });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(caller).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });
});
