# T6 Code Review: Code Generator

## Verdict: PASS

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | CLEAN (zero errors) |
| `npx vitest run` | 101/101 tests pass (23 codegen + 78 prior) |
| Import paths use `estimator.js` not `tokens.js` | CONFIRMED -- `orchestration.ts` and `codegen.ts` both import from `../analyzer/estimator.js` |
| Parser constructor uses `Token[]` only | CONFIRMED -- `new Parser(tokens).parse()` in test helper (no source param) |
| `toLocaleString('en-US')` used | CONFIRMED -- all 5 calls in `orchestration.ts` pass `'en-US'` locale |
| `.js` import extensions | CONFIRMED -- all 11 relative imports across src/codegen and tests use `.js` suffix |
| No barrel exports | CONFIRMED -- each file exports directly, no `index.ts` |

## File-by-File Review

### `src/codegen/agents.ts` (134 lines)
- MODEL_MAP and TOOL_MAP are clean constant lookups at module scope.
- `generateAgent()` produces well-structured markdown with frontmatter, context loading, output contract (JSON schema example), token discipline, completion protocol, and failure protocol.
- `resolveTools()` uses Set to deduplicate tool names -- correct.
- `formatReads()` correctly handles empty reads (`No external context required`) and partial reads (`Context.field`).
- `formatFailure()` covers all 5 failure strategy types (retry, fallback, retry_then_fallback, skip, abort) with correct signal strings.
- `typeToExample()` recursively handles all TypeExpr kinds including struct, list, map, optional, token_bounded, enum, domain, primitive, primitive_range.
- Model resolution uses `MODEL_MAP[node.model] || node.model` pass-through pattern -- matches T6-R04.

### `src/codegen/hooks.ts` (100 lines)
- Returns `null` for edges with no transforms or non-direct targets -- correct early returns.
- Generated bash scripts include `set -euo pipefail`, input file check, jq transform, and token accounting.
- `transformsToJq()` correctly merges multiple `select` transforms into a single jq projection `{a: .a, b: .b}`.
- `drop` transforms emit `del(.field)` -- correct jq syntax.
- `filter` transforms produce correct nested jq select expressions.
- `compact` adds `-c` flag to jq -- correct.
- Bash dependency comment present at top of file per T6-R05.

### `src/codegen/orchestration.ts` (62 lines)
- Returns empty string for no graphs -- correct.
- Builds edge map to determine whether to use `source_to_target.json` (transforms) or `source.json` (no transforms) -- correct.
- Step numbering is 1-based, sequential.
- All `toLocaleString` calls use `'en-US'` locale -- T6-R02 satisfied.
- Completion signals match agent format (`===NODE_COMPLETE:name===`).
- Budget tracking section with 80%/90% thresholds included.

### `src/codegen/settings.ts` (89 lines)
- `GraftSettings` interface is well-typed with nested structure for model routing, budget, hooks.
- Default model resolution: `MODEL_MAP[firstNodeModel] || firstNodeModel` -- matches T6-R04 fix (pass-through for unknown models).
- Overrides only added when resolved model differs from default -- no spurious overrides when all nodes share the same model.
- Hook entries correctly use `Write(...)` matcher pattern for PostToolUse hooks.
- `compiled_at` uses `new Date().toISOString()` -- ISO format verified in tests.
- MODEL_MAP sync comment present -- matches agents.ts comment.

### `src/codegen/codegen.ts` (66 lines)
- `generate()` returns `GeneratedFile[]` in-memory -- correct pattern.
- File generation order: agents, hooks, orchestration, settings, scaffold.
- Hook files only created when `generateHook` returns non-null AND target is direct -- double-check matches hooks.ts early return (redundant but safe).
- `writeFiles()` uses `mkdirSync` with `recursive: true` -- correct for nested paths.
- Scaffold files: `.graft/session/node_outputs/.gitkeep` and `.graft/token_log.txt` -- correct.
- Imports `node:fs` and `node:path` with `node:` protocol -- correct ESM practice.

### `tests/codegen.test.ts` (528 lines, 23 tests)
- Uses explicit vitest imports (T1-R04).
- Helper `parse()` function correctly chains Lexer -> Parser with `Token[]` only (T4-R01).
- All imports use `.js` extensions and `estimator.js` path (T5-R02).
- Assertion-based tests throughout (`toContain`, `toBe`, `toHaveLength`, `toBeNull`, `not.toContain`) -- no snapshots.
- Tests cover all 5 modules across 5 describe blocks.
- Test syntax bugs from convergence (hyphens in identifiers, comma-separated fields, anonymous structs) have been fixed.

## Convergence Requirement Compliance

| Convergence Requirement | Status |
|------------------------|--------|
| 5-file decomposition (agents, hooks, orchestration, settings, codegen) | MET |
| `GeneratedFile[]` pattern with `generate()` / `writeFiles()` | MET |
| Template literals, no template engine | MET |
| Assertion-based tests, no snapshots | MET |
| `toLocaleString('en-US')` for locale-safe formatting | MET |
| `MODEL_MAP` duplicated with sync comments | MET |
| Default model: `MODEL_MAP[model] \|\| model` pass-through | MET |
| Windows bash hooks deferred to T7 | MET (comment in hooks.ts) |
| Import path `../analyzer/estimator.js` | MET |
| Parser constructor `new Parser(tokens)` only | MET |
| ESM `.js` extensions on all imports | MET |
| No barrel exports | MET |

## Ratchet Compliance

All prior ratchets (T1-R01 through T5-R05) verified satisfied. New T6 ratchets (T6-R01 through T6-R05) correctly applied in implementation.

## Issues Found

None. Implementation matches convergence spec exactly.
