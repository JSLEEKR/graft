import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';

// ── Type: conditional branch mismatch warning ──────────────────

describe('Type: conditional branch type mismatch warning', () => {
  function compileGraph(flowLine: string) {
    const source = [
      'context In(max_tokens: 500) { data: String }',
      'node A(model: sonnet, budget: 2k/1k) {',
      '  reads: [In]',
      '  produces Out {',
      '    score: Int',
      '    status: String',
      '    flag: Bool',
      '  }',
      '}',
      'graph G(input: In, output: Out, budget: 5k) {',
      `  A -> ${flowLine} -> done`,
      '}',
    ].join('\n');
    return compile(source, 'test.gft');
  }

  it('same-type branches: no warning', () => {
    const result = compileGraph('let x = if A.score > 50 then "high" else "low"');
    expect(result.success).toBe(true);
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings).toHaveLength(0);
  });

  it('same-type branches (number): no warning', () => {
    const result = compileGraph('let x = if A.score > 100 then 100 else A.score');
    expect(result.success).toBe(true);
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings).toHaveLength(0);
  });

  it('different-type branches (string vs number): warning', () => {
    const result = compileGraph('let x = if A.score > 50 then "high" else 42');
    expect(result.success).toBe(true); // warning, not error
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('different-type branches (boolean vs string): warning', () => {
    const result = compileGraph('let x = if A.flag then true else "nope"');
    expect(result.success).toBe(true);
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('known different types from schema: warning', () => {
    const result = compileGraph('let x = if A.score > 50 then A.score else A.status');
    expect(result.success).toBe(true);
    // A.score → number, A.status → string → should warn
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('nested conditional: warning on inner mismatch only', () => {
    const result = compileGraph('let x = if A.score > 80 then "A" else if A.score > 50 then "B" else 0');
    expect(result.success).toBe(true);
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    // Inner conditional has "B" (string) vs 0 (number) → warning
    // Outer has "A" (string) vs inner-unknown → no warning (inner is unknown due to mismatch)
    expect(warnings.length).toBe(1);
  });

  it('warning message includes type names', () => {
    const result = compileGraph('let x = if A.score > 50 then "text" else 99');
    const warnings = result.warnings?.filter(w => w.code === 'TYPE_CONDITIONAL_MISMATCH') ?? [];
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].message).toContain('string');
    expect(warnings[0].message).toContain('number');
  });
});
