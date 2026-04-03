import { NodeDecl, EdgeDecl } from '../parser/ast.js';
import { CodegenBackend, CodegenContext } from './backend.js';
import { generateAgent } from './agents.js';
import { generateHook } from './hooks.js';
import { generateOrchestration } from './orchestration.js';
import { generateSettings } from './settings.js';

export class ClaudeCodeBackend implements CodegenBackend {
  readonly name = 'claude';

  generateAgent(node: NodeDecl, memoryNames: Set<string>, ctx: CodegenContext): string {
    // Compute input overrides: map produces names to actual file paths
    const inputOverrides = new Map<string, string>();

    // 1. For edges with transforms: use the transformed output path
    // 2. For edges without transforms: use the source's raw output path
    for (const edge of ctx.program.edges) {
      if (edge.target.kind === 'direct' && edge.target.node === node.name) {
        const sourceNode = ctx.program.nodes.find(n => n.name === edge.source);
        if (sourceNode) {
          const producesName = sourceNode.produces.name;
          if (edge.transforms.length > 0) {
            inputOverrides.set(producesName, `.graft/session/node_outputs/${edge.source.toLowerCase()}_to_${node.name.toLowerCase()}.json`);
          } else {
            inputOverrides.set(producesName, `.graft/session/node_outputs/${edge.source.toLowerCase()}.json`);
          }
        }
      }
    }

    // 3. For produces reads with no corresponding edge: resolve to producer's raw output
    for (const ref of node.reads) {
      if (inputOverrides.has(ref.context) || memoryNames.has(ref.context)) continue;
      // Check if this read references a produces type from another node
      const producerNode = ctx.program.nodes.find(n => n.produces.name === ref.context);
      if (producerNode && producerNode.name !== node.name) {
        inputOverrides.set(ref.context, `.graft/session/node_outputs/${producerNode.name.toLowerCase()}.json`);
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
