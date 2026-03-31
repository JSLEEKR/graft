import { Program, FlowNode } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // produces name -> field names

  constructor(program: Program) {
    this.program = program;
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.producesMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesMap.set(node.produces.name, fieldNames);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkNodeReads(errors);
    this.checkEdges(errors);
    this.checkGraphFlow(errors);
    return errors;
  }

  private checkNodeReads(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const ref of node.reads) {
        // ref.context could be a context name or a produces name
        const isContext = this.contextNames.has(ref.context);
        const isProduces = this.producesMap.has(ref.context);

        if (!isContext && !isProduces) {
          errors.push(new GraftError(
            `'${ref.context}' is not declared as a context or produces output`,
            ref.location,
          ));
          continue;
        }

        // Check partial reference field
        if (ref.field) {
          if (isContext) {
            const ctx = this.program.contexts.find(c => c.name === ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            if (!fieldNames.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in context '${ref.context}'`,
                ref.location,
              ));
            }
          } else if (isProduces) {
            const fields = this.producesMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in produces '${ref.context}'`,
                ref.location,
              ));
            }
          }
        }
      }
    }
  }

  private checkEdges(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      if (!this.nodeNames.has(edge.source)) {
        errors.push(new GraftError(
          `Edge source '${edge.source}' is not a declared node`,
          edge.location,
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.nodeNames.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (!this.nodeNames.has(branch.target)) {
            errors.push(new GraftError(
              `Edge target '${branch.target}' is not a declared node`,
              edge.location,
            ));
          }
        }
      }
    }
  }

  private checkGraphFlow(errors: GraftError[]): void {
    for (const graph of this.program.graphs) {
      // Validate graph input references a declared context
      if (!this.contextNames.has(graph.input)) {
        errors.push(new GraftError(
          `Graph input '${graph.input}' is not a declared context`,
          graph.location,
        ));
      }

      // Validate graph output references a declared produces type
      if (!this.producesMap.has(graph.output)) {
        errors.push(new GraftError(
          `Graph output '${graph.output}' is not a declared produces type`,
          graph.location,
        ));
      }

      // Walk FlowNode tree
      this.walkFlowNodes(graph.flow, graph.location, errors);
    }
  }

  private walkFlowNodes(nodes: FlowNode[], location: SourceLocation, errors: GraftError[]): void {
    for (const step of nodes) {
      switch (step.kind) {
        case 'node':
          if (!this.nodeNames.has(step.name)) {
            errors.push(new GraftError(
              `Node '${step.name}' in graph flow is not declared`,
              location,
            ));
          }
          break;
        case 'parallel':
          for (const branch of step.branches) {
            if (!this.nodeNames.has(branch)) {
              errors.push(new GraftError(
                `Node '${branch}' in parallel block is not declared`,
                location,
              ));
            }
          }
          break;
        case 'foreach': {
          // Validate source node exists
          if (!this.nodeNames.has(step.source)) {
            errors.push(new GraftError(
              `Foreach source node '${step.source}' is not declared`,
              location,
            ));
          }
          // Validate source node produces the referenced field
          const sourceNode = this.program.nodes.find(n => n.name === step.source);
          if (sourceNode) {
            const fieldNames = new Set(sourceNode.produces.fields.map(f => f.name));
            if (!fieldNames.has(step.field)) {
              errors.push(new GraftError(
                `Field '${step.field}' does not exist in '${step.source}' produces output`,
                location,
              ));
            }
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              'foreach max_iterations must be at least 1',
              location,
            ));
          }
          // Recurse into body
          this.walkFlowNodes(step.body, location, errors);
          break;
        }
      }
    }
  }
}
