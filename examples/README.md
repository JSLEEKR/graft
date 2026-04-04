# Graft Examples

A collection of `.gft` pipelines demonstrating Graft's features, from minimal
single-node setups to full multi-phase adversarial workflows.

## Quick Start

**Validate** a file without generating output:

```bash
graft check examples/hello.gft
```

**Compile** to a Claude Code harness:

```bash
graft compile examples/hello.gft --out-dir ./output
```

**Run** a pipeline end-to-end:

```bash
graft run examples/hello.gft --input input.json
graft run examples/hello.gft --dry-run    # simulate without spawning subprocesses
```

---

## Examples

### hello.gft -- Simple Q&A Pipeline

A minimal two-node pipeline. A Researcher reads a user question and produces
findings, then a Writer turns those findings into a final answer.

**Structure:** `Researcher -> Writer -> done`

**Features demonstrated:**
- Basic context, node, and graph declarations
- Edge transforms (`select`, `compact`)
- Field-level reads (`Research.findings`)
- Mixed model assignment (sonnet + haiku)

---

### code-review.gft -- Adversarial Code Review

Three specialized reviewers (Security, Logic, Performance) analyze a pull
request in parallel, then a Senior Reviewer synthesizes their findings into a
final approve/reject decision.

**Structure:**
```
parallel { SecurityReviewer, LogicReviewer, PerformanceReviewer }
  -> SeniorReviewer -> done
```

**Features demonstrated:**
- `parallel` block for concurrent execution
- Fan-in pattern (multiple edges converging on one node)
- Per-edge `select` filtering so the senior reviewer sees only relevant fields
- Multi-model pipeline (haiku for perf, sonnet for logic/security, opus for senior)

---

### content-pipeline.gft -- Content Creation with Memory

A four-stage editorial pipeline that researches a topic, drafts an article,
edits it, and extracts metadata. A `memory` block stores previously published
article titles so the Researcher can avoid repeating topics.

**Structure:** `Researcher -> Drafter -> Editor -> MetadataExtractor -> done`

**Features demonstrated:**
- `memory` block with `storage: file` for persistent state across runs
- Node `writes` clause (MetadataExtractor writes to PublishedArticles)
- Linear four-node pipeline with progressive refinement
- Budget allocation across different model tiers

---

### data-analysis.gft -- Data Analysis Pipeline

Classifies incoming data, then runs statistical analysis and trend analysis in
parallel before a report writer combines everything into a final report.

**Structure:**
```
Classifier
  -> parallel { StatAnalyzer, TrendAnalyzer }
  -> ReportWriter -> done
```

**Features demonstrated:**
- Fan-out then fan-in pattern (one node feeds two parallel nodes, both feed one)
- Classification as a routing/enrichment step before parallel work
- Structured output types for quantitative results

---

### chatbot.gft -- Single-Node Chatbot

A single Responder node with conversation memory and imported shared contexts.
The simplest possible interactive agent.

**Structure:** `Responder -> done`

**Features demonstrated:**
- `import` statement to reuse contexts from `shared.gft`
- `memory` with nested typed fields (`List<Turn { role, content }>`)
- `Optional` type usage
- Single-node graph (minimal pipeline)
- Node that both reads and writes memory

---

### adversarial-debate.gft -- Full Adversarial Debate Pipeline

The pattern that built the Graft compiler itself, now expressed in Graft. Four
agents (Architect, Pragmatist, Skeptic, Specialist) independently analyze a
task, a Critic cross-examines all proposals with forced dissent, a Converger
produces the final design, an Implementer writes code, and a Reviewer approves
or rejects.

**Structure:**
```
parallel { Architect, Pragmatist, Skeptic, Specialist }
  -> Critic -> Converger -> Implementer -> Reviewer -> done
```

**Features demonstrated:**
- Eight-node pipeline across five phases
- `memory` for debate history (locked decisions, failed approaches)
- `tools` declaration on Implementer (file_read, file_write, terminal)
- `on_failure: retry(2)` for fault tolerance
- Conditional edge routing (`when approved == false -> Implementer`)
- Self-referential design: the debate pattern that built Graft, written in Graft

---

### pr-summarizer.gft -- PR Summarization

A practical two-node pipeline for daily use. An Analyzer reads a PR diff and
produces a risk assessment, then a Formatter turns it into a concise summary
with a risk badge.

**Structure:** `Analyzer -> Formatter -> done`

**Features demonstrated:**
- Compact, production-ready pipeline design
- Risk-level classification as structured output
- Two-tier model usage (sonnet for analysis, haiku for formatting)

---

### debate-lite.gft -- Lightweight Debate

A slimmed-down version of the adversarial debate for focused tasks. A Pragmatist
proposes a solution, a Skeptic challenges it, and a Converger makes the final
call incorporating risk mitigations.

**Structure:** `Pragmatist -> Skeptic -> Converger -> done`

**Features demonstrated:**
- Sequential debate without parallelism
- `Optional` fields in context
- Dual-feed into Converger (receives both the proposal and the challenge)
- Lighter budget allocation compared to the full debate

---

### shared.gft -- Shared Contexts

Not a standalone pipeline. Defines reusable `UserMessage` and `SystemConfig`
contexts that other files (like `chatbot.gft`) import.

**Features demonstrated:**
- Context-only file with no nodes or graph
- Import target for cross-file reuse
- `Float` type with range constraint (`Float(0..1)`)
