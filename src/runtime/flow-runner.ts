import { FlowNode, FailureStrategy, Condition, ConditionalBranch, Transform, conditionFieldName, Expr, GraphDecl } from '../parser/ast.js';
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
  variables?: Map<string, unknown>;
  getGraphDecl?: (name: string) => GraphDecl | undefined;
}

export function evaluateExpr(expr: Expr, outputs: Map<string, unknown>, variables?: Map<string, unknown>): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'field_access': {
      // Single-segment: check variables first (variable-first resolution per R2 ratchet v4.0-R21)
      if (expr.segments.length === 1) {
        if (variables?.has(expr.segments[0])) {
          return variables.get(expr.segments[0]);
        }
        // Could be a node name with single output
        return outputs.get(expr.segments[0]);
      }
      // Multi-segment: first segment is source name, rest are nested field access
      const root = outputs.get(expr.segments[0]);
      if (root === undefined || root === null) return undefined;
      let current: unknown = root;
      for (let i = 1; i < expr.segments.length; i++) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[expr.segments[i]];
      }
      return current;
    }
    case 'binary': {
      const left = evaluateExpr(expr.left, outputs, variables);
      const right = evaluateExpr(expr.right, outputs, variables);
      switch (expr.op) {
        case '+':
          if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
          return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '/': {
          const divisor = Number(right);
          if (divisor === 0) return 0;
          return Number(left) / divisor;
        }
      }
      break;
    }
    case 'unary': {
      const operand = evaluateExpr(expr.operand, outputs, variables);
      if (expr.op === '-') return -Number(operand);
      if (expr.op === '!') return !operand;
      return operand;
    }
    case 'group':
      return evaluateExpr(expr.inner, outputs, variables);
  }
}

export function evaluateCondition(
  condition: Condition,
  output: Record<string, unknown>,
  variables?: Map<string, unknown>,
): boolean {
  // Variable-first resolution for single-segment field_access
  let fieldValue: unknown;
  if (condition.left.kind === 'field_access' && condition.left.segments.length === 1) {
    const name = condition.left.segments[0];
    if (variables?.has(name)) {
      fieldValue = variables.get(name);
    } else {
      fieldValue = output[name];
    }
  } else {
    fieldValue = output[conditionFieldName(condition)];
  }

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
      } else if (evaluateCondition(branch.condition, output, ctx.variables)) {
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

      case 'let': {
        if (!ctx.variables) ctx.variables = new Map();
        const value = evaluateExpr(flowNode.value, ctx.outputs, ctx.variables);
        ctx.variables.set(flowNode.name, value);
        break;
      }

      case 'graph_call': {
        const graphDecl = ctx.getGraphDecl?.(flowNode.name);
        if (!graphDecl) {
          errors.push(`Graph '${flowNode.name}' not found`);
          break;
        }
        // Build child variable map from params
        const childVars = new Map<string, unknown>();
        const paramMap = new Map(graphDecl.params.map(p => [p.name, p]));
        for (const arg of flowNode.args) {
          const val = evaluateExpr(arg.value, ctx.outputs, ctx.variables);
          childVars.set(arg.name, val);
        }
        // Fill defaults for missing params
        for (const param of graphDecl.params) {
          if (!childVars.has(param.name) && param.default !== undefined) {
            childVars.set(param.name, param.default);
          }
        }
        // Execute child graph with its own variable scope
        const childCtx: FlowContext = {
          ...ctx,
          variables: childVars,
        };
        await executeFlowNodes(graphDecl.flow, nodeResults, errors, childCtx);
        break;
      }
    }
  }
}
