# T6 Step 2 -- A3-Skeptic: Did They Take the Bugs Seriously?

## Verdict: Partially. The two critical bugs got universal acknowledgment but superficial treatment. The medium-severity issues got selectively ignored.

---

## The Critical Bugs: Acknowledged by All, Trivialized by Most

### Bug 1: `../analyzer/tokens.js` import path (BUILD-BREAKING)

All four agents flag this. Good. But look at how they treat it:

- **A1** marks it BLOCKER, gives the fix, moves on. Adequate.
- **A2** lists three affected files, gives the fix. Adequate.
- **A3** (me) listed four affected files including `compiler.ts`. I was the only one who caught that `compiler.ts` also has this bug. A1, A2, and A4 all miss the compiler.ts instance.
- **A4** lists three affected files, same as A2.

**Problem:** Three of four agents missed that `compiler.ts` (T7's file, already present in the plan) has the same wrong import. This is exactly the kind of "fix it in the files I looked at, miss it elsewhere" pattern that lets bugs survive. The plan code has this error in at least four locations, and the consensus only covers three. The T7 implementer will inherit a broken import unless someone flags it explicitly.

**Assessment: Insufficient.** Acknowledging a bug is not the same as ensuring it is fully eradicated. A systematic grep-equivalent was needed, not a spot check.

### Bug 2: `new Parser(tokens, source)` constructor mismatch (BUILD-BREAKING)

Again, all four agents flag this. But:

- **A1** correctly notes it also affects `compiler.ts` in T7. Good -- A1 is the only other agent who caught the cross-task impact.
- **A2** scopes it to just the test file. Incomplete.
- **A3** (me) flagged both the test file and `compiler.ts`.
- **A4** scopes it to just the test file. Incomplete.

**Assessment: A2 and A4 underscoped the fix.** They treated this as a test-only problem when it is a plan-wide problem. The Parser constructor signature is wrong everywhere the plan calls it, not just in the test helper.

---

## The Medium-Severity Issues: Selectively Ignored

### Windows shell script execution (Bug 7 in my Step 1)

I raised this: the generated hook scripts use `#!/bin/bash` and `set -euo pipefail`. The development environment is Windows 11. Claude Code's hook execution path on Windows is undocumented in the plan.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: No mention. In fact, A4 actively claims "Hook matcher format `Write(...)` matches Claude Code's PostToolUse hook trigger pattern" without addressing the execution environment.

**Assessment: Completely ignored by all other agents.** This is concerning. We are building on Windows. The hooks generate bash scripts. Nobody else asked "will these actually run?" This is not a theoretical portability concern -- it is a concrete "will the output work on the machine we are developing on" question. The silence is more alarming than a disagreement would be.

### `toLocaleString()` locale dependency (Bug 8 in my Step 1)

I flagged that `toLocaleString()` without a locale argument produces locale-dependent output, making the test assertion `toContain('6,000')` fragile.

- **A1**: No mention.
- **A2**: Flags it. Notes the CI risk. Suggests testing with `toContain('6')` loosely. This is a reasonable workaround but does not fix the source.
- **A4**: No mention.

**Assessment: A2 took it somewhat seriously. A1 and A4 ignored it.** The fix is trivial (`toLocaleString('en-US')`) and there is no reason not to apply it.

### Hook matcher syntax validation (Bug 3 in my Step 1)

I questioned whether `Write(.graft/session/node_outputs/source.json)` is actually the correct matcher syntax for Claude Code's PostToolUse hooks.

- **A1**: No mention.
- **A2**: No mention.
- **A4**: Asserts "Hook matcher format matches Claude Code's PostToolUse hook trigger pattern" with no evidence or citation. This is a claim, not a verification.

**Assessment: A4's unsupported assertion is worse than silence.** Claiming something is correct without evidence creates false confidence. If the matcher syntax is wrong, every hook silently never fires, and the entire orchestration pipeline produces output that looks correct but does nothing at runtime.

---

## Convergence Scores: A Study in Comfortable Agreement

| Agent | Convergence Score | My Read |
|-------|-------------------|---------|
| A1 | 4/5 | Reasonable. Identified the one real disagreement (MODEL_MAP). |
| A2 | 4/5 | Same framing. Comfortable. |
| A3 (me) | 4/10 | I scored low because I found real bugs beyond the two obvious ones. |
| A4 | 4/5 | Mirrors A1 and A2. |

Three agents gave 4/5. I gave 4/10. The gap is not because I am being contrarian -- it is because I counted bugs that the others did not look for. A 4/5 convergence score is appropriate if you only count the bugs everyone already agrees on. It is inappropriate if you actually stress-test the plan.

---

## The MODEL_MAP Question: Bikeshedding While the House Burns

All four agents spent significant space on whether MODEL_MAP should be duplicated or extracted. This is a three-line constant. The discussion ratio is absurd relative to its impact:

- A1: Full section, concludes "keep duplicated, YAGNI."
- A2: Full section, concludes "extract to agents.ts, import in settings.ts."
- A3 (me): One paragraph, flagged as Low severity.
- A4: One paragraph, says "acceptable for v1."

Meanwhile, the Windows compatibility question -- which could mean the entire hook system is non-functional on our development platform -- got zero discussion from A1, A2, and A4. The group spent more collective words on MODEL_MAP placement than on whether the generated output will execute.

---

## What Should Happen Before Implementation

1. **Systematic import audit.** Do not spot-fix `../analyzer/tokens.js` in three files. Search every file in the plan for this pattern and fix all instances, including `compiler.ts`.

2. **Systematic Parser constructor audit.** Same approach. Every `new Parser(tokens, source)` in the plan must become `new Parser(tokens)`.

3. **Windows hook execution: answer the question.** Either (a) confirm that Claude Code on Windows shells out through Git Bash / WSL and document this assumption, (b) generate platform-appropriate scripts, or (c) use Node.js scripts instead of bash. "Nobody mentioned it" is not an answer.

4. **Verify hook matcher syntax.** Find or create a reference for Claude Code's PostToolUse hook matcher format. A4's unsupported claim is not sufficient.

5. **Fix `toLocaleString()`.** Add `'en-US'` locale parameter. Trivial fix, no reason to skip it.

6. **MODEL_MAP: just pick one and move on.** Either approach works. This does not deserve more discussion.

---

## Final Assessment

The group correctly identified the two build-breaking bugs. That is the minimum bar, and they cleared it. But the treatment was shallow: spot-fix the known instances rather than audit for the pattern. The medium-severity issues I raised -- Windows compatibility, locale dependency, matcher syntax validation -- were largely ignored by the other three agents. This is not adversarial disagreement; these are concrete, testable concerns that received no rebuttal because they received no attention.

The risk is not that we ship with the two critical bugs (everyone agrees on those). The risk is that we ship with hooks that do not execute on Windows, tests that break on non-US-locale CI, and a matcher syntax that was never validated against Claude Code's actual implementation. Those are the bugs that survive consensus.
