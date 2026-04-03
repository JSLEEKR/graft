import { FlowNode, Expr, GraphArg, GraphDecl, BUILTIN_FUNCTIONS } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export function checkVarCollision(
  name: string,
  graphName: string,
  location: SourceLocation,
  index: ProgramIndex,
  errors: GraftError[],
): void {
  if (index.nodeMap.has(name)) {
    errors.push(new GraftError(
      `Variable '${name}' in graph '${graphName}' collides with declared node '${name}'`,
      location, 'error', 'SCOPE_VAR_COLLISION',
    ));
  } else if (index.contextMap.has(name)) {
    errors.push(new GraftError(
      `Variable '${name}' in graph '${graphName}' collides with declared context '${name}'`,
      location, 'error', 'SCOPE_VAR_COLLISION',
    ));
  } else if (index.memoryMap.has(name)) {
    errors.push(new GraftError(
      `Variable '${name}' in graph '${graphName}' collides with declared memory '${name}'`,
      location, 'error', 'SCOPE_VAR_COLLISION',
    ));
  } else if (index.graphMap.has(name)) {
    errors.push(new GraftError(
      `Variable '${name}' in graph '${graphName}' collides with declared graph '${name}'`,
      location, 'error', 'SCOPE_VAR_COLLISION',
    ));
  }
}

export function checkExprSources(
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
        if (!declaredVars.has(first) && !seenNodes.has(first)) {
          errors.push(new GraftError(
            `Variable or node '${first}' referenced before declaration in graph '${graphName}'`,
            expr.location, 'error', 'SCOPE_VAR_ORDER',
          ));
        }
      } else {
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
      checkExprSources(expr.left, seenNodes, declaredVars, graphName, errors);
      checkExprSources(expr.right, seenNodes, declaredVars, graphName, errors);
      break;
    case 'unary':
      checkExprSources(expr.operand, seenNodes, declaredVars, graphName, errors);
      break;
    case 'group':
      checkExprSources(expr.inner, seenNodes, declaredVars, graphName, errors);
      break;
    case 'call':
      if (!(expr.name in BUILTIN_FUNCTIONS)) {
        errors.push(new GraftError(
          `Unknown function '${expr.name}' in graph '${graphName}'`,
          expr.location, 'error', 'SCOPE_UNKNOWN_FUNCTION',
        ));
      }
      for (const arg of expr.args) {
        checkExprSources(arg, seenNodes, declaredVars, graphName, errors);
      }
      break;
    case 'template':
      for (const part of expr.parts) {
        if (part.kind === 'expr') {
          checkExprSources(part.value, seenNodes, declaredVars, graphName, errors);
        }
      }
      break;
    case 'conditional':
      checkExprSources(expr.condition, seenNodes, declaredVars, graphName, errors);
      checkExprSources(expr.consequent, seenNodes, declaredVars, graphName, errors);
      checkExprSources(expr.alternate, seenNodes, declaredVars, graphName, errors);
      break;
    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unhandled expression kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

export function checkGraphCallArgs(
  args: GraphArg[],
  graphDecl: GraphDecl,
  seenNodes: Set<string>,
  declaredVars: Set<string>,
  graphName: string,
  location: SourceLocation,
  index: ProgramIndex,
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
    if (param.type === 'Node') {
      if (arg.value.kind !== 'field_access' || arg.value.segments.length !== 1) {
        errors.push(new GraftError(
          `Parameter '${arg.name}' of type Node requires a node name, not an expression`,
          arg.location, 'error', 'SCOPE_GRAPH_PARAM_TYPE',
        ));
      } else if (!index.nodeMap.has(arg.value.segments[0])) {
        errors.push(new GraftError(
          `Parameter '${arg.name}' references undeclared node '${arg.value.segments[0]}'`,
          arg.location, 'error', 'SCOPE_UNDEFINED_REF',
        ));
      }
    } else {
      checkExprSources(arg.value, seenNodes, declaredVars, graphName, errors);
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

  for (const param of graphDecl.params) {
    if (!providedNames.has(param.name) && param.default === undefined) {
      errors.push(new GraftError(
        `Missing required parameter '${param.name}' in call to graph '${graphDecl.name}'`,
        location, 'error', 'SCOPE_GRAPH_PARAM_MISSING',
      ));
    }
  }
}

export function checkGraphRecursion(
  graphs: { name: string; flow: FlowNode[]; location: SourceLocation }[],
  index: ProgramIndex,
  errors: GraftError[],
): void {
  const callGraph = new Map<string, Set<string>>();
  for (const graph of graphs) {
    const calls = new Set<string>();
    collectGraphCalls(graph.flow, calls);
    callGraph.set(graph.name, calls);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  for (const graphName of callGraph.keys()) {
    if (visited.has(graphName)) continue;
    dfsGraphCycles(graphName, callGraph, visited, inStack, index, errors);
  }
}

export function collectGraphCalls(nodes: FlowNode[], calls: Set<string>): void {
  for (const step of nodes) {
    if (step.kind === 'graph_call') {
      calls.add(step.name);
    } else if (step.kind === 'foreach') {
      collectGraphCalls(step.body, calls);
    }
  }
}

function dfsGraphCycles(
  current: string,
  callGraph: Map<string, Set<string>>,
  visited: Set<string>,
  inStack: Set<string>,
  index: ProgramIndex,
  errors: GraftError[],
): void {
  visited.add(current);
  inStack.add(current);

  const calls = callGraph.get(current);
  if (calls) {
    for (const callee of calls) {
      if (inStack.has(callee)) {
        const graph = index.graphMap.get(current);
        errors.push(new GraftError(
          `Recursive graph call detected: '${current}' calls '${callee}' which creates a cycle`,
          graph?.location ?? { line: 0, column: 0, offset: 0 },
          'error',
          'SCOPE_GRAPH_RECURSION',
        ));
      } else if (!visited.has(callee)) {
        dfsGraphCycles(callee, callGraph, visited, inStack, index, errors);
      }
    }
  }

  inStack.delete(current);
}

export function checkLiteralParamType(value: string | number | boolean, type: 'Node' | 'Int' | 'String' | 'Bool'): boolean {
  switch (type) {
    case 'Int': return typeof value === 'number';
    case 'String': return typeof value === 'string';
    case 'Bool': return typeof value === 'boolean';
    default: return false;
  }
}
