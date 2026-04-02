# v4.3 Dev Notes Draft

> This file contains two sections:
> 1. New section to APPEND to GraftDevNotes/graft-v1-development-notes.md (before the v4.2 entry)
> 2. NEW standalone blog post for graft-v4-3-arithmetic-operators.mdx

---

## SECTION 1: Dev Notes Entry (append to graft-v1-development-notes.md)

<!-- INSERT BEFORE the v4.2 entry, after the --- separator following v2.2 -->

## v4.3: Arithmetic Operators & Built-in Functions (April 2026)

### What Changed

v4.3 completes the arithmetic operator set and adds three new built-in functions. Three rounds: R1 (MEDIUM), R2 (DIRECT), R3 (TEST-ONLY).

**Multiplication and modulo operators**: `*` and `%` join the existing `+`, `-`, `/`. Two new tokens (Star, Percent) added to the lexer's `SINGLE_CHAR` map. The binary op union in `ast.ts` extended to include both. A new `parseMultiplicative` precedence level slots between `parseAdditive` and `parseUnary`, giving the standard precedence chain: `parseExpr -> parseAdditive (+/-) -> parseMultiplicative (*/%/) -> parseUnary (-/!) -> parsePrimary`.

**Division precedence fix**: Division was previously at additive precedence (v4.0-R02 ratchet: "Division at additive precedence, flat with +/-"). This meant `2 + 6 / 3` evaluated as `(2 + 6) / 3 = 2.67` instead of the mathematically correct `2 + (6 / 3) = 4`. v4.3 unlocked this ratchet and moved division to the new multiplicative level. This is the 6th ratchet unlock in the project's history.

**Three new builtins**: `abs(value)` returns the absolute value of a number. `round(value)` rounds to the nearest integer. `keys(object)` returns `Object.keys()` for objects, empty array for non-objects. BUILTIN_FUNCTIONS now has 7 entries total.

**str() improvement**: Previously used `String()` for all values, which produced `[object Object]` for objects and arrays. Now uses `JSON.stringify` for objects/arrays and `String()` for primitives. `str(null)` correctly returns `"null"`.

**Hover docs**: All three new builtins have LSP hover documentation with signatures (`abs(value: number): number`, etc.).

### Key Decisions

**Ratchet unlock for division precedence**: The most notable decision was unlocking v4.0-R02. When v4.0 introduced division, there was no multiplicative level — all arithmetic was flat at additive precedence. This was technically correct for a system with only `+`, `-`, `/`. Adding `*` and `%` required standard math precedence, which meant division had to move. The ratchet system handled this cleanly: unlock was identified in R1, documented in common_memory, and required no separate debate.

**Extraction deferred (YAGNI)**: The v4.3 plan originally included `expr-eval.ts` extraction in R2 — pulling `evaluateExpr` and `resolveNestedField` out of `flow-runner.ts` (now 404 lines). This was correctly dropped. The file is at the threshold but not past it, and the extraction would have added a round of complexity for no immediate benefit. Deferred to v4.4.

**Modulo-by-zero warning**: Follows the same pattern as division-by-zero from v4.1. `evaluateExpr` pushes a warning string instead of throwing, returns 0 as the fallback value. Consistent behavior across all zero-divisor cases.

### Forced Dissenter Highlights

No forced dissenter in v4.3. R1 used MEDIUM tier (A2+A3 only, not full 4-agent debate). R2 and R3 were DIRECT and TEST-ONLY respectively. The feature space was well-defined — standard arithmetic operators with established precedence rules — and did not benefit from architectural debate.

### Stats

| Metric | v4.2 | v4.3 | Delta |
|--------|------|------|-------|
| Tests | 1,048 | 1,077 | +29 |
| Ratchet decisions | ~292 | ~302 | +10 (1 unlocked) |
| Agent calls | ~10 | ~6 | -4 |
| Rounds | 4 | 3 | -1 |
| NEEDS_CHANGES | 0 | 0 | 0 |
| Consecutive PASS rounds | 14 | 17 | +3 |

All 3 rounds passed on first try. 17 consecutive PASS rounds (v4.0-R1 through v4.3-R3).

---

## SECTION 2: Blog Post (graft-v4-3-arithmetic-operators.mdx)

```mdx
---
title: "Graft v4.3: Arithmetic Operators"
date: "2026-04-02"
description: "Multiplication, modulo, abs/round/keys builtins, division precedence fix. 1,077 tests, 3 rounds, 17 consecutive PASS."
tags: ["graft", "compiler", "llm", "adversarial-debate", "claude"]
---

Graft is a domain-specific language for defining LLM agent pipelines. The compiler takes `.gft` files and generates Claude Code harness structures. Development uses an adversarial debate harness where multiple AI agents independently analyze, critique, and converge before implementation.

v4.3 completes the arithmetic operator set and adds three new built-in functions. Three rounds, ~6 agent calls, 29 new tests (1,077 total).

## What This Version Adds

**Multiplication and modulo.** The `*` and `%` operators complete Graft's arithmetic:

```gft
graph Pipeline(input: Spec, output: Report, budget: 20k) {
  Analyzer
  -> let total = Analyzer.count * Analyzer.weight
  -> let bucket = Analyzer.score % 10
  -> Formatter -> done
}
```

These follow standard math precedence. `2 + 3 * 4` evaluates to `14`, not `20`. A new `parseMultiplicative` level in the parser handles `*`, `%`, and `/` at higher precedence than `+` and `-`.

**Division precedence fix.** In v4.0-v4.2, division shared precedence with addition. `2 + 6 / 3` evaluated left-to-right as `(2 + 6) / 3 = 2.67`. v4.3 moves division to multiplicative precedence: `2 + 6 / 3 = 4`. This required unlocking a ratchet decision from v4.0 — the 6th ratchet unlock in the project's history.

**Three new builtins.** `abs()`, `round()`, and `keys()` join the existing `len()`, `max()`, `min()`, `str()`:

```gft
graph Analysis(input: Data, output: Summary, budget: 15k) {
  Scorer
  -> let diff = abs(Scorer.actual - Scorer.expected)
  -> let rounded = round(Scorer.average)
  -> let fields = keys(Scorer.metadata)
  -> let count = len(fields)
  -> Reporter -> done
}
```

- `abs(value)` — absolute value of a number
- `round(value)` — round to nearest integer
- `keys(object)` — object keys as array; empty array for non-objects

Functions compose: `len(keys(Scorer.metadata))` returns the number of fields in an object. All builtins have LSP hover documentation with type signatures.

**str() fix.** Previously, `str()` on an object returned `[object Object]`. Now it uses `JSON.stringify` for objects and arrays, `String()` for primitives. `str(null)` correctly returns `"null"`.

## Implementation Highlights

**Precedence chain.** The parser now has a clean four-level chain:

```
parseExpr -> parseAdditive (+/-) -> parseMultiplicative (*/%/) -> parseUnary (-/!) -> parsePrimary
```

Each level calls the next-higher-precedence function and loops on its own operators. Adding a new precedence level (e.g., exponentiation) would mean inserting one more function into the chain.

**Ratchet unlock.** v4.0-R02 locked "Division at additive precedence." When v4.3 introduced multiplicative precedence, this ratchet had to be unlocked — division belongs with `*` and `%`, not with `+` and `-`. The ratchet system worked as designed: the lock prevented accidental changes during v4.1 and v4.2, then was deliberately unlocked when the requirement changed.

**BUILTIN_FUNCTIONS registry.** Now 7 entries. Each builtin requires one entry in the `Record<string, { arity: number }>` registry plus one switch case in `evaluateExpr`. Four consumers (evaluator, type checker, hover docs, display formatter) each hardcode function-specific behavior. At the 8th function, the plan calls for consolidating into a richer descriptor.

## Process Notes

Three rounds at three different tiers:

- **R1 (MEDIUM)**: 2-agent analysis (A2+A3). New tokens, precedence level, builtins, ratchet unlock. 15 tests.
- **R2 (DIRECT)**: str() fix, division precedence verification. Originally planned to include expr-eval.ts extraction, correctly deferred as YAGNI. 6 tests.
- **R3 (TEST-ONLY)**: Integration and regression. Cross-feature tests (multiplication in let bindings, keys+len composition), regression for existing operators and builtins. 8 tests.

No forced dissenter — MEDIUM tier uses 2 agents, not the full 4-agent debate. The feature space (standard arithmetic operators with well-known precedence rules) did not require architectural debate.

The plan's R2 originally scoped expr-eval.ts extraction (flow-runner.ts at 404 lines), but this was correctly dropped. The file is at the threshold, not past it. Deferred to v4.4.

## Stats

| Metric | v4.2 | v4.3 | Delta |
|--------|------|------|-------|
| Tests | 1,048 | 1,077 | +29 |
| Ratchets | ~292 | ~302 | +10 |
| Rounds | 4 | 3 | -1 |
| NEEDS_CHANGES | 0 | 0 | 0 |
| Consecutive PASS | 14 | 17 | +3 |

17 consecutive PASS rounds (v4.0-R1 through v4.3-R3). ~6 agent calls — the most efficient feature release in v4.x.

## Try It

```bash
npm install -g @graft-lang/graft
graft compile examples/chatbot.gft --out-dir ./output
graft run examples/hello.gft --input '{"question":"test"}' --dry-run
```

Or from source: `git clone https://github.com/JSLEEKR/graft.git && cd graft && npm install && npm run build`
```

---

*End of dev notes draft. Orchestrator: apply Section 1 to GraftDevNotes, Section 2 as new .mdx file.*
