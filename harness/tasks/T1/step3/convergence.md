# Convergence Report — T1: Project Scaffolding

## Summary

The converged implementation uses tsc-only build, ESM with `"type": "module"`, NodeNext module resolution, strict mode, explicit vitest imports (no globals), and a minimal src/index.ts with shebang but no Commander skeleton. Pipeline subdirectories are NOT pre-created; they will be created by the tasks that populate them (T2-T6). `declaration: true` and `sourceMap: true` are included as zero-cost defaults. tsx is deferred to T7. Commander is listed as a dependency but not imported until T7. The .gitignore is updated to add `*.tsbuildinfo`. A smoke test proves the toolchain works.

## Forced Dissent Rulings

A4-Specialist was the forced dissenter (tied at 8/10 with A1 and A2; assigned by orchestrator).

| Argument | Ruling | Basis |
|----------|--------|-------|
| Over-reliance on "textbook-correct" -- Graft is a transpiler/template generator, not a traditional compiler; the lexer->parser->analyzer->codegen pipeline may be over-engineered | **Reject** | The pipeline decomposition is already locked by the implementation plan and user decision. The decomposition provides clear separation of concerns even for a transpiler. A4 themselves rated this rebuttal 6/10 strength. The pipeline structure is the right call for testability and maintainability. |
| Grammar coverage table is irrelevant to T1 | **Accept** | Correct. The 13/26 coverage analysis is useful reference material for T2-T6 but has zero bearing on T1 decisions (config files and directory structure). |
| Pre-creating pipeline subdirectories may be wrong -- speculative architecture that anchors developers prematurely | **Accept** | A2's "flat until forced" argument wins. Empty directories are not tracked by git without .gitkeep files. Creating them signals architectural certainty that does not yet exist. The cost of `mkdir` at T2-T6 is zero. The cost of premature anchoring is real. |
| NodeNext vs Node16 is a distraction -- functionally identical today | **Accept (partially)** | The technical difference is indeed zero today. However, all agents converge on NodeNext as the forward-compatible signal. We use NodeNext but acknowledge this is cosmetic, not substantive. |
| SourceLocation type discussion is premature | **Accept** | No code at T1 uses source locations. This is deferred to T2. |
| Missing practical concerns (CRLF, .gitignore, npm link) were overlooked due to domain lens | **Accept** | Valid self-critique. The practical concerns (identified by A3) matter more for T1 than theoretical compiler architecture. |

## Per-Agent Accept/Reject

### A1-Architect
- **Accepted**: NodeNext module resolution -- forward-compatible at zero cost, unanimous support
- **Accepted**: No barrel exports -- correct for compiler projects with cross-cutting dependencies
- **Accepted**: tsc-only build -- no bundling needed at v1
- **Accepted**: No vitest globals -- explicit imports are self-documenting
- **Accepted**: Shebang in index.ts from day one -- all agents agree
- **Accepted**: `sourceMap: true` -- zero cost, prevents debugging friction from T2 onward
- **Accepted**: `declaration: true` -- free type-checking bonus per A3's analysis (catches inexpressible types)
- **Accepted**: `check` script (`tsc --noEmit`) -- faster type-checking without build, useful as codebase grows
- **Accepted**: Rename `analyzer/tokens.ts` to `analyzer/estimator.ts` (noted for T5, not T1)
- **Rejected**: tsx as T1 dev dependency -- A2's argument wins: vitest handles TS for tests, manual runs use `tsc && node dist/index.js`. Defer tsx to T7
- **Rejected**: Pre-create pipeline subdirectories -- YAGNI per A2
- **Rejected**: Commander skeleton in index.ts -- T7 scope; placeholder code will be rewritten
- **Rejected**: Duplicate `graft` and `dev` scripts -- unnecessary redundancy

### A2-Pragmatist
- **Accepted**: No tsx at T1 -- vitest is the feedback loop, not manual CLI runs
- **Accepted**: No pre-created subdirectories -- "the task that needs the directory creates it"
- **Accepted**: Minimal vitest.config.ts without coverage -- add coverage when there is code to measure
- **Accepted**: No `prepare` script -- anti-pattern for development-phase projects
- **Accepted**: Shebang + console.log as minimal index.ts -- honest about what T1 delivers
- **Accepted**: Smoke test (tests/setup.test.ts) proving vitest works
- **Rejected**: `declaration: false` -- A3 correctly argues declarations catch type errors that `false` misses. Zero cost to include
- **Rejected**: `sourceMap: false` -- three agents argue for inclusion; zero cost prevents friction at T2
- **Rejected**: No `check` script -- A1's argument for separate type-checking vs building is sound

### A3-Skeptic
- **Accepted**: ts-node is broken (HIGH severity) -- all agents agree
- **Accepted**: `.gitignore` must include `*.tsbuildinfo` -- overlooked by other agents
- **Accepted**: `forceConsistentCasingInFileNames: true` -- essential for Windows-to-Linux portability
- **Accepted**: `skipLibCheck: true` -- prevents dependency type errors
- **Accepted**: Explicit vitest imports over globals -- unanimous
- **Accepted**: `declaration: true` -- catches inexpressible-type errors
- **Accepted**: `sourceMap: true` -- zero cost, real debugging benefit
- **Accepted**: CRLF shebang warning -- real cross-platform risk (addressed via .gitattributes)
- **Rejected**: `prepare` script -- A2 and A1 convince that this is premature at T1
- **Rejected**: `resolveJsonModule: true` -- A3's own revised position drops this due to the rootDir/outDir path resolution footgun. YAGNI applies; add at T7 if needed

### A4-Specialist
- **Accepted**: Grammar coverage analysis of hello.gft -- useful reference for T2-T6
- **Accepted**: Add comment to hello.gft -- exercises comment lexing at zero cost
- **Accepted**: NodeNext module resolution -- forward-compatible
- **Accepted**: Snapshot testing recommendation for codegen (noted for T6)
- **Accepted**: .gitattributes for CRLF protection -- practical fix for the shebang portability issue
- **Rejected**: Pre-create pipeline subdirectories -- YAGNI wins despite architectural signal argument
- **Rejected**: `declaration: false` (revised position) -- overruled by A3's type-checking argument

## Implementation Spec

### File List
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `tests/setup.test.ts`
- Create: `examples/hello.gft`
- Modify: `.gitignore` (add `*.tsbuildinfo`)
- Create: `.gitattributes`

### Implementation Code

#### `package.json`

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
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0"
  }
}
```

Rationale:
- `commander` is a runtime dependency declared now (plan requires it, cost is near-zero) but not imported until T7
- No tsx -- vitest handles TS for tests; manual runs use `tsc && node dist/index.js`
- No `prepare` script -- premature for development phase
- No `exports` field -- this is a CLI tool, not a library
- `check` script for fast type-checking without build
- No `dev` script -- no tsx to run it with; add at T7

#### `tsconfig.json`

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
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Rationale:
- `NodeNext` -- forward-compatible, unanimous consensus
- `strict: true` -- non-negotiable for a compiler project
- `isolatedModules: true` -- required for esbuild-based tools (tsx, vitest)
- `declaration: true` -- free type-checking bonus (catches inexpressible types)
- `sourceMap: true` -- zero cost, prevents debugging friction from T2 onward
- `skipLibCheck: true` -- prevents dependency type errors from blocking compilation
- `forceConsistentCasingInFileNames: true` -- essential for Windows-to-Linux portability
- No `resolveJsonModule` -- YAGNI, and rootDir/outDir split makes JSON imports resolve incorrectly at runtime
- No `types` array -- no vitest globals to register

#### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

Rationale:
- No `globals: true` -- explicit vitest imports preferred (unanimous consensus)
- No coverage config -- deferred until there is code to measure (T2+)
- Minimal config; vitest handles ESM + TypeScript natively

#### `src/index.ts`

```typescript
#!/usr/bin/env node
console.log('graft v0.1.0');
```

Rationale:
- Shebang from day one (unanimous consensus) -- required for `bin` field to work on Unix
- No Commander setup -- T7 scope; placeholder code would be rewritten
- Version string validates the entry point runs and matches package.json version
- Two lines. Honest about what T1 delivers.

#### `examples/hello.gft`

```graft
// SimpleQA: a two-node pipeline that researches a question and writes an answer

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

Rationale:
- Verbatim from the implementation plan spec
- Comment line added per A4's recommendation -- exercises comment lexing, brings grammar coverage to 14/26
- This file is the integration test fixture for the entire compiler pipeline (T2-T8)

#### `.gitignore` update

Add `*.tsbuildinfo` to the existing `.gitignore`. The existing file already has `node_modules/` and `dist/`.

```
*.tsbuildinfo
```

#### `.gitattributes` (new file)

```
# Ensure LF line endings for TypeScript files
# Prevents CRLF shebang bug: #!/usr/bin/env node\r fails on Unix
*.ts text eol=lf
*.js text eol=lf
```

Rationale:
- A3 identified the CRLF shebang portability bomb (the project is developed on Windows)
- A4 recommended .gitattributes over tsconfig `newLine` as more targeted
- Prevents `#!/usr/bin/env node\r` which fails with `env: 'node\r': No such file or directory` on Unix

### Test Code

#### `tests/setup.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('project scaffolding', () => {
  it('vitest can run TypeScript tests', () => {
    // Proves vitest + TypeScript + ESM pipeline is wired correctly
    const x: number = 42;
    expect(x).toBe(42);
  });

  it('package.json is valid and has correct type', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(pkg.name).toBe('graft');
    expect(pkg.type).toBe('module');
    expect(pkg.bin.graft).toBe('./dist/index.js');
  });

  it('tsconfig.json has strict mode enabled', () => {
    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
  });

  it('example .gft file exists', () => {
    const content = readFileSync('examples/hello.gft', 'utf-8');
    expect(content).toContain('context UserRequest');
    expect(content).toContain('node Researcher');
    expect(content).toContain('graph SimpleQA');
  });

  it('tsc compiles without errors', () => {
    // This is the real smoke test: does the full toolchain work?
    const result = execSync('npx tsc --noEmit', { encoding: 'utf-8' });
    // tsc --noEmit produces no output on success
    expect(result.trim()).toBe('');
  });
});
```

Rationale:
- Explicit vitest imports (no globals) -- unanimous consensus
- Tests validate: vitest works, config files are correct, example exists, tsc compiles
- The `tsc --noEmit` test is the critical smoke test -- it proves the entire TypeScript toolchain is wired correctly
- This file is a scaffolding validation test; it will be supplemented (not replaced) by T2+ tests

### Verification Commands

```bash
# 1. Create directories
mkdir -p src tests examples

# 2. Create all files (package.json, tsconfig.json, vitest.config.ts, src/index.ts, tests/setup.test.ts, examples/hello.gft, .gitattributes)
# (implementer writes files as specified above)

# 3. Update .gitignore -- append *.tsbuildinfo

# 4. Install dependencies
npm install

# 5. Verify tsc compiles
npx tsc --noEmit
# Expected: no output (success)

# 6. Verify build produces output
npm run build
# Expected: dist/index.js created with shebang preserved

# 7. Verify built entry point runs
node dist/index.js
# Expected output: graft v0.1.0

# 8. Run tests
npm test
# Expected: all tests pass (5 tests in 1 file)

# 9. Verify shebang is preserved in build output
head -1 dist/index.js
# Expected: #!/usr/bin/env node
```

## Ratchet-Locked Items

- **Build tool**: tsc only (no tsup, no esbuild) -- Status: LOCKED
- **Module system**: ESM with `"type": "module"` -- Status: LOCKED
- **Module resolution**: NodeNext -- Status: LOCKED
- **Vitest globals**: disabled; use explicit imports (`import { describe, it, expect } from 'vitest'`) -- Status: LOCKED
- **Shebang**: `#!/usr/bin/env node` in `src/index.ts` from T1 -- Status: LOCKED
- **forceConsistentCasingInFileNames**: true -- Status: LOCKED
- **strict**: true -- Status: LOCKED
- **ts-node**: DO NOT USE -- broken with ESM on Node 22+ -- Status: LOCKED (failed approach)
- **Barrel exports**: DO NOT USE for internal modules -- direct imports only -- Status: LOCKED
- **Import extensions**: `.js` extensions required in all relative imports (NodeNext requirement) -- Status: LOCKED

## Convergence Metrics
- Final convergence score: 9
- Unresolved issues:
  - `resolveJsonModule` -- omitted now (YAGNI + rootDir/outDir footgun), may be needed at T7 for version string import. Revisit at T7.
  - tsx dev dependency -- deferred to T7 when manual CLI execution matters
  - `analyzer/tokens.ts` rename to `analyzer/estimator.ts` -- noted for T5, no action at T1
- Notes for next task:
  - T2 must create `src/lexer/` directory when it populates it
  - All imports must use `.js` extensions (NodeNext requirement) -- this is a common stumble
  - The `errors/diagnostics.ts` module must remain dependency-free (leaf in the DAG) to prevent circular dependencies
  - Consider snapshot testing (`toMatchSnapshot()`) for codegen output at T6
