[![npm version](https://img.shields.io/npm/v/@graft-lang/graft.svg)](https://www.npmjs.com/package/@graft-lang/graft)
[![Node.js](https://img.shields.io/node/v/@graft-lang/graft.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Graft

**A graph-native language for AI agent harness engineering.**

Graft compiles `.gft` source files into Claude Code harness structures (`.claude/` directory) and executes them. It provides declarative context flow definitions, compile-time token budget analysis, structured inter-agent communication, cross-file imports, and persistent memory — replacing wasteful natural language token passing in multi-agent systems.

```graft
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn { role: String, content: String }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog]
  produces Response {
    reply: String
  }
}

edge Responder -> done

graph Chat(input: UserMessage, output: Response, budget: 8k) {
  Responder -> done
}
```

```
$ graft compile chatbot.gft

✓ Parse OK
✓ Imports resolved (1 file)
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Responder            in ~  2,600  out ~  2,000
    Best path:     4,600 tokens ✓ within budget (8,000)
    Worst path:    4,600 tokens ✓ within budget (8,000)

Generated:
  .claude/CLAUDE.md
  .claude/agents/responder.md
  .claude/settings.json
  .graft/session/node_outputs/.gitkeep
  .graft/memory/.gitkeep
  .graft/token_log.txt
```

## Why Graft?

Current multi-agent systems waste tokens by passing full natural language context between agents. Graft solves this:

| Problem | Current Approach | Graft |
|---------|-----------------|-------|
| Context passing | Full text forwarded | Edge transforms extract only what's needed |
| Token budgets | Only known at runtime | Compile-time static analysis |
| Inter-agent communication | Natural language strings | Structured IR with schemas |
| Context scope | Implicit, leaks everywhere | Explicit `reads` declarations, compiler-verified |
| Cross-file sharing | Copy-paste definitions | `import { X } from "./shared.gft"` |
| State persistence | External storage setup | `memory` declarations with automatic load/save |

## Installation

```bash
git clone https://github.com/JSLEEKR/graft.git
cd graft
npm install
npm run build
```

## Usage

```bash
# Compile: .gft → .claude/ harness structure
graft compile <file.gft> [--out-dir <dir>]

# Check: parse + analyze only (no file generation)
graft check <file.gft>

# Run: compile and execute a pipeline
graft run <file.gft> --input <json> [--dry-run] [--verbose] [--timeout <seconds>]
```

### Examples

```bash
# Compile the chatbot example (uses imports + memory)
graft compile examples/chatbot.gft --out-dir ./output

# Dry run — simulate execution without spawning Claude subprocesses
graft run examples/hello.gft --input '{"question":"test"}' --dry-run

# Check a library file (no graph required)
graft check examples/shared.gft
```

## Language Overview

### Core Abstractions

**Context** — first-class data with token budgets:
```graft
context TaskSpec(max_tokens: 1k) {
  description: String
  criteria: List<String>
}
```

**Node** — agent unit with model, budget, and typed output:
```graft
node Analyzer(model: sonnet, budget: 5k/2k) {
  reads: [TaskSpec, CodebaseMap]
  tools: [file_read, ast_parse]
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
```

**Edge** — transform pipeline between nodes (where token savings happen):
```graft
edge Analyzer -> Reviewer
  | filter(issues, severity >= medium)
  | drop(reasoning_trace)
  | compact
```

**Graph** — execution unit with budget and flow control:
```graft
graph CodeReview(input: TaskSpec, output: FinalReport, budget: 35k) {
  Planner
  -> parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

**Import** — share contexts and nodes across files:
```graft
import { UserMessage, SystemConfig } from "./shared.gft"
```

**Memory** — persistent state across pipeline runs:
```graft
memory UserPrefs(max_tokens: 500, storage: file) {
  theme: String
  language: String
}

node Personalizer(model: haiku, budget: 2k/1k) {
  reads: [UserPrefs]
  writes: [UserPrefs]
  produces Response { content: String }
}
```

### Flow Control

```graft
# Sequential
A -> B -> C -> done

# Parallel execution
parallel { A B C } -> Aggregator -> done

# Foreach iteration
foreach(Splitter.output.tasks as task, max_iterations: 10) {
  Processor -> Validator
} -> Collector -> done
```

### Type System

```
String, Int, Float, Float(0..1), Bool       // primitives
List<T>, Map<K, V>, Optional<T>             // collections
TokenBounded<String, 100>                    // token-bounded types
enum(low, medium, high)                     // inline enums
Issue { file: FilePath, severity: ... }     // inline structs
FilePath, FileDiff, TestFile, IssueRef      // domain types
```

### Budget Shorthand

```
budget: 4k/2k     // 4000 input tokens / 2000 output tokens
max_tokens: 1k    // 1000 tokens
```

## Compilation Target

Graft compiles to Claude Code harness structure:

| Graft Element | Claude Code Output | Purpose |
|--------------|-------------------|---------|
| `node` | `.claude/agents/*.md` | Agent definition (model, tools, output schema) |
| `edge` | `.claude/hooks/*.sh` | Data transform between nodes (jq) |
| `graph` | `.claude/CLAUDE.md` | Orchestration plan |
| `memory` | `.graft/memory/*.json` | Persistent state across runs |
| settings | `.claude/settings.json` | Model routing, budget, hook registration |

## Compiler Architecture

```
.gft source
  → Lexer (tokenization)
  → Parser (recursive descent → AST)
  → Resolver (import resolution, circular detection)
  → Analyzer
      ├── ScopeChecker (reads/edge/flow/memory validation)
      ├── TypeChecker (transform field validation)
      └── TokenEstimator (budget analysis)
  → CodeGen (AST → .claude/ structure)
  → Executor (optional: runtime pipeline execution)
```

## Project Structure

```
src/
├── index.ts              # CLI entry (commander)
├── compiler.ts           # Pipeline orchestrator
├── constants.ts          # Shared constants (MODEL_MAP, thresholds)
├── utils.ts              # Shared utilities (JSON example generation)
├── runner.ts             # graft run command
├── errors/diagnostics.ts # GraftError + SourceLocation
├── lexer/
│   ├── tokens.ts         # TokenType enum, Token interface
│   └── lexer.ts          # Hand-written tokenizer
├── parser/
│   ├── ast.ts            # AST type definitions
│   └── parser.ts         # Recursive descent parser
├── resolver/
│   └── resolver.ts       # Import resolution + circular detection
├── analyzer/
│   ├── scope.ts          # Scope checker
│   ├── types.ts          # Type checker
│   └── estimator.ts      # Token flow estimator
├── codegen/
│   ├── codegen.ts        # Generator orchestrator
│   ├── agents.ts         # Node → agent .md
│   ├── hooks.ts          # Edge → hook .sh
│   ├── orchestration.ts  # Graph → CLAUDE.md
│   └── settings.ts       # → settings.json
└── runtime/
    ├── executor.ts       # Pipeline execution engine
    ├── memory.ts         # Memory load/save functions
    ├── subprocess.ts     # Claude CLI spawning + token usage parsing
    ├── token-tracker.ts  # Token budget tracking per node
    └── transforms.ts     # Edge transform functions
```

## Development

```bash
npm test              # Run all 288 tests
npm run build         # Compile TypeScript
npm run bench         # Run 16 benchmarks
npx tsc --noEmit      # Type check only
```

## Version History

| Version | Features |
|---------|----------|
| **v2.1** | Token tracking, correctness fixes, shared module extraction, 288 tests |
| **v2.0** | Import system, persistent memory, writes clause, 249 tests |
| **v1.2** | `graft run` execution engine, dry run, parallel/foreach runtime |
| **v1.1** | `parallel {}`, `foreach() {}` flow control, multi-field select |
| **v1.0** | Full compiler pipeline, CLI, 110 tests, 14 benchmarks |

See [CHANGELOG.md](CHANGELOG.md) for details. Dev notes on [jsleekr.com](https://jsleekr.com).

## Design Philosophy

1. **Context is the bottleneck, not intelligence.** Better context management beats smarter models.
2. **Declare, don't wire.** Define agent communication declaratively; the compiler optimizes.
3. **Token budgets are types.** Token safety at compile time, like memory safety.
4. **Edges are transforms, not wires.** Token savings happen at the edges.
5. **Files are modules.** Share contexts and nodes across pipelines via imports.

## License

MIT
