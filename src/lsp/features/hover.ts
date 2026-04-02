import type { Hover } from 'vscode-languageserver/node';
import { MarkupKind } from 'vscode-languageserver/node';
import { type TypeExpr, BUILTIN_FUNCTIONS } from '../../parser/ast.js';
import type { ProgramIndex } from '../../program-index.js';

export const KEYWORD_DOCS: Record<string, string> = {
  context: 'Declares a context schema with typed fields and a max_tokens budget.\n\n```graft\ncontext Name(max_tokens: 1k) {\n  field: Type\n}\n```',
  node: 'Declares a processing node with model, budget, reads, writes, and produces.\n\n```graft\nnode Name(model: sonnet, budget: 5k/2k) {\n  reads: [ContextName]\n  produces Output { field: Type }\n}\n```',
  memory: 'Declares persistent memory with typed fields and storage backend.\n\n```graft\nmemory Name(max_tokens: 2k, storage: file) {\n  field: Type\n}\n```',
  graph: 'Declares an execution graph connecting nodes in a flow.\n\n```graft\ngraph Name(input: In, output: Out, budget: 10k) {\n  Start -> Middle -> done\n}\n```',
  edge: 'Declares a data transform between nodes.\n\n```graft\nedge Source -> Target | select(field) | compact\n```',
  import: 'Imports contexts and nodes from another .gft file.\n\n```graft\nimport { Name } from "./lib.gft"\n```',
  reads: 'Specifies which contexts, produces, or memories a node reads from.\n\n```graft\nreads: [ContextName, Produces.field]\n```',
  writes: 'Specifies which memories a node writes to.\n\n```graft\nwrites: [MemoryName.field]\n```',
  produces: 'Declares the output schema of a node.\n\n```graft\nproduces OutputName {\n  field: Type\n}\n```',
  model: 'Specifies the LLM model alias for a node.\n\nAliases: sonnet, opus, haiku',
  max_tokens: 'Sets the maximum token budget for a context or memory.',
  on_failure: 'Specifies failure handling strategy for a node.\n\nStrategies: retry(N), fallback(Node), skip, abort',
  storage: 'Specifies the storage backend for a memory declaration.\n\nCurrently supported: file',
  foreach: 'Iterates over a list field from a node\'s output.\n\n```graft\nforeach(Node.output.field as item, max_iterations: 5) {\n  Step1 -> Step2\n}\n```',
  parallel: 'Executes multiple nodes concurrently.\n\n```graft\nparallel { Node1 Node2 Node3 }\n```',
};

export function getHoverInfo(word: string, index: ProgramIndex): Hover | null {
  const keywordDoc = KEYWORD_DOCS[word];
  if (keywordDoc) {
    return mkHover(keywordDoc);
  }

  const ctx = index.contextMap.get(word);
  if (ctx) {
    const fields = ctx.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**context** ${ctx.name} (max_tokens: ${ctx.maxTokens})\n\`\`\`\n${fields}\n\`\`\``);
  }

  const node = index.nodeMap.get(word);
  if (node) {
    const reads = node.reads.map(r => {
      if (!r.field) return r.context;
      return r.field.length === 1 ? `${r.context}.${r.field[0]}` : `${r.context}.{${r.field.join(', ')}}`;
    }).join(', ');
    const writes = node.writes.length > 0
      ? `\nwrites: ${node.writes.map(w => w.field ? `${w.memory}.${w.field}` : w.memory).join(', ')}`
      : '';
    const producesFields = node.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(
      `**node** ${node.name}\n` +
      `- model: ${node.model}\n` +
      `- budget: ${node.budgetIn}/${node.budgetOut}\n` +
      `- reads: ${reads}${writes}\n` +
      `- produces: ${node.produces.name}\n\`\`\`\n${producesFields}\n\`\`\``
    );
  }

  const mem = index.memoryMap.get(word);
  if (mem) {
    const fields = mem.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**memory** ${mem.name} (max_tokens: ${mem.maxTokens}, storage: ${mem.storage})\n\`\`\`\n${fields}\n\`\`\``);
  }

  // Built-in functions
  if (word in BUILTIN_FUNCTIONS) {
    const info = BUILTIN_FUNCTIONS[word];
    return mkHover(`**${info.signature}**\n\n${info.description}`);
  }

  const producerNode = index.producesNodeMap.get(word);
  if (producerNode) {
    const fields = producerNode.produces.fields.map(f => `  ${f.name}: ${formatType(f.type)}`).join('\n');
    return mkHover(`**produces** ${word} (from node ${producerNode.name})\n\`\`\`\n${fields}\n\`\`\``);
  }

  return null;
}

export function formatType(type: TypeExpr): string {
  switch (type.kind) {
    case 'primitive': return type.name;
    case 'primitive_range': return `Float(${type.min}..${type.max})`;
    case 'list': return `List<${formatType(type.element)}>`;
    case 'map': return `Map<${formatType(type.key)}, ${formatType(type.value)}>`;
    case 'optional': return `${formatType(type.inner)}?`;
    case 'token_bounded': return `${formatType(type.inner)}(max: ${type.max})`;
    case 'enum': return type.values.join(' | ');
    case 'struct': return `{ ${type.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')} }`;
    case 'domain': return type.name;
  }
}

function mkHover(value: string): Hover {
  return { contents: { kind: MarkupKind.Markdown, value } };
}
