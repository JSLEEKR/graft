import { describe, it, expect } from 'vitest';
import { generateTestInput, validateOutput, runTest } from '../src/test-runner.js';
import { TypeExpr, Field, ContextDecl, Program } from '../src/parser/ast.js';
import { compileToProgram } from '../src/compiler.js';

// --- generateTestInput ---
describe('generateTestInput', () => {
  function mkField(name: string, type: TypeExpr): Field {
    return { name, type, location: { line: 1, column: 1, offset: 0 } };
  }

  function mkContext(name: string, fields: Field[]): ContextDecl {
    return {
      name,
      maxTokens: 500,
      fields,
      location: { line: 1, column: 1, offset: 0 },
    };
  }

  it('generates "test" for String fields', () => {
    const ctx = mkContext('Input', [mkField('question', { kind: 'primitive', name: 'String' })]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ question: 'test' });
  });

  it('generates 1 for Int fields', () => {
    const ctx = mkContext('Input', [mkField('count', { kind: 'primitive', name: 'Int' })]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ count: 1 });
  });

  it('generates 0.5 for Float fields', () => {
    const ctx = mkContext('Input', [mkField('score', { kind: 'primitive', name: 'Float' })]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ score: 0.5 });
  });

  it('generates midpoint for Float(min..max) fields', () => {
    const ctx = mkContext('Input', [mkField('confidence', { kind: 'primitive_range', name: 'Float', min: 0, max: 1 })]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ confidence: 0.5 });
  });

  it('generates true for Bool fields', () => {
    const ctx = mkContext('Input', [mkField('flag', { kind: 'primitive', name: 'Bool' })]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ flag: true });
  });

  it('generates single-element array for List fields', () => {
    const ctx = mkContext('Input', [
      mkField('items', { kind: 'list', element: { kind: 'primitive', name: 'String' } }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ items: ['test'] });
  });

  it('generates single-entry map for Map fields', () => {
    const ctx = mkContext('Input', [
      mkField('data', { kind: 'map', key: { kind: 'primitive', name: 'String' }, value: { kind: 'primitive', name: 'Int' } }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ data: { test: 1 } });
  });

  it('generates null for Optional fields', () => {
    const ctx = mkContext('Input', [
      mkField('note', { kind: 'optional', inner: { kind: 'primitive', name: 'String' } }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ note: null });
  });

  it('generates first value for enum fields', () => {
    const ctx = mkContext('Input', [
      mkField('status', { kind: 'enum', values: ['open', 'closed', 'pending'] }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ status: 'open' });
  });

  it('generates inner type for TokenBounded fields', () => {
    const ctx = mkContext('Input', [
      mkField('text', { kind: 'token_bounded', inner: { kind: 'primitive', name: 'String' }, max: 100 }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ text: 'test' });
  });

  it('generates nested struct fields', () => {
    const ctx = mkContext('Input', [
      mkField('meta', {
        kind: 'struct',
        name: 'Meta',
        fields: [
          mkField('title', { kind: 'primitive', name: 'String' }),
          mkField('count', { kind: 'primitive', name: 'Int' }),
        ],
      }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ meta: { title: 'test', count: 1 } });
  });

  it('handles multiple fields together', () => {
    const ctx = mkContext('Input', [
      mkField('question', { kind: 'primitive', name: 'String' }),
      mkField('max_results', { kind: 'primitive', name: 'Int' }),
      mkField('verbose', { kind: 'primitive', name: 'Bool' }),
    ]);
    const result = generateTestInput(ctx);
    expect(result).toEqual({ question: 'test', max_results: 1, verbose: true });
  });
});

// --- validateOutput ---
describe('validateOutput', () => {
  function mkField(name: string, type: TypeExpr): Field {
    return { name, type, location: { line: 1, column: 1, offset: 0 } };
  }

  it('passes when output matches schema', () => {
    const fields = [
      mkField('answer', { kind: 'primitive', name: 'String' }),
      mkField('score', { kind: 'primitive', name: 'Int' }),
    ];
    const output = { answer: 'hello', score: 42 };
    const errors = validateOutput(output, fields);
    expect(errors).toEqual([]);
  });

  it('fails on missing required field', () => {
    const fields = [
      mkField('answer', { kind: 'primitive', name: 'String' }),
      mkField('score', { kind: 'primitive', name: 'Int' }),
    ];
    const output = { answer: 'hello' };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('score');
    expect(errors[0]).toContain('missing');
  });

  it('fails on wrong type for String field', () => {
    const fields = [mkField('answer', { kind: 'primitive', name: 'String' })];
    const output = { answer: 42 };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('answer');
  });

  it('fails on wrong type for Int field', () => {
    const fields = [mkField('count', { kind: 'primitive', name: 'Int' })];
    const output = { count: 'not a number' };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('count');
  });

  it('fails on wrong type for Bool field', () => {
    const fields = [mkField('flag', { kind: 'primitive', name: 'Bool' })];
    const output = { flag: 'yes' };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('flag');
  });

  it('fails when Float is out of range', () => {
    const fields = [mkField('score', { kind: 'primitive_range', name: 'Float', min: 0, max: 1 })];
    const output = { score: 1.5 };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('score');
    expect(errors[0]).toContain('range');
  });

  it('passes when Float is in range', () => {
    const fields = [mkField('score', { kind: 'primitive_range', name: 'Float', min: 0, max: 1 })];
    const output = { score: 0.5 };
    const errors = validateOutput(output, fields);
    expect(errors).toEqual([]);
  });

  it('validates List element types', () => {
    const fields = [mkField('items', { kind: 'list', element: { kind: 'primitive', name: 'String' } })];
    const output = { items: ['a', 42] };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('items[1]');
  });

  it('passes List with correct element types', () => {
    const fields = [mkField('items', { kind: 'list', element: { kind: 'primitive', name: 'String' } })];
    const output = { items: ['a', 'b'] };
    const errors = validateOutput(output, fields);
    expect(errors).toEqual([]);
  });

  it('allows null for Optional fields', () => {
    const fields = [mkField('note', { kind: 'optional', inner: { kind: 'primitive', name: 'String' } })];
    const output = { note: null };
    const errors = validateOutput(output, fields);
    expect(errors).toEqual([]);
  });

  it('validates Optional inner type when present', () => {
    const fields = [mkField('note', { kind: 'optional', inner: { kind: 'primitive', name: 'String' } })];
    const output = { note: 42 };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('note');
  });

  it('validates enum values', () => {
    const fields = [mkField('status', { kind: 'enum', values: ['open', 'closed'] })];
    const output = { status: 'invalid' };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('status');
    expect(errors[0]).toContain('enum');
  });

  it('passes valid enum values', () => {
    const fields = [mkField('status', { kind: 'enum', values: ['open', 'closed'] })];
    const output = { status: 'open' };
    const errors = validateOutput(output, fields);
    expect(errors).toEqual([]);
  });

  it('fails when output is not an object', () => {
    const fields = [mkField('answer', { kind: 'primitive', name: 'String' })];
    const output = 'not an object';
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('object');
  });

  it('validates nested struct fields', () => {
    const innerFields = [
      mkField('title', { kind: 'primitive', name: 'String' }),
      mkField('count', { kind: 'primitive', name: 'Int' }),
    ];
    const fields = [mkField('meta', { kind: 'struct', name: 'Meta', fields: innerFields })];
    const output = { meta: { title: 'test', count: 'wrong' } };
    const errors = validateOutput(output, fields);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('meta.count');
  });
});

// --- runTest (integration) ---
describe('runTest', () => {
  const simplePipeline = `
context Input(max_tokens: 500) {
  question: String
}

node Analyst(model: sonnet, budget: 4k/2k) {
  reads: [Input]
  produces Analysis {
    answer: String
    confidence: Float(0..1)
  }
}

node Reviewer(model: haiku, budget: 2k/1k) {
  reads: [Analysis]
  produces Output {
    final_answer: String
    approved: Bool
  }
}

edge Analyst -> Reviewer | select(answer, confidence) | compact

graph qa(input: Input, output: Output, budget: 10k) {
  Analyst -> Reviewer -> done
}
`;

  it('runs a pipeline test with auto-generated input', async () => {
    const result = await runTest({ source: simplePipeline, sourceFile: 'test.gft' });
    expect(result.success).toBe(true);
    expect(result.nodeResults.length).toBe(2);
    for (const nr of result.nodeResults) {
      expect(nr.passed).toBe(true);
      expect(nr.validationErrors).toEqual([]);
    }
  });

  it('runs a pipeline test with explicit input', async () => {
    const result = await runTest({
      source: simplePipeline,
      sourceFile: 'test.gft',
      input: { question: 'What is Graft?' },
    });
    expect(result.success).toBe(true);
    expect(result.inputUsed).toEqual({ question: 'What is Graft?' });
  });

  it('reports compilation errors', async () => {
    const result = await runTest({ source: 'invalid graft source', sourceFile: 'bad.gft' });
    expect(result.success).toBe(false);
    expect(result.compileErrors.length).toBeGreaterThan(0);
  });

  it('auto-generates input matching context schema', async () => {
    const result = await runTest({ source: simplePipeline, sourceFile: 'test.gft' });
    expect(result.inputUsed).toEqual({ question: 'test' });
  });
});
