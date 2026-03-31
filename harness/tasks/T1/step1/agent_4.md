# A4-Specialist Independent Analysis — T1

## Domain Analysis

### Compiler Theory Context for This Task

- **Pipeline-stage module decomposition**: Classical compiler architecture (Dragon Book, Cooper & Torczon) organizes source into lexer, parser, semantic analysis, and code generation phases. Each phase has a well-defined input/output contract. The plan's `lexer/ -> parser/ -> analyzer/ -> codegen/` decomposition is textbook-correct for a single-pass, non-optimizing compiler. No intermediate representation (IR) layer is needed at v1 because Graft has no optimization passes -- the AST serves directly as the IR for codegen.

- **Shared type definitions across phases**: Every compiler needs a set of cross-cutting types that flow between phases: source locations, token definitions (consumed by parser), AST node types (consumed by analyzer and codegen), and diagnostic/error types (produced by every phase). The question of where these live is a practical architecture decision with real consequences for circular dependencies.

- **Error accumulation model**: Production compilers (rustc, tsc, Clang) collect errors rather than fail-fast. This requires a shared diagnostic infrastructure that every phase can emit into. The plan already calls for this (`errors/diagnostics.ts`), which is correct.

- **Recursive descent parsing**: For a grammar this small (~10 productions), hand-written recursive descent is the right call. The grammar is clearly LL(1) -- each declaration starts with a distinct keyword (`context`, `node`, `edge`, `graph`), so the top-level parser just dispatches on the leading keyword. No ambiguity, no left-recursion, no backtracking needed.

### Domain Fitness of Implementation Plan Code

- **Module decomposition (`lexer/`, `parser/`, `analyzer/`, `codegen/`, `errors/`)**: Appropriate. This is the standard decomposition for a compiler of this complexity. Each module has a single responsibility and a clear input/output contract.

- **`errors/diagnostics.ts` as dependency-free leaf module**: Appropriate. The research correctly notes this module will be imported by every phase and must remain dependency-free to avoid cycles. This is a known compiler engineering pattern -- the diagnostics module is a leaf in the dependency DAG.

- **No shared `types/` or `common/` module**: Partially appropriate. The plan places token types in `lexer/tokens.ts` and AST types in `parser/ast.ts`. This works because the dependency flow is strictly unidirectional: lexer defines tokens, parser consumes tokens and defines AST, analyzer consumes AST, codegen consumes AST. However, there is one cross-cutting type that does not cleanly belong to any phase: `SourceLocation`. It is needed by tokens (lexer phase), AST nodes (parser phase), and diagnostics (errors module). The plan puts it in `errors/diagnostics.ts`, which is acceptable but semantically imprecise -- a source location is not an error concept. A small `types.ts` at `src/types.ts` (not a directory, just a single file) would be cleaner. This is a minor point, not a blocker.

- **Test structure (one file per pipeline stage)**: Appropriate for v1. Compiler testing typically requires three tiers: (1) unit tests per phase (lexer tokenizes correctly, parser produces correct AST, etc.), (2) integration tests that run the full pipeline on `.gft` inputs, and (3) snapshot tests that capture the exact output of codegen. The plan has files for tiers 1 and 2 (`lexer.test.ts`, `parser.test.ts`, `analyzer.test.ts`, `codegen.test.ts`, `integration.test.ts`). Snapshot testing should be added as a strategy within `codegen.test.ts` and `integration.test.ts` using vitest's `toMatchSnapshot()` or `toMatchInlineSnapshot()` -- this is the standard approach for compiler output regression testing. No separate snapshot test file needed; just use vitest snapshots in the existing test files.

- **`ts-node` for dev execution**: Inappropriate. The research correctly identifies `tsx` as the better choice (25x faster startup, zero-config ESM). The implementation plan specifies `ts-node` in the `graft` script, but the research recommends `tsx`. Use `tsx`.

- **`tsc` vs `tsup` for build**: The plan uses `tsc` for build. The research suggests `tsup`. For v1, `tsc` is simpler and sufficient -- I agree with the plan here. `tsup` can be added later if bundling/startup time matters.

- **`Node16` vs `NodeNext` module resolution**: The plan uses `Node16`, the research suggests `NodeNext`. Both work for ESM. `NodeNext` is forward-compatible and preferred -- it tracks the latest Node module semantics. Use `NodeNext`.

## Proposed Implementation

### Domain-Optimized Code

For T1 (scaffolding only), the implementation is configuration files and directory structure. My domain-specific recommendations:

**package.json** -- Follow the research recommendation closely:
```json
{
  "name": "graft",
  "version": "0.1.0",
  "type": "module",
  "bin": { "graft": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit"
  },
  "engines": { "node": ">=20" }
}
```

Key difference from implementation plan: use `tsx` not `ts-node`, and add a `check` script for type-checking without build.

**tsconfig.json** -- Use `NodeNext` (forward-compatible), add `isolatedModules` (required for esbuild-based tools like tsx), add `skipLibCheck`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**vitest.config.ts** -- Minimal, with coverage configuration for future use:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

Keep vitest config minimal at T1. Add `globals: true` and coverage config when test files are actually written (T2+). Adding unused config at scaffolding time is premature.

**Directory structure** -- Standard, matching the plan:
```
src/
  index.ts
  lexer/
  parser/
  analyzer/
  codegen/
  errors/
tests/
examples/
  hello.gft
```

No `types/` or `common/` directory needed at T1. If a shared `SourceLocation` type becomes necessary during T2 (when `errors/diagnostics.ts` and `lexer/tokens.ts` are both written), it can be extracted to `src/types.ts` at that point. Do not create it preemptively.

**src/index.ts** -- Minimal placeholder:
```typescript
#!/usr/bin/env node
console.log('graft v0.1.0');
```

Include the shebang from the start. It costs nothing and avoids forgetting it later.

### Graft-Specific Considerations

- **k-suffix parsing**: Not relevant to T1 (scaffolding). However, the `hello.gft` example uses `2k/1k`, `1500/800`, and `6k`, which exercises k-suffix in both forms (with and without suffix, mixed). This is good -- it ensures T2's lexer must handle both.

- **Pipe transform parsing**: Not relevant to T1 directly. The `hello.gft` example includes `| select(findings)` and `| compact`, which exercises the pipe operator and two transform types (one with argument, one without). This is a reasonable subset for v1 validation.

- **Token-bounded types**: Not exercised by `hello.gft`. The example uses `Float(0..1)` (range-constrained primitive) but not `TokenBounded<T, max>`. This is acceptable for a "hello world" example -- `TokenBounded` is a more advanced feature. However, a second example (`examples/review.gft`, mentioned in the spec's file structure but not in T1) should exercise it.

### hello.gft Grammar Coverage Analysis

The `hello.gft` example exercises:

| Grammar Feature | Exercised? | How |
|---|---|---|
| `context` declaration | Yes | `context UserRequest(max_tokens: 500)` |
| `node` declaration | Yes | Two nodes (Researcher, Writer) |
| `produces` block | Yes | Both nodes produce output |
| `reads` with full context ref | Yes | `reads: [UserRequest]` |
| `reads` with partial ref | Yes | `reads: [Research.findings]` |
| `edge` with transforms | Yes | `select(findings)`, `compact` |
| `graph` declaration | Yes | `graph SimpleQA(...)` |
| k-suffix integers | Yes | `2k`, `1k`, `6k` |
| Plain integers | Yes | `500`, `1500`, `800` |
| `Float(min..max)` range type | Yes | `Float(0..1)` |
| `List<T>` generic type | Yes | `List<String>` |
| String primitive type | Yes | Multiple fields |
| `done` terminator | Yes | In graph flow |
| `model` values | Yes | `sonnet`, `haiku` |
| Conditional edge routing | No | Not in example |
| `on_failure` strategy | No | Not in example |
| `tools` declaration | No | Not in example |
| Inline struct types | No | Not in example |
| `enum()` inline type | No | Not in example |
| `Map<K,V>` type | No | Not in example |
| `Optional<T>` type | No | Not in example |
| `TokenBounded<T,max>` type | No | Not in example |
| `filter()` transform | No | Not in example |
| `drop()` transform | No | Not in example |
| `truncate()` transform | No | Not in example |
| Multi-line comments | No | Not in example |
| Domain types (FilePath, etc.) | No | Not in example |

**Assessment**: `hello.gft` covers 13/26 grammar features (50%). This is acceptable for a "hello world" example -- it exercises the core happy path. The missing features are either secondary (inline enums, optional types) or more complex (conditional edges, failure strategies). These should be covered by (a) the `review.gft` example mentioned in the spec's file structure and (b) targeted unit tests in T2-T6. Adding more features to `hello.gft` would make it less useful as a simple introductory example.

**One recommendation**: Add a brief comment at the top of `hello.gft` to make it clear what it demonstrates and to exercise the comment lexing:

```graft
// SimpleQA: a two-node pipeline that researches a question and writes an answer
```

This also exercises single-line comment parsing, bringing coverage to 14/26.

## Self-Assessment
- Convergence score: 8
- Basis: The implementation plan's scaffolding is well-aligned with compiler engineering best practices. My recommendations are minor adjustments (tsx over ts-node, NodeNext over Node16, shebang in index.ts, comment in hello.gft) rather than structural disagreements. The module decomposition is textbook-correct. The only substantive design question (shared types module) is premature for T1 and can be deferred to T2. High confidence that the plan, with the minor adjustments noted, produces a correct and maintainable compiler scaffold.
