# Convergence Report — v2.2-R5: npm Distribution + VS Code Extension

## Process Notes
- MEDIUM tier: 2 agents (A2-Pragmatist, A3-Skeptic)
- Score range: 8-7 = 1 → cross-critique SKIPPED (R-PROC-01 threshold = 2)
- Step 0: SKIPPED (configuration work — RP-02)

## Adopted Approach

Both agents agree on all fundamentals. A3's corrections (comment syntax, no escape sequences, k-integer priority) are adopted as constraints on A2's proposal.

**Zero production code changes.** This round is pure packaging and configuration.

---

## 1. package.json Updates

```json
{
  "name": "@graft-lang/graft",
  "version": "2.2.0",
  "description": "Graft compiler — compile .gft graph DSL to Claude Code harness structures",
  "type": "module",
  "license": "MIT",
  "author": "JSLEEKR",
  "repository": {
    "type": "git",
    "url": "https://github.com/JSLEEKR/graft.git"
  },
  "keywords": ["graft", "compiler", "dsl", "llm", "claude", "graph"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./ast": {
      "import": "./dist/parser/ast.js",
      "types": "./dist/parser/ast.d.ts"
    }
  },
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "bin": {
    "graft": "./dist/index.js",
    "graft-lsp": "./dist/lsp/server.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "tsc --noEmit",
    "bench": "npx tsx benchmarks/run.ts",
    "prepublishOnly": "npm run build && npm test"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "commander": "^14.0.0",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

**Key decisions:**
- `@graft-lang/graft` scoped name (A2)
- `exports` with `.` and `./ast` sub-paths (A2)
- `files` array limits npm package to dist/, README.md, LICENSE (A2)
- `prepublishOnly` script instead of `prepublish` (A2)
- `graft-lsp` bin entry preserved from R4 (A3 critical finding)

## 2. .npmignore (new file)

```
src/
tests/
harness/
docs/
examples/
benchmarks/
editors/
tsconfig.json
vitest.config.ts
.claude/
.graft/
```

Defense-in-depth alongside `files` (A3 accepts this).

## 3. LICENSE (new file)

MIT license, copyright JSLEEKR.

## 4. README.md Badges

Add to top of existing README.md:

```markdown
[![npm version](https://img.shields.io/npm/v/@graft-lang/graft.svg)](https://www.npmjs.com/package/@graft-lang/graft)
[![Node.js](https://img.shields.io/node/v/@graft-lang/graft.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
```

## 5. VS Code Extension

### editors/vscode/package.json

```json
{
  "name": "graft-lang",
  "displayName": "Graft",
  "description": "Language support for Graft (.gft) files",
  "version": "0.1.0",
  "publisher": "graft-lang",
  "license": "MIT",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Programming Languages"],
  "activationEvents": ["onLanguage:graft"],
  "main": "./out/extension.js",
  "contributes": {
    "languages": [{
      "id": "graft",
      "aliases": ["Graft", "gft"],
      "extensions": [".gft"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "graft",
      "scopeName": "source.graft",
      "path": "./syntaxes/graft.tmGrammar.json"
    }]
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.1"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.8.0"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w"
  }
}
```

### editors/vscode/language-configuration.json

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"", "notIn": ["string"] }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""]
  ]
}
```

**A3 correction applied**: comment syntax is `//` and `/* */`, NOT `#`.

### editors/vscode/syntaxes/graft.tmGrammar.json

```json
{
  "scopeName": "source.graft",
  "patterns": [
    { "include": "#comments" },
    { "include": "#strings" },
    { "include": "#k-integers" },
    { "include": "#floats" },
    { "include": "#integers" },
    { "include": "#keywords" },
    { "include": "#type-keywords" },
    { "include": "#domain-types" },
    { "include": "#constants" },
    { "include": "#operators" }
  ],
  "repository": {
    "comments": {
      "patterns": [
        {
          "name": "comment.line.double-slash.graft",
          "match": "//.*$"
        },
        {
          "name": "comment.block.graft",
          "begin": "/\\*",
          "end": "\\*/"
        }
      ]
    },
    "strings": {
      "name": "string.quoted.double.graft",
      "begin": "\"",
      "end": "\""
    },
    "k-integers": {
      "name": "constant.numeric.k-integer.graft",
      "match": "\\b\\d+[kK]\\b"
    },
    "floats": {
      "name": "constant.numeric.float.graft",
      "match": "\\b\\d+\\.\\d+\\b"
    },
    "integers": {
      "name": "constant.numeric.integer.graft",
      "match": "\\b\\d+\\b"
    },
    "keywords": {
      "name": "keyword.control.graft",
      "match": "\\b(node|edge|graph|context|reads|produces|tools|budget|model|select|filter|drop|compact|truncate|when|else|done|on_failure|retry|fallback|skip|abort|input|output|max_tokens|enum|parallel|foreach|as|max_iterations|import|from|memory|writes|storage)\\b"
    },
    "type-keywords": {
      "name": "support.type.graft",
      "match": "\\b(String|Int|Float|Bool|List|Map|Optional|TokenBounded)\\b"
    },
    "domain-types": {
      "name": "support.type.domain.graft",
      "match": "\\b(FilePath|FileDiff|TestFile|IssueRef)\\b"
    },
    "constants": {
      "name": "constant.language.graft",
      "match": "\\b(true|false)\\b"
    },
    "operators": {
      "name": "keyword.operator.graft",
      "match": "->|\\||>=|<=|==|!=|\\.\\.|>|<"
    }
  }
}
```

**Key decisions:**
- k-integers BEFORE integers (A3: priority ordering)
- No escape sequences in strings (A3: lexer has none)
- `//` and `/* */` comments only (A3: NOT `#`)
- Underscore keywords enumerated explicitly: `on_failure`, `max_tokens`, `max_iterations` (A3)
- All 35 lowercase keywords from KEYWORDS map
- Type keywords separate scope (`support.type`) from control keywords (`keyword.control`)
- Domain types in their own scope
- `true`/`false` as `constant.language`
- Flat grammar, no nested scopes (A2)

### editors/vscode/src/extension.ts

```typescript
import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverOptions: ServerOptions = {
    command: 'graft-lsp',
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'graft' }],
  };
  client = new LanguageClient('graft', 'Graft Language Server', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

**Key decisions:**
- Command-based ServerOptions — requires `graft-lsp` on PATH (A2, A3)
- ~17 lines, minimal (A2)
- Unused `path` import removed from A2's proposal

### editors/vscode/tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**CJS output** — VS Code extensions require CommonJS (A2).

---

## Files Summary

| File | Action | Lines |
|------|--------|-------|
| package.json | UPDATE | ~40 |
| .npmignore | NEW | ~11 |
| LICENSE | NEW | ~21 |
| README.md | UPDATE | +3 badge lines |
| editors/vscode/package.json | NEW | ~35 |
| editors/vscode/language-configuration.json | NEW | ~20 |
| editors/vscode/syntaxes/graft.tmGrammar.json | NEW | ~75 |
| editors/vscode/src/extension.ts | NEW | ~17 |
| editors/vscode/tsconfig.json | NEW | ~12 |

## Tests

Per plan (R-PROC-06: ~4 tests):
1. `npm pack --dry-run` includes correct files (dist/, README.md, LICENSE)
2. `npm pack --dry-run` excludes dev files (src/, tests/, harness/)
3. VS Code extension package.json has required fields
4. TextMate grammar is valid JSON with all keywords

These are infrastructure tests, not unit tests. The implementer should add them to `tests/packaging.test.ts`.

## Ratchet-Locked Items (new)

- [v2.2-R22] npm: @graft-lang/graft scoped name, exports with ./ast sub-path — LOCKED
- [v2.2-R23] npm: files array (dist/, README.md, LICENSE) + .npmignore defense-in-depth — LOCKED
- [v2.2-R24] VS Code: command-based ServerOptions (graft-lsp on PATH), CJS output — LOCKED
- [v2.2-R25] TextMate: // and /* */ comments only, no escape sequences, k-integer before integer — LOCKED

## Forced Dissent Resolution

N/A — cross-critique skipped (score range = 1).

## Agent Contribution Summary

- **A2-Pragmatist (8/10)**: Provided complete file specs for all 9 files. Clean minimal approach.
- **A3-Skeptic (7/10)**: Caught 3 correctness issues (comment syntax, escape sequences, k-integer priority) and 1 completeness issue (graft-lsp bin preservation). All adopted.
