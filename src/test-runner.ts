import { ContextDecl, Field, TypeExpr, Program } from './parser/ast.js';
import { compileToProgram, ProgramResult } from './compiler.js';
import { ProgramIndex } from './program-index.js';
import { generateMockOutput } from './runtime/prompt-builder.js';
import { applyTransforms } from './runtime/transforms.js';
import { executeFlowNodes, FlowContext } from './runtime/flow-runner.js';

// --- Test input generation ---

/**
 * Generate minimal valid test data for a TypeExpr.
 */
export function generateTestValue(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return 'test';
        case 'Int': return 1;
        case 'Float': return 0.5;
        case 'Bool': return true;
      }
      break;
    case 'primitive_range':
      return (type.min + type.max) / 2;
    case 'list':
      return [generateTestValue(type.element)];
    case 'map':
      return { [String(generateTestValue(type.key))]: generateTestValue(type.value) };
    case 'optional':
      return null;
    case 'token_bounded':
      return generateTestValue(type.inner);
    case 'enum':
      return type.values[0];
    case 'struct':
      return generateTestInput({ name: '', maxTokens: 0, fields: type.fields, location: { line: 0, column: 0, offset: 0 } });
    case 'domain':
      return `test.${type.name.toLowerCase()}`;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Generate a minimal valid JSON object from a context declaration's field schema.
 */
export function generateTestInput(context: ContextDecl): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of context.fields) {
    result[field.name] = generateTestValue(field.type);
  }
  return result;
}

// --- Output validation ---

/**
 * Validate that an output object matches the expected field schema.
 * Returns an array of error strings (empty if valid).
 */
export function validateOutput(output: unknown, fields: Field[], prefix = ''): string[] {
  const errors: string[] = [];

  if (output === null || output === undefined || typeof output !== 'object' || Array.isArray(output)) {
    errors.push(`${prefix || 'output'}: expected object, got ${output === null ? 'null' : typeof output}`);
    return errors;
  }

  const obj = output as Record<string, unknown>;

  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (!(field.name in obj)) {
      // Optional fields are allowed to be missing
      if (field.type.kind === 'optional') continue;
      errors.push(`${path}: missing required field`);
      continue;
    }
    errors.push(...validateValue(obj[field.name], field.type, path));
  }

  return errors;
}

function validateValue(value: unknown, type: TypeExpr, path: string): string[] {
  const errors: string[] = [];

  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String':
          if (typeof value !== 'string') errors.push(`${path}: expected string, got ${typeof value}`);
          break;
        case 'Int':
          if (typeof value !== 'number' || !Number.isInteger(value))
            errors.push(`${path}: expected integer, got ${typeof value === 'number' ? 'float' : typeof value}`);
          break;
        case 'Float':
          if (typeof value !== 'number') errors.push(`${path}: expected number, got ${typeof value}`);
          break;
        case 'Bool':
          if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${typeof value}`);
          break;
      }
      break;

    case 'primitive_range':
      if (typeof value !== 'number') {
        errors.push(`${path}: expected number, got ${typeof value}`);
      } else if (value < type.min || value > type.max) {
        errors.push(`${path}: value ${value} out of range [${type.min}..${type.max}]`);
      }
      break;

    case 'list':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
      } else {
        for (let i = 0; i < value.length; i++) {
          errors.push(...validateValue(value[i], type.element, `${path}[${i}]`));
        }
      }
      break;

    case 'map':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object (map), got ${typeof value}`);
      }
      break;

    case 'optional':
      if (value !== null && value !== undefined) {
        errors.push(...validateValue(value, type.inner, path));
      }
      break;

    case 'token_bounded':
      errors.push(...validateValue(value, type.inner, path));
      break;

    case 'enum':
      if (typeof value !== 'string' || !type.values.includes(value)) {
        errors.push(`${path}: expected enum value (${type.values.join(', ')}), got ${JSON.stringify(value)}`);
      }
      break;

    case 'struct':
      errors.push(...validateOutput(value, type.fields, path));
      break;

    case 'domain':
      if (typeof value !== 'string') errors.push(`${path}: expected string (${type.name}), got ${typeof value}`);
      break;
  }

  return errors;
}

// --- Test runner ---

export interface TestInput {
  source: string;
  sourceFile: string;
  input?: Record<string, unknown>;
  verbose?: boolean;
}

export interface NodeTestResult {
  node: string;
  passed: boolean;
  output: unknown;
  validationErrors: string[];
}

export interface TestResult {
  success: boolean;
  inputUsed: Record<string, unknown>;
  nodeResults: NodeTestResult[];
  compileErrors: string[];
}

export async function runTest(opts: TestInput): Promise<TestResult> {
  // Compile the source
  const compileResult = compileToProgram(opts.source, opts.sourceFile);

  if (!compileResult.success || !compileResult.program) {
    return {
      success: false,
      inputUsed: opts.input ?? {},
      nodeResults: [],
      compileErrors: compileResult.errors.map(e => e.message),
    };
  }

  const program = compileResult.program;
  const index = compileResult.index ?? new ProgramIndex(program);

  if (program.graphs.length === 0) {
    return {
      success: false,
      inputUsed: opts.input ?? {},
      nodeResults: [],
      compileErrors: ['No graph declaration found'],
    };
  }

  const graph = program.graphs[0];

  // Generate or use provided input
  const inputContext = index.contextMap.get(graph.input);
  const inputUsed = opts.input ?? (inputContext ? generateTestInput(inputContext) : {});

  // Execute in dry-run mode
  const outputs = new Map<string, unknown>();
  const nodeResults: NodeTestResult[] = [];

  const executeNode = async (name: string) => {
    const nodeDecl = index.nodeMap.get(name);
    if (!nodeDecl) {
      const nr: NodeTestResult = { node: name, passed: false, output: null, validationErrors: [`Node '${name}' not found`] };
      nodeResults.push(nr);
      return { node: name, output: null, durationMs: 0, success: false, error: `Node '${name}' not found` };
    }

    // Generate mock output
    const mockOutput = generateMockOutput(nodeDecl);
    outputs.set(nodeDecl.name, mockOutput);
    outputs.set(nodeDecl.produces.name, mockOutput);

    // Validate mock output against produces schema
    const validationErrors = validateOutput(mockOutput, nodeDecl.produces.fields);
    const passed = validationErrors.length === 0;

    const nr: NodeTestResult = { node: name, passed, output: mockOutput, validationErrors };
    nodeResults.push(nr);

    return { node: name, output: mockOutput, durationMs: 0, success: true };
  };

  const flowCtx: FlowContext = {
    executeNode,
    getFailureStrategy: (name: string) => index.nodeMap.get(name)?.onFailure,
    getConditionalEdge: (sourceName: string) => {
      const edges = index.edgesBySource.get(sourceName);
      if (!edges) return null;
      for (const edge of edges) {
        if (edge.target.kind === 'conditional') {
          return { branches: edge.target.branches, transforms: edge.transforms };
        }
      }
      return null;
    },
    outputs,
    input: inputUsed,
  };

  const executionErrors: string[] = [];
  const executionResults: { node: string; output: unknown; durationMs: number; success: boolean; error?: string }[] = [];

  try {
    await executeFlowNodes(graph.flow, executionResults, executionErrors, flowCtx);
  } catch (e) {
    executionErrors.push(e instanceof Error ? e.message : String(e));
  }

  const allPassed = nodeResults.every(r => r.passed) && executionErrors.length === 0;

  return {
    success: allPassed,
    inputUsed,
    nodeResults,
    compileErrors: [],
  };
}
