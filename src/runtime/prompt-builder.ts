import { NodeDecl } from '../parser/ast.js';
import { fieldsToJsonExample } from '../utils.js';

export interface RuntimeState {
  outputs: Map<string, unknown>;
  input: Record<string, unknown>;
}

export interface PromptContext extends RuntimeState {
  graphInputName: string;
}

export function resolveField(data: unknown, field: string): unknown {
  if (data === null || data === undefined || typeof data !== 'object') return undefined;
  return (data as Record<string, unknown>)[field];
}

export function buildPrompt(nodeDecl: NodeDecl, ctx: PromptContext): string {
  const jsonSchema = fieldsToJsonExample(nodeDecl.produces.fields);
  const contextSection = buildContextSection(nodeDecl, ctx);

  return `# ${nodeDecl.name} Agent

## Task
You are the ${nodeDecl.name} node in a Graft pipeline.

## Input Context
${contextSection}

## Output Contract
Produce JSON output matching this schema:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

## Rules
- Output ONLY valid JSON. No explanations, no markdown, no code fences.
- Stay within ${nodeDecl.budgetOut} output tokens.
`;
}

export function buildContextSection(nodeDecl: NodeDecl, ctx: PromptContext): string {
  const sections: string[] = [];

  for (const ref of nodeDecl.reads) {
    const contextData = ctx.outputs.get(ref.context);
    if (contextData !== undefined) {
      if (ref.field) {
        for (const f of ref.field) {
          const fieldVal = resolveField(contextData, f);
          sections.push(`### ${ref.context}.${f}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
        }
      } else {
        sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(contextData, null, 2)}\n\`\`\``);
      }
    } else {
      // Check if input matches the context name
      if (ref.context === ctx.graphInputName) {
        if (ref.field) {
          for (const f of ref.field) {
            const fieldVal = resolveField(ctx.input, f);
            sections.push(`### ${ref.context}.${f}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
          }
        } else {
          sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(ctx.input, null, 2)}\n\`\`\``);
        }
      } else {
        sections.push(`### ${ref.context}\nNo data available.`);
      }
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : 'No external context required.';
}

export function generateMockOutput(nodeDecl: NodeDecl): Record<string, unknown> {
  return fieldsToJsonExample(nodeDecl.produces.fields);
}
