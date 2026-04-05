/**
 * Browser entry point for the Graft playground.
 * Exports only the compiler pipeline (no fs, no runtime, no CLI).
 */
import { Lexer } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { ScopeChecker } from './analyzer/scope.js';
import { TypeChecker } from './analyzer/types.js';
import { TokenEstimator, TokenReport } from './analyzer/estimator.js';
import { GraftError } from './errors/diagnostics.js';
import { Program } from './parser/ast.js';
import { ProgramIndex } from './program-index.js';
import { generate, GeneratedFile } from './codegen/codegen.js';
export interface PlaygroundResult {
  success: boolean;
  program?: Program;
  report?: TokenReport;
  files?: GeneratedFile[];
  errors: Array<{ message: string; line: number; column: number; severity: string; code?: string; formatted: string }>;
  warnings: Array<{ message: string; line: number; column: number; severity: string; code?: string; formatted: string }>;
}

function serializeDiagnostic(e: GraftError, source: string, filename: string) {
  return {
    message: e.message,
    line: e.location.line,
    column: e.location.column,
    severity: e.severity,
    code: e.code,
    formatted: e.format(source, filename),
  };
}

export function compilePlayground(source: string, filename: string = 'playground.gft'): PlaygroundResult {
  const errors: GraftError[] = [];
  const warnings: GraftError[] = [];

  // Lex
  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e) {
    if (e instanceof GraftError) {
      return {
        success: false,
        errors: [serializeDiagnostic(e, source, filename)],
        warnings: [],
      };
    }
    throw e;
  }

  // Parse
  const { program, errors: parseErrors } = new Parser(tokens).parse();
  errors.push(...parseErrors);
  if (parseErrors.length > 0) {
    return {
      success: false,
      program,
      errors: errors.map(e => serializeDiagnostic(e, source, filename)),
      warnings: [],
    };
  }

  // Set sourceFile (no path.resolve — browser-safe)
  for (const c of program.contexts) c.sourceFile = filename;
  for (const n of program.nodes) n.sourceFile = filename;

  // Build ProgramIndex
  const index = new ProgramIndex(program);

  // Analyze
  const scopeDiagnostics = new ScopeChecker(program, index).check();
  const typeDiagnostics = new TypeChecker(program, index).check();

  for (const d of [...scopeDiagnostics, ...typeDiagnostics]) {
    if (d.severity === 'warning') warnings.push(d);
    else errors.push(d);
  }

  if (errors.length > 0) {
    return {
      success: false,
      program,
      errors: errors.map(e => serializeDiagnostic(e, source, filename)),
      warnings: warnings.map(w => serializeDiagnostic(w, source, filename)),
    };
  }

  // Token analysis
  const report = new TokenEstimator(program, index).estimate();
  warnings.push(...report.warnings);

  // Generate files (if graph exists)
  let files: GeneratedFile[] | undefined;
  if (program.graphs.length > 0) {
    files = generate(program, report, filename, index);
  }

  return {
    success: true,
    program,
    report,
    files,
    errors: [],
    warnings: warnings.map(w => serializeDiagnostic(w, source, filename)),
  };
}
