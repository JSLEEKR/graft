import * as fs from 'node:fs';
import * as path from 'node:path';
import { Program, NodeDecl, EdgeDecl, FlowNode } from '../parser/ast.js';
import { SpawnOptions, SpawnResult, spawnClaude, parseCLIOutput, TokenUsage } from './subprocess.js';
import { applyTransforms } from './transforms.js';
import { TokenTracker } from './token-tracker.js';
import { MODEL_MAP } from '../constants.js';
import { fieldsToJsonExample } from '../utils.js';
import { loadMemory, saveMemory } from './memory.js';
import { ProgramIndex } from '../program-index.js';
import { buildPrompt, generateMockOutput, PromptContext } from './prompt-builder.js';
import { executeFlowNodes, FlowContext } from './flow-runner.js';

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
  tokenUsage?: TokenUsage;
}

export interface RunResult {
  success: boolean;
  graph: string;
  nodeResults: NodeResult[];
  finalOutput: unknown;
  totalDurationMs: number;
  errors: string[];
  tokenUsage?: {
    budget: number;
    consumed: number;
    fraction: number;
    perNode: Array<{ node: string; actual?: number; estimated: number }>;
  };
}

export class Executor {
  private program: Program;
  private options: RunOptions;
  private index: ProgramIndex;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl[]>;
  private outputs: Map<string, unknown>;
  private spawner: SpawnerFn;
  private sessionDir: string;
  private nodeOutputDir: string;
  private memoryDir: string;
  private memoryNames: Set<string>;
  private tracker!: TokenTracker;

  constructor(program: Program, options: RunOptions) {
    this.program = program;
    this.options = options;
    this.index = new ProgramIndex(program);
    this.spawner = options.spawner ?? spawnClaude;
    this.outputs = new Map();
    this.memoryDir = path.join(options.workDir, '.graft', 'memory');
    this.memoryNames = new Set(program.memories.map(m => m.name));

    // Reuse index maps
    this.nodeMap = this.index.nodeMap;
    this.edgeMap = this.index.edgesBySource;

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

    // Initialize token tracker
    const tokenLogPath = path.join(this.options.workDir, '.graft', 'token_log.txt');
    fs.mkdirSync(path.dirname(tokenLogPath), { recursive: true });
    fs.writeFileSync(tokenLogPath, '');
    this.tracker = new TokenTracker(graph.budget, tokenLogPath);

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
    const flowCtx: FlowContext = {
      executeNode: (name: string) => this.executeNode(name),
      outputs: this.outputs,
      input: this.options.input,
    };

    try {
      await executeFlowNodes(graph.flow, nodeResults, errors, flowCtx);
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
      tokenUsage: this.tracker.getSummary(),
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
        const memData = loadMemory(this.memoryDir, ref.context, { verbose: this.options.verbose });
        if (memData !== null) {
          this.outputs.set(ref.context, memData);
        } else {
          this.outputs.delete(ref.context);
        }
      }
    }

    // Build prompt context
    const graph = this.program.graphs[0];
    const promptCtx: PromptContext = {
      outputs: this.outputs,
      graphInputName: graph ? graph.input : '',
      input: this.options.input,
    };

    // Dry run: produce mock output
    if (this.options.dryRun) {
      const mockOutput = generateMockOutput(nodeDecl);
      this.storeOutput(nodeDecl, mockOutput);
      const estimated = { in: nodeDecl.budgetIn, out: nodeDecl.budgetOut };
      this.tracker.record(name, undefined, estimated);
      return {
        node: name,
        output: mockOutput,
        durationMs: Date.now() - startTime,
        success: true,
      };
    }

    // Build prompt
    const prompt = buildPrompt(nodeDecl, promptCtx);
    const resolvedModel = MODEL_MAP[nodeDecl.model] || nodeDecl.model;

    const args = [
      '--output-format', 'json',
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
          const cliOutput = parseCLIOutput(result.stdout);
          const output = cliOutput.content;
          const tokenUsage = cliOutput.tokenUsage;
          this.storeOutput(nodeDecl, output);
          const estimated = { in: nodeDecl.budgetIn, out: nodeDecl.budgetOut };
          this.tracker.record(name, tokenUsage, estimated);
          return {
            node: name,
            output,
            durationMs: Date.now() - startTime,
            success: true,
            tokenUsage,
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

      const cliOutput = parseCLIOutput(result.stdout);
      const output = cliOutput.content;
      const tokenUsage = cliOutput.tokenUsage;
      this.storeOutput(nodeDecl, output);

      const estimated = { in: nodeDecl.budgetIn, out: nodeDecl.budgetOut };
      this.tracker.record(name, tokenUsage, estimated);

      if (this.options.verbose) {
        if (this.tracker.isCritical) {
          console.log(`[BUDGET] Critical: ${Math.round(this.tracker.fraction * 100)}% of budget consumed`);
        } else if (this.tracker.isWarning) {
          console.log(`[BUDGET] Warning: ${Math.round(this.tracker.fraction * 100)}% of budget consumed`);
        }
      }

      return {
        node: name,
        output,
        durationMs: Date.now() - startTime,
        success: true,
        tokenUsage,
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
        if (!this.options.dryRun) {
          const mem = this.index.memoryMap.get(writeName);
          if (mem) {
            saveMemory(this.memoryDir, mem, output);
          }
        }
      }
    }
  }
}
