# T6 Implementation Research: Code Generator

## 1. Template Literal Patterns for Markdown Generation

The plan uses tagged template literals (backtick strings) for agent markdown and orchestration output. This is the right call -- template literals handle multi-line strings, embedded expressions, and nested backticks (with escaping) cleanly. Key pattern: build sections as helper functions returning strings, compose in the main template. Avoid string concatenation chains.

Watch out: the plan embeds backtick-fenced code blocks inside template literals. Use `\`` escaping consistently. JSON.stringify handles the schema examples cleanly.

## 2. jq Expression Building

The plan builds jq expressions via string concatenation in `transformsToJq()`. This is correct for v1 -- the transform set is small and fixed (select, drop, filter, compact, truncate). A jq AST builder would be overengineering. The quoting pattern (`'${parts.join(' | ')}'`) is sound. One risk: field names with special characters could break jq -- but Graft identifiers are already ASCII-constrained by the lexer, so this is safe.

## 3. Testing Strategy

The plan uses assertion-based testing (`expect(md).toContain(...)`) rather than snapshot testing. This is the right choice for v1:
- Snapshots are brittle to formatting changes and compiled_at timestamps
- `toContain` assertions verify structural correctness without over-constraining output
- common_memory.md notes "T6: consider snapshot testing" but assertion testing aligns with the existing test style (T2: 31, T4: 64, T5: 78 tests all use assertions)

If snapshot testing is added later, use `toMatchInlineSnapshot` with timestamp stripping.

## 4. Node.js fs Patterns

The plan uses `fs.mkdirSync(path.dirname(fullPath), { recursive: true })` before each write. This is correct and idiomatic. `recursive: true` is safe for existing dirs. The `writeFiles` function correctly separates generation (pure) from I/O (side-effectful), making the generators independently testable without fs mocking.

## 5. Model Name Resolution

The plan defines `MODEL_MAP` in both `agents.ts` and `settings.ts`. This duplication should be extracted to a shared constant, possibly in a `models.ts` or kept in `codegen.ts` and re-exported. Current map:
- `sonnet` -> `claude-sonnet-4-20250514`
- `opus` -> `claude-opus-4-20250514`
- `haiku` -> `claude-haiku-4-5-20251001`

Fallback: if model string not in map, use it verbatim (custom model pass-through).

## 6. Five-File Granularity Assessment

The plan splits codegen into: `agents.ts`, `hooks.ts`, `orchestration.ts`, `settings.ts`, `codegen.ts`.

**Verdict: correct granularity.** Each file has a single responsibility and clear input/output:
- `agents.ts`: NodeDecl -> markdown string
- `hooks.ts`: EdgeDecl -> bash string | null
- `orchestration.ts`: (Program, TokenReport) -> markdown string
- `settings.ts`: (Program, sourceFile) -> GraftSettings object
- `codegen.ts`: orchestrator + fs writer

This matches the existing codebase pattern (T5 has scope.ts, types.ts, estimator.ts). No barrel exports (T1-R08). Each generator is independently testable.

## Key Implementation Risks

1. **MODEL_MAP duplication** -- extract to shared location during implementation
2. **Import path**: plan references `../analyzer/tokens.js` but the actual file is `../analyzer/estimator.js` (T5-R02). Must fix imports.
3. **`compiled_at` in settings** -- uses `new Date().toISOString()`, makes tests non-deterministic. Consider injecting timestamp or accepting it in test assertions.
4. **Parser constructor**: plan uses `new Parser(tokens, source)` but T4 ratchet says parser takes `Token[]` only (T4-R01). Verify actual parser signature.
