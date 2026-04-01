import { NodeDecl } from '../parser/ast.js';
import { MODEL_MAP } from '../constants.js';
import { fieldsToJsonExample } from '../utils.js';

const TOOL_MAP: Record<string, string[]> = {
  file_read: ['Read'],
  file_write: ['Write', 'Edit'],
  terminal: ['Bash'],
  ast_parse: ['Bash'],
  test_run: ['Bash'],
  lint: ['Bash'],
  browser: ['Bash'],
};

export function generateAgent(node: NodeDecl, memoryNames: Set<string> = new Set()): string {
  const name = node.name.toLowerCase();
  const resolvedModel = MODEL_MAP[node.model] || node.model;
  const tools = resolveTools(node.tools);
  const jsonSchema = fieldsToJsonExample(node.produces.fields);
  const failureSection = formatFailure(node);
  const writesSection = formatWrites(node, memoryNames);

  return `---
name: ${name}
model: ${resolvedModel}
tools: [${tools.join(', ')}]
---

# ${node.name} Agent

## Context Loading
${formatReads(node, memoryNames)}
${writesSection}## Output Contract
Produce JSON output matching this schema:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

## Token Discipline
- Input budget: ${node.budgetIn} tokens. Read only what is necessary.
- Output budget: ${node.budgetOut} tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to \`.graft/session/node_outputs/${name}.json\`
2. Output: \`===NODE_COMPLETE:${name}===\`

${failureSection}`;
}

function resolveTools(tools: string[]): string[] {
  const resolved = new Set<string>();
  for (const tool of tools) {
    const mapped = TOOL_MAP[tool];
    if (mapped) {
      for (const t of mapped) resolved.add(t);
    } else {
      resolved.add(tool);
    }
  }
  return [...resolved];
}

function formatReads(node: NodeDecl, memoryNames: Set<string>): string {
  if (node.reads.length === 0) return 'No external context required.';
  return node.reads.map(ref => {
    const isMemory = memoryNames.has(ref.context);
    if (isMemory) {
      if (ref.field) {
        return `- Load \`${ref.context}.${ref.field}\` from \`.graft/memory/${ref.context.toLowerCase()}.json\``;
      }
      return `- Load \`${ref.context}\` from \`.graft/memory/${ref.context.toLowerCase()}.json\``;
    }
    if (ref.field) {
      return `- Load \`${ref.context}.${ref.field}\` from \`.graft/session/\``;
    }
    return `- Load \`${ref.context}\` from \`.graft/session/\``;
  }).join('\n');
}

function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  const memoryWrites = node.writes.filter(w => memoryNames.has(w));
  if (memoryWrites.length === 0) return '';
  return `
## Memory Saving
After producing output, save to persistent memory:
${memoryWrites.map(w => `- Save to \`.graft/memory/${w.toLowerCase()}.json\``).join('\n')}

`;
}

function formatFailure(node: NodeDecl): string {
  const name = node.name.toLowerCase();
  if (!node.onFailure) {
    return `## Failure Protocol\nOn failure, output: \`===NODE_FAILED:${name}===\``;
  }
  switch (node.onFailure.type) {
    case 'retry':
      return `## Failure Protocol\nRetry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, output: \`===NODE_FAILED:${name}===\``;
    case 'fallback':
      return `## Failure Protocol\nOn failure, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
    case 'retry_then_fallback':
      return `## Failure Protocol\nRetry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
    case 'skip':
      return `## Failure Protocol\nOn failure, skip this node. Output: \`===NODE_SKIPPED:${name}===\``;
    case 'abort':
      return `## Failure Protocol\nOn failure, abort the entire pipeline. Output: \`===PIPELINE_ABORTED:${name}===\``;
  }
}

