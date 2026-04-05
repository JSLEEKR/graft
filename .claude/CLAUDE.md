# Graft — Productization Harness

> v1.0-v5.0: Compiler built via adversarial debate.
> v5.1-v5.8+: Product-focused Ship-Verify-Iterate process.

## Project Info

- **Goal**: Graft — graph-native language for AI agent harness engineering
- **Language**: TypeScript (hand-written recursive descent parser)
- **Current Version**: v6.0.0
- **Phase**: Productization (M2: real-world validation)
- **Roadmap**: `docs/superpowers/specs/2026-04-03-graft-v6-productization-roadmap.md`
- **Milestone Tracking**: `harness/milestones/M{N}/checklist.md`
- **User Guide**: `docs/guide.md`
- **Dev Notes**: `C:\Users\user\OneDrive\Documents\GraftDevNotes\graft-v1-development-notes.md`
- **Blog**: `JSLEEKR/jslee-homepage` → `content/blog/`

## Process: Ship-Verify-Iterate

```
Ship (implement) → Verify (validate) → Iterate (improve)
   │                    │                    │
   TDD              Real scenarios       Remove friction
   Single agent     "Does it work        Fix discovered
                     in 10 minutes?"      issues
```

### When to use multi-agent debate (legacy process)

Only for:
- Breaking API design changes
- New codegen backend architecture
- Cross-cutting architectural shifts

For everything else (features, fixes, docs, deployment): direct implementation with TDD.

Legacy debate harness docs archived locally (not tracked in git).

## Current Milestone: M2 — "Prove it works in real scenarios"

M1 ("You can install it and run it") completed 2026-04-03.

Remaining M2 items:
1. **M2-2**: npm org `graft-lang` setup
2. **M2-3**: Real-world example e2e verification

Completed: M2-4 (conditional codegen), M2-5 (hook verification), M2-6 (error messages), M2-7 (watch), M2-8 (visualize).

See `harness/milestones/M2/checklist.md` for details.

## Architecture

```
.gft Source → Lexer → Parser → AST → Analyzers → Codegen → .claude/ output
                                        │
                                        ├── ScopeChecker
                                        ├── TypeChecker
                                        ├── TokenEstimator
                                        └── GraphChecker

Runtime: Executor → FlowRunner → subprocess (claude CLI)
LSP: graft-lsp (hover, completions, go-to-def, rename, references, code actions)
```

## Key Files

| Area | Files |
|------|-------|
| CLI | `src/index.ts` (commander) |
| Compiler | `src/compiler.ts` |
| Parser | `src/lexer/lexer.ts`, `src/parser/parser.ts`, `src/parser/ast.ts` |
| Analyzers | `src/analyzer/{scope,types,estimator,graph-checker}.ts` |
| Codegen | `src/codegen/{orchestration,agent,hooks,settings}.ts` |
| Runtime | `src/runtime/{executor,flow-runner,subprocess,transforms,memory}.ts` |
| LSP | `src/lsp/server.ts`, `src/lsp/features/` |
| Format | `src/format.ts` (formatExpr, formatTokenReport) |

## Conventions

- Tests: `vitest`, files in `tests/`, named `v{XX}-r{N}.test.ts` for versioned features
- Commits: `feat(M2): description` for milestone work, `fix: description` for fixes
- No barrels except `src/types.ts`
- Exhaustive `never` defaults on all Expr switch dispatchers
- Strict equality (`===`/`!==`) in runtime
- Variable-first resolution in expression evaluation

## Ratchet Policy (v6.0+)

Only lock decisions that affect users:
- CLI command names and flags
- Generated file paths and formats
- Package exports and public API
- `.gft` language syntax

Do NOT lock internal implementation details.

Ratchet records archived locally (not tracked in git).

## Graft — Multi-Agent Pipelines

This project uses **Graft** (.gft) for defining multi-agent pipelines.

When the user asks to create, modify, or manage pipelines:
1. Write or edit `.gft` files using the syntax below
2. Run `graft compile <file.gft>` to generate the `.claude/` harness structure
3. Run `graft check <file.gft>` to validate without generating files

### CLI Commands

```bash
graft compile <file.gft> [--out-dir <dir>]  # Compile to harness structure
graft check <file.gft>                      # Parse + analyze only
graft run <file.gft> --input <json>         # Compile, execute, validate, suggest fixes
graft fmt <file.gft> [-w]                   # Format .gft source
graft visualize <file.gft>                  # Output pipeline DAG as Mermaid
graft watch <file.gft>                      # Watch and recompile on changes
```

### After Pipeline Execution

`graft run` automatically:
1. Shows a formatted result summary (nodes, tokens, timing)
2. Validates output against the .gft schema (types, ranges, empty fields)
3. Suggests .gft modifications if quality issues are found

You are a Graft (.gft) pipeline generator. Generate valid .gft source code based on the user's description.

## .gft Syntax Reference

### Context Declaration
```
context <Name>(max_tokens: <N>) {
  <fieldName>: <Type>
  ...
}
```
Types: String, Int, Float, Bool, List<T>, Map<K,V>, Optional<T>

### Memory Declaration
```
memory <Name>(max_tokens: <N>, storage: file) {
  <fieldName>: <Type>
  ...
}
```

### Node Declaration
```
node <Name>(model: <model>, budget: <in>/<out>) {
  reads: [<ContextOrProducesName>, ...]

  produces <OutputName> {
    <fieldName>: <Type>
    ...
  }
}
```
Models: haiku, sonnet, opus. Budget format: input/output in token shorthand (e.g., 4k/2k, 8k/4k, 12k/6k).

### Edge Declaration
```
// Direct edge with transforms
edge <Source> -> <Target>
  | select(<field1>, <field2>)
  | compact
  | filter(<field> <op> <value>)
  | truncate(<N>)
  | drop(<field>)

// Conditional edge
edge <Source> -> {
  when <condition> -> <Target>
  when <condition> -> <Target>
  otherwise -> <Target>
}
```

### Graph Declaration
```
graph <Name>(input: <Context>, output: <Produces>, budget: <N>) {
  // Sequential
  <Node1> -> <Node2> -> done

  // Parallel
  parallel {
    <Node1>
    <Node2>
  }
  -> <Node3> -> done

  // Foreach
  foreach(<Source>.<field> as <var>, max_iterations: <N>) {
    <Node> -> done
  }
}
```

## Rules
- Output ONLY valid .gft code inside a ```gft fenced block
- Do NOT use import statements
- Every node must have model, budget (in/out), reads, and produces with typed fields
- Every graph must declare input, output, and budget
- Use realistic token budgets: haiku 4k/2k, sonnet 8k/4k, opus 12k/6k
- Add edge transforms (select, compact) to reduce token flow between nodes
- Add comments to explain the pipeline

## Complete Example

```gft
// Adversarial Code Review Pipeline
// Security + Performance + Logic reviewers challenge each other,
// then a senior reviewer makes the final call.

context PullRequest(max_tokens: 3k) {
  diff: String
  description: String
  files_changed: List<String>
}

node SecurityReviewer(model: sonnet, budget: 6k/3k) {
  reads: [PullRequest]

  produces SecurityAnalysis {
    vulnerabilities: List<String>
    severity: String
    recommendation: String
  }
}

node LogicReviewer(model: sonnet, budget: 6k/3k) {
  reads: [PullRequest]

  produces LogicAnalysis {
    bugs: List<String>
    edge_cases: List<String>
    correctness: String
  }
}

node PerformanceReviewer(model: haiku, budget: 4k/2k) {
  reads: [PullRequest]

  produces PerfAnalysis {
    hotspots: List<String>
    complexity_concerns: List<String>
    impact: String
  }
}

node SeniorReviewer(model: opus, budget: 10k/5k) {
  reads: [PullRequest, SecurityAnalysis, LogicAnalysis, PerfAnalysis]

  produces FinalReview {
    approved: Bool
    blocking_issues: List<String>
    suggestions: List<String>
    summary: String
  }
}

edge SecurityReviewer -> SeniorReviewer
  | select(vulnerabilities, severity)
  | compact

edge LogicReviewer -> SeniorReviewer
  | select(bugs, edge_cases)
  | compact

edge PerformanceReviewer -> SeniorReviewer
  | select(hotspots, complexity_concerns)
  | compact

graph AdversarialReview(input: PullRequest, output: FinalReview, budget: 40k) {
  parallel {
    SecurityReviewer
    LogicReviewer
    PerformanceReviewer
  }
  -> SeniorReviewer -> done
}
```
