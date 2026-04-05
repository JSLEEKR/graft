[![npm version](https://img.shields.io/npm/v/@jsleekr/graft.svg)](https://www.npmjs.com/package/@jsleekr/graft)
[![Node.js](https://img.shields.io/node/v/@jsleekr/graft.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Graft

**Infrastructure as Code for Claude Code multi-agent pipelines.**

Write `.gft` files to define multi-agent pipelines. The compiler generates `.claude/` harness structures — agents, hooks, orchestration plans, settings — with compile-time token budget analysis.

**[Documentation](https://jsleekr.github.io/graft/)** | **[Playground](https://jsleekr.github.io/graft/playground/)** | **[User Guide](docs/guide.md)** | **[Examples](examples/)**

---

## Getting Started (5 minutes)

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Step 1: Install Graft

```bash
npm install -g @jsleekr/graft
```

### Step 2: Create a project

```bash
graft init my-pipeline
cd my-pipeline
```

This creates:
- `pipeline.gft` — a starter two-node pipeline
- `.claude/CLAUDE.md` — the .gft language spec, so Claude Code natively understands Graft

### Step 3: Open Claude Code and just talk

```bash
claude
```

Then say:

> "I want a code review pipeline where security, logic, and performance reviewers run in parallel, then a senior reviewer synthesizes everything."

**Claude Code already knows .gft syntax** (from `.claude/CLAUDE.md`). It will:
1. Write a `.gft` file for you
2. Run `graft compile` to generate the harness
3. You're done

### Step 4: Or write .gft yourself

```graft
context PullRequest(max_tokens: 2k) {
  diff: String
  description: String
}

node SecurityReviewer(model: sonnet, budget: 4k/2k) {
  reads: [PullRequest]
  produces SecurityAnalysis {
    vulnerabilities: List<String>
    risk_level: String
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

Compile it:

```bash
graft compile code-review.gft
```

The compiler generates agents, hooks, orchestration plan, and settings — ready for Claude Code.

---

## How It Works

```
You describe what you want (natural language or .gft)
    ↓
Claude Code writes/edits .gft files (it knows the syntax from CLAUDE.md)
    ↓
graft compile → .claude/ output (agents, hooks, settings)
    ↓
Claude Code reads the .claude/ structure and runs the pipeline
```

| Graft Source | Generated Output | Purpose |
|-------------|-----------------|---------|
| `node` | `.claude/agents/*.md` | Agent with model, tools, output schema |
| `edge \| transform` | `.claude/hooks/*.js` | Data transform between nodes |
| `graph` | `.claude/CLAUDE.md` | Step-by-step orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| config | `.claude/settings.json` | Model routing, budget, hook registration |

## Why Graft?

**For humans**: Write 72 lines of `.gft` instead of manually maintaining 9 generated files (13KB+). ~8x compression ratio.

**For LLMs**: Claude Code reads 400 tokens of `.gft` instead of 3,300 tokens of scattered config. Modifications are single-file edits with compiler-guaranteed consistency.

- **Edge transforms** — extract only what the next agent needs (`select`, `drop`, `compact`, `filter`)
- **Compile-time token analysis** — catches budget overruns before you spend API credits
- **Typed output schemas** — enforce structured JSON between agents
- **Scope checking** — the compiler verifies every `reads` reference at compile time

## CLI

```bash
graft init [name]                            # New project, or add Graft to current dir
graft compile <file.gft> [--out-dir <dir>]   # Compile to .claude/ harness
graft check <file.gft>                       # Parse + analyze only
graft run <file.gft> --input <json>          # Compile and execute
graft test <file.gft> [--input <json>]       # Test with mock data
graft fmt <file.gft> [-w]                    # Format .gft source
graft generate <desc> [--output <file>]      # Generate .gft via Claude Code CLI
graft watch <file.gft>                       # Watch and recompile on changes
graft visualize <file.gft>                   # Pipeline DAG as Mermaid diagram
```

## Language Reference

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

Also supports: `foreach`, `let` variables with expressions, parameterized sub-graphs, `import`.

### Memory

```graft
memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn { role: String, content: String }>
  summary: Optional<String>
}
```

## Execution Model

Graft is a **compiler**, not a runtime orchestrator.

1. **`.claude/CLAUDE.md`** — natural-language execution plan. Claude Code reads it as instructions.
2. **`.claude/hooks/*.js`** — PostToolUse hooks that fire automatically. Edge transforms run deterministically.
3. **`.claude/settings.json`** — model routing and hook registration.

`graft run` spawns Claude Code subprocesses per node. The orchestration depends on Claude Code's instruction-following — unlike LangGraph or CrewAI which use deterministic state machines.

## Limitations

- **Non-deterministic orchestration** — `CLAUDE.md` is an LLM prompt, not a state machine
- **Claude Code dependency** — generates `.claude/` structures only
- **Single provider** — Anthropic models only (multi-provider planned)
- **Memory** — JSON file storage only (other backends planned)

See `SPECIFICATION.md` for planned features.

## Development

```bash
git clone https://github.com/JSLEEKR/graft.git
cd graft && npm install
npm run build         # Compile TypeScript
npm test              # Run all 1,712 tests
```

## License

MIT
