# A3-Skeptic Cross-Critique — T1

## Critique of Other Agents

### On A1-Architect

- **Over-engineering the directory structure at T1**: A1 pre-creates `src/lexer/`, `src/parser/`, `src/analyzer/`, `src/codegen/`, `src/errors/` as empty directories, plus `src/compiler.ts` as a placeholder. Empty directories are not tracked by git (you need `.gitkeep` files or actual content). If the implementer creates these directories with nothing in them, they will vanish on clone. More importantly, creating structure for T2-T7 in T1 is speculative -- if the module decomposition changes during a later debate cycle, these directories become misleading artifacts. A2's "flat until forced" principle is more defensive here. **Basis**: Empty dirs in git require workarounds; premature structure creates false confidence about future architecture.

- **Commander setup in T1 is premature scope**: A1 includes a full Commander CLI with `compile` and `check` subcommands, typed options, and async action handlers. This is T7's job per the task list. If the Commander API changes between now and T7 (or if the debate cycle for T7 decides on a different CLI structure), this code must be rewritten. The risk is that T7's agents feel constrained by T1's CLI skeleton and fail to challenge its design. **Basis**: T1 deliverables are "package.json, tsconfig.json, vitest.config.ts" -- not a working CLI.

- **`resolveJsonModule: true` may cause subtle issues**: A1 includes this flag. While harmless today, it changes how TypeScript resolves imports -- if someone accidentally writes `import pkg from '../package.json'` in a source file, it will compile but create a runtime dependency on the file's relative location from `dist/`. This is a known footgun with `resolveJsonModule` in CLI tools where the build output moves to a different directory. **Basis**: The `rootDir`/`outDir` split means JSON imports resolve to different relative paths at compile time vs runtime.

- **tsx dependency version pinning is too loose**: A1 specifies `"tsx": "^4.0.0"`. tsx v4 had breaking changes around Node 22 compatibility. A more defensive pin would be `"tsx": "^4.19.0"` or similar to ensure the ESM loader works correctly with the target Node version. **Basis**: tsx's ESM handling changed significantly across v4 minor releases.

### On A2-Pragmatist

- **No shebang in `src/index.ts` is a real omission, not pragmatism**: A2's `src/index.ts` is `#!/usr/bin/env node\nconsole.log('graft');` -- wait, A2 does include the shebang. However, A2's broader point about deferring Commander to T7 is correct.

- **`sourceMap: false` creates a debugging blind spot**: A2 argues source maps are unnecessary at T1 scale. This is true today but sets a bad default. When T2 adds the lexer and tests start failing, the stack traces will point to `dist/` line numbers. The developer will then need to remember to flip this flag. Source maps cost nothing at build time (a few KB of `.map` files) and the `dist/` directory is gitignored anyway. Removing them is false economy. **Basis**: The cost of source maps is near-zero; the cost of forgetting to re-enable them is wasted debugging time.

- **`declaration: false` is defensible but inconsistent**: A2 removes declaration generation because "nobody imports graft as a library." This is correct for T1 but the implementation plan's T7 creates a `compiler.ts` orchestrator that other tools could import. More importantly, `declaration: true` catches certain type errors that `declaration: false` does not -- specifically, types that are inexpressible in `.d.ts` format (e.g., inferred return types with private types). These errors surface silently later. **Basis**: Declaration generation is a free type-checking bonus, not just a publishing concern.

- **No `prepare` script is correct**: A2 omits `prepare`, and I agree. The `prepare` script runs on every `npm install`, including in CI, which adds unnecessary build time. `npm link` is a development convenience that does not justify a global hook. Developers who use `npm link` can run `npm run build` first. This is pragmatically correct.

- **Missing coverage config is acceptable**: A2 omits vitest coverage configuration. This is fine for T1. Coverage config can be added in T2 when there is actual code to measure. No edge case here.

### On A4-Specialist

- **`SourceLocation` as a separate `src/types.ts` is premature**: A4 suggests that `SourceLocation` does not belong in `errors/diagnostics.ts` and proposes a `src/types.ts` file. While semantically correct (a source location is not an error), creating a shared types file at T1 for a type that does not exist yet is speculative. If T2 defines `SourceLocation` in `errors/diagnostics.ts` and it works fine, the separate file adds indirection without benefit. A4 correctly defers this to T2, but the suggestion itself could bias the T2 debate. **Basis**: Premature abstraction; the "wrong" location (diagnostics.ts) works perfectly well for a leaf module.

- **Grammar coverage analysis is thorough but irrelevant to T1**: A4 provides an excellent analysis of which grammar features `hello.gft` exercises (13/26). This is valuable information for T2-T6 planning. However, it does not affect any T1 decision -- the `hello.gft` file is a test fixture, not a specification. The coverage gap does not change any config file or directory structure choice. **Basis**: Interesting analysis, zero impact on T1 deliverables.

- **Recommendation to add a comment to `hello.gft` is sound**: A4 suggests adding a comment line to exercise comment lexing. This is a cheap, zero-risk addition that marginally improves the test fixture. I support this. **Basis**: Costs nothing, exercises one more token type.

- **`NodeNext` recommendation is correct but the justification overstates the risk of `Node16`**: A4 says `NodeNext` is "forward-compatible" and implies `Node16` is not. In practice, TypeScript's `Node16` module resolution has tracked Node's ESM behavior for years and there is no announced plan to diverge. The practical difference between `Node16` and `NodeNext` is zero today. Using `NodeNext` is marginally better as a signal of intent, but presenting it as a meaningful technical decision overstates its importance. **Basis**: The two settings produce identical behavior; the choice is cosmetic.

## Revised Approach

After reviewing all four proposals, I revise my Step 1 position as follows:

### What I maintain from my original analysis

1. **ts-node must be replaced with tsx (HIGH severity)**: All four agents agree. This is locked.
2. **`forceConsistentCasingInFileNames: true` is required**: All agents who mention it agree. Critical for cross-platform development on Windows.
3. **`skipLibCheck: true` is required**: Prevents dependency type errors from blocking compilation.
4. **Explicit vitest imports over `globals: true`**: All four agents agree. No tsconfig coordination needed.
5. **`.gitignore` must be created**: A1 and I both called this out. A2 includes it.
6. **Shebang in `src/index.ts` from day one**: A1, A3 (me), and A4 agree. A2 also includes it.

### What I revise based on other agents' feedback

1. **Drop `prepare` script**: A2 convinced me. The `prepare` hook runs on every `npm install`, which is overkill. Developers who need `npm link` can build manually. I remove this from my proposal.

2. **Accept `NodeNext` over `Node16`**: A1 and A4 both recommend this. While I noted the practical difference is zero, the signal of intent is worth the zero-cost switch. I adopt `NodeNext`.

3. **Drop pre-created pipeline subdirectories**: A2's argument is correct -- empty directories are not tracked by git and creating them is speculative. T2 creates `src/lexer/` when it needs it. I adopt the flat structure for T1.

4. **Keep `sourceMap: true`**: Against A2's recommendation. The cost is near-zero and the debugging benefit is real when T2 arrives. Removing and re-adding is unnecessary churn.

5. **Keep `declaration: true`**: Against A2's recommendation. It catches type errors that `declaration: false` misses. Free type-checking bonus.

6. **Drop Commander CLI skeleton**: A1's full CLI setup is T7 scope. A2's minimal `console.log('graft')` is the right level for T1. The CLI structure should be debated in T7, not locked in T1.

7. **Add comment to `hello.gft`**: Per A4's recommendation. Exercises comment lexing at zero cost.

### Revised file set for T1

**Files to create (7 total):**
- `package.json` -- with tsx dev dep, no ts-node, no prepare script
- `tsconfig.json` -- NodeNext, strict, sourceMap, declaration, skipLibCheck, forceConsistentCasingInFileNames, isolatedModules
- `vitest.config.ts` -- minimal, no globals, no coverage config
- `src/index.ts` -- shebang + console.log only, no Commander
- `tests/setup.test.ts` -- smoke test proving vitest + TS + ESM works
- `examples/hello.gft` -- with leading comment per A4
- `.gitignore` -- node_modules/, dist/, *.tsbuildinfo

### Remaining edge cases I still flag

1. **Windows CRLF in shebang**: If `src/index.ts` is saved with CRLF line endings, the shebang `#!/usr/bin/env node\r` breaks on Unix. This needs either a `.editorconfig` or a `newLine` setting in tsconfig. None of the other agents addressed this. **Severity: MEDIUM** -- it will not bite until someone runs the built CLI on Linux/macOS.

2. **`resolveJsonModule` footgun**: I drop this from the tsconfig. No task needs JSON imports, and the `rootDir`/`outDir` split makes JSON imports resolve incorrectly at runtime. If a future task needs it, it can be added then with proper awareness of the path issue. **Basis**: Defensive omission is safer than defensive inclusion.

3. **`npm init -y` generating stale `"main": "index.js"`**: If the implementer starts with `npm init -y`, the generated `"main"` field points to a nonexistent file. The final package.json should either omit `"main"` entirely (CLI tools do not need it) or set it to `"dist/index.js"`. **Severity: LOW** -- only matters if someone tries to `require('graft')`.
