# Code Review -- T2: Token Types & Lexer

## Verdict: PASS

## Test Results
- All tests pass: YES
- Test count: 31 passed, 0 failed (26 lexer tests + 5 setup tests from T1)

## Convergence Compliance
| Requirement | Status | Notes |
|-------------|--------|-------|
| `GraftError extends Error` (T2-R01) | MET | Line 7 of diagnostics.ts: `export class GraftError extends Error` |
| Throw-on-first-error for v1 (T2-R02) | MET | Lexer throws GraftError directly, no error collection |
| Separate files: diagnostics.ts, tokens.ts, lexer.ts (T2-R03) | MET | Three files in correct DAG: diagnostics -> tokens -> lexer |
| diagnostics.ts is dependency-free (T2-R04) | MET | No imports in diagnostics.ts |
| Float digit-guard fix (T2-R05) | MET | lexer.ts:174-179 checks `this.isDigit(this.peek(1)!)` before entering float mode |
| SINGLE_CHAR at module scope (T2-R06) | MET | lexer.ts:4-18 defines SINGLE_CHAR as module-level const |
| ASCII-only error format (T2-R07) | MET | format() output uses plain text, no emoji |
| Token.location typed as SourceLocation (T2-R08) | MET | tokens.ts:85 imports SourceLocation, Token interface uses it |
| KEYWORDS as Record with identifier-then-lookup (T2-R09) | MET | tokens.ts:88-129, lexer uses `KEYWORDS[value]` lookup in readIdentifierOrKeyword |
| SINGLE_CHAR includes `.`, `>`, `<` as fallback; matchTwoChar checks `..`, `>=`, `<=` first (T2-R10) | MET | Maximal munch ordering correct in readSymbol() |
| 22 test cases specified | MET | tests/lexer.test.ts contains all 22 specified test cases (26 total `it` blocks including the 4 additional edge case tests) |
| SourceLocation interface (line, column, offset) | MET | diagnostics.ts:1-5 |
| GraftError.name set to 'GraftError' | MET | diagnostics.ts:14 |
| GraftError.severity with default 'error' | MET | diagnostics.ts:12 |
| format() defensive guard with Math.max(0, ...) | MET | diagnostics.ts:22 |
| TokenType enum completeness | MET | All token types from convergence spec present |
| KEYWORDS map completeness | MET | All keyword mappings match convergence spec exactly |
| matchTwoChar helper extraction | MET | lexer.ts:237-244 |
| CRLF handling in skipWhitespace | MET | lexer.ts:87-92 |
| Unterminated string on newline | MET | lexer.ts:140-142 |

## Issues Found
### Critical (must fix)
None.

### Minor (should fix)
None.

## Ratchet Compliance
- All locked decisions respected: YES
- T1-R04 (explicit vitest imports): MET -- tests/lexer.test.ts line 1 imports `describe, it, expect` from 'vitest'
- T1-R08 (no barrel exports): MET -- all imports are direct, no index.ts barrel files used
- T1-R09 (.js import extensions): MET -- all relative imports use .js extensions:
  - tokens.ts:1 `'../errors/diagnostics.js'`
  - lexer.ts:1 `'./tokens.js'`
  - lexer.ts:2 `'../errors/diagnostics.js'`
  - lexer.test.ts:2 `'../src/lexer/lexer.js'`
  - lexer.test.ts:3 `'../src/lexer/tokens.js'`
  - lexer.test.ts:4 `'../src/errors/diagnostics.js'`
- Violations: None

## Detailed File Comparison

All four files (`src/errors/diagnostics.ts`, `src/lexer/tokens.ts`, `src/lexer/lexer.ts`, `tests/lexer.test.ts`) are character-for-character identical to the convergence report's implementation spec. No deviations, no ad-hoc additions, no missing code.

## Fix Instructions (if NEEDS_CHANGES)
N/A -- PASS verdict.
