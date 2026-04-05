import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { generate } from '../src/codegen/codegen.js';
import { GenericBackend } from '../src/codegen/generic-backend.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { ProgramIndex } from '../src/program-index.js';
import { Program } from '../src/parser/ast.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse().program;
}

const SIMPLE_PIPELINE = `
  context Input(max_tokens: 500) { question: String }

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

  graph pipeline(input: Input, output: Output, budget: 10k) {
    Analyst -> Reviewer -> done
  }
`;

describe('GenericBackend', () => {
  const backend = new GenericBackend();

  it('has name "generic"', () => {
    expect(backend.name).toBe('generic');
  });

  describe('generate() with generic backend', () => {
    it('produces files with valid structure', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();

      const files = generate(program, report, 'test.gft', index, backend);

      // Should have agent files, orchestration, settings, and scaffolding
      const paths = files.map(f => f.path);
      expect(paths).toContain('.claude/agents/analyst.md');
      expect(paths).toContain('.claude/agents/reviewer.md');
      expect(paths).toContain('.claude/orchestration.md');
      expect(paths).toContain('.claude/settings.json');
      expect(paths).toContain('.graft/session/node_outputs/.gitkeep');
    });

    it('produces hooks for edges with transforms', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();

      const files = generate(program, report, 'test.gft', index, backend);
      const hookFile = files.find(f => f.path.includes('hooks/'));

      expect(hookFile).toBeDefined();
      expect(hookFile!.content).toContain('select, compact');
      expect(hookFile!.content).toContain('generic backend');
    });
  });

  describe('generateAgent', () => {
    it('produces markdown with metadata and schema', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const content = backend.generateAgent(program.nodes[0], new Set(), ctx);

      expect(content).toContain('# Analyst Agent');
      expect(content).toContain('**name**: analyst');
      expect(content).toContain('**produces**: Analysis');
      expect(content).toContain('"answer"');
      expect(content).toContain('"confidence"');
      expect(content).toContain('.graft/session/node_outputs/analyst.json');
    });

    it('includes reads list', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const content = backend.generateAgent(program.nodes[0], new Set(), ctx);
      expect(content).toContain('- Input');
    });

    it('includes tools section when tools are declared', () => {
      const source = `
        context Spec(max_tokens: 500) { name: String }
        node Impl(model: sonnet, budget: 8k/4k) {
          reads: [Spec]
          tools: [file_read, file_write]
          produces Out { files: List<FileDiff> }
        }
        graph G(input: Spec, output: Out, budget: 15k) { Impl -> done }
      `;
      const program = parse(source);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const content = backend.generateAgent(program.nodes[0], new Set(), ctx);
      expect(content).toContain('## Tools');
      expect(content).toContain('- file_read');
      expect(content).toContain('- file_write');
    });
  });

  describe('generateHook', () => {
    it('returns null for edges without transforms', () => {
      const source = `
        context A(max_tokens: 100) { x: String }
        node N1(model: sonnet, budget: 1k/1k) {
          reads: [A]
          produces B { y: String }
        }
        node N2(model: sonnet, budget: 1k/1k) {
          reads: [B]
          produces C { z: String }
        }
        edge N1 -> N2
        graph G(input: A, output: C, budget: 5k) { N1 -> N2 -> done }
      `;
      const program = parse(source);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const result = backend.generateHook(program.edges[0], ctx);
      expect(result).toBeNull();
    });

    it('generates JS hook stub for edges with transforms', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const edge = program.edges[0];
      const result = backend.generateHook(edge, ctx);

      expect(result).not.toBeNull();
      expect(result).toContain('analyst');
      expect(result).toContain('reviewer');
      expect(result).toContain('select, compact');
      expect(result).toContain('fs.readFileSync');
      expect(result).toContain('fs.writeFileSync');
    });
  });

  describe('generateOrchestration', () => {
    it('produces markdown orchestration doc', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const content = backend.generateOrchestration(ctx);

      expect(content).toContain('# pipeline');
      expect(content).toContain('Orchestration');
      expect(content).toContain('generic backend');
      expect(content).toContain('Analyst');
      expect(content).toContain('Reviewer');
    });
  });

  describe('generateSettings', () => {
    it('produces JSON settings with graft metadata', () => {
      const program = parse(SIMPLE_PIPELINE);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const settings = backend.generateSettings(ctx);

      expect(settings).toHaveProperty('graft');
      const graft = settings.graft as Record<string, unknown>;
      expect(graft.backend).toBe('generic');
      expect(graft.nodes).toEqual(['Analyst', 'Reviewer']);
      expect(graft).toHaveProperty('model_routing');
      expect(graft).toHaveProperty('budget');
      expect(graft).toHaveProperty('edges');
    });
  });

  describe('conditional edges', () => {
    it('generates conditional hook stub', () => {
      const source = `
        context Input(max_tokens: 500) { query: String }
        node Router(model: sonnet, budget: 2k/1k) {
          reads: [Input]
          produces Decision { score: Float }
        }
        node HandlerA(model: sonnet, budget: 2k/1k) {
          reads: [Decision]
          produces Out { result: String }
        }
        node HandlerB(model: sonnet, budget: 2k/1k) {
          reads: [Decision]
          produces Out2 { result: String }
        }
        edge Router -> {
          when score >= 0.5 -> HandlerA
          else -> HandlerB
        }
        graph G(input: Input, output: Out, budget: 10k) {
          Router -> HandlerA -> done
        }
      `;
      const program = parse(source);
      const index = new ProgramIndex(program);
      const report = new TokenEstimator(program, index).estimate();
      const ctx = { program, report, index, sourceFile: 'test.gft' };

      const conditionalEdge = program.edges.find(e => e.target.kind === 'conditional');
      expect(conditionalEdge).toBeDefined();

      const result = backend.generateConditionalHook!(conditionalEdge!, ctx);
      expect(result).not.toBeNull();
      expect(result).toContain('router');
      expect(result).toContain('HandlerA');
      expect(result).toContain('HandlerB');
    });
  });
});
