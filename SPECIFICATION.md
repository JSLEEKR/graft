# Graft Language Specification v0.1

## 1. Overview

Graft is a graph-native language for AI agent multi-agent systems.
It declaratively defines context flow, performs static analysis of token consumption,
and compiles to Claude Code agent teams.

File extension: `.gft`
CLI command: `graft`

## 2. Lexical Structure

### 2.1 Keywords

```
node, edge, graph, context, memory, type,
reads, produces, tools, budget, flow,
transform, select, drop, format,
when, otherwise, foreach, done,
parallel, sequential,
import, from, as,
schema, enum, struct,
on_complete, on_failure,
retry, fallback,
input, output,
shared_context, lifetime,
condition, constraint
```

### 2.2 Identifiers

```
identifier := [A-Z][a-zA-Z0-9_]*    // PascalCase: types, nodes, graphs
            | [a-z][a-zA-Z0-9_]*    // camelCase: fields, variables
```

### 2.3 Literals

```
integer     := [0-9]+
float       := [0-9]+ '.' [0-9]+
string      := '"' [^"]* '"'
bool        := 'true' | 'false'
token_unit  := integer 'tokens'
```

### 2.4 Comments

```
// single-line comment
/* multi-line comment */
```

## 3. Type System

### 3.1 Primitive Types

```
String                    // UTF-8 string
Int                       // integer
Float                     // floating point
Float(min..max)          // range-constrained floating point
Bool                      // boolean
```

### 3.2 Collection Types

```
List<T>                   // ordered list
Map<K, V>                 // key-value map
Optional<T>               // nullable type
```

### 3.3 Token-Aware Types (Graft-specific)

```
TokenBounded<T, max: Int>
// The serialized form of a value of type T must not exceed max tokens.
// On violation: compile-time warning (static) or automatic compression (runtime).

// Examples
description: TokenBounded<String, 100>    // string of at most 100 tokens
summary: TokenBounded<AnalysisResult, 500> // must serialize within 500 tokens
```

### 3.4 Agent Output Type

```
AgentOutput<Schema> {
  data: Schema              // structured output data
  confidence: Float(0..1)   // agent confidence score
  reasoning_trace: Optional<String>  // reasoning trace for debugging
  token_cost: Int           // actual tokens consumed (recorded at runtime)
}
```

### 3.5 Enum Types

```
enum Severity { low, medium, high, critical }
enum Action { create, modify, delete, test }
enum Serialization { compact, narrative, hybrid }
```

### 3.6 Struct Types (inline schemas)

```
schema {
  field_name: Type
  field_name: Type
  ...
}

// Nesting is supported
schema {
  steps: List<Step {
    action: enum(create, modify, delete)
    target: FilePath
    description: TokenBounded<String, 100>
  }>
}
```

### 3.7 Built-in Domain Types

```
FilePath                  // file path
FileDiff                  // file diff / changeset
TestFile                  // test file
IssueRef                  // issue reference
CodePatch                 // code patch
```

## 4. Context Declaration

### 4.1 Syntax

```
context <Name> : <ContextType> {
  <properties>
}
```

### 4.2 Context Types

#### Structured
Structured data with a schema. Most token-efficient.

```
context TaskSpec : Structured {
  schema {
    description: String
    acceptance_criteria: List<String>
    related_issues: List<IssueRef>
  }
  max_tokens: 1000
  lifetime: graph          // graph | session | persistent
}
```

#### Sequential
Sequential data (e.g., conversation history). Has windowing and compression policies.

```
context ConversationHistory : Sequential {
  window: sliding(last: 5 turns)
  compression: summarize_after(3 turns)
  max_tokens: 4000
  lifetime: session
}
```

#### Indexed
Data queried on-demand from an external store.

```
context DomainKnowledge : Indexed {
  source: knowledge_graph("product_domain")
  retrieval: semantic_search(top_k: 5)
  max_tokens: 3000
  lifetime: persistent
}
```

### 4.3 Lifetime

| Lifetime | Scope | Description |
|----------|-------|-------------|
| `graph` | Single graph execution | Discarded when execution completes |
| `session` | Retained for the session | Discarded when the session ends |
| `persistent` | Permanent storage | Stored in the knowledge graph |

### 4.4 Retrieval Strategies

```
semantic_search(top_k: Int)                    // semantic similarity search
graph_traverse(start: String, hops: Int)       // graph traversal
pattern_match(query: String)                   // pattern matching
keyword_search(fields: List<String>)           // keyword search
```

## 5. Node Declaration

### 5.1 Syntax

```
node <Name> {
  model: <ModelSpec>
  reads: [<ContextRef>, ...]
  produces: <OutputType> { schema { ... } }
  tools: [<ToolName>, ...]
  budget { input: <Int>, output: <Int> }
  on_failure: <FailureStrategy>
}
```

### 5.2 Model Specification

```
model: sonnet                    // latest Sonnet
model: opus                      // latest Opus
model: haiku                     // latest Haiku
model: claude-sonnet-4-20250514  // specific version
model: gpt-4o                    // other providers (future support)
model: local(ollama, "llama3")   // local models (future support)
```

### 5.3 Context Reference (reads)

```
reads: [TaskSpec]                          // full context
reads: [Plan.steps[current]]               // specific field only (partial read)
reads: [Implementation.files_changed]      // sub-field
reads: [TaskSpec.acceptance_criteria]       // specific field within a schema
```

Partial reads are the key mechanism for token savings. The compiler serializes only the required portion.

### 5.4 Output Schema (produces)

```
produces: AnalysisResult {
  schema {
    issues: List<Issue>
    architecture_pattern: Pattern
    risk_score: Float(0..1)
  }
}
```

Agent output must conform to the schema. It is passed to the next node as structured IR rather than natural language.

### 5.5 Tools

```
tools: [file_read, file_write, terminal, ast_parse, test_run, lint, browser]
```

Available tools are declared explicitly. Using an undeclared tool causes a compile error.

### 5.6 Budget

```
budget { input: 4000, output: 2000 }
// input: upper bound on total tokens injected into this node
// output: upper bound on tokens produced by this node
```

### 5.7 Failure Strategy

```
on_failure: retry(max: 2)                          // retry
on_failure: fallback(SimpleAnalyzer)                // fallback node
on_failure: retry(max: 2, then: fallback(Simple))   // retry then fallback
on_failure: abort("Analysis failed")                // abort
on_failure: skip                                    // skip
```

## 6. Edge Declaration

### 6.1 Basic Edge

```
edge <SourceNode> -> <TargetNode> {
  transform { ... }
  condition: <Expression>
}
```

### 6.2 Transform Operations

```
transform {
  // Filtering
  select: <field> where <condition>
  
  // Removal
  drop: <field>
  
  // Serialization strategy
  format: compact | narrative | hybrid
  
  // Custom transform
  map: <Expression>
  
  // Token limit
  truncate: <Int> tokens
}
```

Example:
```
edge Analyzer -> Reviewer {
  transform {
    select: issues where severity >= "medium"
    drop: architecture_pattern
    drop: reasoning_trace
    format: compact
  }
}
```

### 6.3 Conditional Routing

```
// Single condition
edge Analyzer -> Reviewer {
  condition: Analyzer.output.risk_score > 0.5
}

// Multi-condition branching
edge Analyzer -> {
  when risk_score > 0.7 -> DetailedReviewer
  when risk_score > 0.3 -> StandardReviewer
  otherwise -> AutoApprove
}
```

### 6.4 Token Estimation

The compiler automatically estimates post-transform tokens for each edge:

```
// Compiler output (not written in source code)
edge Analyzer -> Reviewer {
  // input: ~2000 tokens (Analyzer full output)
  // after transform: ~800 tokens (60% reduction)
  // estimated_tokens: 800
}
```

## 7. Graph Declaration

### 7.1 Syntax

```
graph <Name> {
  input: <Type>
  output: <Type>
  budget: <Int> tokens
  
  flow { ... }
  
  shared_context: [<ContextRef>, ...]
  on_complete { ... }
}
```

### 7.2 Flow Control

#### Sequential
```
flow {
  Analyzer -> Reviewer -> Fixer -> done
}
```

#### Parallel
```
flow {
  Analyzer
  -> parallel {
    SecurityReviewer
    PerformanceReviewer
    StyleReviewer
  }
  -> Aggregator -> done
}
```

#### Foreach (iteration)
```
flow {
  Planner
  -> foreach(Planner.output.steps as step) {
    Implementer(current: step)
    -> Verifier
  }
  -> done
}
```

#### Conditional
```
flow {
  Analyzer
  -> when(risk_score > 0.7) {
    DetailedReview -> Fixer
  }
  -> done
}
```

#### Loop (retry loop)
```
flow {
  Implementer
  -> Verifier
  -> when(!passed) {
    Implementer(retry: 1, max_retries: 3)
  }
  -> done
}
```

#### Composite flow
```
flow {
  Planner
  -> foreach(Planner.output.steps as step, max_iterations: 5) {
    Implementer(current: step)
    -> parallel {
      UnitTester
      Linter
    }
    -> Verifier
    -> when(!passed) {
      Implementer(
        additional_context: Verifier.output.failures,
        retry: 1
      )
    }
  }
  -> IntegrationTester
  -> done
}
```

### 7.3 Budget Constraint

```
graph Pipeline {
  budget: 25000 tokens
  
  // The compiler performs static analysis:
  // - Sum tokens along the best-case path
  // - Sum tokens along the worst-case path (including loops and retries)
  // - Warn if budget is exceeded
  
  constraint total_budget <= 25000 tokens  // explicit constraint
}
```

### 7.4 Post-Execution Hooks

```
on_complete {
  // Store results in memory
  store <NodeOutput> -> <Memory> as pattern(<label>)
  
  // Generate a token report
  emit token_report
  
  // Run a custom script
  run "scripts/post_process.sh"
}
```

## 8. Memory Declaration

### 8.1 Syntax

```
memory <Name> {
  backend: <BackendType>
  ontology { ... }
  learn_from { ... }
  query { ... }
}
```

### 8.2 Backend Types

```
backend: neo4j                    // Neo4j graph database
backend: sqlite                   // SQLite (lightweight)
backend: in_memory                // in-memory (for testing)
backend: json_file                // JSON file (for prototyping)
```

### 8.3 Ontology

```
ontology {
  entities: [Feature, Bug, Decision, Convention, Person]
  relations: [
    Feature -depends_on-> Feature,
    Bug -affects-> Feature,
    Decision -made_by-> Person,
    Convention -applies_to-> Feature
  ]
}
```

### 8.4 Learning Rules

```
learn_from {
  graph CodeReviewPipeline {
    on_complete: extract_entities(ReviewDecision) -> store
    on_failure: store_episode(error_context, resolution)
  }
}
```

### 8.5 Query Interface

```
query {
  semantic_search(embedding_model: text-embedding-3-small)
  graph_traverse(max_hops: 3)
  pattern_match(cypher_compatible: true)
}
```

## 9. Import System

```
// Import memory
import memory ProductKB from "./knowledge/product.mem"

// Import node (reusable agent definition)
import node StandardReviewer from "./agents/reviewer.gft"

// Import context
import context TechStackSpec from "./schemas/tech_stack.gft"

// Import graph (used as a subgraph)
import graph TestSuite from "./pipelines/test.gft"
```

## 10. Compilation Semantics

### 10.1 Token Flow Analysis

The compiler analyzes all possible execution paths in the graph:

1. Calculate the upper bound of injected tokens from each node's `reads` declarations
2. Estimate post-transform tokens for each edge
3. Sum total tokens per path (best / worst / average)
4. Compare against `budget` constraints
5. On violation: emit warning or error with optimization suggestions

### 10.2 Context Scope Verification

- A node can only access contexts declared in its `reads`
- Accessing an undeclared context produces a compile error
- Circular references are detected (A reads B.output, B reads A.output)
- `shared_context` is accessible by all nodes (explicit sharing)

### 10.3 Graph Optimization

- Automatic identification of parallelizable nodes with no dependencies
- Dead context elimination (removing unnecessary context passing)
- Edge transform chaining optimization
- Model routing optimization (simple tasks routed to lightweight models)

### 10.4 Compilation Output Structure

```
.claude/
├── CLAUDE.md                          // Orchestration master plan
├── agents/
│   ├── planner.md                     // Each node becomes an agent definition
│   ├── implementer.md
│   └── verifier.md
├── skills/
│   └── inject-context/
│       ├── task-spec/SKILL.md         // Each context becomes a skill
│       └── codebase-map/SKILL.md
├── hooks/
│   ├── edge-transform-analyzer-reviewer.sh
│   └── edge-transform-reviewer-fixer.sh
└── settings.json                      // Model routing, permissions, budget

.graft/
├── knowledge/                         // Cold memory
│   └── product_domain.json
├── session/                           // Warm memory
│   ├── current_state.json
│   └── node_outputs/                  // Inter-node IR
├── token_log.txt                      // Real-time token tracking
└── graph_execution.json               // Execution plan + state
```

## 11. Runtime Semantics

### 11.1 Execution Model

1. `graft run` loads the compiled `.claude/` structure
2. Spawns a Claude Code agent team
3. Executes agents according to the execution plan in `CLAUDE.md`
4. Each agent loads its skills (context injection modules) on demand
5. On node completion, hooks execute edge transforms
6. IR is saved to `.graft/session/`
7. Transformed IR is passed to the next node
8. When all nodes complete, `on_complete` hooks run

### 11.2 Token Accounting

The runtime tracks token usage in real time:

```
[2024-03-15 10:23:01] Planner      | input: 4,823 | output: 1,245 | total: 6,068
[2024-03-15 10:23:15] Edge transform: Planner->Implementer | 1,245 → 387 (69% reduction)
[2024-03-15 10:23:45] Implementer  | input: 5,102 | output: 3,891 | total: 8,993
[2024-03-15 10:24:02] Verifier     | input: 1,823 | output: 312  | total: 2,135
─────────────────────────────────────────────────────────────
TOTAL: 17,196 / 30,000 budget (57.3% used)
```

### 11.3 Failure Recovery

```
on_failure: retry(max: 2, then: fallback(SimpleAnalyzer))

// Execution flow:
// 1st attempt fails → 2nd retry → 3rd retry → falls back to SimpleAnalyzer
// Each retry is recorded in token accounting
// Fallback agents typically have a smaller budget
```

## 12. Future Extensions (Planned)

### 12.1 Multi-Provider Support
```
node Analyzer {
  model: provider(anthropic, "claude-sonnet") 
       | provider(openai, "gpt-4o")            // fallback
       | provider(local, "llama3")             // local fallback
}
```

### 12.2 Streaming Edges
```
edge Analyzer ->stream-> Reviewer {
  // real-time streaming delivery
  chunk_size: 500 tokens
}
```

### 12.3 Graph Composition
```
graph MainPipeline {
  flow {
    Planner
    -> subgraph(TestSuite, input: Plan.output)  // subgraph invocation
    -> Deployer
    -> done
  }
}
```

### 12.4 Dynamic Budget Reallocation
```
graph AdaptivePipeline {
  budget: 30000 tokens
  budget_strategy: adaptive  // if a previous node uses less budget, redistribute to subsequent nodes
}
```

### 12.5 Eval Integration
```
eval CodeReviewQuality {
  graph: CodeReviewPipeline
  dataset: "./evals/review_cases.json"
  metrics: [accuracy, token_efficiency, latency]
  compare: [flat_prompt, langgraph_baseline]
}
```
