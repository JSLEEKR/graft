# A2-Pragmatist Independent Analysis — v2.2-R5: npm Distribution + VS Code Extension

## Convergence Score: 8/10

## Key Positions
- Scoped name `@graft-lang/graft`, version 2.2.0
- `exports` with `.` (compiler) and `./ast` (AST types) sub-paths
- `files: ["dist/", "README.md", "LICENSE"]`
- `prepublishOnly: "npm run build && npm test"`
- .npmignore: src/, tests/, harness/, docs/, examples/, benchmarks/, editors/, tsconfig.json, vitest.config.ts, .claude/, .graft/
- VS Code extension: command-based ServerOptions (`command: 'graft-lsp'`), CJS output
- TextMate grammar: flat, all 35 keywords from tokens.ts, model names as constants
- Extension.ts: 17 lines, minimal LSP client
- Zero production code changes

## Files
- package.json (updated)
- .npmignore (new)
- README.md (badges added)
- LICENSE (new, MIT)
- editors/vscode/package.json
- editors/vscode/language-configuration.json
- editors/vscode/syntaxes/graft.tmGrammar.json
- editors/vscode/src/extension.ts
- editors/vscode/tsconfig.json
