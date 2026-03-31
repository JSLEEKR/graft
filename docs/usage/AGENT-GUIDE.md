# Graft Agent Guide — How to Make AI Agents Use Graft Autonomously

This document explains how to set up your project so that Claude Code (or any LLM agent)
autonomously designs, compiles, and executes multi-agent pipelines using Graft.

## Architecture

```
User gives task
    ↓
Claude Code reads CLAUDE.md
    ↓
Decides: "This task needs multiple agents"
    ↓
Writes a .gft pipeline file
    ↓
Runs: graft compile pipeline.gft --out-dir .
    ↓
.claude/ harness structure generated
    ↓
Dispatches subagents per CLAUDE.md orchestration plan
    ↓
Subagents execute, hooks transform data between nodes
    ↓
Final output delivered to user
```

## Setup

### 1. Install Graft in Your Project

```bash
# Option A: Clone and build
git clone https://github.com/JSLEEKR/graft.git /path/to/graft
cd /path/to/graft && npm install && npm run build

# Option B: Reference the built binary
export GRAFT_BIN="/path/to/graft/dist/index.js"
```

### 2. Add CLAUDE.md to Your Project

Copy the template below into your project's `CLAUDE.md` (or `.claude/CLAUDE.md`).
This is the instruction set that tells Claude Code how and when to use Graft.

### 3. Add the Graft Skill

Copy `graft-skill.md` (below) into `.claude/skills/graft/SKILL.md`.
This teaches Claude Code the Graft language syntax and compilation workflow.

---

## Template: CLAUDE.md (for your project)

```markdown
# Project: {Your Project Name}

## Multi-Agent Pipeline Policy

When a task is complex enough to benefit from multiple specialized agents,
use Graft to design and execute the pipeline.

### When to Use Graft

Use Graft when the task has ANY of these characteristics:
- Requires 2+ distinct expertise areas (e.g., analysis + implementation + review)
- Benefits from adversarial perspectives (e.g., design debate, security review)
- Has a token budget concern (large codebase, many files to process)
- Needs structured data flow between stages (not just "do A then B")

Do NOT use Graft for:
- Simple single-agent tasks (quick fixes, one-file changes)
- Tasks that are purely conversational (Q&A, explanation)

### How to Use Graft

1. **Design**: Write a `.gft` file describing the pipeline
   - Use the /graft skill for syntax reference
   - Place in `pipelines/{task-name}.gft`

2. **Compile**: Run `node {GRAFT_BIN} compile pipelines/{task-name}.gft --out-dir .`
   - This generates `.claude/` structure (agents, hooks, settings)
   - Review the generated CLAUDE.md orchestration plan

3. **Execute**: Dispatch subagents according to the generated orchestration plan
   - Each agent reads its `.claude/agents/{name}.md` definition
   - Hooks automatically transform data between nodes
   - Token budget is tracked in `.graft/token_log.txt`

4. **Cleanup**: After pipeline completes, remove generated `.claude/` and `.graft/`

### Pipeline Design Principles

1. **Declare reads explicitly** — each node should only access what it needs
2. **Use edge transforms** — select/filter/drop to minimize token passing
3. **Budget conservatively** — set graph budget to 80% of what you think you need
4. **Use cheaper models for simple tasks** — haiku for verification, sonnet for analysis
5. **Keep pipelines short** — 2-4 nodes is ideal, 5+ means you should split
```

---

## Template: Graft Skill (`.claude/skills/graft/SKILL.md`)

```markdown
---
name: graft
description: Design and compile multi-agent pipelines using the Graft language.
  Use when a task needs multiple specialized agents working in sequence.
---

# Graft Pipeline Skill

## What is Graft?

Graft is a compiler that transforms `.gft` pipeline definitions into
Claude Code harness structures. It provides:
- Declarative context flow between agents
- Compile-time token budget analysis
- Structured data transforms on edges (no wasted tokens)

## Quick Syntax Reference

### Context (input data with token limit)
\```graft
context TaskSpec(max_tokens: 1k) {
  description: String
  files: List<FilePath>
  criteria: List<String>
}
\```

### Node (agent unit)
\```graft
node Analyzer(model: sonnet, budget: 5k/2k) {
  reads: [TaskSpec, CodebaseMap]
  tools: [file_read, terminal]
  on_failure: retry(2)

  produces AnalysisResult {
    issues: List<Issue {
      file: FilePath
      severity: enum(low, medium, high, critical)
      description: String
    }>
    risk_score: Float(0..1)
  }
}
\```

### Edge (data transform — where token savings happen)
\```graft
// Simple connection
edge Analyzer -> Reviewer

// With transforms
edge Analyzer -> Reviewer
  | filter(issues, severity >= medium)
  | drop(reasoning_trace)
  | compact

// Conditional routing
edge Analyzer -> {
  when risk_score > 0.7 -> DetailedReviewer
  else -> QuickReviewer
}
\```

### Graph (execution flow + budget)
\```graft
graph Pipeline(input: TaskSpec, output: FinalReport, budget: 25k) {
  Analyzer -> Reviewer -> Fixer -> done
}
\```

## Available Types
- Primitives: `String`, `Int`, `Float`, `Float(0..1)`, `Bool`
- Collections: `List<T>`, `Map<K, V>`, `Optional<T>`
- Token-bounded: `TokenBounded<String, 100>`
- Enums: `enum(low, medium, high)`
- Inline structs: `Issue { file: FilePath, severity: ... }`
- Domain: `FilePath`, `FileDiff`, `TestFile`, `IssueRef`

## Budget Shorthand
- `4k` = 4000 tokens
- `budget: 5k/2k` = 5000 input / 2000 output

## Model Options
- `sonnet` — balanced (default for most tasks)
- `opus` — strongest (complex reasoning)
- `haiku` — fastest/cheapest (verification, simple transforms)

## Tool Options
- `file_read` → Read tool
- `file_write` → Write + Edit tools
- `terminal` → Bash tool
- `test_run` → Bash (test execution)
- `lint` → Bash (linting)

## Failure Strategies
- `retry(N)` — retry up to N times
- `fallback(NodeName)` — delegate to simpler node
- `retry(N, fallback(NodeName))` — retry then fallback
- `skip` — skip on failure
- `abort` — abort pipeline

## Compilation

\```bash
# Compile to .claude/ structure
node {GRAFT_BIN} compile pipeline.gft --out-dir .

# Check only (no file generation)
node {GRAFT_BIN} check pipeline.gft
\```

## Pipeline Patterns

### Pattern 1: Analyze → Act → Verify
\```graft
context Task(max_tokens: 1k) { description: String }

node Analyzer(model: sonnet, budget: 4k/2k) {
  reads: [Task]
  produces Analysis { plan: List<String>, risk: Float(0..1) }
}

node Implementer(model: sonnet, budget: 8k/4k) {
  reads: [Analysis]
  tools: [file_read, file_write, terminal]
  produces Result { files_changed: List<FileDiff> }
}

node Verifier(model: haiku, budget: 3k/500) {
  reads: [Result.files_changed]
  tools: [terminal]
  produces Check { passed: Bool, issues: Optional<List<String>> }
}

edge Analyzer -> Implementer | compact
edge Implementer -> Verifier | select(files_changed) | compact

graph DoTask(input: Task, output: Check, budget: 25k) {
  Analyzer -> Implementer -> Verifier -> done
}
\```

### Pattern 2: Multi-Perspective Review
\```graft
context Code(max_tokens: 3k) { diff: String, context: String }

node SecurityReviewer(model: sonnet, budget: 4k/1k) {
  reads: [Code]
  produces SecurityReport { vulnerabilities: List<String>, safe: Bool }
}

node PerformanceReviewer(model: sonnet, budget: 4k/1k) {
  reads: [Code]
  produces PerfReport { issues: List<String>, acceptable: Bool }
}

node Aggregator(model: haiku, budget: 3k/1k) {
  reads: [SecurityReport, PerfReport]
  produces FinalReview { approved: Bool, summary: String }
}

edge SecurityReviewer -> Aggregator | compact
edge PerformanceReviewer -> Aggregator | compact

graph Review(input: Code, output: FinalReview, budget: 15k) {
  SecurityReviewer -> PerformanceReviewer -> Aggregator -> done
}
\```

### Pattern 3: Research → Debate → Converge
\```graft
context Topic(max_tokens: 500) { question: String }

node Researcher(model: sonnet, budget: 3k/2k) {
  reads: [Topic]
  produces Findings { facts: List<String>, sources: List<String> }
}

node Advocate(model: sonnet, budget: 3k/1k) {
  reads: [Findings]
  produces Argument { position: String, evidence: List<String> }
}

node Critic(model: sonnet, budget: 3k/1k) {
  reads: [Findings, Argument]
  produces Critique { counterpoints: List<String>, strength: Float(0..1) }
}

node Synthesizer(model: sonnet, budget: 4k/2k) {
  reads: [Argument, Critique]
  produces Conclusion { answer: String, confidence: Float(0..1) }
}

edge Researcher -> Advocate | select(facts) | compact
edge Researcher -> Critic | select(facts) | compact
edge Advocate -> Critic | compact
edge Advocate -> Synthesizer | compact
edge Critic -> Synthesizer | compact

graph Debate(input: Topic, output: Conclusion, budget: 20k) {
  Researcher -> Advocate -> Critic -> Synthesizer -> done
}
\```

## Key Rules
1. Every node MUST have a `produces` block with a schema
2. `reads` should be as narrow as possible (use `Research.findings` not `Research`)
3. Edge transforms (`select`, `filter`, `drop`, `compact`) save tokens — use them
4. Graph flow must end with `-> done`
5. Budget format: `input/output` (e.g., `5k/2k`)
```

---

## How It Works End-to-End (Example)

### User says: "Review this PR for security and performance issues"

### Claude Code thinks:
"This needs two specialized reviewers + an aggregator. I'll use Graft."

### Claude Code writes `pipelines/pr-review.gft`:
```graft
context PRDiff(max_tokens: 3k) {
  diff: String
  files: List<FilePath>
}

node SecurityReviewer(model: sonnet, budget: 5k/1k) {
  reads: [PRDiff]
  tools: [file_read]
  produces SecurityReport {
    vulnerabilities: List<String>
    risk: enum(safe, low, medium, high, critical)
  }
}

node PerformanceReviewer(model: haiku, budget: 3k/1k) {
  reads: [PRDiff]
  tools: [file_read]
  produces PerfReport {
    issues: List<String>
    impact: enum(none, minor, major)
  }
}

node Summarizer(model: haiku, budget: 2k/1k) {
  reads: [SecurityReport, PerfReport]
  produces ReviewSummary {
    approved: Bool
    blocking_issues: List<String>
    suggestions: List<String>
  }
}

edge SecurityReviewer -> Summarizer
  | select(vulnerabilities, risk)
  | compact

edge PerformanceReviewer -> Summarizer
  | select(issues, impact)
  | compact

graph PRReview(input: PRDiff, output: ReviewSummary, budget: 15k) {
  SecurityReviewer -> PerformanceReviewer -> Summarizer -> done
}
```

### Claude Code compiles:
```bash
node /path/to/graft/dist/index.js compile pipelines/pr-review.gft --out-dir .
```

### Generated `.claude/` structure:
- `agents/securityreviewer.md` — security review instructions + output schema
- `agents/performancereviewer.md` — perf review instructions + output schema
- `agents/summarizer.md` — aggregation instructions
- `hooks/securityreviewer-to-summarizer.sh` — jq filter for security output
- `hooks/performancereviewer-to-summarizer.sh` — jq filter for perf output
- `CLAUDE.md` — 3-step orchestration plan with token budgets
- `settings.json` — model routing (sonnet for security, haiku for perf/summary)

### Claude Code executes the pipeline:
1. Spawns SecurityReviewer subagent → reads PR diff → outputs structured security report
2. Hook transforms security output (select vulnerabilities + risk only)
3. Spawns PerformanceReviewer subagent → reads PR diff → outputs structured perf report
4. Hook transforms perf output (select issues + impact only)
5. Spawns Summarizer subagent → reads both transformed outputs → produces final review
6. Returns ReviewSummary to user

### Token savings:
- Without Graft: each agent gets full PR diff + full previous outputs = ~15k tokens wasted
- With Graft: edge transforms pass only relevant fields = ~5k tokens saved (~33% reduction)
