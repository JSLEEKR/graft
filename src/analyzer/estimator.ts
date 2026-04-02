import { Program, NodeDecl, EdgeDecl, Transform, FlowNode, ConditionalBranch } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';
import { PARTIAL_FIELD_FACTOR, MAX_CONDITIONAL_HOPS } from '../constants.js';
import { ProgramIndex } from '../program-index.js';

export interface NodeTokenReport {
  name: string;
  estimatedIn: number;
  estimatedOut: number;
}

export interface TokenReport {
  graphName: string;
  budget: number;
  bestCase: number;
  worstCase: number;
  nodes: NodeTokenReport[];
  warnings: GraftError[];
}

export class TokenEstimator {
  private program: Program;
  private index: ProgramIndex;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl>; // "source->target" key
  private conditionalEdges: Map<string, ConditionalBranch[]>; // source -> branches

  constructor(program: Program, index?: ProgramIndex) {
    this.program = program;
    this.index = index ?? new ProgramIndex(program);
    this.nodeMap = this.index.nodeMap;
    this.edgeMap = new Map();
    this.conditionalEdges = new Map();

    for (const edge of program.edges) {
      if (edge.target.kind === 'direct') {
        this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
      } else {
        this.conditionalEdges.set(
          edge.source,
          edge.target.branches,
        );
      }
    }
  }

  estimate(): TokenReport {
    const graph = this.program.graphs[0]; // v1: single graph
    if (!graph) {
      return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
    }

    const warnings: GraftError[] = [];
    const nodeReports: NodeTokenReport[] = [];

    // Populate node reports (for display)
    this.collectNodeReports(graph.flow, nodeReports, warnings);

    // Compute best/worst case costs
    const { best, worst } = this.computeFlowCosts(graph.flow, warnings);
    const bestCase = best;
    const worstCase = worst;

    if (worstCase > graph.budget) {
      warnings.push(new GraftError(
        `Worst-case token usage (${worstCase}) exceeds budget (${graph.budget})`,
        graph.location,
        'warning',
        'BUDGET_EXCEEDED',
      ));
    }

    return {
      graphName: graph.name,
      budget: graph.budget,
      bestCase,
      worstCase,
      nodes: nodeReports,
      warnings,
    };
  }

  private collectNodeReports(steps: FlowNode[], reports: NodeTokenReport[], warnings: GraftError[]): void {
    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const estimatedIn = this.getEstimatedIn(step.name, node);
          if (estimatedIn > node.budgetIn) {
            warnings.push(new GraftError(
              `Node '${step.name}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
              node.location,
              'warning',
              'BUDGET_NODE_EXCEEDED',
            ));
          }
          reports.push({ name: step.name, estimatedIn, estimatedOut: node.budgetOut });
          break;
        }
        case 'parallel':
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const estimatedIn = this.getEstimatedIn(branchName, node);
            if (estimatedIn > node.budgetIn) {
              warnings.push(new GraftError(
                `Node '${branchName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
                node.location,
                'warning',
                'BUDGET_NODE_EXCEEDED',
              ));
            }
            reports.push({ name: branchName, estimatedIn, estimatedOut: node.budgetOut });
          }
          break;
        case 'foreach':
          this.collectNodeReports(step.body, reports, warnings);
          break;
        case 'let':
          // Let bindings have no token cost
          break;
        case 'graph_call': {
          // Recurse into called graph's flow for node reports
          const calledGraph = this.index.graphMap.get(step.name);
          if (calledGraph) {
            this.collectNodeReports(calledGraph.flow, reports, warnings);
          }
          break;
        }
      }
    }
  }

  private computeFlowCosts(steps: FlowNode[], warnings: GraftError[]): { best: number; worst: number } {
    let best = 0;
    let worst = 0;

    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const cost = this.getNodeCost(step.name, node);
          const retryMul = this.getRetryMultiplier(node);
          best += cost;
          worst += cost * retryMul + this.getFallbackCost(node);
          // Add conditional edge branch costs (multi-hop recursive)
          const branchCosts = this.getConditionalBranchCosts(
            step.name, warnings, new Set([step.name]), 0,
          );
          best += branchCosts.best;
          worst += branchCosts.worst;
          break;
        }
        case 'parallel': {
          // Parallel: all branches run. Total tokens = sum of all branches.
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const cost = this.getNodeCost(branchName, node);
            const retryMul = this.getRetryMultiplier(node);
            best += cost;
            worst += cost * retryMul + this.getFallbackCost(node);
          }
          break;
        }
        case 'foreach': {
          // Foreach: body runs up to maxIterations times.
          // Best case = 1 iteration. Worst case = maxIterations iterations.
          const bodyCosts = this.computeFlowCosts(step.body, warnings);
          best += bodyCosts.best * 1;
          worst += bodyCosts.worst * step.maxIterations;
          break;
        }
        case 'let':
          // Let bindings have zero token cost
          break;
        case 'graph_call': {
          // Graph call cost = called graph's flow cost
          const calledGraph = this.index.graphMap.get(step.name);
          if (calledGraph) {
            const subCosts = this.computeFlowCosts(calledGraph.flow, warnings);
            best += subCosts.best;
            worst += subCosts.worst;
          }
          break;
        }
      }
    }

    return { best, worst };
  }

  private getConditionalBranchCosts(
    source: string,
    warnings: GraftError[],
    visited: Set<string>,
    depth: number,
  ): { best: number; worst: number } {
    const branches = this.conditionalEdges.get(source);
    if (!branches) return { best: 0, worst: 0 };

    if (depth >= MAX_CONDITIONAL_HOPS) {
      warnings.push(new GraftError(
        `Conditional chain from '${source}' exceeded maximum depth of ${MAX_CONDITIONAL_HOPS}`,
        { line: 0, column: 0, offset: 0 },
        'warning',
        'BUDGET_CHAIN_DEPTH',
      ));
      return { best: 0, worst: 0 };
    }

    const branchBestCosts: number[] = [];
    const branchWorstCosts: number[] = [];

    for (const branch of branches) {
      if (branch.target === 'done') {
        branchBestCosts.push(0);
        branchWorstCosts.push(0);
        continue;
      }

      if (visited.has(branch.target)) {
        // Cycle detected
        warnings.push(new GraftError(
          `Conditional estimation cycle detected: ${[...visited, branch.target].join(' -> ')}`,
          { line: 0, column: 0, offset: 0 },
          'warning',
          'BUDGET_CHAIN_CYCLE',
        ));
        branchBestCosts.push(0);
        branchWorstCosts.push(0);
        continue;
      }

      const node = this.nodeMap.get(branch.target);
      if (!node) continue; // unknown target, skip

      const cost = this.getNodeCost(branch.target, node);
      const retryMul = this.getRetryMultiplier(node);

      // Per-branch visited set copy (handles diamonds correctly)
      const branchVisited = new Set(visited);
      branchVisited.add(branch.target);

      const chainCosts = this.getConditionalBranchCosts(
        branch.target, warnings, branchVisited, depth + 1,
      );

      branchBestCosts.push(cost + chainCosts.best);
      branchWorstCosts.push(cost * retryMul + chainCosts.worst);
    }

    if (branchBestCosts.length === 0) return { best: 0, worst: 0 };
    return { best: Math.min(...branchBestCosts), worst: Math.max(...branchWorstCosts) };
  }

  private getNodeCost(nodeName: string, node: NodeDecl): number {
    return this.getEstimatedIn(nodeName, node) + node.budgetOut;
  }

  private getEstimatedIn(nodeName: string, node: NodeDecl): number {
    let estimatedIn = 0;
    for (const ref of node.reads) {
      // If reading a context
      const ctx = this.index.contextMap.get(ref.context);
      if (ctx) {
        estimatedIn += ref.field ? Math.floor(ctx.maxTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1.0)) : ctx.maxTokens;
        continue;
      }
      // If reading a memory
      const mem = this.index.memoryMap.get(ref.context);
      if (mem) {
        estimatedIn += ref.field ? Math.floor(mem.maxTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1.0)) : mem.maxTokens;
        continue;
      }
      // If reading a produces output from upstream node
      const sourceNode = this.index.producesNodeMap.get(ref.context);
      if (sourceNode) {
        let upstreamTokens = sourceNode.budgetOut;
        // Check for edge transform reductions
        const edgeKey = `${sourceNode.name}->${nodeName}`;
        const edge = this.edgeMap.get(edgeKey);
        if (edge) {
          upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
        }
        estimatedIn += ref.field ? Math.floor(upstreamTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1.0)) : upstreamTokens;
      }
    }
    return estimatedIn;
  }

  private applyTransformReductions(tokens: number, transforms: Transform[]): number {
    let result = tokens;
    for (const t of transforms) {
      switch (t.type) {
        case 'select':
          result = Math.floor(result * Math.min(PARTIAL_FIELD_FACTOR * t.fields.length, 1.0));
          break;
        case 'filter':
          result = Math.floor(result * 0.5); // filter reduces ~50%
          break;
        case 'drop':
          result = Math.floor(result * 0.85); // drop one field ~15% savings
          break;
        case 'compact':
          result = Math.floor(result * 0.7); // compact ~30% reduction
          break;
        case 'truncate':
          result = Math.min(result, t.tokens);
          break;
      }
    }
    return result;
  }

  private getRetryMultiplier(node: NodeDecl): number {
    if (!node.onFailure) return 1;
    switch (node.onFailure.type) {
      case 'retry':
        return 1 + node.onFailure.max;
      case 'retry_then_fallback':
        return 1 + node.onFailure.max;
      default:
        return 1;
    }
  }

  private getFallbackCost(node: NodeDecl): number {
    if (!node.onFailure || node.onFailure.type !== 'retry_then_fallback') return 0;
    const fallbackNode = this.nodeMap.get(node.onFailure.node);
    if (!fallbackNode) return 0;
    return this.getNodeCost(node.onFailure.node, fallbackNode);
  }
}
