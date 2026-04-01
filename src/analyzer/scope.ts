import { Program, FlowNode } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // produces name -> field names
  private memoryNames: Set<string>;
  private memoryFieldsMap: Map<string, Set<string>>;
  private nodeWritesMap: Map<string, string[]>; // node name -> writes targets
  private index: ProgramIndex;

  constructor(program: Program) {
    this.program = program;
    this.index = new ProgramIndex(program);
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.producesMap = new Map();
    this.memoryNames = new Set(program.memories.map(m => m.name));
    this.memoryFieldsMap = new Map();
    this.nodeWritesMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesMap.set(node.produces.name, fieldNames);
      this.nodeWritesMap.set(node.name, node.writes);
    }
    for (const mem of program.memories) {
      this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkDuplicateNames(errors);
    this.checkMaxTokens(errors);
    this.checkNodeReads(errors);
    this.checkNodeWrites(errors);
    this.checkEdges(errors);
    this.checkGraphFlow(errors);
    return errors;
  }

  private checkDuplicateNames(errors: GraftError[]): void {
    for (const mem of this.program.memories) {
      if (this.contextNames.has(mem.name)) {
        errors.push(new GraftError(
          `Name '${mem.name}' is declared as both a context and a memory`,
          mem.location,
          'error',
          'SCOPE_DUPLICATE_NAME',
        ));
      }
      if (this.producesMap.has(mem.name)) {
        errors.push(new GraftError(
          `Name '${mem.name}' conflicts with a produces declaration`,
          mem.location,
          'error',
          'SCOPE_DUPLICATE_NAME',
        ));
      }
    }
  }

  private checkMaxTokens(errors: GraftError[]): void {
    for (const ctx of this.program.contexts) {
      if (ctx.maxTokens <= 0) {
        errors.push(new GraftError(
          `Context '${ctx.name}' has invalid max_tokens: ${ctx.maxTokens} (must be > 0)`,
          ctx.location,
          'error',
          'SCOPE_MAX_TOKENS_INVALID',
        ));
      }
    }
    for (const mem of this.program.memories) {
      if (mem.maxTokens <= 0) {
        errors.push(new GraftError(
          `Memory '${mem.name}' has invalid max_tokens: ${mem.maxTokens} (must be > 0)`,
          mem.location,
          'error',
          'SCOPE_MAX_TOKENS_INVALID',
        ));
      }
    }
  }

  private checkNodeReads(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const ref of node.reads) {
        // ref.context could be a context name, produces name, or memory name
        const isContext = this.contextNames.has(ref.context);
        const isProduces = this.producesMap.has(ref.context);
        const isMemory = this.memoryNames.has(ref.context);

        if (!isContext && !isProduces && !isMemory) {
          errors.push(new GraftError(
            `'${ref.context}' is not declared as a context, produces output, or memory`,
            ref.location,
            'error',
            'SCOPE_UNDEFINED_REF',
          ));
          continue;
        }

        // Check partial reference field
        if (ref.field) {
          if (isContext) {
            const ctx = this.index.contextMap.get(ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            if (!fieldNames.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in context '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          } else if (isProduces) {
            const fields = this.producesMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in produces '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          } else if (isMemory) {
            const fields = this.memoryFieldsMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in memory '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          }
        }
      }
    }
  }

  private checkNodeWrites(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const writeName of node.writes) {
        if (!this.memoryNames.has(writeName)) {
          errors.push(new GraftError(
            `writes target '${writeName}' is not a declared memory`,
            node.location,
            'error',
            'SCOPE_INVALID_WRITES',
          ));
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
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.nodeNames.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
            'error',
            'SCOPE_UNDEFINED_REF',
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (!this.nodeNames.has(branch.target)) {
            errors.push(new GraftError(
              `Edge target '${branch.target}' is not a declared node`,
              edge.location,
              'error',
              'SCOPE_UNDEFINED_REF',
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
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      // Validate graph output references a declared produces type
      if (!this.producesMap.has(graph.output)) {
        errors.push(new GraftError(
          `Graph output '${graph.output}' is not a declared produces type`,
          graph.location,
          'error',
          'SCOPE_UNDEFINED_REF',
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
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          }
          break;
        case 'parallel':
          for (const branch of step.branches) {
            if (!this.nodeNames.has(branch)) {
              errors.push(new GraftError(
                `Node '${branch}' in parallel block is not declared`,
                location,
                'error',
                'SCOPE_UNDEFINED_REF',
              ));
            }
          }
          this.checkParallelWrites(step.branches, location, errors);
          break;
        case 'foreach': {
          // Validate source node exists
          if (!this.nodeNames.has(step.source)) {
            errors.push(new GraftError(
              `Foreach source node '${step.source}' is not declared`,
              location,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          }
          // Validate source node produces the referenced field
          const sourceNode = this.index.nodeMap.get(step.source);
          if (sourceNode) {
            const fieldNames = new Set(sourceNode.produces.fields.map(f => f.name));
            if (!fieldNames.has(step.field)) {
              errors.push(new GraftError(
                `Field '${step.field}' does not exist in '${step.source}' produces output`,
                location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              'foreach max_iterations must be at least 1',
              location,
              'error',
              'SCOPE_INVALID_FOREACH',
            ));
          }
          // Recurse into body
          this.walkFlowNodes(step.body, location, errors);
          break;
        }
      }
    }
  }

  private checkParallelWrites(branches: string[], location: SourceLocation, errors: GraftError[]): void {
    const memoryWriters = new Map<string, string[]>();

    for (const branch of branches) {
      const writes = this.nodeWritesMap.get(branch);
      if (!writes) continue;
      for (const memName of writes) {
        const writers = memoryWriters.get(memName);
        if (writers) {
          writers.push(branch);
        } else {
          memoryWriters.set(memName, [branch]);
        }
      }
    }

    for (const [memName, writers] of memoryWriters) {
      if (writers.length > 1) {
        errors.push(new GraftError(
          `Nodes ${writers.map(w => `'${w}'`).join(' and ')} both write to memory '${memName}' in parallel`,
          location,
          'warning',
          'SCOPE_PARALLEL_WRITES',
        ));
      }
    }
  }
}
