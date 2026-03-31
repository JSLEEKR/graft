// tests/parser.test.ts
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Parser', () => {
  describe('context', () => {
    it('parses a basic context declaration', () => {
      const program = parse(`
        context UserRequest(max_tokens: 500) {
          question: String
        }
      `);
      expect(program.contexts).toHaveLength(1);
      const ctx = program.contexts[0];
      expect(ctx.name).toBe('UserRequest');
      expect(ctx.maxTokens).toBe(500);
      expect(ctx.fields).toHaveLength(1);
      expect(ctx.fields[0].name).toBe('question');
      expect(ctx.fields[0].type).toEqual({ kind: 'primitive', name: 'String' });
    });

    it('parses context with k-suffix max_tokens', () => {
      const program = parse(`
        context Spec(max_tokens: 1k) {
          name: String
        }
      `);
      expect(program.contexts[0].maxTokens).toBe(1000);
    });

    it('parses context with multiple fields and collection types', () => {
      const program = parse(`
        context TaskSpec(max_tokens: 1k) {
          description: String
          criteria: List<String>
          issues: List<IssueRef>
        }
      `);
      const ctx = program.contexts[0];
      expect(ctx.fields).toHaveLength(3);
      expect(ctx.fields[1].type).toEqual({ kind: 'list', element: { kind: 'primitive', name: 'String' } });
      expect(ctx.fields[2].type).toEqual({ kind: 'list', element: { kind: 'domain', name: 'IssueRef' } });
    });
  });

  describe('node', () => {
    it('parses a basic node declaration', () => {
      const program = parse(`
        node Writer(model: haiku, budget: 1500/800) {
          reads: [UserRequest]

          produces Answer {
            response: String
          }
        }
      `);
      expect(program.nodes).toHaveLength(1);
      const node = program.nodes[0];
      expect(node.name).toBe('Writer');
      expect(node.model).toBe('haiku');
      expect(node.budgetIn).toBe(1500);
      expect(node.budgetOut).toBe(800);
      expect(node.reads).toHaveLength(1);
      expect(node.reads[0].context).toBe('UserRequest');
      expect(node.produces.name).toBe('Answer');
      expect(node.produces.fields).toHaveLength(1);
    });

    it('parses node with k-suffix budget', () => {
      const program = parse(`
        node Analyzer(model: sonnet, budget: 5k/2k) {
          reads: [TaskSpec]
          produces Result {
            score: Float(0..1)
          }
        }
      `);
      const node = program.nodes[0];
      expect(node.budgetIn).toBe(5000);
      expect(node.budgetOut).toBe(2000);
    });

    it('parses node with partial reads', () => {
      const program = parse(`
        node Writer(model: haiku, budget: 1k/500) {
          reads: [Research.findings]
          produces Answer {
            response: String
          }
        }
      `);
      expect(program.nodes[0].reads[0]).toMatchObject({
        context: 'Research',
        field: 'findings',
      });
    });

    it('parses node with tools and on_failure', () => {
      const program = parse(`
        node Impl(model: sonnet, budget: 8k/4k) {
          reads: [Plan]
          tools: [file_read, file_write, terminal]
          on_failure: retry(2)
          produces Implementation {
            files: List<FileDiff>
          }
        }
      `);
      const node = program.nodes[0];
      expect(node.tools).toEqual(['file_read', 'file_write', 'terminal']);
      expect(node.onFailure).toEqual({ type: 'retry', max: 2 });
    });

    it('parses node with inline struct type', () => {
      const program = parse(`
        node Analyzer(model: sonnet, budget: 5k/2k) {
          reads: [TaskSpec]
          produces AnalysisResult {
            issues: List<Issue {
              file: FilePath
              severity: enum(low, medium, high)
            }>
          }
        }
      `);
      const issueType = program.nodes[0].produces.fields[0].type;
      expect(issueType.kind).toBe('list');
      if (issueType.kind === 'list') {
        expect(issueType.element.kind).toBe('struct');
        if (issueType.element.kind === 'struct') {
          expect(issueType.element.name).toBe('Issue');
          expect(issueType.element.fields).toHaveLength(2);
        }
      }
    });

    it('parses node with retry_then_fallback failure strategy', () => {
      const program = parse(`
        node Main(model: opus, budget: 10k/5k) {
          reads: [Spec]
          on_failure: retry(2, fallback(Simple))
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({
        type: 'retry_then_fallback',
        max: 2,
        node: 'Simple',
      });
    });

    it('parses node with skip failure strategy', () => {
      const program = parse(`
        node Optionality(model: haiku, budget: 1k/500) {
          reads: [Data]
          on_failure: skip
          produces Result {
            value: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'skip' });
    });

    it('parses node with abort failure strategy', () => {
      const program = parse(`
        node Critical(model: sonnet, budget: 5k/2k) {
          reads: [Input]
          on_failure: abort
          produces Output {
            data: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'abort' });
    });

    it('parses node with standalone fallback failure strategy', () => {
      const program = parse(`
        node Primary(model: opus, budget: 10k/5k) {
          reads: [Spec]
          on_failure: fallback(Backup)
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].onFailure).toEqual({ type: 'fallback', node: 'Backup' });
    });

    it('reports error when node is missing produces', () => {
      expect(() => parse(`
        node Bad(model: haiku, budget: 1k/500) {
          reads: [Data]
        }
      `)).toThrow('Node must have a produces declaration');
    });
  });

  describe('edge', () => {
    it('parses a simple edge', () => {
      const program = parse('edge Researcher -> Writer');
      expect(program.edges).toHaveLength(1);
      const edge = program.edges[0];
      expect(edge.source).toBe('Researcher');
      expect(edge.target).toEqual({ kind: 'direct', node: 'Writer' });
      expect(edge.transforms).toEqual([]);
    });

    it('parses edge with pipe transforms', () => {
      const program = parse(`
        edge Analyzer -> Reviewer
          | select(findings)
          | drop(reasoning_trace)
          | compact
      `);
      const edge = program.edges[0];
      expect(edge.transforms).toEqual([
        { type: 'select', fields: ['findings'] },
        { type: 'drop', field: 'reasoning_trace' },
        { type: 'compact' },
      ]);
    });

    it('parses edge with filter transform', () => {
      const program = parse(`
        edge Analyzer -> Reviewer
          | filter(issues, severity >= medium)
      `);
      const edge = program.edges[0];
      expect(edge.transforms).toEqual([
        { type: 'filter', field: 'issues', condition: { field: 'severity', op: '>=', value: 'medium' } },
      ]);
    });

    it('parses edge with truncate', () => {
      const program = parse(`
        edge A -> B
          | truncate(500)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'truncate', tokens: 500 },
      ]);
    });

    it('parses conditional edge routing', () => {
      const program = parse(`
        edge Analyzer -> {
          when risk_score > 0.7 -> DetailedReviewer
          when risk_score > 0.3 -> StandardReviewer
          else -> AutoApprove
        }
      `);
      const edge = program.edges[0];
      expect(edge.target).toEqual({
        kind: 'conditional',
        branches: [
          { condition: { field: 'risk_score', op: '>', value: 0.7 }, target: 'DetailedReviewer' },
          { condition: { field: 'risk_score', op: '>', value: 0.3 }, target: 'StandardReviewer' },
          { condition: undefined, target: 'AutoApprove' },
        ],
      });
    });

    it('parses multi-field select', () => {
      const program = parse(`
        edge A -> B
          | select(vulnerabilities, risk)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['vulnerabilities', 'risk'] },
      ]);
    });

    it('parses single-field select as fields array', () => {
      const program = parse(`
        edge A -> B
          | select(findings)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['findings'] },
      ]);
    });
  });

  describe('graph', () => {
    it('parses a basic graph', () => {
      const program = parse(`
        graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
          Researcher -> Writer -> done
        }
      `);
      expect(program.graphs).toHaveLength(1);
      const graph = program.graphs[0];
      expect(graph.name).toBe('SimpleQA');
      expect(graph.input).toBe('UserRequest');
      expect(graph.output).toBe('Answer');
      expect(graph.budget).toBe(6000);
      expect(graph.flow).toEqual([
        { kind: 'node', name: 'Researcher' },
        { kind: 'node', name: 'Writer' },
      ]);
    });

    it('parses graph with parallel block', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          parallel { A B C } -> D -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow).toEqual([
        { kind: 'parallel', branches: ['A', 'B', 'C'] },
        { kind: 'node', name: 'D' },
      ]);
    });

    it('parses graph with parallel block using optional commas', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          parallel { A, B, C } -> D -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow[0]).toEqual({ kind: 'parallel', branches: ['A', 'B', 'C'] });
    });

    it('parses graph with foreach block', () => {
      const program = parse(`
        graph G(input: X, output: Y, budget: 10k) {
          Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {
            Worker -> Checker
          } -> done
        }
      `);
      const graph = program.graphs[0];
      expect(graph.flow).toHaveLength(2);
      expect(graph.flow[0]).toEqual({ kind: 'node', name: 'Planner' });
      const fe = graph.flow[1];
      expect(fe.kind).toBe('foreach');
      if (fe.kind === 'foreach') {
        expect(fe.source).toBe('Planner');
        expect(fe.field).toBe('steps');
        expect(fe.binding).toBe('step');
        expect(fe.maxIterations).toBe(5);
        expect(fe.body).toEqual([
          { kind: 'node', name: 'Worker' },
          { kind: 'node', name: 'Checker' },
        ]);
      }
    });

    it('reports error on graph flow without done terminator', () => {
      expect(() => parse(`
        graph Bad(input: A, output: B, budget: 1k) {
          X -> Y
        }
      `)).toThrow("Expected '-> done' to terminate graph flow");
    });

    it('reports error on parallel block with fewer than 2 branches', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          parallel { A } -> done
        }
      `)).toThrow('parallel block must contain at least 2 branches');
    });

    it('reports error on done inside foreach body', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 1) {
            D -> done
          } -> done
        }
      `)).toThrow("'done' is not allowed inside a foreach or parallel block");
    });

    it('reports error on foreach max_iterations < 1', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 0) {
            D
          } -> done
        }
      `)).toThrow('max_iterations must be at least 1');
    });

    it('reports error on nested foreach', () => {
      expect(() => parse(`
        graph G(input: X, output: Y, budget: 1k) {
          foreach(A.output.b as c, max_iterations: 1) {
            foreach(D.output.e as f, max_iterations: 1) {
              G
            }
          } -> done
        }
      `)).toThrow('Nested parallel or foreach inside foreach is not supported in v1.1');
    });
  });

  describe('full program', () => {
    it('parses hello.gft', () => {
      const source = `
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
      const program = parse(source);
      expect(program.contexts).toHaveLength(1);
      expect(program.nodes).toHaveLength(2);
      expect(program.edges).toHaveLength(1);
      expect(program.graphs).toHaveLength(1);
    });
  });

  describe('type expressions', () => {
    it('parses Optional type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          notes: Optional<String>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'optional',
        inner: { kind: 'primitive', name: 'String' },
      });
    });

    it('parses Map type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          data: Map<String, Int>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'map',
        key: { kind: 'primitive', name: 'String' },
        value: { kind: 'primitive', name: 'Int' },
      });
    });

    it('parses TokenBounded type', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          summary: TokenBounded<String, 100>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'token_bounded',
        inner: { kind: 'primitive', name: 'String' },
        max: 100,
      });
    });

    it('parses Float with range', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          score: Float(0..1)
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'primitive_range',
        name: 'Float',
        min: 0,
        max: 1,
      });
    });

    it('parses nested generic types', () => {
      const program = parse(`
        context Spec(max_tokens: 500) {
          data: List<Optional<String>>
        }
      `);
      expect(program.contexts[0].fields[0].type).toEqual({
        kind: 'list',
        element: { kind: 'optional', inner: { kind: 'primitive', name: 'String' } },
      });
    });
  });

  describe('keyword-as-identifier (contextual keywords)', () => {
    it('parses field named with a keyword', () => {
      const program = parse(`
        context Foo(max_tokens: 500) {
          input: String
          output: Int
          model: Bool
        }
      `);
      expect(program.contexts[0].fields[0].name).toBe('input');
      expect(program.contexts[0].fields[1].name).toBe('output');
      expect(program.contexts[0].fields[2].name).toBe('model');
    });

    it('parses enum with keyword values', () => {
      const program = parse(`
        context Foo(max_tokens: 500) {
          mode: enum(skip, abort, compact)
        }
      `);
      const enumType = program.contexts[0].fields[0].type;
      expect(enumType).toEqual({ kind: 'enum', values: ['skip', 'abort', 'compact'] });
    });

    it('parses tool names that are keywords', () => {
      const program = parse(`
        node Worker(model: sonnet, budget: 2k/1k) {
          reads: [Data]
          tools: [compact, filter, select]
          produces Output {
            result: String
          }
        }
      `);
      expect(program.nodes[0].tools).toEqual(['compact', 'filter', 'select']);
    });

    it('parses select/drop with keyword field names', () => {
      const program = parse(`
        edge A -> B
          | select(input)
          | drop(output)
      `);
      expect(program.edges[0].transforms).toEqual([
        { type: 'select', fields: ['input'] },
        { type: 'drop', field: 'output' },
      ]);
    });

    it('parses condition with keyword field name', () => {
      const program = parse(`
        edge A -> B
          | filter(items, budget >= 100)
      `);
      expect(program.edges[0].transforms[0]).toEqual({
        type: 'filter',
        field: 'items',
        condition: { field: 'budget', op: '>=', value: 100 },
      });
    });
  });

  describe('error handling', () => {
    it('reports error on missing closing brace', () => {
      expect(() => parse('context Spec(max_tokens: 500) {')).toThrow();
    });

    it('reports error on unexpected token', () => {
      expect(() => parse('node 123')).toThrow();
    });
  });
});
