# Convergence Report — v2.2-R2: Executor Decomposition + Error Codes

## Summary

This round performs two independent changes: (1) decompose executor.ts by extracting prompt-building into `src/runtime/prompt-builder.ts` and flow execution into `src/runtime/flow-runner.ts`, reducing executor to orchestration + node execution + storage; (2) add structured error codes to GraftError via an optional `code` field, covering all existing ScopeChecker (20 sites), TypeChecker (4 sites), TokenEstimator (3 sites), resolver (6 sites), and compiler (1 site) error call sites. Both agents (A2-Pragmatist and A4-Specialist) had high consensus (both scored 8/10). Cross-critique was skipped per score-gating. Disagreements were minor and resolved below.

## Forced Dissent Rulings

No forced dissenter was assigned (cross-critique skipped due to score range 8-8 = 0, below threshold of 2).

## Per-Agent Accept/Reject

### A2-Pragmatist
- Accepted: Pure function extraction for prompt-builder (no class) -- Reason: matches YAGNI, simplifies testing
- Accepted: Optional 4th param for error code -- Reason: backward compatible, minimal change
- Rejected: `runFlow` as export name -- Reason: `executeFlowNodes` matches existing name, better grep-ability, less churn in tests
- Rejected: Separate `runSequential`/`runParallel`/`runForeach` helper functions -- Reason: unnecessary decomposition for a single switch statement; current code is already clear

### A4-Specialist
- Accepted: `executeFlowNodes` name preserved -- Reason: matches current method name, reduces test churn
- Accepted: Single switch function (no separate helpers) -- Reason: matches current code exactly
- Rejected: 24 error codes including future ones (SCOPE_BINDING_COLLISION, GRAPH_MULTIPLE, TRANSFORM_ON_CONDITIONAL, BUDGET_*, PARSE_*) -- Reason: YAGNI; only codes for errors that exist today. Future codes added when their errors are implemented.
- Rejected: Separate SCOPE_FIELD_NOT_FOUND vs TYPE_FIELD_NOT_FOUND granularity -- Reason: SCOPE_FIELD_NOT_FOUND covers scope checker field lookups, TYPE_FIELD_NOT_FOUND covers type checker transform field lookups. The message text already distinguishes context/produces/memory.

## Implementation Spec

### File List
- Create: `src/runtime/prompt-builder.ts`
- Create: `src/runtime/flow-runner.ts`
- Modify: `src/errors/diagnostics.ts`
- Modify: `src/runtime/executor.ts`
- Modify: `src/analyzer/scope.ts`
- Modify: `src/analyzer/types.ts`
- Modify: `src/analyzer/estimator.ts`
- Modify: `src/resolver/resolver.ts`
- Modify: `src/compiler.ts`
- Test: `tests/prompt-builder.test.ts`
- Test: `tests/error-codes.test.ts`

### Error Code Mapping (34 sites total)

**Scope Checker (20 sites in scope.ts):**

| Line | Message Pattern | Code |
|------|----------------|------|
| 49 | memory/context name collision | SCOPE_DUPLICATE_NAME |
| 55 | memory/produces name collision | SCOPE_DUPLICATE_NAME |
| 66 | context max_tokens <= 0 | SCOPE_MAX_TOKENS_INVALID |
| 74 | memory max_tokens <= 0 | SCOPE_MAX_TOKENS_INVALID |
| 91 | reads ref not declared | SCOPE_UNDEFINED_REF |
| 104 | field not in context | SCOPE_FIELD_NOT_FOUND |
| 112 | field not in produces | SCOPE_FIELD_NOT_FOUND |
| 120 | field not in memory | SCOPE_FIELD_NOT_FOUND |
| 135 | writes target not memory | SCOPE_INVALID_WRITES |
| 147 | edge source not declared | SCOPE_UNDEFINED_REF |
| 155 | edge target not declared | SCOPE_UNDEFINED_REF |
| 163 | conditional branch target not declared | SCOPE_UNDEFINED_REF |
| 177 | graph input not context | SCOPE_UNDEFINED_REF |
| 185 | graph output not produces | SCOPE_UNDEFINED_REF |
| 201 | node in flow not declared | SCOPE_UNDEFINED_REF |
| 210 | node in parallel not declared | SCOPE_UNDEFINED_REF |
| 221 | foreach source not declared | SCOPE_UNDEFINED_REF |
| 231 | foreach field not in produces | SCOPE_FIELD_NOT_FOUND |
| 238 | foreach max_iterations < 1 | SCOPE_INVALID_FOREACH |
| 269 | parallel writes warning | SCOPE_PARALLEL_WRITES |

**Type Checker (4 sites in types.ts):**

| Line | Message Pattern | Code |
|------|----------------|------|
| 46 | writes no matching fields | TYPE_SCHEMA_MISMATCH |
| 66 | select field not found | TYPE_FIELD_NOT_FOUND |
| 74 | filter field not found | TYPE_FIELD_NOT_FOUND |
| 81 | drop field not found | TYPE_FIELD_NOT_FOUND |

**Token Estimator (3 sites in estimator.ts):**

| Line | Message Pattern | Code |
|------|----------------|------|
| 59 | worst-case exceeds budget | BUDGET_EXCEEDED |
| 84 | node input exceeds budgetIn | BUDGET_NODE_EXCEEDED |
| 99 | node input exceeds budgetIn (parallel) | BUDGET_NODE_EXCEEDED |

**Resolver (6 sites in resolver.ts):**

| Line | Message Pattern | Code |
|------|----------------|------|
| 95 | path must end .gft | IMPORT_INVALID_PATH |
| 104 | circular import | IMPORT_CIRCULAR |
| 117 | file not found | IMPORT_NOT_FOUND |
| 129 | parse error in import | IMPORT_PARSE_ERROR |
| 171 | name not found in file | IMPORT_NAME_NOT_FOUND |
| 181 | duplicate name | IMPORT_DUPLICATE_NAME |

**Compiler (1 site in compiler.ts):**

| Line | Message Pattern | Code |
|------|----------------|------|
| 62 | no graph declaration | GRAPH_MISSING |

### Implementation Code

#### 1. `src/errors/diagnostics.ts` (complete replacement)

```typescript
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export type GraftErrorCode =
  // Scope errors
  | 'SCOPE_DUPLICATE_NAME'
  | 'SCOPE_UNDEFINED_REF'
  | 'SCOPE_FIELD_NOT_FOUND'
  | 'SCOPE_INVALID_WRITES'
  | 'SCOPE_INVALID_FOREACH'
  | 'SCOPE_PARALLEL_WRITES'
  | 'SCOPE_MAX_TOKENS_INVALID'
  // Type errors
  | 'TYPE_FIELD_NOT_FOUND'
  | 'TYPE_SCHEMA_MISMATCH'
  // Budget warnings
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_NODE_EXCEEDED'
  // Import errors
  | 'IMPORT_CIRCULAR'
  | 'IMPORT_NOT_FOUND'
  | 'IMPORT_NAME_NOT_FOUND'
  | 'IMPORT_DUPLICATE_NAME'
  | 'IMPORT_INVALID_PATH'
  | 'IMPORT_PARSE_ERROR'
  // Graph errors
  | 'GRAPH_MISSING';

export class GraftError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
    public readonly code?: GraftErrorCode,
  ) {
    super(message);
    this.name = 'GraftError';
  }

  format(source: string): string {
    const lines = source.split('\n');
    const lineIdx = this.location.line - 1;
    const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
    const col = Math.max(0, this.location.column - 1);
    const pointer = ' '.repeat(col) + '^';
    return [
      `Error at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

#### 2. `src/runtime/prompt-builder.ts` (new file)

```typescript
import { NodeDecl } from '../parser/ast.js';
import { fieldsToJsonExample } from '../utils.js';

export interface PromptContext {
  outputs: Map<string, unknown>;
  graphInputName: string;
  input: Record<string, unknown>;
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
        const fieldVal = resolveField(contextData, ref.field);
        sections.push(`### ${ref.context}.${ref.field}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
      } else {
        sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(contextData, null, 2)}\n\`\`\``);
      }
    } else {
      // Check if input matches the context name
      if (ref.context === ctx.graphInputName) {
        if (ref.field) {
          const fieldVal = resolveField(ctx.input, ref.field);
          sections.push(`### ${ref.context}.${ref.field}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
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
```

#### 3. `src/runtime/flow-runner.ts` (new file)

```typescript
import { FlowNode } from '../parser/ast.js';
import { NodeResult } from './executor.js';
import { resolveField } from './prompt-builder.js';

export interface FlowContext {
  executeNode: (name: string) => Promise<NodeResult>;
  outputs: Map<string, unknown>;
  input: Record<string, unknown>;
}

export async function executeFlowNodes(
  flow: FlowNode[],
  nodeResults: NodeResult[],
  errors: string[],
  ctx: FlowContext,
): Promise<void> {
  for (const flowNode of flow) {
    if (errors.length > 0) break; // abort on failure

    switch (flowNode.kind) {
      case 'node': {
        if (flowNode.name === 'done') continue;
        const result = await ctx.executeNode(flowNode.name);
        nodeResults.push(result);
        if (!result.success) {
          errors.push(result.error ?? `Node ${flowNode.name} failed`);
        }
        break;
      }

      case 'parallel': {
        const promises = flowNode.branches
          .filter(name => name !== 'done')
          .map(name => ctx.executeNode(name));
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
        const sourceData = ctx.outputs.get(flowNode.source) ?? ctx.input;
        const items = resolveField(sourceData, flowNode.field);
        if (!Array.isArray(items)) {
          errors.push(`foreach: ${flowNode.source}.${flowNode.field} is not an array`);
          break;
        }
        const maxIter = Math.min(items.length, flowNode.maxIterations);
        for (let i = 0; i < maxIter; i++) {
          if (errors.length > 0) break;
          // Set the binding as available data
          ctx.outputs.set(flowNode.binding, items[i]);
          // Execute the body for each item
          await executeFlowNodes(flowNode.body, nodeResults, errors, ctx);
        }
        break;
      }
    }
  }
}
```

#### 4. `src/runtime/executor.ts` (complete replacement)

```typescript
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
        const memData = loadMemory(this.memoryDir, ref.context);
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
```

#### 5. `src/analyzer/scope.ts` (complete replacement)

```typescript
import { Program, FlowNode } from '../parser/ast.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';
import { ProgramIndex } from '../program-index.js';

export class ScopeChecker {
  private program: Program;
  private contextNames: Set<string>;
  private nodeNames: Set<string>;
  private producesMap: Map<string, Set<string>>; // produces name -> field names
  private memoryNames: Set<string>;
  private memoryFieldsMap: Map<string, Set<string>>;
  private nodeWritesMap: Map<string, string[]>; // node name -> writes targets
  private index: ProgramIndex;

  constructor(program: Program) {
    this.program = program;
    this.index = new ProgramIndex(program);
    this.contextNames = new Set(program.contexts.map(c => c.name));
    this.nodeNames = new Set(program.nodes.map(n => n.name));
    this.producesMap = new Map();
    this.memoryNames = new Set(program.memories.map(m => m.name));
    this.memoryFieldsMap = new Map();
    this.nodeWritesMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesMap.set(node.produces.name, fieldNames);
      this.nodeWritesMap.set(node.name, node.writes);
    }
    for (const mem of program.memories) {
      this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
    }
  }

  check(): GraftError[] {
    const errors: GraftError[] = [];
    this.checkDuplicateNames(errors);
    this.checkMaxTokens(errors);
    this.checkNodeReads(errors);
    this.checkNodeWrites(errors);
    this.checkEdges(errors);
    this.checkGraphFlow(errors);
    return errors;
  }

  private checkDuplicateNames(errors: GraftError[]): void {
    for (const mem of this.program.memories) {
      if (this.contextNames.has(mem.name)) {
        errors.push(new GraftError(
          `Name '${mem.name}' is declared as both a context and a memory`,
          mem.location,
          'error',
          'SCOPE_DUPLICATE_NAME',
        ));
      }
      if (this.producesMap.has(mem.name)) {
        errors.push(new GraftError(
          `Name '${mem.name}' conflicts with a produces declaration`,
          mem.location,
          'error',
          'SCOPE_DUPLICATE_NAME',
        ));
      }
    }
  }

  private checkMaxTokens(errors: GraftError[]): void {
    for (const ctx of this.program.contexts) {
      if (ctx.maxTokens <= 0) {
        errors.push(new GraftError(
          `Context '${ctx.name}' has invalid max_tokens: ${ctx.maxTokens} (must be > 0)`,
          ctx.location,
          'error',
          'SCOPE_MAX_TOKENS_INVALID',
        ));
      }
    }
    for (const mem of this.program.memories) {
      if (mem.maxTokens <= 0) {
        errors.push(new GraftError(
          `Memory '${mem.name}' has invalid max_tokens: ${mem.maxTokens} (must be > 0)`,
          mem.location,
          'error',
          'SCOPE_MAX_TOKENS_INVALID',
        ));
      }
    }
  }

  private checkNodeReads(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const ref of node.reads) {
        // ref.context could be a context name, produces name, or memory name
        const isContext = this.contextNames.has(ref.context);
        const isProduces = this.producesMap.has(ref.context);
        const isMemory = this.memoryNames.has(ref.context);

        if (!isContext && !isProduces && !isMemory) {
          errors.push(new GraftError(
            `'${ref.context}' is not declared as a context, produces output, or memory`,
            ref.location,
            'error',
            'SCOPE_UNDEFINED_REF',
          ));
          continue;
        }

        // Check partial reference field
        if (ref.field) {
          if (isContext) {
            const ctx = this.index.contextMap.get(ref.context)!;
            const fieldNames = new Set(ctx.fields.map(f => f.name));
            if (!fieldNames.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in context '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          } else if (isProduces) {
            const fields = this.producesMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in produces '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          } else if (isMemory) {
            const fields = this.memoryFieldsMap.get(ref.context)!;
            if (!fields.has(ref.field)) {
              errors.push(new GraftError(
                `Field '${ref.field}' does not exist in memory '${ref.context}'`,
                ref.location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          }
        }
      }
    }
  }

  private checkNodeWrites(errors: GraftError[]): void {
    for (const node of this.program.nodes) {
      for (const writeName of node.writes) {
        if (!this.memoryNames.has(writeName)) {
          errors.push(new GraftError(
            `writes target '${writeName}' is not a declared memory`,
            node.location,
            'error',
            'SCOPE_INVALID_WRITES',
          ));
        }
      }
    }
  }

  private checkEdges(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      if (!this.nodeNames.has(edge.source)) {
        errors.push(new GraftError(
          `Edge source '${edge.source}' is not a declared node`,
          edge.location,
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      if (edge.target.kind === 'direct') {
        if (!this.nodeNames.has(edge.target.node)) {
          errors.push(new GraftError(
            `Edge target '${edge.target.node}' is not a declared node`,
            edge.location,
            'error',
            'SCOPE_UNDEFINED_REF',
          ));
        }
      } else {
        for (const branch of edge.target.branches) {
          if (!this.nodeNames.has(branch.target)) {
            errors.push(new GraftError(
              `Edge target '${branch.target}' is not a declared node`,
              edge.location,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          }
        }
      }
    }
  }

  private checkGraphFlow(errors: GraftError[]): void {
    for (const graph of this.program.graphs) {
      // Validate graph input references a declared context
      if (!this.contextNames.has(graph.input)) {
        errors.push(new GraftError(
          `Graph input '${graph.input}' is not a declared context`,
          graph.location,
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      // Validate graph output references a declared produces type
      if (!this.producesMap.has(graph.output)) {
        errors.push(new GraftError(
          `Graph output '${graph.output}' is not a declared produces type`,
          graph.location,
          'error',
          'SCOPE_UNDEFINED_REF',
        ));
      }

      // Walk FlowNode tree
      this.walkFlowNodes(graph.flow, graph.location, errors);
    }
  }

  private walkFlowNodes(nodes: FlowNode[], location: SourceLocation, errors: GraftError[]): void {
    for (const step of nodes) {
      switch (step.kind) {
        case 'node':
          if (!this.nodeNames.has(step.name)) {
            errors.push(new GraftError(
              `Node '${step.name}' in graph flow is not declared`,
              location,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          }
          break;
        case 'parallel':
          for (const branch of step.branches) {
            if (!this.nodeNames.has(branch)) {
              errors.push(new GraftError(
                `Node '${branch}' in parallel block is not declared`,
                location,
                'error',
                'SCOPE_UNDEFINED_REF',
              ));
            }
          }
          this.checkParallelWrites(step.branches, location, errors);
          break;
        case 'foreach': {
          // Validate source node exists
          if (!this.nodeNames.has(step.source)) {
            errors.push(new GraftError(
              `Foreach source node '${step.source}' is not declared`,
              location,
              'error',
              'SCOPE_UNDEFINED_REF',
            ));
          }
          // Validate source node produces the referenced field
          const sourceNode = this.index.nodeMap.get(step.source);
          if (sourceNode) {
            const fieldNames = new Set(sourceNode.produces.fields.map(f => f.name));
            if (!fieldNames.has(step.field)) {
              errors.push(new GraftError(
                `Field '${step.field}' does not exist in '${step.source}' produces output`,
                location,
                'error',
                'SCOPE_FIELD_NOT_FOUND',
              ));
            }
          }
          if (step.maxIterations < 1) {
            errors.push(new GraftError(
              'foreach max_iterations must be at least 1',
              location,
              'error',
              'SCOPE_INVALID_FOREACH',
            ));
          }
          // Recurse into body
          this.walkFlowNodes(step.body, location, errors);
          break;
        }
      }
    }
  }

  private checkParallelWrites(branches: string[], location: SourceLocation, errors: GraftError[]): void {
    const memoryWriters = new Map<string, string[]>();

    for (const branch of branches) {
      const writes = this.nodeWritesMap.get(branch);
      if (!writes) continue;
      for (const memName of writes) {
        const writers = memoryWriters.get(memName);
        if (writers) {
          writers.push(branch);
        } else {
          memoryWriters.set(memName, [branch]);
        }
      }
    }

    for (const [memName, writers] of memoryWriters) {
      if (writers.length > 1) {
        errors.push(new GraftError(
          `Nodes ${writers.map(w => `'${w}'`).join(' and ')} both write to memory '${memName}' in parallel`,
          location,
          'warning',
          'SCOPE_PARALLEL_WRITES',
        ));
      }
    }
  }
}
```

#### 6. `src/analyzer/types.ts` (complete replacement)

```typescript
import { Program } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export class TypeChecker {
  private program: Program;
  private producesFieldsMap: Map<string, Set<string>>; // node name -> produces field names
  private memoryFieldsMap: Map<string, Set<string>>; // memory name -> field names

  constructor(program: Program) {
    this.program = program;
    this.producesFieldsMap = new Map();
    this.memoryFieldsMap = new Map();

    for (const node of program.nodes) {
      const fieldNames = new Set(node.produces.fields.map(f => f.name));
      this.producesFieldsMap.set(node.name, fieldNames);
    }
    for (const mem of program.memories) {
      this.memoryFieldsMap.set(mem.name, new Set(mem.fields.map(f => f.name)));
    }
  }

  check(): GraftError[] {
    const diagnostics: GraftError[] = [];
    this.checkEdgeTransforms(diagnostics);
    this.checkWritesSchemaOverlap(diagnostics);
    return diagnostics;
  }

  private checkWritesSchemaOverlap(diagnostics: GraftError[]): void {
    for (const node of this.program.nodes) {
      if (node.writes.length === 0) continue;
      const producesFields = this.producesFieldsMap.get(node.name);
      if (!producesFields) continue; // scope checker catches

      for (const writeName of node.writes) {
        const memoryFields = this.memoryFieldsMap.get(writeName);
        if (!memoryFields) continue; // scope checker catches undeclared

        let hasOverlap = false;
        for (const field of producesFields) {
          if (memoryFields.has(field)) { hasOverlap = true; break; }
        }

        if (!hasOverlap) {
          diagnostics.push(new GraftError(
            `Node '${node.name}' writes to memory '${writeName}' but produces no matching fields`,
            node.location,
            'warning',
            'TYPE_SCHEMA_MISMATCH',
          ));
        }
      }
    }
  }

  private checkEdgeTransforms(errors: GraftError[]): void {
    for (const edge of this.program.edges) {
      const sourceFields = this.producesFieldsMap.get(edge.source);
      if (!sourceFields) continue; // scope checker will catch this

      for (const transform of edge.transforms) {
        // TODO: condition type compatibility -- e.g., >= on String fields (v2)
        if (transform.type === 'select') {
          for (const f of transform.fields) {
            if (!sourceFields.has(f)) {
              errors.push(new GraftError(
                `select: field '${f}' does not exist in '${edge.source}' output`,
                edge.location,
                'error',
                'TYPE_FIELD_NOT_FOUND',
              ));
            }
          }
        } else if (transform.type === 'filter') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        } else if (transform.type === 'drop') {
          if (!sourceFields.has(transform.field)) {
            errors.push(new GraftError(
              `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
              edge.location,
              'error',
              'TYPE_FIELD_NOT_FOUND',
            ));
          }
        }
      }
    }
  }
}
```

#### 7. `src/analyzer/estimator.ts` (complete replacement)

```typescript
import { Program, NodeDecl, EdgeDecl, Transform, FlowNode } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';
import { PARTIAL_FIELD_FACTOR } from '../constants.js';
import { ProgramIndex } from '../program-index.js';

export interface NodeTokenReport {
  name: string;
  estimatedIn: number;
  estimatedOut: number;
}

export interface TokenReport {
  graphName: string;
  budget: number;
  bestCase: number;
  worstCase: number;
  nodes: NodeTokenReport[];
  warnings: GraftError[];
}

export class TokenEstimator {
  private program: Program;
  private index: ProgramIndex;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl>; // "source->target" key

  constructor(program: Program) {
    this.program = program;
    this.index = new ProgramIndex(program);
    this.nodeMap = this.index.nodeMap;
    this.edgeMap = new Map();

    for (const edge of program.edges) {
      if (edge.target.kind === 'direct') {
        this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
      }
      // TODO: store conditional edge branches for token estimation (v2)
    }
  }

  estimate(): TokenReport {
    const graph = this.program.graphs[0]; // v1: single graph
    if (!graph) {
      return { graphName: '', budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
    }

    const warnings: GraftError[] = [];
    const nodeReports: NodeTokenReport[] = [];

    // Populate node reports (for display)
    this.collectNodeReports(graph.flow, nodeReports, warnings);

    // Compute best/worst case costs
    const { best, worst } = this.computeFlowCosts(graph.flow);
    const bestCase = best;
    const worstCase = worst;

    if (worstCase > graph.budget) {
      warnings.push(new GraftError(
        `Worst-case token usage (${worstCase}) exceeds budget (${graph.budget})`,
        graph.location,
        'warning',
        'BUDGET_EXCEEDED',
      ));
    }

    return {
      graphName: graph.name,
      budget: graph.budget,
      bestCase,
      worstCase,
      nodes: nodeReports,
      warnings,
    };
  }

  private collectNodeReports(steps: FlowNode[], reports: NodeTokenReport[], warnings: GraftError[]): void {
    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const estimatedIn = this.getEstimatedIn(step.name, node);
          if (estimatedIn > node.budgetIn) {
            warnings.push(new GraftError(
              `Node '${step.name}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
              node.location,
              'warning',
              'BUDGET_NODE_EXCEEDED',
            ));
          }
          reports.push({ name: step.name, estimatedIn, estimatedOut: node.budgetOut });
          break;
        }
        case 'parallel':
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const estimatedIn = this.getEstimatedIn(branchName, node);
            if (estimatedIn > node.budgetIn) {
              warnings.push(new GraftError(
                `Node '${branchName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
                node.location,
                'warning',
                'BUDGET_NODE_EXCEEDED',
              ));
            }
            reports.push({ name: branchName, estimatedIn, estimatedOut: node.budgetOut });
          }
          break;
        case 'foreach':
          this.collectNodeReports(step.body, reports, warnings);
          break;
      }
    }
  }

  private computeFlowCosts(steps: FlowNode[]): { best: number; worst: number } {
    let best = 0;
    let worst = 0;

    for (const step of steps) {
      switch (step.kind) {
        case 'node': {
          const node = this.nodeMap.get(step.name);
          if (!node) break;
          const cost = this.getNodeCost(step.name, node);
          const retryMul = this.getRetryMultiplier(node);
          best += cost;
          worst += cost * retryMul;
          break;
        }
        case 'parallel': {
          // Parallel: all branches run. Total tokens = sum of all branches.
          for (const branchName of step.branches) {
            const node = this.nodeMap.get(branchName);
            if (!node) continue;
            const cost = this.getNodeCost(branchName, node);
            const retryMul = this.getRetryMultiplier(node);
            best += cost;
            worst += cost * retryMul;
          }
          break;
        }
        case 'foreach': {
          // Foreach: body runs up to maxIterations times.
          // Best case = 1 iteration. Worst case = maxIterations iterations.
          const bodyCosts = this.computeFlowCosts(step.body);
          best += bodyCosts.best * 1;
          worst += bodyCosts.worst * step.maxIterations;
          break;
        }
      }
    }

    return { best, worst };
  }

  private getNodeCost(nodeName: string, node: NodeDecl): number {
    return this.getEstimatedIn(nodeName, node) + node.budgetOut;
  }

  private getEstimatedIn(nodeName: string, node: NodeDecl): number {
    let estimatedIn = 0;
    for (const ref of node.reads) {
      // If reading a context
      const ctx = this.index.contextMap.get(ref.context);
      if (ctx) {
        estimatedIn += ref.field ? Math.floor(ctx.maxTokens * PARTIAL_FIELD_FACTOR) : ctx.maxTokens;
        continue;
      }
      // If reading a memory
      const mem = this.index.memoryMap.get(ref.context);
      if (mem) {
        estimatedIn += ref.field ? Math.floor(mem.maxTokens * PARTIAL_FIELD_FACTOR) : mem.maxTokens;
        continue;
      }
      // If reading a produces output from upstream node
      const sourceNode = this.index.producesNodeMap.get(ref.context);
      if (sourceNode) {
        let upstreamTokens = sourceNode.budgetOut;
        // Check for edge transform reductions
        const edgeKey = `${sourceNode.name}->${nodeName}`;
        const edge = this.edgeMap.get(edgeKey);
        if (edge) {
          upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
        }
        estimatedIn += ref.field ? Math.floor(upstreamTokens * PARTIAL_FIELD_FACTOR) : upstreamTokens;
      }
    }
    return estimatedIn;
  }

  private applyTransformReductions(tokens: number, transforms: Transform[]): number {
    let result = tokens;
    for (const t of transforms) {
      switch (t.type) {
        case 'select':
          result = Math.floor(result * Math.min(PARTIAL_FIELD_FACTOR * t.fields.length, 1.0));
          break;
        case 'filter':
          result = Math.floor(result * 0.5); // filter reduces ~50%
          break;
        case 'drop':
          result = Math.floor(result * 0.85); // drop one field ~15% savings
          break;
        case 'compact':
          result = Math.floor(result * 0.7); // compact ~30% reduction
          break;
        case 'truncate':
          result = Math.min(result, t.tokens);
          break;
      }
    }
    return result;
  }

  private getRetryMultiplier(node: NodeDecl): number {
    if (!node.onFailure) return 1;
    switch (node.onFailure.type) {
      case 'retry':
        return 1 + node.onFailure.max;
      case 'retry_then_fallback':
        return 1 + node.onFailure.max;
      default:
        return 1;
    }
  }
}
```

#### 8. `src/resolver/resolver.ts` (complete replacement)

```typescript
// src/resolver/resolver.ts
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Program, ImportDecl, ContextDecl, NodeDecl } from '../parser/ast.js';
import { GraftError } from '../errors/diagnostics.js';

export type FileReader = (absolutePath: string) => string;

export interface ResolveResult {
  program: Program;
  resolvedFiles: string[];
  errors: GraftError[];
}

interface ExportableNames {
  contexts: Map<string, ContextDecl>;
  nodes: Map<string, NodeDecl>;
}

interface ResolveCtx {
  entryFile: string;
  exportCache: Map<string, ExportableNames>;
  ancestors: Set<string>;
  declaredNames: Map<string, string>; // name -> declaring file (absolute path)
  resolvedFiles: string[];
  errors: GraftError[];
  readFile: FileReader;
}

function extractExportables(program: Program): ExportableNames {
  const contexts = new Map<string, ContextDecl>();
  for (const c of program.contexts) contexts.set(c.name, c);
  const nodes = new Map<string, NodeDecl>();
  for (const n of program.nodes) nodes.set(n.name, n);
  return { contexts, nodes };
}

function parseSource(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function emptyProgram(): Program {
  return { imports: [], memories: [], contexts: [], nodes: [], edges: [], graphs: [] };
}

export function resolve(
  entryProgram: Program,
  sourceFile: string,
  readFile: FileReader = (p) => fs.readFileSync(p, 'utf-8'),
): ResolveResult {
  const absSourceFile = path.resolve(sourceFile);
  const errors: GraftError[] = [];

  const ctx: ResolveCtx = {
    entryFile: absSourceFile,
    exportCache: new Map(),
    ancestors: new Set([absSourceFile]),
    declaredNames: new Map(),
    resolvedFiles: [absSourceFile],
    errors,
    readFile,
  };

  // Register entry file's local names
  for (const c of entryProgram.contexts) ctx.declaredNames.set(c.name, absSourceFile);
  for (const n of entryProgram.nodes) ctx.declaredNames.set(n.name, absSourceFile);

  // Cache entry file's exportables (for diamond import scenarios)
  ctx.exportCache.set(absSourceFile, extractExportables(entryProgram));

  // Resolve all imports
  for (const importDecl of entryProgram.imports) {
    resolveImport(importDecl, absSourceFile, entryProgram, ctx);
  }

  return { program: entryProgram, resolvedFiles: ctx.resolvedFiles, errors: ctx.errors };
}

function resolveImport(
  importDecl: ImportDecl,
  importingFile: string,
  importingProgram: Program,
  ctx: ResolveCtx,
): void {
  const targetPath = path.resolve(path.dirname(importingFile), importDecl.path);
  importDecl.resolvedPath = targetPath; // v2.0-R05

  // Validate .gft extension
  if (!importDecl.path.endsWith('.gft')) {
    ctx.errors.push(new GraftError(
      `Import path must end with .gft: "${importDecl.path}"`,
      importDecl.location,
      'error',
      'IMPORT_INVALID_PATH',
    ));
    return;
  }

  // Circular import detection
  if (ctx.ancestors.has(targetPath)) {
    ctx.errors.push(new GraftError(
      `Circular import detected: "${importDecl.path}"`,
      importDecl.location,
      'error',
      'IMPORT_CIRCULAR',
    ));
    return;
  }

  // Parse and cache target file if not already cached
  if (!ctx.exportCache.has(targetPath)) {
    let targetSource: string;
    try {
      targetSource = ctx.readFile(targetPath);
    } catch {
      ctx.errors.push(new GraftError(
        `Import file not found: "${importDecl.path}"`,
        importDecl.location,
        'error',
        'IMPORT_NOT_FOUND',
      ));
      return;
    }

    let targetProgram: Program;
    try {
      targetProgram = parseSource(targetSource);
    } catch (e) {
      if (e instanceof GraftError) {
        ctx.errors.push(new GraftError(
          `Error parsing imported file "${importDecl.path}": ${e.message}`,
          importDecl.location,
          'error',
          'IMPORT_PARSE_ERROR',
        ));
      } else {
        throw e;
      }
      return;
    }

    // CRITICAL INVARIANT: Extract exportables BEFORE recursing.
    const exportables = extractExportables(targetProgram);
    ctx.exportCache.set(targetPath, exportables);

    if (!ctx.resolvedFiles.includes(targetPath)) {
      ctx.resolvedFiles.push(targetPath);
    }

    // Recurse into target's imports
    ctx.ancestors.add(targetPath);
    for (const nestedImport of targetProgram.imports) {
      resolveImport(nestedImport, targetPath, targetProgram, ctx);
    }
    ctx.ancestors.delete(targetPath);
  }

  // Only merge names into the importing program if this is the entry file.
  // Nested imports only need to parse and cache for transitive re-export prevention.
  if (importingFile !== ctx.entryFile) return;

  // Look up requested names from cached exportables
  const exportables = ctx.exportCache.get(targetPath)!;
  const availableNames = [...exportables.contexts.keys(), ...exportables.nodes.keys()];

  for (const name of importDecl.names) {
    const context = exportables.contexts.get(name);
    const node = exportables.nodes.get(name);

    if (!context && !node) {
      const suggestion = availableNames.length > 0
        ? `. Available: ${availableNames.join(', ')}`
        : '. File has no importable declarations';
      ctx.errors.push(new GraftError(
        `Name "${name}" not found in "${importDecl.path}"${suggestion}`,
        importDecl.location,
        'error',
        'IMPORT_NAME_NOT_FOUND',
      ));
      continue;
    }

    // Duplicate detection
    if (ctx.declaredNames.has(name)) {
      const existingFile = ctx.declaredNames.get(name)!;
      ctx.errors.push(new GraftError(
        `Duplicate name "${name}": already declared in ${path.basename(existingFile)}`,
        importDecl.location,
        'error',
        'IMPORT_DUPLICATE_NAME',
      ));
      continue;
    }

    ctx.declaredNames.set(name, targetPath);
    if (context) importingProgram.contexts.push(context);
    if (node) importingProgram.nodes.push(node);
  }
}
```

#### 9. `src/compiler.ts` (single change at line 62)

Change:
```typescript
      errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 })],
```
To:
```typescript
      errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING')],
```

### Test Code

#### `tests/prompt-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrompt, buildContextSection, resolveField, generateMockOutput, PromptContext } from '../src/runtime/prompt-builder.js';
import { NodeDecl } from '../src/parser/ast.js';

const loc = { line: 1, column: 1, offset: 0 };

function makeNode(overrides: Partial<NodeDecl> = {}): NodeDecl {
  return {
    name: 'TestNode',
    model: 'sonnet',
    budgetIn: 2000,
    budgetOut: 1000,
    reads: [],
    tools: [],
    writes: [],
    produces: {
      name: 'TestOutput',
      fields: [{ name: 'result', type: { kind: 'primitive', name: 'String' }, location: loc }],
      location: loc,
    },
    location: loc,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    outputs: new Map(),
    graphInputName: 'UserRequest',
    input: { question: 'test' },
    ...overrides,
  };
}

describe('resolveField', () => {
  it('returns field value from object', () => {
    expect(resolveField({ a: 1, b: 2 }, 'a')).toBe(1);
  });

  it('returns undefined for null/undefined/primitive', () => {
    expect(resolveField(null, 'a')).toBeUndefined();
    expect(resolveField(undefined, 'a')).toBeUndefined();
    expect(resolveField(42, 'a')).toBeUndefined();
  });

  it('returns undefined for missing field', () => {
    expect(resolveField({ a: 1 }, 'b')).toBeUndefined();
  });
});

describe('buildPrompt', () => {
  it('produces prompt with node name and output schema', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('# TestNode Agent');
    expect(prompt).toContain('"result"');
    expect(prompt).toContain('1000 output tokens');
  });

  it('includes context data from outputs map', () => {
    const node = makeNode({
      reads: [{ context: 'Upstream', location: loc }],
    });
    const outputs = new Map<string, unknown>();
    outputs.set('Upstream', { data: 'hello' });
    const ctx = makeCtx({ outputs });
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('### Upstream');
    expect(prompt).toContain('hello');
  });

  it('falls back to input when context matches graph input name', () => {
    const node = makeNode({
      reads: [{ context: 'UserRequest', location: loc }],
    });
    const ctx = makeCtx({ input: { question: 'what is graft?' } });
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('what is graft?');
  });

  it('shows no data available for unknown context', () => {
    const node = makeNode({
      reads: [{ context: 'Unknown', location: loc }],
    });
    const ctx = makeCtx();
    const prompt = buildPrompt(node, ctx);
    expect(prompt).toContain('No data available');
  });
});

describe('buildContextSection', () => {
  it('returns no external context when no reads', () => {
    const node = makeNode({ reads: [] });
    const ctx = makeCtx();
    const section = buildContextSection(node, ctx);
    expect(section).toBe('No external context required.');
  });

  it('handles partial field reads', () => {
    const node = makeNode({
      reads: [{ context: 'UserRequest', field: 'question', location: loc }],
    });
    const ctx = makeCtx({ input: { question: 'hello', extra: 'ignored' } });
    const section = buildContextSection(node, ctx);
    expect(section).toContain('### UserRequest.question');
    expect(section).toContain('hello');
    expect(section).not.toContain('ignored');
  });

  it('handles partial field reads from outputs', () => {
    const outputs = new Map<string, unknown>();
    outputs.set('Research', { findings: ['a', 'b'], confidence: 0.9 });
    const node = makeNode({
      reads: [{ context: 'Research', field: 'findings', location: loc }],
    });
    const ctx = makeCtx({ outputs });
    const section = buildContextSection(node, ctx);
    expect(section).toContain('### Research.findings');
    expect(section).toContain('"a"');
    expect(section).not.toContain('confidence');
  });
});

describe('generateMockOutput', () => {
  it('returns schema example from produces fields', () => {
    const node = makeNode();
    const mock = generateMockOutput(node);
    expect(mock).toHaveProperty('result');
    expect(typeof mock.result).toBe('string');
  });
});
```

#### `tests/error-codes.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { ScopeChecker } from '../src/analyzer/scope.js';
import { TypeChecker } from '../src/analyzer/types.js';
import { TokenEstimator } from '../src/analyzer/estimator.js';
import { compile } from '../src/compiler.js';
import { resolve } from '../src/resolver/resolver.js';
import { Program } from '../src/parser/ast.js';
import { GraftError, GraftErrorCode } from '../src/errors/diagnostics.js';

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}

function findByCode(errors: GraftError[], code: GraftErrorCode): GraftError | undefined {
  return errors.find(e => e.code === code);
}

describe('GraftError code field', () => {
  it('code is optional and undefined by default', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 });
    expect(err.code).toBeUndefined();
  });

  it('code is set when provided as 4th param', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, 'error', 'GRAPH_MISSING');
    expect(err.code).toBe('GRAPH_MISSING');
  });

  it('severity defaults to error when code provided', () => {
    const err = new GraftError('test', { line: 1, column: 1, offset: 0 }, undefined, 'GRAPH_MISSING');
    expect(err.severity).toBe('error');
  });
});

describe('ScopeChecker error codes', () => {
  it('SCOPE_UNDEFINED_REF on unknown reads reference', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [NonExistent]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_UNDEFINED_REF')).toBeDefined();
  });

  it('SCOPE_FIELD_NOT_FOUND on invalid partial read field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec.nonexistent]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_FIELD_NOT_FOUND')).toBeDefined();
  });

  it('SCOPE_INVALID_WRITES on writes to non-memory', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [NonExistentMem]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_INVALID_WRITES')).toBeDefined();
  });

  it('SCOPE_DUPLICATE_NAME on memory/context collision', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      memory Spec(max_tokens: 1k, storage: file) { data: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_DUPLICATE_NAME')).toBeDefined();
  });

  it('SCOPE_MAX_TOKENS_INVALID on zero max_tokens', () => {
    const program = parse(`
      context Spec(max_tokens: 0) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new ScopeChecker(program).check();
    expect(findByCode(errors, 'SCOPE_MAX_TOKENS_INVALID')).toBeDefined();
  });

  it('SCOPE_PARALLEL_WRITES warning on parallel memory conflict', () => {
    const program = parse(`
      memory Log(max_tokens: 1k, storage: file) { data: String }
      context Spec(max_tokens: 500) { q: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces BOut { data: String }
      }
      graph G(input: Spec, output: AOut, budget: 4k) {
        parallel { A, B } -> done
      }
    `);
    const errors = new ScopeChecker(program).check();
    const warning = findByCode(errors, 'SCOPE_PARALLEL_WRITES');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });
});

describe('TypeChecker error codes', () => {
  it('TYPE_FIELD_NOT_FOUND on select with invalid field', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node A(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces AOut { data: String }
      }
      node B(model: sonnet, budget: 1k/500) {
        reads: [AOut]
        produces BOut { r: String }
      }
      edge A -> B | select(nonexistent)
      graph G(input: Spec, output: BOut, budget: 4k) { A -> B -> done }
    `);
    const errors = new TypeChecker(program).check();
    expect(findByCode(errors, 'TYPE_FIELD_NOT_FOUND')).toBeDefined();
  });

  it('TYPE_SCHEMA_MISMATCH on writes with no field overlap', () => {
    const program = parse(`
      memory Log(max_tokens: 1k, storage: file) { history: String }
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        writes: [Log]
        produces Out { unrelated: String }
      }
      graph G(input: Spec, output: Out, budget: 2k) { N -> done }
    `);
    const errors = new TypeChecker(program).check();
    const warning = findByCode(errors, 'TYPE_SCHEMA_MISMATCH');
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe('warning');
  });
});

describe('Resolver error codes', () => {
  it('IMPORT_INVALID_PATH on non-.gft import', () => {
    const program = parse('import { Foo } from "./bar.txt"');
    const result = resolve(program, 'test.gft', () => { throw new Error('not found'); });
    expect(findByCode(result.errors, 'IMPORT_INVALID_PATH')).toBeDefined();
  });

  it('IMPORT_NOT_FOUND on missing file', () => {
    const program = parse('import { Foo } from "./missing.gft"');
    const result = resolve(program, 'test.gft', () => { throw new Error('ENOENT'); });
    expect(findByCode(result.errors, 'IMPORT_NOT_FOUND')).toBeDefined();
  });

  it('IMPORT_NAME_NOT_FOUND on missing export', () => {
    const program = parse('import { NonExistent } from "./lib.gft"');
    const result = resolve(program, 'test.gft', () => 'context Foo(max_tokens: 100) { x: String }');
    expect(findByCode(result.errors, 'IMPORT_NAME_NOT_FOUND')).toBeDefined();
  });
});

describe('Compiler error codes', () => {
  it('GRAPH_MISSING when no graph declared', () => {
    const result = compile(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 1k/500) {
        reads: [Spec]
        produces Out { r: String }
      }
    `, 'test.gft');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('GRAPH_MISSING');
  });
});

describe('Estimator error codes', () => {
  it('BUDGET_EXCEEDED when worst case exceeds budget', () => {
    const program = parse(`
      context Spec(max_tokens: 500) { q: String }
      node N(model: sonnet, budget: 2k/1k) {
        reads: [Spec]
        produces Out { r: String }
      }
      graph G(input: Spec, output: Out, budget: 1k) { N -> done }
    `);
    const report = new TokenEstimator(program).estimate();
    expect(findByCode(report.warnings, 'BUDGET_EXCEEDED')).toBeDefined();
  });
});
```

### Verification Commands

```bash
# Run all tests (should be 296 existing + ~20 new)
npx vitest run

# Run only new test files
npx vitest run tests/prompt-builder.test.ts tests/error-codes.test.ts

# Type check
npx tsc --noEmit
```

## Ratchet-Locked Items
- [v2.2-R06] Executor delegates to prompt-builder.ts (buildPrompt, buildContextSection, generateMockOutput) and flow-runner.ts (executeFlowNodes) -- Status: LOCKED
- [v2.2-R07] GraftErrorCode union type in diagnostics.ts; code is optional 4th constructor param -- Status: LOCKED
- [v2.2-R08] 18 error codes covering scope (7), type (2), budget (2), import (5), graph (1), foreach (1) -- Status: LOCKED
- [v2.2-R09] PromptContext interface: { outputs, graphInputName, input } -- Status: LOCKED
- [v2.2-R10] FlowContext interface: { executeNode, outputs, input } -- Status: LOCKED
- [v2.2-R11] resolveField exported from prompt-builder.ts, imported by flow-runner.ts -- Status: LOCKED
- [v2.2-R12] Parser and lexer errors do NOT get codes (throw-based, not accumulation) -- Status: LOCKED

## Convergence Metrics
- Final convergence score: 9/10
- Unresolved issues: none
- Notes for next task: Parser/lexer errors remain without codes (they throw, not accumulate). If LSP needs parser error codes, add in a future round. The `emptyProgram()` function in resolver.ts is unused dead code but not removed (out of scope for this round).

---

The files are:

- **`C:\Users\user\OneDrive\Documents\Graft\harness\tasks\v2.2-R2\step3\convergence.md`** -- the report above (to be written)
- **`C:\Users\user\OneDrive\Documents\Graft\src\errors\diagnostics.ts`** -- add GraftErrorCode type, optional code param
- **`C:\Users\user\OneDrive\Documents\Graft\src\runtime\prompt-builder.ts`** -- new file, extracted from executor
- **`C:\Users\user\OneDrive\Documents\Graft\src\runtime\flow-runner.ts`** -- new file, extracted from executor
- **`C:\Users\user\OneDrive\Documents\Graft\src\runtime\executor.ts`** -- reduced, delegates to prompt-builder and flow-runner
- **`C:\Users\user\OneDrive\Documents\Graft\src\analyzer\scope.ts`** -- all 20 GraftError sites get error codes
- **`C:\Users\user\OneDrive\Documents\Graft\src\analyzer\types.ts`** -- all 4 GraftError sites get error codes
- **`C:\Users\user\OneDrive\Documents\Graft\src\analyzer\estimator.ts`** -- all 3 GraftError sites get error codes
- **`C:\Users\user\OneDrive\Documents\Graft\src\resolver\resolver.ts`** -- all 6 GraftError sites get error codes
- **`C:\Users\user\OneDrive\Documents\Graft\src\compiler.ts`** -- 1 GraftError site gets GRAPH_MISSING code
- **`C:\Users\user\OneDrive\Documents\Graft\tests\prompt-builder.test.ts`** -- new, ~11 tests for prompt builder
- **`C:\Users\user\OneDrive\Documents\Graft\tests\error-codes.test.ts`** -- new, ~13 tests for error code assertions