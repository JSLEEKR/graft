import { describe, it, expect } from 'vitest';
import { mkCond } from './helpers.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import type { Program, EdgeDecl, ConditionalBranch } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

const loc = { line: 1, column: 1, offset: 0 };

/** Helper: add a conditional edge to a program manually */
function addConditionalEdge(
  program: Program,
  source: string,
  branches: ConditionalBranch[],
): void {
  program.edges.push({
    source,
    target: { kind: 'conditional', branches },
    transforms: [],
    location: loc,
  });
}

// ========================================
// v3.8-R2: Multi-Hop Conditional Chain Estimation
// ========================================
describe('TokenEstimator — multi-hop conditional chains', () => {
  // Base program template: A -> B -> C -> D, each with known costs
  // A: reads Spec(500), budgetOut 500 => cost 1000
  // B: reads OutA(500), budgetOut 300 => cost 800
  // C: reads OutB(300), budgetOut 200 => cost 500
  // D: reads OutC(200), budgetOut 100 => cost 300
  const BASE_SRC = `
    context Spec(max_tokens: 500) { name: String }
    node A(model: sonnet, budget: 1k/500) {
      reads: [Spec]
      produces OutA { result: String }
    }
    node B(model: sonnet, budget: 1k/300) {
      reads: [OutA]
      produces OutB { result: String }
    }
    node C(model: sonnet, budget: 1k/200) {
      reads: [OutB]
      produces OutC { result: String }
    }
    node D(model: sonnet, budget: 1k/100) {
      reads: [OutC]
      produces OutD { result: String }
    }
    graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
  `;

  it('1. single-hop backward compat (best=min, worst=max)', () => {
    // Same as v3.4-R06 test: single hop conditional edge
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node Cheap(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutCheap { result: String }
      }
      node Expensive(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutExpensive { result: String }
      }
      edge A -> {
        when score > 0.5 -> Expensive
        else -> Cheap
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A cost: 500 + 500 = 1000
    // Cheap: 500 + 200 = 700, Expensive: 500 + 1000 = 1500
    // Best: 1000 + 700 = 1700, Worst: 1000 + 1500 = 2500
    expect(report.bestCase).toBe(1700);
    expect(report.worstCase).toBe(2500);
  });

  it('2. 2-hop chain costs accumulate', () => {
    // A -> B -> C (conditional chain)
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: mkCond('x', '>', 0), target: 'C' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: 1000, B: 500+300=800, C: 300+200=500
    // Chain from A: B(800) + chain from B: C(500) = 1300
    // Total: 1000 + 1300 = 2300
    expect(report.bestCase).toBe(1000 + 800 + 500);
    expect(report.worstCase).toBe(1000 + 800 + 500);
  });

  it('3. 3-hop chain accumulates all', () => {
    // A -> B -> C -> D (conditional chain)
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: mkCond('x', '>', 0), target: 'C' },
    ]);
    addConditionalEdge(program, 'C', [
      { condition: mkCond('x', '>', 0), target: 'D' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A: 1000, B: 800, C: 500, D: 200+100=300
    // Total: 1000 + 800 + 500 + 300 = 2600
    expect(report.bestCase).toBe(1000 + 800 + 500 + 300);
    expect(report.worstCase).toBe(1000 + 800 + 500 + 300);
  });

  it('4. chain to done mid-path stops accumulation', () => {
    // A -> { B, done }, B -> C (but done branch stops)
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
      { condition: undefined, target: 'done' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: mkCond('x', '>', 0), target: 'C' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Best: A(1000) + done(0) = 1000
    // Worst: A(1000) + B(800) + C(500) = 2300
    expect(report.bestCase).toBe(1000);
    expect(report.worstCase).toBe(1000 + 800 + 500);
  });

  it('5. cycle detection emits warning and returns finite result', () => {
    // A -> B -> A (cycle)
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: mkCond('x', '>', 0), target: 'A' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A(1000) + B(800) + cycle(A)=0 with warning
    expect(report.bestCase).toBe(1000 + 800);
    expect(report.worstCase).toBe(1000 + 800);
    expect(report.warnings.some(w => w.message.includes('cycle'))).toBe(true);
    expect(report.warnings.some(w => w.code === 'BUDGET_CHAIN_CYCLE')).toBe(true);
  });

  it('6. depth limit emits warning and returns finite result', () => {
    // Create a chain longer than MAX_CONDITIONAL_HOPS (10)
    // We need 11+ nodes in a chain: N0 -> N1 -> N2 -> ... -> N11
    const nodes: string[] = [];
    let src = 'context Spec(max_tokens: 100) { name: String }\n';
    for (let i = 0; i < 12; i++) {
      const name = `N${i}`;
      nodes.push(name);
      if (i === 0) {
        src += `node ${name}(model: sonnet, budget: 200/100) { reads: [Spec] produces Out${name} { r: String } }\n`;
      } else {
        src += `node ${name}(model: sonnet, budget: 200/100) { reads: [Out${nodes[i - 1]}] produces Out${name} { r: String } }\n`;
      }
    }
    src += `graph G(input: Spec, output: OutN0, budget: 100k) { ${nodes[0]} -> done }\n`;
    const program = parse(src);
    // Chain: N0 -> N1 -> N2 -> ... -> N11
    for (let i = 0; i < 11; i++) {
      addConditionalEdge(program, nodes[i], [
        { condition: mkCond('r', '>', 0), target: nodes[i + 1] },
      ]);
    }
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Should stop at depth 10 and emit a warning
    expect(report.warnings.some(w => w.message.includes('depth'))).toBe(true);
    // Result should be finite (not infinite)
    expect(Number.isFinite(report.bestCase)).toBe(true);
    expect(Number.isFinite(report.worstCase)).toBe(true);
  });

  it('7. no conditional edges means base cost only', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    expect(report.bestCase).toBe(1000);
    expect(report.worstCase).toBe(1000);
    expect(report.warnings).toHaveLength(0);
  });

  it('8. best/worst diverge with asymmetric chains', () => {
    // A -> { Cheap, Expensive }
    // Cheap -> SmallFollow, Expensive -> BigFollow
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node Cheap(model: haiku, budget: 500/200) {
        reads: [OutA]
        produces OutCheap { result: String }
      }
      node Expensive(model: opus, budget: 2k/1k) {
        reads: [OutA]
        produces OutExpensive { result: String }
      }
      node SmallFollow(model: haiku, budget: 300/100) {
        reads: [OutCheap]
        produces OutSmall { result: String }
      }
      node BigFollow(model: opus, budget: 3k/2k) {
        reads: [OutExpensive]
        produces OutBig { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 100k) { A -> done }
    `);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'Cheap' },
      { condition: undefined, target: 'Expensive' },
    ]);
    addConditionalEdge(program, 'Cheap', [
      { condition: mkCond('x', '>', 0), target: 'SmallFollow' },
    ]);
    addConditionalEdge(program, 'Expensive', [
      { condition: mkCond('x', '>', 0), target: 'BigFollow' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // Cheap: 500+200=700, SmallFollow: 200+100=300 => Cheap path = 1000
    // Expensive: 500+1000=1500, BigFollow: 1000+2000=3000 => Expensive path = 4500
    // Best: A(1000) + min(700+300, 1500+3000) = 1000 + 1000 = 2000
    // Worst: A(1000) + max(700+300, 1500+3000) = 1000 + 4500 = 5500
    expect(report.bestCase).toBe(1000 + 700 + 300);
    expect(report.worstCase).toBe(1000 + 1500 + 3000);
  });

  it('9. retry multiplier applies within chain hops', () => {
    // A -> B (retry max 2), so worst = B * 3
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces OutA { result: String }
      }
      node B(model: sonnet, budget: 1k/300) {
        reads: [OutA]
        on_failure: retry(2)
        produces OutB { result: String }
      }
      graph G(input: Spec, output: OutA, budget: 50k) { A -> done }
    `);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // B cost: 500 + 300 = 800, retry(2) => worst = 800 * 3 = 2400
    // Best: A(1000) + B(800) = 1800
    // Worst: A(1000) + B(2400) = 3400
    expect(report.bestCase).toBe(1000 + 800);
    expect(report.worstCase).toBe(1000 + 800 * 3);
  });

  it('10. all branches target done results in zero chain cost', () => {
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'done' },
      { condition: undefined, target: 'done' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // A(1000) + done(0) = 1000
    expect(report.bestCase).toBe(1000);
    expect(report.worstCase).toBe(1000);
  });

  it('11. diamond path counts D per path independently', () => {
    // A -> { B, C }, B -> D, C -> D
    // D should be counted in both paths independently
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'B' },
      { condition: undefined, target: 'C' },
    ]);
    addConditionalEdge(program, 'B', [
      { condition: mkCond('x', '>', 0), target: 'D' },
    ]);
    addConditionalEdge(program, 'C', [
      { condition: mkCond('x', '>', 0), target: 'D' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // B: 800, D: 300 => B path = 800 + 300 = 1100
    // C: 500, D: 300 => C path = 500 + 300 = 800
    // Best: A(1000) + min(1100, 800) = 1800
    // Worst: A(1000) + max(1100, 800) = 2100
    expect(report.bestCase).toBe(1000 + 500 + 300);
    expect(report.worstCase).toBe(1000 + 800 + 300);
  });

  it('12. unknown target is skipped gracefully', () => {
    const program = parse(BASE_SRC);
    addConditionalEdge(program, 'A', [
      { condition: mkCond('x', '>', 0), target: 'NonExistent' },
      { condition: undefined, target: 'B' },
    ]);
    const estimator = new TokenEstimator(program);
    const report = estimator.estimate();
    // NonExistent skipped, B: 800
    // Best: A(1000) + B(800) (only B is valid)
    // If NonExistent is skipped entirely (no cost entry), only B counts
    // But if both are present: best = min(B), worst = max(B) since NonExistent produces nothing
    // With NonExistent skipped: only B in the arrays => best=worst=800
    expect(report.bestCase).toBe(1000 + 800);
    expect(report.worstCase).toBe(1000 + 800);
    expect(report.warnings).toHaveLength(0);
  });
});
