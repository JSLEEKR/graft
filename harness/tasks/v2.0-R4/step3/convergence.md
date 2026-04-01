# Convergence Report — v2.0-R4: CodeGen + Runtime Memory Support

## Summary

4:0 consensus on core approach (memoryNames Set, uniform read via this.outputs, dry run guard). 3:1 on field-matching merge (A1 prefers full overwrite but acknowledges A4 is more correct). 3:1 on dropping atomic writes for v2.0.

## Forced Dissent Ruling
- A2 (forced dissenter) self-rebutted all 3 positions:
  1. Shallow merge is wrong (pollutes memory with non-schema fields) — ACCEPTED
  2. Direct load in buildContextSection breaks uniform read pattern — ACCEPTED
  3. Empty {} scaffold worse than .gitkeep — ACCEPTED
- Rebuttal strength: 9/10. All self-rebuttals well-argued and adopted.

## Unanimous Agreement

1. `generateAgent(node, memoryNames: Set<string> = new Set())` — default param for backward compat
2. `formatReads(node, memoryNames)` — distinguish `.graft/memory/` vs `.graft/session/`
3. New `formatWrites(node, memoryNames)` — memory save section in agent markdown
4. Full filename in agent prompts: `.graft/memory/${name.toLowerCase()}.json` (A3)
5. `.graft/memory/.gitkeep` scaffold (conditional on program.memories.length > 0)
6. `loadMemory(name)` returns null on missing/corrupt file, try-catch around JSON.parse
7. `saveMemory(name, data)` with `writeFileSync` (no atomic writes for v2.0)
8. Dry run guard: skip memory saves when `this.options.dryRun`
9. Always reload memory from disk for memory refs in executeNode (no `!this.outputs.has()` guard) — fixes foreach staleness bug
10. `buildContextSection` — ZERO changes (uniform read from this.outputs)
11. `cleanSession` — ZERO changes (already only cleans node_outputs)
12. Memory preamble section in orchestration + per-step memory annotations

## Majority Decision (3:1)

13. Field-matching merge for memory writes: only write output fields that match memory schema fields. Preserves unrelated memory fields.
    - A1 dissent: YAGNI, full overwrite is simpler. Counter: full overwrite wipes unrelated fields (data loss). REJECTED.

## Dropped

- Atomic writes (A3 conceded for v2.0; inconsistent with codebase)
- Schema-default scaffold files (A4; avoids recompile overwriting runtime data)
- A2's shallow merge (self-rebutted)
- A2's buildContextSection direct load (self-rebutted)
- Type-aware default values in codegen (A4; YAGNI, avoids duplication)

## Implementation Code

### 1. agents.ts changes

```typescript
// Signature change (with default param for backward compat)
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
${writesSection}
## Output Contract
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

// Updated formatReads — distinguishes memory from session
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

// NEW: formatWrites
function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  const memoryWrites = node.writes.filter(w => memoryNames.has(w));
  if (memoryWrites.length === 0) return '';
  return `
## Memory Saving
After producing output, save to persistent memory:
${memoryWrites.map(w => `- Save to \`.graft/memory/${w.toLowerCase()}.json\``).join('\n')}
`;
}
```

### 2. codegen.ts changes

```typescript
export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Build memory name set for agent generation
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents — pass memoryNames
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node, memoryNames),
    });
  }

  // Hooks (unchanged)
  // ... existing hook code ...

  // Orchestration
  files.push({
    path: '.claude/CLAUDE.md',
    content: generateOrchestration(program, report),
  });

  // Settings
  const settings = generateSettings(program, sourceFile);
  files.push({
    path: '.claude/settings.json',
    content: JSON.stringify(settings, null, 2),
  });

  // Runtime scaffold
  files.push({ path: '.graft/session/node_outputs/.gitkeep', content: '' });
  files.push({ path: '.graft/token_log.txt', content: '' });

  // Memory scaffold — conditional
  if (program.memories.length > 0) {
    files.push({ path: '.graft/memory/.gitkeep', content: '' });
  }

  return files;
}
```

### 3. orchestration.ts changes

```typescript
export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const memoryNames = new Set(program.memories.map(m => m.name));

  const edgeMap = new Map<string, boolean>();
  for (const edge of program.edges) {
    if (edge.target.kind === 'direct' && edge.transforms.length > 0) {
      edgeMap.set(`${edge.source}->${edge.target.node}`, true);
    }
  }

  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null, program, memoryNames);

  // Memory preamble
  const memorySection = program.memories.length > 0
    ? `
## Persistent Memory
${program.memories.map(m => `- \`${m.name}\`: \`.graft/memory/${m.name.toLowerCase()}.json\` (${m.maxTokens.toLocaleString('en-US')} tokens max)`).join('\n')}
- Memories persist across runs. Nodes with \`writes\` clauses update memory after execution.

`
    : '';

  return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: ${graph.budget.toLocaleString('en-US')} tokens
Best case: ${report.bestCase.toLocaleString('en-US')} tokens
Worst case: ${report.worstCase.toLocaleString('en-US')} tokens
${memorySection}
## Execution Plan
${steps}
## Token Budget Tracking
Check \`.graft/token_log.txt\` after each step.
- 80% consumed: switch remaining agents to compact mode
- 90% consumed: skip non-critical agents

## Failure Recovery
- Agent failure: follow on_failure policy in each agent definition
- Token overrun: switch to compact mode, then skip non-critical steps
- Complete failure: intermediate results preserved in \`.graft/session/\`
`;
}

// generateSteps gains program and memoryNames params
function generateSteps(
  flow: FlowNode[],
  report: TokenReport,
  edgeMap: Map<string, boolean>,
  startStep: number,
  prevNode: string | null,
  program: Program,
  memoryNames: Set<string>,
): { text: string; nextStep: number; lastNode: string | null } {
  // ... existing flow iteration ...
  // For 'node' case, add after inputSource:
  //   let memoryLines = '';
  //   if (nodeDecl) {
  //     const memReads = nodeDecl.reads.filter(r => memoryNames.has(r.context));
  //     for (const mr of memReads) {
  //       memoryLines += `\n- Memory load: \`.graft/memory/${mr.context.toLowerCase()}.json\``;
  //     }
  //     for (const w of nodeDecl.writes) {
  //       if (memoryNames.has(w)) {
  //         memoryLines += `\n- Memory save: \`.graft/memory/${w.toLowerCase()}.json\``;
  //       }
  //     }
  //   }
  //   Append memoryLines to the step text after inputSource
  // 
  // For 'parallel' case, add mem-read/mem-write annotations per branch
  // For 'foreach' case, no additional memory annotations (body handles it)
}
```

### 4. executor.ts changes

```typescript
export class Executor {
  // ... existing fields ...
  private memoryDir: string;
  private memoryNames: Set<string>;

  constructor(program: Program, options: RunOptions) {
    // ... existing constructor ...
    this.memoryDir = path.join(options.workDir, '.graft', 'memory');
    this.memoryNames = new Set(program.memories.map(m => m.name));
  }

  // NEW: loadMemory — returns null on missing/corrupt
  private loadMemory(name: string): Record<string, unknown> | null {
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // NEW: saveMemory — field-matching merge + dry run guard
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

  async execute(): Promise<RunResult> {
    // ... existing setup ...
    this.cleanSession();
    fs.mkdirSync(this.nodeOutputDir, { recursive: true });

    // Ensure memory directory exists (if memories declared)
    if (this.program.memories.length > 0) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }

    // Write input to session (unchanged)
    // Execute flow nodes (unchanged)
    // ... rest unchanged ...
  }

  private async executeNode(name: string): Promise<NodeResult> {
    const startTime = Date.now();
    const nodeDecl = this.nodeMap.get(name);
    if (!nodeDecl) { /* ... existing error ... */ }

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

    // Dry run: produce mock output (NO memory save)
    if (this.options.dryRun) {
      const mockOutput = this.generateMockOutput(nodeDecl);
      this.storeOutput(nodeDecl, mockOutput);
      return { node: name, output: mockOutput, durationMs: Date.now() - startTime, success: true };
    }

    // ... rest of executeNode unchanged (buildPrompt, spawn, storeOutput) ...
  }

  private storeOutput(nodeDecl: NodeDecl, output: unknown): void {
    // ... existing storeOutput code unchanged ...

    // NEW: Save to memory for writes targets
    for (const writeName of nodeDecl.writes) {
      if (this.memoryNames.has(writeName)) {
        this.saveMemory(writeName, output);
      }
    }
  }

  // cleanSession — NO CHANGES (already only cleans node_outputs)
  // buildContextSection — NO CHANGES (reads from this.outputs, which now includes memory data)
  // buildPrompt — NO CHANGES
}
```

## Tests (~15 tests)

### CodeGen Tests (tests/codegen.test.ts)
1. Agent with memory read shows `.graft/memory/` path (not `.graft/session/`)
2. Agent with memory write shows "Memory Saving" section
3. Agent without memory reads — no memory paths
4. Agent without writes — no "Memory Saving" section
5. Existing generateAgent tests still pass (default param)
6. Memory scaffold `.graft/memory/.gitkeep` present when memories declared
7. No memory scaffold when no memories declared
8. Orchestration shows "Persistent Memory" section when memories declared
9. Orchestration shows memory load/save per step

### Runtime Tests (tests/runner.test.ts)
10. Memory load — file exists, returns parsed JSON
11. Memory load — file missing (first run), context shows "No data available"
12. Memory load — corrupted JSON, returns null gracefully
13. Memory save — writes to `.graft/memory/<name>.json` after node execution
14. Memory save — field-matching merge preserves unrelated fields
15. Dry run — does NOT write memory files
16. Memory not cleaned by session cleanup
17. Memory persists across executor instances (simulate two runs)

## Ratchet-Locked Items

- [v2.0-R24] generateAgent gets memoryNames with default param for backward compat — LOCKED
- [v2.0-R25] formatReads distinguishes memory (`.graft/memory/`) from session — LOCKED
- [v2.0-R26] Memory writes use field-matching merge (schema-aware, preserves unrelated fields) — LOCKED
- [v2.0-R27] Always reload memory from disk in executeNode (no outputs.has() guard) — LOCKED
- [v2.0-R28] Dry run skips memory saves — LOCKED
- [v2.0-R29] loadMemory returns null on missing/corrupt file (try-catch) — LOCKED
- [v2.0-R30] Memory scaffold: conditional .gitkeep (no per-file scaffolding) — LOCKED
- [v2.0-R31] cleanSession and buildContextSection unchanged (memory in separate dir tree) — LOCKED
