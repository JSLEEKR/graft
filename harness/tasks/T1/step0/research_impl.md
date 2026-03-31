# Implementation Research -- T1: Project Scaffolding

## Reference Implementations

1. **tsx (TypeScript Execute)** -- https://tsx.is/ -- Confidence: HIGH
   - 25x faster startup than ts-node (~20ms vs ~500ms), zero-config ESM support
   - No peer dependencies, powered by esbuild
   - Use for `dev` script: `tsx src/index.ts`

2. **tsup (TypeScript bundler)** -- https://www.npmjs.com/package/tsup -- Confidence: HIGH
   - Zero-config build tool, outputs ESM and CJS
   - Handles tree-shaking, TypeScript compilation, bundling
   - Use for `build` script: `tsup src/index.ts --format esm --dts`

3. **Commander.js v14** -- https://github.com/tj/commander.js -- Confidence: HIGH
   - Stable ESM + CJS dual support (v15 goes ESM-only, expected May 2026)
   - Native TypeScript types, subcommand pattern via `.command().action()`
   - Stick with v14 for maximum compatibility

4. **Vitest** -- https://vitest.dev/config/ -- Confidence: HIGH
   - Zero-config ESM + TypeScript support out of the box
   - Parallel test file execution by default, ideal for compiler test isolation

## Existing Code Compatibility

- **Interfaces**: No existing code -- this is T1 (greenfield scaffolding)
- **Naming conventions**: Spec uses PascalCase for types/nodes, snake_case for fields/properties
- **Output target**: `.claude/` directory structure (agents, hooks, settings.json, CLAUDE.md)

## Recommended Implementation Strategy

### package.json -- Confidence: HIGH

```jsonc
{
  "name": "graft",
  "version": "0.1.0",
  "type": "module",
  "bin": { "graft": "./dist/index.js" },
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit",
    "prepare": "npm run build"
  },
  "engines": { "node": ">=20" }
}
```

Reason: ESM-only (no CJS dual publishing needed -- this is a CLI tool, not a library). Node 20+ for stable ESM support.

### tsconfig.json -- Confidence: HIGH

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Reason: `NodeNext` module resolution is the correct choice for `"type": "module"` packages. ES2022 target gives modern features while staying broadly compatible.

### vitest.config.ts -- Confidence: HIGH

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

Reason: Vitest needs no special ESM configuration. `globals: true` enables `describe`/`it`/`expect` without imports. V8 coverage provider is fastest.

### Commander CLI pattern -- Confidence: HIGH

```typescript
import { Command } from 'commander';

const program = new Command();
program
  .name('graft')
  .description('Compile .gft files to Claude Code harness structures')
  .version('0.1.0');

program
  .command('compile')
  .argument('<file>', 'path to .gft file')
  .option('-o, --output <dir>', 'output directory', '.claude')
  .action(async (file, options) => { /* ... */ });

program
  .command('check')
  .argument('<file>', 'path to .gft file')
  .action(async (file) => { /* ... */ });

program.parse();
```

Reason: Simple flat subcommand pattern; no need for nested commands or standalone executables at v1.

### Dev execution: tsx -- Confidence: HIGH

Use `tsx` for development, `tsup` for production builds. Avoid ts-node entirely -- it requires complex ESM configuration and has slow startup. tsx is the ecosystem standard for running TypeScript directly in 2026.

## Warnings

1. **File extensions in imports**: With `"module": "NodeNext"`, TypeScript requires explicit `.js` extensions in import paths (e.g., `import { Lexer } from './lexer/index.js'`). This is correct -- Node resolves `.js` to `.ts` during development via tsx, and to actual `.js` after build.

2. **Commander v14 vs v15**: Pin to `commander@^14` in package.json. v15 (ESM-only, May 2026) may have breaking changes. Evaluate upgrade after release.

3. **Vitest + ESM**: No known compatibility issues. Vitest uses Vite's transform pipeline which handles ESM natively. No special flags needed.

4. **tsup shebang**: For the CLI `bin` entry to work, the built `dist/index.js` needs a `#!/usr/bin/env node` shebang. tsup supports this via the `--shims` flag or by adding a banner: `tsup src/index.ts --format esm --banner.js '#!/usr/bin/env node'`.
