# A3-Skeptic: v2.0-R4 CodeGen + Runtime Memory Support

## Proposed Implementation

My implementation follows the same overall structure as the plan (Set<string> parameter, loadMemory/saveMemory, memory-aware formatReads), but differs in three areas where I believe the straightforward approach hides bugs: corrupted memory handling, atomic writes, and dry run memory pollution.

### 1. agents.ts: Memory-Aware Reads + Writes Sections

```typescript
// agents.ts — updated signature
export function generateAgent(node: NodeDecl, memoryNames: Set<string>): string {
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
After producing output, write updated memory to persistent storage:
${memoryWrites.map(w => `- Save to \`.graft/memory/${w.toLowerCase()}.json\``).join('\n')}
`;
}
```

**Difference from A1**: I include the full memory filename in the reads instruction (`${ref.context.toLowerCase()}.json`), not just the directory. The agent prompt should tell the LLM *exactly* which file to read, not leave it to infer the filename. A vague path like `.graft/memory/` could cause an LLM agent to list the directory or guess wrong.

### 2. codegen.ts: Pass memoryNames, Scaffold Memory Dir

```typescript
export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Build memory name set for agent generation
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node, memoryNames),
    });
  }

  // Hooks (unchanged)
  for (const edge of program.edges) {
    const hook = generateHook(edge);
    if (hook && edge.target.kind === 'direct') {
      const source = edge.source.toLowerCase();
      const target = edge.target.node.toLowerCase();
      files.push({
        path: `.claude/hooks/${source}-to-${target}.sh`,
        content: hook,
      });
    }
  }

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

  // Memory scaffold — only when memories declared
  if (program.memories.length > 0) {
    files.push({ path: '.graft/memory/.gitkeep', content: '' });
  }

  return files;
}
```

No disagreements here. Conditional memory scaffold is correct.

### 3. orchestration.ts: Memory Load/Save in Execution Plan

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

  return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: ${graph.budget.toLocaleString('en-US')} tokens
Best case: ${report.bestCase.toLocaleString('en-US')} tokens
Worst case: ${report.worstCase.toLocaleString('en-US')} tokens

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

function generateSteps(
  flow: FlowNode[],
  report: TokenReport,
  edgeMap: Map<string, boolean>,
  startStep: number,
  prevNode: string | null,
  program: Program,
  memoryNames: Set<string>,
): { text: string; nextStep: number; lastNode: string | null } {
  let text = '';
  let stepNum = startStep;
  let prev = prevNode;

  for (const step of flow) {
    switch (step.kind) {
      case 'node': {
        const lowerName = step.name.toLowerCase();
        const nodeReport = report.nodes.find(n => n.name === step.name);
        const nodeDecl = program.nodes.find(n => n.name === step.name);

        let inputSource = '';
        if (prev) {
          const hasTransform = edgeMap.has(`${prev}->${step.name}`);
          if (hasTransform) {
            inputSource = `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json\``;
          } else {
            inputSource = `\n- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}.json\``;
          }
        }

        // Memory load/save lines
        let memoryLines = '';
        if (nodeDecl) {
          const memReads = nodeDecl.reads.filter(r => memoryNames.has(r.context));
          for (const mr of memReads) {
            memoryLines += `\n- Memory load: \`.graft/memory/${mr.context.toLowerCase()}.json\``;
          }
          for (const w of nodeDecl.writes) {
            if (memoryNames.has(w)) {
              memoryLines += `\n- Memory save: \`.graft/memory/${w.toLowerCase()}.json\``;
            }
          }
        }

        text += `
### Step ${stepNum}: ${step.name} [sequential]
- Agent: ${lowerName}${inputSource}${memoryLines}
- Expected tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}
- Completion: \`===NODE_COMPLETE:${lowerName}===\`
- Output: \`.graft/session/node_outputs/${lowerName}.json\`
`;
        prev = step.name;
        stepNum++;
        break;
      }

      case 'parallel': {
        const branchList = step.branches.join(', ');
        text += `
### Step ${stepNum}: [parallel] ${branchList}
- Run concurrently, wait for all to complete
`;
        for (const branchName of step.branches) {
          const lowerName = branchName.toLowerCase();
          const nodeReport = report.nodes.find(n => n.name === branchName);
          const nodeDecl = program.nodes.find(n => n.name === branchName);

          // Memory lines for parallel branches
          let memNote = '';
          if (nodeDecl) {
            const memReads = nodeDecl.reads.filter(r => memoryNames.has(r.context));
            const memWriteNames = nodeDecl.writes.filter(w => memoryNames.has(w));
            if (memReads.length > 0) {
              memNote += ` | mem-read: ${memReads.map(r => r.context.toLowerCase()).join(', ')}`;
            }
            if (memWriteNames.length > 0) {
              memNote += ` | mem-write: ${memWriteNames.map(w => w.toLowerCase()).join(', ')}`;
            }
          }

          text += `- Agent: ${lowerName} -- tokens: input ~${nodeReport?.estimatedIn.toLocaleString('en-US') || '?'} / output ~${nodeReport?.estimatedOut.toLocaleString('en-US') || '?'}${memNote}
`;
        }
        text += `- Completion: all ${step.branches.length} \`===NODE_COMPLETE===\` signals received
`;
        prev = null;
        stepNum++;
        break;
      }

      case 'foreach': {
        text += `
### Step ${stepNum}: [foreach over ${step.source}.output.${step.field}, max ${step.maxIterations} iterations]
- For each \`${step.binding}\` in list:
`;
        let subLetter = 'a';
        for (const bodyStep of step.body) {
          if (bodyStep.kind === 'node') {
            text += `  - Sub-step ${stepNum}${subLetter}: ${bodyStep.name} [foreach-body]
`;
            subLetter = String.fromCharCode(subLetter.charCodeAt(0) + 1);
          }
        }
        text += `- Completion: all iterations done or list exhausted
`;
        prev = null;
        stepNum++;
        break;
      }
    }
  }

  return { text, nextStep: stepNum, lastNode: prev };
}
```

**Difference from A1**: I add memory annotations to parallel branches too. If a parallel branch reads/writes memory, the orchestration plan should show it. Otherwise the human (or orchestrating LLM) has no visibility into parallel memory access patterns.

### 4. executor.ts: The Dangerous Part

This is where most bugs will live. Here are the critical additions:

#### 4a. New fields and helpers

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

  private loadMemory(name: string): Record<string, unknown> | null {
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw.trim() === '') return null; // BUG PREVENTION: empty file
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Corrupted JSON — return null, don't crash the pipeline
      return null;
    }
  }

  private saveMemory(name: string, data: unknown): void {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    // Atomic write: write to temp file, then rename
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
  }
}
```

#### 4b. Memory load in executeNode

```typescript
private async executeNode(name: string): Promise<NodeResult> {
  const startTime = Date.now();
  const nodeDecl = this.nodeMap.get(name);

  if (!nodeDecl) {
    return {
      node: name, output: null, durationMs: Date.now() - startTime,
      success: false, error: `Node '${name}' not found in program`,
    };
  }

  // Load memory for reads that reference memory declarations
  for (const ref of nodeDecl.reads) {
    if (this.memoryNames.has(ref.context) && !this.outputs.has(ref.context)) {
      const memData = this.loadMemory(ref.context);
      if (memData !== null) {
        this.outputs.set(ref.context, memData);
      }
    }
  }

  // Dry run: produce mock output but DO NOT save memory
  if (this.options.dryRun) {
    const mockOutput = this.generateMockOutput(nodeDecl);
    this.storeOutput(nodeDecl, mockOutput);
    return {
      node: name, output: mockOutput, durationMs: Date.now() - startTime,
      success: true,
    };
  }

  // ... rest of executeNode unchanged (build prompt, spawn, extract, storeOutput) ...
}
```

#### 4c. Memory save in storeOutput (with dry run guard)

```typescript
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

  // Apply edge transforms (unchanged)
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

  // Save to memory for writes targets — SKIP in dry run
  if (!this.options.dryRun) {
    for (const writeName of nodeDecl.writes) {
      if (this.memoryNames.has(writeName)) {
        this.saveMemory(writeName, output);
      }
    }
  }
}
```

#### 4d. execute() — ensure memory directory

```typescript
async execute(): Promise<RunResult> {
  // ... existing setup ...
  this.cleanSession();
  fs.mkdirSync(this.nodeOutputDir, { recursive: true });

  // Ensure memory directory exists when memories declared
  if (this.program.memories.length > 0) {
    fs.mkdirSync(this.memoryDir, { recursive: true });
  }

  // ... rest unchanged ...
}
```

#### 4e. cleanSession — NO CHANGES

The existing `cleanSession` only removes files in `this.nodeOutputDir`. Memory is in a separate directory tree. No changes needed. This is already safe.

### 5. buildContextSection — NO CHANGES

Memory data is loaded into `this.outputs` before `buildContextSection` runs. The existing code already handles it: it checks `this.outputs.get(ref.context)`, which will find memory data there. No changes needed.

## Trade-off Analysis

### 1. Corrupted memory JSON: crash vs. return null

**Chosen**: Return `null` (silent recovery).
**Alternative**: Throw and fail the node.

Returning null is correct because:
- Memory is *supplemental* context. A first run has no memory and works fine. Corrupted memory should degrade to "first run" behavior, not crash the pipeline.
- The LLM agent will see "No data available" for the memory context section. This is the same behavior as a first run.
- Crashing would mean a single bad byte in a memory file makes the entire pipeline permanently broken until manual intervention.

The downside: if memory corruption is caused by a systematic bug (e.g., bad saveMemory encoding), it will silently produce incorrect results. Acceptable tradeoff for v2.0.

### 2. Atomic writes via rename

**Chosen**: Write to `.tmp` file, then `fs.renameSync`.
**Alternative**: Direct `writeFileSync` (as in the plan).

Direct writes are dangerous because:
- If the process crashes mid-write (Ctrl+C, OOM, timeout), the memory file is truncated/empty.
- Next run's `loadMemory` reads this corrupted partial JSON.
- With direct write: `JSON.parse` throws, we return null (tolerable but data is lost).
- With atomic write: the `.tmp` file is corrupt, but the real file still has the last good data.

This is the `stdin.end()` class of bug (v1.2-R09). Silent data corruption that only manifests on next run. The rename trick is a single extra line and eliminates the failure mode entirely.

**Platform note**: On Windows, `fs.renameSync` fails if the target file is open by another process. Since Graft is single-process sequential (no concurrent `saveMemory` calls to the same file except in parallel node case), this is safe. In the parallel case, see issue #3 below.

### 3. Dry run memory pollution

**Chosen**: Skip memory saves during dry run.
**Alternative**: Save mock data to memory.

Dry run is for testing pipeline flow without real LLM calls. If dry run saves mock data to memory, a subsequent real run will load that mock data as "previous conversation history" or "learned preferences." This is silent data corruption that's nearly impossible to debug.

The fix: check `this.options.dryRun` before memory saves. Memory *loads* are fine in dry run (you want to see what context the agent would receive).

### 4. `!this.outputs.has()` guard in memory load

**Chosen**: Only load memory from disk if the outputs map doesn't already have data for that context name.

This prevents a subtle bug: if node A produces output named "ConversationLog" (same as a memory name), and node B reads "ConversationLog", the in-memory session data from node A should take priority over the on-disk persisted memory. Without this guard, we'd overwrite fresher data with stale disk data.

### 5. Full filename in agent prompts vs. directory path only

**Chosen**: Include the full filename (e.g., `.graft/memory/conversationlog.json`).
**Alternative**: Just the directory path (e.g., `.graft/memory/`).

LLM agents are literal instruction followers. If we say "Load from `.graft/memory/`", the agent might `ls` the directory, or try to read `.graft/memory/ConversationLog.json` (wrong case). Including the exact filename removes ambiguity.

## Potential Issues

### CRITICAL: Issue 1 — Empty file on first write if directory doesn't exist

`saveMemory` calls `fs.mkdirSync` then `fs.writeFileSync`. If the memory directory doesn't exist AND `mkdirSync` fails (permissions, disk full), the `.tmp` write also fails, and the `renameSync` crashes with an unhandled error. The whole `storeOutput` call fails, which means the node's session output is already written but memory is not. Inconsistent state.

**Mitigation**: The `saveMemory` try-catch isn't shown above. We need one:

```typescript
private saveMemory(name: string, data: unknown): void {
  try {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Memory save failure is non-fatal — pipeline continues, memory just won't persist
    // Could log warning if verbose mode
  }
}
```

This is important: memory save failure should NOT abort the pipeline. The node's output is already stored in the session directory. Memory is a persistence optimization, not a correctness requirement.

### CRITICAL: Issue 2 — Parallel nodes writing same memory (last-writer-wins race)

Two parallel nodes both with `writes: [ConversationLog]`. `Promise.allSettled` runs them concurrently. Both complete, both call `storeOutput`, both call `saveMemory("ConversationLog", ...)`. The second `renameSync` overwrites the first's data.

With atomic writes, this is data loss (not corruption), which is slightly better. But it's still wrong.

**Severity**: The analyzer (v2.0-R3) validates that `writes` entries reference declared memories but doesn't check for parallel write conflicts. This is a valid pipeline to write:

```graft
graph G(input: In, output: Out, budget: 10k) {
  [NodeA, NodeB] -> Merger -> done
}
```

Where both NodeA and NodeB write to the same memory.

**Recommendation**: This is acceptable for v2.0 MVP. The spec says nothing about parallel write semantics. Document it as undefined behavior. If we wanted to fix it, the analyzer should warn when parallel branches both write the same memory name.

### Issue 3 — Windows `renameSync` over existing file

On Windows, `fs.renameSync(src, dest)` works when `dest` exists (it replaces atomically) on NTFS since Node.js uses `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`. However, if another process has the destination file open (e.g., a file watcher, antivirus scan), it will throw `EACCES`. This is the same risk as the current `writeFileSync` approach, so no regression. But worth noting.

**Alternative if atomic writes are rejected**: Use direct `writeFileSync` like everything else in the codebase. The codebase already uses `writeFileSync` for session outputs without atomic writes. Consistency argument: if we're not atomically writing session outputs, why are we atomically writing memory? Counter-argument: session outputs are ephemeral (cleaned each run), but memory persists forever. Data loss severity is different.

### Issue 4 — `loadMemory` empty file edge case

If the memory file exists but is empty (0 bytes), `JSON.parse('')` throws. The `try-catch` handles this, but I also added an explicit `raw.trim() === ''` check to make the intent clear and avoid relying on exception flow for a predictable case. Empty files can happen when:
- A text editor creates the file but doesn't save content
- A previous `writeFileSync` was interrupted at exactly the wrong moment (before any bytes written)
- User manually creates `.graft/memory/foo.json` as an empty file

### Issue 5 — Case sensitivity of memory names

Memory name `ConversationLog` maps to file `conversationlog.json`. The `toLowerCase()` call is consistent with the session output convention (`node.name.toLowerCase() + '.json'`). But what if two memories have names that differ only by case? E.g., `memory Log` and `memory LOG`. Both map to `log.json`.

**Status**: The analyzer's `ScopeChecker` (v2.0-R3) should catch duplicate memory names, but does it do case-insensitive comparison? If the parser allows `memory Log` and `memory LOG` as distinct declarations, they'll collide at the filesystem level.

**Check needed**: Verify `ScopeChecker` catches case-insensitive memory name collisions. If not, this is a latent bug that will cause silent data corruption (two memories overwriting each other's files).

### Issue 6 — Memory data not cleared from `this.outputs` between foreach iterations

In `foreach` execution, `this.outputs.set(flowNode.binding, items[i])` sets the binding. But if iteration 1 loads memory and sets it in `this.outputs`, iteration 2's memory load is skipped because of the `!this.outputs.has(ref.context)` guard. This means if iteration 1's node writes updated memory, iteration 2 reads the *pre-iteration-1* memory from `this.outputs` instead of the freshly written disk version.

**Fix**: In `executeNode`, for memory reads, always reload from disk (remove the `!this.outputs.has()` guard for memory-type refs):

```typescript
for (const ref of nodeDecl.reads) {
  if (this.memoryNames.has(ref.context)) {
    // Always reload memory from disk — may have been updated by previous iteration
    const memData = this.loadMemory(ref.context);
    if (memData !== null) {
      this.outputs.set(ref.context, memData);
    }
  }
}
```

Wait — this breaks the "session data takes priority" semantic from trade-off #4. The tension is:
- `foreach` needs fresh memory each iteration (reads from disk after writes)
- Sequential nodes need session data priority (in-memory output from upstream node)

**Resolution**: Memory writes always go to disk (via `saveMemory`). So re-reading from disk for memory-type refs gives the freshest data. For non-memory refs, we keep the `this.outputs` lookup. This is actually the correct semantic: memory is a *persistent store*, not an in-memory cache. The outputs map is for session data flow between nodes. Memory should always be disk-authoritative.

```typescript
for (const ref of nodeDecl.reads) {
  if (this.memoryNames.has(ref.context)) {
    const memData = this.loadMemory(ref.context);
    if (memData !== null) {
      this.outputs.set(ref.context, memData);
    } else {
      this.outputs.delete(ref.context); // Clear stale session data
    }
  }
}
```

This is the correct approach: always reload memory from disk. The `!this.outputs.has()` guard is wrong for memory because it prevents seeing updates from prior nodes/iterations in the same run.

### Issue 7 — `generateSteps` parameter bloat

`generateSteps` goes from 5 to 7 parameters. This is a private function so no API impact, but it's getting unwieldy. An options object would be cleaner:

```typescript
interface StepContext {
  report: TokenReport;
  edgeMap: Map<string, boolean>;
  program: Program;
  memoryNames: Set<string>;
}
```

However, YAGNI applies. The function is private and called from one place. Refactoring now adds risk for no functional benefit.

## Convergence Score

**6/10**

The plan's approach is structurally sound, but I've identified two bugs that will cause silent data corruption in production:

1. **foreach memory staleness** (Issue 6): The `!this.outputs.has()` guard prevents iteration N from seeing memory updates written by iteration N-1. This is a correctness bug, not an edge case.

2. **Dry run memory pollution**: Without an explicit guard, dry runs write mock data to persistent memory files, corrupting real data on the next real run.

3. **Atomic writes**: The plan's direct `writeFileSync` for memory creates a data loss window on crash. This is the same class of bug as `stdin.end()` (v1.2-R09) — works fine in testing, fails in production under timeout/OOM conditions.

The low score reflects my belief that these issues need to be addressed in convergence, not deferred. The structural approach (Set<string>, loadMemory/saveMemory, no buildContextSection changes) is correct.
