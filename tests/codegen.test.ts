import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { generateAgent } from '../src/codegen/agents.js';
import { generateHook } from '../src/codegen/hooks.js';
import { generateOrchestration } from '../src/codegen/orchestration.js';
import { generateSettings } from '../src/codegen/settings.js';
import { generate } from '../src/codegen/codegen.js';
import { Program } from '../src/parser/ast.js';
import { TokenReport } from '../src/analyzer/estimator.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}

// ---------------------------------------------------------------------------
// generateAgent
// ---------------------------------------------------------------------------
describe('generateAgent', () => {
  it('generates agent markdown for a node', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Research {
          findings: List<String>
          confidence: Float(0..1)
        }
      }
      graph G(input: Spec, output: Research, budget: 5k) { Researcher -> done }
    `);
    const node = program.nodes[0];
    const md = generateAgent(node);

    expect(md).toContain('name: researcher');
    expect(md).toContain('claude-sonnet-4-20250514');
    expect(md).toContain('# Researcher Agent');
    expect(md).toContain('"findings"');
    expect(md).toContain('"confidence"');
    expect(md).toContain('2000'); // budgetIn
    expect(md).toContain('1000'); // budgetOut
    expect(md).toContain('===NODE_COMPLETE:researcher===');
  });

  it('includes tools in frontmatter', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Impl(model: sonnet, budget: 8k/4k) {
        reads: [Spec]
        tools: [file_read, file_write, terminal]
        produces Out { files: List<FileDiff> }
      }
      graph G(input: Spec, output: Out, budget: 15k) { Impl -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('Read');
    expect(md).toContain('Write');
    expect(md).toContain('Edit');
    expect(md).toContain('Bash');
  });

  it('includes failure protocol for retry', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: retry(2)
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('Retry up to 2 times');
    expect(md).toContain('===NODE_FAILED:a===');
  });

  it('includes failure protocol for skip', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: skip
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('skip this node');
    expect(md).toContain('===NODE_SKIPPED:a===');
  });

  it('includes failure protocol for abort', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        on_failure: abort
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('abort the entire pipeline');
    expect(md).toContain('===PIPELINE_ABORTED:a===');
  });

  it('includes default failure protocol when on_failure is absent', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('Failure Protocol');
    expect(md).toContain('===NODE_FAILED:a===');
  });

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

  it('handles partial reads', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer
      graph G(input: Spec, output: Answer, budget: 6k) { Researcher -> Writer -> done }
    `);
    const md = generateAgent(program.nodes[1]);
    expect(md).toContain('Research.findings');
  });

  it('resolves unknown model name as pass-through', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: gpt4o, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('model: gpt4o');
  });

  it('generates JSON example for struct types', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          meta: Meta {
            title: String
            count: Int
          }
        }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const md = generateAgent(program.nodes[0]);
    expect(md).toContain('"title"');
    expect(md).toContain('"count"');
  });
});

// ---------------------------------------------------------------------------
// generateHook
// ---------------------------------------------------------------------------
describe('generateHook', () => {
  it('generates bash hook script for edge with transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          findings: List<String>
          score: Float(0..1)
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(findings)
        | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const edge = program.edges[0];
    const sh = generateHook(edge);

    expect(sh).not.toBeNull();
    expect(sh).toContain('#!/bin/bash');
    expect(sh).toContain('set -euo pipefail');
    expect(sh).toContain('a.json');
    expect(sh).toContain('a_to_b.json');
    expect(sh).toContain('jq');
    expect(sh).toContain('findings');
    expect(sh).toContain('-c');
  });

  it('returns null for edge without transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).toBeNull();
  });

  it('generates drop transform as del()', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          data: String
          debug: String
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | drop(debug)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).not.toBeNull();
    expect(sh).toContain('del(.debug)');
  });

  it('generates select projection for multiple fields', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out {
          a: String
          b: String
          c: String
        }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
        | select(a)
        | select(b)
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const sh = generateHook(program.edges[0]);
    expect(sh).not.toBeNull();
    expect(sh).toContain('a: .a');
    expect(sh).toContain('b: .b');
  });
});

// ---------------------------------------------------------------------------
// generateOrchestration
// ---------------------------------------------------------------------------
describe('generateOrchestration', () => {
  it('generates CLAUDE.md with execution plan', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer | select(findings) | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const report: TokenReport = {
      graphName: 'SimpleQA',
      budget: 6000,
      bestCase: 5300,
      worstCase: 5300,
      nodes: [
        { name: 'Researcher', estimatedIn: 2000, estimatedOut: 1000 },
        { name: 'Writer', estimatedIn: 1500, estimatedOut: 800 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);

    expect(md).toContain('Graft Orchestration: SimpleQA');
    expect(md).toContain('6,000');
    expect(md).toContain('Researcher');
    expect(md).toContain('Writer');
    expect(md).toContain('Step 1');
    expect(md).toContain('Step 2');
    expect(md).toContain('===NODE_COMPLETE:researcher===');
    expect(md).toContain('researcher_to_writer.json');
  });

  it('shows direct input for edge without transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const report: TokenReport = {
      graphName: 'G',
      budget: 5000,
      bestCase: 3500,
      worstCase: 3500,
      nodes: [
        { name: 'A', estimatedIn: 500, estimatedOut: 1000 },
        { name: 'B', estimatedIn: 1000, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toContain('a.json');
    expect(md).not.toContain('a_to_b.json');
  });

  it('returns empty string when no graphs', () => {
    const program: Program = { contexts: [], nodes: [], edges: [], graphs: [] };
    const report: TokenReport = {
      graphName: '',
      budget: 0,
      bestCase: 0,
      worstCase: 0,
      nodes: [],
      warnings: [],
    };
    const md = generateOrchestration(program, report);
    expect(md).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateSettings
// ---------------------------------------------------------------------------
describe('generateSettings', () => {
  it('generates settings with model routing', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B | compact
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');

    expect(settings.model).toBe('claude-sonnet-4-20250514');
    expect(settings.graft.budget.total).toBe(5000);
    expect(settings.graft.model_routing.overrides.b).toBe('claude-haiku-4-5-20251001');
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PostToolUse.length).toBe(1);
    expect(settings.hooks.PostToolUse[0].matcher).toContain('a.json');
  });

  it('has no overrides when all nodes use same model', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    expect(Object.keys(settings.graft.model_routing.overrides)).toHaveLength(0);
  });

  it('includes valid compiled_at ISO timestamp', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    // Verify it is a valid ISO date string (non-deterministic, so just check format)
    expect(new Date(settings.graft.compiled_at).toISOString()).toBe(settings.graft.compiled_at);
  });

  it('passes through custom model strings', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: gpt4o, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      graph G(input: Spec, output: Out, budget: 5k) { A -> done }
    `);
    const settings = generateSettings(program, 'test.gft');
    expect(settings.model).toBe('gpt4o');
  });
});

// ---------------------------------------------------------------------------
// generate (full pipeline)
// ---------------------------------------------------------------------------
describe('generate', () => {
  it('produces correct number of GeneratedFile entries', () => {
    const program = parse(`
      context UserRequest(max_tokens: 500) { question: String }
      node Researcher(model: sonnet, budget: 2k/1k) {
        reads: [UserRequest]
        produces Research { findings: List<String> }
      }
      node Writer(model: haiku, budget: 1500/800) {
        reads: [Research.findings]
        produces Answer { response: String }
      }
      edge Researcher -> Writer | select(findings) | compact
      graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
        Researcher -> Writer -> done
      }
    `);
    const report: TokenReport = {
      graphName: 'SimpleQA',
      budget: 6000,
      bestCase: 5300,
      worstCase: 5300,
      nodes: [
        { name: 'Researcher', estimatedIn: 2000, estimatedOut: 1000 },
        { name: 'Writer', estimatedIn: 1500, estimatedOut: 800 },
      ],
      warnings: [],
    };
    const files = generate(program, report, 'hello.gft');

    // 2 agents + 1 hook + 1 CLAUDE.md + 1 settings.json + 2 scaffold = 7
    expect(files).toHaveLength(7);
    expect(files.map(f => f.path)).toContain('.claude/agents/researcher.md');
    expect(files.map(f => f.path)).toContain('.claude/agents/writer.md');
    expect(files.map(f => f.path)).toContain('.claude/hooks/researcher-to-writer.sh');
    expect(files.map(f => f.path)).toContain('.claude/CLAUDE.md');
    expect(files.map(f => f.path)).toContain('.claude/settings.json');
    expect(files.map(f => f.path)).toContain('.graft/session/node_outputs/.gitkeep');
    expect(files.map(f => f.path)).toContain('.graft/token_log.txt');
  });

  it('produces fewer files when edge has no transforms', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { name: String }
      node A(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { data: String }
      }
      node B(model: haiku, budget: 1k/500) {
        reads: [Out]
        produces Final { result: String }
      }
      edge A -> B
      graph G(input: Spec, output: Final, budget: 5k) { A -> B -> done }
    `);
    const report: TokenReport = {
      graphName: 'G',
      budget: 5000,
      bestCase: 3500,
      worstCase: 3500,
      nodes: [
        { name: 'A', estimatedIn: 500, estimatedOut: 1000 },
        { name: 'B', estimatedIn: 1000, estimatedOut: 500 },
      ],
      warnings: [],
    };
    const files = generate(program, report, 'test.gft');

    // 2 agents + 0 hooks + 1 CLAUDE.md + 1 settings.json + 2 scaffold = 6
    expect(files).toHaveLength(6);
    expect(files.map(f => f.path)).not.toContain(expect.stringContaining('hooks/'));
  });
});
