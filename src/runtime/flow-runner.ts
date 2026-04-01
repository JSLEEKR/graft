import { FlowNode, FailureStrategy } from '../parser/ast.js';
import { NodeResult } from './executor.js';
import { resolveField, RuntimeState } from './prompt-builder.js';

export interface FlowContext extends RuntimeState {
  executeNode: (name: string) => Promise<NodeResult>;
  getFailureStrategy?: (name: string) => FailureStrategy | undefined;
}

async function executeWithFailureStrategy(
  name: string,
  nodeResults: NodeResult[],
  errors: string[],
  ctx: FlowContext,
): Promise<NodeResult | null> {
  const result = await ctx.executeNode(name);
  if (result.success) return result;

  const strategy = ctx.getFailureStrategy?.(name);
  if (!strategy || strategy.type === 'abort') {
    nodeResults.push(result);
    errors.push(result.error ?? `Node ${name} failed`);
    return null;
  }

  switch (strategy.type) {
    case 'skip':
      nodeResults.push(result);
      return null;

    case 'retry': {
      for (let attempt = 1; attempt <= strategy.max; attempt++) {
        const retry = await ctx.executeNode(name);
        if (retry.success) return retry;
      }
      nodeResults.push(result);
      errors.push(result.error ?? `Node ${name} failed after ${strategy.max} retries`);
      return null;
    }

    case 'fallback': {
      const fallback = await ctx.executeNode(strategy.node);
      if (fallback.success) return fallback;
      nodeResults.push(fallback);
      errors.push(fallback.error ?? `Fallback node ${strategy.node} also failed`);
      return null;
    }

    case 'retry_then_fallback': {
      for (let attempt = 1; attempt <= strategy.max; attempt++) {
        const retry = await ctx.executeNode(name);
        if (retry.success) return retry;
      }
      const fallback = await ctx.executeNode(strategy.node);
      if (fallback.success) return fallback;
      nodeResults.push(fallback);
      errors.push(fallback.error ?? `Fallback node ${strategy.node} failed after ${strategy.max} retries of ${name}`);
      return null;
    }
  }
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
        const result = await executeWithFailureStrategy(flowNode.name, nodeResults, errors, ctx);
        if (result) nodeResults.push(result);
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
        const hadBinding = ctx.outputs.has(flowNode.binding);
        const prevBinding = ctx.outputs.get(flowNode.binding);
        const maxIter = Math.min(items.length, flowNode.maxIterations);
        for (let i = 0; i < maxIter; i++) {
          if (errors.length > 0) break;
          ctx.outputs.set(flowNode.binding, items[i]);
          await executeFlowNodes(flowNode.body, nodeResults, errors, ctx);
        }
        // Restore or clean up binding
        if (hadBinding) {
          ctx.outputs.set(flowNode.binding, prevBinding);
        } else {
          ctx.outputs.delete(flowNode.binding);
        }
        break;
      }
    }
  }
}
