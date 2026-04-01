# A4-Specialist: v2.0-R4 CodeGen + Runtime Memory Support

## Proposed Implementation

### Compiler Domain Analysis: Uniform Data Path is the Correct Pattern

The key design question -- `this.outputs` vs `this.memories` -- has a clear answer from compiler/pipeline domain expertise. Every mature pipeline framework (Apache Beam, TensorFlow, Airflow) treats persistent state and transient data through a **uniform data interface** with distinct lifecycle hooks. The critical insight: the *read path* should be uniform, but the *write path* must be separate because memory writes have different semantics (persist across runs) than node outputs (session-scoped).

This means:
1. **Load memory into `this.outputs` before execution** -- `buildContextSection` works unchanged
2. **Write memory via separate `saveMemory()` after node execution** -- because persisting to `.graft/memory/` is a different lifecycle than writing to `.graft/session/node_outputs/`
3. **Memory writes are keyed by the `writes` array on NodeDecl**, not by the produces name

This is the "uniform read, distinct write" pattern. It gives us zero changes to `buildContextSection` and `buildPrompt`, which is the strongest signal that the abstraction is correct -- the existing code doesn't know or care where the data came from.

### 1. codegen.ts: Memory Scaffold + memoryNames Extraction

The `generate()` function needs two additions: (a) extract `memoryNames` from `Program.memories` and pass to `generateAgent`, (b) scaffold `.graft/memory/` directory for each declared memory.

```typescript
// codegen.ts — changes only
export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Extract memory names for agent generation
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents — pass memoryNames
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node, memoryNames),
    });
  }

  // ... hooks, orchestration, settings unchanged ...

  // Runtime scaffold
  files.push({ path: '.graft/session/node_outputs/.gitkeep', content: '' });
  files.push({ path: '.graft/token_log.txt', content: '' });

  // Memory scaffold — one default JSON file per declared memory
  for (const mem of program.memories) {
    const memFileName = mem.name.toLowerCase() + '.json';
    const defaultObj: Record<string, unknown> = {};
    for (const field of mem.fields) {
      defaultObj[field.name] = typeToDefaultValue(field.type);
    }
    files.push({
      path: `.graft/memory/${memFileName}`,
      content: JSON.stringify(defaultObj, null, 2),
    });
  }

  return files;
}

// Default values for memory scaffold (distinct from typeToExample — these are real defaults, not schema examples)
function typeToDefaultValue(type: TypeExpr): unknown {
  switch (type.kind) {
    case 'primitive':
      switch (type.name) {
        case 'String': return '';
        case 'Int': return 0;
        case 'Float': return 0.0;
        case 'Bool': return false;
        default: return null;
      }
    case 'list': return [];
    case 'map': return {};
    case 'optional': return null;
    case 'primitive_range': return type.min;
    case 'token_bounded': return typeToDefaultValue(type.inner);
    case 'enum': return type.values[0] ?? '';
    case 'struct': {
      const obj: Record<string, unknown> = {};
      for (const f of type.fields) {
        obj[f.name] = typeToDefaultValue(f.type);
      }
      return obj;
    }
    case 'domain': return '';
  }
}
```

**Why scaffold with defaults, not empty JSON?** Because `loadMemory` in the executor should be able to read a valid JSON object from the first run. If memory files don't exist yet (first run), `loadMemory` creates them. If they already exist from a previous run, the scaffold is not regenerated (codegen is a compile step, not a runtime step). The scaffold serves as documentation and as the initial state for `graft compile` output.

### 2. agents.ts: Memory-Aware Reads + Writes Section

Signature change: `generateAgent(node: NodeDecl, memoryNames: Set<string>)`.

```typescript
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
    const source = isMemory ? '.graft/memory/' : '.graft/session/';
    if (ref.field) {
      return `- Load \`${ref.context}.${ref.field}\` from \`${source}\``;
    }
    return `- Load \`${ref.context}\` from \`${source}\``;
  }).join('\n');
}

function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  const memoryWrites = node.writes.filter(w => memoryNames.has(w));
  if (memoryWrites.length === 0) return '';
  
  const lines = memoryWrites.map(w =>
    `- Update \`.graft/memory/${w.toLowerCase()}.json\` with relevant fields from your output`
  );
  return `
## Memory Writes
${lines.join('\n')}
After producing your output JSON, also write updated memory state.

`;
}
```

**Key domain decisions:**
- Default parameter `memoryNames = new Set()` preserves backward compatibility -- existing tests calling `generateAgent(node)` without memoryNames still work.
- Memory reads point to `.graft/memory/` not `.graft/session/`. This is critical: the agent must know where to *find* memory data.
- Memory writes section is generated only when `node.writes` references actual memories. The `writes` array was validated by the analyzer (v2.0-R3, ratchet v2.0-R20), so we trust it.

### 3. orchestration.ts: Memory Loading Step

The orchestration document should include a memory loading preamble before the execution plan. This tells the orchestrator (human or LLM) that memory files must be loaded at the start.

```typescript
export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  // ... existing edgeMap code ...
  
  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null);

  // Memory preamble
  const memorySection = program.memories.length > 0
    ? `## Persistent Memory
${program.memories.map(m => `- \`${m.name}\`: \`.graft/memory/${m.name.toLowerCase()}.json\` (${m.maxTokens.toLocaleString('en-US')} tokens max)`).join('\n')}
- Load all memory files before Step 1
- Save updated memories after nodes with \`writes\` clauses complete

`
    : '';

  return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: ${graph.budget.toLocaleString('en-US')} tokens
Best case: ${report.bestCase.toLocaleString('en-US')} tokens
Worst case: ${report.worstCase.toLocaleString('en-US')} tokens

${memorySection}## Execution Plan
${steps}
## Token Budget Tracking
...`;
}
```

### 4. executor.ts: loadMemory / saveMemory + Integration

This is the most important piece from a pipeline domain perspective. The executor needs:

```typescript
export class Executor {
  private program: Program;
  private options: RunOptions;
  private nodeMap: Map<string, NodeDecl>;
  private edgeMap: Map<string, EdgeDecl[]>;
  private outputs: Map<string, unknown>;
  private spawner: SpawnerFn;
  private sessionDir: string;
  private nodeOutputDir: string;
  private memoryDir: string;   // NEW

  constructor(program: Program, options: RunOptions) {
    // ... existing constructor code ...
    this.memoryDir = path.join(options.workDir, '.graft', 'memory');
  }

  async execute(): Promise<RunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const nodeResults: NodeResult[] = [];

    if (this.program.graphs.length === 0) {
      return { /* ... existing no-graph error ... */ };
    }

    const graph = this.program.graphs[0];
    this.cleanSession();
    fs.mkdirSync(this.nodeOutputDir, { recursive: true });

    // Write input to session
    fs.writeFileSync(
      path.join(this.sessionDir, `${graph.input.toLowerCase()}.json`),
      JSON.stringify(this.options.input, null, 2),
    );

    // *** NEW: Load memories into outputs map ***
    this.loadMemories();

    // Execute flow nodes
    try {
      await this.executeFlowNodes(graph.flow, nodeResults, errors);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // Determine final output (unchanged)
    // ...

    return { /* ... existing return ... */ };
  }

  // *** NEW: Load all declared memories into this.outputs ***
  private loadMemories(): void {
    for (const mem of this.program.memories) {
      const memFile = path.join(this.memoryDir, mem.name.toLowerCase() + '.json');
      if (fs.existsSync(memFile)) {
        try {
          const raw = fs.readFileSync(memFile, 'utf-8');
          const data = JSON.parse(raw);
          this.outputs.set(mem.name, data);
        } catch {
          // If memory file is corrupted, initialize with empty object
          this.outputs.set(mem.name, {});
        }
      } else {
        // Memory file doesn't exist yet — create with defaults
        fs.mkdirSync(this.memoryDir, { recursive: true });
        const defaultObj = this.buildDefaultMemory(mem);
        fs.writeFileSync(memFile, JSON.stringify(defaultObj, null, 2));
        this.outputs.set(mem.name, defaultObj);
      }
    }
  }

  // *** NEW: Save memory after node execution (if node has writes) ***
  private saveMemory(nodeDecl: NodeDecl, nodeOutput: unknown): void {
    if (nodeDecl.writes.length === 0) return;

    for (const memName of nodeDecl.writes) {
      const mem = this.program.memories.find(m => m.name === memName);
      if (!mem) continue; // analyzer validated, shouldn't happen

      const memFile = path.join(this.memoryDir, mem.name.toLowerCase() + '.json');

      // Load current memory state
      let currentMemory: Record<string, unknown> = {};
      if (fs.existsSync(memFile)) {
        try {
          currentMemory = JSON.parse(fs.readFileSync(memFile, 'utf-8'));
        } catch {
          currentMemory = {};
        }
      }

      // Merge: node output fields that match memory fields are written
      if (typeof nodeOutput === 'object' && nodeOutput !== null) {
        const output = nodeOutput as Record<string, unknown>;
        for (const field of mem.fields) {
          if (field.name in output) {
            currentMemory[field.name] = output[field.name];
          }
        }
      }

      // Persist
      fs.mkdirSync(path.dirname(memFile), { recursive: true });
      fs.writeFileSync(memFile, JSON.stringify(currentMemory, null, 2));

      // Update in-memory state so subsequent nodes see the updated memory
      this.outputs.set(memName, currentMemory);
    }
  }

  private buildDefaultMemory(mem: MemoryDecl): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const field of mem.fields) {
      obj[field.name] = this.defaultForType(field.type);
    }
    return obj;
  }

  private defaultForType(type: TypeExpr): unknown {
    switch (type.kind) {
      case 'primitive':
        switch (type.name) {
          case 'String': return '';
          case 'Int': return 0;
          case 'Float': return 0.0;
          case 'Bool': return false;
          default: return null;
        }
      case 'list': return [];
      case 'map': return {};
      case 'optional': return null;
      case 'primitive_range': return type.min;
      case 'token_bounded': return this.defaultForType(type.inner);
      case 'enum': return type.values[0] ?? '';
      case 'struct': {
        const obj: Record<string, unknown> = {};
        for (const f of type.fields) {
          obj[f.name] = this.defaultForType(f.type);
        }
        return obj;
      }
      case 'domain': return '';
    }
  }

  // In storeOutput, add saveMemory call:
  private storeOutput(nodeDecl: NodeDecl, output: unknown): void {
    // ... existing storeOutput code unchanged ...

    // *** NEW: Persist memory writes ***
    this.saveMemory(nodeDecl, output);
  }
}
```

**Critical domain insight on the merge strategy:** Memory writes use a **field-matching merge**, not a full overwrite. If a node produces `{ findings: [...], confidence: 0.8 }` and writes to a memory with fields `{ findings, pastQueries }`, only `findings` is updated; `pastQueries` is preserved. This is the correct semantics for persistent state -- you never want a node to accidentally clear fields it doesn't own.

### 5. Why NOT a Separate `this.memories` Map

From a compiler pipeline perspective, the uniform data path is superior for three precise reasons:

1. **`buildContextSection` already handles field-level access.** The `resolveField` method works on any `unknown` data. A separate `this.memories` map would require duplicating the entire context resolution logic (or adding `if (isMemory)` branches everywhere).

2. **Memory reads use the same `ContextRef` AST type as context reads.** The analyzer already validated that `reads: [ConversationHistory.messages]` is valid whether `ConversationHistory` is a context or a memory. The read path should honor this uniformity.

3. **Name collision prevention is already handled.** Ratchet v2.0-R19 confirms the analyzer prevents memory-vs-context and memory-vs-produces name collisions. So there's zero risk of a memory name shadowing a node output in `this.outputs`. This is the strongest argument: if collisions are impossible, a separate map is pure ceremony.

The *only* place memory diverges from node output is the **write path**: node outputs go to `.graft/session/node_outputs/`, memories go to `.graft/memory/`. The `saveMemory` method handles this cleanly without polluting the uniform read path.

## Trade-off Analysis

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Read path | Uniform (`this.outputs`) | Separate `this.memories` | Zero changes to buildContextSection; analyzer prevents collisions (v2.0-R19) |
| Write strategy | Field-matching merge | Full overwrite | Prevents accidental data loss on partial writes |
| Default values | Type-aware defaults | Empty `{}` | Memory is valid JSON from first run; matches schema |
| Agent signature | `generateAgent(node, memoryNames)` | Add `memories` to NodeDecl | Keeps AST free of codegen concerns; same pattern as analyzer |
| Memory scaffold | Generate in `codegen.ts` | Runtime-only creation | Compile output is self-documenting; `.graft/memory/` visible in project |
| Default param | `memoryNames = new Set()` | No default | Backward compatibility with all existing tests |
| Orchestration | Memory preamble section | No orchestration change | Orchestrator needs to know about memory lifecycle |

## Potential Issues

### 1. Memory File Race Condition in Parallel Execution
If two parallel nodes both `writes: [SameMemory]`, they will both read-modify-write the same JSON file. With `Promise.allSettled`, this is a genuine data race. **Mitigation for MVP**: the analyzer could warn on this (deferred), and the current abort-on-failure semantics (v1.2-R07) means parallel failures are caught. For v2.0, parallel memory writes to the same memory should be documented as undefined behavior.

### 2. Memory File Corruption Recovery
If the JSON in `.graft/memory/` is manually corrupted, `loadMemories` catches the parse error and falls back to `{}`. This loses data but doesn't crash. An alternative is to fail the pipeline, but that violates the principle that memory is a *convenience*, not a hard dependency.

### 3. Codegen Scaffold vs Runtime Default Divergence
`typeToDefaultValue` in codegen.ts and `defaultForType` in executor.ts are duplicated. They must produce identical results. Extract to a shared utility? **No** -- ratchet v1.2-R02 says "Do NOT reuse generateAgent(); separate runtime prompt builder", and the `fieldsToJsonExample` duplication (agents.ts / executor.ts) was an explicit design decision. The same logic applies: codegen and runtime are separate compilation phases with separate lifecycles.

### 4. Memory Not Cleaned by `cleanSession`
This is correct behavior, not a bug. `cleanSession` removes `.graft/session/node_outputs/*` (transient per-run data). Memory is in `.graft/memory/` which persists across runs by definition. But this should be explicitly documented.

### 5. `generateAgent` Backward Compatibility
Existing tests call `generateAgent(node)` without memoryNames. The default parameter `= new Set()` ensures all 101+ existing codegen-related tests pass without modification. New tests will pass memoryNames explicitly.

## Convergence Score: 8/10

High confidence in the uniform-read/distinct-write pattern -- it's the standard approach in pipeline frameworks and falls out naturally from the existing code structure. The `memoryNames` parameter threading mirrors the analyzer's approach exactly. Slight uncertainty on: (a) whether the orchestration section formatting will match what other agents propose, (b) whether the field-matching merge is the right write strategy vs. full overwrite, (c) duplication of `defaultForType` / `typeToDefaultValue` across codegen and runtime.
