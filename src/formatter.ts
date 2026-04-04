/**
 * Graft AST pretty-printer — formats a Program back to .gft source.
 */
import {
  Program, ContextDecl, NodeDecl, EdgeDecl, GraphDecl, MemoryDecl, ImportDecl,
  Field, TypeExpr, Transform, FlowNode, ContextRef, FailureStrategy,
} from './parser/ast.js';
import { formatExpr } from './format.js';

export function formatProgram(program: Program): string {
  const sections: string[] = [];

  // Imports
  for (const imp of program.imports) {
    sections.push(formatImport(imp));
  }

  // Memories
  for (const mem of program.memories) {
    sections.push(formatMemory(mem));
  }

  // Contexts
  for (const ctx of program.contexts) {
    if (!ctx.sourceFile || ctx.sourceFile === program.contexts[0]?.sourceFile) {
      sections.push(formatContext(ctx));
    }
  }

  // Nodes
  for (const node of program.nodes) {
    if (!node.sourceFile || node.sourceFile === program.nodes[0]?.sourceFile) {
      sections.push(formatNode(node));
    }
  }

  // Edges
  for (const edge of program.edges) {
    sections.push(formatEdge(edge));
  }

  // Graphs
  for (const graph of program.graphs) {
    sections.push(formatGraph(graph));
  }

  return sections.join('\n\n') + '\n';
}

function formatImport(imp: ImportDecl): string {
  return `import { ${imp.names.join(', ')} } from "${imp.path}"`;
}

function formatMemory(mem: MemoryDecl): string {
  const fields = mem.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
  return `memory ${mem.name}(max_tokens: ${formatTokens(mem.maxTokens)}, storage: ${mem.storage}) {\n${fields}\n}`;
}

function formatContext(ctx: ContextDecl): string {
  const fields = ctx.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
  return `context ${ctx.name}(max_tokens: ${formatTokens(ctx.maxTokens)}) {\n${fields}\n}`;
}

function formatNode(node: NodeDecl): string {
  const lines: string[] = [];
  lines.push(`node ${node.name}(model: ${node.model}, budget: ${formatTokens(node.budgetIn)}/${formatTokens(node.budgetOut)}) {`);

  // reads
  if (node.reads.length > 0) {
    lines.push(`  reads: [${node.reads.map(formatContextRef).join(', ')}]`);
  }

  // tools
  if (node.tools.length > 0) {
    lines.push(`  tools: [${node.tools.join(', ')}]`);
  }

  // writes
  if (node.writes.length > 0) {
    lines.push(`  writes: [${node.writes.map(w => w.field ? `${w.memory}.${w.field}` : w.memory).join(', ')}]`);
  }

  // on_failure
  if (node.onFailure) {
    lines.push(`  on_failure: ${formatFailure(node.onFailure)}`);
  }

  // produces
  lines.push('');
  const producesFields = node.produces.fields.map(f => `    ${f.name}: ${formatType(f.type)}`).join('\n');
  lines.push(`  produces ${node.produces.name} {`);
  lines.push(producesFields);
  lines.push(`  }`);

  lines.push('}');
  return lines.join('\n');
}

function formatEdge(edge: EdgeDecl): string {
  if (edge.target.kind === 'conditional') {
    const branches = edge.target.branches.map(b => {
      if (b.condition) {
        return `  when ${formatExpr(b.condition)} -> ${b.target}`;
      }
      return `  else -> ${b.target}`;
    }).join('\n');
    return `edge ${edge.source} -> {\n${branches}\n}`;
  }

  let line = `edge ${edge.source} -> ${edge.target.node}`;
  if (edge.transforms.length > 0) {
    line += '\n  | ' + edge.transforms.map(formatTransform).join('\n  | ');
  }
  return line;
}

function formatGraph(graph: GraphDecl): string {
  const params = graph.params.length > 0
    ? `, ${graph.params.map(p => `${p.name}: ${p.type}${p.default !== undefined ? ` = ${p.default}` : ''}`).join(', ')}`
    : '';
  const flowStr = formatFlow(graph.flow, 2);
  return `graph ${graph.name}(input: ${graph.input}, output: ${graph.output}, budget: ${formatTokens(graph.budget)}${params}) {\n${flowStr}\n}`;
}

function formatFlow(flow: FlowNode[], indent: number): string {
  const pad = ' '.repeat(indent);
  const parts: string[] = [];

  for (const step of flow) {
    switch (step.kind) {
      case 'node':
        parts.push(step.name);
        break;
      case 'parallel':
        parts.push(`parallel { ${step.branches.join('  ')} }`);
        break;
      case 'foreach': {
        const body = formatFlow(step.body, indent + 2);
        parts.push(`foreach ${step.source}.${step.field} as ${step.binding} (max: ${step.maxIterations}) {\n${body}\n${pad}}`);
        break;
      }
      case 'let':
        parts.push(`let ${step.name} = ${formatExpr(step.value)}`);
        break;
      case 'graph_call':
        parts.push(`${step.name}(${step.args.map(a => `${a.name}: ${formatExpr(a.value)}`).join(', ')})`);
        break;
    }
  }

  // Join with -> for sequential steps, but done is implicit
  return pad + parts.join('\n' + pad + '-> ') + '\n' + pad + '-> done';
}

function formatTransform(t: Transform): string {
  switch (t.type) {
    case 'select': return `select(${t.fields.join(', ')})`;
    case 'drop': return `drop(${t.field})`;
    case 'compact': return 'compact';
    case 'truncate': return `truncate(${t.tokens})`;
    case 'filter': return `filter(${t.field}, ${formatExpr(t.condition)})`;
  }
}

function formatContextRef(ref: ContextRef): string {
  if (ref.field && ref.field.length === 1) {
    return `${ref.context}.${ref.field[0]}`;
  }
  if (ref.field && ref.field.length > 1) {
    return `${ref.context}.{${ref.field.join(', ')}}`;
  }
  return ref.context;
}

function formatFailure(f: FailureStrategy): string {
  switch (f.type) {
    case 'retry': return `retry(${f.max})`;
    case 'fallback': return `fallback(${f.node})`;
    case 'retry_then_fallback': return `retry(${f.max}, fallback: ${f.node})`;
    case 'skip': return 'skip';
    case 'abort': return 'abort';
  }
}

function formatType(t: TypeExpr): string {
  switch (t.kind) {
    case 'primitive': return t.name;
    case 'primitive_range': return `${t.name}(${t.min}..${t.max})`;
    case 'list': return `List<${formatType(t.element)}>`;
    case 'map': return `Map<${formatType(t.key)}, ${formatType(t.value)}>`;
    case 'optional': return `Optional<${formatType(t.inner)}>`;
    case 'token_bounded': return `TokenBounded<${formatType(t.inner)}, ${t.max}>`;
    case 'enum': return `enum(${t.values.join(', ')})`;
    case 'struct': {
      const fields = t.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ');
      return `${t.name} { ${fields} }`;
    }
    case 'domain': return t.name;
  }
}

function formatTokens(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}
