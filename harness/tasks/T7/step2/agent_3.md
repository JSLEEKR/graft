# T7 Step 2 -- A3-Skeptic: Evaluating the Group's Bug Analysis

## Verdict: The two critical bugs are unanimously agreed. My Step 1 found nine additional issues. The other three agents found zero new bugs beyond what was already in common_memory. That asymmetry deserves scrutiny.

---

## The Critical Bugs: Full Consensus, No Dispute

### Bug 1: `./analyzer/tokens.js` import path (BUILD-BREAKING)

All four agents flag this identically. Fix: `./analyzer/estimator.js`. Nothing to add. This is the third consecutive task where this same stale import has appeared in the plan. The pattern is now predictable enough that it should be caught mechanically, not by four agents spending tokens on it.

### Bug 2: `new Parser(tokens, source)` constructor (BUILD-BREAKING)

All four agents flag this identically. Fix: `new Parser(tokens)`. Same story -- third consecutive task, same stale signature.

**Assessment: Full convergence. These are mechanical fixes. No agent disagrees.**

---

## My Step 1 Findings: How Did the Others Respond?

I raised nine additional issues (Bugs 3-11) in Step 1. Let me evaluate which ones hold up under scrutiny and how the other agents treated them.

### Bug 5 -- No `graph` declaration = silent success (HIGH)

I flagged that a `.gft` file without a `graph` declaration compiles successfully and produces degenerate output (empty CLAUDE.md, settings.json with budget 0). This is the worst failure mode for a compiler: silently producing garbage.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention.

**Self-assessment: This finding holds.** The trace through the pipeline is concrete: empty `program.graphs` array means `TokenEstimator` accesses `program.graphs[0]` as undefined, and codegen produces meaningless output. No agent challenged this because no agent engaged with it. A compiler that silently succeeds on incomplete input is a real defect, not a theoretical concern.

However, I will acknowledge the counterargument nobody made: the grammar may not actually allow a valid program without a `graph` declaration to reach codegen, because `ScopeChecker` might fail on nodes that reference undefined graphs. I traced through `ScopeChecker.checkGraphFlow()` which iterates `program.graphs`, and on an empty array it produces no errors -- but I should verify that nodes without a parent graph produce scope errors via some other check path. If they do, this bug may be unreachable in practice. **Verdict: still worth a defensive check in `compile()`, but severity may be lower than I claimed if the scope checker catches it indirectly.**

### Bug 3 -- CRLF line endings misalign error pointer (MEDIUM)

I flagged that `GraftError.format()` splits on `'\n'`, leaving `\r` artifacts on Windows when reading files with CRLF endings.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention.

**Self-assessment: This is a real bug, but it is a pre-existing bug in `diagnostics.ts`, not a T7-specific bug.** T7 is the first task that exercises file I/O through the CLI, so it is the first time this bug becomes reachable in practice. However, fixing it belongs in `diagnostics.ts`, not in the T7 implementation scope. I should have been clearer about this distinction. **Verdict: real but out of scope for T7. Should be logged for a future fix.**

### Bug 4 -- `check` command description claims "no generation" (MEDIUM)

I flagged the misleading description text.

- **A1**: Notes it is intentional. Accepts it.
- **A2**: Notes it is intentional. Accepts it.
- **A4**: Notes it is "slightly misleading but harmless."

**Self-assessment: Everyone agrees the description is inaccurate. Nobody except me suggests fixing it.** The fix is changing a single string. The cost is zero. The benefit is that `--help` output does not lie. A1, A2, and A4 all acknowledge the problem but recommend no action, which is a strange position: if you agree the description is wrong and the fix is trivial, why not fix it? **Verdict: I maintain this should be fixed. It is a one-line change.**

### Bug 6 -- No lexer/parser error test case in integration tests (MEDIUM)

I flagged that the integration test only exercises the scope-error path (undefined references), never the catch-GraftError path for lex/parse failures.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: Notes "No test for lex errors... would increase confidence but is not strictly necessary since lexer has its own unit tests."

**Self-assessment: A4 engaged with this and made a fair counterpoint.** The lexer and parser have unit tests. The integration test's purpose is to verify the pipeline wiring, and the `try/catch` path in `compile()` is simple enough that a unit-test-level coverage argument has merit. However, the catch block in `compile()` is new code in T7, and integration tests should verify that new wiring works. A lex-error test is three lines. **Verdict: I still recommend adding it, but I acknowledge A4's counterargument is reasonable. This is not a hill to die on.**

### Bug 7 -- `compileAndWrite` does not catch `writeFiles` exceptions (MEDIUM)

I flagged that filesystem errors in `writeFiles()` produce raw stack traces in the CLI.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention.

**Self-assessment: This holds, but the severity is debatable.** In practice, `writeFiles` uses `mkdirSync({ recursive: true })` which handles most directory creation issues, and the user controls the `--out-dir` path. Raw stack traces for truly exceptional filesystem errors (disk full, permissions) are ugly but informative. **Verdict: nice-to-have, not a blocker. Downgrade to Low.**

### Bug 8 -- `toLocaleString()` without locale pinning (MEDIUM)

I flagged locale-dependent number formatting in CLI output.

- **A1**: Notes `toLocaleString()` without locale argument and says "implementation should use `.toLocaleString()` as written in the plan." This is actively wrong -- the plan's usage without locale is the bug, and A1 is blessing it.
- **A2**: Draws a correct distinction between CLI output (human-locale OK) and codegen output (needs deterministic `'en-US'`). Fair point.
- **A4**: Says it "matches T6-R02 convention." But T6-R02 uses `toLocaleString('en-US')`, and the plan's CLI code uses `toLocaleString()` without the locale argument. These are not the same thing.

**Self-assessment: A2 makes a legitimate argument that CLI output can use the system locale because it is for human consumption. The CLI is not generating machine-parsed output.** However, if any integration test asserts on a specific formatted number string (e.g., `toContain('6,000')`), that test will fail on non-US locales. **Verdict: the CLI code itself is defensible per A2's reasoning. But any test that asserts on locale-formatted strings must either pin the locale or use a loose assertion. I partially retract this one.**

### Bug 9 -- Integration test fixture too narrow (LOW)

I flagged that the test fixture does not exercise `on_failure`, `tools`, conditional edges, or `filter`/`drop`/`truncate` transforms.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention.

**Self-assessment: This is aspirational, not a bug.** The integration test's job is to verify pipeline wiring, not to re-test every codegen feature. Those features have unit tests in T6. **Verdict: I retract this. Low-value for T7 scope.**

### Bug 10 -- `readSource` does not catch permission errors (LOW)

All agents noted the `readSource` implementation without objection. I flagged the missing catch for `readFileSync` errors.

**Self-assessment: Edge case. The `existsSync` check handles the common failure mode (file not found). Permission errors on readable files are rare.** **Verdict: I retract this. Not worth the code.**

### Bug 11 -- Multiple `graph` declarations silently ignored (LOW)

I flagged that only `program.graphs[0]` is used everywhere.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention.

**Self-assessment: This is a real design gap but explicitly out of scope for v1.** The spec says single graph. A warning would be nice but is not a T7 responsibility. **Verdict: acknowledged as future work. No action for T7.**

---

## Evaluating the Other Agents

### A1-Architect (4/5 convergence)

Thorough, well-organized, correctly identifies both blockers. The verification checklist is useful. The risk assessment is honest. No new bugs found beyond the two known ones.

**Weakness:** States `toLocaleString()` should be used "as written in the plan" without recognizing the locale-dependency difference between the plan's bare `.toLocaleString()` and T6-R02's `.toLocaleString('en-US')`. This is not a critical error but shows insufficient attention to the distinction.

### A2-Pragmatist (4/5 convergence)

Clean analysis. Makes the strongest argument of any agent on the `check` command running codegen ("codegen is pure, no side effects, validates full pipeline"). Makes the best argument on `toLocaleString()` ("CLI is for humans in their locale; codegen is for machine-consumed files"). Proposed ratchet locks are sensible.

**Weakness:** Only two bugs found (the known ones). No new issues surfaced. The analysis is competent but does not stress-test anything.

### A4-Specialist (4/5 convergence)

Most technically detailed on pipeline ordering and error handling strategy. Good observation about `CompileResult` using `boolean` vs discriminated union (the `result.files!` assertion pattern is a real code smell, even if acceptable for v1). Good catch on `resolveJsonModule` being avoided via hardcoded version string.

**Weakness:** Claims the plan's `toLocaleString()` usage "matches T6-R02 convention" when it does not -- T6-R02 pins `'en-US'`, the plan does not. This is factually incorrect. Also, no new bugs found.

---

## Convergence Assessment

### Full consensus (implement as stated with fixes):
1. Import from `./analyzer/estimator.js` -- all four agents
2. `new Parser(tokens)` -- all four agents
3. Pipeline ordering is correct -- all four agents
4. `CompileResult` interface is well-designed -- all four agents
5. `writeFiles` export exists, no action needed -- all four agents
6. `process.exit` only in CLI handlers -- all four agents

### Partial consensus (acknowledged but no fix planned):
7. `check` description is misleading -- A1, A2, A4 say "intentional/harmless"; I say fix the string
8. Integration test coverage is adequate -- A1, A2, A4 say yes; I say add a lex-error test case

### No engagement from other agents:
9. No-graph-declaration silent success (Bug 5) -- only I flagged it
10. `compileAndWrite` unhandled filesystem errors (Bug 7) -- only I flagged it

---

## What I Got Wrong

- Bug 9 (narrow test fixture): over-scoped. Unit tests cover this.
- Bug 10 (`readSource` permission errors): too pedantic. Not worth the code.
- Bug 8 (locale pinning in CLI): A2's argument that CLI output can use system locale is valid for the display code itself. The concern only applies to test assertions.

## What I Got Right

- Bug 5 (no graph = silent success): genuinely dangerous. A compiler that produces output from incomplete input is broken.
- Bug 4 (misleading `check` description): trivial fix that everyone acknowledges is correct but nobody acts on.
- Bug 6 (no lex-error integration test): reasonable coverage gap, even if defensible via unit tests.

## What Nobody Addressed

- Bug 3 (CRLF in error formatting): real Windows bug, but pre-existing in `diagnostics.ts`. Out of T7 scope. Should be logged.
- Bug 11 (multiple graphs): out of v1 scope. Accepted.

---

## Final Recommendation

**Implement with the two critical fixes. Also:**

1. Fix the `check` command description string. Zero cost, zero risk, corrects a lie in `--help` output.
2. Add a defensive `program.graphs.length === 0` check in `compile()`. Three lines of code to prevent silent garbage output.
3. Consider adding a three-line lex-error integration test. Not blocking, but cheap insurance on new `compile()` wiring.

Everything else I raised is either out of scope, retracted, or low enough severity to defer.
