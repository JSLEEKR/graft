import { NodeDecl, EdgeDecl } from '../parser/ast.js';
import { CodegenBackend, CodegenContext } from './backend.js';
import { generateAgent } from './agents.js';
import { generateHook } from './hooks.js';
import { generateOrchestration } from './orchestration.js';
import { generateSettings } from './settings.js';

export class ClaudeCodeBackend implements CodegenBackend {
  readonly name = 'claude';

  generateAgent(node: NodeDecl, memoryNames: Set<string>, _ctx: CodegenContext): string {
    return generateAgent(node, memoryNames);
  }

  generateHook(edge: EdgeDecl, _ctx: CodegenContext): string | null {
    return generateHook(edge);
  }

  generateOrchestration(ctx: CodegenContext): string {
    return generateOrchestration(ctx.program, ctx.report);
  }

  generateSettings(ctx: CodegenContext): Record<string, unknown> {
    return generateSettings(ctx.program, ctx.sourceFile, ctx.index) as unknown as Record<string, unknown>;
  }
}
