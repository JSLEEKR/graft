# A1-Architect Cross-Critique -- T2

## Critique of Other Agents

### On A2-Pragmatist

- **Agree**: `GraftError` must extend `Error`. A2 correctly identified this as a real bug -- without it, `toThrow(/pattern/)` relies on Vitest-specific behavior to match `.message` on non-Error objects, and `instanceof Error` checks fail throughout the codebase. Stack traces are also lost. This is the single most important fix across all proposals.

- **Agree**: Hoisting `SINGLE_CHAR` to module scope. Free performance improvement, no downsides. All four agents converge on this.

- **Disagree**: Merging `tokens.ts` into `lexer.ts`. A2 argues "one fewer file, one import hop." But `tokens.ts` exports `TokenType`, `Token`, and `KEYWORDS` -- these are consumed by both the lexer and the parser (T4), and later by the analyzer (T5). Keeping `tokens.ts` separate means the parser can import token types without importing the entire Lexer class. This matters for dependency direction: `parser.ts` should depend on `tokens.ts` (data types) but NOT on `lexer.ts` (implementation). Merging them forces the parser to import from the lexer module, which inverts the conceptual dependency. The DAG `diagnostics -> tokens -> lexer` and `diagnostics -> tokens -> parser` is cleaner than `diagnostics -> lexer -> parser`. At ~80 lines, `tokens.ts` is a perfectly reasonable standalone module.

- **Disagree**: Removing `severity` from `GraftError`. A2's YAGNI argument is reasonable on its surface, but the cost of the field is one optional parameter with a default value. The analyzer (T5) will need warnings (e.g., "unused context field" or "budget exceeds typical limits") and adding `severity` later means changing every existing `GraftError` construction site. The field is cheap insurance. That said, this is a minor point -- if convergence goes against me here, the impact is negligible.

- **Agree**: Throw-on-first-error for v1. A2 makes the pragmatic case well. I proposed `LexResult` with error collection in Step 1, but I acknowledge this adds complexity that may not pay off until T5+. I am willing to defer error collection to a later task if the group converges on throwing.

### On A3-Skeptic

- **Agree (HIGH)**: The float-without-trailing-digits bug (issue #1/#8). This is the most important correctness bug found by any agent. Input `42.}` produces `FloatLiteral("42.")` which violates the spec's `[0-9]+ '.' [0-9]+` grammar. The fix is straightforward: after ruling out `..`, check that `peek(1)` is a digit before entering float mode; otherwise emit `IntegerLiteral` and leave the `.` for the symbol scanner. All four agents converge on this fix.

- **Agree**: `GraftError` must extend `Error` (issue #11). Same as A2's finding. Full convergence across agents.

- **Agree**: The `format()` guard against invalid column values (issue #5). `' '.repeat(-1)` throws a `RangeError`, which would crash the error formatter. Adding `Math.max(0, column - 1)` is a one-line defensive fix. Worth including.

- **Agree**: Additional test cases. A3's test suite is the most comprehensive, covering empty input, whitespace-only, comment-only, `42.}` disambiguation, `0..1` range, empty string, keyword-prefix identifiers, CRLF, and `Float(0..1)`. These should be adopted. In particular, `42.}` and `Float(0..1)` directly test the float bug fix.

- **Partially Disagree**: Error collection vs. throwing (issue #6). A3 flags this as a design intent mismatch with the spec. They are correct that the spec says "all errors collected and reported together." However, A3 themselves recommend "for unterminated strings and block comments, continuing is hard -- these should still abort." This undercuts the argument for full error collection in the lexer. My revised position: throw-on-first-error for v1 is acceptable, but document it as a known deviation from the spec. The `LexResult` pattern can be introduced when the parser (T4) or analyzer (T5) genuinely needs it.

- **Note**: A3's edge case analysis for nested block comments (edge case #6) and `\r\n` in string literals (issue #15) are thorough but LOW priority. The Graft spec does not define nested comments, and `\r` inside string literals is exotic. These can be deferred.

### On A4-Specialist

- **Agree**: The float digit-guard fix. A4 provides the cleanest code for this fix -- a single compound condition: `this.source[this.pos] === '.' && this.peek(1) !== '.' && this.peek(1) !== undefined && this.isDigit(this.peek(1)!)`. This is the version I recommend adopting. It is more readable than A3's nested-if approach and handles all three cases (dot-dot, dot-non-digit, dot-digit) in one guard.

- **Agree**: The analysis of type keywords in the KEYWORDS map (issue #1). A4 correctly concludes this is desired behavior -- `String`, `Map`, etc. are reserved type names, and a user should not be able to name a node `String`. The parser will reject `node String(...)` because it expects `Identifier` after `node`, not `TokenType.String`. This is correct and needs no change.

- **Agree**: Throw-on-first-error is pragmatically acceptable for v1 (issue #2). A4's recommendation to "document this as a known v1 limitation" is the right framing.

- **Agree**: `Token[]` return type is sufficient for v1. A4 argues against a `TokenStream` wrapper, and I agree -- the parser can manage its own cursor. This aligns with my revised position on deferring `LexResult`.

- **Agree**: TokenType completeness verification. A4's cross-check against the spec (30 keywords, 12 type keywords, 4 literal types, 18 symbols, EOF) is valuable and confirms no token types are missing.

- **Minor note**: A4's convergence score of 9 is the highest across all agents. The plan is indeed well-engineered, but the float bug is a real correctness issue that would cause incorrect tokenization, so I would not have scored quite as high before the fix.

## Revised Approach

Based on cross-critique, I revise my Step 1 proposal as follows:

### Changes from my Step 1

1. **Drop `LexResult` wrapper for v1**: Revert to `tokenize(): Token[]` that throws on error. This aligns with A2 and A4's pragmatic argument and simplifies the API. Error collection can be introduced in a later task when the compiler pipeline needs it.

2. **Keep `tokens.ts` as a separate file**: Contrary to A2, maintain the `diagnostics -> tokens -> lexer` DAG. The parser will import from `tokens.ts` without depending on the Lexer class.

3. **Keep `severity` on `GraftError`**: The cost is negligible (one optional field with default), and it prevents a breaking change when warnings are needed in T5. But I hold this loosely -- if convergence drops it, impact is minimal.

4. **Keep `CompilerPhase` on `GraftError`**: Same rationale as severity. Optional, cheap, prevents future breakage. Also hold loosely.

5. **Adopt A4's float digit-guard fix**: The compound condition approach is the cleanest.

6. **Adopt A3's additional test cases**: The expanded test suite covers critical edge cases, especially `42.}` and `Float(0..1)`.

7. **`GraftError extends Error`**: Full convergence across all four agents.

8. **Hoist `SINGLE_CHAR` to module scope**: Full convergence across all four agents.

9. **Guard `format()` against invalid column**: Adopt A3's `Math.max(0, column - 1)` fix.

### Revised Key Interfaces

```typescript
// src/errors/diagnostics.ts
export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export type CompilerPhase = 'lexer' | 'parser' | 'analyzer' | 'codegen';

export class GraftError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation,
    public readonly severity: 'error' | 'warning' = 'error',
    public readonly phase?: CompilerPhase,
  ) {
    super(message);
    this.name = 'GraftError';
  }

  format(source: string): string {
    const lines = source.split('\n');
    const lineIdx = this.location.line - 1;
    const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
    const col = Math.max(0, this.location.column - 1);
    const pointer = ' '.repeat(col) + '^';
    return [
      `Error at line ${this.location.line}:${this.location.column}:`,
      `    ${line}`,
      `    ${pointer}`,
      `    ${this.message}`,
    ].join('\n');
  }
}
```

```typescript
// src/lexer/tokens.ts -- separate file, not merged into lexer.ts
import { SourceLocation } from '../errors/diagnostics.js';

export enum TokenType { /* unchanged from Step 1 */ }
export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
}
export const KEYWORDS: Record<string, TokenType> = { /* unchanged */ };
```

```typescript
// src/lexer/lexer.ts
import { Token, TokenType, KEYWORDS } from './tokens.js';
import { GraftError, SourceLocation } from '../errors/diagnostics.js';

const SINGLE_CHAR: Record<string, TokenType> = { /* hoisted to module scope */ };

export class Lexer {
  // ... same structure as Step 1, but:
  // - tokenize() returns Token[] and throws GraftError (not LexResult)
  // - readNumber() uses A4's compound digit-guard for float detection
  // - format() uses defensive column guard
}
```

### Consensus Points (all 4 agents agree)

1. `GraftError` must extend `Error`
2. `SINGLE_CHAR` must be hoisted to module scope
3. Float parsing must require a digit after the decimal point
4. The `0..1` / `0.7` disambiguation via double-peek is correct
5. Keyword-as-identifier lookup pattern is correct
6. `Token.location` should use `SourceLocation` type from diagnostics
7. ASCII-only format output (no emoji)
8. `k`-suffix lexing is correct and unambiguous

### Open Questions for Convergence

1. **Separate `tokens.ts` vs. merged into `lexer.ts`**: A1 (me) and A4 favor separate; A2 favors merged. Architectural argument (dependency DAG) vs. pragmatic argument (fewer files).
2. **`severity` field on `GraftError`**: A1 and A3 favor keeping it; A2 favors removing it. Low stakes either way.
3. **`CompilerPhase` field on `GraftError`**: Only A1 proposes it. Low stakes, optional field.
4. **Error collection vs. throw**: A1 originally proposed `LexResult`; revised to accept throw for v1. All agents now converge on throw-on-first-error for v1.
