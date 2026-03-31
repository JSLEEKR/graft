# Code Review -- T4: Recursive Descent Parser

## Verdict: PASS

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Clean (no errors) |
| `npx vitest run` | 64/64 tests pass (33 parser, 26 lexer, 5 setup) |
| No regressions | Confirmed -- all prior T1/T2/T3 tests still pass |

## Checklist

### 1. `expectIdentifierOrKeyword()` exists and is used correctly
PASS. Method exists at line 566. Uses `KEYWORD_TYPES` Set (built from `Object.values(KEYWORDS)` at module scope) for O(1) lookup. Used in all positions specified by convergence:
- `parseFields()` -- field names
- `parseIdentifierList()` -- tool names
- `parseType()` enum values
- `parseTransform()` select/drop/filter -- field arguments
- `parseCondition()` -- condition field name
- `parseConditionValue()` -- bare identifier values
- `parseContextRefList()` -- dot-field names

Strict `expectIdentifier()` correctly used for: declaration names, produces name, context ref context-part, graph flow nodes, edge source/target, conditional target node names, model name, fallback node name.

### 2. `parseProduces()` consumes its own keyword
PASS. `parseProduces()` at line 130 starts with `this.expect(TokenType.Produces)`. The `parseNode()` body at line 114 has the comment "Do NOT advance here" and calls `parseProduces()` without advancing. Location is captured before consuming the keyword, which is correct.

### 3. Constructor has no source param
PASS. Constructor at line 18: `constructor(private readonly tokens: Token[])`. No source parameter.

### 4. Graph flow requires done
PASS. `parseGraph()` at line 386 checks `if (!sawDone)` and throws `"Expected '-> done' to terminate graph flow"`. Test at line 292 verifies this error.

### 5. `.js` import extensions
PASS. All relative imports use `.js` extensions:
- `parser.ts`: `../lexer/tokens.js`, `../errors/diagnostics.js`, `./ast.js`
- `parser.test.ts`: `../src/lexer/lexer.js`, `../src/parser/parser.js`

Compliant with T1-R09.

### 6. All test cases from convergence report present
PASS. The convergence report lists 30 test cases (though the itemized list actually enumerates 33). The actual test file has 33 tests. All specific test cases from the convergence spec are present:
- Context: basic (line 16), k-suffix (line 30), multiple fields + collection types (line 39)
- Node: basic (line 55), k-suffix budget (line 77), partial reads (line 91), tools + on_failure (line 106), inline struct (line 122), retry_then_fallback (line 145), skip (line 162), abort (line 175), standalone fallback (line 189), missing produces error (line 201)
- Edge: simple (line 211), pipe transforms (line 220), filter (line 236), truncate (line 246), conditional routing (line 256)
- Graph: basic (line 277), missing done error (line 292)
- Full program: hello.gft (line 301)
- Type expressions: Optional (line 341), Map (line 352), TokenBounded (line 365), Float range (line 378), nested generics (line 392)
- Keyword-as-identifier: field names (line 406), enum values (line 419), tool names (line 429), select/drop args (line 443), condition field (line 455)
- Error handling: missing brace (line 468), unexpected token (line 472)

### 7. Ratchet compliance
PASS. All prior ratchets honored:
- T1-R09: `.js` extensions on all imports
- T1-R04: Vitest explicit imports (no globals)
- T1-R08: Direct imports, no barrel exports
- T2-R02: Throw-on-first-error via GraftError
- T2-R09: KEYWORDS used correctly
- T3-R01/R02: AST imports from correct location

## Deviation Assessment

**Reported deviation**: Test for skip failure strategy uses node name `Optionality` instead of convergence spec's `Optional`.

**Ruling: ACCEPTED.** `Optional` is a keyword token (TokenType.Optional in tokens.ts). Using it as a node name would pass through `expectIdentifier()` which only accepts `TokenType.Identifier`, causing the test to fail on the node name rather than testing the skip strategy. The rename to `Optionality` is the correct fix. This is a bug in the convergence spec's test code, not a deviation by the implementer.

## Code Quality Notes

- Parser implementation is a character-for-character match with the convergence spec (excluding the test deviation above).
- Clean separation between strict (`expectIdentifier`) and permissive (`expectIdentifierOrKeyword`) identifier parsing.
- `KEYWORD_TYPES` Set at module scope avoids per-call allocation.
- `parseConditionValue()` correctly handles all value types including bare identifiers/keywords as string values.
- `parseTypeOrInlineStruct()` uses LL(2) lookahead (`peekType(1)`) only where needed.
- parseInt k-suffix comments present in both `parseTokenValue()` and `parseConditionValue()`.

## New Ratchets Confirmed

- [T4-R01] Parser constructor takes `Token[]` only (no `source` parameter) -- LOCKED
- [T4-R02] `expectIdentifierOrKeyword()` for field names, tool names, enum values, transform args, condition fields; strict `expectIdentifier()` for declaration names -- LOCKED
- [T4-R03] `parseProduces()` consumes its own `produces` keyword (location captured correctly) -- LOCKED
- [T4-R04] Graph flow requires `done` terminator; parser throws if absent -- LOCKED
- [T4-R05] `KEYWORD_TYPES` Set built from `Object.values(KEYWORDS)` at module scope -- LOCKED
- [T4-R06] Throw-on-first-error via `GraftError` (consistent with T2-R02) -- LOCKED
- [T4-R07] LL(1) with LL(2) only for inline structs (`Identifier + LBrace` in `parseTypeOrInlineStruct`) -- LOCKED

## Files Reviewed

- `src/parser/parser.ts` -- 611 lines, recursive descent parser
- `tests/parser.test.ts` -- 476 lines, 33 test cases
- `harness/tasks/T4/step3/convergence.md` -- implementation spec
- `harness/common_memory.md` -- ratchet reference

## Summary

Implementation is a faithful execution of the convergence spec. All 8 verification checks pass. The single deviation (Optional -> Optionality) is a justified bugfix to the spec's test code. 64/64 tests pass with no regressions. Ready to proceed to T5.
