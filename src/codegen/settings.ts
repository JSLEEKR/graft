import { Program, EdgeDecl, FlowNode } from '../parser/ast.js';
import { MODEL_MAP, BUDGET_WARNING_THRESHOLD, BUDGET_CRITICAL_THRESHOLD } from '../constants.js';
import { VERSION } from '../version.js';
import { ProgramIndex } from '../program-index.js';

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

interface HookCommand {
  type: 'command';
  command: string;
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

/**
 * Find the first 'node'-kind FlowNode name from a FlowNode array.
 * Returns undefined if no node-kind step exists.
 */
function findFirstNodeName(flow: FlowNode[]): string | undefined {
  for (const step of flow) {
    switch (step.kind) {
      case 'node':
        return step.name;
      case 'parallel':
        return step.branches[0];
      case 'foreach':
        return findFirstNodeName(step.body);
      case 'let':
        break;
      case 'graph_call':
        break;
    }
  }
  return undefined;
}

export function generateSettings(program: Program, sourceFile: string, index?: ProgramIndex): GraftSettings {
  const idx = index ?? new ProgramIndex(program);
  const graph = program.graphs[0];
  const firstNodeName = graph ? findFirstNodeName(graph.flow) : undefined;
  const firstNodeModel = firstNodeName
    ? idx.nodeMap.get(firstNodeName)?.model
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
      hooks: [{ type: 'command', command: `.claude/hooks/${source}-to-${target}.sh` }],
    });
  }

  return {
    model: defaultModel,
    permissions: {
      allow: ['Read', 'Write', 'Edit', 'Bash', 'Skill'],
    },
    graft: {
      version: VERSION,
      source: sourceFile,
      compiled_at: new Date().toISOString(),
      budget: {
        total: graph?.budget || 0,
        warning_threshold: BUDGET_WARNING_THRESHOLD,
        critical_threshold: BUDGET_CRITICAL_THRESHOLD,
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
