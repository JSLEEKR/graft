# A1-Architect Independent Analysis -- T1

## Proposed Implementation

### Key Design Decisions

- **Decision 1: tsx over ts-node for dev execution** -- The implementation plan uses `ts-node` with `--loader` flag. This is a deviation I strongly recommend. tsx is faster (~20ms vs ~500ms startup), zero-config, and handles ESM without loader flags. The `dev` script becomes simply `tsx src/index.ts`. Reason: developer ergonomics matter for a tool you run hundreds of times during development.

- **Decision 2: tsc-only build (not tsup) for v1** -- The implementation plan uses `tsc` for build, which I agree with. The research_impl.md suggests tsup, but for a CLI tool at v1 there is no need for bundling. tsc produces debuggable output with source maps, and the dependency count stays minimal. Reason: simplicity; defer bundling until distribution size or startup time is a measured problem.

- **Decision 3: NodeNext over Node16 for module resolution** -- The plan uses `"module": "Node16"`. I recommend `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` instead. NodeNext tracks the latest Node.js ESM semantics and is the forward-compatible choice. Node16 is functionally equivalent today but will not pick up future improvements. Reason: future-proofing with zero cost.

- **Decision 4: No barrel exports (index.ts re-exports) for internal modules** -- Each pipeline stage directory (lexer/, parser/, etc.) should NOT have an index.ts that re-exports everything. Imports should be direct: `import { Token } from '../lexer/tokens.js'`. Barrel files cause circular dependency issues and make the dependency graph opaque. Reason: compiler projects have cross-cutting dependencies (errors module imported everywhere); keeping imports explicit prevents cycles.

- **Decision 5: Separate compiler.ts orchestrator file** -- The plan's T7 creates `src/compiler.ts`. I want to call out that this should be planned from the start in the directory structure. The orchestrator is the glue between pipeline stages and should be a top-level src/ file, not nested inside any stage directory. Reason: clear separation between pipeline stages and orchestration.

- **Decision 6: vitest globals disabled** -- The research_impl.md suggests `globals: true` in vitest config. I recommend against this. Explicit imports (`import { describe, it, expect } from 'vitest'`) make test files self-documenting and avoid polluting the global scope. This also eliminates the need for `"types": ["vitest/globals"]` in tsconfig. Reason: explicitness over magic, especially in a compiler project where precision matters.

- **Decision 7: Source map enabled** -- The implementation plan includes `"sourceMap": true` in tsconfig. This is correct and should be kept. Reason: stack traces during development and testing should point to .ts files, not compiled .js.

### Code Structure

#### Directory Structure (T1 creates skeleton, T2-T8 populate)

```
graft/
├── src/
│   ├── index.ts              # CLI entry point (shebang + commander setup)
│   ├── compiler.ts           # Pipeline orchestrator (placeholder until T7)
│   ├── lexer/
│   │   ├── tokens.ts         # Token type definitions
│   │   └── lexer.ts          # Tokenizer
│   ├── parser/
│   │   ├── ast.ts            # AST type definitions
│   │   └── parser.ts         # Recursive descent parser
│   ├── analyzer/
│   │   ├── scope.ts          # Scope checker (Pass 1)
│   │   ├── types.ts          # Type checker (Pass 2)
│   │   └── tokens.ts         # Token estimator (Pass 3)
│   ├── codegen/
│   │   ├── codegen.ts        # Main code generator orchestrator
│   │   ├── agents.ts         # Node -> agent .md
│   │   ├── hooks.ts          # Edge -> hook .sh
│   │   ├── orchestration.ts  # Graph -> CLAUDE.md
│   │   └── settings.ts       # settings.json generation
│   └── errors/
│       └── diagnostics.ts    # Error types + formatting with source locations
├── tests/
│   ├── lexer.test.ts
│   ├── parser.test.ts
│   ├── analyzer.test.ts
│   ├── codegen.test.ts
│   └── integration.test.ts
├── examples/
│   ├── hello.gft             # Minimal working example
│   └── review.gft            # More complex example (future)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore                # dist/, node_modules/, .graft/
```

#### package.json

```json
{
  "name": "graft",
  "version": "0.1.0",
  "description": "Compile .gft files to Claude Code harness structures",
  "type": "module",
  "bin": {
    "graft": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit",
    "graft": "tsx src/index.ts"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^22.0.0"
  }
}
```

Key points:
- `"graft"` script uses tsx for quick iteration: `npm run graft -- compile hello.gft`
- `"dev"` is an alias for the same thing
- `"check"` runs type checking without emitting -- useful in CI
- No `"prepare"` hook yet -- premature for v1 development phase
- Commander pinned to v14 (v15 ESM-only release expected May 2026, avoid early adoption risk)

#### tsconfig.json

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
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key points:
- `isolatedModules: true` -- ensures compatibility with esbuild/tsx which do single-file transforms
- `forceConsistentCasingInFileNames: true` -- prevents cross-platform import bugs (Windows is case-insensitive, Linux is not)
- `declaration: true` -- generates .d.ts files, useful if Graft is ever consumed as a library
- No `"types"` array -- avoids restricting ambient type availability

#### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

Key points:
- No `globals: true` -- explicit imports preferred
- Coverage configured but optional to run (`vitest run --coverage`)
- `src/index.ts` excluded from coverage since it is CLI glue code

#### src/index.ts (minimal placeholder)

```typescript
#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('graft')
  .description('Compile .gft files to Claude Code harness structures')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile a .gft file to .claude/ structure')
  .argument('<file>', 'path to .gft source file')
  .option('-o, --output <dir>', 'output directory', '.')
  .action(async (file: string, options: { output: string }) => {
    console.log(`TODO: compile ${file} -> ${options.output}`);
  });

program
  .command('check')
  .description('Check a .gft file without generating output')
  .argument('<file>', 'path to .gft source file')
  .action(async (file: string) => {
    console.log(`TODO: check ${file}`);
  });

program.parse();
```

Key points:
- Shebang line preserved by tsc in output
- Two subcommands matching the spec: `compile` and `check`
- Default output directory is `.` (current directory), not `.claude/` -- the codegen will create `.claude/` within that directory
- Actions are async to support future file I/O without refactoring

#### examples/hello.gft

```graft
// Hello World example for Graft compiler
// A simple Q&A pipeline: Researcher finds information, Writer produces an answer

context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]

  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]

  produces Answer {
    response: String
  }
}

edge Researcher -> Writer
  | select(findings)
  | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

Matches the spec's hello.gft exactly, with added comments for documentation.

### Scalability to T2-T8

| Task | Impact on Scaffolding | Concern |
|------|----------------------|---------|
| T2 (Lexer) | Populates `src/lexer/`, `tests/lexer.test.ts` | None -- directory exists |
| T3 (AST) | Populates `src/parser/ast.ts` | None -- directory exists |
| T4 (Parser) | Populates `src/parser/parser.ts` | Imports from lexer via direct path -- clean |
| T5 (Analyzer) | Populates `src/analyzer/` (3 files) | Imports from parser and errors -- direct paths prevent cycles |
| T6 (CodeGen) | Populates `src/codegen/` (5 files) | Imports from parser/ast -- one-directional dependency |
| T7 (CLI + Pipeline) | Populates `src/compiler.ts`, wires CLI | Orchestrator imports all stages -- fan-in at top level |
| T8 (E2E) | Adds integration tests | Test infrastructure already configured |

The dependency direction is strictly layered:
```
errors (leaf -- no imports from other src/ modules)
  ^
lexer (imports: errors)
  ^
parser (imports: lexer, errors)
  ^
analyzer (imports: parser, errors)
  ^
codegen (imports: parser, errors)
  ^
compiler (imports: all stages)
  ^
index (imports: compiler, commander)
```

This DAG has no cycles. The `errors` module is the leaf dependency. No stage imports from a downstream stage.

### Trade-offs

**Pros:**
- Clean layered architecture with explicit dependency direction
- tsx provides fast development iteration without complex loader configuration
- tsc-only build keeps the toolchain minimal and debuggable
- No barrel exports eliminates circular dependency risk
- Vitest without globals keeps test files explicit and self-contained
- NodeNext module resolution is forward-compatible
- Directory structure maps 1:1 to the compiler pipeline mental model

**Cons:**
- Import paths with `.js` extensions are unfamiliar to some TS developers (required by NodeNext)
- No bundling means slightly slower CLI cold start (multiple file resolution)
- Explicit vitest imports add 1 line of boilerplate per test file
- tsx is an additional dev dependency (though lightweight at ~2MB)

### Potential Issues

- **Issue 1: .js extension in imports** -- Trigger: any developer writing `import { X } from './foo'` instead of `import { X } from './foo.js'`. Impact: runtime error "Cannot find module". Mitigation: ESLint rule or convention established in common_memory after T1.

- **Issue 2: Naming collision in analyzer/** -- The spec has `src/analyzer/tokens.ts` (token estimator) and `src/lexer/tokens.ts` (token type definitions). These are different files with the same basename. Impact: confusion during development, ambiguous in error messages. Mitigation: rename `src/analyzer/tokens.ts` to `src/analyzer/estimator.ts` to disambiguate. This is a deviation from the spec's project structure but improves clarity.

- **Issue 3: Windows path handling** -- The project is developed on Windows (OneDrive path). File paths in codegen output (`.claude/` structure) must use forward slashes. Impact: generated hook scripts may have broken paths on Linux. Mitigation: use `path.posix` or normalize paths in codegen (T6 concern, but worth noting now).

- **Issue 4: Shebang on Windows** -- `#!/usr/bin/env node` has no effect on Windows. The `bin` field in package.json works via npm's shim scripts on Windows. Impact: none for npm-installed usage, but `node dist/index.js` works cross-platform regardless.

## Self-Assessment
- Convergence score: 8 -- high confidence in this approach
- Basis: The scaffolding closely follows the implementation plan and research findings with only targeted, well-justified deviations (tsx over ts-node, NodeNext over Node16, rename analyzer/tokens.ts). The directory structure maps directly to the spec's architecture. The main uncertainty is whether to include tsup for builds (I say no for v1, but reasonable people could disagree) and the vitest globals question (minor either way).
