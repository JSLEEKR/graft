import * as fs from 'node:fs';
import * as path from 'node:path';
import { Program, NodeDecl, EdgeDecl, FlowNode, Field, TypeExpr } from '../parser/ast.js';
import { SpawnOptions, SpawnResult, spawnClaude } from './subprocess.js';
import { extractJson } from './subprocess.js';
import { applyTransforms } from './transforms.js';

// Duplicated from agents.ts per ratchet decision (T6)
const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

export type SpawnerFn = (options: SpawnOptions) => Promise<SpawnResult>;

export interface RunOptions {
  sourceFile: string;
  input: Record<string, unknown>;
  workDir: string;
  dryRun?: boolean;
  verbose?: boolean;
  timeoutMs?: number;
  spawner?: SpawnerFn;
}

export interface NodeResult {
  node: string;
  output: unknown;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface RunResult {
  success: boolean;
  graph: string;
  nodeResults: NodeResult[];
  finalOutput: unknown;
  totalDurationMs: number;
  errors: string[];
}

export class Executor {
  private program: Program;
  private options: RunOptions;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl[]>;
  private outputs: Map<string, unknown>;
  private spawner: SpawnerFn;
  private sessionDir: string;
  private nodeOutputDir: string;
  private memoryDir: string;
  private memoryNames: Set<string>;

  constructor(program: Program, options: RunOptions) {
    this.program = program;
    this.options = options;
    this.spawner = options.spawner ?? spawnClaude;
    this.outputs = new Map();
    this.memoryDir = path.join(options.workDir, '.graft', 'memory');
    this.memoryNames = new Set(program.memories.map(m => m.name));

    // Build node lookup from Program.nodes
    this.nodeMap = new Map();
    for (const node of program.nodes) {
      this.nodeMap.set(node.name, node);
    }

    // Build edge lookup by source
    this.edgeMap = new Map();
    for (const edge of program.edges) {
      const existing = this.edgeMap.get(edge.source) ?? [];
      existing.push(edge);
      this.edgeMap.set(edge.source, existing);
    }

    this.sessionDir = path.join(options.workDir, '.graft', 'session');
    this.nodeOutputDir = path.join(this.sessionDir, 'node_outputs');
  }

  async execute(): Promise<RunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const nodeResults: NodeResult[] = [];

    // Find the first graph
    if (this.program.graphs.length === 0) {
      return {
        success: false,
        graph: '',
        nodeResults: [],
        finalOutput: null,
        totalDurationMs: Date.now() - startTime,
        errors: ['No graph declaration found'],
      };
    }

    const graph = this.program.graphs[0];

    // Session cleanup: remove old files, preserve .gitkeep
    this.cleanSession();

    // Ensure session directory exists
    fs.mkdirSync(this.nodeOutputDir, { recursive: true });

    // Ensure memory directory exists (if memories declared)
    if (this.program.memories.length > 0) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }

    // Write input to session
    fs.writeFileSync(
      path.join(this.sessionDir, `${graph.input.toLowerCase()}.json`),
      JSON.stringify(this.options.input, null, 2),
    );

    // Execute flow nodes
    try {
      await this.executeFlowNodes(graph.flow, nodeResults, errors);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // Determine final output
    let finalOutput: unknown = null;
    const outputName = graph.output.toLowerCase();
    // Check outputs by produces name
    for (const [key, val] of this.outputs) {
      if (key.toLowerCase() === outputName) {
        finalOutput = val;
        break;
      }
    }
    // If not found by produces name, try the last node result
    if (finalOutput === null && nodeResults.length > 0) {
      const lastSuccess = [...nodeResults].reverse().find(r => r.success);
      if (lastSuccess) finalOutput = lastSuccess.output;
    }

    return {
      success: errors.length === 0,
      graph: graph.name,
      nodeResults,
      finalOutput,
      totalDurationMs: Date.now() - startTime,
      errors,
    };
  }

  private cleanSession(): void {
    if (!fs.existsSync(this.nodeOutputDir)) return;
    const files = fs.readdirSync(this.nodeOutputDir);
    for (const file of files) {
      if (file === '.gitkeep') continue;
      fs.rmSync(path.join(this.nodeOutputDir, file), { force: true });
    }
  }

  private loadMemory(name: string): Record<string, unknown> | null {
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private saveMemory(name: string, nodeOutput: unknown): void {
    if (this.options.dryRun) return;

    const mem = this.program.memories.find(m => m.name === name);
    if (!mem) return;

    fs.mkdirSync(this.memoryDir, { recursive: true });
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);

    // Load existing memory
    let current: Record<string, unknown> = {};
    if (fs.existsSync(filePath)) {
      try {
        current = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      } catch {
        current = {};
      }
    }

    // Field-matching merge: only write fields declared in memory schema
    if (typeof nodeOutput === 'object' && nodeOutput !== null) {
      const output = nodeOutput as Record<string, unknown>;
      for (const field of mem.fields) {
        if (field.name in output) {
          current[field.name] = output[field.name];
        }
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
  }

  private async executeFlowNodes(
    flow: FlowNode[],
    nodeResults: NodeResult[],
    errors: string[],
  ): Promise<void> {
    for (const flowNode of flow) {
      if (errors.length > 0) break; // abort on failure

      switch (flowNode.kind) {
        case 'node': {
          if (flowNode.name === 'done') continue;
          const result = await this.executeNode(flowNode.name);
          nodeResults.push(result);
          if (!result.success) {
            errors.push(result.error ?? `Node ${flowNode.name} failed`);
          }
          break;
        }

        case 'parallel': {
          const promises = flowNode.branches
            .filter(name => name !== 'done')
            .map(name => this.executeNode(name));
          const results = await Promise.allSettled(promises);
          for (const [i, settled] of results.entries()) {
            if (settled.status === 'fulfilled') {
              nodeResults.push(settled.value);
              if (!settled.value.success) {
                errors.push(settled.value.error ?? `Node ${flowNode.branches[i]} failed`);
              }
            } else {
              const name = flowNode.branches[i];
              const nr: NodeResult = {
                node: name,
                output: null,
                durationMs: 0,
                success: false,
                error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
              };
              nodeResults.push(nr);
              errors.push(nr.error!);
            }
          }
          break;
        }

        case 'foreach': {
          const sourceData = this.outputs.get(flowNode.source) ?? this.options.input;
          const items = this.resolveField(sourceData, flowNode.field);
          if (!Array.isArray(items)) {
            errors.push(`foreach: ${flowNode.source}.${flowNode.field} is not an array`);
            break;
          }
          const maxIter = Math.min(items.length, flowNode.maxIterations);
          for (let i = 0; i < maxIter; i++) {
            if (errors.length > 0) break;
            // Set the binding as available data
            this.outputs.set(flowNode.binding, items[i]);
            // Execute the body for each item
            await this.executeFlowNodes(flowNode.body, nodeResults, errors);
          }
          break;
        }
      }
    }
  }

  private resolveField(data: unknown, field: string): unknown {
    if (data === null || data === undefined || typeof data !== 'object') return undefined;
    return (data as Record<string, unknown>)[field];
  }

  private async executeNode(name: string): Promise<NodeResult> {
    const startTime = Date.now();
    const nodeDecl = this.nodeMap.get(name);

    if (!nodeDecl) {
      return {
        node: name,
        output: null,
        durationMs: Date.now() - startTime,
        success: false,
        error: `Node '${name}' not found in program`,
      };
    }

    // Load memory for reads that reference memory declarations
    // ALWAYS reload from disk (no this.outputs.has guard — fixes foreach staleness)
    for (const ref of nodeDecl.reads) {
      if (this.memoryNames.has(ref.context)) {
        const memData = this.loadMemory(ref.context);
        if (memData !== null) {
          this.outputs.set(ref.context, memData);
        } else {
          this.outputs.delete(ref.context);
        }
      }
    }

    // Dry run: produce mock output
    if (this.options.dryRun) {
      const mockOutput = this.generateMockOutput(nodeDecl);
      this.storeOutput(nodeDecl, mockOutput);
      return {
        node: name,
        output: mockOutput,
        durationMs: Date.now() - startTime,
        success: true,
      };
    }

    // Build prompt
    const prompt = this.buildPrompt(nodeDecl);
    const resolvedModel = MODEL_MAP[nodeDecl.model] || nodeDecl.model;

    const args = [
      '--print',
      '--model', resolvedModel,
      '--max-tokens', String(nodeDecl.budgetOut),
      '-p', prompt,
    ];

    try {
      const result = await this.spawner({
        args,
        cwd: this.options.workDir,
        timeoutMs: this.options.timeoutMs ?? 300000,
      });

      if (this.options.verbose) {
        console.log(`[${name}] exit=${result.exitCode} stdout=${result.stdout.length}b stderr=${result.stderr.length}b`);
      }

      if (result.exitCode !== 0) {
        // Try to extract output anyway
        try {
          const output = extractJson(result.stdout);
          this.storeOutput(nodeDecl, output);
          return {
            node: name,
            output,
            durationMs: Date.now() - startTime,
            success: true,
          };
        } catch {
          return {
            node: name,
            output: null,
            durationMs: Date.now() - startTime,
            success: false,
            error: `Node '${name}' exited with code ${result.exitCode}. stderr: ${result.stderr.slice(0, 500)}`,
          };
        }
      }

      const output = extractJson(result.stdout);
      this.storeOutput(nodeDecl, output);

      return {
        node: name,
        output,
        durationMs: Date.now() - startTime,
        success: true,
      };
    } catch (e) {
      return {
        node: name,
        output: null,
        durationMs: Date.now() - startTime,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private storeOutput(nodeDecl: NodeDecl, output: unknown): void {
    // Store by node name
    this.outputs.set(nodeDecl.name, output);
    // Store by produces name
    this.outputs.set(nodeDecl.produces.name, output);

    // Write to session directory
    const fileName = nodeDecl.name.toLowerCase() + '.json';
    fs.writeFileSync(
      path.join(this.nodeOutputDir, fileName),
      JSON.stringify(output, null, 2),
    );

    // Also write by produces name
    const producesFileName = nodeDecl.produces.name.toLowerCase() + '.json';
    if (producesFileName !== fileName) {
      fs.writeFileSync(
        path.join(this.nodeOutputDir, producesFileName),
        JSON.stringify(output, null, 2),
      );
    }

    // Apply edge transforms and write transformed outputs for downstream nodes
    const edges = this.edgeMap.get(nodeDecl.name) ?? [];
    for (const edge of edges) {
      if (edge.transforms.length > 0 && edge.target.kind === 'direct') {
        const transformed = applyTransforms(output, edge.transforms);
        const targetName = edge.target.node.toLowerCase();
        const transformedFileName = `${nodeDecl.name.toLowerCase()}_transformed_for_${targetName}.json`;
        fs.writeFileSync(
          path.join(this.nodeOutputDir, transformedFileName),
          JSON.stringify(transformed, null, 2),
        );
      }
    }

    // Save to memory for writes targets
    for (const writeName of nodeDecl.writes) {
      if (this.memoryNames.has(writeName)) {
        this.saveMemory(writeName, output);
      }
    }
  }

  private buildPrompt(nodeDecl: NodeDecl): string {
    const jsonSchema = fieldsToJsonExample(nodeDecl.produces.fields);
    const contextSection = this.buildContextSection(nodeDecl);

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

  private buildContextSection(nodeDecl: NodeDecl): string {
    const sections: string[] = [];

    for (const ref of nodeDecl.reads) {
      const contextData = this.outputs.get(ref.context);
      if (contextData !== undefined) {
        if (ref.field) {
          const fieldVal = this.resolveField(contextData, ref.field);
          sections.push(`### ${ref.context}.${ref.field}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
        } else {
          sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(contextData, null, 2)}\n\`\`\``);
        }
      } else {
        // Check if input matches the context name
        const graph = this.program.graphs[0];
        if (graph && ref.context === graph.input) {
          if (ref.field) {
            const fieldVal = this.resolveField(this.options.input, ref.field);
            sections.push(`### ${ref.context}.${ref.field}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
          } else {
            sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(this.options.input, null, 2)}\n\`\`\``);
          }
        } else {
          sections.push(`### ${ref.context}\nNo data available.`);
        }
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : 'No external context required.';
  }

  private generateMockOutput(nodeDecl: NodeDecl): Record<string, unknown> {
    return fieldsToJsonExample(nodeDecl.produces.fields);
  }
}

// Duplicated from agents.ts (not exported there) per convergence spec
function fieldsToJsonExample(fields: Field[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of fields) {
    obj[field.name] = typeToExample(field.type);
  }
  return obj;
}

function typeToExample(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return '<string>';
        case 'Int': return 0;
        case 'Float': return 0.0;
        case 'Bool': return false;
        default: return '<unknown>';
      }
    case 'primitive_range':
      return type.min;
    case 'list':
      return [typeToExample(type.element)];
    case 'map':
      return {};
    case 'optional':
      return typeToExample(type.inner);
    case 'token_bounded':
      return typeToExample(type.inner);
    case 'enum':
      return type.values.join('|');
    case 'struct':
      return fieldsToJsonExample(type.fields);
    case 'domain':
      return `<${type.name}>`;
  }
}
