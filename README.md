[![npm version](https://img.shields.io/npm/v/@graft-lang/graft.svg)](https://www.npmjs.com/package/@graft-lang/graft)
[![CI](https://github.com/JSLEEKR/graft/actions/workflows/ci.yml/badge.svg)](https://github.com/JSLEEKR/graft/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/@graft-lang/graft.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Graft

**A graph-native language for AI agent pipelines.**

Graft compiles `.gft` files into [Claude Code](https://docs.anthropic.com/en/docs/claude-code) harness structures. Define your multi-agent pipeline declaratively, and the compiler generates the agents, hooks, orchestration, and settings — with compile-time token budget analysis.

## Quick Start

```bash
npm install -g @graft-lang/graft
```

Write a pipeline (`hello.gft`):

```graft
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]
  produces Answer { response: String }
}

edge Researcher -> Writer | select(findings) | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

Compile it:

```
$ graft compile hello.gft

✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Researcher           in ~   500  out ~ 1,000
    Writer               in ~    63  out ~   800
    Best path:     2,363 tokens ✓ within budget (6,000)

Generated:
  .claude/agents/researcher.md     ← agent definition
  .claude/agents/writer.md         ← agent definition
  .claude/hooks/researcher-to-writer.sh  ← edge transform (jq)
  .claude/CLAUDE.md                ← orchestration plan
  .claude/settings.json            ← model routing + hooks
```

Open the project directory in Claude Code — it picks up the generated `.claude/` structure and runs the pipeline.

## What Does Graft Generate?

| Graft Source | Generated Output | Purpose |
|-------------|-----------------|---------|
| `node` | `.claude/agents/*.md` | Agent with model, tools, output schema |
| `edge \| transform` | `.claude/hooks/*.sh` | jq data transform between nodes |
| `graph` | `.claude/CLAUDE.md` | Step-by-step orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| config | `.claude/settings.json` | Model routing, budget, hook registration |

## Why Graft?

Multi-agent systems waste tokens passing full context between agents. Graft fixes this:

- **Edge transforms** extract only what the next agent needs (`select`, `drop`, `compact`, `filter`)
- **Compile-time token analysis** catches budget overruns before you spend API credits
- **Typed output schemas** enforce structured JSON communication between agents
- **Explicit `reads`** declarations prevent context leaks — the compiler verifies scope

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

### Flow Control

```graft
graph Pipeline(input: TaskSpec, output: Report, budget: 35k) {
  Planner
  -> parallel { SecurityReviewer  PerformanceReviewer  StyleReviewer }
  -> Aggregator -> done
}
```

Also supports: `foreach`, `let` variables with expressions, parameterized sub-graphs, conditional edge routing.

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

Supported: arithmetic (`+`, `-`, `*`, `/`, `%`), comparison (`>`, `>=`, `==`, `!=`), logical (`&&`, `||`), null coalescing (`??`), string interpolation, builtins (`len`, `max`, `min`, `abs`, `round`, `keys`, `str`).

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
graft compile <file.gft> [--out-dir <dir>]   # Compile to .claude/ structure
graft check <file.gft>                       # Parse + analyze only
graft run <file.gft> --input <json> [--dry-run] [--verbose]  # Compile and execute
```

## Editor Support

### VS Code

The [Graft VS Code extension](editors/vscode/) provides:
- Syntax highlighting (TextMate grammar)
- Real-time diagnostics
- Hover information (types, token budgets)
- Go-to-definition, find references, rename
- Completions (keywords, declarations, imports)
- Code actions (auto-import)
- Document symbols

## Programmatic API

```typescript
import { compileToProgram, compile } from '@graft-lang/graft/compiler';
import { Executor } from '@graft-lang/graft/runtime';
import type { Program, GraftErrorCode } from '@graft-lang/graft/types';

const result = compileToProgram(source, 'pipeline.gft');
if (result.success) {
  console.log(`Parsed ${result.program.nodes.length} nodes`);
}
```

## Development

```bash
git clone https://github.com/JSLEEKR/graft.git
cd graft && npm install
npm run build         # Compile TypeScript
npm test              # Run all 1,334 tests
```

## Version History

| Version | Highlights |
|---------|-----------|
| **v5.0** | Condition-to-Expr AST unification, strict equality, codegen expression display |
| **v4.9** | Codegen expression display |
| **v4.8** | LSP expression intelligence — hover, go-to-def, completions |
| **v4.7** | Null coalescing (`??`), runtime expression hardening |
| **v4.6** | Logical operators (`&&`, `||`), conditional type warnings |
| **v4.5** | Comparison operators, conditional expressions |
| **v4.4** | String interpolation, expression extraction |
| **v4.0** | Variables, expressions, graph parameters, graph calls |
| **v3.0** | Pluggable codegen backends, field-level writes, failure strategies |
| **v2.0** | Import system, persistent memory |
| **v1.0** | Full compiler pipeline, CLI |

See [CHANGELOG.md](CHANGELOG.md) for full details.

## License

MIT
