import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const HELLO_GFT = `
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

describe('end-to-end compilation', () => {
  it('compiles hello.gft successfully', () => {
    const result = compile(HELLO_GFT, 'hello.gft');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.program).toBeDefined();
    expect(result.report).toBeDefined();
    expect(result.files).toBeDefined();
  });

  it('generates correct file set', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const filePaths = result.files!.map(f => f.path).sort();

    expect(filePaths).toContain('.claude/CLAUDE.md');
    expect(filePaths).toContain('.claude/agents/researcher.md');
    expect(filePaths).toContain('.claude/agents/writer.md');
    expect(filePaths).toContain('.claude/hooks/researcher-to-writer.sh');
    expect(filePaths).toContain('.claude/settings.json');
    expect(filePaths).toContain('.graft/session/node_outputs/.gitkeep');
    expect(filePaths).toContain('.graft/token_log.txt');
  });

  it('reports token analysis within budget', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const report = result.report!;

    expect(report.graphName).toBe('SimpleQA');
    expect(report.budget).toBe(6000);
    expect(report.bestCase).toBeLessThanOrEqual(report.budget);
    expect(report.nodes).toHaveLength(2);
    expect(report.warnings).toEqual([]);
  });

  it('generates valid JSON in settings', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const settingsFile = result.files!.find(f => f.path === '.claude/settings.json');
    expect(settingsFile).toBeDefined();

    const settings = JSON.parse(settingsFile!.content);
    expect(settings.model).toBe('claude-sonnet-4-20250514');
    expect(settings.graft.budget.total).toBe(6000);
    expect(settings.graft.model_routing.overrides.writer).toBe('claude-haiku-4-5-20251001');
  });

  it('generates agent markdown with correct structure', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const researcherAgent = result.files!.find(f => f.path === '.claude/agents/researcher.md');
    expect(researcherAgent).toBeDefined();
    expect(researcherAgent!.content).toContain('claude-sonnet-4-20250514');
    expect(researcherAgent!.content).toContain('===NODE_COMPLETE:researcher===');
  });

  it('generates hook script with jq transforms', () => {
    const result = compile(HELLO_GFT, 'hello.gft');
    const hook = result.files!.find(f => f.path === '.claude/hooks/researcher-to-writer.sh');
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('jq');
    expect(hook!.content).toContain('findings');
  });

  it('rejects invalid programs', () => {
    const badSource = `
      node A(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { data: String }
      }
      graph G(input: NonExistent, output: Out, budget: 5k) { A -> done }
    `;
    const result = compile(badSource, 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('catches lexer errors', () => {
    const result = compile('@@@', 'bad.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toBeInstanceOf(GraftError);
  });

  it('rejects programs with no graph declaration', () => {
    const noGraphSource = `
      context Ctx(max_tokens: 100) {
        data: String
      }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Ctx]
        produces Out { data: String }
      }
    `;
    const result = compile(noGraphSource, 'nograph.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('No graph declaration found');
  });

  it('compiles parallel_flow.gft end-to-end', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/parallel_flow.gft'), 'utf-8');
    const result = compile(source, 'parallel_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    expect(result.report!.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('compiles foreach_flow.gft end-to-end', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../benchmarks/correctness/foreach_flow.gft'), 'utf-8');
    const result = compile(source, 'foreach_flow.gft');
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.report).toBeDefined();
    // Foreach best case should be much less than worst case
    expect(result.report!.worstCase).toBeGreaterThan(result.report!.bestCase);
  });
});
