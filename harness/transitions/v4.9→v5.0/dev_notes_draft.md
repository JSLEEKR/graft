# Dev Notes Draft — v4.0-v4.9 (The Expression System)

## Section 1: Dev Notes Entry

> To be appended to `C:\Users\user\OneDrive\Documents\GraftDevNotes\graft-v1-development-notes.md`

---

## v4.0-v4.9: The Expression System (April 2026)

### What Changed

The v4.x series delivered a complete expression system across 10 minor versions — the longest sustained development arc in Graft's history. Starting from zero expression support, it built up: let bindings, arithmetic operators, graph parameters and calls (v4.0), quality hardening and scope extraction (v4.1), built-in functions and graph call return values (v4.2), multiplication/modulo/new builtins (v4.3), string interpolation and registry enrichment (v4.4), comparison operators and conditional expressions (v4.5), logical operators with short-circuit evaluation (v4.6), null coalescing (v4.7), LSP expression intelligence (v4.8), and codegen expression display (v4.9).

**v4.0 (6 rounds, 90 tests)** was the foundational release. A full 4-agent HIGH-tier debate designed the `Expr` AST as a 5-kind discriminated union (literal, field_access, binary, unary, group) with mandatory `SourceLocation` on every node. `Condition.left` was migrated from a raw field reference to a full `Expr`, requiring changes across 4 source files and 142 test occurrences in 15 files. Two new `FlowNode` kinds — `let` and `graph_call` — extended the flow system. Graph parameters with typed defaults (Int, String, Bool, Node) and LL(1)-disambiguated graph calls enabled sub-graph composition.

**v4.1-v4.3 (11 rounds, 97 tests)** hardened the foundation and expanded the operator set. v4.1 fixed the multi-segment `conditionFieldName` bug (dotted paths produced flat keys that always missed), added output isolation for graph calls (child outputs no longer overwrote parent same-named outputs), and extracted the scope checker's graph-related logic to `graph-checker.ts` (697 to 503 lines). v4.2 introduced the `call` Expr kind with a `BUILTIN_FUNCTIONS` registry (len/max/min/str) that served as the single source of truth for parser recognition, scope validation, arity checking, type inference, and LSP documentation. v4.3 added multiplication, modulo, and three more builtins (abs, round, keys), plus the critical division precedence fix — `2 + 6/3` now evaluates to 4 instead of 2.67.

**v4.4-v4.7 (13 rounds, 163 tests)** added the remaining expression features. String interpolation (v4.4) required a novel parsing strategy: detecting `${` inside strings, counting brace depth, and instantiating inner Lexer+Parser pairs for each interpolation. Comparison operators and conditional expressions (v4.5) added `if <expr> then <expr> else <expr>` syntax with truthy/falsy evaluation. Logical operators (v4.6) introduced `&&`/`||` with short-circuit semantics and a `TYPE_CONDITIONAL_MISMATCH` warning for mismatched branch types. Null coalescing (v4.7) added `??` with null/undefined-only checking (0, false, and "" are not nullish).

**v4.8-v4.9 (4 rounds, 37 tests)** completed the expression system with tooling support. v4.8 added LSP expression intelligence: variable hover shows the expression and graph context via `formatExpr()`, go-to-definition jumps to `let` declarations, and completions include `if`/`true`/`false` keywords plus variable names. v4.9 brought expression display to codegen output, so orchestration files show human-readable let binding expressions and graph call arguments. The `formatExpr` function handles all 9 Expr kinds (literal, field_access, binary, unary, group, call, template, conditional, plus the binary op's null coalescing variant).

### Architecture / Key Decisions

**The Expr discriminated union.** The `Expr` type started as a 5-kind union in v4.0 and grew to 8 kinds by v4.5 (adding call, template, conditional). Every kind carries `location: SourceLocation`, locked in v4.0-R01 — this enabled diagnostics, hover info, and go-to-definition across the entire expression tree. The union uses TypeScript's discriminated union pattern with exhaustive `never` default switches (added in v4.1-R2) that produce compile-time errors when a new kind is added but a handler is missed. Six independent 9-arm switches exist across the codebase (evaluateExpr, inferExprType, checkExprTypeErrors, checkExprSources, formatExpr x2), which is the primary maintenance cost.

**The precedence chain.** Expression parsing uses a textbook recursive descent precedence chain that grew from 3 levels (v4.0: additive, unary, primary) to 8 levels (v4.9: nullCoalesce, logicalOr, logicalAnd, comparison, additive, multiplicative, unary, primary). Each level is a 5-15 line method that calls the next level down. The chain was consistently extensible — v4.5 through v4.7 each inserted a new level without touching existing levels.

**Short-circuit evaluation.** `&&`, `||`, and `??` all use early-return before the generic binary evaluation path in `evaluateExpr` (lines 28-39 of expr-eval.ts). The pattern is clean: check the operator, evaluate only the left side, and return early if the short-circuit condition is met. This was introduced in v4.6 and extended in v4.7.

**The BUILTIN_FUNCTIONS registry.** Introduced in v4.2 as a simple `Record<string, { arity: number }>`, then enriched in v4.4 with `returnType`, `signature`, and `description` fields. This single registry in `ast.ts` serves as the source of truth for 6 consumers: parser recognition, scope validation, arity checking, type inference, LSP hover docs, and LSP completions. Adding a new builtin is a one-line registry entry plus one switch case in the evaluator.

**ProgramIndex.letBindingMap.** Added in v4.8, this indexes all `let` bindings across all graphs (including inside foreach bodies) into a `Map<string, LetBinding>`. It enabled variable hover, go-to-definition, and completions without walking the AST at query time. One known limitation: flat namespace — if two graphs both define `let x = ...`, the last one wins.

**formatExpr.** A human-readable expression renderer that handles all 9 Expr kinds. Introduced in v4.8 for LSP hover, then reused by v4.9 codegen. Unfortunately duplicated — identical implementations exist in `hover.ts` and `orchestration.ts` (TD-01 from the technical retro).

### The Bugs That Mattered

**Division precedence (v4.0-R1 design, v4.3 fix).** The v4.0 spec placed division at additive precedence (flat with `+`/`-`), and the forced dissenter argued for a multiplicative level. The dissent was rejected because the spec grammar was authoritative. By v4.3, real-world math semantics forced the issue: `2 + 6/3` evaluated to 2.67 instead of 4. Ratchet v4.0-R02 was unlocked and division was moved to a new `parseMultiplicative` level. This was the only ratchet unlock in the expression system, and the dissenter was arguably right from the start.

**Stale Lexer constructor (v4.5-R3).** Template string parsing creates inner `Lexer` instances for each `${...}` interpolation. After the Lexer constructor signature changed (dropping the second argument), the template parsing code still passed 2 arguments. This was caught by the TEST-ONLY integration round — a TypeScript compile error that feature-level tests missed because they did not exercise the template+new-keyword combination.

**conditionFieldName multi-segment bug (v4.0-R2 deferred, v4.1 fixed).** The `conditionFieldName` bridge function returned a dotted string like `"result.score"` for flat Map lookup, which always missed. This was identified in v4.0-R2 but deferred as out-of-scope. v4.1-R1 replaced it with `resolveNestedField` — a proper nested object traversal function.

**Graph call output isolation (v4.1-R2).** Child graph calls received the parent's outputs map by reference. A child node named `Analyzer` would overwrite the parent's `Analyzer` output. Fixed with a shallow clone: `outputs: new Map(ctx.outputs)`.

**Errors vs warnings confusion (v4.6-R2).** The `TYPE_CONDITIONAL_MISMATCH` diagnostic was initially routed to `result.errors` instead of `result.warnings`. Since mismatched conditional branch types are a warning (code still compiles), this caused false compilation failures. Caught and fixed during review.

**Line number miscalculation.** Several early v4.x tests had incorrect `SourceLocation` expectations because the test helpers calculated line numbers from 0-indexed template literals while the lexer uses 1-indexed lines. Fixed incrementally across v4.0-R2 through v4.2.

### Forced Dissenter Highlights

The forced dissenter mechanism was only exercised once in v4.x — during v4.0-R1, the only HIGH-tier 4-agent debate round. A1-Architect had the highest self-assessed confidence (8/10) and was assigned as forced dissenter.

A1 submitted 4 self-rebuttals:
- **Node keyword handling** (accepted): Prevented KEYWORDS map pollution by checking identifier value against type names. Still relevant at v4.9.
- **Foreach graph_call consistency** (accepted): Fixed an inconsistency in foreach body — allowing let+graph_call but rejecting parallel+foreach (ratchet v4.0-R09) held through all 10 versions.
- **Flat division precedence** (rejected, later vindicated): Argued for a multiplicative precedence level. Rejected because the spec grammar was authoritative. Vindicated in v4.3 when real-world math forced the ratchet unlock.
- **conditionFieldName bridge** (rejected, appropriate): The bridge was appropriate for incremental migration and was removed in v4.1.

The 50% acceptance rate (2/4) and the delayed vindication of the division precedence dissent demonstrate the mechanism's value even when dissents are initially rejected. For v4.1 through v4.9, all rounds used MEDIUM or DIRECT tiers with no formal forced dissent — but the v4.3 ratchet unlock shows that the dissent's impact outlasted the round that produced it.

### Process Evolution

The v4.x series demonstrated a clear maturation of the tier system:

**v4.0 (6 rounds)**: Full spectrum — 1 HIGH, 1 MEDIUM, 2 DIRECT, 1 TEST-ONLY, 1 integration. The HIGH round (R1) was justified: it established the Expr AST, 5 new tokens, 2 new FlowNode kinds, and a breaking migration. Agent calls: ~26.

**v4.1-v4.4 (15 rounds)**: Settled into MEDIUM/DIRECT/TEST-ONLY. MEDIUM rounds were reserved for genuine design decisions: `conditionFieldName` fix (v4.1-R1), expression functions (v4.2-R1), multiplicative precedence (v4.3-R1), string interpolation parsing (v4.4-R2). Agent calls: ~6-10 per version.

**v4.5-v4.9 (13 rounds)**: Almost entirely DIRECT and TEST-ONLY. Once the expression system foundation was solid, new operators followed a mechanical 5-file pattern: lexer token, parser precedence level, evaluator case, type checker case, scope checker case. Agent calls: ~2-4 per version.

The ratchet system drove this efficiency: once a pattern was locked, it could be replicated without debate. The v4.5 comparison operators, v4.6 logical operators, and v4.7 null coalescing each followed the exact same template established by v4.3's multiplicative precedence.

**Zero NEEDS_CHANGES across 34 rounds.** This is the most striking process metric of v4.x. Every single round passed review on the first try. For comparison, v3.6-R3, v3.7-R3, and v3.9-R1 all had NEEDS_CHANGES in the preceding v3.x series. The combination of well-established patterns, exhaustive `never` switches (catching missed cases at compile time), and the ratchet system created a reliability floor that held for 34 consecutive rounds.

### Stats

| Metric | Value |
|--------|-------|
| Versions | v4.0 -- v4.9 (10 releases) |
| Rounds | 34 |
| Tests added | 387 (890 to 1,277) |
| Ratchets added | ~119 (2 unlocked: v4.0-R02 division precedence, v4.0-R04 conditionFieldName) |
| NEEDS_CHANGES | 0 across all 34 rounds |
| Estimated agent calls | ~94 |
| HIGH rounds | 1 (v4.0-R1) |
| MEDIUM rounds | 7 |
| DIRECT rounds | 17 |
| TEST-ONLY rounds | 9 |
| Forced dissent exercises | 1 (A1-Architect, 2/4 accepted) |
| Bugs caught pre-release | ~8 |
| New Expr kinds | 4 (call, template, conditional + binary ops grew from 3 to 14 operators) |
| New builtins | 7 (len, max, min, str, abs, round, keys) |
| Precedence levels | 3 to 8 |

---

## Section 2: Blog Post

> Save as `graft-v4-0-expression-system.mdx` in the blog content directory.

```mdx
---
title: "Graft v4.0-v4.9: Building a Complete Expression System"
date: "2026-04-03"
description: "10 versions, 387 tests, 34 debate rounds, zero failures — how adversarial debate built a compiler expression system from scratch."
tags: ["graft", "compiler", "expressions", "adversarial-debate"]
---

Graft is a graph-native DSL that compiles `.gft` files into Claude Code harness structures for LLM-to-LLM orchestration. It is built with a hand-written TypeScript recursive descent parser, and every feature is designed through an adversarial multi-agent debate process where agents propose, critique, and converge before any code is written.

The v4.x series — 10 minor versions released in rapid succession — delivered a complete expression system. What started as a language with no variables or operators ended with let bindings, 14 binary operators, 7 built-in functions, string interpolation, conditional expressions, null coalescing, full LSP intelligence, and codegen display. 387 new tests. 34 debate rounds. Zero review failures.

## What v4.x Delivered

### Variables and Graph Composition (v4.0)

```gft
graph Analyze(threshold: Int = 75, label: String = "default") {
  context Instructions { ... }
  node Scorer { ... }

  flow {
    let score = Scorer.result
    let adjusted = score + 10
    SubGraph(count: adjusted) -> done
  }
}
```

v4.0 introduced `let` bindings for intermediate values, typed graph parameters with defaults, and graph calls for sub-graph composition. The `Expr` AST — a discriminated union with mandatory `SourceLocation` on every node — became the backbone of every subsequent version.

### Built-in Functions (v4.2-v4.3)

```gft
let count = len(items)
let best = max(Scorer.score, threshold)
let info = str(Analyzer.result)
let rounded = round(abs(delta))
let fields = keys(Config.output)
```

Seven built-in functions backed by a `BUILTIN_FUNCTIONS` registry that serves as a single source of truth for parser disambiguation, scope validation, arity checking, type inference, and LSP documentation. Adding a new builtin is one registry line plus one evaluator case.

### String Interpolation (v4.4)

```gft
let msg = "Score: ${Scorer.result + 10} for ${label}"
let escaped = "Use \${this} for literal braces"
```

Template expressions with `${...}` interpolation, brace-depth-counted parsing, and inner Lexer+Parser instantiation for each interpolation segment. Templates always infer to `string`.

### Comparisons, Conditionals, Logic (v4.5-v4.7)

```gft
let passed = score >= threshold
let grade = if score > 90 then "A" else if score > 80 then "B" else "C"
let valid = passed && len(items) > 0
let name = user.name ?? "anonymous"
```

Six comparison operators, `if-then-else` conditional expressions with nested else-if chains, `&&`/`||` with short-circuit evaluation, and `??` null coalescing that only triggers on null/undefined (not falsy values like 0 or "").

### LSP Intelligence (v4.8) and Codegen Display (v4.9)

Variable hover shows the expression value and graph context. Go-to-definition jumps to `let` declarations. Completions suggest `if`, `true`, `false`, and in-scope variables. Codegen orchestration files display formatted expressions for let bindings and graph call arguments.

## The Debate Story

### One High-Stakes Debate Set the Foundation

Only one round in the entire v4.x series used a full 4-agent debate: v4.0-R1. It established the Expr AST, 5 new token types, 2 new FlowNode kinds, and a breaking migration of `Condition.left` to the Expr type. A1-Architect, the most confident agent (8/10), was assigned as forced dissenter and submitted 4 self-rebuttals. Two were accepted (Node keyword handling, foreach consistency) and held through all 10 versions. One was rejected but later vindicated.

### The Division Precedence Vindication

The forced dissenter argued in v4.0-R1 that division should have its own multiplicative precedence level. The spec placed division flat with addition (`+`, `-`, `/` all at the same level), so the dissent was rejected — the spec is authoritative.

Three versions later, v4.3 confronted reality: `2 + 6/3` evaluated to 2.67 instead of 4. The ratchet was unlocked, division was moved to a new `parseMultiplicative` level, and standard math semantics were restored. The dissenter was right from the start — but the process correctly deferred the fix until evidence demanded it.

### Mechanical Replication After Lock

The most striking process result was what happened after the foundation was locked. Starting from v4.5, every new operator followed an identical 5-file pattern:

1. Add token(s) to the lexer
2. Add a precedence level to the parser
3. Add a case to the evaluator
4. Add a case to the type checker
5. Add a case to the scope checker

Comparison operators (v4.5), logical operators (v4.6), and null coalescing (v4.7) each completed in 3 rounds with predominantly DIRECT tiers (single-agent, no debate). The ratchet system transformed novel design work into mechanical replication.

### Zero Failures Across 34 Rounds

Every round in v4.x passed code review on the first attempt. No NEEDS_CHANGES verdicts. For context, the preceding v3.x series had three NEEDS_CHANGES instances. The combination of exhaustive `never` switches (catching missed Expr kinds at compile time), the ratchet system (preventing regression of confirmed decisions), and the tier system (matching debate intensity to actual design risk) created a reliability floor that held for the entire series.

## Bugs That Mattered

The v4.x series caught approximately 8 bugs pre-release:

- **Division precedence** (v4.0 design, v4.3 fix): `2 + 6/3 = 2.67` instead of `4`. Forced dissenter was right early, ratchet unlocked.
- **conditionFieldName multi-segment** (v4.0-R2 found, v4.1 fixed): Dotted paths like `result.score` produced flat string keys that always missed during lookup.
- **Graph call output isolation** (v4.1-R2): Child graph outputs overwrote parent same-named outputs via shared Map reference.
- **Stale Lexer constructor** (v4.5-R3): Template parsing passed 2 arguments to a Lexer that now takes 1. Caught by TEST-ONLY integration round.
- **str() on objects** (v4.3): `str({a:1})` returned `[object Object]` instead of `{"a":1}`. Fixed with `JSON.stringify`.
- **Equality semantics split** (v4.2-R2): `evalCondition` in transforms.ts used strict equality while `evaluateCondition` in flow-runner.ts used loose equality. One-line fix, high impact.

## Process Efficiency

| Version | Rounds | Tier Mix | Tests Added | Agent Calls |
|---------|--------|----------|-------------|-------------|
| v4.0 | 6 | 1 HIGH, 1 MEDIUM, 2 DIRECT, 2 TEST | 90 | ~26 |
| v4.1 | 4 | 1 MEDIUM, 2 DIRECT, 1 TEST | 21 | ~10 |
| v4.2 | 4 | 1 MEDIUM, 2 DIRECT, 1 TEST | 47 | ~10 |
| v4.3 | 3 | 1 MEDIUM, 1 DIRECT, 1 TEST | 29 | ~6 |
| v4.4 | 4 | 1 MEDIUM, 2 DIRECT, 1 TEST | 46 | ~6 |
| v4.5 | 3 | 2 DIRECT, 1 TEST | 43 | ~4 |
| v4.6 | 3 | 2 DIRECT, 1 TEST | 36 | ~4 |
| v4.7 | 3 | 1 DIRECT, 2 TEST | 38 | ~4 |
| v4.8 | 3 | 2 DIRECT, 1 TEST | 30 | ~4 |
| v4.9 | 1 | 1 DIRECT | 7 | ~2 |

Agent calls per version dropped from ~26 to ~2 while test output per round stayed stable at 10-15. The front-loading principle held: invest in debate for the foundational design, then ride ratchets for incremental additions.

## Stats

| Metric | Value |
|--------|-------|
| Versions | v4.0 -- v4.9 (10 releases) |
| Total rounds | 34 |
| Tests added | 387 (890 to 1,277) |
| Ratchets added | ~119 (2 unlocked) |
| NEEDS_CHANGES | 0 |
| Estimated agent calls | ~94 |
| Expr kinds | 8 (literal, field_access, binary, unary, group, call, template, conditional) |
| Binary operators | 14 (+, -, *, /, %, <, >, <=, >=, ==, !=, &&, \|\|, ??) |
| Built-in functions | 7 (len, max, min, str, abs, round, keys) |
| Precedence levels | 8 |

## Try It

```bash
npm install -g @graft-lang/graft
graft compile my-pipeline.gft
graft check my-pipeline.gft    # static analysis with expression type checking
graft run my-pipeline.gft      # execute with expression evaluation
```

```gft
graph Pipeline(threshold: Int = 75) {
  context Task { field goal: String }
  node Scorer { model: sonnet, reads: [Task], produces: { score: Int } }

  flow {
    let result = Scorer.score
    let grade = if result >= threshold then "pass" else "fail"
    let summary = "Score: ${result}, Grade: ${grade}"
    Scorer -> done
  }
}
```

Graft is designed for LLM-to-LLM communication — every construct maps directly to an orchestration harness that Claude Code can execute. The expression system gives graphs the ability to compute, compare, and branch without leaving the `.gft` file.
```
