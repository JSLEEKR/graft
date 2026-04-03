import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { generateAgent } from '../src/codegen/agents.js';
import { generateHook } from '../src/codegen/hooks.js';
import { generateOrchestration } from '../src/codegen/orchestration.js';
import { generateSettings } from '../src/codegen/settings.js';
import { Program, EdgeDecl } from '../src/parser/ast.js';
import { TokenReport } from '../src/analyzer/estimator.js';
import { applyTransforms } from '../src/runtime/transforms.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

function makeReport(program: Program): TokenReport {
  return {
    graphName: program.graphs[0]?.name || 'Test',
    budget: program.graphs[0]?.budget || 10000,
    bestCase: 3000,
    worstCase: 8000,
    nodes: program.nodes.map(n => ({
      name: n.name,
      estimatedIn: n.budgetIn,
      estimatedOut: n.budgetOut,
    })),
    warnings: [],
  };
}

// ===========================================================================
// orchestration.ts edge cases
// ===========================================================================
describe('orchestration edge cases', () => {
  it('generates orchestration for graph with only parallel nodes', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces BOut { data: String }
      }
      graph G(input: Spec, output: AOut, budget: 10k) {
        parallel { A B } -> done
      }
    `);
    const report = makeReport(program);
    const result = generateOrchestration(program, report);

    // Should contain the parallel step
    expect(result).toContain('[parallel]');
    expect(result).toContain('A, B');
    // Should have step numbering starting at 1
    expect(result).toContain('Step 1');
    // Should NOT crash
    expect(result.length).toBeGreaterThan(0);
  });

  it('parser rejects parallel block with single branch (error, no graph)', () => {
    // The parser requires at least 2 branches for parallel blocks.
    // It doesn't throw, but produces a parse error and no graphs.
    const lexer = new Lexer(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces BOut { data: String }
      }
      graph G(input: Spec, output: AOut, budget: 10k) {
        parallel { A } -> done
      }
    `);
    const tokens = lexer.tokenize();
    const result = new Parser(tokens).parse();
    // Should have parse errors and no valid graph
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.program.graphs.length).toBe(0);
  });

  it('handles edges INTO a parallel block from a sequential node', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node Prep(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces PrepOut {
          data: String
          meta: String
        }
      }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [PrepOut]
        produces AOut { result: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [PrepOut]
        produces BOut { result: String }
      }
      edge Prep -> A | select(data) | compact
      edge Prep -> B | select(meta) | compact
      graph G(input: Spec, output: AOut, budget: 20k) {
        Prep -> parallel { A B } -> done
      }
    `);
    const report = makeReport(program);
    const result = generateOrchestration(program, report);

    // The orchestration should include both Prep and the parallel block
    expect(result).toContain('Prep');
    expect(result).toContain('[parallel]');
    // BUG FIX TEST: The parallel block should show edge transforms from
    // the preceding sequential node (Prep) into each parallel branch.
    // The edges Prep->A and Prep->B have select transforms.
    expect(result).toContain('Edge transform');
    expect(result).toContain('Prep');
    // Each branch should note the transformed input
    expect(result).toContain('prep_to_a');
    expect(result).toContain('prep_to_b');
  });

  it('handles node after parallel block with edge transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut {
          data: String
          debug: String
        }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces BOut {
          data: String
          debug: String
        }
      }
      node Merge(model: sonnet, budget: 2k/1k) {
        reads: [AOut, BOut]
        produces MergeOut { combined: String }
      }
      edge A -> Merge | select(data)
      edge B -> Merge | drop(debug) | compact
      graph G(input: Spec, output: MergeOut, budget: 20k) {
        parallel { A B } -> Merge -> done
      }
    `);
    const report = makeReport(program);
    const result = generateOrchestration(program, report);

    // Merge should have inputs from both A and B
    expect(result).toContain('Merge');
    // Should mention edge transforms from A and B
    expect(result).toContain('Edge transform');
    // describeTransforms renders select as "keep only fields"
    expect(result).toContain('keep only fields');
    expect(result).toContain('remove field');
  });
});

// ===========================================================================
// hooks.ts edge cases
// ===========================================================================
describe('hooks edge cases', () => {
  const loc = { line: 1, column: 1, offset: 0 };

  it('returns null when edge has no transforms', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [],
      location: loc,
    };
    expect(generateHook(edge)).toBeNull();
  });

  it('returns null when edge has conditional target', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: {
        kind: 'conditional',
        branches: [{ condition: { kind: 'literal', value: true, location: loc }, target: 'B' }],
      },
      transforms: [{ type: 'compact' }],
      location: loc,
    };
    expect(generateHook(edge)).toBeNull();
  });

  it('generates valid JS for select transform', () => {
    const edge: EdgeDecl = {
      source: 'Analyzer',
      target: { kind: 'direct', node: 'Writer' },
      transforms: [{ type: 'select', fields: ['findings', 'confidence'] }],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    expect(hook).toContain('"findings"');
    expect(hook).toContain('"confidence"');
    // Should produce valid destructuring/picking code
    expect(hook).toContain('let result = {');
  });

  it('generates valid JS for drop transform', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'drop', field: 'debug_info' }],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    expect(hook).toContain('delete result["debug_info"]');
  });

  it('generates valid JS for compact transform', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'compact' }],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    // compact should NOT have the non-compact roundtrip
    expect(hook).not.toContain('JSON.parse(JSON.stringify(result))');
  });

  it('generates correct non-compact code path (pretty-printed output)', () => {
    // When there's a select but no compact, output should be pretty-printed
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'select', fields: ['data'] }],
      location: loc,
    };
    const hook = generateHook(edge)!;
    expect(hook).not.toBeNull();
    // Non-compact should use pretty-printed JSON (null, 2)
    expect(hook).toContain('JSON.stringify(result, null, 2)');
  });

  it('generates compact code path (minified output)', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'select', fields: ['data'] }, { type: 'compact' }],
      location: loc,
    };
    const hook = generateHook(edge)!;
    expect(hook).not.toBeNull();
    // Compact should use JSON.stringify(result) without indentation
    expect(hook).toContain('JSON.stringify(result)');
    expect(hook).not.toContain('JSON.stringify(result, null, 2)');
  });

  it('generates valid JS for filter transform', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{
        type: 'filter',
        field: 'items',
        condition: {
          kind: 'binary',
          op: '>',
          left: { kind: 'field_access', segments: ['item', 'score'], location: loc },
          right: { kind: 'literal', value: 0.5, location: loc },
          location: loc,
        },
      }],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    // The filter should reference 'items' field and filter by 'score'
    expect(hook).toContain('filter');
    expect(hook).toContain('score');
  });

  it('generates valid JS for combined select + drop + compact', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [
        { type: 'select', fields: ['data', 'meta', 'debug'] },
        { type: 'drop', field: 'debug' },
        { type: 'compact' },
      ],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    // Should select first, then drop, then compact is implicit
    expect(hook).toContain('let result = {');
    expect(hook).toContain('delete result["debug"]');
    expect(hook).not.toContain('JSON.parse(JSON.stringify(result))');
  });

  it('handles filter with non-binary condition gracefully', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{
        type: 'filter',
        field: 'items',
        condition: {
          kind: 'literal',
          value: true,
          location: loc,
        },
      }],
      location: loc,
    };
    const hook = generateHook(edge);
    expect(hook).not.toBeNull();
    // Non-binary filter should produce a no-op (identity assignment)
    expect(hook).toContain('result["items"] = result["items"]');
  });
});

// ===========================================================================
// settings.ts edge cases
// ===========================================================================
describe('settings edge cases', () => {
  it('handles duplicate edge sources (same source, different targets)', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut {
          data: String
          meta: String
        }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces BOut { result: String }
      }
      node C(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces COut { result: String }
      }
      edge A -> B | select(data)
      edge A -> C | select(meta)
      graph G(input: Spec, output: BOut, budget: 20k) {
        A -> parallel { B C } -> done
      }
    `);
    const settings = generateSettings(program, 'test.gft');

    // Should have TWO hook commands (one for A->B, one for A->C)
    const hooks = settings.hooks.PostToolUse;
    expect(hooks.length).toBe(1); // single Write matcher
    expect(hooks[0].hooks.length).toBe(2); // two commands
    expect(hooks[0].hooks[0].command).toContain('a-to-b');
    expect(hooks[0].hooks[1].command).toContain('a-to-c');
  });

  it('generates correct hook if-clause for matching writes', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces BOut { result: String }
      }
      edge A -> B | compact
      graph G(input: Spec, output: BOut, budget: 10k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    const hooks = settings.hooks.PostToolUse;

    expect(hooks.length).toBe(1);
    const hook = hooks[0].hooks[0];
    // The if clause should match writes to the source node's output file
    expect(hook.if).toContain('a.json');
  });

  it('handles graph starting with parallel (finds first node from parallel branches)', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: opus, budget: 2k/1k) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Spec]
        produces BOut { data: String }
      }
      graph G(input: Spec, output: AOut, budget: 10k) {
        parallel { A B } -> done
      }
    `);
    const settings = generateSettings(program, 'test.gft');

    // The first node found in a parallel block should be A (first branch)
    // So the default model should be opus
    expect(settings.model).toBe('claude-opus-4-20250514');
  });

  it('handles edges without transforms (no hooks generated)', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces BOut { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: BOut, budget: 10k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    expect(settings.hooks.PostToolUse.length).toBe(0);
  });
});

// ===========================================================================
// agents.ts edge cases
// ===========================================================================
describe('agents edge cases', () => {
  it('handles node with no reads', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: []
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('No external context required');
  });

  it('handles node with multiple reads, some with overrides', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      context Extra(max_tokens: 300) { hint: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec, Extra]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const node = program.nodes[0];
    // Override only Spec, not Extra
    const overrides = new Map<string, string>();
    overrides.set('Spec', '.graft/session/node_outputs/prep_to_a.json');
    const md = generateAgent(node, new Set(), overrides);

    // Spec should use override path
    expect(md).toContain('prep_to_a.json');
    // Extra should use default path
    expect(md).toContain('Extra');
    expect(md).toContain('.graft/session/');
  });

  it('handles memory reads and writes together', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      memory History(max_tokens: 2k) {
        entries: List<String>
      }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec, History]
        writes: [History.entries]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const node = program.nodes[0];
    const memoryNames = new Set(['History']);
    const md = generateAgent(node, memoryNames);

    // Should have memory load
    expect(md).toContain('.graft/memory/history.json');
    // Should have memory save section
    expect(md).toContain('Memory Saving');
    expect(md).toContain('Save to');
  });
});

// ===========================================================================
// transforms.ts runtime edge cases
// ===========================================================================
describe('runtime transforms edge cases', () => {
  it('select with top-level fields works', () => {
    const data = { a: 1, b: 2, c: 3 };
    const result = applyTransforms(data, [{ type: 'select', fields: ['a', 'c'] }]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('select with non-existent fields returns empty object for missing', () => {
    const data = { a: 1, b: 2 };
    const result = applyTransforms(data, [{ type: 'select', fields: ['a', 'z'] }]);
    // 'z' does not exist so it won't be in result
    expect(result).toEqual({ a: 1 });
  });

  it('drop a non-existent field is a no-op', () => {
    const data = { a: 1, b: 2 };
    const result = applyTransforms(data, [{ type: 'drop', field: 'nonexistent' }]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('compact removes null values and empty arrays', () => {
    const data = { a: 1, b: null, c: [], d: '' };
    const result = applyTransforms(data, [{ type: 'compact' }]);
    expect(result).toEqual({ a: 1 });
  });

  it('compact with all non-null values is a no-op', () => {
    const data = { a: 1, b: 'hello', c: [1, 2] };
    const result = applyTransforms(data, [{ type: 'compact' }]);
    expect(result).toEqual({ a: 1, b: 'hello', c: [1, 2] });
  });

  it('compact removes nested empty objects', () => {
    const data = { a: 1, b: { c: null, d: '' } };
    const result = applyTransforms(data, [{ type: 'compact' }]);
    // b's children are all empty, so b itself becomes empty and gets removed
    expect(result).toEqual({ a: 1 });
  });

  it('drop then compact works correctly', () => {
    const data = { a: 1, b: 2, debug: 'verbose info' };
    const result = applyTransforms(data, [
      { type: 'drop', field: 'debug' },
      { type: 'compact' },
    ]);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('select then drop then compact works correctly', () => {
    const data = { a: 1, b: null, c: 3, d: 4 };
    const result = applyTransforms(data, [
      { type: 'select', fields: ['a', 'b', 'c'] },
      { type: 'drop', field: 'c' },
      { type: 'compact' },
    ]);
    // select keeps a,b,c; drop removes c; compact removes b(null)
    expect(result).toEqual({ a: 1 });
  });

  it('filter with condition works on array field', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const data = {
      items: [
        { name: 'x', score: 0.8 },
        { name: 'y', score: 0.3 },
        { name: 'z', score: 0.9 },
      ],
    };
    const condition: import('../src/parser/ast.js').Expr = {
      kind: 'binary',
      op: '>',
      left: { kind: 'field_access', segments: ['score'], location: loc },
      right: { kind: 'literal', value: 0.5, location: loc },
      location: loc,
    };
    const result = applyTransforms(data, [{ type: 'filter', field: 'items', condition }]) as Record<string, unknown>;
    expect((result.items as unknown[]).length).toBe(2);
  });

  it('filter on non-array field is a no-op', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const data = { items: 'not an array', other: 1 };
    const condition: import('../src/parser/ast.js').Expr = {
      kind: 'literal',
      value: true,
      location: loc,
    };
    const result = applyTransforms(data, [{ type: 'filter', field: 'items', condition }]);
    expect(result).toEqual(data);
  });

  it('filter on missing field is a no-op', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const data = { other: 1 };
    const condition: import('../src/parser/ast.js').Expr = {
      kind: 'literal',
      value: true,
      location: loc,
    };
    const result = applyTransforms(data, [{ type: 'filter', field: 'nonexistent', condition }]);
    expect(result).toEqual(data);
  });

  it('truncate respects token limit', () => {
    const longString = 'a'.repeat(1000);
    const data = { text: longString };
    const result = applyTransforms(data, [{ type: 'truncate', tokens: 50 }]) as Record<string, unknown>;
    // 50 tokens * 4 chars = 200 chars max for JSON. The string should be truncated.
    const resultJson = JSON.stringify(result);
    expect(resultJson.length).toBeLessThan(JSON.stringify(data).length);
  });

  it('truncate on small data is a no-op', () => {
    const data = { a: 1, b: 'short' };
    const result = applyTransforms(data, [{ type: 'truncate', tokens: 5000 }]);
    expect(result).toEqual(data);
  });

  it('transforms on null/undefined data returns data unchanged', () => {
    expect(applyTransforms(null, [{ type: 'select', fields: ['a'] }])).toBeNull();
    expect(applyTransforms(undefined, [{ type: 'drop', field: 'a' }])).toBeUndefined();
  });

  it('transforms on primitive data returns data unchanged', () => {
    expect(applyTransforms(42, [{ type: 'select', fields: ['a'] }])).toBe(42);
    expect(applyTransforms('hello', [{ type: 'drop', field: 'a' }])).toBe('hello');
  });

  it('compact on array with null items removes them', () => {
    const data = [1, null, 'hello', '', [], {}];
    const result = applyTransforms(data, [{ type: 'compact' }]);
    expect(result).toEqual([1, 'hello']);
  });

  it('filter with equality condition', () => {
    const loc = { line: 1, column: 1, offset: 0 };
    const data = {
      items: [
        { status: 'active', name: 'a' },
        { status: 'inactive', name: 'b' },
        { status: 'active', name: 'c' },
      ],
    };
    const condition: import('../src/parser/ast.js').Expr = {
      kind: 'binary',
      op: '==',
      left: { kind: 'field_access', segments: ['status'], location: loc },
      right: { kind: 'literal', value: 'active', location: loc },
      location: loc,
    };
    const result = applyTransforms(data, [{ type: 'filter', field: 'items', condition }]) as Record<string, unknown>;
    const items = result.items as Array<{ status: string; name: string }>;
    expect(items.length).toBe(2);
    expect(items[0].name).toBe('a');
    expect(items[1].name).toBe('c');
  });
});

// ===========================================================================
// hooks.ts: generated JS correctness
// ===========================================================================
describe('hooks generated JS correctness', () => {
  const loc = { line: 1, column: 1, offset: 0 };

  it('generated select hook picks correct fields', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'select', fields: ['data', 'meta'] }],
      location: loc,
    };
    const hook = generateHook(edge)!;

    // Simulate running the generated transform code
    // Extract just the transform portion
    expect(hook).toContain('"data": data["data"]');
    expect(hook).toContain('"meta": data["meta"]');
  });

  it('generated filter hook produces correct JS syntax', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{
        type: 'filter',
        field: 'results',
        condition: {
          kind: 'binary',
          op: '!=',
          left: { kind: 'field_access', segments: ['item', 'status'], location: loc },
          right: { kind: 'literal', value: 'deleted', location: loc },
          location: loc,
        },
      }],
      location: loc,
    };
    const hook = generateHook(edge)!;

    // The filter should use !== for != operator
    expect(hook).toContain('!==');
    expect(hook).toContain('"deleted"');
    // The field access should use the last segment as the item property
    expect(hook).toContain('item["status"]');
  });

  it('generated hook for truncate produces no transform code (truncate is skipped in JS)', () => {
    const edge: EdgeDecl = {
      source: 'A',
      target: { kind: 'direct', node: 'B' },
      transforms: [{ type: 'truncate', tokens: 500 }],
      location: loc,
    };
    const hook = generateHook(edge)!;
    // truncate transform is a no-op in generated JS (just spread data)
    expect(hook).toContain('let result = { ...data }');
  });
});

// ===========================================================================
// orchestration.ts: edge transform descriptions
// ===========================================================================
describe('orchestration transform descriptions', () => {
  it('describes select transform correctly', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut {
          data: String
          debug: String
        }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces BOut { result: String }
      }
      edge A -> B | select(data) | compact
      graph G(input: Spec, output: BOut, budget: 10k) { A -> B -> done }
    `);
    const report = makeReport(program);
    const result = generateOrchestration(program, report);

    expect(result).toContain('keep only fields');
    expect(result).toContain('`data`');
    expect(result).toContain('minify JSON');
  });

  it('describes drop transform correctly', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces AOut {
          data: String
          debug: String
        }
      }
      node B(model: sonnet, budget: 2k/1k) {
        reads: [AOut]
        produces BOut { result: String }
      }
      edge A -> B | drop(debug)
      graph G(input: Spec, output: BOut, budget: 10k) { A -> B -> done }
    `);
    const report = makeReport(program);
    const result = generateOrchestration(program, report);

    expect(result).toContain('remove field');
    expect(result).toContain('`debug`');
  });
});
