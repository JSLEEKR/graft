import { FlowNode, FailureStrategy, Condition, ConditionalBranch, Transform, conditionFieldName } from '../parser/ast.js';
import { NodeResult } from './executor.js';
import { resolveField, RuntimeState } from './prompt-builder.js';
import { applyTransforms } from './transforms.js';
import { MAX_CONDITIONAL_HOPS } from '../constants.js';

export { MAX_CONDITIONAL_HOPS };

export interface ConditionalEdgeInfo {
  branches: ConditionalBranch[];
  transforms: Transform[];
}

export interface FlowContext extends RuntimeState {
  executeNode: (name: string) => Promise<NodeResult>;
  getFailureStrategy?: (name: string) => FailureStrategy | undefined;
  getConditionalEdge?: (sourceName: string) => ConditionalEdgeInfo | null;
}

export function evaluateCondition(condition: Condition, output: Record<string, unknown>): boolean {
  const fieldValue = output[conditionFieldName(condition)];
  if (fieldValue === undefined) {
    return condition.op === '!=';
  }

  switch (condition.op) {
    case '==': return fieldValue == condition.value;
    case '!=': return fieldValue != condition.value;
    case '>=': return Number(fieldValue) >= Number(condition.value);
    case '>':  return Number(fieldValue) > Number(condition.value);
    case '<=': return Number(fieldValue) <= Number(condition.value);
    case '<':  return Number(fieldValue) < Number(condition.value);
  }
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

export function applyFallbackAlias(name: string, result: NodeResult, ctx: FlowContext): void {
  if (result.node !== name) {
    ctx.outputs.set(name, result.output);
  }
}

export async function executeConditionalChain(
  flowNodeName: string,
  result: NodeResult,
  ctx: FlowContext,
  nodeResults: NodeResult[],
  errors: string[],
): Promise<void> {
  const visited = new Set<string>();
  visited.add(flowNodeName);
  let currentNodeName = flowNodeName;
  let currentOutput = result.output;

  let hop = 0;
  for (; hop < MAX_CONDITIONAL_HOPS; hop++) {
    if (errors.length > 0) break;

    const edgeInfo = ctx.getConditionalEdge?.(currentNodeName);
    if (!edgeInfo || !currentOutput || typeof currentOutput !== 'object') break;

    const { branches, transforms } = edgeInfo;
    const output = currentOutput as Record<string, unknown>;
    let routedTo: string | null = null;
    let elseBranch: string | null = null;

    for (const branch of branches) {
      if (!branch.condition) {
        elseBranch = branch.target;
      } else if (evaluateCondition(branch.condition, output)) {
        routedTo = branch.target;
        break;
      }
    }

    const target = routedTo ?? elseBranch;
    if (!target || target === 'done') break;

    // Apply transforms after condition evaluation, before target execution
    if (transforms.length > 0) {
      const transformed = applyTransforms(currentOutput, transforms);
      ctx.outputs.set(currentNodeName, transformed);
    }

    // Cycle detection
    if (visited.has(target)) {
      errors.push(`Conditional edge cycle detected: ${[...visited, target].join(' -> ')}`);
      break;
    }
    visited.add(target);

    const conditionalResult = await executeWithFailureStrategy(target, nodeResults, errors, ctx);
    if (!conditionalResult) break;
    nodeResults.push(conditionalResult);

    applyFallbackAlias(target, conditionalResult, ctx);

    currentNodeName = target;
    currentOutput = conditionalResult.output;
  }

  // Post-loop depth limit check: if we used all hops without breaking, the chain is too deep
  if (hop >= MAX_CONDITIONAL_HOPS && errors.length === 0) {
    errors.push(`Conditional chain from '${flowNodeName}' exceeded maximum depth of ${MAX_CONDITIONAL_HOPS} hops`);
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
        if (result) {
          nodeResults.push(result);
          applyFallbackAlias(flowNode.name, result, ctx);
          await executeConditionalChain(flowNode.name, result, ctx, nodeResults, errors);
        }
        break;
      }

      case 'parallel': {
        const branches = flowNode.branches.filter(name => name !== 'done');
        const promises = branches.map(name =>
          executeWithFailureStrategy(name, nodeResults, errors, ctx)
            .then(result => { if (result) nodeResults.push(result); })
            .catch((reason: unknown) => {
              const nr: NodeResult = {
                node: name,
                output: null,
                durationMs: 0,
                success: false,
                error: reason instanceof Error ? reason.message : String(reason),
              };
              nodeResults.push(nr);
              errors.push(nr.error!);
            }),
        );
        await Promise.allSettled(promises);
        break;
      }

      case 'foreach': {
        const sourceData = ctx.outputs.get(flowNode.source);
        if (sourceData === undefined) {
          // Source node produced no output (skipped or not executed)
          break;
        }
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
          const errorsBefore = errors.length;
          await executeFlowNodes(flowNode.body, nodeResults, errors, ctx);
          // Annotate any new errors with iteration context
          for (let e = errorsBefore; e < errors.length; e++) {
            errors[e] = `${errors[e]} (foreach iteration ${i + 1} of ${maxIter})`;
          }
        }
        // Restore or clean up binding
        if (hadBinding) {
          ctx.outputs.set(flowNode.binding, prevBinding);
        } else {
          ctx.outputs.delete(flowNode.binding);
        }
        break;
      }

      case 'let':
        break;

      case 'graph_call':
        break;
    }
  }
}
