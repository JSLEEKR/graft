import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { conditionFieldName } from '../src/parser/ast.js';
import type { Expr, FlowNode, GraphDecl, Condition } from '../src/parser/ast.js';

function parse(source: string) {
  const tokens = new Lexer(source).tokenize();
  const { program, errors } = new Parser(tokens).parse();
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'));
  return program;
}

function parseExpr(source: string): Expr {
  // Parse a let statement to extract the expression
  const program = parse(`
    graph G(input: In, output: Out, budget: 1k) {
      let x = ${source} -> done
    }
  `);
  const letNode = program.graphs[0].flow[0];
  if (letNode.kind !== 'let') throw new Error('Expected let node');
  return letNode.value;
}

// ========================================
// Expression Parsing
// ========================================
describe('v4.0-R1: expression parsing', () => {
  it('parses literal number', () => {
    const expr = parseExpr('42');
    expect(expr.kind).toBe('literal');
    if (expr.kind === 'literal') expect(expr.value).toBe(42);
  });

  it('parses literal string', () => {
    const expr = parseExpr('"hello"');
    expect(expr.kind).toBe('literal');
    if (expr.kind === 'literal') expect(expr.value).toBe('hello');
  });

  it('parses literal boolean', () => {
    const exprTrue = parseExpr('true');
    expect(exprTrue.kind).toBe('literal');
    if (exprTrue.kind === 'literal') expect(exprTrue.value).toBe(true);

    const exprFalse = parseExpr('false');
    expect(exprFalse.kind).toBe('literal');
    if (exprFalse.kind === 'literal') expect(exprFalse.value).toBe(false);
  });

  it('parses single-segment field access', () => {
    const expr = parseExpr('myField');
    expect(expr.kind).toBe('field_access');
    if (expr.kind === 'field_access') expect(expr.segments).toEqual(['myField']);
  });

  it('parses multi-segment field access', () => {
    const expr = parseExpr('node.output.field');
    expect(expr.kind).toBe('field_access');
    if (expr.kind === 'field_access') expect(expr.segments).toEqual(['node', 'output', 'field']);
  });

  it('parses binary addition', () => {
    const expr = parseExpr('1 + 2');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('+');
      expect(expr.left).toMatchObject({ kind: 'literal', value: 1 });
      expect(expr.right).toMatchObject({ kind: 'literal', value: 2 });
    }
  });

  it('parses binary subtraction', () => {
    const expr = parseExpr('10 - 3');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('-');
      expect(expr.left).toMatchObject({ kind: 'literal', value: 10 });
      expect(expr.right).toMatchObject({ kind: 'literal', value: 3 });
    }
  });

  it('parses binary division', () => {
    const expr = parseExpr('100 / 4');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('/');
      expect(expr.left).toMatchObject({ kind: 'literal', value: 100 });
      expect(expr.right).toMatchObject({ kind: 'literal', value: 4 });
    }
  });

  it('parses unary minus', () => {
    const expr = parseExpr('-5');
    expect(expr.kind).toBe('unary');
    if (expr.kind === 'unary') {
      expect(expr.op).toBe('-');
      expect(expr.operand).toMatchObject({ kind: 'literal', value: 5 });
    }
  });

  it('parses unary bang', () => {
    const expr = parseExpr('!myFlag');
    expect(expr.kind).toBe('unary');
    if (expr.kind === 'unary') {
      expect(expr.op).toBe('!');
      expect(expr.operand).toMatchObject({ kind: 'field_access', segments: ['myFlag'] });
    }
  });

  it('parses grouped expression', () => {
    const expr = parseExpr('(1 + 2)');
    expect(expr.kind).toBe('group');
    if (expr.kind === 'group') {
      expect(expr.inner.kind).toBe('binary');
    }
  });

  it('parses nested binary (left-associative)', () => {
    const expr = parseExpr('1 + 2 + 3');
    expect(expr.kind).toBe('binary');
    if (expr.kind === 'binary') {
      expect(expr.op).toBe('+');
      expect(expr.left.kind).toBe('binary');
      expect(expr.right).toMatchObject({ kind: 'literal', value: 3 });
    }
  });

  it('parses KIntegerLiteral in expression', () => {
    const expr = parseExpr('5k');
    expect(expr.kind).toBe('literal');
    if (expr.kind === 'literal') expect(expr.value).toBe(5000);
  });
});

// ========================================
// Let Parsing
// ========================================
describe('v4.0-R1: let parsing', () => {
  it('parses let with literal value', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        let threshold = 42 -> done
      }
    `);
    const letNode = program.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
    if (letNode.kind === 'let') {
      expect(letNode.name).toBe('threshold');
      expect(letNode.value).toMatchObject({ kind: 'literal', value: 42 });
    }
  });

  it('parses let with field access value', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        let src = node.output.field -> done
      }
    `);
    const letNode = program.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
    if (letNode.kind === 'let') {
      expect(letNode.name).toBe('src');
      expect(letNode.value).toMatchObject({ kind: 'field_access', segments: ['node', 'output', 'field'] });
    }
  });

  it('parses let with binary expression', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        let total = x + y -> done
      }
    `);
    const letNode = program.graphs[0].flow[0];
    expect(letNode.kind).toBe('let');
    if (letNode.kind === 'let') {
      expect(letNode.value.kind).toBe('binary');
    }
  });
});

// ========================================
// Graph Param Parsing
// ========================================
describe('v4.0-R1: graph param parsing', () => {
  it('parses graph with no params', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        A -> done
      }
    `);
    expect(program.graphs[0].params).toEqual([]);
  });

  it('parses graph with single param', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k, reviewer: Node) {
        A -> done
      }
    `);
    expect(program.graphs[0].params.length).toBe(1);
    expect(program.graphs[0].params[0].name).toBe('reviewer');
    expect(program.graphs[0].params[0].type).toBe('Node');
  });

  it('parses graph with multiple params', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k, reviewer: Node, depth: Int, label: String) {
        A -> done
      }
    `);
    expect(program.graphs[0].params.length).toBe(3);
    expect(program.graphs[0].params[0]).toMatchObject({ name: 'reviewer', type: 'Node' });
    expect(program.graphs[0].params[1]).toMatchObject({ name: 'depth', type: 'Int' });
    expect(program.graphs[0].params[2]).toMatchObject({ name: 'label', type: 'String' });
  });

  it('parses graph param with default value', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k, depth: Int = 3) {
        A -> done
      }
    `);
    expect(program.graphs[0].params.length).toBe(1);
    expect(program.graphs[0].params[0].name).toBe('depth');
    expect(program.graphs[0].params[0].type).toBe('Int');
    expect(program.graphs[0].params[0].default).toBe(3);
  });

  it('parses graph param with Node type', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k, reviewer: Node) {
        A -> done
      }
    `);
    expect(program.graphs[0].params[0].type).toBe('Node');
  });
});

// ========================================
// Graph Call Parsing
// ========================================
describe('v4.0-R1: graph call parsing', () => {
  it('parses graph call with named args', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        SubGraph(reviewer: MyNode) -> done
      }
    `);
    const callNode = program.graphs[0].flow[0];
    expect(callNode.kind).toBe('graph_call');
    if (callNode.kind === 'graph_call') {
      expect(callNode.name).toBe('SubGraph');
      expect(callNode.args.length).toBe(1);
      expect(callNode.args[0].name).toBe('reviewer');
      expect(callNode.args[0].value).toMatchObject({ kind: 'field_access', segments: ['MyNode'] });
    }
  });

  it('parses graph call with multiple args', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        SubGraph(reviewer: MyNode, depth: 5) -> done
      }
    `);
    const callNode = program.graphs[0].flow[0];
    expect(callNode.kind).toBe('graph_call');
    if (callNode.kind === 'graph_call') {
      expect(callNode.args.length).toBe(2);
      expect(callNode.args[0].name).toBe('reviewer');
      expect(callNode.args[1].name).toBe('depth');
      expect(callNode.args[1].value).toMatchObject({ kind: 'literal', value: 5 });
    }
  });

  it('parses graph call with zero args', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        SubGraph() -> done
      }
    `);
    const callNode = program.graphs[0].flow[0];
    expect(callNode.kind).toBe('graph_call');
    if (callNode.kind === 'graph_call') {
      expect(callNode.name).toBe('SubGraph');
      expect(callNode.args).toEqual([]);
    }
  });
});

// ========================================
// Condition Migration
// ========================================
describe('v4.0-R1: condition migration', () => {
  it('parsed condition has expr-based left side', () => {
    const program = parse(`
      edge A -> {
        when score >= 5 -> B
        else -> C
      }
    `);
    const target = program.edges[0].target;
    if (target.kind === 'conditional') {
      const cond = target.branches[0].condition!;
      expect(cond.left.kind).toBe('field_access');
      if (cond.left.kind === 'field_access') {
        expect(cond.left.segments).toEqual(['score']);
      }
      expect(cond.op).toBe('>=');
      expect(cond.value).toBe(5);
    }
  });

  it('conditionFieldName extracts field name', () => {
    const cond: Condition = {
      left: { kind: 'field_access', segments: ['node', 'output', 'score'], location: { line: 0, column: 0, offset: 0 } },
      op: '>=',
      value: 5,
    };
    expect(conditionFieldName(cond)).toBe('node.output.score');
  });
});

// ========================================
// Error Paths
// ========================================
describe('v4.0-R1: error paths', () => {
  it('rejects unterminated grouped expression', () => {
    expect(() => parse(`
      graph G(input: In, output: Out, budget: 1k) {
        let x = (1 + 2 -> done
      }
    `)).toThrow();
  });

  it('rejects unsupported param type', () => {
    expect(() => parse(`
      graph G(input: In, output: Out, budget: 1k, x: Float) {
        A -> done
      }
    `)).toThrow();
  });

  it('rejects let without equals', () => {
    expect(() => parse(`
      graph G(input: In, output: Out, budget: 1k) {
        let x 42 -> done
      }
    `)).toThrow();
  });
});

// ========================================
// Foreach Extensions
// ========================================
describe('v4.0-R1: foreach extensions', () => {
  it('allows let in foreach body', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        foreach(Planner.output.steps as step, max_iterations: 5) {
          let count = 1 -> Worker
        } -> done
      }
    `);
    const foreach = program.graphs[0].flow[0];
    expect(foreach.kind).toBe('foreach');
    if (foreach.kind === 'foreach') {
      expect(foreach.body[0].kind).toBe('let');
    }
  });

  it('allows graph_call in foreach body', () => {
    const program = parse(`
      graph G(input: In, output: Out, budget: 1k) {
        foreach(Planner.output.steps as step, max_iterations: 5) {
          SubGraph(depth: 3) -> Worker
        } -> done
      }
    `);
    const foreach = program.graphs[0].flow[0];
    expect(foreach.kind).toBe('foreach');
    if (foreach.kind === 'foreach') {
      expect(foreach.body[0].kind).toBe('graph_call');
    }
  });
});
