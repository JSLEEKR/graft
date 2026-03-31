# Graft

**A graph-native language for AI agent harness engineering.**

Graft compiles `.gft` source files into Claude Code harness structures (`.claude/` directory). It provides declarative context flow definitions, compile-time token budget analysis, and structured inter-agent communication — replacing wasteful natural language token passing in multi-agent systems.

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
  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

```
$ graft compile hello.gft

✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Researcher           in ~  2,000  out ~  1,000
    Writer               in ~    210  out ~    800
    Best path:     4,010 tokens ✓ within budget (6,000)
    Worst path:    4,010 tokens ✓ within budget (6,000)

Generated:
  .claude/CLAUDE.md
  .claude/agents/researcher.md
  .claude/agents/writer.md
  .claude/hooks/researcher-to-writer.sh
  .claude/settings.json
  .graft/session/node_outputs/.gitkeep
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
node dist/index.js compile <file.gft> [--out-dir <dir>]

# Check: parse + analyze only (no file generation)
node dist/index.js check <file.gft>
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

**Graph** — execution unit with budget:
```graft
graph CodeReview(input: TaskSpec, output: FinalReport, budget: 35k) {
  Planner -> Implementer -> Verifier -> Aggregator -> done
}
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
| settings | `.claude/settings.json` | Model routing, budget, hook registration |

## Compiler Architecture

```
.gft source
  → Lexer (tokenization)
  → Parser (recursive descent → AST)
  → Analyzer
      ├── ScopeChecker (reads/edge/flow validation)
      ├── TypeChecker (transform field validation)
      └── TokenEstimator (budget analysis)
  → CodeGen (AST → .claude/ structure)
```

## Project Structure

```
src/
├── index.ts              # CLI entry (commander)
├── compiler.ts           # Pipeline orchestrator
├── errors/diagnostics.ts # GraftError + SourceLocation
├── lexer/
│   ├── tokens.ts         # TokenType enum, Token interface
│   └── lexer.ts          # Hand-written tokenizer
├── parser/
│   ├── ast.ts            # AST type definitions
│   └── parser.ts         # Recursive descent parser
├── analyzer/
│   ├── scope.ts          # Scope checker
│   ├── types.ts          # Type checker
│   └── estimator.ts      # Token flow estimator
└── codegen/
    ├── codegen.ts        # Generator orchestrator
    ├── agents.ts         # Node → agent .md
    ├── hooks.ts          # Edge → hook .sh
    ├── orchestration.ts  # Graph → CLAUDE.md
    └── settings.ts       # → settings.json
```

## Development

```bash
npm test              # Run all 110 tests
npm run build         # Compile TypeScript
npx tsc --noEmit      # Type check only
```

## v1 Scope

### Included
- Lexer, recursive descent parser, AST
- Static analysis: scope checking, type checking, token flow estimation
- Code generator: AST → `.claude/` structure
- CLI: `graft compile`, `graft check`
- Grammar: `context`, `node`, `edge` (with pipe transforms), `graph` (sequential flow)

### Future (v2+)
- `memory`, `import` declarations
- `foreach`, `parallel` flow control
- `Sequential`/`Indexed` context types
- `graft run`, `graft analyze` commands
- Runtime token accounting
- Multi-provider model support

## Design Philosophy

1. **Context is the bottleneck, not intelligence.** Better context management beats smarter models.
2. **Declare, don't wire.** Define agent communication declaratively; the compiler optimizes.
3. **Token budgets are types.** Token safety at compile time, like memory safety.
4. **Edges are transforms, not wires.** Token savings happen at the edges.
5. **Memory has hierarchy.** Hot/Warm/Cold memory tiers manage context automatically.

## License

MIT
