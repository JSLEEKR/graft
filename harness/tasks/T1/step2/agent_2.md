# A2-Pragmatist Cross-Critique -- T1

## Critique of Other Agents

### On A1-Architect

- **Agree**: No barrel exports (Decision 4). Barrel files cause circular dependency headaches in compilers where cross-cutting imports are common. Direct imports are simpler and more explicit. This is the pragmatic choice too.

- **Agree**: `tsc`-only build, no `tsup` (Decision 2). Bundling is a distribution optimization. We are not distributing. Agreed completely.

- **Agree**: Renaming `analyzer/tokens.ts` to `analyzer/estimator.ts` (Issue 2). Two files named `tokens.ts` with completely different purposes is a real source of confusion. Good catch.

- **Disagree**: tsx as a dev dependency (Decision 1). A1 argues tsx gives "developer ergonomics" with 20ms vs 500ms startup. But for T1, there is no code to run interactively. Tests are the feedback loop, and vitest handles TS natively. Adding tsx is a convenience that can be deferred to the task where manual CLI execution matters (T7). The 20ms improvement is irrelevant when you are running `vitest`, not `tsx src/index.ts`.
  - Over-abstraction detected: No -- this is over-tooling, not over-abstraction. Minor point.

- **Disagree**: `declaration: true` and `sourceMap: true` at T1. Nobody imports graft as a library (no declarations needed). The codebase is ~10 lines at T1 (no source maps needed for debugging). Both are zero-cost to add later when they matter. Every config line is a line someone has to read and understand. Keep config minimal until justified.
  - Over-abstraction detected: No -- this is speculative config, not architectural over-abstraction.

- **Disagree**: Pre-creating all pipeline subdirectories (`src/lexer/`, `src/parser/`, etc.) at T1. Empty directories are noise. The task that needs a directory creates it. This is a core YAGNI violation -- creating structure for code that does not exist yet. mkdir is cheap; the cost is cognitive, not computational. When you see `src/lexer/` and it is empty, you wonder if something is missing.
  - Over-abstraction detected: Yes (mild) -- pre-creating the entire compiler pipeline directory tree before any pipeline code exists is architectural scaffolding ahead of need.

- **Disagree**: Including Commander setup with subcommands in `src/index.ts` at T1. The implementation plan assigns CLI wiring to T7. A1's index.ts has `compile` and `check` subcommands with options, but both just print TODO. This is speculative code -- it will be rewritten when the compiler pipeline exists. A two-line `index.ts` (shebang + console.log) proves the entry point works without writing code that will be replaced.

- **Agree**: NodeNext over Node16 (Decision 3). Forward-compatible at zero cost. No reason to use the older name.

- **Agree**: No vitest globals (Decision 6). Explicit imports, no tsconfig coordination needed.

- **Agree**: Windows path handling concern (Issue 3). Worth noting now even though it is a T6 concern.

### On A3-Skeptic

- **Agree**: ts-node is broken for ESM (Issue 1, HIGH severity). This is the most important finding across all agents. The implementation plan's `--loader ts-node/esm` script will fail or produce deprecation warnings on Node 22+. This must be fixed. However, the fix is "remove the broken script," not "add tsx." For T1, we do not need a dev runner at all.

- **Agree**: Missing `.gitignore` (Issue 10). Obvious omission from the plan. Must be created.

- **Agree**: Shebang in `src/index.ts` from day one (Issue 4). Costs nothing, prevents a future bug. I concede this point -- my Step 1 proposal already includes it.

- **Agree**: `forceConsistentCasingInFileNames` (Issue 9). Essential for Windows-to-Linux portability. My Step 1 proposal already includes it.

- **Agree**: `skipLibCheck: true` (Issue 8). Prevents spurious type errors from `node_modules`. Already in my proposal.

- **Agree**: Explicit vitest imports over globals. Same conclusion as A1 and my own.

- **Disagree**: Adding a `prepare` script (`"prepare": "npm run build"`). This auto-builds on every `npm install`, which is slow and unnecessary during development. When you `npm install` a new package, you do not want to wait for a build. `prepare` is designed for packages consumed by others (it runs on `npm pack` and `npm publish`). We are not publishing. `npm link` is a niche workflow that can require a manual build step.

- **Disagree**: `declaration: true` and `sourceMap: true`. Same reasoning as my critique of A1. These are not T1 requirements.

- **Partially agree**: `resolveJsonModule: true`. A3 says "should be set up correctly from the start" for future JSON imports. Counter: we have no JSON imports and may never need them. But the cost of including it is near-zero (one config line, no behavioral change), so this is a borderline call. I lean toward omitting it (YAGNI) but would not fight over it.

- **Agree**: The smoke test approach (tests/setup.test.ts). A single test proving vitest works is exactly right for T1. My proposal has the same thing.

### On A4-Specialist

- **Agree**: The grammar coverage analysis of hello.gft is excellent and useful for planning T2-T6 test coverage. 13/26 features covered in the hello example is a good data point.

- **Agree**: Adding a comment to hello.gft to exercise comment lexing. Cheap and useful -- brings grammar coverage to 14/26.

- **Agree**: No shared `types/` directory at T1. Defer `SourceLocation` extraction to T2 when it is actually needed. This matches my YAGNI stance exactly.

- **Agree**: tsx over ts-node, NodeNext over Node16, shebang in index.ts. Same conclusions.

- **Disagree**: Pre-creating pipeline subdirectories (`src/lexer/`, `src/parser/`, etc.). Same critique as for A1. Empty directories are not useful. Create them when they get populated.

- **Disagree**: `declaration: true` and `sourceMap: true`. Same reasoning as above.

- **Partially disagree**: Including a `check` script (`"check": "tsc --noEmit"`). A4 includes this; I omitted it in Step 1. The argument for it: separate type-checking from building is useful in CI. The argument against: `tsc` (the build script) already type-checks. Running `tsc --noEmit` separately is redundant unless you want faster feedback (no emit step). At T1 scale, the build is instant anyway. I lean toward omitting it but acknowledge it becomes useful as the codebase grows. Low stakes either way.

## Revised Approach

After reviewing all agents, I revise my Step 1 proposal with the following changes:

**Kept from my original proposal (reinforced by other agents):**
- Minimal `src/index.ts` with shebang (all agents agree on shebang; A1 over-scopes the CLI setup)
- No vitest globals (universal consensus)
- No empty pipeline subdirectories (A4-Specialist agrees to defer; A1/A3 disagree but this is YAGNI)
- Minimal vitest.config.ts without coverage (A4 also minimal)
- `tsc`-only build (universal consensus)
- `.gitignore` (A3 correctly flagged this)

**Changed based on critiques:**
1. **Add `resolveJsonModule: true` to tsconfig.** Near-zero cost, prevents a future gotcha. A3 makes a reasonable case and A1/A4 include it. I concede this is worth the one line.
2. **Add a comment to hello.gft.** A4's point about exercising comment lexing is practical and cheap.
3. **Add NodeNext instead of Node16.** A1 and A4 both recommend this. Forward-compatible at zero cost. I should have caught this in Step 1.
4. **Consider adding `sourceMap: true`.** Three agents include it. My argument against (tiny codebase, not needed at T1) is technically correct but the cost is one config line and it helps from T2 onward when real code exists. Revised position: include it. The pragmatic thing is to avoid having to add it later and re-communicate the change.

**Explicitly rejected:**
- **tsx dependency**: Not needed at T1. Tests are the feedback loop. Add when manual CLI execution matters (T7).
- **`prepare` script**: Anti-pattern for development-phase projects. Slows down `npm install`.
- **`declaration: true`**: Still no use case. We are not a library.
- **Pre-creating empty directories**: Still YAGNI. T2 creates `src/lexer/` when it needs it.
- **Commander subcommand setup in index.ts**: T7's job. Speculative code that will be rewritten.

**Revised file list (7 files):**
1. `package.json` -- with `resolveJsonModule` acknowledged, NodeNext
2. `tsconfig.json` -- adds `resolveJsonModule: true`, `sourceMap: true`, switches to `NodeNext`
3. `vitest.config.ts` -- unchanged from Step 1
4. `src/index.ts` -- unchanged (shebang + console.log)
5. `tests/setup.test.ts` -- unchanged (single smoke test)
6. `examples/hello.gft` -- add a comment at the top
7. `.gitignore` -- unchanged

**Revised tsconfig.json:**
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
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Revised package.json:**
```json
{
  "name": "graft",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "graft": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Note: I keep commander as a dependency (declared now, used in T7) because it is already in the plan and removing it saves nothing meaningful. But index.ts does NOT import it yet -- that is T7's job.
