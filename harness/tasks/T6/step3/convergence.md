# T6 Convergence: Code Generator

## Verification

```
npx tsc --noEmit   -> CLEAN (zero errors)
npx vitest run     -> 101/101 tests pass (23 codegen + 78 prior)
```

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/codegen/agents.ts` | 119 | NodeDecl -> agent markdown string |
| `src/codegen/hooks.ts` | 96 | EdgeDecl -> bash hook script or null |
| `src/codegen/orchestration.ts` | 61 | (Program, TokenReport) -> CLAUDE.md string |
| `src/codegen/settings.ts` | 86 | (Program, sourceFile) -> GraftSettings object |
| `src/codegen/codegen.ts` | 64 | Orchestrator: generate() -> GeneratedFile[], writeFiles() |
| `tests/codegen.test.ts` | 476 | 23 assertion-based tests across 5 describe blocks |

## Decisions Applied

### Unanimous (adopted as-is)

1. **Import path**: `../analyzer/estimator.js` (not `tokens.js`) -- T5-R02
2. **Parser constructor**: `new Parser(tokens)` (not `new Parser(tokens, source)`) -- T4-R01
3. **5-file decomposition**: agents, hooks, orchestration, settings, codegen -- confirmed correct
4. **GeneratedFile[] pattern**: `generate()` returns in-memory, `writeFiles()` handles disk I/O
5. **Template literals**: No template engine dependency
6. **Assertion-based tests**: `toContain` / `toBe`, no snapshots
7. **No barrel exports**: Each file exports directly (T1-R08)
8. **ESM .js extensions**: All imports use `.js` suffix (T1-R09)

### Ruled Disagreements

| Issue | Decision | Rationale |
|-------|----------|-----------|
| `toLocaleString` locale | Fixed with `'en-US'` | A2/A3 flagged locale-dependent output. Trivial fix, prevents CI failures on non-US machines. Generated CLAUDE.md is consumed by Claude Code, not end users. |
| MODEL_MAP duplication | Keep duplicated in agents.ts and settings.ts | A1 position wins. Extracting creates cross-module coupling (A2's proposal) or a sixth file for 3 lines (A3/A4). Added sync comments in each file. YAGNI. |
| Windows bash hooks | Deferred to T7 | A3 raised valid concern. Claude Code on Windows uses Git Bash (per shell environment). Added a comment in hooks.ts noting the bash dependency. If hooks fail on Windows during T7 integration, prefix commands with `bash` in settings.ts (one-line fix). |
| Systematic audit of all files | Applied during implementation | A3 wanted grep-level audit for import/constructor bugs. Both patterns (`../analyzer/tokens.js` and `new Parser(tokens, source)`) were corrected in all codegen files and tests. compiler.ts (T7) still has these bugs -- flagged for T7 implementer. |

### Forced Dissent (A4)

A4 self-corrected from 4/5 to 3.5/5 after acknowledging the `toLocaleString` locale bug. A4 had reviewed the exact code containing the bug in Step 1 but focused on structural correctness rather than cross-environment determinism. The fix was applied.

## Additional Bugs Found During Implementation

### Bug: Default model resolution in generateSettings

The plan's `generateSettings` used this fallback chain for the default model:
```typescript
MODEL_MAP[firstNode?.model || 'sonnet'] || MODEL_MAP.sonnet
```

This incorrectly falls back to `sonnet` when a custom model string is not in MODEL_MAP. Fixed to:
```typescript
MODEL_MAP[firstNodeModel] || firstNodeModel
```

This matches the override resolution pattern (`MODEL_MAP[node.model] || node.model`) and correctly passes through unknown model names.

### Bug: Test syntax vs parser capabilities

Six tests used Graft syntax the parser does not support:
- `custom-model-123`: Lexer rejects hyphens in identifiers. Changed to `gpt4o`.
- `{ findings: List<String>, score: Float(0..1) }`: Parser uses newline-separated fields, not comma-separated. Changed to multi-line format.
- `meta: { title: String, count: Int }`: Parser requires named inline structs (`Meta { ... }`), not anonymous. Changed to `meta: Meta { title: String\n count: Int }`.

These are test authoring bugs, not codegen bugs. The codegen implementation correctly handles all AST node types.

## Test Coverage (23 tests)

### generateAgent (10 tests)
- Basic markdown structure (frontmatter, sections, schema, completion signal)
- Tools in frontmatter (file_read -> Read, file_write -> Write/Edit, terminal -> Bash)
- Failure protocols: retry, skip, abort, default (no on_failure)
- No reads -> "No external context required"
- Partial reads -> `Context.field` format
- Custom model pass-through
- Struct type JSON example generation

### generateHook (4 tests)
- Edge with transforms produces bash script with jq, file checks, token accounting
- Edge without transforms returns null
- Drop transform -> `del(.field)` jq expression
- Multiple select transforms merge into single projection `{a: .a, b: .b}`

### generateOrchestration (3 tests)
- CLAUDE.md with execution plan, budget (locale-fixed), step numbering, completion signals
- Edge without transforms shows direct input path (no `_to_` suffix)
- Empty program (no graphs) returns empty string

### generateSettings (4 tests)
- Model routing with overrides for non-default models
- No overrides when all nodes use same model
- Valid ISO timestamp in compiled_at (format check, not value)
- Custom model string pass-through

### generate (2 tests)
- Full pipeline: 2 nodes + 1 hook + CLAUDE.md + settings.json + 2 scaffold = 7 files
- No-hook pipeline: 2 nodes + 0 hooks + CLAUDE.md + settings.json + 2 scaffold = 6 files

## Ratchet Proposals

- [T6-R01] Import path: `../analyzer/estimator.js` for TokenReport -- LOCKED
- [T6-R02] `toLocaleString('en-US')` for all number formatting in generated output -- LOCKED
- [T6-R03] MODEL_MAP duplicated in agents.ts and settings.ts (no shared module) -- LOCKED
- [T6-R04] generateSettings default model: `MODEL_MAP[model] || model` pass-through -- LOCKED
- [T6-R05] Hook scripts use bash; Windows compatibility deferred to T7 -- LOCKED
