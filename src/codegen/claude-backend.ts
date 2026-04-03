import { NodeDecl, EdgeDecl } from '../parser/ast.js';
import { CodegenBackend, CodegenContext } from './backend.js';
import { generateAgent } from './agents.js';
import { generateHook } from './hooks.js';
import { generateOrchestration } from './orchestration.js';
import { generateSettings } from './settings.js';

export class ClaudeCodeBackend implements CodegenBackend {
  readonly name = 'claude';

  generateAgent(node: NodeDecl, memoryNames: Set<string>, ctx: CodegenContext): string {
    // Compute input overrides: for each incoming edge with transforms,
    // map the source's produces name to the transformed file path
    const inputOverrides = new Map<string, string>();
    for (const edge of ctx.program.edges) {
      if (edge.target.kind === 'direct' && edge.target.node === node.name && edge.transforms.length > 0) {
        const sourceNode = ctx.program.nodes.find(n => n.name === edge.source);
        if (sourceNode) {
          const producesName = sourceNode.produces.name;
          const transformedPath = `.graft/session/node_outputs/${edge.source.toLowerCase()}_to_${node.name.toLowerCase()}.json`;
          inputOverrides.set(producesName, transformedPath);
        }
      }
    }
    return generateAgent(node, memoryNames, inputOverrides);
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
