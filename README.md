[![npm version](https://img.shields.io/npm/v/@jsleekr/graft.svg)](https://www.npmjs.com/package/@jsleekr/graft)
[![Node.js](https://img.shields.io/node/v/@jsleekr/graft.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Graft

**Infrastructure as Code for Claude Code multi-agent pipelines.**

Graft is a domain-specific language that compiles `.gft` pipeline definitions into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) harness structures — agents, hooks, orchestration plans, and settings — with compile-time token budget analysis.

**[Documentation](https://jsleekr.github.io/graft/)** | **[Full User Guide](docs/guide.md)** | **[Examples](examples/)**

## Quick Start

### 1. Install

```bash
npm install -g @jsleekr/graft
```

Requires Node.js 20+.

### 2. Create a project

```bash
graft init my-pipeline
cd my-pipeline
```

### 3. Compile

```bash
graft compile pipeline.gft
```

Output:

```
✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Analyst              in ~   500  out ~ 2,000
    Reviewer             in ~   840  out ~ 1,000
    Best path:     4,340 tokens ✓ within budget (10,000)

Generated:
  .claude/agents/analyst.md          ← agent definition
  .claude/agents/reviewer.md         ← agent definition
  .claude/hooks/analyst-to-reviewer.js  ← edge transform
  .claude/CLAUDE.md                  ← orchestration plan
  .claude/settings.json              ← model routing + hooks
```

### 4. Run in Claude Code

```bash
# Create input
echo '{"question": "What is Graft?"}' > .graft/session/input.json

# Open in Claude Code
claude
```

Then tell Claude Code:

> Follow the execution plan in `.claude/CLAUDE.md`. The input is at `.graft/session/input.json`.

Claude Code reads the generated `.claude/` structure and runs the pipeline automatically.

### 5. Check the results

```bash
cat .graft/session/node_outputs/reviewer.json
```

That's it. You have a working multi-agent pipeline. See the [full guide](docs/guide.md) for details on writing `.gft` files, edge transforms, conditional routing, memory, and more.

---

## How It Works

```
.gft Source  →  Graft Compiler  →  .claude/ output  →  Claude Code runs it
```

| Graft Source | Generated Output | Purpose |
|-------------|-----------------|---------|
| `node` | `.claude/agents/*.md` | Agent with model, tools, output schema |
| `edge \| transform` | `.claude/hooks/*.js` | Node.js data transform between nodes |
| `graph` | `.claude/CLAUDE.md` | Step-by-step orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| config | `.claude/settings.json` | Model routing, budget, hook registration |

## How Execution Works

Graft is a **compiler**, not a runtime orchestrator. It generates static files that Claude Code interprets:

1. **`.claude/CLAUDE.md`** is a natural-language execution plan. Claude Code reads it as instructions — it's a prompt, not a state machine.
2. **`.claude/hooks/*.js`** are PostToolUse hooks that fire automatically when Claude Code writes to specific paths. These handle edge transforms deterministically.
3. **`.claude/settings.json`** configures model routing and hook registration.

`graft run` compiles the pipeline and spawns a `claude` CLI subprocess for each node. In `--dry-run` mode, it simulates execution without subprocess calls.

**Important**: The orchestration plan relies on Claude Code's instruction-following. Unlike LangGraph or CrewAI which use deterministic state machines, Graft's execution depends on the LLM correctly interpreting the plan. The hooks and settings are deterministic; the orchestration is not.

## Why Graft?

For Claude Code users building multi-agent workflows, Graft solves specific problems:

- **Edge transforms** extract only what the next agent needs (`select`, `drop`, `compact`, `filter`)
- **Compile-time token analysis** catches budget overruns before you spend API credits
- **Typed output schemas** enforce structured JSON between agents
- **Explicit `reads`** declarations prevent context leaks — the compiler verifies scope

## Example: Code Review Pipeline

```graft
context PullRequest(max_tokens: 2k) {
  diff: String
  description: String
}

node SecurityReviewer(model: sonnet, budget: 4k/2k) {
  reads: [PullRequest]
  produces SecurityAnalysis {
    vulnerabilities: List<String>
    risk_level: enum(low, medium, high, critical)
  }
}

node LogicReviewer(model: sonnet, budget: 4k/2k) {
  reads: [PullRequest]
  produces LogicAnalysis {
    issues: List<String>
    complexity: Int
  }
}

node SeniorReviewer(model: opus, budget: 6k/3k) {
  reads: [SecurityAnalysis, LogicAnalysis, PullRequest]
  produces FinalReview {
    approved: Bool
    summary: String
    action_items: List<String>
  }
}

edge SecurityReviewer -> SeniorReviewer | select(vulnerabilities, risk_level) | compact
edge LogicReviewer -> SeniorReviewer | select(issues) | compact

graph CodeReview(input: PullRequest, output: FinalReview, budget: 25k) {
  parallel { SecurityReviewer  LogicReviewer }
  -> SeniorReviewer -> done
}
```

This compiles to 3 agents running in parallel, with edge transforms that strip unnecessary data before the senior review.

## Language Features

### Contexts and Nodes

```graft
context TaskSpec(max_tokens: 1k) {
  description: String
  criteria: List<String>
}

node Analyzer(model: sonnet, budget: 5k/2k) {
  reads: [TaskSpec]
  tools: [file_read, terminal]
  on_failure: retry(2)
  produces AnalysisResult {
    issues: List<Issue { file: FilePath, severity: enum(low, medium, high) }>
    risk_score: Float(0..1)
  }
}
```

### Edge Transforms

```graft
edge Analyzer -> Reviewer
  | filter(issues, severity >= medium)
  | drop(reasoning_trace)
  | compact
```

### Conditional Routing

```graft
edge RiskAssessor -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  else -> AutoApprove
}
```

### Flow Control

```graft
graph Pipeline(input: TaskSpec, output: Report, budget: 35k) {
  Planner
  -> parallel { SecurityReviewer  PerformanceReviewer  StyleReviewer }
  -> Aggregator -> done
}
```

Also supports: `foreach`, `let` variables with expressions, parameterized sub-graphs.

### Imports and Memory

```graft
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn { role: String, content: String }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog.turns]
  produces Response { reply: String }
}
```

### Expressions

```graft
A -> let score = A.risk_score * 2
   -> let label = "Found ${len(A.items)} items"
   -> let safe = score >= 50 && score <= 100
   -> let fallback = A.name ?? "unknown"
   -> B -> done
```

### Type System

```
String, Int, Float, Float(0..1), Bool       // primitives
List<T>, Map<K, V>, Optional<T>             // collections
TokenBounded<String, 100>                   // token-bounded types
enum(low, medium, high)                     // inline enums
Issue { file: FilePath, severity: ... }     // inline structs
```

## CLI

```bash
graft compile <file.gft> [--out-dir <dir>] [--backend <name>]  # Compile to harness structure
graft check <file.gft>                       # Parse + analyze only
graft run <file.gft> --input <json> [--dry-run] [--verbose]    # Compile and execute
graft test <file.gft> [--input <json>] [--verbose]             # Test with mock data + validation
graft fmt <file.gft> [-w] [--check]          # Format .gft source
graft init <name>                            # Scaffold a new project
graft watch <file.gft> [--out-dir <dir>]     # Watch and recompile on changes
graft visualize <file.gft>                   # Output pipeline DAG as Mermaid diagram
```

## Programmatic API

```typescript
import { compile } from '@jsleekr/graft/compiler';
import { Executor } from '@jsleekr/graft/runtime';
import type { Program } from '@jsleekr/graft/types';

const result = compile(source, 'pipeline.gft');
if (result.success) {
  console.log(`Parsed ${result.program.nodes.length} nodes`);
}
```

## Editor Support

The [Graft VS Code extension](editors/vscode/) provides syntax highlighting, real-time diagnostics, hover, go-to-definition, find references, rename, completions, and code actions.

## Limitations

- **Non-deterministic orchestration**: The execution plan in `CLAUDE.md` is an LLM prompt. Claude Code usually follows it, but there's no guarantee of exact execution order.
- **Claude Code dependency**: Graft generates `.claude/` structures. If Claude Code's format changes, the codegen must be updated. There is no standalone runtime.
- **Single provider**: Only Anthropic Claude models (haiku, sonnet, opus) are supported. Multi-provider support is planned but not implemented.
- **Memory backends**: Only JSON file storage is implemented. Other backends (database, in-memory) are specified but not built.

For features that are planned but not yet implemented, see `SPECIFICATION.md` Section 12 (Future Extensions).

## Development

```bash
git clone https://github.com/JSLEEKR/graft.git
cd graft && npm install
npm run build         # Compile TypeScript
npm test              # Run all 1,668 tests
```

## License

MIT
