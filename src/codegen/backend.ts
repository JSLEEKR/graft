import { Program, NodeDecl, EdgeDecl } from '../parser/ast.js';
import { TokenReport } from '../analyzer/estimator.js';
import { ProgramIndex } from '../program-index.js';
import { GeneratedFile } from './codegen.js';

export interface CodegenContext {
  program: Program;
  report: TokenReport;
  index: ProgramIndex;
  sourceFile: string;
}

export interface CodegenBackend {
  readonly name: string;
  generateAgent(node: NodeDecl, memoryNames: Set<string>, ctx: CodegenContext): string;
  generateHook(edge: EdgeDecl, ctx: CodegenContext): string | null;
  generateConditionalHook?(edge: EdgeDecl, ctx: CodegenContext): string | null;
  generateOrchestration(ctx: CodegenContext): string;
  generateSettings(ctx: CodegenContext): Record<string, unknown>;
}
