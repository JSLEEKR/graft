// Public API type exports
export type { Program, ContextDecl, NodeDecl, MemoryDecl, EdgeDecl, GraphDecl } from './parser/ast.js';
export type { ProgramIndex } from './program-index.js';
export { GraftError } from './errors/diagnostics.js';
export type { GraftErrorCode, SourceLocation } from './errors/diagnostics.js';
export type { CodegenBackend, CodegenContext } from './codegen/backend.js';
export type { GeneratedFile } from './codegen/codegen.js';
export type { TokenReport } from './analyzer/estimator.js';
export type { ProgramResult, CompileResult } from './compiler.js';
export type { RunResult, RunOptions, NodeResult } from './runtime/executor.js';
export type { TokenUsage } from './runtime/subprocess.js';
