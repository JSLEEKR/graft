# A3-Skeptic Review: T7 Compiler Pipeline & CLI

## Convergence Score: 5/10

The plan's architecture is sound -- sequential pipeline with early-exit, discriminated CompileResult, commander CLI with two subcommands. But it contains two known build-breaking bugs (estimator import, Parser constructor) plus several new bugs that the other agents are unlikely to catch. The integration test has a structural gap, the CLI has an error-formatting bug, and edge cases around empty programs are unhandled.

---

## BUG 1 (Critical/Known): Import path `./analyzer/tokens.js` does not exist

**File:** `src/compiler.ts` line 3218

Plan writes:
```typescript
import { TokenEstimator, TokenReport } from './analyzer/tokens.js';
```

Must be:
```typescript
import { TokenEstimator, TokenReport } from './analyzer/estimator.js';
```

Per T5-R02 (LOCKED), T6-R01 (LOCKED), and both research documents. Build-breaking.

---

## BUG 2 (Critical/Known): `new Parser(tokens, source)` violates T4-R01

**File:** `src/compiler.ts` line 3251

Plan writes:
```typescript
const parser = new Parser(tokens, source);
```

Must be:
```typescript
const parser = new Parser(tokens);
```

Per T4-R01 (LOCKED): "Parser(Token[]) only." TypeScript strict mode will reject the extra argument. Build-breaking.

---

## BUG 3 (High): CLI `err.format(source)` uses wrong `source` variable in compile command

**File:** `src/index.ts` (plan line 3319-3320)

The compile command's error handler calls:
```typescript
console.error(err.format(source));
```

The variable `source` here is the file content read from disk. This is correct for lexer/parser errors, which have valid `SourceLocation` pointing into the source string. However, for **analyzer errors** (ScopeChecker, TypeChecker), the `GraftError` locations point to AST node locations, which also originate from the source string -- so this actually works.

**Wait -- there is a real bug here.** Look at `GraftError.format()`:

```typescript
format(source: string): string {
    const lines = source.split('\n');
    const lineIdx = this.location.line - 1;
    const line = (lineIdx >= 0 && lineIdx < lines.length) ? lines[lineIdx] : '';
    ...
```

The `format()` method splits the source on `'\n'`. But `readSource()` reads the file with `fs.readFileSync(resolved, 'utf-8')`. On Windows (the development platform), `.gft` files may use `\r\n` line endings. The `split('\n')` will leave trailing `\r` characters on each line, causing the pointer caret to be misaligned by one position on every line except the last. This is a pre-existing bug in `diagnostics.ts`, but T7 is the first time it gets exercised via real file I/O (all prior tests used inline strings with `\n`).

**Severity:** Medium. Cosmetic on Windows but affects every error displayed via the CLI when reading files with CRLF endings.

---

## BUG 4 (High): `check` command description is misleading -- it DOES run codegen

**File:** `src/index.ts` (plan line 3353)

```typescript
.description('Check .gft source (parse + analyze, no generation)')
```

But the `check` command calls `compile()` which runs the full pipeline **including codegen** (`generate()` is called and returns `GeneratedFile[]`). The description claims "no generation" but generation happens in-memory. The research documents acknowledge this is intentional, but the CLI description lies to the user.

**Fix:** Change description to `'Check .gft source (parse + analyze, no file output)'` or similar.

**Severity:** Medium. Misleading UX, not a runtime bug.

---

## BUG 5 (High): No graph declaration produces silent empty output, not an error

**Edge case:** What if a `.gft` file has contexts, nodes, and edges but no `graph` declaration?

Trace through `compile()`:
1. Lex/parse succeed (grammar allows files without `graph`).
2. ScopeChecker: `checkGraphFlow()` iterates `program.graphs` -- empty array, no errors produced.
3. TypeChecker: Only checks edge transforms, no graph dependency. No errors.
4. `errors.length === 0`, so we proceed to codegen.
5. `TokenEstimator.estimate()`: `program.graphs[0]` is undefined, returns empty report with `graphName: ''`, `budget: 0`.
6. `generate()`: Calls `generateOrchestration(program, report)` which checks `program.graphs[0]` -- undefined, returns `''` for CLAUDE.md content. Calls `generateSettings(program, sourceFile)` which accesses `program.graphs[0]` -- undefined, so `firstNodeModel` is undefined, falls through to `MODEL_MAP.sonnet` default. Budget is `graph?.budget || 0` = 0.
7. Result: `success: true` with `files` array containing an empty CLAUDE.md, a settings.json with budget 0, agent files, and possibly hook files.

This is semantically wrong. A `.gft` file without a `graph` declaration is incomplete and should be an error. The compiler silently succeeds and produces degenerate output. The `graph` declaration is what ties everything together -- without it, the generated harness is useless.

**Fix:** Add a check in `compile()` after parsing:
```typescript
if (program.graphs.length === 0) {
  return { success: false, errors: [new GraftError('No graph declaration found', { line: 1, column: 1, offset: 0 })], warnings };
}
```

**Severity:** High. Silent incorrect output for malformed input.

---

## BUG 6 (Medium): Integration test does not test error FORMAT, only error count

**File:** `tests/integration.test.ts` (plan line 3500-3511)

The "rejects invalid programs" test only asserts:
```typescript
expect(result.success).toBe(false);
expect(result.errors.length).toBeGreaterThan(0);
```

It does not verify:
- That errors are `GraftError` instances (not generic `Error`)
- That `err.format(source)` works without throwing
- That error messages contain useful diagnostic info (e.g., mention "NonExistent")

More importantly, the test source has no `context` declaration at all:
```gft
node A(model: sonnet, budget: 1k/500) {
  reads: [NonExistent]
  produces Out { data: String }
}
graph G(input: NonExistent, output: Out, budget: 5k) { A -> done }
```

This will produce scope errors for:
- `reads: [NonExistent]` -- not a declared context or produces
- `graph G(input: NonExistent, ...)` -- not a declared context

But it will NOT produce a lexer or parser error. The integration test therefore never exercises the `catch (e) { if (e instanceof GraftError)` path in `compile()`. A true end-to-end failure test should include a lex/parse failure case (e.g., `@@@invalid`).

**Fix:** Add a test case for syntax errors:
```typescript
it('catches lexer errors', () => {
  const result = compile('@@@', 'bad.gft');
  expect(result.success).toBe(false);
  expect(result.errors[0]).toBeInstanceOf(GraftError);
});
```

**Severity:** Medium. Missing test coverage for a critical error path.

---

## BUG 7 (Medium): `compileAndWrite` does not validate `outDir` exists or is writable

**File:** `src/compiler.ts` (plan line 3282-3288)

`compileAndWrite()` delegates to `writeFiles()` which calls `fs.mkdirSync(dirname, { recursive: true })`. If `outDir` is an invalid path (e.g., contains null bytes, or is a file not a directory), `mkdirSync` will throw an unhandled `Error` (not a `GraftError`). This exception will propagate up to the CLI action handler uncaught, producing a raw Node.js stack trace instead of a user-friendly error message.

The CLI action handler for `compile` does not wrap `compileAndWrite()` in a try-catch:
```typescript
.action((file: string, opts: { outDir: string }) => {
    const source = readSource(file);
    const result = compileAndWrite(source, path.basename(file), path.resolve(opts.outDir));
    // ... no try-catch around compileAndWrite
```

**Fix:** Wrap in try-catch in the CLI action, or validate `outDir` in `compileAndWrite`.

**Severity:** Medium. Poor UX on write failures.

---

## BUG 8 (Medium): CLI `toLocaleString()` calls lack locale pinning

**File:** `src/index.ts` (plan lines 3333-3336)

The compile command formats token counts:
```typescript
node.estimatedIn.toLocaleString()
```

Without a locale argument, this is system-dependent. On `de-DE` machines, `6000` becomes `6.000` instead of `6,000`. The codegen files (`orchestration.ts`) already fixed this in T6 by using `toLocaleString('en-US')` per T6-R02, but the CLI plan does not apply the same fix.

**Fix:** Use `toLocaleString('en-US')` consistently.

**Severity:** Low-medium. Cosmetic inconsistency, but will cause confusion if CLI output looks different from generated markdown.

---

## BUG 9 (Medium): Integration test `HELLO_GFT` does not test the full pipeline with ALL codegen features

The test fixture has:
- 1 context, 2 nodes, 1 edge with transforms, 1 graph
- No `on_failure`, no `tools`, no conditional edges, no `filter`/`drop`/`truncate` transforms

This means the integration test never exercises:
- `formatFailure()` paths in agents.ts (retry, fallback, skip, abort)
- `resolveTools()` with actual tool mappings
- Conditional edge codegen
- `filterToJq()` in hooks.ts

These are unit-tested in T6, but the integration test's purpose is to verify the full pipeline works end-to-end. A single happy-path fixture that only tests select+compact is thin coverage for an integration test.

**Severity:** Low. Unit tests cover the gaps, but the integration test is weaker than it should be.

---

## BUG 10 (Low): `readSource()` returns string but `process.exit(1)` is typed as `never`

**File:** `src/index.ts` (plan line 3388-3395)

```typescript
function readSource(file: string): string {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}
```

`process.exit(1)` has return type `never` in Node.js typings, so TypeScript correctly infers control flow terminates. **No actual type error here.** However, `readSource` does not handle permission errors from `readFileSync`. If the file exists but is not readable (e.g., locked by another process on Windows), the raw `EPERM` or `EACCES` error will surface as an uncaught exception with a stack trace.

**Fix:** Wrap `readFileSync` in try-catch for a clean error message.

**Severity:** Low. Rare edge case.

---

## BUG 11 (Low): Multiple graphs in `.gft` file -- only first is used, silently

`TokenEstimator.estimate()` uses `program.graphs[0]`. `generateOrchestration()` uses `program.graphs[0]`. `generateSettings()` uses `program.graphs[0]`. If a file declares two graphs, the second is silently ignored everywhere. No warning is emitted.

**Severity:** Low for v1 (spec says single graph), but should at minimum warn.

---

## Summary of Required Fixes Before Implementation

| # | Severity | Fix | Known? |
|---|----------|-----|--------|
| 1 | Critical | Import from `./analyzer/estimator.js` not `./analyzer/tokens.js` | Yes |
| 2 | Critical | `new Parser(tokens)` not `new Parser(tokens, source)` | Yes |
| 5 | High | Error on missing `graph` declaration (empty programs succeed silently) | NEW |
| 3 | Medium | CRLF line endings misalign error pointer in `format()` | NEW |
| 4 | Medium | `check` command description claims "no generation" but codegen runs | NEW |
| 6 | Medium | Add lexer/parser error test case to integration tests | NEW |
| 7 | Medium | CLI does not catch `writeFiles` exceptions (raw stack trace) | NEW |
| 8 | Medium | `toLocaleString()` in CLI needs `'en-US'` locale pinning | NEW |
| 9 | Low | Integration test fixture too narrow (no tools, failure, conditionals) | NEW |
| 10 | Low | `readSource` does not catch `readFileSync` permission errors | NEW |
| 11 | Low | Multiple `graph` declarations silently ignored | NEW |

Bugs 1-2 are build-breaking and already known. Bug 5 (no graph = silent success) is the most important new finding -- it produces incorrect output without any error, which is the worst failure mode for a compiler.
