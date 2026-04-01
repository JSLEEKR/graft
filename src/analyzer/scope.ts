import { Program, FlowNode, WriteRef } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private memoryNames: Set<string>;
  private nodeWritesMap: Map<string, WriteRef[]>; // node name -> writes targets
  private index: ProgramIndex;

  constructor(program: Program, index?: ProgramIndex) {
    this.program = program;
    this.index = index ?? new ProgramIndex(program);
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.memoryNames = new Set(program.memories.map(m => m.name));
    this.nodeWritesMap = new Map();

    for (const node of program.nodes) {
      this.nodeWritesMap.set(node.name, node.writes);
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkDuplicateNames(errors);
    this.checkMaxTokens(errors);
    this.checkNodeReads(errors);
    this.checkNodeWrites(errors);
    this.checkEdges(errors);
    this.checkMultipleGraphs(errors);
    this.checkGraphFlow(errors);
    this.checkFailureStrategies(errors);
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
      if (this.index.producesFieldsMap.has(mem.name)) {
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
        const isProduces = this.index.producesFieldsMap.has(ref.context);
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

        // Check partial reference fields
        if (ref.field) {
          if (isContext) {
            const ctx = this.index.contextMap.get(ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            for (const f of ref.field) {
              if (!fieldNames.has(f)) {
                errors.push(new GraftError(
                  `Field '${f}' does not exist in context '${ref.context}'`,
                  ref.location,
                  'error',
                  'SCOPE_FIELD_NOT_FOUND',
                ));
              }
            }
          } else if (isProduces) {
            const fields = this.index.producesFieldsMap.get(ref.context)!;
            for (const f of ref.field) {
              if (!fields.has(f)) {
                errors.push(new GraftError(
                  `Field '${f}' does not exist in produces '${ref.context}'`,
                  ref.location,
                  'error',
                  'SCOPE_FIELD_NOT_FOUND',
                ));
              }
            }
          } else if (isMemory) {
            const fields = this.index.memoryFieldsMap.get(ref.context)!;
            for (const f of ref.field) {
              if (!fields.has(f)) {
                errors.push(new GraftError(
                  `Field '${f}' does not exist in memory '${ref.context}'`,
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
  }

  private checkNodeWrites(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const writeRef of node.writes) {
        if (!this.memoryNames.has(writeRef.memory)) {
          errors.push(new GraftError(
            `writes target '${writeRef.memory}' is not a declared memory`,
            writeRef.location,
            'error',
            'SCOPE_INVALID_WRITES',
          ));
        } else if (writeRef.field) {
          const fields = this.index.memoryFieldsMap.get(writeRef.memory)!;
          if (!fields.has(writeRef.field)) {
            errors.push(new GraftError(
              `Field '${writeRef.field}' does not exist in memory '${writeRef.memory}'`,
              writeRef.location,
              'error',
              'SCOPE_FIELD_NOT_FOUND',
            ));
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

      // C-02: Warn on transforms applied to conditional edges
      if (edge.target.kind === 'conditional' && edge.transforms.length > 0) {
        errors.push(new GraftError(
          `Transforms on conditional edge from '${edge.source}' may not be applied at runtime`,
          edge.location,
          'warning',
          'SCOPE_TRANSFORM_CONDITIONAL',
        ));
      }
    }
  }

  private checkMultipleGraphs(errors: GraftError[]): void {
    if (this.program.graphs.length > 1) {
      errors.push(new GraftError(
        `Multiple graphs declared; only the first graph '${this.program.graphs[0].name}' will be executed`,
        this.program.graphs[1].location,
        'warning',
        'GRAPH_MULTIPLE',
      ));
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
      if (!this.index.producesFieldsMap.has(graph.output)) {
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
          // C-01: Foreach binding name collision detection
          const binding = step.binding;
          if (this.nodeNames.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared node '${binding}'`,
              location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.index.producesFieldsMap.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with produces declaration '${binding}'`,
              location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.contextNames.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared context '${binding}'`,
              location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.memoryNames.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared memory '${binding}'`,
              location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          }
          // Recurse into body
          this.walkFlowNodes(step.body, location, errors);
          break;
        }
      }
    }
  }

  private checkFailureStrategies(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      if (!node.onFailure) continue;
      const strategy = node.onFailure;
      if (strategy.type === 'fallback' || strategy.type === 'retry_then_fallback') {
        if (!this.nodeNames.has(strategy.node)) {
          errors.push(new GraftError(
            `Fallback node '${strategy.node}' in '${node.name}' on_failure is not a declared node`,
            node.location,
            'error',
            'SCOPE_INVALID_FALLBACK',
          ));
        }
      }
    }
    this.checkFallbackCycles(errors);
  }

  private checkFallbackCycles(errors: GraftError[]): void {
    // Build directed graph: node name -> fallback target
    const fallbackEdges = new Map<string, string>();
    const nodeLocationMap = new Map<string, SourceLocation>();

    for (const node of this.program.nodes) {
      nodeLocationMap.set(node.name, node.location);
      if (!node.onFailure) continue;
      const strategy = node.onFailure;
      if (strategy.type === 'fallback' || strategy.type === 'retry_then_fallback') {
        fallbackEdges.set(node.name, strategy.node);
      }
    }

    // DFS cycle detection with visited + in-stack
    const visited = new Set<string>();
    const inStack = new Set<string>();

    for (const start of fallbackEdges.keys()) {
      if (visited.has(start)) continue;
      const stack: string[] = [start];

      while (stack.length > 0) {
        const current = stack[stack.length - 1];

        if (!inStack.has(current)) {
          // First visit: mark in-stack
          inStack.add(current);
          visited.add(current);

          const target = fallbackEdges.get(current);
          if (target) {
            if (inStack.has(target)) {
              // Cycle detected
              errors.push(new GraftError(
                `Fallback cycle detected: '${current}' falls back to '${target}' which creates a cycle`,
                nodeLocationMap.get(current)!,
                'error',
                'SCOPE_FALLBACK_CYCLE',
              ));
            } else if (!visited.has(target)) {
              stack.push(target);
              continue;
            }
          }
        }

        // Backtrack
        stack.pop();
        inStack.delete(current);
      }
    }
  }

  private checkParallelWrites(branches: string[], location: SourceLocation, errors: GraftError[]): void {
    const memoryWriters = new Map<string, string[]>();

    for (const branch of branches) {
      const writes = this.nodeWritesMap.get(branch);
      if (!writes) continue;
      for (const writeRef of writes) {
        const memName = writeRef.memory;
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
