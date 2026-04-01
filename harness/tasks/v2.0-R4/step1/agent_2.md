# A2-Pragmatist: v2.0-R4 CodeGen + Runtime Memory Support

## Proposed Implementation

The pragmatist approach: smallest possible diff that makes memory work end-to-end. No new abstractions, no new files, no new types. We thread memory names through existing functions and add load/save to executor.

### Key Insight

Memory names are already in `ContextRef` via `reads` -- the analyzer validates them against `program.memories`. We don't need a separate `isMemory` flag on ContextRef. At runtime we can check `program.memories.find(m => m.name === ref.context)` exactly like the estimator already does. At codegen time, same approach.

### 1. agents.ts -- formatReads distinguishes memory, add writes section

The only change to `generateAgent` is: pass memory names so `formatReads` knows which refs are memories, and append a writes section.

```typescript
// agents.ts changes

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

## Token Discipline
- Input budget: ${node.budgetIn} tokens. Read only what is necessary.
- Output budget: ${node.budgetOut} tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to \`.graft/session/node_outputs/${name}.json\`
2. Output: \`===NODE_COMPLETE:${name}===\`

${writesSection}${failureSection}`;
}

function formatReads(node: NodeDecl, memoryNames: Set<string>): string {
  if (node.reads.length === 0) return 'No external context required.';
  return node.reads.map(ref => {
    const isMemory = memoryNames.has(ref.context);
    const basePath = isMemory ? '.graft/memory' : '.graft/session';
    if (ref.field) {
      return `- Load \`${ref.context}.${ref.field}\` from \`${basePath}/\``;
    }
    return `- Load \`${ref.context}\` from \`${basePath}/\``;
  }).join('\n');
}

function formatWrites(node: NodeDecl, memoryNames: Set<string>): string {
  const memWrites = node.writes.filter(w => memoryNames.has(w));
  if (memWrites.length === 0) return '';
  return `## Memory Writes
${memWrites.map(w => `- Update \`${w}\` in \`.graft/memory/${w.toLowerCase()}.json\``).join('\n')}

`;
}
```

Signature change: `generateAgent(node)` -> `generateAgent(node, memoryNames)`. This is a breaking change but contained -- only two callers: `codegen.ts` and tests.

### 2. codegen.ts -- Pass memory names, add memory scaffold

```typescript
// codegen.ts changes

export function generate(program: Program, report: TokenReport, sourceFile: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Build memory name set for agents
  const memoryNames = new Set(program.memories.map(m => m.name));

  // Agents
  for (const node of program.nodes) {
    files.push({
      path: `.claude/agents/${node.name.toLowerCase()}.md`,
      content: generateAgent(node, memoryNames),
    });
  }

  // ... hooks unchanged ...

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

  // Memory scaffold -- one file per declared memory with empty object
  for (const mem of program.memories) {
    files.push({
      path: `.graft/memory/${mem.name.toLowerCase()}.json`,
      content: JSON.stringify({}, null, 2),
    });
  }

  return files;
}
```

The memory scaffold creates initial empty JSON files. These persist across runs (executor won't clean `.graft/memory/`).

### 3. orchestration.ts -- Memory steps

Add a "Memory" section after "Budget" that lists declared memories:

```typescript
// In generateOrchestration, after the Budget section:

export function generateOrchestration(program: Program, report: TokenReport): string {
  const graph = program.graphs[0];
  if (!graph) return '';

  const edgeMap = new Map<string, boolean>();
  for (const edge of program.edges) {
    if (edge.target.kind === 'direct' && edge.transforms.length > 0) {
      edgeMap.set(`${edge.source}->${edge.target.node}`, true);
    }
  }

  const { text: steps } = generateSteps(graph.flow, report, edgeMap, 1, null);
  const memorySection = generateMemorySection(program);

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

function generateMemorySection(program: Program): string {
  if (program.memories.length === 0) return '';
  const lines = program.memories.map(m =>
    `- \`${m.name}\`: ${m.maxTokens.toLocaleString('en-US')} tokens max, stored at \`.graft/memory/${m.name.toLowerCase()}.json\``
  );
  return `
## Persistent Memory
${lines.join('\n')}
Memories persist across runs. Nodes with \`writes\` clauses update memory after execution.
`;
}
```

### 4. executor.ts -- loadMemory/saveMemory, integrate into executeNode and buildContextSection

```typescript
// executor.ts additions

// Add memoryDir field
private memoryDir: string;

// In constructor:
this.memoryDir = path.join(options.workDir, '.graft', 'memory');

// New: loadMemory
private loadMemory(name: string): unknown {
  const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// New: saveMemory
private saveMemory(name: string, data: unknown): void {
  fs.mkdirSync(this.memoryDir, { recursive: true });
  const filePath = path.join(this.memoryDir, `${name.toLowerCase()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
```

**buildContextSection** -- Add memory handling alongside context/produces lookups:

```typescript
private buildContextSection(nodeDecl: NodeDecl): string {
  const sections: string[] = [];

  for (const ref of nodeDecl.reads) {
    // Check if this is a memory read
    const mem = this.program.memories.find(m => m.name === ref.context);
    if (mem) {
      const memData = this.loadMemory(ref.context);
      if (ref.field) {
        const fieldVal = this.resolveField(memData, ref.field);
        sections.push(`### ${ref.context}.${ref.field} (memory)\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
      } else {
        sections.push(`### ${ref.context} (memory)\n\`\`\`json\n${JSON.stringify(memData, null, 2)}\n\`\`\``);
      }
      continue;
    }

    // Existing context/produces logic unchanged
    const contextData = this.outputs.get(ref.context);
    if (contextData !== undefined) {
      if (ref.field) {
        const fieldVal = this.resolveField(contextData, ref.field);
        sections.push(`### ${ref.context}.${ref.field}\n\`\`\`json\n${JSON.stringify(fieldVal, null, 2)}\n\`\`\``);
      } else {
        sections.push(`### ${ref.context}\n\`\`\`json\n${JSON.stringify(contextData, null, 2)}\n\`\`\``);
      }
    } else {
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
```

**executeNode** -- After `storeOutput`, save memory for writes:

```typescript
// In executeNode, after storeOutput(nodeDecl, output) calls (both dry-run and real):

// Save memory writes
for (const writeName of nodeDecl.writes) {
  const mem = this.program.memories.find(m => m.name === writeName);
  if (mem) {
    // Merge output into existing memory (shallow merge -- output fields overwrite memory fields)
    const existing = this.loadMemory(writeName);
    const merged = { ...(typeof existing === 'object' && existing !== null ? existing : {}), ...(typeof output === 'object' && output !== null ? output : {}) };
    this.saveMemory(writeName, merged);
  }
}
```

**cleanSession** -- No change needed. Memory lives in `.graft/memory/`, not `.graft/session/`. The existing cleanup only touches `node_outputs/`.

### 5. formatReads in agents.ts -- already covered above

Full file-level summary of changes:

| File | Changes |
|------|---------|
| `src/codegen/agents.ts` | `generateAgent` gets `memoryNames` param; `formatReads` distinguishes memory path; new `formatWrites` |
| `src/codegen/codegen.ts` | Build `memoryNames` set, pass to `generateAgent`; add memory scaffold files |
| `src/codegen/orchestration.ts` | New `generateMemorySection` for persistent memory docs |
| `src/runtime/executor.ts` | `memoryDir` field; `loadMemory`/`saveMemory` private methods; memory reads in `buildContextSection`; memory writes after `storeOutput` in `executeNode` |
| `tests/codegen.test.ts` | Update `generateAgent` calls to pass `new Set()` or `new Set(['MemName'])` |
| `tests/runner.test.ts` | Add tests for memory load/save/merge |

## Trade-off Analysis

| Choice | Pro | Con |
|--------|-----|-----|
| No `isMemory` flag on ContextRef | Zero AST changes, YAGNI | Must do `program.memories.find()` at runtime |
| Shallow merge for writes | Simple, predictable | Deep nested fields require full object replacement |
| Empty `{}` as initial memory | No schema enforcement at runtime | First read returns empty, agent must handle |
| `memoryNames: Set<string>` param | Explicit, no hidden state | Signature change to `generateAgent` |
| Memory in `.graft/memory/` dir | Clean separation from session | Another directory to know about |

**Why not deep merge?** YAGNI. The memory fields are defined in the schema. If a node writes `{findings: [...]}`, that's what gets merged. Deep merge introduces ambiguity with arrays (append vs replace?). Shallow merge is deterministic and sufficient for v2.0.

**Why `Set<string>` instead of passing `Program`?** `generateAgent` currently only takes `NodeDecl`. Passing the full `Program` would be a bigger refactor. A `Set<string>` is the minimal information needed.

**Why not add `isMemory` to `ContextRef`?** The analyzer already distinguishes memory refs. Adding a boolean to AST is a parser change that ripples through. Checking `memoryNames.has(ref.context)` at the two call sites (codegen and executor) is simpler and keeps AST stable.

## Potential Issues

1. **generateAgent signature change breaks existing tests.** Every test calling `generateAgent(node)` must become `generateAgent(node, new Set())`. This is mechanical but must not be missed. ~6 test call sites based on what I saw.

2. **Memory merge semantics with non-object output.** If a node produces a primitive or array (not an object), the spread merge `{...existing, ...output}` will silently produce wrong results. Fix: guard with `typeof output === 'object' && output !== null` (included above).

3. **Race condition in parallel execution.** If two parallel nodes both write to the same memory, last-write-wins. The analyzer should prevent this (ScopeChecker validates writes targets), but runtime doesn't enforce ordering. This is acceptable for MVP since the analyzer catches it at compile time.

4. **Memory file doesn't exist on first run.** `loadMemory` returns `{}` if file missing, which is correct. The codegen scaffold creates empty files, but if someone runs `graft run` without `graft compile` first, it still works.

5. **Case sensitivity.** Memory names are lowercased for file paths (`mem.name.toLowerCase()`). This matches the pattern used for node outputs. Must be consistent everywhere.

## Convergence Score

**8/10**

High confidence because:
- The pattern follows exactly what codegen/executor already do for contexts and produces
- No new abstractions, no new files, no new types
- Every change is a small extension of existing code
- Memory load/save is trivial file I/O that mirrors existing session file handling

Slight uncertainty because:
- Merge semantics (shallow vs deep) is a design choice others may disagree with
- The `generateAgent` signature change is the right minimal approach but others might prefer threading `Program` through
