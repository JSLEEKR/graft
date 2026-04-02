import { Program, FlowNode, WriteRef, Expr, GraphArg, GraphDecl } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export class ScopeChecker {
  private program: Program;
  private nodeWritesMap: Map<string, WriteRef[]>; // node name -> writes targets
  private index: ProgramIndex;

  constructor(program: Program, index?: ProgramIndex) {
    this.program = program;
    this.index = index ?? new ProgramIndex(program);
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
    this.checkGraphRecursion(errors);
    this.checkFailureStrategies(errors);
    return errors;
  }

  private checkDuplicateNames(errors: GraftError[]): void {
    for (const mem of this.program.memories) {
      if (this.index.contextMap.has(mem.name)) {
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
        const isContext = this.index.contextMap.has(ref.context);
        const isProduces = this.index.producesFieldsMap.has(ref.context);
        const isMemory = this.index.memoryMap.has(ref.context);

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
        if (!this.index.memoryMap.has(writeRef.memory)) {
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
      if (!this.index.nodeMap.has(edge.source)) {
        errors.push(new GraftError(
          `Edge source '${edge.source}' is not a declared node`,
          edge.location,
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.index.nodeMap.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
            'error',
            'SCOPE_UNDEFINED_REF',
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (branch.target !== 'done' && !this.index.nodeMap.has(branch.target)) {
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
      if (!this.index.contextMap.has(graph.input)) {
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

      // Pre-populate seenNodes with Node-type graph params (they alias real nodes)
      const paramNodes = new Set<string>();
      for (const param of graph.params) {
        if (param.type === 'Node') {
          paramNodes.add(param.name);
        }
      }

      // Walk FlowNode tree with variable tracking
      this.walkFlowNodes(graph.flow, graph.location, errors, graph.name, undefined, paramNodes);
    }
  }

  private walkFlowNodes(
    nodes: FlowNode[],
    location: SourceLocation,
    errors: GraftError[],
    graphName: string,
    declaredVars?: Set<string>,
    seenNodes?: Set<string>,
  ): void {
    const vars = declaredVars ?? new Set<string>();
    const seen = seenNodes ?? new Set<string>();

    for (const step of nodes) {
      switch (step.kind) {
        case 'node':
          if (!this.index.nodeMap.has(step.name) && !seen.has(step.name)) {
            errors.push(new GraftError(
              `Node '${step.name}' in graph flow is not declared`,
              step.location ?? location,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          } else {
            seen.add(step.name);
          }
          break;
        case 'parallel':
          for (const branch of step.branches) {
            if (!this.index.nodeMap.has(branch)) {
              errors.push(new GraftError(
                `Node '${branch}' in parallel block is not declared`,
                step.location ?? location,
                'error',
                'SCOPE_UNDEFINED_REF',
              ));
            } else {
              seen.add(branch);
            }
          }
          this.checkParallelWrites(step.branches, step.location ?? location, errors);
          break;
        case 'foreach': {
          // Validate source node exists
          if (!this.index.nodeMap.has(step.source)) {
            errors.push(new GraftError(
              `Foreach source node '${step.source}' is not declared`,
              step.location ?? location,
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
                step.location ?? location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              'foreach max_iterations must be at least 1',
              step.location ?? location,
              'error',
              'SCOPE_INVALID_FOREACH',
            ));
          }
          // C-01: Foreach binding name collision detection
          const binding = step.binding;
          if (this.index.nodeMap.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared node '${binding}'`,
              step.location ?? location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.index.producesFieldsMap.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with produces declaration '${binding}'`,
              step.location ?? location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.index.contextMap.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared context '${binding}'`,
              step.location ?? location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          } else if (this.index.memoryMap.has(binding)) {
            errors.push(new GraftError(
              `Foreach binding '${binding}' collides with declared memory '${binding}'`,
              step.location ?? location,
              'warning',
              'SCOPE_BINDING_COLLISION',
            ));
          }
          // Clone vars for foreach body (body vars don't leak out)
          const bodyVars = new Set(vars);
          bodyVars.add(binding);
          this.walkFlowNodes(step.body, step.location ?? location, errors, graphName, bodyVars, seen);
          break;
        }
        case 'let': {
          const loc = step.location ?? location;
          // Variable-variable collision
          if (vars.has(step.name)) {
            errors.push(new GraftError(
              `Variable '${step.name}' is already declared in graph '${graphName}'`,
              loc,
              'error',
              'SCOPE_VAR_COLLISION',
            ));
          }
          // Variable vs top-level name collision
          this.checkVarCollision(step.name, graphName, loc, errors);
          // Variable order: validate expression sources are declared
          this.checkExprSources(step.value, seen, vars, graphName, errors);
          vars.add(step.name);
          break;
        }
        case 'graph_call': {
          const loc = step.location ?? location;
          const graphDecl = this.index.graphMap.get(step.name);
          if (!graphDecl) {
            errors.push(new GraftError(
              `Graph '${step.name}' in graph call is not declared`,
              loc,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          } else {
            this.checkGraphCallArgs(step.args, graphDecl, seen, vars, graphName, loc, errors);
          }
          break;
        }
      }
    }
  }

  private checkVarCollision(
    name: string,
    graphName: string,
    location: SourceLocation,
    errors: GraftError[],
  ): void {
    if (this.index.nodeMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared node '${name}'`,
        location, 'error', 'SCOPE_VAR_COLLISION',
      ));
    } else if (this.index.contextMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared context '${name}'`,
        location, 'error', 'SCOPE_VAR_COLLISION',
      ));
    } else if (this.index.memoryMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared memory '${name}'`,
        location, 'error', 'SCOPE_VAR_COLLISION',
      ));
    } else if (this.index.graphMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared graph '${name}'`,
        location, 'error', 'SCOPE_VAR_COLLISION',
      ));
    }
  }

  private checkExprSources(
    expr: Expr,
    seenNodes: Set<string>,
    declaredVars: Set<string>,
    graphName: string,
    errors: GraftError[],
  ): void {
    switch (expr.kind) {
      case 'literal':
        break;
      case 'field_access': {
        const first = expr.segments[0];
        if (expr.segments.length === 1) {
          // Single-segment: could be variable or node reference
          if (!declaredVars.has(first) && !seenNodes.has(first)) {
            errors.push(new GraftError(
              `Variable or node '${first}' referenced before declaration in graph '${graphName}'`,
              expr.location, 'error', 'SCOPE_VAR_ORDER',
            ));
          }
        } else {
          // Multi-segment: first segment must be a seen node or declared variable
          if (!seenNodes.has(first) && !declaredVars.has(first)) {
            errors.push(new GraftError(
              `Node '${first}' referenced before appearance in graph '${graphName}' flow`,
              expr.location, 'error', 'SCOPE_VAR_ORDER',
            ));
          }
        }
        break;
      }
      case 'binary':
        this.checkExprSources(expr.left, seenNodes, declaredVars, graphName, errors);
        this.checkExprSources(expr.right, seenNodes, declaredVars, graphName, errors);
        break;
      case 'unary':
        this.checkExprSources(expr.operand, seenNodes, declaredVars, graphName, errors);
        break;
      case 'group':
        this.checkExprSources(expr.inner, seenNodes, declaredVars, graphName, errors);
        break;
    }
  }

  private checkGraphCallArgs(
    args: GraphArg[],
    graphDecl: GraphDecl,
    seenNodes: Set<string>,
    declaredVars: Set<string>,
    graphName: string,
    location: SourceLocation,
    errors: GraftError[],
  ): void {
    const paramMap = new Map(graphDecl.params.map(p => [p.name, p]));
    const providedNames = new Set<string>();

    for (const arg of args) {
      providedNames.add(arg.name);
      const param = paramMap.get(arg.name);
      if (!param) {
        errors.push(new GraftError(
          `Unknown parameter '${arg.name}' in call to graph '${graphDecl.name}'`,
          arg.location, 'error', 'SCOPE_GRAPH_PARAM_TYPE',
        ));
        continue;
      }
      // Type-specific validation
      if (param.type === 'Node') {
        // Node params reference top-level declarations, skip flow-order check
        if (arg.value.kind !== 'field_access' || arg.value.segments.length !== 1) {
          errors.push(new GraftError(
            `Parameter '${arg.name}' of type Node requires a node name, not an expression`,
            arg.location, 'error', 'SCOPE_GRAPH_PARAM_TYPE',
          ));
        } else if (!this.index.nodeMap.has(arg.value.segments[0])) {
          errors.push(new GraftError(
            `Parameter '${arg.name}' references undeclared node '${arg.value.segments[0]}'`,
            arg.location, 'error', 'SCOPE_UNDEFINED_REF',
          ));
        }
      } else {
        // Non-Node params: validate expression sources are in scope
        this.checkExprSources(arg.value, seenNodes, declaredVars, graphName, errors);
        if (arg.value.kind === 'literal') {
          if (!checkLiteralParamType(arg.value.value, param.type)) {
            errors.push(new GraftError(
              `Parameter '${arg.name}' expects type ${param.type}, got ${typeof arg.value.value}`,
              arg.location, 'error', 'SCOPE_GRAPH_PARAM_TYPE',
            ));
          }
        }
      }
    }

    // Check for missing required params
    for (const param of graphDecl.params) {
      if (!providedNames.has(param.name) && param.default === undefined) {
        errors.push(new GraftError(
          `Missing required parameter '${param.name}' in call to graph '${graphDecl.name}'`,
          location, 'error', 'SCOPE_GRAPH_PARAM_MISSING',
        ));
      }
    }
  }

  private checkGraphRecursion(errors: GraftError[]): void {
    const callGraph = new Map<string, Set<string>>();
    for (const graph of this.program.graphs) {
      const calls = new Set<string>();
      this.collectGraphCalls(graph.flow, calls);
      callGraph.set(graph.name, calls);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();

    for (const graphName of callGraph.keys()) {
      if (visited.has(graphName)) continue;
      this.dfsGraphCycles(graphName, callGraph, visited, inStack, errors);
    }
  }

  private collectGraphCalls(nodes: FlowNode[], calls: Set<string>): void {
    for (const step of nodes) {
      if (step.kind === 'graph_call') {
        calls.add(step.name);
      } else if (step.kind === 'foreach') {
        this.collectGraphCalls(step.body, calls);
      }
    }
  }

  private dfsGraphCycles(
    current: string,
    callGraph: Map<string, Set<string>>,
    visited: Set<string>,
    inStack: Set<string>,
    errors: GraftError[],
  ): void {
    visited.add(current);
    inStack.add(current);

    const calls = callGraph.get(current);
    if (calls) {
      for (const callee of calls) {
        if (inStack.has(callee)) {
          const graph = this.index.graphMap.get(current);
          errors.push(new GraftError(
            `Recursive graph call detected: '${current}' calls '${callee}' which creates a cycle`,
            graph?.location ?? { line: 0, column: 0, offset: 0 },
            'error',
            'SCOPE_GRAPH_RECURSION',
          ));
        } else if (!visited.has(callee)) {
          this.dfsGraphCycles(callee, callGraph, visited, inStack, errors);
        }
      }
    }

    inStack.delete(current);
  }

  private checkFailureStrategies(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      if (!node.onFailure) continue;
      const strategy = node.onFailure;
      if (strategy.type === 'fallback' || strategy.type === 'retry_then_fallback') {
        if (!this.index.nodeMap.has(strategy.node)) {
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

function checkLiteralParamType(value: string | number | boolean, type: 'Node' | 'Int' | 'String' | 'Bool'): boolean {
  switch (type) {
    case 'Int': return typeof value === 'number';
    case 'String': return typeof value === 'string';
    case 'Bool': return typeof value === 'boolean';
    default: return false;
  }
}
