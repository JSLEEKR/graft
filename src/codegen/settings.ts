import { Program, EdgeDecl } from '../parser/ast.js';

// Keep in sync with agents.ts MODEL_MAP
const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

export interface GraftSettings {
  model: string;
  permissions: { allow: string[] };
  graft: {
    version: string;
    source: string;
    compiled_at: string;
    budget: {
      total: number;
      warning_threshold: number;
      critical_threshold: number;
    };
    model_routing: {
      default: string;
      overrides: Record<string, string>;
    };
  };
  hooks: {
    PostToolUse: HookEntry[];
  };
}

interface HookEntry {
  matcher: string;
  command: string;
}

export function generateSettings(program: Program, sourceFile: string): GraftSettings {
  const graph = program.graphs[0];
  const firstNodeModel = graph
    ? program.nodes.find(n => n.name === graph.flow[0])?.model
    : undefined;
  const defaultModel = firstNodeModel
    ? (MODEL_MAP[firstNodeModel] || firstNodeModel)
    : MODEL_MAP.sonnet;

  const overrides: Record<string, string> = {};
  for (const node of program.nodes) {
    const resolved = MODEL_MAP[node.model] || node.model;
    if (resolved !== defaultModel) {
      overrides[node.name.toLowerCase()] = resolved;
    }
  }

  const hookEntries: HookEntry[] = [];
  for (const edge of program.edges) {
    if (edge.transforms.length === 0) continue;
    if (edge.target.kind !== 'direct') continue;
    const source = edge.source.toLowerCase();
    const target = edge.target.node.toLowerCase();
    hookEntries.push({
      matcher: `Write(.graft/session/node_outputs/${source}.json)`,
      command: `.claude/hooks/${source}-to-${target}.sh`,
    });
  }

  return {
    model: defaultModel,
    permissions: {
      allow: ['Read', 'Write', 'Edit', 'Bash', 'Skill'],
    },
    graft: {
      version: '0.1.0',
      source: sourceFile,
      compiled_at: new Date().toISOString(),
      budget: {
        total: graph?.budget || 0,
        warning_threshold: 0.8,
        critical_threshold: 0.9,
      },
      model_routing: {
        default: defaultModel,
        overrides,
      },
    },
    hooks: {
      PostToolUse: hookEntries,
    },
  };
}
