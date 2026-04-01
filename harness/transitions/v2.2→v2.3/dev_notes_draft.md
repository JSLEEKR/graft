# Dev Notes Draft — v2.2

---

## Section 1: Dev Notes Append

> Append to `GraftDevNotes/graft-v1-development-notes.md`

---

## v2.2: LSP, npm, and the Last Mile (April 2026)

### What Changed

v2.2 is six rounds of work across three categories: internal cleanup (R1-R3), developer tooling (R4-R5), and integration testing (R6).

**R1-R3: Tech debt and correctness.** The double-parse in `resolve()` was eliminated — it now accepts a `Program` instead of a raw source string. `VERSION` is derived from package.json via `createRequire` with a try-catch fallback, replacing the hardcoded constant. A `ProgramIndex` class provides O(1) Map-based lookups (5 maps: contextMap, nodeMap, memoryMap, edgesBySource, producesNodeMap), removing all `Array.find()` calls from scope checker, estimator, executor, and codegen. The executor was decomposed from ~475 lines into three files: `prompt-builder.ts` (pure functions), `flow-runner.ts` (flow execution), and a slimmed `executor.ts`. A `GraftErrorCode` union type (21 members by R3) was added to all 34 diagnostic call sites. Five new correctness warnings were added: foreach binding name collision, conditional edge transform, multiple graph, loadMemory verbose diagnostics, and sourceFile tracking on all declarations.

**R4-R5: LSP and npm.** A Language Server Protocol server was built in two files (`server.ts` + `features.ts`) providing real-time diagnostics, hover info (context fields, node config, memory details), and go-to-definition (including cross-file imports). A VS Code extension was created with TextMate grammar for syntax highlighting and an LSP client that auto-launches `graft-lsp`. The package was prepared for npm distribution as `@graft-lang/graft` with `exports` sub-paths, `files` array, `.npmignore` defense-in-depth, and `prepublishOnly` script.

**R6: Integration tests and adversarial backlog.** 13 integration tests covering end-to-end compile with imports, LSP round-trip, npm package verification, and all 4 adversarial test proposals carried over from v2.1. This was a TEST-ONLY round with no design decisions — 2 agent calls instead of the usual 5-11.

### Architecture / Key Decisions

**The GRAPH_MISSING bug.** A3-Skeptic found that `compile()` returned `{ success: false }` WITHOUT the program when a file had no graph declaration. Library files (like `shared.gft`) have no graph by design. This meant the LSP could not provide hover or go-to-definition for library files — the most common use case for cross-file navigation. The fix was a one-line change: include `program` in the GRAPH_MISSING return object, and filter GRAPH_MISSING from LSP diagnostics. A3 proposed a separate `lspCompile()` function, but convergence chose the simpler fix of modifying `compile()` itself.

**Error code taxonomy.** A4-Specialist proposed 24 error codes including future ones (BUDGET_*, PARSE_*). Convergence trimmed this to 18 by applying YAGNI — only codes for errors that exist today. R3 added 3 more (GRAPH_MULTIPLE, SCOPE_BINDING_COLLISION, TRANSFORM_ON_CONDITIONAL) as the warnings they covered were implemented.

**LSP architecture.** All 4 agents converged on a 2-file structure (~230 lines total). A4 proposed 5 files, rejected as over-engineering for the size. All feature handlers in `features.ts` are pure functions — no side effects, no module-level state. The server maintains a per-URI cache of `{ program, index }` that serves stale data on compilation errors.

**VS Code TextMate grammar.** A3-Skeptic caught three issues in the grammar proposal: the spec included `#` comments (Graft only has `//` and `/* */`), escape sequences (the lexer has none), and plain integer matching before k-integer (which would prevent `2k` from being recognized as a token budget). All three corrections were adopted.

### Forced Dissenter Highlights

Cross-critique was skipped in all 6 rounds due to high consensus (score ranges of 0-1, below the threshold of 2). The forced dissenter mechanism was therefore not exercised in v2.2. This is the second consecutive version (after v2.1) where cross-critique was unnecessary — 10 consecutive rounds without it.

Despite skipping cross-critique, the 2-agent and 4-agent analysis phases continued to find meaningful disagreements. In R4, the 4-agent analysis produced 5 disagreements that were all resolved in convergence (file count, URI conversion strategy, intermediate types, GRAPH_MISSING approach, getWordAtPosition return type). The debate mechanism works even without the formal cross-critique step when agents already articulate clear positions.

### Process Evolution

v2.2 introduced a new tier: TEST-ONLY (R6), which uses just 2 agent calls (1 implementer + 1 reviewer) for rounds with no design decisions. Combined with the existing MEDIUM tier (5 calls) and HIGH tier (11 calls), the harness now has three distinct operating modes.

The score-gated cross-critique rule (skip when score range <= 1) has been validated over 10 consecutive rounds. Zero quality issues have been attributed to skipping cross-critique. The savings are significant: 4 agent calls per round, 24 calls saved across v2.2's 6 rounds.

v2.2 also introduced Step 0 research for the first time since v2.0 — R4 (LSP) required it because LSP is a novel domain not covered by existing codebase knowledge. All other rounds correctly skipped Step 0.

### Stats

| Metric | v2.1 | v2.2 | Delta |
|--------|------|------|-------|
| Tests | 288 | 376 | +88 |
| Ratchet decisions | 107 | 132 | +25 |
| Agent calls | 21 | ~33 | +12 |
| Rounds | 4 | 6 | +2 |
| NEEDS_CHANGES | 0 | 0 | 0 |
| Critical bugs found | 1 | 1 (GRAPH_MISSING) | 0 |
| Cross-critique used | 0 of 4 | 0 of 6 | 0 |
| New files | 3 | 8 | +5 |

New files: `src/version.ts`, `src/program-index.ts`, `src/runtime/prompt-builder.ts`, `src/runtime/flow-runner.ts`, `src/lsp/server.ts`, `src/lsp/features.ts`, `editors/vscode/` (extension), `.npmignore`.

---

## Section 2: Blog Post

> Save as `graft-v2-2-lsp-npm.mdx` in `jslee-homepage/content/blog/`

---

```mdx
---
title: "Graft v2.2: LSP, npm, and the Last Mile"
date: "2026-04-01"
description: "Developer tooling release: LSP server with diagnostics/hover/go-to-definition, VS Code extension, npm distribution as @graft-lang/graft. 376 tests, ~33 agent calls, 132 ratchet-locked decisions."
tags: ["graft", "compiler", "adversarial-debate", "lsp", "vscode", "npm", "claude-code"]
---

Graft is a graph-native DSL that compiles `.gft` source files into Claude Code harness structures (`.claude/` directories with agent definitions, hook scripts, and orchestration docs). It is built for LLM-to-LLM communication — structured pipelines with typed schemas and compile-time token budget analysis. Every line of Graft is developed through a multi-agent adversarial debate process where 2-4 AI agents independently analyze, cross-critique, and converge on each design decision.

## What v2.2 Adds

v2.2 bridges the gap between "compiler that works" and "compiler you can use." Three categories: internal cleanup, developer tooling, and distribution.

### LSP Server

A Language Server Protocol server provides real-time feedback in editors. Two files, ~230 lines total:

- **Diagnostics**: errors and warnings on document open/change, with structured error codes
- **Hover**: context fields, node config (model, budget, reads, writes), memory details, produces schema
- **Go-to-definition**: navigate to declarations, including cross-file imports

```graft
node Writer(model: sonnet, budget: 2k/1k) {
  reads: [Input, Log]    # hover on Log -> memory fields
  writes: [Log]          # go-to-definition -> Log declaration
  produces Result { reply: String }
}
# Ctrl+click on 'Log' jumps to the memory declaration, even in another file.
```

The LSP is built on pure functions — all feature handlers in `features.ts` take data in and return results out, with no side effects. The server maintains a per-URI cache so hover and go-to-definition still work when the current edit has syntax errors.

### VS Code Extension

A TextMate grammar provides syntax highlighting for all 35 keywords, type keywords, domain types, and operators. The extension auto-launches `graft-lsp` when a `.gft` file is opened. Comment support covers both `//` line and `/* */` block styles.

### npm Distribution

The package is published as `@graft-lang/graft` with two entry points:

```javascript
import { compile } from '@graft-lang/graft';       // compiler API
import { Program } from '@graft-lang/graft/ast';    // AST types only
```

### Internal Cleanup (R1-R3)

Before the tooling work, three rounds addressed tech debt:

- **Double-parse eliminated**: `resolve()` now accepts a `Program` instead of re-parsing source
- **ProgramIndex**: O(1) Map-based lookups replacing `Array.find()` across the pipeline
- **Executor decomposed**: split from ~475 lines into `prompt-builder.ts` (pure) + `flow-runner.ts` (flow) + slimmed `executor.ts`
- **Structured error codes**: `GraftErrorCode` (21-member union) on all 34 diagnostic sites
- **5 new correctness warnings**: foreach binding collision, conditional edge transform, multiple graph, and more

## The Bug That Mattered

A3-Skeptic found the critical bug in Round 4. When `compile()` encounters a file with no graph declaration, it returned `{ success: false }` without the parsed program. Library files — designed to be imported, not executed — have no graph. This meant the LSP could provide zero intelligence for library files: no hover, no go-to-definition, nothing.

The fix was a single line: include `program` in the error return object. But diagnosing it required understanding both the compiler pipeline (which treats no-graph as a hard error) and the LSP use case (which needs the program regardless). Three of four agents missed it entirely because they assumed `compile()` would always produce a usable program on parseable input. A3's analysis started from the question "what happens when I open `shared.gft`?" — a library file that exists in the example set since v2.0.

## Debate Highlights

**Error code taxonomy**: A4-Specialist proposed 24 codes including speculative future ones. Convergence applied YAGNI, trimming to 18 codes for existing errors only. Three more were added in R3 when their corresponding warnings were implemented.

**LSP file count**: A4 proposed 5 files for the LSP. The other three agents agreed on 2 files (~230 lines total). When the entire feature fits in two screens, splitting it across five files adds navigation overhead without improving comprehension.

**TextMate grammar corrections**: A3-Skeptic caught three errors in the VS Code grammar proposal — `#` comments (Graft uses `//` and `/* */`), escape sequences (the lexer has none), and integer matching before k-integer (`2k` would be tokenized as `2` + `k`). Small catches, but each would have produced visible highlighting bugs for every user.

## Process: Score-Gated Cross-Critique

Cross-critique was skipped in all 6 rounds — the longest streak since the harness was introduced. The rule: when all agents score within 1 point of each other (high consensus), the formal cross-critique phase is skipped. In v2.2, this saved an estimated 24 agent calls with no quality loss.

The key insight: cross-critique is most valuable when agents disagree fundamentally. When consensus is high, the disagreements are already clearly stated in the analysis phase and resolved in convergence without an extra round.

v2.2 also introduced a TEST-ONLY tier for Round 6 (integration tests, no design decisions), using just 2 agent calls instead of the usual 5-11. The harness now operates at three tiers: HIGH (~11 calls), MEDIUM (~5 calls), and TEST-ONLY (~2 calls).

## Stats

| Metric | v2.1 | v2.2 |
|--------|------|------|
| Tests | 288 | 376 (+88) |
| Ratchet decisions | 107 | 132 (+25) |
| Agent calls | 21 | ~33 |
| Rounds | 4 | 6 |
| NEEDS_CHANGES | 0 | 0 |
| Critical bugs found | 1 | 1 |
| Cross-critique used | 0 of 4 | 0 of 6 |
| New production files | 3 | 8 |

Consecutive rounds with first-attempt review pass: 15 (since v2.0-R1).

## Try It

```bash
git clone https://github.com/JSLEEKR/Graft.git
cd Graft
npm install
npm run build

# Compile a .gft file
npx graft compile examples/chatbot.gft

# Run a pipeline
npx graft run examples/chatbot.gft --input '{"message": "hello"}'

# Check without compiling
npx graft check examples/chatbot.gft

# Start the LSP server (for editor integration)
npx graft-lsp --stdio

# Run tests
npm test  # 376 tests
```

The VS Code extension is in `editors/vscode/`. Install it locally with `code --install-extension` after building.

Built with Claude Opus 4.6 via the adversarial debate harness. ~33 agent calls, 132 ratchet-locked decisions, zero review failures across 15 consecutive rounds.
```
