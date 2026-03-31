# Architecture Research -- T1: Project Scaffolding

## Patterns Found

### 1. Compiler Source Organization -- TypeScript Compiler (tsc), SWC, Biome -- Confidence: HIGH
- Description: Well-structured TS compiler projects use a `src/` directory with subdirectories per pipeline stage (`lexer/`, `parser/`, `analyzer/`, `codegen/`), a top-level `compiler.ts` orchestrator, and a separate `errors/` module. Tests mirror the source structure in a sibling `tests/` directory.
- Pros: Clear separation of concerns; each stage is independently testable; matches the mental model of the pipeline.
- Cons: Can feel over-structured for very small compilers, but Graft's planned file count (~15 source files) fits naturally.
- Note: The implementation plan already follows this pattern exactly. This is the established standard.

### 2. ESM for CLI Tools in 2026 -- Node.js docs, ecosystem trend -- Confidence: HIGH
- Description: ESM (`"type": "module"` in package.json) is the clear choice for new projects. Node.js 22+ (LTS in 2025) has full ESM support. Commander v12+ is ESM-native. CJS is legacy-only at this point.
- Pros: Native `import/export`, top-level await, better tree-shaking, forward-compatible.
- Cons: Requires `.js` extensions in imports when using `Node16` module resolution (or `NodeNext`). Some older tooling may have friction.
- Recommendation: Use `"type": "module"` with `"module": "Node16"` in tsconfig.

### 3. tsconfig Best Practices for Compiler Projects -- TypeScript docs, tsc project configs -- Confidence: HIGH
- Description: Strict mode (`"strict": true`) is non-negotiable for a compiler that validates others' code. Target `ES2022` (stable baseline with broad Node support). Module resolution `Node16` matches ESM semantics. `outDir: "dist"`, `rootDir: "src"`, `declaration: true` for publishability.
- Pros: Catches type errors early (critical for AST type safety), discriminated unions work well under strict null checks.
- Cons: Slightly more verbose code (explicit null handling), but this is a feature for compiler work.
- Key settings: `strict: true`, `target: "ES2022"`, `module: "Node16"`, `moduleResolution: "Node16"`, `outDir: "dist"`, `rootDir: "src"`, `skipLibCheck: true`, `declaration: true`.

### 4. Project Structure: Nested Dirs + Direct Imports -- TypeScript ecosystem consensus -- Confidence: HIGH
- Description: Use nested directories per pipeline stage (not flat). Avoid barrel exports (`index.ts` re-exports) for internal modules -- they cause circular dependency issues and make tree-shaking harder. Use direct imports (`import { Token } from '../lexer/tokens.js'`).
- Pros: No circular dependency traps, clear dependency graph, IDE "go to definition" works reliably.
- Cons: Import paths are longer, but this is trivial.
- Note: Barrel exports are appropriate only at the package boundary (e.g., a single `src/index.ts` for the CLI entry point).

### 5. Build Tooling: tsc + tsup for CLI Distribution -- tsup docs, CLI project patterns -- Confidence: MEDIUM
- Description: Two viable approaches: (A) `tsc` only -- simple, outputs `.js` files to `dist/`, use `#!/usr/bin/env node` shebang in entry. (B) `tsup` (esbuild wrapper) -- bundles to single file, faster builds, handles shebang injection. For a CLI tool like Graft, `tsc` alone is sufficient at v1. Bundle later if startup time matters.
- Pros of tsc-only: Zero extra dependencies, source maps work perfectly, debugging is straightforward.
- Cons of tsc-only: Slightly slower cold start (Node resolves multiple files), no bundling.
- Recommendation: Start with `tsc` only. Add `tsup` in a later milestone if distribution size or startup perf becomes a concern.

### 6. Test Structure: Colocated vs Separate -- Vitest docs, testing patterns -- Confidence: HIGH
- Description: The plan uses a top-level `tests/` directory with one test file per pipeline stage. This is standard for compiler projects where integration tests span multiple stages. Vitest supports both patterns natively.
- Pros: Clear boundary between source and tests, simple glob patterns, test files don't pollute source imports.
- Cons: Slightly further from source files in the file tree.

## Recommended Pattern

- **Nested dirs + direct imports + ESM + tsc-only build** -- This matches the implementation plan exactly and aligns with established compiler project conventions. The plan's file structure is well-designed and should be followed as-is.
- Use `"type": "module"` in package.json, `Node16` module/moduleResolution in tsconfig, strict mode enabled.
- Use direct imports between modules (no barrel files except the CLI entry point).
- Build with `tsc` only for v1; defer bundling to a future milestone.

## Warnings

- **Import extensions required**: With `Node16` module resolution, all relative imports must include `.js` extension (e.g., `import { Lexer } from './lexer/lexer.js'`), even though the source files are `.ts`. This is a common stumbling block.
- **Circular dependencies**: The `errors/diagnostics.ts` module will be imported by every pipeline stage. Keep it dependency-free (no imports from lexer/parser/etc.) to avoid cycles.
- **Shebang handling**: The CLI entry point (`src/index.ts`) needs a `#!/usr/bin/env node` shebang. With `tsc`, this must be in the source file and `tsc` preserves it. Ensure the `bin` field in package.json points to `dist/index.js`.
- **Vitest with ESM**: Vitest handles ESM natively, but ensure `vitest.config.ts` does not set conflicting module settings. A minimal config is best.
