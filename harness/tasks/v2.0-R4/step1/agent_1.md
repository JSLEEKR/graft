# A1-Architect: v2.0-R4 CodeGen + Runtime Memory Support

## Proposed Implementation

### Core Design Principle: Memory-Aware Context via Program Injection

The fundamental problem is that `generateAgent(node: NodeDecl)` has no access to `Program.memories`, so it cannot distinguish memory reads from context/produces reads. Rather than adding a boolean flag to `ContextRef` (which would pollute the AST with codegen concerns), I propose passing a `Set<string>` of memory names alongside the node declaration.

### 1. agents.ts: Signature Change + Memory-Aware Formatting

**Approach**: Add a `memoryNames: Set<string>` parameter to `generateAgent()` and `formatReads()`. This follows the same pattern the analyzer uses in `scope.ts` (line 62: `const isMemory = this.memoryNames.has(ref.context)`).

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

## Output Contract
Produce JSON output matching this schema:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`
${writesSection}
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
    const basePath = isMemory ? '.graft/memory/' : '.graft/session/';
    if (ref.field) {
      return `- Load \`${ref.context}.${ref.field}\` from \`${basePath}\``;
    }
    return `- Load \`${ref.context}\` from \`${basePath}\``;
  }).join('\n');
}

function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  // Only include writes section if the node writes to memory
  const memoryWrites = node.writes.filter(w => memoryNames.has(w));
  if (memoryWrites.length === 0) return '';
  return `
## Memory Saving
After producing output, save to persistent memory:
${memoryWrites.map(w => `- Write relevant fields to \`.graft/memory/${w.toLowerCase()}.json\``).join('\n')}
`;
}
```

**Key decisions**:
- `formatWrites` filters `node.writes` against `memoryNames` — future-proofs for writes targets that aren't memory (if that concept ever arises), but primarily ensures only valid memory names generate save instructions.
- Memory path convention: `.graft/memory/<name>.json` with lowercase name, matching the session convention.
- The writes section appears between Output Contract and Token Discipline, logically grouping the "what to produce" instructions together.

### 2. codegen.ts: Pass Memory Names + Scaffold Memory Directory

```typescript
// codegen.ts — updated generate()
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

  // Memory scaffold — one .gitkeep for the directory
  if (program.memories.length > 0) {
    files.push({ path: '.graft/memory/.gitkeep', content: '' });
  }

  return files;
}
```

**Key decision**: Only emit `.graft/memory/.gitkeep` when the program declares memories. No memory declarations = no memory directory. This avoids creating empty infrastructure for programs that don't use memory.

### 3. orchestration.ts: Memory Load/Save Steps

Add memory awareness to the orchestration output. Memory loads happen before node execution, saves happen after.

```typescript
// In generateSteps(), within the 'node' case:
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

  // Memory load lines
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
```

This requires `generateOrchestration` (and by extension `generateSteps`) to receive `memoryNames`. The cleanest approach: compute `memoryNames` inside `generateOrchestration` from the `program` parameter it already has.

```typescript
export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const memoryNames = new Set(program.memories.map(m => m.name));

  // ... existing edgeMap setup ...

  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null, program, memoryNames);
  // ... rest unchanged ...
}
```

The `generateSteps` signature gains `program: Program` and `memoryNames: Set<string>`. This is a mild interface expansion, but `generateSteps` is a private function — no external API impact.

### 4. executor.ts: Memory Load/Save + Protected Session Cleanup

#### 4a. Memory directory and helpers

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
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private saveMemory(name: string, data: unknown): void {
    fs.mkdirSync(this.memoryDir, { recursive: true });
    const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}
```

**Design**: `loadMemory` returns `null` on missing/corrupt file (first run has no memory). `saveMemory` ensures directory exists before writing. Both use lowercase name convention.

#### 4b. Integration into executeNode — memory load before prompt building

Memory data must be available in `this.outputs` before `buildContextSection` reads it. Load memory at the top of `executeNode`, before the dry run check:

```typescript
private async executeNode(name: string): Promise<NodeResult> {
  const startTime = Date.now();
  const nodeDecl = this.nodeMap.get(name);

  if (!nodeDecl) {
    return { node: name, output: null, durationMs: Date.now() - startTime,
             success: false, error: `Node '${name}' not found in program` };
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

  // Dry run: produce mock output (unchanged logic)
  if (this.options.dryRun) {
    const mockOutput = this.generateMockOutput(nodeDecl);
    this.storeOutput(nodeDecl, mockOutput);
    return { node: name, output: mockOutput, durationMs: Date.now() - startTime, success: true };
  }

  // ... rest of executeNode unchanged ...
}
```

**Key design decision**: The `!this.outputs.has(ref.context)` guard prevents overwriting an in-memory value with a stale disk read when a node has already produced output in the same session that shadows the memory name. This respects the principle that session-produced data is fresher than persisted memory.

#### 4c. Memory save after storeOutput

In `storeOutput`, after the existing output storage, save to memory for any writes:

```typescript
private storeOutput(nodeDecl: NodeDecl, output: unknown): void {
  // ... existing logic (store by node name, produces name, session files, edge transforms) ...

  // Save to memory for any writes targets
  for (const writeName of nodeDecl.writes) {
    if (this.memoryNames.has(writeName)) {
      this.saveMemory(writeName, output);
    }
  }
}
```

**Note**: This saves the entire output to memory. The v2.0 spec doesn't define field-level memory writes (per common_memory note about v3.0 improvements), so saving the full produces output is correct for now.

#### 4d. buildContextSection — already works

The existing `buildContextSection` already handles memory reads correctly because:
1. We load memory data into `this.outputs` in `executeNode` (step 4b above)
2. `buildContextSection` looks up `ref.context` in `this.outputs`
3. It handles both full-context and field-level reads

No changes needed to `buildContextSection`. This is the payoff of the "load into outputs map" strategy.

#### 4e. cleanSession — must NOT touch memory

The existing `cleanSession()` only cleans `this.nodeOutputDir` (`.graft/session/node_outputs/`). It never touches `.graft/memory/`. **No changes needed** — the existing code is already correct because session and memory are in separate directory trees.

#### 4f. execute() — ensure memory directory

In `execute()`, after `cleanSession()` and before flow execution:

```typescript
async execute(): Promise<RunResult> {
  // ... existing setup ...

  this.cleanSession();

  // Ensure session directory exists
  fs.mkdirSync(this.nodeOutputDir, { recursive: true });

  // Ensure memory directory exists (if memories declared)
  if (this.program.memories.length > 0) {
    fs.mkdirSync(this.memoryDir, { recursive: true });
  }

  // ... rest unchanged ...
}
```

### Interface Summary

| File | Change Type | Details |
|------|-------------|---------|
| `agents.ts` | Signature change | `generateAgent(node, memoryNames)`, new `formatWrites()` |
| `codegen.ts` | Plumbing | Build `memoryNames` set, pass to `generateAgent`, add memory scaffold |
| `orchestration.ts` | Plumbing + output | Build `memoryNames`, pass through `generateSteps`, emit memory load/save lines |
| `executor.ts` | New methods + integration | `loadMemory()`, `saveMemory()`, memory load in `executeNode()`, save in `storeOutput()`, mkdir in `execute()` |

## Trade-off Analysis

### 1. `Set<string>` parameter vs. enriching `ContextRef` with `isMemory` flag

**Chosen**: `Set<string>` parameter.
**Alternative**: Add `isMemory?: boolean` to `ContextRef` in ast.ts.

The `Set<string>` approach:
- (+) Keeps AST pure — parser output doesn't encode resolution decisions
- (+) Matches analyzer pattern (`scope.ts` already uses `memoryNames: Set<string>`)
- (+) No AST migration needed for existing tests
- (-) Extra parameter threading through `generateAgent`, `formatReads`, `generateSteps`

The `isMemory` flag approach:
- (+) No parameter threading — self-contained in the ref
- (-) Mixes parsing and semantic analysis in AST
- (-) Would need to be set by analyzer or parser, changing their contracts
- (-) Every ContextRef consumer now needs to check a flag it may not care about

**Verdict**: The parameter threading is a small cost for a clean separation of concerns. The analyzer already established this pattern.

### 2. Full output vs. field-level memory writes

**Chosen**: Save full `produces` output to memory.
**Rationale**: v2.0 spec has no field-level write syntax. `writes: [ProjectMemory]` means "write to ProjectMemory" — the schema of what gets written is the node's `produces` schema. Field-level writes are explicitly noted as a v3.0 improvement in common_memory.

### 3. Memory load timing — early (executeNode top) vs. lazy (buildContextSection)

**Chosen**: Early load at `executeNode` top.
**Rationale**: Loading memory into `this.outputs` before `buildContextSection` means the context builder needs zero changes. It simply finds the data in the outputs map. The `!this.outputs.has()` guard ensures session data takes priority over disk-persisted memory.

### 4. Memory scaffold — conditional vs. unconditional

**Chosen**: Conditional (only when `program.memories.length > 0`).
**Alternative**: Always emit `.graft/memory/.gitkeep`.
**Rationale**: Programs without memory declarations shouldn't have unexplained empty directories. This follows the existing pattern where session scaffolding is always emitted (every program has nodes that produce output) but memory is opt-in.

## Potential Issues

### 1. Memory write race condition in parallel execution

When two parallel nodes both `writes: [SameMemory]`, they will both call `saveMemory()` after completion. `Promise.allSettled` means they run concurrently, so the last writer wins. This is acceptable for v2.0 — the analyzer could warn about parallel nodes writing to the same memory in a future version.

### 2. Memory data shape evolution

If a node's `produces` schema changes between compiler versions, existing `.graft/memory/*.json` files may have stale schemas. `loadMemory` returns whatever JSON is on disk — no schema validation. This is acceptable: the consuming node reads fields by name, and missing fields will be `undefined`. A future version could add schema migration.

### 3. `generateSteps` signature expansion

Adding `program` and `memoryNames` to `generateSteps` is a 6-parameter private function. This is at the threshold of "too many parameters." An alternative is a `StepContext` object, but YAGNI for now — `generateSteps` is internal and has no external consumers.

### 4. Dry run memory behavior

In dry run mode, `storeOutput` is called with mock output. This will `saveMemory()` with mock data. We should consider whether dry runs should skip memory saves. My recommendation: skip saves in dry run (add a guard in `storeOutput` or `saveMemory`). But this is a minor edge case — dry runs are for testing flow, not producing real data.

**Recommendation**: Add `if (this.options.dryRun) return;` guard to the memory save loop in `storeOutput`, or better yet, separate the memory save call so dry run naturally skips it in `executeNode`.

### 5. First-run memory read — null handling

When memory doesn't exist yet (first pipeline run), `loadMemory` returns `null` and nothing is set in `this.outputs`. The `buildContextSection` will then fall through to the "No data available" path. This is correct behavior — agents should handle missing optional context gracefully.

## Convergence Score

**8/10**

High confidence because:
- The `Set<string>` parameter pattern is already proven in `scope.ts`
- Memory load/save mechanics are straightforward file I/O
- `cleanSession` already doesn't touch memory (separate directory trees)
- `buildContextSection` works without changes due to the outputs map strategy

Deducted 2 points for:
- Parallel write race condition needs discussion (may be acceptable or may need analyzer warning)
- Dry run memory save behavior needs explicit decision
- `generateSteps` parameter count is growing; may want to revisit
