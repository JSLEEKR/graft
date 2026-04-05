---
layout: default
title: Graft
---

# Graft

**Infrastructure as Code for Claude Code multi-agent pipelines.**

Write `.gft` files — or just describe what you want in natural language — and Graft compiles them into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) harness structures with compile-time token budget analysis, runtime quality validation, and automatic fix suggestions.

> **Best for:** Natural-language I/O pipelines — code review, ideation, content generation, data analysis, debate architectures. Agents exchange structured JSON, not filesystem side effects.

**77% fewer tokens, 200x faster than manual configuration. [Benchmarks](https://github.com/JSLEEKR/graft/tree/master/benchmarks)**

## Getting Started (2 minutes)

```bash
npm install -g @jsleekr/graft    # Install (Node.js 20+)
graft init my-project            # Scaffold project
cd my-project
claude                           # Open Claude Code — it already knows .gft
```

Then just say:

> *"Make a code review pipeline with security, logic, and performance reviewers running in parallel, then a senior reviewer."*

**Claude Code writes the `.gft` file, compiles it, done.** No DSL learning required — `graft init` injects the full `.gft` syntax spec into `.claude/CLAUDE.md`.

## Or Write .gft Yourself

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

node SeniorReviewer(model: opus, budget: 6k/3k) {
  reads: [SecurityAnalysis, PullRequest]
  produces FinalReview {
    approved: Bool
    summary: String
  }
}

edge SecurityReviewer -> SeniorReviewer | select(vulnerabilities, risk_level) | compact

graph Review(input: PullRequest, output: FinalReview, budget: 25k) {
  SecurityReviewer -> SeniorReviewer -> done
}
```

```bash
graft compile review.gft    # Generate .claude/ harness
graft run review.gft --dry-run  # Validate with quality checks
```

## The Closed Loop

```
Describe what you want (natural language)
  → Claude Code writes .gft
  → graft compile → graft run
  → Formatted results + quality validation
  → Automatic fix suggestions
  → Apply fixes → rerun
```

After execution, `graft run` automatically:
1. **Formats results** — node table with model, timing, token usage bar
2. **Validates quality** — schema, type, range, empty field, and budget checks
3. **Suggests fixes** — concrete `.gft` modifications for each issue

```
── Quality Check ─────────────────────────────────
  ✓ findings OK [Analyzer.findings]
  ⚠ Field 'recommendations' is empty [Writer.recommendations]
  ✓ Token budget OK: 74%
────────────────────────────────────────────────
Quality: 75% (3/4 checks passed)

── Suggestions ───────────────────────────────────
  ⚠ Field 'recommendations' is empty.
    → Increase Writer output budget: budget: 10k/10k
────────────────────────────────────────────────
```

## Why Graft?

| | Manual (natural language) | Graft (.gft) |
|---|---|---|
| Total tokens | ~3,162 | ~716 (**77% less**) |
| Files to manage | ~9 | 1 |
| Time | ~30 seconds | ~148ms (**200x faster**) |
| Quality validation | None | Automatic |
| Consistency guarantee | None | Compiler-enforced |

## How It Works

```
.gft Source  →  Graft Compiler  →  .claude/ output  →  Claude Code runs it
                    ↓
            Scope + Type + Budget analysis (compile-time)
```

| Graft Source | Generated Output | Purpose |
|-------------|-----------------|---------|
| `node` | `.claude/agents/*.md` | Agent with model, tools, output schema |
| `edge \| transform` | `.claude/hooks/*.js` | Data transform between nodes |
| `graph` | `.claude/orchestration.md` | Step-by-step orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| config | `.claude/settings.json` | Model routing, budget, hook registration |

## Documentation

- **[Playground](playground/)** — try `.gft` in your browser with live compilation
- **[User Guide](guide.html)** — full walkthrough of the language, CLI, and workflow
- **[Examples](https://github.com/JSLEEKR/graft/tree/master/examples)** — 8 runnable `.gft` pipelines
- **[Benchmarks](https://github.com/JSLEEKR/graft/tree/master/benchmarks)** — NL vs .gft comparison data
- **[Language Specification](https://github.com/JSLEEKR/graft/blob/master/SPECIFICATION.md)** — formal grammar and semantics
- **[npm package](https://www.npmjs.com/package/@jsleekr/graft)** — `@jsleekr/graft`
- **[GitHub](https://github.com/JSLEEKR/graft)** — source code

## CLI

```bash
graft init [name]              # New project, or add Graft to existing project
graft compile <file.gft>      # Compile to .claude/ harness
graft check <file.gft>        # Parse + analyze only
graft import [dir] [-o file]  # Reverse-compile .claude/ into .gft
graft run <file.gft>          # Compile, execute, validate, suggest fixes
graft test <file.gft>         # Test with mock data
graft fmt <file.gft> [-w]     # Format .gft source
graft generate <desc>         # Generate .gft from natural language
graft watch <file.gft>        # Watch and recompile on changes
graft visualize <file.gft>    # Pipeline DAG as Mermaid diagram
```

## License

MIT
