import * as path from 'node:path';
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { resolve } from './resolver/resolver.js';
import { ScopeChecker } from './analyzer/scope.js';
import { TypeChecker } from './analyzer/types.js';
import { TokenEstimator, TokenReport } from './analyzer/estimator.js';
import { generate, GeneratedFile, writeFiles } from './codegen/codegen.js';
import { GraftError } from './errors/diagnostics.js';
import { Program } from './parser/ast.js';
import { ProgramIndex } from './program-index.js';
import { CodegenBackend } from './codegen/backend.js';

export interface ProgramResult {
  success: boolean;
  program?: Program;
  index?: ProgramIndex;
  report?: TokenReport;
  errors: GraftError[];
  warnings: GraftError[];
}

export interface CompileResult extends ProgramResult {
  files?: GeneratedFile[];
}

export function compileToProgram(source: string, sourceFile: string): ProgramResult {
  const errors: GraftError[] = [];
  const warnings: GraftError[] = [];

  // Lex
  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Parse
  const { program: parsedProgram, errors: parseErrors } = new Parser(tokens).parse();
  let program: Program = parsedProgram;
  errors.push(...parseErrors);
  if (parseErrors.length > 0) {
    return { success: false, program, errors, warnings };
  }

  // Set sourceFile on all entry declarations
  const absSourceFile = path.resolve(sourceFile);
  for (const c of program.contexts) c.sourceFile = absSourceFile;
  for (const n of program.nodes) n.sourceFile = absSourceFile;

  // Resolve imports
  if (program.imports.length > 0) {
    const resolveResult = resolve(program, sourceFile);
    if (resolveResult.errors.length > 0) {
      errors.push(...resolveResult.errors);
      return { success: false, program, errors, warnings };
    }
    program = resolveResult.program;
  }

  // Build ProgramIndex once (after resolve, before analyzers)
  const index = new ProgramIndex(program);

  // Analyze: scope
  const scopeDiagnostics = new ScopeChecker(program, index).check();

  // Analyze: types (ratchet v3.0-R4: TypeChecker migrated to ProgramIndex)
  const typeDiagnostics = new TypeChecker(program, index).check();

  // Separate errors from warnings
  for (const d of [...scopeDiagnostics, ...typeDiagnostics]) {
    if (d.severity === 'warning') {
      warnings.push(d);
    } else {
      errors.push(d);
    }
  }

  if (errors.length > 0) {
    return { success: false, program, index, errors, warnings };
  }

  // Analyze: tokens
  const report = new TokenEstimator(program, index).estimate();
  warnings.push(...report.warnings);

  return { success: true, program, index, report, errors, warnings };
}

export function compileAndGenerate(source: string, sourceFile: string, backend?: CodegenBackend): CompileResult {
  const result = compileToProgram(source, sourceFile);

  if (!result.success || !result.program) {
    return result;
  }

  // Guard: no graph declaration (codegen prerequisite)
  if (result.program.graphs.length === 0) {
    return {
      ...result,
      success: false,
      errors: [
        ...result.errors,
        new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING'),
      ],
    };
  }

  // Generate
  const files = generate(result.program, result.report!, sourceFile, result.index, backend);

  return { ...result, files };
}

/** Backward-compatible alias for compileAndGenerate */
export function compile(source: string, sourceFile: string, backend?: CodegenBackend): CompileResult {
  return compileAndGenerate(source, sourceFile, backend);
}

export function compileAndWrite(source: string, sourceFile: string, outDir: string, backend?: CodegenBackend): CompileResult {
  const result = compile(source, sourceFile, backend);
  if (result.success && result.files) {
    writeFiles(result.files, outDir);
  }
  return result;
}
