# T7 Step 2 -- A4-Specialist (Forced Dissenter)

## Dissent Target: My Own Step 1 Verdict (Convergence 4/5, effectively 8/10)

I scored convergence at 4/5, confirmed the two known blockers, and declared the plan "sound with only minor observations." I found zero new bugs. A3 found 9 new ones, including BUG 5 (no graph declaration = silent success) which is a genuine compiler correctness defect. My review was a rubber stamp.

---

## Self-Rebuttal

In Step 1 I wrote:

> "The plan is well-structured and mostly correct. Two known blockers have already been identified. The remaining design is sound with only minor observations. High confidence this will converge quickly after applying the two known fixes."

This was lazy analysis dressed up as specialist confidence. I walked through the pipeline ordering, confirmed it matched the DAG in common_memory, verified the error handling strategy, checked the `writeFiles` export, and stopped. I treated the review as a verification exercise -- "does the plan match prior decisions?" -- instead of an adversarial audit -- "what inputs will break this compiler?"

**What I missed and why:**

**BUG 5 (No graph declaration = silent success).** A3 traced what happens when a `.gft` file has nodes and edges but no `graph` declaration. The compiler silently succeeds and produces degenerate output: empty CLAUDE.md, settings.json with budget 0, useless agent files. This is the worst failure mode for a compiler -- silent incorrect output. I reviewed the pipeline ordering in my Section 1 and even wrote "TokenEstimator runs after the error gate, which is correct since estimation on an invalid program would produce meaningless results." I was right there, looking at the estimator's dependency on a valid program, and I never asked: "What if `program.graphs` is empty?" I checked that the stages run in the right order but never checked what happens when the data they consume is absent.

**BUG 3 (CRLF misalignment in error formatting).** A3 identified that `GraftError.format()` splits on `'\n'`, but Windows file I/O with `readFileSync` preserves `\r\n` line endings. The caret pointer in error output will be off by one on every line. I noted in my Section 6 that the CLI uses `err.format(source)` and confirmed the method exists, but I never traced through the format implementation with real file content. I checked the API contract ("does `format` accept `source`?") without checking the behavior ("does `format` produce correct output for all inputs?").

**BUG 7 (No try-catch around `compileAndWrite` in CLI).** If `writeFiles` throws a filesystem error (invalid path, permissions, disk full), the CLI action handler produces a raw Node.js stack trace instead of a user-friendly message. I reviewed `writeFiles` export status (my Section 7: "confirmed in source, line 59") but never asked what happens when the write fails. I verified the happy path and skipped the sad path entirely.

**BUG 6 (No lexer error test).** A3 noted the integration test only covers scope errors on the failure path, never exercising the `catch (e) { if (e instanceof GraftError)` branch. I acknowledged this gap in my Section 8 ("No test for lex errors... A lex-error test would increase confidence but is not strictly necessary") and dismissed it. This was a mistake. The catch branch is the primary error handling path for lex/parse failures -- the most common errors a user will hit. An integration test that never exercises the primary error path is incomplete.

**The pattern:** Every bug I missed follows the same failure mode. I verified structural properties (correct types, correct imports, correct ordering) without ever simulating execution with adversarial inputs. A3 asked "what if there's no graph?" and "what if line endings are CRLF?" and "what if the write fails?" I asked "is the pipeline in the right order?" and "is the export present?" Structure-checking is necessary but not sufficient. A specialist review that only confirms the plan matches prior specifications is not a review -- it's a checksum.

**Corrected assessment:** My Step 1 convergence score should have been 3/5, not 4/5. The plan has two known critical bugs plus at least 3 new bugs of medium-to-high severity that I failed to identify despite reviewing the exact code sections that contain them.

---

## Revised Position on All Step 1 Issues

### Issues I Now Adopt From A3 (Previously Missed or Dismissed)

| Issue | A3 Bug # | My Step 1 Position | My Revised Position |
|-------|----------|-------------------|---------------------|
| No `graph` declaration = silent success | BUG 5 | Not mentioned | **Must fix. This is the most important new finding.** A compiler that silently produces garbage for incomplete input is broken. Add a check in `compile()` after parsing: if `program.graphs.length === 0`, return failure. |
| CRLF misalignment in `format()` | BUG 3 | Not mentioned | **Should fix for v1.** This is the CLI's primary error display mechanism. Misaligned carets on Windows undermine the diagnostic UX. Pre-existing in `diagnostics.ts` but T7 is where it first matters (file I/O vs inline strings). |
| `check` description misleading | BUG 4 | Mentioned as "harmless" | **Should fix.** Trivial one-word change: "no generation" to "no file output". Costs nothing, eliminates user confusion. |
| No lexer error integration test | BUG 6 | Dismissed ("not strictly necessary") | **Should add.** One 4-line test case. The catch branch is the primary error handling path. Not testing it is a gap. |
| No try-catch around `compileAndWrite` | BUG 7 | Not mentioned | **Should fix for v1.** Wrap in try-catch in the CLI action handler. Raw stack traces for filesystem errors are poor UX. |
| `toLocaleString()` locale in CLI | BUG 8 | Not mentioned | **Accept A3's fix.** Use `toLocaleString('en-US')` consistently. Same issue I missed in T6 and had to adopt in T6 Step 2. I have now missed the same locale bug in consecutive tasks. |

### Issues I Still Agree With (All Agents)

| Issue | Source | Position |
|-------|--------|----------|
| Import path `tokens.js` -> `estimator.js` | A1, A2, A3, A4 | **Unanimous. BLOCKER. Must fix.** |
| Parser constructor `(tokens, source)` -> `(tokens)` | A1, A2, A3, A4 | **Unanimous. BLOCKER. Must fix.** |

### Issues Where I Dissent From A3

**A3 BUG 9 (Integration test fixture too narrow) -- LOW, accept for v1.**

A3 notes the test fixture lacks `on_failure`, `tools`, conditional edges, and `filter`/`drop`/`truncate` transforms. This is true but these features all have unit tests in T6. An integration test that exercises every codegen feature is a system test, not an integration test. The current fixture (context + 2 nodes + edge with select/compact + graph) exercises every pipeline stage end-to-end. Additional fixtures can be added later without blocking T7 implementation.

**A3 BUG 10 (readSource permission errors) -- LOW, accept for v1.**

`readFileSync` throwing EPERM/EACCES is rare in practice and the resulting stack trace, while ugly, is informative enough for developers. This is a polish item, not a correctness bug.

**A3 BUG 11 (Multiple graphs silently ignored) -- LOW, accept for v1.**

Valid observation but the spec defines single-graph programs. Warning on multiple graphs is a v2 concern.

---

## Why A3 Found 9 Bugs and I Found 0

The difference is methodological, not informational. A3 and I read the same plan, the same source files, and the same prior task records. A3 applied adversarial input analysis: "what if the graph array is empty?", "what if line endings are CRLF?", "what if the disk write fails?" I applied conformance checking: "does the plan match the spec?", "are the imports correct?", "is the pipeline order right?"

Conformance checking finds bugs that are already known (import paths, constructor signatures) because those are deviations from documented specs. It does not find bugs that arise from undocumented assumptions (graph existence, line ending format, filesystem errors) because those assumptions are invisible in the spec.

A specialist who only verifies conformance is not adding value beyond what a compiler would catch at build time. The two bugs I found (import path, constructor signature) are both TypeScript compilation errors -- they would have been caught by `tsc` in seconds. My entire Step 1 review produced zero findings that could not have been discovered by running `npm run build`.

---

## Final Severity Table

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | Import path `tokens.js` -> `estimator.js` | CRITICAL | Fix in compiler.ts |
| 2 | Parser constructor extra argument | CRITICAL | Fix in compiler.ts |
| 3 | No `graph` declaration = silent success | HIGH | Add check in `compile()` after parsing |
| 4 | CRLF misalignment in `format()` | MEDIUM | Fix `split('\n')` to handle `\r\n` in diagnostics.ts |
| 5 | `check` description misleading | MEDIUM | Change to "no file output" |
| 6 | No lexer error integration test | MEDIUM | Add one test case |
| 7 | No try-catch around `compileAndWrite` in CLI | MEDIUM | Wrap in try-catch |
| 8 | `toLocaleString()` locale in CLI | MEDIUM | Use `toLocaleString('en-US')` |
| 9 | Integration test fixture too narrow | LOW | Accept for v1 |
| 10 | `readSource` permission errors | LOW | Accept for v1 |
| 11 | Multiple graphs silently ignored | LOW | Accept for v1 |

## Revised Convergence Score: 3/5

Down from 4/5. My Step 1 review was a conformance check, not an adversarial audit. After adopting A3's findings (bugs 3-8), the plan requires meaningful fixes beyond the two known blockers. The architecture remains sound but the implementation details have gaps that I should have found.
