# Dev Notes Draft — v3.0

---

## Section 1: Dev Notes (append to GraftDevNotes/graft-v1-development-notes.md)

---

## v3.0: Multi-Backend Codegen & Field-Level Writes (April 2026)

### What Changed

v3.0 is eight rounds across three themes: architecture (R1-R4), runtime features (R5-R7), and integration testing (R8). The first four rounds used the full debate harness; the last four were direct implementation after a context window overflow forced session recovery. All eight passed review on the first attempt.

**R1-R4: Architecture.** The compiler pipeline was split into three entry points: `compileToProgram()` (parse + analyze), `compileAndGenerate()` (+ codegen), and `compile()` (+ file writes). `ProgramIndex` was threaded through all analyzer and runtime constructors as an optional parameter with `?? new ProgramIndex(program)` fallback. A `RuntimeState` interface was introduced in `prompt-builder.ts` to unify `PromptContext` and `FlowContext`.

The `writes` clause was upgraded from `string[]` to `WriteRef { memory, field?, location }`, enabling field-level memory writes. `ContextRef.field` changed from `string | undefined` to `string[]| undefined`, enabling multi-field partial reads with brace syntax: `reads: [Ctx.{f1, f2}]`. A `CodegenBackend` interface was introduced with four methods (`generateAgent`, `generateHook`, `generateOrchestration`, `generateSettings`), with `ClaudeCodeBackend` as the default implementation. `ProgramIndex` gained field-level maps (`producesFieldsMap`, `memoryFieldsMap`), and `TypeChecker` was migrated to accept `ProgramIndex` — unlocking the ratchet that had kept it excluded since v2.2.

**R5-R7: Runtime features.** Failure strategies moved from the deferred backlog to full implementation: `retry(N)`, `fallback(NodeName)`, `skip`, `abort`, and `retry_then_fallback(N, NodeName)` are now handled by `executeWithFailureStrategy` in `flow-runner.ts`. `ScopeChecker` validates fallback node references via `SCOPE_INVALID_FALLBACK`. Quality cleanup added `SourceLocation.length` on all tokens, reorganized `GraftErrorCode` into sub-unions (`ParseErrorCode | ScopeErrorCode | TypeErrorCode | ...`), added `PARSE_UNEXPECTED_TOKEN` and `PARSE_MISSING_FIELD` codes to the parser, and cleaned up foreach binding save/restore. LSP improvements included import dependency tracking with transitive invalidation, diagnostic ranges using `SourceLocation.length` for non-zero-width squiggles, and a 200ms debounce on `onDidChangeContent`. Runtime `saveMemory` now accepts an optional `fields?: string[]` parameter for field-level writes, and the executor passes `WriteRef.field` through.

**R8: Integration tests.** 12 new tests covering end-to-end pipeline, failure strategies, WriteRef, multi-field reads, parse error codes, and SourceLocation length.

### Key Decisions

**WriteRef silent runtime bugs.** A3-Skeptic found two critical bugs in R2 that all three other agents missed. The old `writes: string[]` was being replaced with `WriteRef[]`, but existing codegen code called `writes.join(', ')` — which on an array of objects produces `[object Object], [object Object]`. Separately, code iterating over `ref.field` when `field` changed from `string` to `string[]` would iterate characters instead of field names. Both were silent data corruption: no errors thrown, just wrong output. This was the single highest-value debate contribution in v3.0.

**CodegenBackend granularity.** R3 debated whether the backend interface should have a single `generate()` method or fine-grained methods. All four agents (including A3-Skeptic with domain expertise) converged on four methods. A dead import cleanup was caught by the reviewer and applied.

**ProgramIndex field maps deduplication.** R4 migrated TypeChecker to ProgramIndex, unlocking ratchet v2.2-R05. The `producesFieldsMap` is dual-keyed (by both node name AND produces name) to support both ScopeChecker's node-centric lookups and TypeChecker's produces-centric lookups. This eliminated duplicate field iteration in both checkers.

**Direct implementation viability.** R5-R8 completed without any debate — no multi-agent analysis, no cross-critique, no convergence step. All four rounds passed first try, producing 37 tests and 15 ratchets. This natural experiment proved that well-scoped rounds following established patterns do not need multi-agent debate.

### Forced Dissenter Highlights

Cross-critique was skipped in all eligible rounds (R2-R4) due to high consensus, so the forced dissenter mechanism was never formally activated in v3.0. However, A3-Skeptic's natural adversarial analysis in R2 was the version's most important contribution — catching two silent runtime bugs (WriteRef `.join()` on objects, string iteration on `field` array) that would have shipped as data corruption. The finding reinforces that A3's value comes from systematic adversarial thinking in Step 1, not from the formal forced dissenter assignment in Step 2.

The process retrospective recommends replacing forced dissent with a permanent adversarial checklist embedded in all Step 1 prompts: silent data corruption paths, type coercion traps, backward compatibility breaks, and missing error paths.

### Process Evolution

v3.0 validated a new operating mode: DIRECT tier. After context window overflow at the R4/R5 boundary, rounds R5-R8 were implemented without any debate infrastructure. The 100% first-try pass rate across these rounds — combined with 37 new tests and 15 new ratchets — proves that debate is unnecessary for additive features within an established architecture.

Step 0 (Research) was not run in any round, continuing the trend from v2.1. The process retrospective recommends removing it from the default process and making it opt-in for genuinely novel subsystems.

The convergence-then-implement split (Steps 3 and 4) showed increasing overhead as convergence reports became full implementation specs. The retrospective recommends merging them for future versions.

Total agent calls: ~26 (vs ~56 if all rounds used MEDIUM, ~112 if all used HIGH). This is the most efficient version yet relative to output.

### Stats

| Metric | v2.2 | v3.0 | Delta |
|--------|------|------|-------|
| Tests | 376 | 477 | +101 |
| Ratchet decisions | 132 | 168 | +36 (17 new, 4 unlocked) |
| Agent calls | ~33 | ~26 | -7 |
| Rounds | 6 | 8 | +2 |
| NEEDS_CHANGES | 0 | 0 | 0 |
| Critical bugs found | 1 | 2 (both R2, A3-Skeptic) | +1 |
| Cross-critique used | 0 of 6 | 0 of 4 eligible | 0 |
| Debated rounds | 6 | 4 | -2 |
| Direct rounds | 0 | 4 | +4 |
| New source files | 8 | 0 | -8 |

No new source files were added — v3.0 evolved existing files. The `CodegenBackend` interface, `WriteRef` type, failure strategy handler, and field-level maps were all added to existing modules.

---

---

## Section 2: Blog Post Draft

File: `graft-v3-0-multi-backend-field-writes.mdx`

---

```mdx
---
title: "Graft v3.0: Multi-Backend Codegen, Field-Level Writes, and What Happens When You Skip Debate"
date: "2026-04-02"
description: "Graft v3.0 adds pluggable codegen backends, field-level memory writes, multi-field partial reads, and failure strategies. 477 tests, 168 ratchet decisions, 8 rounds — half without any debate."
tags: ["graft", "compiler", "adversarial-debate", "ai-agents", "typescript"]
---

Graft is a graph-native language for AI agent harness engineering. It compiles `.gft` source files into execution harnesses — declaring how agents communicate, what context they share, and how token budgets flow through a pipeline. The compiler is built with a multi-agent adversarial debate process where 2-4 AI agents independently analyze, cross-critique, and converge on implementations.

v3.0 is the biggest architectural release since v2.0. Three new capabilities, a quality cleanup pass, and an accidental experiment that proved half the debate process is optional.

## What's New

### Pluggable Codegen Backends

Graft's codegen previously hardcoded Claude Code output. v3.0 introduces a `CodegenBackend` interface with four methods, making the output target swappable:

```graft
# Compile with the default Claude Code backend
graft compile pipeline.gft

# Or specify a backend explicitly
graft compile pipeline.gft --backend claude-code
```

The `ClaudeCodeBackend` delegates to the existing standalone functions — zero restructuring of working code. New backends (Cursor rules, Windsurf, raw markdown) can implement the same four-method interface: `generateAgent`, `generateHook`, `generateOrchestration`, `generateSettings`.

### Field-Level Memory Writes

v2.0 introduced memory declarations. v3.0 makes writes precise. Instead of writing an entire memory object, nodes can target specific fields:

```graft
memory UserProfile(max_tokens: 1k, storage: file) {
  name: String
  preferences: Map<String, String>
  history: List<String>
}

node Updater(model: haiku, budget: 2k/1k) {
  reads: [UserProfile]
  writes: [UserProfile.preferences]    # only touches this field
  produces Result { status: String }
}
```

Under the hood, `writes: string[]` became `WriteRef { memory, field?, location }`. The runtime `saveMemory` accepts an optional `fields` parameter for surgical JSON updates instead of full object replacement.

### Multi-Field Partial Reads

Nodes can now read multiple fields from a context or memory in a single declaration using brace syntax:

```graft
node Analyzer(model: sonnet, budget: 4k/2k) {
  reads: [UserProfile.{name, preferences}]    # two fields, one source
  produces Analysis { summary: String }
}
```

This compiles to `ContextRef.field: string[]` (previously `string | undefined`). The token estimator scales correctly: `Math.min(PARTIAL_FIELD_FACTOR * fieldCount, 1.0)` at all three estimation sites.

### Failure Strategies

The `on_failure` clause, deferred since v1.2, is now fully implemented:

```graft
node Risky(model: sonnet, budget: 5k/2k) {
  on_failure: retry(3)
  # or: fallback(SafeNode), skip, abort, retry_then_fallback(2, SafeNode)
  produces Result { data: String }
}
```

`executeWithFailureStrategy` in the flow runner handles all five strategies. The scope checker validates fallback references at compile time via `SCOPE_INVALID_FALLBACK`.

## The Debate That Mattered

v3.0 ran 8 rounds. The first 4 used multi-agent debate (MEDIUM and HIGH tiers). The last 4 were direct implementation — no debate at all.

Only one debate round produced bugs the process actually caught: **R2 (WriteRef + multi-field reads)**. A3-Skeptic found two silent runtime corruption bugs that all three other agents missed:

1. **`.join()` on objects**: Existing codegen called `writes.join(', ')`. When `writes` changed from `string[]` to `WriteRef[]`, this produced `[object Object], [object Object]` instead of memory names. No error thrown — just garbage in the generated harness.

2. **String iteration on arrays**: Code iterating `ref.field` when `field` changed from `string` to `string[]` would iterate individual characters (`'n'`, `'a'`, `'m'`, `'e'`) instead of field names (`'name'`). Again, silent corruption.

Both bugs would have shipped undetected without adversarial analysis. This is the third consecutive version where A3-Skeptic's silent-corruption instinct was the single highest-value debate contribution.

## Quality Cleanup

R6 reorganized `GraftErrorCode` from a flat 21-member union into sub-unions: `ParseErrorCode | ScopeErrorCode | TypeErrorCode | BudgetErrorCode | ImportErrorCode | GraphErrorCode | ConfigErrorCode`. The parser gained `PARSE_UNEXPECTED_TOKEN` and `PARSE_MISSING_FIELD` codes — unlocking a ratchet that had kept it throw-only since v2.2. `SourceLocation` gained a `length` field on all tokens, enabling the LSP to render non-zero-width diagnostic squiggles. Dead code (bench script, stale error names) was removed.

## What Skipping Debate Proved

After R4, the context window overflowed, forcing session recovery. R5-R8 were implemented without any debate infrastructure: no multi-agent analysis, no cross-critique, no convergence step. A single agent implemented each round directly.

All four passed review on the first attempt. They produced 37 new tests and 15 new ratchet decisions.

**Why it worked**: By R5, the codebase had strong conventions (ProgramIndex threading, error code sub-unions, CodegenBackend interface). Each round had narrow scope. The 430+ existing tests caught regressions. Common memory provided enough design context without live debate.

**The decision rule**: Use debate when introducing new *concepts* (interfaces, subsystems, data structures). Skip it when applying existing concepts to new inputs. v3.0 proved this empirically.

## Stats

| Metric | Value |
|--------|-------|
| Tests | 477 (101 new) |
| Ratchet decisions | 168 (17 new, 4 unlocked) |
| Rounds | 8 (4 debated, 4 direct) |
| Agent calls | ~26 |
| First-try pass rate | 100% (8/8) |
| Critical bugs caught | 2 (both A3-Skeptic, R2) |
| Cross-critique used | 0 |
| New source files | 0 (all changes in existing modules) |

## Try It

```bash
npm install -g @graft-lang/graft

# Compile a pipeline
graft compile pipeline.gft --out-dir ./output

# Check without generating files
graft check pipeline.gft

# Run with dry-run mode
graft run pipeline.gft --input '{"task": "review"}' --dry-run
```

Source: [github.com/JSLEEKR/graft](https://github.com/JSLEEKR/graft)
```
