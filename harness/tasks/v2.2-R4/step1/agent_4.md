# A4-Specialist Independent Analysis — v2.2-R4: LSP Server

## Convergence Score: 8/10

## Key Positions

- **Four-file split**: server.ts + diagnostics.ts + hover.ts + definition.ts + utils.ts — mirrors compiler structure
- **typeExprToString**: Exhaustive recursive pretty-printer for TypeExpr → readable string
- **Regex word extraction**: Context-free identifier grammar makes regex equivalent to re-lexing
- **Reuse compile()**: Don't build separate check() — <10ms, single maintenance path
- **Cache per-URI**: Essential for hover/definition when current edit has syntax errors
- **Manual URI conversion**: Avoid vscode-uri dep, but note as convergence question
- **Go-to-definition covers**: contexts, nodes, produces (via producesNodeMap), memories
- **Hover shows**: toLocaleString('en-US') for max_tokens display, produces fields

## Compiler Design Rationale
- LSP = demand-driven query interface over compiler's static analysis
- ProgramIndex = symbol table, hover/definition = symbol table queries
- Existing parser is throw-on-first-error → no AST after first syntax error (known limitation)
- Field-level go-to-definition (Research.findings → findings field) is out of MVP scope

## Trade-offs
- 4-file split: more files but matches compiler module structure and individually testable
- Point diagnostics: accurate (doesn't mislead), AST lacks end position
- compile() overhead: codegen runs unnecessarily (~1ms), acceptable
- No cross-file invalidation: editing imported file doesn't update importer diagnostics
