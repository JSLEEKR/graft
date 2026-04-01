import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { resolve } from './resolver/resolver.js';
import { ScopeChecker } from './analyzer/scope.js';
import { TypeChecker } from './analyzer/types.js';
import { TokenEstimator, TokenReport } from './analyzer/estimator.js';
import { generate, GeneratedFile, writeFiles } from './codegen/codegen.js';
import { GraftError } from './errors/diagnostics.js';
import { Program } from './parser/ast.js';

export interface CompileResult {
  success: boolean;
  program?: Program;
  report?: TokenReport;
  files?: GeneratedFile[];
  errors: GraftError[];
  warnings: GraftError[];
}

export function compile(source: string, sourceFile: string): CompileResult {
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
  let program: Program;
  try {
    const parser = new Parser(tokens);
    program = parser.parse();
  } catch (e) {
    if (e instanceof GraftError) {
      return { success: false, errors: [e], warnings };
    }
    throw e;
  }

  // Resolve imports
  if (program.imports.length > 0) {
    const resolveResult = resolve(program, sourceFile);
    if (resolveResult.errors.length > 0) {
      errors.push(...resolveResult.errors);
      return { success: false, program, errors, warnings };
    }
    program = resolveResult.program;
  }

  // Guard: no graph declaration
  if (program.graphs.length === 0) {
    return {
      success: false,
      errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING')],
      warnings,
    };
  }

  // Analyze: scope
  const scopeDiagnostics = new ScopeChecker(program).check();

  // Analyze: types
  const typeDiagnostics = new TypeChecker(program).check();

  // Separate errors from warnings
  for (const d of [...scopeDiagnostics, ...typeDiagnostics]) {
    if (d.severity === 'warning') {
      warnings.push(d);
    } else {
      errors.push(d);
    }
  }

  if (errors.length > 0) {
    return { success: false, program, errors, warnings };
  }

  // Analyze: tokens
  const report = new TokenEstimator(program).estimate();
  warnings.push(...report.warnings);

  // Generate
  const files = generate(program, report, sourceFile);

  return { success: true, program, report, files, errors, warnings };
}

export function compileAndWrite(source: string, sourceFile: string, outDir: string): CompileResult {
  const result = compile(source, sourceFile);
  if (result.success && result.files) {
    writeFiles(result.files, outDir);
  }
  return result;
}
