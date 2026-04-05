/**
 * graft import — reverse-compiles a .claude/ harness structure into a .gft file.
 *
 * Reads:
 *   .claude/agents/*.md   → node declarations
 *   .claude/hooks/*.js    → edge declarations with transforms
 *   .claude/settings.json → model routing, budget
 *   .claude/orchestration.md or .claude/CLAUDE.md → graph flow
 *
 * Outputs a valid .gft source string.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Agent parsing ──────────────────────────────────────────

interface ParsedAgent {
  name: string;
  model: string;
  inputBudget: number;
  outputBudget: number;
  reads: string[];
  producesName: string;
  producesFields: { name: string; type: string }[];
  onFailure?: string;
  tools?: string[];
}

const MODEL_SHORT: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'haiku',
  'claude-sonnet-4-20250514': 'sonnet',
  'claude-opus-4-20250514': 'opus',
  'claude-sonnet-4-6-20250610': 'sonnet',
  'claude-opus-4-6-20250610': 'opus',
};

function shortModel(model: string): string {
  return MODEL_SHORT[model] || model;
}

function parseAgent(filePath: string): ParsedAgent | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Parse YAML frontmatter
  let name = '';
  let model = 'sonnet';
  let inFrontmatter = false;
  let frontmatterEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter && line === '---') { frontmatterEnd = i; break; }
    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        if (match[1] === 'name') name = match[2];
        if (match[1] === 'model') model = shortModel(match[2]);
      }
    }
  }

  if (!name) {
    name = path.basename(filePath, '.md');
  }

  // Parse reads from "Context Loading" section
  const reads: string[] = [];
  const contextRegex = /Load `(\w+)`/g;
  let m;
  while ((m = contextRegex.exec(content)) !== null) {
    reads.push(m[1]);
  }

  // Also check for "Also reads:" or reads from other sources
  const alsoReadsRegex = /Also reads:.*\((\w+)\)/g;
  while ((m = alsoReadsRegex.exec(content)) !== null) {
    if (!reads.includes(m[1])) reads.push(m[1]);
  }

  // Parse produces from JSON schema
  let producesName = '';
  const producesFields: { name: string; type: string }[] = [];

  const descMatch = content.match(/description:\s*\w+ agent — produces (\w+)/);
  if (descMatch) producesName = descMatch[1];

  // Parse JSON schema block
  const jsonMatch = content.match(/```json\n([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const schema = JSON.parse(jsonMatch[1]);
      for (const [key, val] of Object.entries(schema)) {
        producesFields.push({ name: key, type: inferGftType(val) });
      }
    } catch {
      // Best-effort
    }
  }

  // Parse budgets
  let inputBudget = 4000;
  let outputBudget = 2000;
  const inputMatch = content.match(/Input budget:\s*([\d,]+)\s*tokens/);
  const outputMatch = content.match(/Output budget:\s*([\d,]+)\s*tokens/);
  if (inputMatch) inputBudget = parseInt(inputMatch[1].replace(/,/g, ''));
  if (outputMatch) outputBudget = parseInt(outputMatch[1].replace(/,/g, ''));

  // Extract proper case from "# Name Agent" heading or description
  const headingMatch = content.match(/^# (\w+) Agent/m);
  const capName = headingMatch ? headingMatch[1] : name.charAt(0).toUpperCase() + name.slice(1);

  if (!producesName) producesName = capName + 'Output';

  return {
    name: capName,
    model,
    inputBudget,
    outputBudget,
    reads,
    producesName,
    producesFields,
  };
}

function inferGftType(val: unknown): string {
  if (val === null || val === undefined) return 'String';
  if (typeof val === 'string') {
    if (val === '<string>') return 'String';
    if (val === '<number>' || val === '<int>') return 'Int';
    if (val === '<float>') return 'Float';
    if (val === '<bool>' || val === 'true' || val === 'false') return 'Bool';
    return 'String';
  }
  if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Float';
  if (typeof val === 'boolean') return 'Bool';
  if (Array.isArray(val)) {
    if (val.length > 0) return `List<${inferGftType(val[0])}>`;
    return 'List<String>';
  }
  if (typeof val === 'object') {
    // Inline struct — for now simplify to String
    return 'String';
  }
  return 'String';
}

// ── Hook parsing ──────────────────────────────────────────

interface ParsedEdge {
  source: string;
  target: string;
  transforms: string[];
}

function parseHook(filePath: string): ParsedEdge | null {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse "Edge: Source -> Target" comment
  const edgeMatch = content.match(/Edge:\s*(\w+)\s*->\s*(\w+)/);
  if (!edgeMatch) return null;

  const source = edgeMatch[1];
  const target = edgeMatch[2];
  const transforms: string[] = [];

  // Detect select: look for `result = { "field1": data["field1"], ... }`
  const selectMatch = content.match(/let result = \{([^}]+)\}/);
  if (selectMatch) {
    const fields: string[] = [];
    const fieldRegex = /"(\w+)":\s*data\["/g;
    let fm;
    while ((fm = fieldRegex.exec(selectMatch[1])) !== null) {
      fields.push(fm[1]);
    }
    if (fields.length > 0) {
      transforms.push(`select(${fields.join(', ')})`);
    }
  }

  // Detect compact
  if (content.includes('function compact(')) {
    transforms.push('compact');
  }

  // Detect filter
  const filterMatch = content.match(/\.filter\(\s*\w+\s*=>\s*\w+\["(\w+)"\]\s*(>=?|<=?|===?|!==?)\s*(.+?)\)/);
  if (filterMatch) {
    transforms.push(`filter(${filterMatch[1]} ${filterMatch[2]} ${filterMatch[3].trim()})`);
  }

  // Detect truncate (look for explicit truncate comment or large slice, not timestamp slicing)
  const truncMatch = content.match(/truncate.*\.slice\(0,\s*(\d+)\)/i);
  if (truncMatch) {
    transforms.push(`truncate(${truncMatch[1]})`);
  }

  // Detect drop
  const dropMatch = content.match(/delete\s+\w+\["(\w+)"\]/);
  if (dropMatch) {
    transforms.push(`drop(${dropMatch[1]})`);
  }

  return { source, target, transforms };
}

// ── Settings parsing ──────────────────────────────────────

interface ParsedSettings {
  graphBudget: number;
  modelRouting: Record<string, string>;
}

function parseSettings(filePath: string): ParsedSettings | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const graft = content.graft || {};
    const budget = graft.budget?.total || 50000;
    const routing: Record<string, string> = {};
    if (graft.model_routing?.overrides) {
      for (const [agent, model] of Object.entries(graft.model_routing.overrides)) {
        routing[agent] = shortModel(model as string);
      }
    }
    return { graphBudget: budget, modelRouting: routing };
  } catch {
    return null;
  }
}

// ── Graph flow parsing ──────────────────────────────────────

interface ParsedFlow {
  steps: string[]; // node names in execution order
  parallelGroups: string[][]; // groups of parallel nodes
}

function parseOrchestration(dir: string): ParsedFlow {
  const steps: string[] = [];
  const parallelGroups: string[][] = [];

  // Try orchestration.md first, then CLAUDE.md
  let content = '';
  const orchPath = path.join(dir, '.claude', 'orchestration.md');
  const claudePath = path.join(dir, '.claude', 'CLAUDE.md');

  if (fs.existsSync(orchPath)) {
    content = fs.readFileSync(orchPath, 'utf-8');
  } else if (fs.existsSync(claudePath)) {
    content = fs.readFileSync(claudePath, 'utf-8');
  }

  if (!content) return { steps, parallelGroups };

  // Parse steps
  const stepRegex = /### Step \d+:\s*(.+)/g;
  let sm;
  while ((sm = stepRegex.exec(content)) !== null) {
    const stepLine = sm[1];

    if (stepLine.includes('[parallel]')) {
      const names = stepLine.replace('[parallel]', '').trim().split(/,\s*/);
      parallelGroups.push(names);
      steps.push(`parallel:${names.join(',')}`);
    } else if (stepLine.includes('[sequential]')) {
      const name = stepLine.replace('[sequential]', '').trim();
      steps.push(name);
    } else if (stepLine.includes('[foreach')) {
      steps.push(stepLine.trim());
    } else {
      // Fallback: extract first word
      const name = stepLine.split(/\s/)[0];
      if (name) steps.push(name);
    }
  }

  return { steps, parallelGroups };
}

// ── .gft generation ──────────────────────────────────────

function formatBudget(tokens: number): string {
  if (tokens >= 1000 && tokens % 1000 === 0) return `${tokens / 1000}k`;
  return `${tokens}`;
}

export function importHarness(dir: string): string {
  const claudeDir = path.join(dir, '.claude');
  const agentsDir = path.join(claudeDir, 'agents');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsPath = path.join(claudeDir, 'settings.json');

  // 1. Parse agents
  const agents: ParsedAgent[] = [];
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.endsWith('.md')) continue;
      const agent = parseAgent(path.join(agentsDir, file));
      if (agent) agents.push(agent);
    }
  }

  // 2. Parse hooks → edges
  const edges: ParsedEdge[] = [];
  if (fs.existsSync(hooksDir)) {
    for (const file of fs.readdirSync(hooksDir)) {
      if (!file.endsWith('.js')) continue;
      const edge = parseHook(path.join(hooksDir, file));
      if (edge) edges.push(edge);
    }
  }

  // 3. Parse settings
  const settings = parseSettings(settingsPath);

  // Apply model from settings routing
  if (settings) {
    for (const agent of agents) {
      const override = settings.modelRouting[agent.name.toLowerCase()];
      if (override) agent.model = override;
    }
  }

  // 4. Parse orchestration for graph flow
  const flow = parseOrchestration(dir);

  // 5. Collect context names (reads that don't match any produces)
  const producesNames = new Set(agents.map(a => a.producesName));
  const contextNames = new Set<string>();
  for (const agent of agents) {
    for (const read of agent.reads) {
      if (!producesNames.has(read)) {
        contextNames.add(read);
      }
    }
  }

  // 6. Generate .gft
  const lines: string[] = [];
  lines.push(`// Imported from ${path.basename(dir)}/.claude/ by graft import`);
  lines.push('');

  // Contexts (best-effort — we don't know the fields)
  for (const ctx of contextNames) {
    lines.push(`context ${ctx}(max_tokens: 2k) {`);
    lines.push(`  // TODO: add fields`);
    lines.push(`}`);
    lines.push('');
  }

  // Nodes
  for (const agent of agents) {
    const budget = `${formatBudget(agent.inputBudget)}/${formatBudget(agent.outputBudget)}`;
    lines.push(`node ${agent.name}(model: ${agent.model}, budget: ${budget}) {`);
    if (agent.reads.length > 0) {
      lines.push(`  reads: [${agent.reads.join(', ')}]`);
    }
    lines.push(`  produces ${agent.producesName} {`);
    for (const field of agent.producesFields) {
      lines.push(`    ${field.name}: ${field.type}`);
    }
    if (agent.producesFields.length === 0) {
      lines.push(`    // TODO: add fields`);
    }
    lines.push(`  }`);
    lines.push(`}`);
    lines.push('');
  }

  // Edges
  for (const edge of edges) {
    let line = `edge ${edge.source} -> ${edge.target}`;
    for (const t of edge.transforms) {
      line += ` | ${t}`;
    }
    lines.push(line);
  }
  if (edges.length > 0) lines.push('');

  // Graph
  const graphBudget = settings?.graphBudget || 50000;
  const graphName = path.basename(dir).replace(/[^a-zA-Z0-9]/g, '') || 'Pipeline';
  const capGraphName = graphName.charAt(0).toUpperCase() + graphName.slice(1);

  // Determine input/output
  const inputCtx = contextNames.size > 0 ? [...contextNames][0] : 'Input';
  const lastAgent = agents.length > 0 ? agents[agents.length - 1] : null;
  const outputName = lastAgent?.producesName || 'Output';

  lines.push(`graph ${capGraphName}(input: ${inputCtx}, output: ${outputName}, budget: ${formatBudget(graphBudget)}) {`);

  // Use orchestration flow if available, otherwise infer from edges
  if (flow.steps.length > 0) {
    const flowParts: string[] = [];
    for (const step of flow.steps) {
      if (step.startsWith('parallel:')) {
        const names = step.replace('parallel:', '').split(',');
        flowParts.push(`parallel { ${names.join('  ')} }`);
      } else {
        flowParts.push(step);
      }
    }
    lines.push(`  ${flowParts.join(' -> ')} -> done`);
  } else {
    // Infer sequential from agents list
    const names = agents.map(a => a.name);
    lines.push(`  ${names.join(' -> ')} -> done`);
  }

  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}
