# T7 Review: Compiler Pipeline & CLI

## Verdict: PASS

## Verification Results

| Check | Result | Detail |
|-------|--------|--------|
| `npx tsc --noEmit` | PASS | 0 errors |
| `npx vitest run` | PASS | 110 tests (101 prior + 9 new) |
| `estimator.js` import | PASS | `compiler.ts:5` imports `./analyzer/estimator.js` (not `tokens.js`) |
| `Parser(tokens)` | PASS | `compiler.ts:38` — single-arg constructor per T4-R01 |
| Graph guard | PASS | `compiler.ts:48` — `program.graphs.length === 0` returns failure |
| `toLocaleString('en-US')` | PASS | All 8 calls in `index.ts` specify `'en-US'` per T6-R02 |
| try-catch writeFiles | PASS | `index.ts:23-26` wraps `compileAndWrite()` in try-catch, prints clean error, exits 1 |
| `.js` extensions | PASS | All 9 imports across `compiler.ts` and `index.ts` use `.js` per T1-R09 |

## Ratchet Lock Verification

| Lock | Status |
|------|--------|
| T7-R01: `compiler.ts` is pure orchestration | PASS — no business logic, only pipeline wiring |
| T7-R02: `CompileResult` discriminated type | PASS — `success` boolean with optional fields |
| T7-R03: `process.exit` only in CLI handlers | PASS — `process.exit` appears only in `index.ts` action callbacks and `readSource` |
| T7-R04: Integration tests use inline source strings | PASS — `HELLO_GFT` and error cases are all inline literals |
| T7-R05: Compiler rejects zero graph declarations | PASS — guard at line 48, test at integration.test.ts:118 |

## Architecture Compliance

- **Pipeline order** matches spec: Lex -> Parse -> Graph guard -> Scope -> Type -> Estimate -> Codegen
- **Dual error handling**: throw-on-first for lex/parse (try-catch blocks), accumulate for analyzers (push to errors array)
- **Non-GraftError re-throw**: both catch blocks re-throw unknown exceptions
- **`compileAndWrite` is thin wrapper**: compile + conditional writeFiles, 7 lines total
- **`check` command** runs full pipeline via `compile()` without calling `writeFiles()`
- **Hardcoded version** `'0.1.0'` avoids `resolveJsonModule`

## Prior Ratchet Locks Preserved

Spot-checked T1-R09 (.js extensions), T2-R02 (throw-on-first for lex/parse), T4-R01 (Parser single-arg), T5-R01 (error accumulation), T5-R02 (estimator.ts not tokens.ts), T6-R01 (import from estimator.js), T6-R02 (toLocaleString en-US). All hold.

## Test Count Progression

T1: 5 -> T2: 31 -> T3: 31 -> T4: 64 -> T5: 78 -> T6: 101 -> T7: 110

## Notes

No issues found. All convergence fixes from step3 are correctly applied in the source files. The code matches the convergence document exactly.
