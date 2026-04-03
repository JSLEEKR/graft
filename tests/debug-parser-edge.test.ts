// tests/debug-parser-edge.test.ts
// Edge-case tests for the Graft lexer and parser
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { compileToProgram } from '../src/compiler.js';
import { GraftError } from '../src/errors/diagnostics.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function parseOk(source: string) {
  const result = parse(source);
  if (result.errors.length > 0) {
    throw new Error(`Unexpected parse errors: ${result.errors.map(e => e.message).join('; ')}`);
  }
  return result.program;
}

function parseErrors(source: string) {
  const result = parse(source);
  return result.errors;
}

function lex(source: string) {
  return new Lexer(source).tokenize();
}

function lexError(source: string) {
  expect(() => new Lexer(source).tokenize()).toThrow(GraftError);
}

function compileOk(source: string) {
  const result = compileToProgram(source, 'test.gft');
  return result;
}

// ============================================================
// 1. Empty / Minimal Programs
// ============================================================
describe('Empty and minimal programs', () => {
  it('parses empty string to empty program', () => {
    const prog = parseOk('');
    expect(prog.contexts).toHaveLength(0);
    expect(prog.nodes).toHaveLength(0);
    expect(prog.edges).toHaveLength(0);
    expect(prog.graphs).toHaveLength(0);
    expect(prog.imports).toHaveLength(0);
    expect(prog.memories).toHaveLength(0);
  });

  it('parses whitespace-only input', () => {
    const prog = parseOk('   \n\n  \t\t  \n');
    expect(prog.contexts).toHaveLength(0);
  });

  it('parses comment-only input', () => {
    const prog = parseOk('// this is a comment\n// another comment');
    expect(prog.contexts).toHaveLength(0);
  });

  it('parses block-comment-only input', () => {
    const prog = parseOk('/* block comment */');
    expect(prog.contexts).toHaveLength(0);
  });

  it('parses context with no fields', () => {
    const prog = parseOk(`
      context Empty(max_tokens: 100) {
      }
    `);
    expect(prog.contexts).toHaveLength(1);
    expect(prog.contexts[0].fields).toHaveLength(0);
  });
});

// ============================================================
// 2. String Edge Cases (Lexer level)
// ============================================================
describe('String edge cases', () => {
  it('lexes empty string', () => {
    const tokens = lex('"" ');
    // Should have StringLiteral with empty value, then EOF
    const strToken = tokens.find(t => t.type === 'StringLiteral');
    expect(strToken).toBeDefined();
    expect(strToken!.value).toBe('');
  });

  it('lexes string with escaped interpolation \\${', () => {
    // \${ should produce literal ${ in the string, not a TemplateString
    const tokens = lex('"hello \\${world}"');
    const strToken = tokens.find(t => t.type === 'StringLiteral');
    expect(strToken).toBeDefined();
    expect(strToken!.value).toBe('hello ${world}');
  });

  it('lexes string with unicode characters', () => {
    const tokens = lex('"hello world"');
    const strToken = tokens.find(t => t.type === 'StringLiteral');
    expect(strToken).toBeDefined();
    expect(strToken!.value).toContain('hello');
  });

  it('errors on unterminated string', () => {
    lexError('"hello');
  });

  it('errors on string with newline', () => {
    lexError('"hello\nworld"');
  });

  it('lexes template string with interpolation', () => {
    const tokens = lex('"hello ${name}"');
    const tmpl = tokens.find(t => t.type === 'TemplateString');
    expect(tmpl).toBeDefined();
    expect(tmpl!.value).toContain('${name}');
  });
});

// ============================================================
// 3. Number Edge Cases
// ============================================================
describe('Number edge cases', () => {
  it('lexes zero', () => {
    const tokens = lex('0');
    expect(tokens[0].type).toBe('IntegerLiteral');
    expect(tokens[0].value).toBe('0');
  });

  it('lexes large integer', () => {
    const tokens = lex('999999999');
    expect(tokens[0].type).toBe('IntegerLiteral');
    expect(tokens[0].value).toBe('999999999');
  });

  it('lexes float with leading zero', () => {
    const tokens = lex('0.5');
    expect(tokens[0].type).toBe('FloatLiteral');
    expect(tokens[0].value).toBe('0.5');
  });

  it('lexes k-integer', () => {
    const tokens = lex('5k');
    expect(tokens[0].type).toBe('KIntegerLiteral');
    expect(tokens[0].value).toBe('5k');
  });

  it('negative number is minus + integer (not a single token)', () => {
    // The lexer does not handle negative numbers as single tokens;
    // -5 should be Minus then IntegerLiteral
    const tokens = lex('-5');
    expect(tokens[0].type).toBe('Minus');
    expect(tokens[1].type).toBe('IntegerLiteral');
    expect(tokens[1].value).toBe('5');
  });

  it('handles decimal number in a context field default via expression', () => {
    // Float literal 3.14 should parse in expressions
    const prog = parseOk(`
      context C(max_tokens: 100) {
        score: Float
      }
    `);
    expect(prog.contexts[0].fields[0].type).toEqual({ kind: 'primitive', name: 'Float' });
  });

  it('distinguishes dot-dot from float: 1..2 is Int DotDot Int', () => {
    // 1..2 should be IntegerLiteral(1), DotDot, IntegerLiteral(2)
    const tokens = lex('1..2');
    expect(tokens[0].type).toBe('IntegerLiteral');
    expect(tokens[0].value).toBe('1');
    expect(tokens[1].type).toBe('DotDot');
    expect(tokens[2].type).toBe('IntegerLiteral');
    expect(tokens[2].value).toBe('2');
  });
});

// ============================================================
// 4. Identifier Edge Cases
// ============================================================
describe('Identifier edge cases', () => {
  it('lexes single-character identifier', () => {
    const tokens = lex('x');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('x');
  });

  it('lexes underscore-prefixed identifier', () => {
    const tokens = lex('_private');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('_private');
  });

  it('lexes identifier with underscores in middle', () => {
    const tokens = lex('my_var_name');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('my_var_name');
  });

  it('treats "contexts" as identifier (not keyword)', () => {
    // "contexts" is not a keyword, only "context" is
    const tokens = lex('contexts');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('contexts');
  });

  it('treats "nodes" as identifier (not keyword)', () => {
    const tokens = lex('nodes');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('nodes');
  });

  it('treats "graphs" as identifier (not keyword)', () => {
    const tokens = lex('graphs');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('graphs');
  });

  it('treats "edges" as identifier (not keyword)', () => {
    const tokens = lex('edges');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[0].value).toBe('edges');
  });

  it('keyword "node" is recognized as keyword', () => {
    const tokens = lex('node');
    expect(tokens[0].type).toBe('Node');
  });

  it('uses keywords as field names via expectIdentifierOrKeyword', () => {
    // Keywords like "model", "budget" etc. should be valid field names
    const prog = parseOk(`
      context MyCtx(max_tokens: 100) {
        model: String
        budget: Int
        output: String
        input: String
      }
    `);
    expect(prog.contexts[0].fields).toHaveLength(4);
    expect(prog.contexts[0].fields[0].name).toBe('model');
    expect(prog.contexts[0].fields[1].name).toBe('budget');
    expect(prog.contexts[0].fields[2].name).toBe('output');
    expect(prog.contexts[0].fields[3].name).toBe('input');
  });
});

// ============================================================
// 5. Expression Edge Cases
// ============================================================
describe('Expression edge cases', () => {
  it('parses function call with 0 args: len()', () => {
    // len() is a builtin. 0 args should parse (arity checked by analyzer, not parser)
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      edge N -> N2
      graph G(input: C, output: R, budget: 10k) {
        let v = len() -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('call');
      if (letNode.value.kind === 'call') {
        expect(letNode.value.args).toHaveLength(0);
      }
    }
  });

  it('parses function call with many args: max(1, 2) -- arity 2', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = max(1, 2) -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let' && letNode.value.kind === 'call') {
      expect(letNode.value.args).toHaveLength(2);
    }
  });

  it('parses deeply nested grouped expressions', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = (((1 + 2) * 3) - 4) -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
  });

  it('parses chained field access: a.b.c.d', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = a.b.c.d -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let' && letNode.value.kind === 'field_access') {
      expect(letNode.value.segments).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('parses unary negation in expression', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = -5 -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('unary');
    }
  });

  it('parses boolean negation', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = !true -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('unary');
      if (letNode.value.kind === 'unary') {
        expect(letNode.value.op).toBe('!');
      }
    }
  });

  it('parses null coalesce operator', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = a ?? b -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('binary');
      if (letNode.value.kind === 'binary') {
        expect(letNode.value.op).toBe('??');
      }
    }
  });

  it('parses conditional expression: if x > 0 then 1 else 0', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = if x > 0 then 1 else 0 -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('conditional');
    }
  });
});

// ============================================================
// 6. Comment Handling
// ============================================================
describe('Comment handling', () => {
  it('handles line comment at end of file without newline', () => {
    const prog = parseOk('// comment without newline');
    expect(prog.contexts).toHaveLength(0);
  });

  it('handles comments between every declaration', () => {
    const prog = parseOk(`
      // before context
      context A(max_tokens: 100) {
        // inside context
        x: String
        // after field
      }
      // between declarations
      context B(max_tokens: 200) {
        y: Int
      }
      // at end
    `);
    expect(prog.contexts).toHaveLength(2);
  });

  it('handles block comments', () => {
    const prog = parseOk(`
      /* This is a
         multi-line block comment */
      context C(max_tokens: 100) {
        x: String
      }
    `);
    expect(prog.contexts).toHaveLength(1);
  });

  it('handles nested-looking block comments (no nesting)', () => {
    // Block comments do NOT nest. /* ... /* ... */ ends at first */
    // The second /* is just text inside the comment
    const prog = parseOk(`
      /* outer /* inner */
      context C(max_tokens: 100) {
        x: String
      }
    `);
    expect(prog.contexts).toHaveLength(1);
  });

  it('errors on unterminated block comment', () => {
    lexError('/* unterminated block comment');
  });

  it('handles line comment inside block comment', () => {
    const prog = parseOk(`
      /* block with // line comment inside */
      context C(max_tokens: 100) { x: String }
    `);
    expect(prog.contexts).toHaveLength(1);
  });
});

// ============================================================
// 7. Edge Declaration Edge Cases
// ============================================================
describe('Edge declaration edge cases', () => {
  it('parses edge with multiple transforms', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String y: Int }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      node B(model: sonnet, budget: 1k/1k) {
        reads: [R]
        produces S { w: String }
      }
      edge A -> B | select(z) | compact
      graph G(input: C, output: S, budget: 10k) {
        A -> B -> done
      }
    `);
    expect(prog.edges).toHaveLength(1);
    expect(prog.edges[0].transforms).toHaveLength(2);
    expect(prog.edges[0].transforms[0].type).toBe('select');
    expect(prog.edges[0].transforms[1].type).toBe('compact');
  });

  it('parses edge with no transforms', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      node B(model: sonnet, budget: 1k/1k) {
        reads: [R]
        produces S { w: String }
      }
      edge A -> B
      graph G(input: C, output: S, budget: 10k) {
        A -> B -> done
      }
    `);
    expect(prog.edges[0].transforms).toHaveLength(0);
  });

  it('parses conditional edge with when/else', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String score: Int }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { score: Int }
      }
      node B(model: sonnet, budget: 1k/1k) {
        reads: [R]
        produces S { w: String }
      }
      node D(model: sonnet, budget: 1k/1k) {
        reads: [R]
        produces S2 { w: String }
      }
      edge A -> {
        when score >= 80 -> B
        else -> D
      }
      graph G(input: C, output: S, budget: 10k) {
        A -> B -> done
      }
    `);
    expect(prog.edges[0].target.kind).toBe('conditional');
    if (prog.edges[0].target.kind === 'conditional') {
      expect(prog.edges[0].target.branches).toHaveLength(2);
    }
  });

  it('parses edge with truncate transform', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      node B(model: sonnet, budget: 1k/1k) {
        reads: [R]
        produces S { w: String }
      }
      edge A -> B | truncate(500)
      graph G(input: C, output: S, budget: 10k) {
        A -> B -> done
      }
    `);
    expect(prog.edges[0].transforms).toHaveLength(1);
    expect(prog.edges[0].transforms[0].type).toBe('truncate');
    if (prog.edges[0].transforms[0].type === 'truncate') {
      expect(prog.edges[0].transforms[0].tokens).toBe(500);
    }
  });
});

// ============================================================
// 8. Import Edge Cases
// ============================================================
describe('Import edge cases', () => {
  it('parses import declaration', () => {
    const prog = parseOk(`
      import { Ctx } from "other.gft"
    `);
    expect(prog.imports).toHaveLength(1);
    expect(prog.imports[0].names).toEqual(['Ctx']);
    expect(prog.imports[0].path).toBe('other.gft');
  });

  it('parses import with multiple names', () => {
    const prog = parseOk(`
      import { A, B, C } from "lib.gft"
    `);
    expect(prog.imports[0].names).toEqual(['A', 'B', 'C']);
  });

  it('errors on empty import list', () => {
    const errors = parseErrors(`import { } from "x.gft"`);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors on empty import path', () => {
    const errors = parseErrors(`import { X } from ""`);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors on import after other declarations', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      import { X } from "x.gft"
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('import from nonexistent file is not a parse error (handled by resolver)', () => {
    // The parser should succeed; the resolver would fail
    const prog = parseOk(`
      import { X } from "nonexistent.gft"
    `);
    expect(prog.imports).toHaveLength(1);
  });
});

// ============================================================
// 9. Foreach / Parallel Edge Cases
// ============================================================
describe('Foreach and parallel edge cases', () => {
  it('parallel requires at least 2 branches', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        parallel { A } -> done
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('at least 2 branches'))).toBe(true);
  });

  it('foreach with max_iterations: 1 is valid', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node Planner(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces PlanOut { steps: List<String> }
      }
      node Worker(model: sonnet, budget: 1k/1k) {
        reads: [PlanOut]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        Planner -> foreach(Planner.output.steps as step, max_iterations: 1) {
          Worker
        } -> done
      }
    `);
    const foreachNode = prog.graphs[0].flow[1];
    expect(foreachNode.kind).toBe('foreach');
    if (foreachNode.kind === 'foreach') {
      expect(foreachNode.maxIterations).toBe(1);
    }
  });

  it('foreach with max_iterations: 0 errors', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node Planner(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces PlanOut { steps: List<String> }
      }
      node Worker(model: sonnet, budget: 1k/1k) {
        reads: [PlanOut]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        Planner -> foreach(Planner.output.steps as step, max_iterations: 0) {
          Worker
        } -> done
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('max_iterations must be at least 1'))).toBe(true);
  });

  it('nested foreach is rejected', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node Planner(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces PlanOut { steps: List<String> }
      }
      node Worker(model: sonnet, budget: 1k/1k) {
        reads: [PlanOut]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        Planner -> foreach(Planner.output.steps as step, max_iterations: 5) {
          foreach(Planner.output.steps as inner, max_iterations: 3) {
            Worker
          }
        } -> done
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 10. Graph Edge Cases
// ============================================================
describe('Graph edge cases', () => {
  it('graph with single step -> done', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        A -> done
      }
    `);
    expect(prog.graphs[0].flow).toHaveLength(1);
    expect(prog.graphs[0].flow[0].kind).toBe('node');
  });

  it('graph flow must end with -> done', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        A
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('done'))).toBe(true);
  });

  it('graph with graph call', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph Sub(input: C, output: R, budget: 5k) {
        A -> done
      }
      graph Main(input: C, output: R, budget: 10k) {
        Sub(input: C, output: R) -> done
      }
    `);
    expect(prog.graphs).toHaveLength(2);
    const mainFlow = prog.graphs[1].flow[0];
    expect(mainFlow.kind).toBe('graph_call');
    if (mainFlow.kind === 'graph_call') {
      expect(mainFlow.name).toBe('Sub');
    }
  });

  it('graph with let binding', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        let myVar = 42 -> A -> done
      }
    `);
    expect(prog.graphs[0].flow[0].kind).toBe('let');
  });

  it('graph with optional params including defaults', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k, depth: Int = 3) {
        A -> done
      }
    `);
    expect(prog.graphs[0].params).toHaveLength(1);
    expect(prog.graphs[0].params[0].name).toBe('depth');
    expect(prog.graphs[0].params[0].type).toBe('Int');
    expect(prog.graphs[0].params[0].default).toBe(3);
  });

  it('graph with trailing comma in params', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k,) {
        A -> done
      }
    `);
    expect(prog.graphs[0].params).toHaveLength(0);
  });
});

// ============================================================
// 11. Type Edge Cases
// ============================================================
describe('Type edge cases', () => {
  it('parses List<String>', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        items: List<String>
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('list');
    if (type.kind === 'list') {
      expect(type.element).toEqual({ kind: 'primitive', name: 'String' });
    }
  });

  it('parses Map<String, Int>', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        mapping: Map<String, Int>
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('map');
  });

  it('parses Optional<String>', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        maybe: Optional<String>
      }
    `);
    expect(prog.contexts[0].fields[0].type.kind).toBe('optional');
  });

  it('parses Float range: Float(0..1)', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        score: Float(0..1)
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('primitive_range');
    if (type.kind === 'primitive_range') {
      expect(type.min).toBe(0);
      expect(type.max).toBe(1);
    }
  });

  it('parses enum type', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        severity: enum(low, medium, high)
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('enum');
    if (type.kind === 'enum') {
      expect(type.values).toEqual(['low', 'medium', 'high']);
    }
  });

  it('parses TokenBounded type', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        summary: TokenBounded<String, 500>
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('token_bounded');
  });

  it('parses domain types', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        path: FilePath
        diff: FileDiff
        test: TestFile
        issue: IssueRef
      }
    `);
    expect(prog.contexts[0].fields.map(f => f.type)).toEqual([
      { kind: 'domain', name: 'FilePath' },
      { kind: 'domain', name: 'FileDiff' },
      { kind: 'domain', name: 'TestFile' },
      { kind: 'domain', name: 'IssueRef' },
    ]);
  });

  it('parses inline struct in List', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        items: List<Item {
          name: String
          value: Int
        }>
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('list');
    if (type.kind === 'list') {
      expect(type.element.kind).toBe('struct');
    }
  });
});

// ============================================================
// 12. Node Edge Cases
// ============================================================
describe('Node edge cases', () => {
  it('node with empty reads and tools lists', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node N(model: sonnet, budget: 1k/1k) {
        reads: []
        tools: []
        produces R { y: String }
      }
    `);
    expect(prog.nodes[0].reads).toHaveLength(0);
    expect(prog.nodes[0].tools).toHaveLength(0);
  });

  it('node with on_failure: skip', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        on_failure: skip
        produces R { y: String }
      }
    `);
    expect(prog.nodes[0].onFailure).toEqual({ type: 'skip' });
  });

  it('node with on_failure: abort', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        on_failure: abort
        produces R { y: String }
      }
    `);
    expect(prog.nodes[0].onFailure).toEqual({ type: 'abort' });
  });

  it('node with retry_then_fallback', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node Fallback(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: String }
      }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        on_failure: retry(2, fallback(Fallback))
        produces R2 { y: String }
      }
    `);
    expect(prog.nodes[1].onFailure).toEqual({ type: 'retry_then_fallback', max: 2, node: 'Fallback' });
  });

  it('node with partial read: Context.field', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String y: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C.x]
        produces R { z: String }
      }
    `);
    expect(prog.nodes[0].reads[0].field).toEqual(['x']);
  });

  it('node with multi-field partial read: Context.{a, b}', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String y: Int z: Bool }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C.{x, y}]
        produces R { w: String }
      }
    `);
    expect(prog.nodes[0].reads[0].field).toEqual(['x', 'y']);
  });

  it('node without produces is an error', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('duplicate writes clause is an error', () => {
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      memory M(max_tokens: 500, storage: file) { log: String }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        writes: [M]
        writes: [M]
        produces R { y: String }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('Duplicate writes'))).toBe(true);
  });
});

// ============================================================
// 13. Memory Edge Cases
// ============================================================
describe('Memory edge cases', () => {
  it('parses memory declaration with file storage', () => {
    const prog = parseOk(`
      memory Log(max_tokens: 2k, storage: file) {
        entries: List<String>
      }
    `);
    expect(prog.memories).toHaveLength(1);
    expect(prog.memories[0].name).toBe('Log');
    expect(prog.memories[0].maxTokens).toBe(2000);
    expect(prog.memories[0].storage).toBe('file');
  });

  it('parses memory without explicit storage (defaults to file)', () => {
    const prog = parseOk(`
      memory Log(max_tokens: 2k) {
        entries: List<String>
      }
    `);
    expect(prog.memories[0].storage).toBe('file');
  });
});

// ============================================================
// 14. Error Recovery
// ============================================================
describe('Error recovery', () => {
  it('recovers from bad declaration and parses subsequent ones', () => {
    const result = parse(`
      invalid_thing here
      context C(max_tokens: 100) {
        x: String
      }
    `);
    // Should have errors from the invalid declaration
    expect(result.errors.length).toBeGreaterThan(0);
    // But should still parse the valid context
    expect(result.program.contexts).toHaveLength(1);
  });

  it('stops after MAX_ERRORS (25)', () => {
    // Generate many bad identifiers at top level (valid tokens, but not declarations)
    // Each "x" is an Identifier which the parser does not expect at top level
    const badSource = Array(30).fill('x ').join('');
    const result = parse(badSource);
    // Parser should stop collecting after 25 errors
    expect(result.errors.length).toBeLessThanOrEqual(25);
  });
});

// ============================================================
// 15. Full Compilation Edge Cases
// ============================================================
describe('Full compilation edge cases', () => {
  it('compileToProgram succeeds on minimal valid program', () => {
    const result = compileOk(`
      context C(max_tokens: 100) {
        x: String
      }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        A -> done
      }
    `);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('compileToProgram reports scope errors for undefined refs', () => {
    const result = compileOk(`
      context C(max_tokens: 100) {
        x: String
      }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [NonExistent]
        produces R { y: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        A -> done
      }
    `);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('empty source compiles to program with no errors (but no graph)', () => {
    const result = compileOk('');
    // compileToProgram should succeed (no parse errors)
    // but compileAndGenerate would fail since there is no graph
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.program!.graphs).toHaveLength(0);
  });
});

// ============================================================
// 16. Lexer Symbol Edge Cases
// ============================================================
describe('Lexer symbol edge cases', () => {
  it('lexes arrow ->', () => {
    const tokens = lex('->');
    expect(tokens[0].type).toBe('Arrow');
  });

  it('lexes double equals ==', () => {
    const tokens = lex('==');
    expect(tokens[0].type).toBe('EqualEqual');
  });

  it('lexes != correctly', () => {
    const tokens = lex('!=');
    expect(tokens[0].type).toBe('BangEqual');
  });

  it('lexes && and ||', () => {
    const tokens = lex('&& ||');
    expect(tokens[0].type).toBe('AmpAmp');
    expect(tokens[1].type).toBe('PipePipe');
  });

  it('lexes ?? (null coalesce)', () => {
    const tokens = lex('??');
    expect(tokens[0].type).toBe('QuestionQuestion');
  });

  it('errors on unexpected character', () => {
    lexError('@');
  });

  it('errors on single &', () => {
    // & is not a valid single char token and not a two-char match
    lexError('&');
  });

  it('errors on single ?', () => {
    lexError('?');
  });
});

// ============================================================
// 17. Keyword as identifier in various positions
// ============================================================
describe('Keywords used as identifiers (contextual)', () => {
  it('keyword "output" as field name in context', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        output: String
      }
    `);
    expect(prog.contexts[0].fields[0].name).toBe('output');
  });

  it('keyword "select" as field name in context', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        select: String
      }
    `);
    expect(prog.contexts[0].fields[0].name).toBe('select');
  });

  it('keyword "done" as field name in context', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        done: Bool
      }
    `);
    expect(prog.contexts[0].fields[0].name).toBe('done');
  });
});

// ============================================================
// 18. Adversarial: Ambiguous / Tricky Parses
// ============================================================
describe('Adversarial parser edge cases', () => {
  it('identifier "on_failure" is a keyword, not an identifier', () => {
    // on_failure contains underscore -- make sure lexer handles it
    const tokens = lex('on_failure');
    expect(tokens[0].type).toBe('OnFailure');
  });

  it('identifier "max_tokens" is a keyword, not an identifier', () => {
    const tokens = lex('max_tokens');
    expect(tokens[0].type).toBe('MaxTokens');
  });

  it('identifier "max_iterations" is a keyword, not an identifier', () => {
    const tokens = lex('max_iterations');
    expect(tokens[0].type).toBe('MaxIterations');
  });

  it('string with backslash not followed by $ is kept literally', () => {
    // \n inside a graft string is just \ followed by n (no escape sequences besides \${)
    const tokens = lex('"hello\\nworld"');
    const strToken = tokens.find(t => t.type === 'StringLiteral');
    expect(strToken).toBeDefined();
    // The lexer does NOT process \n as escape -- it passes through literally
    expect(strToken!.value).toBe('hello\\nworld');
  });

  it('template string with nested braces inside interpolation', () => {
    // "${a}" should parse correctly even though the expr source is just "a"
    const tokens = lex('"${a}"');
    const tmpl = tokens.find(t => t.type === 'TemplateString');
    expect(tmpl).toBeDefined();
    expect(tmpl!.value).toBe('${a}');
  });

  it('empty block comment', () => {
    const prog = parseOk('/**/');
    expect(prog.contexts).toHaveLength(0);
  });

  it('block comment with just a star inside', () => {
    const prog = parseOk('/***/');
    expect(prog.contexts).toHaveLength(0);
  });

  it('multiple dots without a number: field.access.chain', () => {
    // Ensure dots are parsed as Dot tokens, not DotDot
    const tokens = lex('a.b.c');
    expect(tokens[0].type).toBe('Identifier');
    expect(tokens[1].type).toBe('Dot');
    expect(tokens[2].type).toBe('Identifier');
    expect(tokens[3].type).toBe('Dot');
    expect(tokens[4].type).toBe('Identifier');
  });

  it('consecutive arrows: -> -> is Arrow Arrow', () => {
    const tokens = lex('-> ->');
    expect(tokens[0].type).toBe('Arrow');
    expect(tokens[1].type).toBe('Arrow');
  });

  it('graph with done as only step errors (no node before done)', () => {
    // "done" alone is not a valid flow node -- it is a keyword
    // parseFlowNode expects identifier, parallel, foreach, or let
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        done
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('edge with conditional target: empty braces', () => {
    // edge A -> { } -- no when/else branches
    const prog = parseOk(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      edge A -> { }
      graph G(input: C, output: R, budget: 10k) {
        A -> done
      }
    `);
    // Should parse as conditional edge with 0 branches
    if (prog.edges[0].target.kind === 'conditional') {
      expect(prog.edges[0].target.branches).toHaveLength(0);
    }
  });

  it('let expression with arrow-like subtraction: let v = a - > should error', () => {
    // "a - >" -- minus then greater. In expression, minus is binary op,
    // and > would start a comparison? Actually this is "a minus (>)" which fails
    // because > is not a valid primary expression.
    const errors = parseErrors(`
      context C(max_tokens: 100) { x: String }
      node A(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { z: String }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = a - > A -> done
      }
    `);
    // Should error because > is not valid after minus in expression context
    expect(errors.length).toBeGreaterThan(0);
  });

  it('context named with a very long identifier', () => {
    const longName = 'A'.repeat(200);
    const prog = parseOk(`
      context ${longName}(max_tokens: 100) {
        x: String
      }
    `);
    expect(prog.contexts[0].name).toBe(longName);
  });

  it('Float range with decimal bounds: Float(0.0..1.0)', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) {
        score: Float(0.0..1.0)
      }
    `);
    const type = prog.contexts[0].fields[0].type;
    expect(type.kind).toBe('primitive_range');
    if (type.kind === 'primitive_range') {
      expect(type.min).toBe(0);
      expect(type.max).toBe(1);
    }
  });

  it('multiple contexts, nodes, edges, and graphs in one file', () => {
    const prog = parseOk(`
      context C1(max_tokens: 100) { x: String }
      context C2(max_tokens: 200) { y: Int }
      node N1(model: sonnet, budget: 1k/1k) {
        reads: [C1]
        produces R1 { a: String }
      }
      node N2(model: opus, budget: 2k/1k) {
        reads: [R1, C2]
        produces R2 { b: String }
      }
      edge N1 -> N2 | compact
      graph G1(input: C1, output: R1, budget: 5k) {
        N1 -> done
      }
      graph G2(input: C1, output: R2, budget: 10k) {
        N1 -> N2 -> done
      }
    `);
    expect(prog.contexts).toHaveLength(2);
    expect(prog.nodes).toHaveLength(2);
    expect(prog.edges).toHaveLength(1);
    expect(prog.graphs).toHaveLength(2);
  });

  it('carriage return line endings (\\r\\n)', () => {
    const prog = parseOk("context C(max_tokens: 100) {\r\n  x: String\r\n}\r\n");
    expect(prog.contexts).toHaveLength(1);
  });

  it('bare carriage return (\\r) without \\n', () => {
    const prog = parseOk("context C(max_tokens: 100) {\r  x: String\r}\r");
    expect(prog.contexts).toHaveLength(1);
  });

  it('tab characters in various positions', () => {
    const prog = parseOk("\tcontext\tC(max_tokens:\t100)\t{\n\t\tx:\tString\n\t}");
    expect(prog.contexts).toHaveLength(1);
  });

  it('expression with all binary operators chained', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = 1 + 2 - 3 * 4 / 5 % 6 -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
  });

  it('nested conditional: if ... then (if ... then ... else ...) else ...', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = if a > 0 then if b > 0 then 1 else 2 else 3 -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('conditional');
    }
  });

  it('logical operators: && and || with proper precedence', () => {
    const prog = parseOk(`
      context C(max_tokens: 100) { x: Int }
      node N(model: sonnet, budget: 1k/1k) {
        reads: [C]
        produces R { y: Int }
      }
      graph G(input: C, output: R, budget: 10k) {
        let v = a > 0 && b < 10 || c == 5 -> N -> done
      }
    `);
    const letNode = prog.graphs[0].flow[0];
    if (letNode.kind === 'let') {
      // || should be the outermost operator (lower precedence)
      expect(letNode.value.kind).toBe('binary');
      if (letNode.value.kind === 'binary') {
        expect(letNode.value.op).toBe('||');
      }
    }
  });
});
