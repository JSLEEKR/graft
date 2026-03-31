# T6 Research: Code Generator Architecture

## 1. Code Generation Pattern: Programmatic String Building

**Decision: Template literals (backtick strings), not template engines.**

The plan specifies programmatic construction using TypeScript template literals. This is correct for Graft v1:
- Output formats are fixed (markdown, bash, JSON) with no user-customizable templates.
- Template engines (Handlebars, EJS) add a dependency for no benefit at this complexity level.
- JSON output uses `JSON.stringify()` with indent parameter -- no manual string building needed.
- Markdown and bash are built via template literals with embedded expressions.

Follows YAGNI pattern established in T1-T5.

## 2. File System Output: In-Memory Then Write

**Decision: `generate()` returns `GeneratedFile[]`; `writeFiles()` writes to disk.**

The plan separates generation from I/O via the `GeneratedFile` interface (`{ path: string; content: string }`). Benefits:
- Testability: tests call `generate()` and assert on returned strings without touching disk.
- Atomicity: all files computed before any writes -- partial output on error is avoidable.
- CLI flexibility: `graft check` skips `writeFiles()`, `graft compile` calls both.

## 3. Markdown Generation

Agent markdown uses YAML frontmatter (`---` delimited) plus structured sections. Key patterns:
- `fieldsToJsonExample()` recursively converts `TypeExpr` AST nodes to JSON schema examples.
- `formatReads()` and `formatFailure()` are small helper functions, not a generic visitor (per T3-R09: no visitor pattern).
- Orchestration markdown (`CLAUDE.md`) uses `toLocaleString()` for number formatting.

## 4. Shell Script / jq Expression Building

Edge transforms compile to jq expressions via `transformsToJq()`:
- `select` fields accumulate into `{field: .field, ...}` projection.
- `drop` fields become `del(.field)` piped together.
- `filter` becomes `[.field[] | select(.cond op val)]`.
- `compact` flag toggles `jq -c` vs default pretty-print.
- Transforms are grouped by type first, then composed with jq pipe (`|`).

Scripts include error checking (`[ ! -f "$INPUT" ]`) and token accounting (byte-count reduction logging).

## 5. JSON Generation (settings.json)

`generateSettings()` returns a typed `GraftSettings` object, serialized via `JSON.stringify(settings, null, 2)`. Key aspects:
- `MODEL_MAP` duplicated in agents.ts and settings.ts (both need it independently).
- Hook entries match on `Write(.graft/session/node_outputs/<source>.json)` pattern for PostToolUse.
- `compiled_at` uses `new Date().toISOString()` -- tests must account for timestamp variability.

## 6. Key Architectural Notes

- **Import from `estimator.ts`**: Common memory says T5-R02 renamed to `estimator.ts`, but plan code imports from `analyzer/tokens.js`. Must use actual filename: `estimator.ts` / `estimator.js`.
- **No barrel exports** (T1-R08): Each codegen file exports its own function directly.
- **ESM with .js extensions** (T1-R09): All imports use `.js` suffix.
- **Error accumulation not needed**: Codegen runs after successful analysis -- inputs are validated.
- **Single graph assumption**: v1 uses `program.graphs[0]` throughout.

## 7. Risk: Plan vs Ratchet Conflict

The plan imports `TokenReport` from `'../analyzer/tokens.js'` but T5-R02 locked the filename as `estimator.ts`. The correct import path is `'../analyzer/estimator.js'`. This must be corrected during implementation in orchestration.ts and codegen.ts.
