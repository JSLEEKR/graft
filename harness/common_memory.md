# Common Memory — Graft Compiler
## Last updated: v5.0 COMPLETE

## Ratchet-Locked Decisions (~300 total, 8 unlocked)

### T1-v2.2 Ratchets (archived)
> See `harness/archived_ratchets.md` for ~100 ratchets from T1 through v2.2. All LOCKED except 2 MODEL_MAP unlocks (extracted to constants.ts).

### v3.0-v3.9 Ratchets (archived)
> See `harness/archived_ratchets.md` for ~91 ratchets from v3.0 through v3.9. All LOCKED except: v3.3-R06 evaluateCondition UNLOCKED (removed in v5.0-R2).

### v4.0-v4.4 IMPL Ratchets (archived)
> See `harness/archived_ratchets.md` for ~80 IMPL ratchets from v4.0 through v4.4. All LOCKED. DESIGN ratchets retained below.

### v4.0-v4.4 DESIGN Ratchets (retained)
- [v4.0-R01] Expr: discriminated union (now 9 kinds: literal, field_access, binary, unary, group, call, template, conditional, placeholder) — LOCKED
- [v4.0-R03] Condition.left: Expr replaces Condition.field — SUPERSEDED by v5.0 (Condition interface removed entirely)
- [v4.0-R09] Foreach body allows node/let/graph_call, rejects parallel/foreach — LOCKED
- [v4.0-R11] FlowNode: 5 kinds (node, parallel, foreach, let, graph_call) — LOCKED
- [v4.0-R20] InferredType = 'number' | 'string' | 'boolean' | 'unknown' — LOCKED
- [v4.0-R21] Variable-first resolution: single-segment field_access checks varTypes before producesFieldsMap — LOCKED
- [v4.4-R08] Inner expressions parsed via new Lexer + Parser on substring — LOCKED

### v4.5-R1 Ratchets (Comparison Operators)
- [v4.5-R01] Six comparison tokens: Greater, Less, GreaterEqual, LessEqual, EqualEqual, BangEqual — LOCKED
- [v4.5-R02] parseComparison precedence level between parseExpr and parseAdditive — LOCKED
- [v4.5-R03] Binary op union extended: '<' | '>' | '<=' | '>=' | '==' | '!=' — LOCKED
- [v4.5-R04] evaluateExpr comparison: ordered ops use Number(), equality uses == (loose) — UNLOCKED (strict equality in v5.0-R3)
- [v4.5-R05] inferExprType: comparison ops return 'boolean' — LOCKED
- [v4.5-R06] checkExprTypeErrors: ordered comparison requires numeric, equality allows any — LOCKED

### v4.5-R2 Ratchets (Conditional Expressions)
- [v4.5-R07] If and Then keywords in tokens.ts KEYWORDS map — LOCKED
- [v4.5-R08] conditional Expr kind: { condition, consequent, alternate, location } — LOCKED
- [v4.5-R09] parsePrimary: if <expr> then <expr> else <expr> — LOCKED
- [v4.5-R10] evaluateExpr conditional: truthy -> consequent, falsy -> alternate — LOCKED
- [v4.5-R11] inferExprType conditional: matching branch types propagate, mismatch -> 'unknown' — LOCKED
- [v4.5-R12] checkExprSources + checkExprTypeErrors recurse into all 3 conditional sub-exprs — LOCKED
- [v4.5-R13] TextMate grammar: 'if' and 'then' added to keyword pattern — LOCKED

### v4.6-R1 Ratchets (Logical Operators)
- [v4.6-R01] AmpAmp and PipePipe tokens in lexer, two-char matching — LOCKED
- [v4.6-R02] Binary op union extended: '&&' | '||' — LOCKED
- [v4.6-R03] parseLogicalOr and parseLogicalAnd precedence levels — LOCKED
- [v4.6-R04] Short-circuit evaluation: && returns left if falsy, || returns left if truthy — LOCKED
- [v4.6-R05] inferExprType: && and || return 'boolean' — LOCKED
- [v4.6-R06] checkExprTypeErrors: logical operators warn on non-boolean operands — LOCKED

### v4.6-R2 Ratchets (Conditional Type Mismatch Warning)
- [v4.6-R07] TYPE_CONDITIONAL_MISMATCH error code — LOCKED
- [v4.6-R08] checkExprTypeErrors: conditional branches with different types emit warning — LOCKED
- [v4.6-R09] Warning severity (not error): mismatched conditional branches still compile — LOCKED

### v4.7-R1 Ratchets (Null Coalescing)
- [v4.7-R01] QuestionQuestion token in lexer, two-char matching — LOCKED
- [v4.7-R02] Binary op union extended: '??' — LOCKED
- [v4.7-R03] parseNullCoalesce precedence level above parseLogicalOr — LOCKED
- [v4.7-R04] Runtime: ?? checks null/undefined only (not falsy) — LOCKED
- [v4.7-R05] Short-circuit: right side only evaluated if left is null/undefined — LOCKED
- [v4.7-R06] inferExprType: ?? returns left type if known, otherwise right type — LOCKED

### v4.8-R1 Ratchets (LSP Expression Intelligence)
- [v4.8-R01] ProgramIndex.letBindingMap: Map<string, LetBinding> — LOCKED
- [v4.8-R02] LetBinding interface: { name, value, graphName, location } — LOCKED
- [v4.8-R03] collectLetBindings traverses flow including foreach bodies — LOCKED
- [v4.8-R04] Hover: formatExpr for human-readable expression display — LOCKED
- [v4.8-R05] Definition: letBinding go-to-def via letBindingMap — LOCKED
- [v4.8-R06] Completions: if/true/false keywords + variable names in graph flow — LOCKED

### v4.9-R1 Ratchets (Codegen Expression Display)
- [v4.9-R01] Codegen let step shows formatted expression via formatExpr — LOCKED
- [v4.9-R02] formatExpr handles all 9 Expr kinds — LOCKED
- [v4.9-R03] Graph call codegen shows formatted argument expressions — LOCKED

### v5.0 Ratchets (Quality + Unification)
- [v5.0-R01] Condition interface removed; ConditionalBranch.condition and Transform filter use binary Expr — LOCKED
- [v5.0-R02] conditionFieldName() removed; field extraction inlined in type checker — LOCKED
- [v5.0-R03] formatExpr in src/format.ts (single location, re-exported from hover.ts) — LOCKED
- [v5.0-R04] evaluateCondition removed from flow-runner.ts; replaced by evaluateExpr with Record->Map conversion — LOCKED
- [v5.0-R05] evalCondition removed from transforms.ts; filter uses evaluateExpr — LOCKED
- [v5.0-R06] Strict equality (===, !==) in evaluateExpr — LOCKED (unlocks v4.5-R04)
- [v5.0-R07] Exhaustive never defaults on all Expr switch dispatchers (expr-eval, format, types, graph-checker) — LOCKED

## Review Feedback
- T1-T7: ALL PASS. Test progression: 5 -> 31 -> 31 -> 64 -> 78 -> 101 -> 110
- v1.2: PASS. 171 tests. All 12 ratchet items compliant.
- v2.0-R1 through R5: ALL PASS. 194 -> 214 -> 224 -> 241 -> 249 tests.
- v2.1-R1 through R4: ALL PASS. 249 -> 263 -> 282 -> 288 tests.
- v2.2-R1 through R6: ALL PASS. 296 -> 323 -> 337 -> 359 -> 363 -> 376 tests.
- v3.0-R1 through R8: ALL PASS. 384 -> 404 -> 419 -> 430 -> 443 -> 456 -> 465 -> 477 tests.
- v3.1-R1 through R5: ALL PASS. 503 -> 513 -> 519 -> 527 -> 537 tests.
- v3.2-R1 through R4: ALL PASS. 555 -> 570 -> 570 -> 582 tests.
- v3.3-R1 through R4: ALL PASS. 598 -> 611 -> 623 -> 636 tests.
- v3.4-R1 through R4: ALL PASS. 653 -> 668 -> 678 -> 690 tests.
- v3.5-R1 through R4: ALL PASS. 706 -> 716 -> 724 -> 739 tests.
- v3.6-R1 through R4: ALL PASS (R3 had NEEDS_CHANGES then PASS). 753 -> 761 -> 770 -> 790 tests.
- v3.7-R1 through R4: ALL PASS (R3 had NEEDS_CHANGES then PASS). 806 -> 818 -> 828 -> 832 tests.
- v3.8-R1 through R4: ALL PASS. 843 -> 853 -> 856 -> 864 tests.
- v3.9-R1 through R3: ALL PASS (R1 had NEEDS_CHANGES then PASS). 876 -> 886 -> 890 tests.
- v4.0-R1: PASS. 921 tests. HIGH tier, full 4-agent debate. Forced dissent (A1): 4 self-rebuttals.
- v4.0-R2: PASS. 939 tests. MEDIUM tier. A3 found variable vs field ambiguity + foreach clone.
- v4.0-R3 through R6: ALL PASS. 957 -> 967 -> 972 -> 980 tests.
- v4.1-R1 through R4: ALL PASS. 991 -> 996 -> 996 -> 1,001 tests.
- v4.2-R1 through R4: ALL PASS. 1,022 -> 1,029 -> 1,034 -> 1,048 tests.
- v4.3-R1 through R3: ALL PASS. 1,063 -> 1,069 -> 1,077 tests.
- v4.4-R1 through R4: ALL PASS. 1,088 -> 1,103 -> 1,115 -> 1,123 tests.
- v4.5-R1 through R3: ALL PASS. 1,140 -> 1,151 -> 1,166 tests.
- v4.6-R1 through R3: ALL PASS. 1,183 -> 1,190 -> 1,202 tests.
- v4.7-R1 through R3: ALL PASS. 1,214 -> 1,222 -> 1,240 tests.
- v4.8-R1 through R3: ALL PASS. 1,254 -> 1,261 -> 1,270 tests.
- v4.9-R1: PASS. 1,277 tests. FINAL v4.x.
- v5.0-R1: PASS. formatExpr extraction + Condition->Expr unification. 21 new tests.
- v5.0-R2: PASS. evaluateCondition/evalCondition removal. 10 new tests.
- v5.0-R3: PASS. Strict equality + exhaustive switches. 11 new tests.

### Unlocked Ratchets (cumulative)
- [T6] MODEL_MAP duplicated — UNLOCKED v2.1 (extracted to constants.ts)
- [v1.2-R06] MODEL_MAP duplicated in executor.ts — UNLOCKED v2.1 (extracted to constants.ts)
- [v1.2-R07] Abort-on-failure MVP — UNLOCKED v3.0-R5 (fully implemented)
- [v2.2-R05] TypeChecker NOT migrated to ProgramIndex — UNLOCKED v3.0-R4 (now accepts ProgramIndex)
- [v2.2-R08] GraftErrorCode: 18-member union — UNLOCKED v3.0-R6 (now 30+ members)
- [v2.2-R10] Parser/lexer remain throw-based — UNLOCKED v3.0-R6/v3.2-R1 (parser error accumulation)
- [v4.0-R02] Division at additive precedence — UNLOCKED v4.3 (moved to multiplicative)
- [v4.0-R04] conditionFieldName() bridge — UNLOCKED v4.1 (removed; resolveNestedField replaces it)
- [v3.3-R06] evaluateCondition exported — UNLOCKED v5.0-R2 (function removed)
- [v4.5-R04] Loose equality in evaluateExpr — UNLOCKED v5.0-R3 (strict equality)

## Recurring Patterns
- A3-Skeptic: critical bugs every task (T2-T7, v2.0-R1/R2, v2.0-R4, v3.0-R2, v3.6-R1)
- Plan's test helpers consistently have stale signatures (T5, T6, T7)
- YAGNI wins but A3's "silent failure" bugs are always worth fixing
- Forced dissenter mechanism works: self-rebuttals expose blind spots
- MEDIUM tier (2 agents) effective for most rounds; HIGH tier only for new subsystems
- Merged Step 3+4 eliminates context loss (adopted from v3.1-R1 onward)
- TEST-ONLY rounds: 2 agent calls, 0 design decisions, pure regression coverage

## Debate ROI Summary
- HIGH tier (4 agents): v4.0-R1 (31 new tests, critical design), v3.0-R3 (backend interface)
- MEDIUM tier (2 agents): default for feature rounds. ~4-5 agent calls each.
- DIRECT tier: 2 agent calls. Used for straightforward implementation.
- TEST-ONLY tier: 2 agent calls. Integration + regression only.
- Cross-critique skipping (score range < 2): saves 4 calls with no quality loss.

## Notes for Future
- Token budget enforcement is advisory only (v2.1-R15); hard abort deferred
- Memory importability: deferred (v2.0-R13 locked as excluded)
- entryFile guard in resolver: scopes name merging to entry file only
- v5.0 COMPLETE. Condition->Expr unification, formatExpr extraction, strict equality, exhaustive switches.
- All tests currently passing (1,277 + v5.0 additions)
