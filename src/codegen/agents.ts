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

export function generateAgent(node: NodeDecl, memoryNames: Set<string> = new Set(), inputOverrides: Map<string, string> = new Map()): string {
  const name = node.name.toLowerCase();
  const resolvedModel = MODEL_MAP[node.model] || node.model;
  const tools = resolveTools(node.tools);
  const jsonSchema = fieldsToJsonExample(node.produces.fields);
  const failureSection = formatFailure(node);
  const writesSection = formatWrites(node, memoryNames);

  const toolsLine = tools.length > 0 ? `\ntools: [${tools.join(', ')}]` : '';

  return `---
name: ${name}
description: ${node.name} agent — produces ${node.produces.name}
model: ${resolvedModel}${toolsLine}
---

# ${node.name} Agent

## Context Loading
${formatReads(node, memoryNames, inputOverrides)}
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

function formatReads(node: NodeDecl, memoryNames: Set<string>, inputOverrides: Map<string, string> = new Map()): string {
  if (node.reads.length === 0) return 'No external context required.';
  return node.reads.map(ref => {
    const isMemory = memoryNames.has(ref.context);
    const fieldLabel = ref.field
      ? (ref.field.length === 1 ? `.${ref.field[0]}` : `.{${ref.field.join(', ')}}`)
      : '';
    // Check if there's an edge-transformed input override for this context
    const override = inputOverrides.get(ref.context);
    if (override) {
      return `- Load \`${ref.context}${fieldLabel}\` from \`${override}\``;
    }
    const dir = isMemory ? `.graft/memory/${ref.context.toLowerCase()}.json` : '.graft/session/';
    return `- Load \`${ref.context}${fieldLabel}\` from \`${dir}\``;
  }).join('\n');
}

function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  const memoryWrites = node.writes.filter(w => memoryNames.has(w.memory));
  if (memoryWrites.length === 0) return '';
  return `
## Memory Saving
After producing output, save to persistent memory:
${memoryWrites.map(w => {
    const fieldLabel = w.field ? `.${w.field}` : '';
    return `- Save to \`.graft/memory/${w.memory.toLowerCase()}.json\`${fieldLabel ? ` (field: ${w.field})` : ''}`;
  }).join('\n')}

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

