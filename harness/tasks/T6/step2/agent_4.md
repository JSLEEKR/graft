# T6 Step 2 -- A4-Specialist (Forced Dissenter)

## Dissent Target: My Own Step 1 Verdict (Convergence 4/5)

I scored convergence at 4/5 and declared the codegen design "ready to build" after fixing two import/constructor bugs. I was wrong to stop there. My Step 1 review was narrowly focused on AST-to-output mapping correctness and missed a real portability defect that A2 and A3 both identified: the `toLocaleString()` locale dependency in `orchestration.ts`.

---

## Self-Rebuttal

In Step 1 I wrote:

> "The codegen design is faithful to the spec. AST-to-output mappings are correct for all four output types."

This was true but incomplete. I verified that `transformsToJq()` produces correct jq expressions, that `MODEL_MAP` values match the spec, and that the import/constructor bugs were the only compile-time blockers. I then declared the module ready at 4/5.

**What I missed:** A2 (section on Risk Assessment) flagged that `toLocaleString()` in `orchestration.ts` is locale-dependent and that the test asserts `toContain('6,000')` which assumes `en-US` locale. A3 (BUG 8) went further, noting that on a `de-DE` machine this produces `6.000` instead of `6,000`, causing test failure. Both recommended `toLocaleString('en-US')` as the fix.

I should have caught this. The `toLocaleString()` call appears in the budget formatting section of `orchestration.ts`, which I reviewed when verifying the orchestration template structure. I noted the formatting in my Issue 6 (CLAUDE.md format) as "Budget section with formatted numbers via `toLocaleString()`" and moved on without questioning the locale assumption. This was a specialist's blind spot: I was checking whether the output *looked right* structurally, not whether it would *produce identical output* across environments.

**Why this matters beyond tests:** This is not just a test flakiness issue. The generated `CLAUDE.md` file is consumed by Claude Code at runtime. If the budget line reads "6.000 tokens" on a German-locale CI server, the orchestration document is misleading (it looks like 6 tokens with trailing zeros, not 6000). The generated artifact itself is wrong, not just the test assertion.

**Corrected assessment:** My Step 1 convergence score should have been 3.5/5, not 4/5. The `toLocaleString()` locale issue is a genuine correctness bug (not just a test concern), and I failed to identify it despite reviewing the exact code that contains it.

---

## Revised Position on All Step 1 Issues

### Issues I Still Agree With (from all agents)

| Issue | Source | My Position |
|-------|--------|-------------|
| Import path `tokens.js` -> `estimator.js` | A1, A2, A3, A4 (me) | **Unanimous. Build-breaking. Must fix.** |
| Parser constructor `(tokens, source)` -> `(tokens)` | A1, A2, A3, A4 (me) | **Unanimous. Build-breaking. Must fix.** |
| MODEL_MAP duplication | A1, A2, A3 | **Accept duplication for v1.** A2's proposal to export from agents.ts is clean but adds a cross-module dependency for 3 lines. YAGNI. A1's reasoning is sound. |
| `compiled_at` non-determinism | A3, A4 (me) | **Accept for v1.** No test asserts on it. Flag for T7. |

### Issue I Now Adopt (previously missed)

| Issue | Source | My Revised Position |
|-------|--------|---------------------|
| `toLocaleString()` locale dependency | A2, A3 | **Must fix. Use `toLocaleString('en-US')` in all calls within `orchestration.ts`.** This is a correctness bug in generated output, not just a test concern. I missed it in Step 1 and should not have. |

### Issues Where I Dissent From Other Agents

**A3's Convergence Score of 4/10 is too harsh.**

A3 listed 11 bugs but several were self-refuted during analysis (Bug 4: "no bug in the jq itself", Bug 5: "this is valid YAML", Bug 9: "No bug here"). After removing self-refuted items, A3's actual bug count is:
- 2 critical (import path, parser constructor) -- agreed by all
- 1 medium (Windows .sh compatibility) -- valid concern but v1 scope
- 1 low (toLocaleString) -- valid, now adopted
- 1 low (MODEL_MAP) -- maintenance, not a bug

That is 5 real issues, 2 critical. A score of 4/10 implies the plan is fundamentally unsound. It is not. The architecture is correct, the file decomposition is right, the jq generation is semantically sound, and the template patterns work. Two import typos and a locale oversight do not constitute 60% plan failure. A fair score after accounting for these bugs is 3.5/5 (my revised score) or at most 3/5.

**A2's MODEL_MAP extraction into agents.ts is unnecessary coupling.**

A2 proposes exporting MODEL_MAP from agents.ts and importing it in settings.ts. This creates a dependency where settings.ts imports from agents.ts -- two peer modules that currently have no relationship. For 3 lines of static data that changes only when Anthropic releases new models, the coupling cost exceeds the duplication cost. A1's YAGNI reasoning is correct.

**A3's Windows compatibility concern (Bug 7) is out of scope for T6.**

The generated hooks are bash scripts because Claude Code's hook system executes commands via the shell. On Windows with Claude Code, the shell is Git Bash (bundled with Git for Windows, which is a prerequisite for any Node.js development workflow). This is a Claude Code platform concern, not a Graft codegen concern. If Claude Code cannot execute .sh files on Windows, that is a Claude Code bug, not a Graft bug. T6 should not generate .ps1 alternatives or node wrapper scripts to work around a hypothetical platform issue.

---

## Final Severity Table

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | Import path `tokens.js` -> `estimator.js` | CRITICAL | Fix in orchestration.ts, codegen.ts, test file |
| 2 | Parser constructor extra argument | CRITICAL | Fix in test helper |
| 3 | `toLocaleString()` locale dependency | MEDIUM | Fix: use `toLocaleString('en-US')` |
| 4 | MODEL_MAP duplication | LOW | Accept for v1 |
| 5 | `compiled_at` non-determinism | LOW | Accept for v1 |
| 6 | Windows .sh execution | OUT OF SCOPE | Claude Code platform concern |

## Revised Convergence Score: 3.5/5

Down from 4/5. The `toLocaleString()` locale issue is a real correctness bug that I missed, and I am adjusting my score to reflect that. The two critical import/constructor bugs remain unchanged. After fixing items 1-3, the codegen module is ready to implement.
