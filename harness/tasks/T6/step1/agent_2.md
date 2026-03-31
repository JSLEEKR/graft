# T6 Agent 2 (A2-Pragmatist): Code Generator Review

## Convergence Score: 4/5

Both research documents agree on fundamentals (template literals, assertion tests, import path bug, file separation). The MODEL_MAP question is the main open issue.

---

## Question 1: Can 5 files be fewer?

**Verdict: Keep 5 files. No reduction.**

A1 and A2 research both conclude 5 is correct. Each file has a clean single-responsibility boundary:

| File | Input | Output |
|------|-------|--------|
| agents.ts | NodeDecl | markdown string |
| hooks.ts | EdgeDecl | bash string or null |
| orchestration.ts | (Program, TokenReport) | markdown string |
| settings.ts | (Program, sourceFile) | GraftSettings object |
| codegen.ts | all of the above | GeneratedFile[] + writeFiles() |

Merging any two would create a file with mixed concerns. The pattern matches T5's three-file split (scope.ts, types.ts, estimator.ts). Each generator is independently testable without importing the others. No change needed.

## Question 2: Are all tests necessary?

**Verdict: Yes. Every test earns its keep.**

The plan has 6 test cases across 4 describe blocks:

1. `generateAgent` - basic markdown (3 tests: structure, tools, failure) -- these cover the three variable sections of agent output. Removing any one leaves a code path untested.
2. `generateHook` - bash script (2 tests: with transforms, without) -- the null-return case is critical; without it, codegen.ts would write empty files.
3. `generateOrchestration` - CLAUDE.md (1 test) -- verifies step numbering and token report integration.
4. `generateSettings` - settings.json (1 test) -- verifies model routing and hook wiring.

7 tests total is lean for a module this size. No test is redundant. If anything, a test for `transformsToJq` with `drop` and `filter` transforms would strengthen coverage, but that can wait for T7 integration tests.

## Question 3: MODEL_MAP duplication -- extract or accept?

**Verdict: Extract to a shared constant. But not into a new file.**

The plan duplicates MODEL_MAP in agents.ts and settings.ts with identical values. A1-research says "extract to shared location." I agree, but a new `models.ts` file violates YAGNI and creates a sixth codegen file for three lines of code.

**Pragmatic solution:** Define MODEL_MAP once in agents.ts and export it. Import it in settings.ts. This is the smallest change that removes duplication:

```typescript
// agents.ts
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
};

// settings.ts
import { MODEL_MAP } from './agents.js';
```

This does not violate T1-R08 (no barrel exports) because it is a named export from a specific module, not a re-export barrel. agents.ts is the natural owner because it is the primary consumer (resolving model names for agent frontmatter).

If someone objects that settings.ts importing from agents.ts creates a coupling, the alternative is to put MODEL_MAP in codegen.ts and have both import from there. But codegen.ts is the orchestrator that imports agents.ts and settings.ts, so that creates a circular risk. agents.ts is the right home.

## Question 4: Is jq generation overcomplicated?

**Verdict: No. The complexity is proportional to the problem.**

`transformsToJq()` does four things:
1. Collects select fields into a jq object projection (`{field: .field}`)
2. Collects drop fields into `del(.field)` pipes
3. Converts filter transforms into `select()` expressions
4. Sets the `-c` flag for compact

This is a straightforward accumulate-then-compose pattern. The grouping (selects together, drops together) is necessary because multiple `select(a) | select(b)` should merge into `{a: .a, b: .b}`, not nest projections. The `filterToJq` helper is 4 lines. No AST builder, no intermediate representation.

One minor note: `truncate` is silently dropped with a comment "best-effort: truncate handled at string level." This is fine for v1 since truncate is a token-budget concept, not a JSON structure operation. The estimator already accounts for truncate in token math.

## Question 5: Known bugs

### Bug 1: Import path `tokens.js` vs `estimator.js`

Both research docs flag this. The plan imports `TokenReport` from `'../analyzer/tokens.js'` in orchestration.ts and codegen.ts. Per T5-R02, the file is `estimator.ts`, so the import must be `'../analyzer/estimator.js'`. This affects:
- `src/codegen/orchestration.ts` line 2
- `src/codegen/codegen.ts` line 4
- `tests/codegen.test.ts` line 8

Fix: replace `../analyzer/tokens.js` with `../analyzer/estimator.js` in all three files.

### Bug 2: Parser constructor signature

The plan's test helper uses `new Parser(tokens, source)` but T4-R01 locks "Parser takes Token[] only." The correct call is `new Parser(tokens).parse()`. This affects:
- `tests/codegen.test.ts` line 5: `parse()` helper function

Fix: change `new Parser(tokens, source).parse()` to `new Parser(tokens).parse()`.

### Bug 3: MODEL_MAP duplication (covered above)

Not a crash bug, but a maintenance hazard. If model versions update, both copies must change in sync.

## Summary of Recommended Changes to Plan

1. **Fix imports**: `../analyzer/tokens.js` -> `../analyzer/estimator.js` (3 locations)
2. **Fix parser call**: `new Parser(tokens, source)` -> `new Parser(tokens)` (1 location)
3. **Extract MODEL_MAP**: Define once in agents.ts, export, import in settings.ts
4. **No file count change**: Keep 5 codegen files
5. **No test reduction**: Keep all 7 test cases
6. **No jq simplification**: Current approach is appropriate

## Risk Assessment

- **Low risk**: The codegen module is purely generative -- it reads validated AST and produces strings. No error accumulation, no complex control flow.
- **Medium risk**: `compiled_at` timestamp in settings.json makes test assertions time-dependent. The plan's test does not assert on `compiled_at`, so this is fine for now, but integration tests in T7 should strip or mock timestamps.
- **Low risk**: `toLocaleString()` for number formatting in orchestration.ts is locale-dependent. In CI environments with different locales, `6000` might format as `6.000` instead of `6,000`. Consider using a fixed formatter or testing with `toContain('6')` loosely. The current test uses `toContain('6,000')` which assumes en-US locale.
