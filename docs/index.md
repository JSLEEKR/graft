---
layout: default
title: Graft
---

# Graft

**Infrastructure as Code for Claude Code multi-agent pipelines.**

Graft is a domain-specific language that compiles `.gft` pipeline definitions into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) harness structures — agents, hooks, orchestration plans, and settings — with compile-time token budget analysis.

## Install

```bash
npm install -g @jsleekr/graft
```

Requires Node.js 20+.

## Quick Example

```graft
context Question(max_tokens: 500) {
  text: String
}

node Analyst(model: sonnet, budget: 4k/2k) {
  reads: [Question]
  produces Analysis { answer: String, confidence: Float(0..1) }
}

graph QA(input: Question, output: Analysis, budget: 10k) {
  Analyst -> done
}
```

```bash
graft compile qa.gft
```

This generates `.claude/agents/analyst.md`, `.claude/CLAUDE.md`, and `.claude/settings.json` — ready for Claude Code to execute.

## Documentation

- **[User Guide](guide.html)** — full walkthrough of the language, CLI, and workflow
- **[Examples](https://github.com/JSLEEKR/graft/tree/master/examples)** — runnable `.gft` pipelines
- **[Language Specification](https://github.com/JSLEEKR/graft/blob/master/SPECIFICATION.md)** — formal grammar and semantics
- **[npm package](https://www.npmjs.com/package/@jsleekr/graft)** — `@jsleekr/graft`
- **[GitHub](https://github.com/JSLEEKR/graft)** — source code

## How It Works

```
.gft Source  ->  Graft Compiler  ->  .claude/ output  ->  Claude Code runs it
```

| Graft Source | Generated Output | Purpose |
|-------------|-----------------|---------|
| `node` | `.claude/agents/*.md` | Agent with model, tools, output schema |
| `edge \| transform` | `.claude/hooks/*.js` | Data transform between nodes |
| `graph` | `.claude/CLAUDE.md` | Step-by-step orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| config | `.claude/settings.json` | Model routing, budget, hook registration |

## CLI

```bash
graft compile <file.gft>    # Compile to harness structure
graft check <file.gft>      # Parse + analyze only
graft run <file.gft>         # Compile and execute
graft fmt <file.gft>         # Format .gft source
graft init <name>            # Scaffold a new project
graft watch <file.gft>       # Watch and recompile on changes
graft visualize <file.gft>   # Output pipeline DAG as Mermaid
```

## License

MIT
