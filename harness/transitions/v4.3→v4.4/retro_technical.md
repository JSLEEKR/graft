# v4.3 -> v4.4 Technical Retrospective

**Version**: v4.4 (String Interpolation + Expression Extraction)
**Test count**: 1,123 (46 new in v4.4)
**Rounds**: 4 (R1-R4)
**Ratchets**: 15 new, 0 unlocked

## 1. Remaining Tech Debt

| Item | Source | Status |
|------|--------|--------|
| Token budget hard abort | v2.1-R15 | Advisory only. Still not addressed. |
| Memory importability | v2.0-R13 | Locked as excluded. |
| Bash hooks on Windows | v1.0 T6 | Deferred indefinitely. |
| Graph call memory isolation | v4.1 retro | Child nodes can write to shared memory. |

**Resolved in v4.4**: evaluateExpr extraction (v4.2 retro 2b). BUILTIN_FUNCTIONS consolidation (v4.2 retro 2a). Common memory archival (v4.0 retro).

**New in v4.4**: No new tech debt. Template parsing via inner Lexer+Parser is clean. Registry enrichment reduces future maintenance.

## 2. File Sizes After v4.4

| File | Lines | Trend |
|------|-------|-------|
| parser.ts | ~1,155 | +42 (parseTemplateParts) |
| flow-runner.ts | 311 | -93 (extraction) |
| expr-eval.ts | ~100 | New file |
| types.ts | ~318 | +7 (template cases) |
| ast.ts | ~200 | +8 (TemplatePart + template Expr) |

All files healthy. parser.ts is the largest but well-structured.

## 3. Expression System Assessment

8 Expr kinds: literal, field_access, binary, unary, group, call, template. The system is feature-complete for string/number manipulation. Missing capabilities:
- Comparison operators in expressions (< > == != -- currently only in Condition)
- Conditional expressions (ternary / if-then-else)
- Array/object construction
- User-defined functions

## 4. Recommendations for v4.5

### Priority 1: Comparison operators in expressions
- Currently `<`, `>`, `==`, `!=` only work in Condition (edge routing). Adding them to Expr would enable `let valid = A.score > 50` in let bindings.
- Requires: new Expr kind or extending binary op union, boolean result type
- Complexity: MEDIUM (parser precedence, runtime eval, type inference)

### Priority 2: Conditional expressions
- Ternary: `let label = A.score > 50 ? "high" : "low"`
- Or if-then-else: `let label = if A.score > 50 then "high" else "low"`
- Requires comparison operators first
- Complexity: MEDIUM

### Priority 3: Runtime improvements
- Better error messages for template evaluation failures
- Warnings for unused let variables
- Complexity: DIRECT
