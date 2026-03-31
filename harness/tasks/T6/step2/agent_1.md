# T6 Step 2: A1-Architect Synthesis

## Consensus Summary

All four agents (A1-Architect, A2-Pragmatist, A3-Skeptic, A4-Specialist) converge on the core design and the two critical bugs. Convergence scores range from 4/5 (A1, A2, A4) to 4/10 (A3, who applied stricter grading but agrees on the same fixes). The disagreements are minor and resolvable.

---

## Unanimous Fixes (All 4 Agents Agree)

### Fix 1: Import path `../analyzer/tokens.js` -> `../analyzer/estimator.js`

**Status: ACCEPTED -- all agents flag this as build-breaking.**

Every agent identifies this as critical. The plan references `../analyzer/tokens.js` but T5-R02 locks the file as `estimator.ts`. Affects orchestration.ts, codegen.ts, and tests/codegen.test.ts. Without this fix, zero files compile.

**Action:** Replace `../analyzer/tokens.js` with `../analyzer/estimator.js` in all import statements across codegen source and test files.

### Fix 2: Parser constructor `new Parser(tokens, source)` -> `new Parser(tokens)`

**Status: ACCEPTED -- all agents flag this as build-breaking.**

T4-R01 locks Parser as taking `Token[]` only. The plan's test helper and compiler.ts both pass a second `source` argument. TypeScript strict mode rejects this.

**Action:** Change `new Parser(tokens, source).parse()` to `new Parser(tokens).parse()` in tests/codegen.test.ts and flag the same fix for compiler.ts in T7.

---

## Evaluated Issues with Decisions

### Issue 3: `toLocaleString()` locale dependency

**Raised by:** A2 (low risk note), A3 (Bug 8, low severity)
**Not raised by:** A1, A4

A3 correctly identifies that `toLocaleString()` produces locale-dependent output. On `de-DE` locales, `6000` formats as `6.000` instead of `6,000`. The test asserts `toContain('6,000')` which assumes en-US.

**Decision: ACCEPTED -- use fixed locale.**

The fix is trivial and defensive. Change all `toLocaleString()` calls in orchestration.ts to `toLocaleString('en-US')`. This costs nothing, prevents CI failures on non-US machines, and is the standard practice for deterministic formatting in generated output. The generated CLAUDE.md is consumed by Claude Code, not end users, so locale-specific formatting adds no value.

**Action:** Use `.toLocaleString('en-US')` everywhere in orchestration.ts.

### Issue 4: MODEL_MAP duplication

**Raised by:** All four agents, with three different positions.

| Agent | Position |
|-------|----------|
| A1 | Keep duplicated (YAGNI, 3 entries, no new file) |
| A2 | Export from agents.ts, import in settings.ts (no new file) |
| A3 | Extract to shared location |
| A4 | Accept for v1, or extract to models.ts if desired |

**Decision: ACCEPTED -- keep duplicated (A1's position).**

Rationale:
- A2's solution (export from agents.ts, import in settings.ts) creates a dependency from settings.ts to agents.ts. These are peer modules that should not import from each other. The import graph in A1's section 8 shows them as siblings under codegen.ts, with no cross-imports. Adding one breaks that clean topology.
- Extracting to a new models.ts file creates a sixth codegen file for 3 lines of data, which is YAGNI.
- The map has 3 entries and changes only when Anthropic releases new models. The risk of a sync error is real but low, and a simple code comment "keep in sync with settings.ts" / "keep in sync with agents.ts" mitigates it adequately.
- This is consistent with the project's established YAGNI pattern (T1-T5).

**Action:** Keep MODEL_MAP duplicated in agents.ts and settings.ts. Add a comment in each file referencing the other copy.

### Issue 5: Windows bash compatibility for hook scripts

**Raised by:** A3 (Bug 7, medium severity)
**Not raised by:** A1, A2, A4

A3 flags that generated `.sh` hook scripts use `#!/bin/bash` and `set -euo pipefail`, which will not execute on Windows via `cmd.exe`. The dev environment is Windows 11.

**Decision: DEFERRED -- not a T6 blocker.**

Rationale:
- Claude Code on Windows uses Git Bash as its shell environment (this is standard for Node.js CLI tools on Windows that need Unix shell compatibility). The project itself runs in a bash shell (per environment context).
- The hook scripts are executed by Claude Code's hook runner, not directly by the user. Claude Code's hook execution environment handles `.sh` files.
- A3's suggested fixes (generate .ps1 variants, use Node scripts, prefix with `bash`) are all valid but add complexity that is not justified without evidence that Claude Code's hook runner fails on Windows.
- If this becomes an issue during T7 integration testing, the fix (prefixing commands with `bash` in settings.json) is a one-line change in settings.ts.

**Action:** No change for T6. Add a comment in hooks.ts noting the bash dependency. Revisit during T7 integration if hook execution fails on Windows.

### Issue 6: Hook matcher syntax validation

**Raised by:** A3 (Bug 3, medium severity)
**Not raised by:** A1, A2. A4 says the format is correct.

A3 questions whether `Write(.graft/session/node_outputs/<source>.json)` matches Claude Code's PostToolUse hook trigger pattern. A4 confirms it does.

**Decision: ACCEPTED as correct -- no change needed.**

A4's assessment (Issue 6 in their review) explicitly validates the hook matcher format against Claude Code's expected syntax. The pattern is correct.

### Issue 7: `compiled_at` non-determinism

**Raised by:** A2 (medium risk), A3 (Bug 6, low), A4 (Issue 7, minor)
**Not raised by:** A1

All three note that `new Date().toISOString()` makes settings output non-deterministic. All three also note the current tests do not assert on `compiled_at`, so it is not a problem today.

**Decision: ACCEPTED as-is for v1.**

The current tests correctly avoid asserting on timestamp values. No action needed. If snapshot tests are added later, inject the timestamp as a parameter.

**Action:** No change. The implementer should continue the pattern of not asserting on `compiled_at` in tests.

---

## Confirmed Design Decisions (No Disagreement)

These items received unanimous or near-unanimous agreement with no objections:

1. **Five-file decomposition is correct.** No reduction, no expansion. (All 4 agents)
2. **Template literals, no template engine.** (All 4 agents)
3. **Assertion-based tests (`toContain`), not snapshots.** (A1, A2, A3, A4)
4. **jq generation is semantically correct.** (A1, A3, A4 all traced the logic)
5. **`GeneratedFile[]` return pattern with pure `generate()` and side-effecting `writeFiles()`.** (A1)
6. **7 test cases minimum, expandable to ~20-25.** (A1 recommends expansion, A2 says all 7 earn their keep, no one objects)
7. **No barrel exports (T1-R08).** (A1, A2)
8. **All imports use `.js` extensions (T1-R09).** (A1)

---

## Final Implementation Checklist

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Fix `../analyzer/tokens.js` -> `../analyzer/estimator.js` | BLOCKER | Must fix |
| 2 | Fix `new Parser(tokens, source)` -> `new Parser(tokens)` | BLOCKER | Must fix |
| 3 | Use `.toLocaleString('en-US')` in orchestration.ts | LOW | Fix during implementation |
| 4 | Keep MODEL_MAP duplicated with sync comments | LOW | Accepted |
| 5 | Windows bash compat for hooks | DEFERRED | Revisit in T7 |
| 6 | `compiled_at` non-determinism | DEFERRED | No action for v1 |
| 7 | 5-file structure | CONFIRMED | No change |
| 8 | Assertion-based testing | CONFIRMED | No change |
| 9 | jq generation logic | CONFIRMED | Correct as designed |
