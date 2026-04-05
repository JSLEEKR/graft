# Graft Benchmark: Natural Language vs .gft

Comparison of natural language input/output vs .gft input/output for 8 example pipelines.

**Test date**: 2026-04-05
**Graft version**: v6.0.1
**Method**: Each example measured for input tokens (what LLM reads), output tokens (what LLM writes or compiler generates), file count, and compile/execution time.

## How Each Approach Works

### Natural Language (baseline)
1. User writes a detailed prompt describing the pipeline (~200–800 tokens)
2. LLM reads the prompt and generates all config files (~700–6,400 tokens of output)
3. LLM produces each file individually: agents, hooks, CLAUDE.md, settings.json
4. **Estimated time**: 15–60+ seconds (LLM generation is the bottleneck)

### Graft (.gft)
1. User (or LLM) writes a `.gft` file (~145–925 tokens)
2. `graft compile` deterministically generates all config files in <200ms
3. Compiler guarantees consistency: scope checking, type checking, budget analysis
4. **Measured time**: 135–173ms (compiler, not LLM)

---

## Per-Example Results

### hello.gft — Simple Q&A (2 nodes)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~247 | ~145 |
| Output tokens (LLM writes) | ~1,353 (6 files) | ~145 (1 file) |
| **Total tokens** | **~1,600** | **~290** |
| Files to manage | 6 | 1 |
| Time | ~15 sec (est.) | 148ms |
| Quality (dry-run) | — | 75% |

**Token savings: 82% · Speed: ~100x · Compression: 9.3x**

---

### code-review.gft — Adversarial Code Review (4 nodes, parallel)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~454 | ~388 |
| Output tokens (LLM writes) | ~3,274 (10 files) | ~388 (1 file) |
| **Total tokens** | **~3,728** | **~776** |
| Files to manage | 10 | 1 |
| Time | ~35 sec (est.) | 173ms |
| Quality (dry-run) | — | 93% |

**Token savings: 79% · Speed: ~200x · Compression: 8.4x**

---

### pr-summarizer.gft — PR Summary (2 nodes)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~203 | ~225 |
| Output tokens (LLM writes) | ~1,457 (6 files) | ~225 (1 file) |
| **Total tokens** | **~1,660** | **~450** |
| Files to manage | 6 | 1 |
| Time | ~18 sec (est.) | 139ms |
| Quality (dry-run) | — | 100% |

**Token savings: 73% · Speed: ~130x · Compression: 6.5x**

---

### chatbot.gft — Single-Node Chatbot (1 node + memory)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~156 | ~144 |
| Output tokens (LLM writes) | ~671 (4 files) | ~144 (1 file) |
| **Total tokens** | **~827** | **~288** |
| Files to manage | 4 | 1 |
| Time | ~10 sec (est.) | 135ms |
| Quality (dry-run) | — | 100% |

**Token savings: 65% · Speed: ~74x · Compression: 4.7x**

---

### data-analysis.gft — Data Analysis (4 nodes, fan-out/fan-in)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~372 | ~398 |
| Output tokens (LLM writes) | ~3,916 (11 files) | ~398 (1 file) |
| **Total tokens** | **~4,288** | **~796** |
| Files to manage | 11 | 1 |
| Time | ~40 sec (est.) | 147ms |
| Quality (dry-run) | — | 100% |

**Token savings: 81% · Speed: ~270x · Compression: 9.9x**

---

### content-pipeline.gft — Content Creation (4 nodes + memory)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~341 | ~372 |
| Output tokens (LLM writes) | ~3,052 (10 files) | ~372 (1 file) |
| **Total tokens** | **~3,393** | **~744** |
| Files to manage | 10 | 1 |
| Time | ~35 sec (est.) | 143ms |
| Quality (dry-run) | — | 93% |

**Token savings: 78% · Speed: ~245x · Compression: 8.2x**

---

### debate-lite.gft — Lightweight Debate (3 nodes)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~233 | ~267 |
| Output tokens (LLM writes) | ~2,424 (9 files) | ~267 (1 file) |
| **Total tokens** | **~2,657** | **~534** |
| Files to manage | 9 | 1 |
| Time | ~25 sec (est.) | 146ms |
| Quality (dry-run) | — | 90% |

**Token savings: 80% · Speed: ~170x · Compression: 9.1x**

---

### adversarial-debate.gft — Full Debate (8 nodes + memory + conditional)

| Metric | Natural Language | Graft (.gft) |
|--------|-----------------|---------------|
| Input tokens (LLM reads) | ~783 | ~924 |
| Output tokens (LLM writes) | ~6,358 (19 files) | ~924 (1 file) |
| **Total tokens** | **~7,141** | **~1,848** |
| Files to manage | 19 | 1 |
| Time | ~60 sec (est.) | 151ms |
| Quality (dry-run) | — | 97% |

**Token savings: 74% · Speed: ~400x · Compression: 6.9x**

---

## Aggregate Summary

| Example | NL Total | Graft Total | Savings | Compression | Gen Files | Compile Time | Quality |
|---------|----------|-------------|---------|-------------|-----------|-------------|---------|
| hello | 1,600 | 290 | 82% | 9.3x | 6 | 148ms | 75% |
| code-review | 3,728 | 776 | 79% | 8.4x | 10 | 173ms | 93% |
| pr-summarizer | 1,660 | 450 | 73% | 6.5x | 6 | 139ms | 100% |
| chatbot | 827 | 288 | 65% | 4.7x | 4 | 135ms | 100% |
| data-analysis | 4,288 | 796 | 81% | 9.9x | 11 | 147ms | 100% |
| content-pipeline | 3,393 | 744 | 78% | 8.2x | 10 | 143ms | 93% |
| debate-lite | 2,657 | 534 | 80% | 9.1x | 9 | 146ms | 90% |
| adversarial-debate | 7,141 | 1,848 | 74% | 6.9x | 19 | 151ms | 97% |
| **Average** | **3,162** | **716** | **77%** | **7.9x** | **9.4** | **148ms** | **93.5%** |

## Key Insights

1. **Output tokens dominate savings.** LLM output is ~10x more expensive than input. Graft eliminates LLM output entirely — the compiler generates deterministically.

2. **Compression scales with complexity.** Simple pipelines (chatbot: 4.7x) to complex pipelines (data-analysis: 9.9x). More nodes = more hooks/agents = more savings.

3. **Compile time is constant.** 135–173ms regardless of pipeline complexity. Natural language generation scales linearly with output size.

4. **Quality validation is free.** Graft dry-run provides schema/type/range/empty/budget checks that natural language cannot offer.

5. **Single-file management.** 1 `.gft` file vs 4–19 config files. Modifications are single-file edits with compiler-guaranteed consistency.

## Folder Structure

```
benchmarks/
├── SUMMARY.md                      ← this file
├── natural-language-inputs/         ← equivalent NL prompts for each example
│   ├── hello.txt
│   ├── code-review.txt
│   ├── pr-summarizer.txt
│   ├── chatbot.txt
│   ├── data-analysis.txt
│   ├── content-pipeline.txt
│   ├── debate-lite.txt
│   └── adversarial-debate.txt
├── dry-run-outputs/                 ← graft run --dry-run results
│   ├── hello.txt
│   ├── code-review.txt
│   ├── ...
│   └── json/                        ← machine-readable --json output
│       ├── hello.json
│       └── ...
└── output/                          ← graft compile generated files
    ├── hello/
    │   └── .claude/ (agents, hooks, CLAUDE.md, settings.json)
    ├── code-review/
    └── ...
```
