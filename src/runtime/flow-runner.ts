import { FlowNode } from '../parser/ast.js';
import { NodeResult } from './executor.js';
import { resolveField } from './prompt-builder.js';

export interface FlowContext {
  executeNode: (name: string) => Promise<NodeResult>;
  outputs: Map<string, unknown>;
  input: Record<string, unknown>;
}

export async function executeFlowNodes(
  flow: FlowNode[],
  nodeResults: NodeResult[],
  errors: string[],
  ctx: FlowContext,
): Promise<void> {
  for (const flowNode of flow) {
    if (errors.length > 0) break; // abort on failure

    switch (flowNode.kind) {
      case 'node': {
        if (flowNode.name === 'done') continue;
        const result = await ctx.executeNode(flowNode.name);
        nodeResults.push(result);
        if (!result.success) {
          errors.push(result.error ?? `Node ${flowNode.name} failed`);
        }
        break;
      }

      case 'parallel': {
        const promises = flowNode.branches
          .filter(name => name !== 'done')
          .map(name => ctx.executeNode(name));
        const results = await Promise.allSettled(promises);
        for (const [i, settled] of results.entries()) {
          if (settled.status === 'fulfilled') {
            nodeResults.push(settled.value);
            if (!settled.value.success) {
              errors.push(settled.value.error ?? `Node ${flowNode.branches[i]} failed`);
            }
          } else {
            const name = flowNode.branches[i];
            const nr: NodeResult = {
              node: name,
              output: null,
              durationMs: 0,
              success: false,
              error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            };
            nodeResults.push(nr);
            errors.push(nr.error!);
          }
        }
        break;
      }

      case 'foreach': {
        const sourceData = ctx.outputs.get(flowNode.source) ?? ctx.input;
        const items = resolveField(sourceData, flowNode.field);
        if (!Array.isArray(items)) {
          errors.push(`foreach: ${flowNode.source}.${flowNode.field} is not an array`);
          break;
        }
        const maxIter = Math.min(items.length, flowNode.maxIterations);
        for (let i = 0; i < maxIter; i++) {
          if (errors.length > 0) break;
          // Set the binding as available data
          ctx.outputs.set(flowNode.binding, items[i]);
          // Execute the body for each item
          await executeFlowNodes(flowNode.body, nodeResults, errors, ctx);
        }
        break;
      }
    }
  }
}
