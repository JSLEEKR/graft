# T2 Implementation Research: Token Types & Lexer

## 1. TypeScript Enum for Token Types
**Recommendation:** String enum (`TokenType.Node = 'Node'`) as specified in the plan.
- String enums produce readable debug output and JSON serialization without reverse-mapping overhead.
- Numeric enums are marginally faster for comparison but lose debuggability; not worth it for ~60 members.
- `const enum` would inline values (better perf) but breaks `isolatedModules: true` in tsconfig. Do not use.
- **Confidence: HIGH** -- string enum is the standard choice; plan already specifies it.

## 2. Keyword Lookup: Object Literal vs Map vs Switch
**Recommendation:** Plain object literal (`Record<string, TokenType>`) as specified in the plan.
- Object property lookup is O(1) via V8 hidden classes; equivalent to Map for <100 keys.
- Map has slightly more overhead for construction and `.get()` call syntax.
- Switch is verbose for 30+ keywords and harder to maintain.
- Object literal wins on readability and matches plan's `KEYWORDS` constant.
- **Confidence: HIGH** -- object literal is idiomatic and performant for this scale.

## 3. Vitest Testing Patterns
**Recommendation:** Explicit imports (`import { describe, it, expect } from 'vitest'`) per T1-R04.
- Use `it.each` / `describe.each` for parameterized tests (e.g., testing all keywords in a table).
- `toMatchObject` for partial token matching (type + value without location).
- `toThrow(/pattern/)` for error message assertions.
- Snapshot tests (`toMatchInlineSnapshot`) useful for full token stream dumps but avoid for core assertions -- they're brittle to refactors.
- **Confidence: HIGH** -- plan already demonstrates these patterns.

## 4. String Scanning: charAt vs charCodeAt vs Index
**Recommendation:** Use `source[pos]` (bracket indexing) for character access.
- `source[pos]` returns a single-char string; idiomatic and readable for comparisons like `ch === '{'`.
- `source.charCodeAt(pos)` returns a number; useful for range checks (`code >= 48 && code <= 57` for digits) but less readable.
- `source.charAt(pos)` is equivalent to bracket indexing; no advantage.
- For the plan's lexer (~18 symbols, simple numeric/alpha checks), bracket indexing is clearest.
- Use `source.charCodeAt(pos)` only if digit/alpha range checks become hot paths.
- **Confidence: HIGH** -- bracket indexing is standard in TS hand-written lexers.

## 5. CRLF Line Ending Handling
**Recommendation:** Normalize or handle `\r\n` in `skipWhitespace`.
- Option A: Pre-normalize `this.source = source.replace(/\r\n/g, '\n')` in constructor. Simple but changes offsets (offset no longer maps to original source bytes).
- Option B: Treat `\r` as whitespace in the scanner; only increment `line` on `\n`. When encountering `\r`, skip it. If next char is `\n`, the `\n` handler increments line.
- Option B is preferred: preserves original offsets for accurate source mapping.
- Implementation: in `skipWhitespace`, treat `\r` same as space/tab (skip, advance column). Line increment only on `\n`.
- **Confidence: MEDIUM-HIGH** -- Option B is what TypeScript's own scanner does; slight complexity but correct.

## Key Implementation Notes
- All imports must use `.js` extension (T1-R09): `import { Token } from './tokens.js'`
- `src/errors/diagnostics.ts` must be dependency-free (DAG leaf per common_memory)
- `GraftError.format()` uses `source.split('\n')` which works with both `\n` and `\r\n`
- The `location` test (`line: 2, column: 3, offset: 7`) assumes `\n` input; if CRLF, offset would be 8. Tests should use `\n` only.
- The plan's lexer uses a class with mutable state (`pos`, `line`, `column`); this is standard for hand-written lexers.
