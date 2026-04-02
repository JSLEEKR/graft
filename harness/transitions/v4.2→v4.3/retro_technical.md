# v4.2 -> v4.3 Technical Retrospective

**Version**: v4.3 (Arithmetic Operators + New Builtins)
**Test count**: 1,077 (29 new in v4.3)
**Rounds**: 3 (R1-R3)
**Ratchets**: 10 new, 1 unlocked (v4.0-R02)

---

## 1. Remaining Tech Debt

| Item | Source | Status |
|------|--------|--------|
| evaluateExpr extraction | v4.2 retro (2b) | **NOW DUE**: flow-runner.ts at 404 lines, past 400-line threshold. |
| BUILTIN_FUNCTIONS consolidation | v4.2 retro (2a) | Approaching: 7 functions, threshold was 8+. |
| Token budget hard abort | v2.1-R15 | Advisory only. Still not addressed. |
| Memory importability | v2.0-R13 | Locked as excluded. |
| Bash hooks on Windows | v1.0 T6 | Deferred indefinitely. |
| Graph call memory isolation | v4.1 retro | Child nodes can write to shared memory. |
| Common memory stale ratchets | v4.0 retro | ~150 lines of T1-v2.2 ratchets. Archival not enacted. |

**Resolved in v4.3**: Division precedence fixed (v4.0-R02 unlocked). str() JSON.stringify for objects (was returning [object Object]).

**New in v4.3**: No new tech debt introduced. The parseMultiplicative level is clean and follows standard precedence conventions.

## 2. Abstraction Boundary Assessment

### 2a. BUILTIN_FUNCTIONS registry: 7 functions, 4 consumers

Registry in ast.ts stores { arity: number }. Now 7 entries (len, max, min, str, abs, round, keys). Four consumers still independently hardcode function-specific behavior:

| Consumer | What it hardcodes | Lines |
|----------|-------------------|-------|
| evaluateExpr (flow-runner.ts:82-103) | Runtime implementation | 21 |
| inferExprType (types.ts:190-199) | Return type per function name | 10 |
| hover.ts:64-73 | FUNC_DOCS record with signatures | 10 |
| conditionFieldName (ast.ts) | Display format name(...) | 1 |

At 7 functions this is still manageable. At the next builtin addition (8th function), consolidate into richer descriptor with returnType + description fields.

### 2b. flow-runner.ts at 404 lines (was 386)

Grew by 18 lines from * and % evaluation + abs/round/keys dispatch. Past the 400-line extraction threshold. The evaluateExpr function (lines 22-106, 84 lines) plus resolveNestedField (108-115) are clean extraction candidates to expr-eval.ts.

### 2c. parser.ts at 1,113 lines (was 1,101)

Grew by 12 lines from parseMultiplicative. Clean precedence chain: parseExpr -> parseAdditive -> parseMultiplicative -> parseUnary -> parsePrimary. No structural concern.

### 2d. types.ts at 311 lines (was 308)

Grew by 3 lines from abs/round/keys in inferExprType. Minimal growth.

## 3. Patterns Confirmed

### 3a. Precedence level pattern (new)

The precedence chain is now:
```
parseExpr -> parseAdditive (+/-) -> parseMultiplicative (*/% /) -> parseUnary (-/!) -> parsePrimary
```

This follows standard mathematical precedence. Each level is ~10-15 lines of identical structure (loop on operator tokens, delegate to next level). If more precedence levels are needed (comparison operators in expressions), the pattern extends cleanly.

### 3b. Ratchet unlock pattern (confirmed)

v4.0-R02 was the first ratchet unlock driven by technical necessity (adding multiplicative level requires moving division). Process: (1) identify conflict, (2) document in common_memory with reason, (3) create new ratchet for replacement decision. Clean.

### 3c. BUILTIN_FUNCTIONS extension pattern (confirmed)

Adding a new builtin follows: (1) add to BUILTIN_FUNCTIONS in ast.ts, (2) add runtime impl in evaluateExpr, (3) add type in inferExprType, (4) add hover doc in hover.ts, (5) tests. 4-5 touch points per function. Mechanical but scattered.

## 4. Edge Cases and Failure Modes

### 4a. Modulo by zero (addressed)
% with divisor 0 returns 0 with warning, matching / behavior (v4.1 division-by-zero pattern). Consistent.

### 4b. keys() on non-object (addressed)
keys() on arrays, primitives, null returns []. Safe behavior, no runtime error.

### 4c. str() null handling (addressed)
str(null) returns "null" via JSON.stringify. Previously would have returned "null" via String() anyway, but the path is now explicit.

### 4d. Multiplicative overflow (not addressed, acceptable)
JavaScript Number.MAX_SAFE_INTEGER overflow on * not guarded. Acceptable -- Graft expressions process small values (token counts, scores). Not a realistic concern.

## 5. Recommendations for v4.4

### Priority 1: evaluateExpr extraction (DIRECT)
- Extract evaluateExpr + resolveNestedField + builtin dispatch to src/runtime/expr-eval.ts
- flow-runner.ts imports from expr-eval.ts
- transforms.ts imports resolveNestedField from expr-eval.ts
- ~90 lines moved, flow-runner.ts drops to ~314 lines

### Priority 2: BUILTIN_FUNCTIONS descriptor enrichment (DIRECT)
- Extend registry with returnType + description fields
- inferExprType reads from registry instead of hardcoded switch
- hover.ts reads description from registry instead of FUNC_DOCS record
- Reduces 4-consumer scatter to 2 consumers (evaluateExpr runtime impl stays separate)

### Priority 3: String interpolation or conditional expressions
- Natural next expression feature: template strings or ternary operator
- Would exercise the expression system at a deeper level
- Requires parser extension

### Priority 4: Common memory archival
- Archive T1-v2.2 ratchets to harness/archived_ratchets.md
- Reduce common_memory.md from ~500 lines to ~350 lines
