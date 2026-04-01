import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().program;
}

function parseErrors(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse().errors;
}

describe('Parser v2 — import declarations', () => {
  it('parses a single import name', () => {
    const program = parse('import { SharedCtx } from "lib/shared.gft"');
    expect(program.imports).toHaveLength(1);
    expect(program.imports[0].names).toEqual(['SharedCtx']);
    expect(program.imports[0].path).toBe('lib/shared.gft');
  });

  it('parses multiple import names', () => {
    const program = parse('import { Foo, Bar, Baz } from "utils.gft"');
    expect(program.imports).toHaveLength(1);
    expect(program.imports[0].names).toEqual(['Foo', 'Bar', 'Baz']);
  });

  it('parses multiple import declarations', () => {
    const program = parse(`
      import { A } from "a.gft"
      import { B, C } from "b.gft"
    `);
    expect(program.imports).toHaveLength(2);
    expect(program.imports[0].names).toEqual(['A']);
    expect(program.imports[1].names).toEqual(['B', 'C']);
  });

  it('rejects empty import list', () => {
    const errors = parseErrors('import { } from "x.gft"');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('Import must specify at least one name');
  });

  it('rejects empty import path', () => {
    const errors = parseErrors('import { X } from ""');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('Import path cannot be empty');
  });

  it('rejects import after context', () => {
    const errors = parseErrors(`
      context A(max_tokens: 1k) { x: String }
      import { B } from "b.gft"
    `);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('Import declarations must appear before all other declarations');
  });

  it('rejects import after memory', () => {
    const errors = parseErrors(`
      memory M(max_tokens: 1k) { x: String }
      import { B } from "b.gft"
    `);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('Import declarations must appear before all other declarations');
  });
});

describe('Parser v2 — memory declarations', () => {
  it('parses memory with storage clause', () => {
    const program = parse(`
      memory ConvHistory(max_tokens: 10k, storage: file) {
        turns: String
        summary: String
      }
    `);
    expect(program.memories).toHaveLength(1);
    const mem = program.memories[0];
    expect(mem.name).toBe('ConvHistory');
    expect(mem.maxTokens).toBe(10000);
    expect(mem.storage).toBe('file');
    expect(mem.fields).toHaveLength(2);
    expect(mem.fields[0].name).toBe('turns');
    expect(mem.fields[1].name).toBe('summary');
  });

  it('parses memory without storage clause (defaults to file)', () => {
    const program = parse(`
      memory Notes(max_tokens: 500) {
        content: String
      }
    `);
    expect(program.memories).toHaveLength(1);
    expect(program.memories[0].storage).toBe('file');
    expect(program.memories[0].maxTokens).toBe(500);
  });

  it('parses memory with integer max_tokens', () => {
    const program = parse(`
      memory Log(max_tokens: 2000) {
        entries: List<String>
      }
    `);
    expect(program.memories[0].maxTokens).toBe(2000);
  });

  it('rejects unknown storage type', () => {
    const errors = parseErrors(`
      memory M(max_tokens: 1k, storage: redis) {
        x: String
      }
    `);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain("Unknown storage type 'redis', expected 'file'");
  });

  it('parses multiple memory declarations', () => {
    const program = parse(`
      memory A(max_tokens: 1k) { x: String }
      memory B(max_tokens: 2k) { y: Int }
    `);
    expect(program.memories).toHaveLength(2);
    expect(program.memories[0].name).toBe('A');
    expect(program.memories[1].name).toBe('B');
  });
});

describe('Parser v2 — writes clause in node', () => {
  const nodeWithWrites = `
    node Writer(model: sonnet, budget: 5k/2k) {
      reads: [Input]
      writes: [ConvHistory]
      produces Result {
        text: String
      }
    }
  `;

  it('parses a node with single write target', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      ${nodeWithWrites}
    `);
    expect(program.nodes[0].writes).toEqual([
      expect.objectContaining({ memory: 'ConvHistory' }),
    ]);
  });

  it('parses a node with multiple write targets', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      node Writer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [ConvHistory, AuditLog]
        produces Result {
          text: String
        }
      }
    `);
    expect(program.nodes[0].writes).toEqual([
      expect.objectContaining({ memory: 'ConvHistory' }),
      expect.objectContaining({ memory: 'AuditLog' }),
    ]);
  });

  it('defaults writes to empty array when not specified', () => {
    const program = parse(`
      context Input(max_tokens: 1k) { q: String }
      node Reader(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        produces Result {
          text: String
        }
      }
    `);
    expect(program.nodes[0].writes).toEqual([]);
  });

  it('rejects duplicate writes clause', () => {
    const errors = parseErrors(`
      context Input(max_tokens: 1k) { q: String }
      node Bad(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [A]
        writes: [B]
        produces Result {
          text: String
        }
      }
    `);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].message).toContain('Duplicate writes clause in node');
  });
});

describe('Parser v2 — mixed declarations', () => {
  it('parses all declaration types together', () => {
    const program = parse(`
      import { SharedCtx } from "lib/shared.gft"

      memory ConvHistory(max_tokens: 10k) {
        turns: String
      }

      context Input(max_tokens: 1k) {
        question: String
      }

      node Answerer(model: sonnet, budget: 5k/2k) {
        reads: [Input]
        writes: [ConvHistory]
        produces Answer {
          text: String
        }
      }

      edge Answerer -> Sink

      graph QA(input: Input, output: Answer, budget: 10k) {
        Answerer -> done
      }
    `);
    expect(program.imports).toHaveLength(1);
    expect(program.memories).toHaveLength(1);
    expect(program.contexts).toHaveLength(1);
    expect(program.nodes).toHaveLength(1);
    expect(program.edges).toHaveLength(1);
    expect(program.graphs).toHaveLength(1);
  });

  it('allows memory after context', () => {
    const program = parse(`
      context A(max_tokens: 1k) { x: String }
      memory B(max_tokens: 2k) { y: String }
    `);
    expect(program.contexts).toHaveLength(1);
    expect(program.memories).toHaveLength(1);
  });
});

describe('Parser v2 — backward compatibility', () => {
  it('parses a v1 program without imports, memories, or writes', () => {
    const program = parse(`
      context TaskSpec(max_tokens: 1k) {
        description: String
      }

      node Analyzer(model: sonnet, budget: 5k/2k) {
        reads: [TaskSpec]
        produces Analysis {
          findings: List<String>
        }
      }

      edge Analyzer -> Sink

      graph Simple(input: TaskSpec, output: Analysis, budget: 10k) {
        Analyzer -> done
      }
    `);
    expect(program.imports).toEqual([]);
    expect(program.memories).toEqual([]);
    expect(program.contexts).toHaveLength(1);
    expect(program.nodes).toHaveLength(1);
    expect(program.nodes[0].writes).toEqual([]);
    expect(program.edges).toHaveLength(1);
    expect(program.graphs).toHaveLength(1);
  });
});
