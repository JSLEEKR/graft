# Dev Notes Draft — v2.1

## Part 1: Section to APPEND to graft-v1-development-notes.md

---

## v2.1: Token Tracking & Correctness (April 2026)

### What Changed

v2.1 is a quality release: no new language syntax, no new keywords. Instead, it delivers three categories of improvement across the existing pipeline.

1. **Shared module extraction (R1).** `MODEL_MAP` had been duplicated in `estimator.ts` and `executor.ts` since T6 — a known tech debt item tracked across 4 versions. v2.1 finally extracted it to `src/constants.ts` alongside `PARTIAL_FIELD_FACTOR`, `BUDGET_WARNING_THRESHOLD`, and `BUDGET_CRITICAL_THRESHOLD`. Similarly, `fieldsToJsonExample` and `typeToExample` moved to `src/utils.ts`, and `loadMemory`/`saveMemory` became standalone functions in `src/runtime/memory.ts`. Two ratchet items were unlocked for the first time in the project's history to enable this extraction.

2. **Correctness fixes (R2).** Four new validations:
   - **Writes schema overlap**: warns when a node's produces fields have zero overlap with the memory it writes to (TypeChecker)
   - **max_tokens > 0**: validates that contexts and memories declare positive token budgets (ScopeChecker)
   - **Parallel memory write detection**: warns when 2+ parallel branches write to the same memory (ScopeChecker)
   - **compiler.ts warning routing**: diagnostics now filtered by severity — warnings no longer block compilation

3. **Token tracking (R3-R4).** Runtime token usage monitoring across pipeline execution:
   - `parseCLIOutput` with heuristic envelope detection (`--output-format json` replaces `--print`)
   - `TokenTracker` class for cumulative budget tracking per node
   - Token log file (`.graft/token_log.txt`) with ISO timestamps, estimates, actuals, and cumulative budget percentage
   - `RunResult.tokenUsage` with budget/consumed/fraction/perNode breakdown
   - Advisory budget warnings at 80% and 90% thresholds

### The Bugs That Mattered

**compiler.ts warning routing (R2).** Both A3-Skeptic (7/10) and A4-Specialist (8/10) independently found the same critical bug: `compiler.ts` pushed all checker results into `errors[]` without filtering by severity. Any warning — no matter how minor — would block compilation. This was a prerequisite for the rest of R2's work. Without fixing it first, adding new warnings (writes overlap, parallel writes) would have made valid programs fail to compile. The fix was straightforward (filter by `d.severity === 'warning'`), but the bug had existed since T7 and would have been invisible until v2.1 added its first warnings.

**Mock spawner backward compatibility (R3).** A2-Pragmatist found that the new heuristic envelope detection in `parseCLIOutput` would break existing test mocks. Mocks returned `{ result: "..." }` as node output, and the heuristic would incorrectly unwrap it as a CLI envelope. The fix: require BOTH a `result` key AND at least one metadata field (`usage`, `model`, or `cost_usd`) before treating JSON as a CLI envelope. This prevents false positives from legitimate node outputs that happen to have a `result` field.

**CLI format uncertainty (R3).** A3-Skeptic identified that the Claude CLI's `--output-format json` output may not always include a `usage` field. The design handles this gracefully: `parseCLIOutput` returns `tokenUsage: undefined` when usage data is missing, `TokenTracker.record()` falls back to the budget estimate, and the token log shows "N/A" for actuals. No crash paths — all token tracking is advisory.

### Process Evolution

v2.1 was the most efficient version to date: **21 agent calls vs 36 budgeted (42% under budget)**, and a 70% reduction from v2.0's ~70 calls. The efficiency came from four process improvements validated by the v2.0 retrospective:

1. **MEDIUM complexity tier.** R1 and R2 used 2-agent analysis instead of 4. Both rounds had high consensus (agents scored 7-8/10) and the debate surfaced the same findings with half the agents. R4 went further — debate was skipped entirely for a test-only round (2 agent calls total).

2. **Step 0 skipped in all 4 rounds.** Research adds value when introducing novel concepts. v2.1 operated on existing codebase patterns (extraction, validation, integration), where "explore prior art" provides nothing.

3. **Cross-critique skipped in all 4 rounds.** This was the biggest surprise. R1 and R2 had such high consensus that cross-critique would have been agents agreeing with each other. R3 (the only HIGH-complexity round) had scores in the 6-8 range — moderate consensus with clearly stated disagreements — making cross-critique redundant. The convergence agent had sufficient signal from Step 1 alone.

4. **Convergence code only for critical sections.** Only R3 convergence wrote full implementation code (subprocess parsing, TokenTracker class). R1 and R2 wrote targeted snippets. R4 was prose-only. This reduced spec drift and gave the implementer latitude to adapt to the actual codebase.

The forced dissenter mechanism was not exercised — it requires cross-critique to function, and cross-critique was correctly skipped. The mechanism remains available for HIGH-complexity rounds with low consensus.

This was also the first version with **zero NEEDS_CHANGES** across all reviews. Every round passed on the first attempt.

### Stats

| Metric | Value |
|--------|-------|
| Tests | 288 (39 new) |
| Ratchet decisions | 107 (17 new, 2 unlocked) |
| Agent calls | 21 (budget: 36, 42% under) |
| Rounds | 4 (R1-R4) |
| NEEDS_CHANGES | 0 |
| Commits | 12 |
| Critical bugs found | 1 (compiler.ts warning routing) |
| Design issues found | 2 (CLI format uncertainty, mock spawner compat) |
| Cross-critique rounds used | 0 of 4 |
| Step 0 rounds used | 0 of 4 |

---

## Part 2: NEW Blog Post

Filename: `graft-v2-1-token-tracking.mdx`

```mdx
---
title: "Graft v2.1: Token Tracking & Correctness"
date: "2026-04-01"
description: "Quality release with runtime token tracking, 4 correctness fixes, and shared module extraction. 288 tests, 21 agent calls (42% under budget), zero review failures."
tags: ["graft", "compiler", "adversarial-debate", "token-tracking", "claude-code"]
---

Graft is a graph-native DSL that compiles `.gft` source files into Claude Code harness structures (`.claude/` directories with agent definitions, hook scripts, and orchestration docs). It is built for LLM-to-LLM communication — structured pipelines with typed schemas and compile-time token budget analysis. Every line of Graft is developed through a multi-agent adversarial debate process where 2-4 AI agents independently analyze, cross-critique, and converge on each design decision.

## What v2.1 Adds

v2.1 is a quality release. No new syntax, no new keywords. Three categories of improvement:

### Runtime Token Tracking

After v1.2 added `graft run` and v2.0 added memory, the missing piece was visibility into actual token consumption. v2.1 adds a `TokenTracker` that monitors usage per node during pipeline execution:

```
[token] Classifier  est: 3000  actual: 2847  cumulative: 2847/10000 (28.5%)
[token] Assigner    est: 1500  actual: 1203  cumulative: 4050/10000 (40.5%)
```

The tracker logs to `.graft/token_log.txt` with ISO timestamps. `RunResult.tokenUsage` provides programmatic access with budget/consumed/fraction/perNode breakdown. Budget enforcement is advisory — warnings at 80% and 90% thresholds, no hard abort.

Under the hood, `parseCLIOutput` uses a heuristic envelope detection to separate Claude CLI metadata from node output. The executor switched from `--print` to `--output-format json` to get structured usage data.

### Correctness Fixes

Four new validations that catch real mistakes:

```gft
memory Log(max_tokens: 2k, storage: file) {
  turns: List<String>
  summary: String
}

node Writer(model: sonnet, budget: 2k/1k) {
  reads: [Input]
  writes: [Log]
  produces Result { reply: String }
}
# Warning: Writer produces no matching fields for memory Log
# (Result has 'reply', Log expects 'turns' and 'summary')
```

- **Writes schema overlap**: warns when produces fields don't match memory fields
- **max_tokens > 0**: catches `max_tokens: 0` declarations
- **Parallel memory writes**: warns when `parallel { A B }` and both write to the same memory
- **Warning routing fix**: warnings no longer block compilation (bug since v1.0)

### Shared Module Extraction

`MODEL_MAP` had been duplicated in two files since T6 — a tracked tech debt item across 4 versions. v2.1 extracted it to `src/constants.ts` alongside three other constants. Utility functions moved to `src/utils.ts`, and memory I/O became standalone functions in `src/runtime/memory.ts`. Two ratchet-locked decisions were unlocked for the first time in the project to enable this.

## The Bugs That Mattered

**The warning routing bug** was the standout finding. Since v1.0, `compiler.ts` had pushed all analyzer diagnostics into `errors[]` without checking severity. This meant any warning would block compilation — a bug that was invisible because v1.0 through v2.0 never emitted warnings. Both A3-Skeptic and A4-Specialist found it independently in the 2-agent analysis. Without fixing it first, the new warning validations would have broken valid programs.

**Mock spawner backward compatibility** was subtler. The new `parseCLIOutput` function needed to distinguish CLI envelope JSON (`{ result: "...", usage: {...} }`) from regular node output that happens to contain a `result` field. A2-Pragmatist caught that existing test mocks returned `{ result: "..." }` and would be incorrectly unwrapped. The fix: require both `result` AND at least one metadata field (`usage`, `model`, or `cost_usd`) before treating output as a CLI envelope.

## Process Evolution: 42% Under Budget

v2.1 used 21 agent calls against a 36-call budget — a 42% reduction and 70% less than v2.0's ~70 calls. This came from four adaptations:

| Adaptation | Savings | Rationale |
|-----------|---------|-----------|
| MEDIUM tier (2-agent analysis) | -16 calls | R1, R2, R4 had high consensus; 4 agents would not have added insight |
| Skip Step 0 (research) | -8 calls | All rounds extended existing patterns; no novel domains |
| Skip cross-critique | -8+ calls | Even R3 (HIGH complexity) had clearly stated disagreements in Step 1 |
| Test-only round collapse | -6 calls | R4 needed no design decisions — 2 calls instead of 8 |

The forced dissenter mechanism was not exercised (it requires cross-critique), but remains available for high-complexity rounds with low consensus.

This was the first version with **zero NEEDS_CHANGES** — every round passed review on the first attempt. Combined with v2.0's zero NEEDS_CHANGES, the last 9 consecutive rounds have passed first-attempt review.

## Stats

| Metric | v2.0 | v2.1 |
|--------|------|------|
| Tests | 249 | 288 (+39) |
| Ratchet decisions | 92 | 107 (+17, 2 unlocked) |
| Agent calls | ~70 | 21 (42% under budget) |
| Rounds | 5 | 4 |
| NEEDS_CHANGES | 0 | 0 |
| Commits | -- | 12 |
| Critical bugs found | 2 | 1 |
| Cross-critique used | 4 of 5 | 0 of 4 |

## Try It

```bash
git clone https://github.com/JSLEEKR/Graft.git
cd Graft
npm install
npm run build

# Compile a .gft file
npx graft compile examples/chatbot.gft

# Run a pipeline with token tracking
npx graft run examples/chatbot.gft --input '{"message": "hello"}'

# Check without compiling
npx graft check examples/chatbot.gft

# Run tests
npm test  # 288 tests
```

Built with Claude Opus 4.6 via the adversarial debate harness. 21 agent calls, 107 ratchet-locked decisions, zero review failures.
```
