import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser, ParseResult } from '../src/parser/parser.js';
import { compileToProgram } from '../src/compiler.js';

function parseSource(source: string): ParseResult {
  const tokens = new Lexer(source).tokenize();
  return new Parser(tokens).parse();
}

// A minimal valid context for use in multi-declaration tests
const VALID_CONTEXT = `context Input(max_tokens: 1000) {
  query: String
}`;

// A minimal valid node
const VALID_NODE = `node Worker(model: gpt4, budget: 1000/500) {
  reads: [Input]
  produces Result {
    answer: String
  }
}`;

// A broken context (missing parens)
const BROKEN_CONTEXT = `context Broken max_tokens: 1000 {
  query: String
}`;

// A broken node (missing model keyword)
const BROKEN_NODE = `node Bad(: gpt4, budget: 1000/500) {
  reads: [Input]
  produces Result {
    answer: String
  }
}`;

describe('v3.2-R1: Parser Error Recovery', () => {

  // Test 1: Single error recovery
  it('recovers from a single syntax error and parses subsequent declarations', () => {
    const source = `${BROKEN_CONTEXT}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.program.nodes).toHaveLength(1);
    expect(result.program.nodes[0].name).toBe('Worker');
  });

  // Test 2: Multiple error recovery
  it('reports multiple errors from different declarations', () => {
    const source = `${BROKEN_CONTEXT}\n${BROKEN_NODE}\ncontext AlsoBroken max_tokens: 500 {\n  x: Int\n}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  // Test 3: Recovery past broken declaration
  it('recovers past a broken context body and parses valid node after', () => {
    // Context with bad field type
    const source = `context Broken(max_tokens: 1000) {\n  query:\n}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.program.nodes).toHaveLength(1);
    expect(result.program.nodes[0].name).toBe('Worker');
  });

  // Test 4: Error + valid imports
  it('preserves valid imports when a later declaration has errors', () => {
    // We can't actually import (no file), but we can test the parsing stage
    // by checking import parsing succeeds then a broken context is recovered from
    const source = `import { Foo } from "./foo.gft"\n${BROKEN_CONTEXT}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.program.imports).toHaveLength(1);
    expect(result.program.imports[0].names).toContain('Foo');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.program.nodes).toHaveLength(1);
  });

  // Test 5: All declarations broken
  it('handles all declarations being broken', () => {
    const source = `${BROKEN_CONTEXT}\n${BROKEN_NODE}\ncontext Bad2 x: Int {}\ngraph Bad3() {}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.program.contexts).toHaveLength(0);
    expect(result.program.nodes).toHaveLength(0);
  });

  // Test 6: Error at EOF
  it('reports error for declaration keyword at EOF', () => {
    const source = `context`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // Test 7: Unexpected token at top level
  it('reports unexpected token at top level and continues parsing', () => {
    const source = `12345\n${VALID_CONTEXT}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.program.contexts).toHaveLength(1);
    expect(result.program.contexts[0].name).toBe('Input');
  });

  // Test 8: MAX_ERRORS limit
  it('stops collecting errors at MAX_ERRORS (25)', () => {
    // Generate 30 broken declarations
    const broken = Array.from({ length: 30 }, (_, i) =>
      `context Bad${i} max_tokens: 100 { x: Int }`
    ).join('\n');
    const result = parseSource(broken);
    expect(result.errors).toHaveLength(25);
  });

  // Test 9: seenNonImport import error
  it('reports error for import after non-import declaration', () => {
    const source = `${VALID_CONTEXT}\nimport { Foo } from "./foo.gft"`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].message).toContain('Import declarations must appear before');
  });

  // Test 10: Brace depth tracking
  it('does not falsely recover on keyword-named field inside produces block', () => {
    // A node with a field named "context" inside produces -- should NOT trigger recovery
    const source = `node Worker(model: gpt4, budget: 1000/500) {
  reads: [Input]
  produces Result {
    context: String
    summary: String
  }
}`;
    // First need the Input context for this to parse
    const fullSource = `${VALID_CONTEXT}\n${source}`;
    const result = parseSource(fullSource);
    expect(result.errors).toHaveLength(0);
    expect(result.program.nodes).toHaveLength(1);
    const produces = result.program.nodes[0].produces;
    expect(produces.fields).toHaveLength(2);
    expect(produces.fields[0].name).toBe('context');
  });

  // Test 11: ParseResult with valid program
  it('returns empty errors for a completely valid program', () => {
    const source = `${VALID_CONTEXT}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.errors).toHaveLength(0);
    expect(result.program.contexts).toHaveLength(1);
    expect(result.program.nodes).toHaveLength(1);
  });

  // Test 12: ParseResult backward compatibility
  it('returns identical program structure for valid programs', () => {
    const source = `${VALID_CONTEXT}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.program.contexts[0].name).toBe('Input');
    expect(result.program.contexts[0].maxTokens).toBe(1000);
    expect(result.program.contexts[0].fields[0].name).toBe('query');
    expect(result.program.nodes[0].name).toBe('Worker');
    expect(result.program.nodes[0].model).toBe('gpt4');
  });

  // Test 13: Compiler integration
  it('surfaces parse errors in ProgramResult.errors', () => {
    const source = `${BROKEN_CONTEXT}\n${VALID_NODE}`;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // Test 14: Parse error + scope error (only parse errors since we bail early)
  it('reports parse errors in compiler result', () => {
    // Broken context + valid node referencing undefined context
    const source = `${BROKEN_CONTEXT}\nnode Worker(model: gpt4, budget: 1000/500) {\n  reads: [NonExistent]\n  produces Result { answer: String }\n}`;
    const result = compileToProgram(source, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // Test 15: Empty file
  it('returns empty program with no errors for empty file', () => {
    const result = parseSource('');
    expect(result.errors).toHaveLength(0);
    expect(result.program.contexts).toHaveLength(0);
    expect(result.program.nodes).toHaveLength(0);
    expect(result.program.edges).toHaveLength(0);
    expect(result.program.graphs).toHaveLength(0);
  });

  // Test 16: Consecutive errors
  it('reports errors for two consecutive broken declarations', () => {
    const source = `${BROKEN_CONTEXT}\ncontext AlsoBroken max_tokens: 500 {\n  x: Int\n}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  // Test 17: Error in graph body
  it('recovers from error in graph and parses valid node after', () => {
    // Graph with missing 'done' terminator (parse error, not lexer error)
    const source = `graph Pipeline(input: In, output: Out, budget: 10000) {\n  Step1 -> Step2\n}\n${VALID_CONTEXT}\n${VALID_NODE}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // After recovery, valid declarations should be parsed
    expect(result.program.nodes.length + result.program.contexts.length).toBeGreaterThanOrEqual(1);
  });

  // Test 18: Error in edge declaration
  it('recovers from error in edge and parses valid context after', () => {
    const source = `edge -> {\n}\n${VALID_CONTEXT}`;
    const result = parseSource(source);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.program.contexts).toHaveLength(1);
    expect(result.program.contexts[0].name).toBe('Input');
  });
});
