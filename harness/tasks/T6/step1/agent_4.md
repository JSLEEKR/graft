# T6 A4-Specialist Review: Code Generator

## Convergence Score: 4/5

The plan is well-structured and the research findings are sound. Five issues identified, two of which are bugs that would cause build or test failures. The remaining three are correctness improvements.

---

## Issue 1 (BUG — must fix): Wrong import path for TokenReport

**Files affected:** `src/codegen/orchestration.ts`, `src/codegen/codegen.ts`, `tests/codegen.test.ts`

The plan imports `TokenReport` from `'../analyzer/tokens.js'`. The actual file is `src/analyzer/estimator.ts` (locked by T5-R02). The correct import is:

```typescript
import { TokenReport } from '../analyzer/estimator.js';
```

Both research files flag this (research_arch.md section 7, research_impl.md risk 2), but the plan code was never updated. This will cause `Module not found` at compile time.

## Issue 2 (BUG — must fix): Parser constructor signature mismatch in test helper

**File affected:** `tests/codegen.test.ts`

The plan's `parse()` helper uses `new Parser(tokens, source)`. Per T4-R01, Parser takes `Token[]` only. The correct call:

```typescript
function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return new Parser(tokens).parse();
}
```

research_impl.md risk 4 flags this but the plan code was not corrected.

## Issue 3 (CORRECTNESS): Model resolution strings are current

Verified all three model IDs against the spec (Section 4.4 lines 472-474):
- `sonnet` -> `claude-sonnet-4-20250514` -- correct
- `opus` -> `claude-opus-4-20250514` -- correct
- `haiku` -> `claude-haiku-4-5-20251001` -- correct

Fallback pass-through (`MODEL_MAP[node.model] || node.model`) is correct for custom model names.

No issue here.

## Issue 4 (CORRECTNESS): jq expression generation is semantically correct

Reviewed `transformsToJq()` against spec Section 4.4 transform-to-jq mapping:

- `select` -> `{field: .field}` with merge for multiple selects -- matches spec
- `drop` -> `del(.field)` piped for multiple drops -- matches spec
- `filter` -> `{field: [.field[] | select(.cond_field op value)]}` -- matches spec
- `compact` -> `-c` flag -- matches spec
- `truncate` -> no-op (comment says best-effort) -- acceptable for v1

The quoting pattern `'${parts.join(' | ')}'` correctly wraps the jq pipeline in single quotes. The `-c` flag is prepended before the quoted expression, which is the correct jq invocation order.

One subtlety: `filterToJq` references `condition.field` for the inner select predicate, which is the field inside the filtered array element. This is correct -- the `Condition` interface has its own `field` property separate from the transform's `field` (the array being filtered).

No issue here.

## Issue 5 (MINOR): MODEL_MAP duplication

The plan defines `MODEL_MAP` in both `agents.ts` and `settings.ts`. research_impl.md (section 5) notes this should be extracted to a shared location. Acceptable for v1 given YAGNI, but if the implementer wants to extract it, a `src/codegen/models.ts` with the map and `resolveModel(name: string): string` function would be clean. Not blocking.

## Issue 6 (CORRECTNESS): CLAUDE.md format matches Claude Code expectations

The orchestration output follows Claude Code's `CLAUDE.md` conventions:
- Top-level `#` heading
- Structured sections with `##` and `###`
- Inline code for paths and completion signals
- Budget section with formatted numbers via `toLocaleString()`

The `settings.json` structure includes `model`, `permissions.allow`, and `hooks.PostToolUse` -- all fields that Claude Code's harness recognizes. The `graft` namespace key is custom metadata that won't interfere with Claude Code's parsing.

Hook matcher format `Write(.graft/session/node_outputs/<source>.json)` matches Claude Code's PostToolUse hook trigger pattern.

No issue here.

## Issue 7 (MINOR): `compiled_at` non-determinism in tests

The plan uses `new Date().toISOString()` for `compiled_at` in settings. The test (`generateSettings` test) does not assert on `compiled_at`, so this is fine. But if any future test snapshots include the full settings output, timestamps will break. The research noted this (research_impl.md risk 3). Acceptable as-is for v1.

---

## Summary of Required Changes

| # | Severity | Description | Fix |
|---|----------|-------------|-----|
| 1 | BUG | Wrong import path `analyzer/tokens.js` | Change to `analyzer/estimator.js` in orchestration.ts, codegen.ts, and test file |
| 2 | BUG | Parser constructor takes 2 args in test | Remove `source` argument: `new Parser(tokens).parse()` |
| 5 | MINOR | MODEL_MAP duplication | Accept or extract to shared module |
| 7 | MINOR | compiled_at non-determinism | Accept for v1, note for future |

## Verdict

The codegen design is faithful to the spec. AST-to-output mappings are correct for all four output types (agent markdown, hook scripts, orchestration CLAUDE.md, settings.json). The jq generation is semantically sound. Two import/constructor bugs from the plan must be fixed before implementation. After those fixes, this is ready to build.
