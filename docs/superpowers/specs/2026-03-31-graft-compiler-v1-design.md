# Graft Compiler v1 — Design Spec

## 1. Project Goal

Build an end-to-end compiler that takes `.gft` source files and produces a Claude Code harness structure (`.claude/` directory). The first milestone covers `graft compile` and `graft check` commands with a v1 grammar subset.

**Key design constraint:** Graft source is authored by humans but the compilation output (`.claude/` structure) is consumed by LLMs. Grammar design prioritizes token efficiency and LLM parseability over human aesthetics.

## 2. V1 Scope

### Included
- Lexer, recursive descent parser, AST
- Static analysis: type checking, context scope verification, token flow estimation
- Code generator: AST → `.claude/` structure (agents, hooks, settings.json, CLAUDE.md)
- CLI: `graft compile <file>`, `graft check <file>`
- Grammar elements: `context` (Structured only), `node`, `edge` (with pipe transforms), `graph` (sequential flow only), inline types

### Excluded (future milestones)
- `memory`, `import`
- `foreach`, `parallel` flow control
- `Sequential`/`Indexed` context types
- `on_complete` hooks
- `graft run`, `graft analyze` commands
- Multi-provider model support
- Runtime token accounting

## 3. Redesigned Grammar (v1)

### 3.1 Design Principles

1. **Flat over nested** — minimize block nesting depth. Parameters on declaration line.
2. **Pipe transforms** — `|` operator for edge data transformation, unix-pipe mental model.
3. **k-suffix** — `4k` = `4000` for token counts. Reduces visual noise.
4. **Inference over annotation** — context type inferred from properties, not annotated.
5. **Schema is the body** — no `schema { }` wrapper inside context/produces blocks.

### 3.2 Lexical Structure

#### Keywords
```
node, edge, graph, context,
reads, produces, tools, budget, model,
select, filter, drop, compact, truncate,
when, else, done,
on_failure, retry, fallback, skip, abort,
input, output, max_tokens,
enum, true, false
```

#### Identifiers
```
PascalCase  → types, nodes, graphs, contexts  (e.g. Analyzer, TaskSpec)
snake_case  → fields, tools, properties       (e.g. risk_score, file_read)
```

#### Literals
```
integer     := [0-9]+                    // 42
k_integer   := [0-9]+ 'k'               // 4k = 4000
float       := [0-9]+ '.' [0-9]+        // 0.7
string      := '"' [^"]* '"'            // "hello"
bool        := 'true' | 'false'
```

#### Budget shorthand
```
budget: <input>/<output>
budget: 4k/2k           // input: 4000, output: 2000
budget: 5000/1500        // can mix with non-k
```

#### Comments
```
// single line
/* multi-line */
```

### 3.3 Context Declaration

```graft
context <Name>(max_tokens: <Int>) {
  <field>: <Type>
  ...
}
```

Example:
```graft
context TaskSpec(max_tokens: 1k) {
  description: String
  criteria: List<String>
  related_issues: List<IssueRef>
}
```

- Parameters: `max_tokens` (required).
- Body: schema fields only. No `schema { }` wrapper.
- V1 supports Structured contexts only. Type is inferred (has inline fields = Structured).

### 3.4 Node Declaration

```graft
node <Name>(model: <Model>, budget: <In>/<Out>) {
  reads: [<ContextRef>, ...]
  tools: [<ToolName>, ...]                     // optional
  on_failure: <Strategy>                       // optional

  produces <OutputName> {
    <field>: <Type>
    ...
  }
}
```

Example:
```graft
node Analyzer(model: sonnet, budget: 5k/2k) {
  reads: [TaskSpec, CodebaseMap]
  tools: [file_read, ast_parse]
  on_failure: retry(2)

  produces AnalysisResult {
    issues: List<Issue {
      file: FilePath
      line: Int
      severity: enum(low, medium, high, critical)
      description: String
    }>
    risk_score: Float(0..1)
  }
}
```

- `model` and `budget` in parameter position — visible at a glance.
- `produces` block has no `schema` wrapper — fields listed directly.
- Inline struct types: `Issue { ... }` defines a struct in-place.
- `reads` supports partial references: `Research.findings` reads only that field.
- V1: partial references support one level only (e.g. `Research.findings`, not `Research.findings.name`).

#### Model values (v1)
```
sonnet        // latest Sonnet
opus          // latest Opus
haiku         // latest Haiku
```

#### Failure strategies (v1)
```
retry(<max>)
fallback(<NodeName>)
retry(<max>, fallback(<NodeName>))
skip
abort
```

### 3.5 Edge Declaration

```graft
edge <Source> -> <Target>
  | <transform_op>
  | <transform_op>
  ...
```

Transform operations:
```
select(<field>)                      // project: keep only this field (multiple select = keep all listed)
filter(<field>, <condition>)         // filter: keep entries in a list field matching condition
drop(<field>)                        // remove this field from output
compact                              // compact serialization (strip whitespace)
truncate(<n>)                        // truncate to n tokens
```

Semantics:
- `select` is projection (which fields to keep). Multiple `select` calls accumulate.
- `filter` is predicate filtering within a list field.
- `drop` removes a field. Cannot combine `select` and `drop` on the same field.
- Operations apply in declaration order, top to bottom.
- If no `edge` declaration exists for a connection in the graph flow, it is an implicit edge with no transforms (full output passed through).

Examples:
```graft
// Simple connection (no transform)
edge Researcher -> Writer

// With transforms
edge Analyzer -> Reviewer
  | filter(issues, severity >= medium)
  | drop(reasoning_trace)
  | compact

// Conditional routing
edge Analyzer -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  else -> AutoApprove
}
```

### 3.6 Graph Declaration

```graft
graph <Name>(input: <Type>, output: <Type>, budget: <Int>) {
  <Node> -> <Node> -> ... -> done
}
```

Example:
```graft
graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

- Parameters: `input`, `output`, `budget`.
- Body IS the flow. No `flow { }` wrapper.
- V1: sequential only (`->` chaining). `done` terminates.

### 3.7 Type System (v1)

```
// Primitives
String
Int
Float
Float(min..max)                   // range-constrained: Float(0..1)
Bool

// Collections
List<T>
Map<K, V>
Optional<T>

// Token-bounded
TokenBounded<T, max>             // e.g. TokenBounded<String, 100>

// Inline enum
enum(value1, value2, ...)        // e.g. enum(low, medium, high)

// Inline struct
Name {                           // e.g. Issue { file: FilePath, severity: ... }
  field: Type
  ...
}

// Built-in domain types
FilePath
FileDiff
TestFile
IssueRef
```

### 3.8 Complete Example: hello.gft (redesigned)

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

## 4. Compiler Architecture

### 4.1 Pipeline

```
Source (.gft)
  │
  ▼
Lexer ──→ Token[]
  │
  ▼
Parser ──→ AST (typed tree)
  │
  ▼
Analyzer
  ├── ScopeChecker     (reads declarations vs actual references)
  ├── TypeChecker      (schema compatibility on edges)
  └── TokenEstimator   (budget analysis per path)
  │
  ▼
CodeGen ──→ .claude/ directory
  ├── CLAUDE.md
  ├── agents/*.md
  ├── hooks/*.sh
  └── settings.json
```

### 4.2 AST Node Types

```typescript
type Program = {
  contexts: ContextDecl[]
  nodes: NodeDecl[]
  edges: EdgeDecl[]
  graphs: GraphDecl[]
}

type ContextDecl = {
  name: string
  maxTokens: number
  fields: Field[]
}

type NodeDecl = {
  name: string
  model: string
  budgetIn: number
  budgetOut: number
  reads: ContextRef[]
  tools: string[]
  onFailure?: FailureStrategy
  produces: ProducesDecl
}

type ProducesDecl = {
  name: string
  fields: Field[]
}

type EdgeDecl = {
  source: string
  target: string | ConditionalTarget[]
  transforms: Transform[]
}

type Transform =
  | { type: 'select', field: string }
  | { type: 'filter', field: string, condition: Condition }
  | { type: 'drop', field: string }
  | { type: 'compact' }
  | { type: 'truncate', tokens: number }

type GraphDecl = {
  name: string
  input: string
  output: string
  budget: number
  flow: FlowStep[]
}

type FlowStep = {
  node: string
} // v1: sequential only, linked list via flow order

type Field = {
  name: string
  type: TypeExpr
}

type TypeExpr =
  | { kind: 'primitive', name: string }
  | { kind: 'primitive_range', name: string, min: number, max: number }
  | { kind: 'list', element: TypeExpr }
  | { kind: 'map', key: TypeExpr, value: TypeExpr }
  | { kind: 'optional', inner: TypeExpr }
  | { kind: 'token_bounded', inner: TypeExpr, max: number }
  | { kind: 'enum', values: string[] }
  | { kind: 'struct', name: string, fields: Field[] }
  | { kind: 'domain', name: string } // FilePath, FileDiff, etc.

type ContextRef = {
  context: string       // e.g. "Research"
  field?: string        // e.g. "findings" (partial read)
}

type ConditionalTarget = {
  condition?: Condition  // absent = else branch
  target: string
}

type Condition = {
  field: string
  op: '>=' | '>' | '<' | '<=' | '==' | '!='
  value: string | number | boolean
}

type FailureStrategy =
  | { type: 'retry', max: number }
  | { type: 'fallback', node: string }
  | { type: 'retry_then_fallback', max: number, node: string }
  | { type: 'skip' }
  | { type: 'abort' }
```

### 4.3 Analyzer

Three passes over the AST:

**Pass 1 — Scope Checker:**
- Every `reads` reference in a node must point to a declared context or another node's `produces` output.
- Partial references (`Research.findings`) must reference a valid field in the produces schema.
- Edge source/target must reference declared nodes.
- Graph flow nodes must all be declared.

**Pass 2 — Type Checker:**
- Edge transforms: `select(field)` — field must exist in source node's produces schema.
- Edge transforms: `drop(field)` — field must exist.
- `select(field, condition)` — condition field must be comparable with the given operator and value.
- Graph `input` must reference a declared context. Graph `output` must reference a declared produces type.

**Pass 3 — Token Estimator:**
- For each node: estimate input tokens = sum of `max_tokens` for each context in `reads` + estimated tokens from upstream produces (using `budgetOut` of source node, reduced by edge transforms).
- Compare each node's estimated input against its declared `budgetIn`. Warn if estimated > declared.
- For each graph: sum all nodes' `budgetIn + budgetOut` along the flow. Compare against graph `budget`. Report best-case (no retries) and worst-case (all retries hit max).
- Edge transform estimation: `select` reduces to ~single field size, `drop` removes ~field size, `compact` applies ~30% reduction heuristic.

### 4.4 Code Generator

The CodeGen phase transforms the analyzed AST into a `.claude/` directory structure.

#### Node → `.claude/agents/<name>.md`

Each node becomes an agent markdown file:

```markdown
---
name: <node_name_lowercase>
model: <resolved_model_id>
tools: [<tool_list>]
---

# <NodeName> Agent

## Context Loading
<for each reads reference, instruction to load from .graft/session/>

## Output Contract
Produce JSON output matching this schema:
```json
<JSON schema derived from produces declaration>
```

## Token Discipline
- Input budget: <budgetIn> tokens. Read only what is necessary.
- Output budget: <budgetOut> tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to .graft/session/node_outputs/<name>.json
2. Output: ===NODE_COMPLETE:<name>===

## Failure Protocol
<on_failure strategy instructions>
```

Model resolution:
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-20250514`
- `haiku` → `claude-haiku-4-5-20251001`

Tool mapping:
- `file_read` → `Read`
- `file_write` → `Write`, `Edit`
- `terminal` → `Bash`
- `ast_parse` → `Bash` (with tree-sitter or similar)
- `test_run` → `Bash`
- `lint` → `Bash`

#### Edge → `.claude/hooks/<source>-to-<target>.sh`

Each edge with transforms becomes a bash hook script using `jq`:

```bash
#!/bin/bash
set -euo pipefail
INPUT=".graft/session/node_outputs/<source>.json"
OUTPUT=".graft/session/node_outputs/<source>_to_<target>.json"

jq '<generated jq expression from transforms>' "$INPUT" > "$OUTPUT"
```

Transform → jq mapping:
- `select(field)` → `{ field: .field }` (multiple selects merge: `{ a: .a, b: .b }`)
- `filter(field, cond)` → `{ field: [.field[] | select(.cond_field >= "value")] }`
- `drop(field)` → `del(.field)`
- `compact` → strip whitespace: `jq -c`
- `truncate(n)` → truncate string fields (best-effort, character-based approximation)

Edges without transforms: no hook generated. The downstream node reads the upstream output directly.

#### Graph → `CLAUDE.md` orchestration section

```markdown
# Graft Orchestration: <GraphName>

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.

## Budget
Total: <budget> tokens

## Execution Plan

### Step 1: <NodeName> [sequential]
- Agent: <name>
- Expected tokens: input ~<budgetIn> / output ~<budgetOut>
- Completion: ===NODE_COMPLETE:<name>===
- Output: .graft/session/node_outputs/<name>.json

### Step 2: <NodeName> [sequential]
- Agent: <name>
- Input: .graft/session/node_outputs/<previous>_to_<name>.json (if edge transform exists)
         OR .graft/session/node_outputs/<previous>.json (if no transform)
- Expected tokens: input ~<budgetIn> / output ~<budgetOut>
...

## Token Budget Tracking
Check .graft/token_log.txt after each step.
- 80% consumed: switch remaining agents to compact mode
- 90% consumed: skip non-critical agents
```

#### Settings → `.claude/settings.json`

```json
{
  "model": "<default_model>",
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash", "Skill"]
  },
  "graft": {
    "version": "0.1.0",
    "source": "<source_file>",
    "compiled_at": "<ISO timestamp>",
    "budget": {
      "total": <graph_budget>,
      "warning_threshold": 0.8,
      "critical_threshold": 0.9
    },
    "model_routing": {
      "default": "<resolved_default_model>",
      "overrides": {
        "<node_name>": "<resolved_model>"
      }
    }
  },
  "hooks": {
    "PostToolUse": [
      <hook entries for edge transforms>
    ]
  }
}
```

#### Runtime scaffold → `.graft/`

```
.graft/
├── session/
│   └── node_outputs/    (empty, populated at runtime)
└── token_log.txt        (empty, populated at runtime)
```

## 5. Project Structure

```
graft/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── lexer/
│   │   ├── tokens.ts         # Token type definitions
│   │   └── lexer.ts          # Tokenizer
│   ├── parser/
│   │   ├── ast.ts            # AST type definitions
│   │   └── parser.ts         # Recursive descent parser
│   ├── analyzer/
│   │   ├── scope.ts          # Scope checker
│   │   ├── types.ts          # Type checker
│   │   └── tokens.ts         # Token flow estimator
│   ├── codegen/
│   │   ├── codegen.ts        # Main code generator
│   │   ├── agents.ts         # Node → agent .md
│   │   ├── hooks.ts          # Edge → hook .sh
│   │   ├── orchestration.ts  # Graph → CLAUDE.md
│   │   └── settings.ts       # settings.json generation
│   └── errors/
│       └── diagnostics.ts    # Error formatting with source locations
├── tests/
│   ├── lexer.test.ts
│   ├── parser.test.ts
│   ├── analyzer.test.ts
│   └── codegen.test.ts
├── examples/
│   ├── hello.gft
│   └── review.gft
├── package.json
├── tsconfig.json
└── README.md
```

## 6. CLI Interface

```bash
# Compile: parse → analyze → generate .claude/ structure
graft compile <file.gft> [--out-dir <dir>]
# Default --out-dir: current directory

# Check: parse → analyze only (no generation)
graft check <file.gft>
```

Output on success:
```
$ graft compile hello.gft

✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Researcher:  in ~2,000  out ~1,000
    Writer:      in ~1,500  out ~800
    Best path:   5,300 tokens ✓ within budget (6,000)
    Worst path:  5,300 tokens ✓ within budget (6,000)

Generated:
  .claude/CLAUDE.md
  .claude/agents/researcher.md
  .claude/agents/writer.md
  .claude/hooks/researcher-to-writer.sh
  .claude/settings.json
  .graft/session/node_outputs/  (empty)
  .graft/token_log.txt          (empty)
```

Output on error:
```
$ graft check broken.gft

✗ Scope error at line 12:
    reads: [UnknownContext]
           ^^^^^^^^^^^^^^
    'UnknownContext' is not declared. Did you mean 'UserRequest'?
```

## 7. Error Handling Strategy

Errors include source location (line, column) and contextual suggestions:

- **Lexer errors:** unexpected character, unterminated string
- **Parser errors:** unexpected token (expected X, got Y), with recovery to continue parsing
- **Scope errors:** undeclared context/node reference, invalid partial reference field
- **Type errors:** incompatible edge transform (select on non-existent field), condition type mismatch
- **Budget warnings:** estimated tokens exceed declared budget (warning, not error)

All errors are collected and reported together (not fail-on-first) to maximize feedback per compile.

## 8. Dependencies

- **TypeScript** — implementation language
- **commander** — CLI argument parsing
- **No parser generator** — hand-written recursive descent
- **jq** — required on target system for edge transform hooks (runtime dependency, not build dependency)
- **vitest** — test runner

## 9. Design Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Implementation language | TypeScript | Claude Code ecosystem, fast iteration, npm distribution |
| Parser approach | Hand-written recursive descent | Full control over error messages, no dependency |
| V1 scope | End-to-end (parse → codegen) | Validates full pipeline, delivers usable tool immediately |
| Grammar style | Block-minimized, HCL-inspired | Flat declarations, pipe transforms, less nesting |
| Budget syntax | `4k/2k` shorthand | Reduces noise, k-suffix is intuitive |
| Context type | Inferred, not annotated | Less boilerplate, properties are unambiguous |
| Edge transforms | `\|` pipe operator | Unix mental model, visually clear data flow |
| Flow in graph | Body IS the flow | No `flow { }` wrapper needed for v1 sequential-only |
| `otherwise` → `else` | Standard keyword | More universally recognized |
| Output format | LLM-optimized | Agents get structured JSON schemas, minimal prose |
