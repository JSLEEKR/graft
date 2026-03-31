# A2-Pragmatist Independent Analysis -- T1

## Proposed Implementation
### Core Principles
- **YAGNI**: No tsup, no tsx, no ts-node. tsc builds. `node --import` runs TS in dev via vitest's transform. Zero extra dev tooling.
- **Flat until forced**: Create only the directories we need *right now* (T1). Empty directories are noise.
- **Working in 60 seconds**: After `npm install`, `npx vitest run` must pass at least one test.
- **No speculative config**: Every line in every config file must be justified by something T1 actually needs.

### Code

#### package.json

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

**What I removed vs research_impl.md:**
- No `tsx` dependency. We don't need a dev runner for T1. `vitest` handles running TS directly for tests. For manual testing, `npx tsc && node dist/index.js` is fine.
- No `tsup`. `tsc` is sufficient. We are not publishing to npm, not optimizing startup, not bundling. tsc outputs readable JS to `dist/`. Done.
- No `"exports"` field. This is a CLI tool, not a library. `"bin"` is all we need.
- No `"prepare"` script. We are not publishing. Don't auto-build on install.
- No `"check"` script. `tsc` with no `--noEmit` already type-checks during build. Running `tsc --noEmit` separately is redundant unless you want type-checking without building, which is a luxury for T1.

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": false,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**What I changed vs the implementation plan:**
- `declaration: false`. We are not publishing type definitions. Nobody imports from graft as a library. Add this back if/when we publish.
- `sourceMap: false`. Source maps are useful for debugging stack traces, but at T1 the codebase is tiny and errors are obvious. Add back when debugging becomes painful.
- Added `skipLibCheck`, `forceConsistentCasingInFileNames`, `isolatedModules` -- these are standard and prevent real issues (case sensitivity on Windows especially relevant here).
- No `resolveJsonModule`. We don't import JSON files.
- No `"types": ["vitest/globals"]`. We won't use vitest globals (see vitest config below).

#### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

**What I removed:**
- No `globals: true`. Explicit `import { describe, it, expect } from 'vitest'` is better -- it makes test files self-contained and avoids needing `"types": ["vitest/globals"]` in tsconfig. Three extra words per test file is a trivial cost.
- No coverage config. Coverage is not a T1 deliverable. Add it when we have enough code to measure.

#### src/index.ts

```typescript
#!/usr/bin/env node
console.log('graft');
```

That's it. Two lines. The shebang is there so `bin` works after build. The console.log proves the entry point runs. Commander setup is T7's job.

#### tests/setup.test.ts

```typescript
import { describe, it, expect } from 'vitest';

describe('project setup', () => {
  it('should be able to run tests', () => {
    expect(true).toBe(true);
  });
});
```

One test. Proves vitest works. This file gets deleted or replaced by T2's real tests. Its only purpose is to make `npx vitest run` report green on T1.

#### examples/hello.gft

```graft
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

Copied verbatim from the implementation plan. This is the test fixture for the entire compiler. It must exist from T1.

#### Directory structure

```
mkdir -p src tests examples
```

**What I did NOT create:**
- No `src/lexer/`, `src/parser/`, `src/analyzer/`, `src/codegen/`, `src/errors/`. These are T2-T6 concerns. Creating empty directories is cargo-culting. The task that needs the directory creates it.

#### .gitignore (if not already present)

```
node_modules/
dist/
```

### Changes vs Implementation Plan Code
- **Removed tsx/ts-node**: Not needed. Vitest runs TS natively, and `tsc && node dist/index.js` works for manual runs.
- **Removed tsup**: tsc is sufficient for a CLI that isn't published yet.
- **Removed empty subdirectories**: src/lexer/ etc. are T2+ concerns. Don't create what you don't use.
- **Removed declaration/sourceMap**: Not needed until publishing or complex debugging.
- **Removed vitest globals**: Explicit imports are cleaner and need less config.
- **Removed coverage config**: Not a T1 deliverable.
- **Removed `"exports"` field**: This is a CLI, not a library.
- **Kept `"type": "module"`**: Non-negotiable for ESM.
- **Kept strict mode**: Non-negotiable for a compiler.
- **Kept commander dependency**: Needed eventually (T7), and declaring it now is cheap. However, if being maximally pragmatic, we could defer this to T7 too. I include it because the plan lists it and removing a dependency install doesn't save meaningful time.
- **Kept examples/hello.gft**: This is the integration test fixture. It drives the entire compiler design. Must exist from day one.

### Trade-offs
- **Pros:**
  - Fewest possible files (6: package.json, tsconfig.json, vitest.config.ts, src/index.ts, tests/setup.test.ts, examples/hello.gft)
  - Fewest possible dependencies (3 dev deps + 1 runtime dep)
  - `npm install && npx vitest run` works immediately
  - `npm run build && node dist/index.js` works immediately
  - No config that needs to be understood, maintained, or debugged
  - Every file has a clear reason to exist at T1

- **Cons:**
  - No tsx for quick dev iteration (must build first to run manually). This is fine -- tests are the primary feedback loop, and vitest handles TS directly.
  - No source maps (stack traces show dist/ line numbers). Acceptable at T1 scale.
  - No type declarations (can't import graft as a library). Not a use case.
  - Empty test is a placeholder -- but that's the point; T2 replaces it with real tests.

## Self-Assessment
- Convergence score: 8
- Basis: The research findings (arch + impl) already converge on tsc-only for v1, ESM, strict mode, and a simple vitest config. My proposal aligns with that consensus but pushes further on minimalism (no tsx, no declaration, no coverage, no empty dirs). The only likely debate points are: (1) whether to include tsx for dev convenience, and (2) whether to pre-create the pipeline subdirectories. Both are defensible either way but neither is load-bearing for T1 correctness.
