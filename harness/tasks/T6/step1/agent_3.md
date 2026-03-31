# A3-Skeptic Review: T6 Code Generator

## Convergence Score: 4/10

The plan has structural soundness but contains multiple concrete bugs that will cause test failures and runtime errors. Several are silent correctness issues that could slip past initial testing.

---

## BUG 1 (Critical): Import path `../analyzer/tokens.js` does not exist

**Files affected:** `codegen.ts`, `orchestration.ts`, `settings.ts`, test file, `compiler.ts`

The plan imports `TokenReport` from `'../analyzer/tokens.js'` in multiple files. Per T5-R02 (LOCKED), the file is `estimator.ts`, not `tokens.ts`. The research documents both flag this explicitly, yet the plan code was not corrected.

```typescript
// Plan writes (WRONG):
import { TokenReport } from '../analyzer/tokens.js';

// Must be:
import { TokenReport } from '../analyzer/estimator.js';
```

This affects: `orchestration.ts` (line 2962), `codegen.ts` (line 3123), `compiler.ts` (line 3219), and `tests/codegen.test.ts` (line 2530). Every single codegen file that references TokenReport will fail to compile.

**Severity:** Build-breaking. Zero tests will pass.

---

## BUG 2 (Critical): `new Parser(tokens, source)` violates T4-R01

**Files affected:** `tests/codegen.test.ts`, `compiler.ts`

T4-R01 (LOCKED): "Parser takes Token[] only." The `parse()` helper in the test file and the `compiler.ts` pipeline both call `new Parser(tokens, source)` with two arguments. The Parser constructor accepts only `Token[]`.

```typescript
// Plan writes (WRONG):
return new Parser(tokens, source).parse();

// Must be:
return new Parser(tokens).parse();
```

This was already flagged in research_impl.md item 4 but not fixed in the plan code.

**Severity:** Build-breaking. TypeScript will reject the extra argument under strict mode.

---

## BUG 3 (Medium): Hook filename inconsistency between `hooks.ts` and `settings.ts`

In `hooks.ts`, the generated script is written to a path built by `codegen.ts`:
```
.claude/hooks/${source}-to-${target}.sh
```
(using hyphens: `researcher-to-writer.sh`)

In `settings.ts`, the hook command references:
```
.claude/hooks/${source}-to-${target}.sh
```

These happen to match -- **no bug here on closer inspection**. However, the `settings.ts` hook uses a `matcher` pattern:
```
Write(.graft/session/node_outputs/${source}.json)
```

This assumes Claude Code's PostToolUse hook matcher syntax supports `Write(path)` patterns. If the actual matcher syntax differs (e.g., requires regex, or uses a different format), all hooks will silently never fire. The plan provides no validation or documentation of what matcher syntax Claude Code actually expects. This is a correctness risk.

---

## BUG 4 (Medium): `generateHook` jq expression for hello.gft is incorrect for `select` + `compact`

Mental trace with hello.gft's edge `Researcher -> Writer | select(findings) | compact`:

1. `select(findings)` adds `"findings"` to `selectFields`
2. `compact` sets `isCompact = true`
3. `parts` becomes `['{findings: .findings}']`
4. `expression` becomes `'{findings: .findings}'`
5. With compact: `expression` becomes `-c '{findings: .findings}'`
6. Final output: `jq -c '{findings: .findings}' "$INPUT" > "$OUTPUT"`

This is actually valid jq. The select projection `{findings: .findings}` extracts the `findings` field. The `-c` flag compacts. This part checks out.

However, there is a subtle issue: the test on line 2619 asserts `expect(sh).toContain('a.json')` but the generated filename uses `source.toLowerCase()` which for node "A" produces `a.json`. That works. But for the hello.gft example, the Researcher node would produce `researcher.json` and the transformed output `researcher_to_writer.json`. The orchestration file (line 2986) references this transformed file correctly. **No bug in the jq itself.**

---

## BUG 5 (Medium): YAML frontmatter `tools` format may be invalid

The agent frontmatter generates:
```yaml
---
name: researcher
model: claude-sonnet-4-20250514
tools: [Read, Write, Edit, Bash]
---
```

YAML flow sequences require quoted strings if values contain special characters, but `Read`, `Write`, `Edit`, `Bash` are plain scalars -- this is valid YAML. However, the question is whether Claude Code's agent markdown parser expects this format. If it expects a YAML list (one item per line with `-`), this would fail. The plan does not document what format Claude Code expects for the `tools` frontmatter key.

For nodes with **no tools** (like Researcher and Writer in hello.gft), `node.tools` is `[]`, producing `tools: []` which is valid empty YAML list. This is fine.

---

## BUG 6 (Medium): `compiled_at` timestamp makes tests non-deterministic

`generateSettings()` calls `new Date().toISOString()` at line 3098. The test on line 2699 calls `generateSettings(program, 'test.gft')` and asserts on specific fields but does NOT assert on `compiled_at`. So the current tests will pass.

However, any future snapshot test or full-output comparison will be flaky. The research notes both flag this. The fix is to accept a timestamp parameter or mock `Date` in tests.

**Severity:** Low for now (tests don't assert on it), but a latent issue.

---

## BUG 7 (Medium): Windows compatibility -- `#!/bin/bash` shell scripts

The generated hook scripts use `#!/bin/bash` and `set -euo pipefail`. On Windows (which is the development platform per the environment), these scripts will not execute natively. The PostToolUse hooks in `settings.json` reference `.sh` files:
```json
{"matcher": "Write(...)", "command": ".claude/hooks/researcher-to-writer.sh"}
```

On Windows, executing `.sh` files requires Git Bash, WSL, or similar. Claude Code on Windows may or may not handle this -- the plan does not address it. If Claude Code shells out via `cmd.exe`, the hooks will fail.

**Possible fixes:**
1. Generate both `.sh` and `.ps1` / `.cmd` variants
2. Use `node` scripts instead of bash (since Node.js is guaranteed available)
3. Prefix the command with `bash` explicitly: `bash .claude/hooks/researcher-to-writer.sh`

**Severity:** Medium. Will fail on Windows unless Claude Code uses Git Bash internally.

---

## BUG 8 (Low): `toLocaleString()` is locale-dependent

`orchestration.ts` uses `toLocaleString()` for number formatting (line 2995, 3006-3008):
```typescript
${graph.budget.toLocaleString()} tokens
```

On a machine with locale `de-DE`, this produces `6.000 tokens` instead of `6,000 tokens`. The test asserts `expect(md).toContain('6,000')` which would fail on non-US locales.

**Fix:** Use a fixed locale: `graph.budget.toLocaleString('en-US')`.

**Severity:** Low in practice (CI and dev machine likely use en-US), but technically non-portable.

---

## BUG 9 (Low): `writeFiles()` handles nested directories correctly

The plan uses `fs.mkdirSync(path.dirname(fullPath), { recursive: true })` before each write. This correctly handles nested paths like `.claude/agents/` and `.graft/session/node_outputs/`. The `recursive: true` flag is safe for already-existing directories. **No bug here.**

---

## BUG 10 (Low): MODEL_MAP duplication

`MODEL_MAP` is duplicated in `agents.ts` and `settings.ts`. Both research documents flag this. If a model version is updated in one file but not the other, agents and settings will disagree on model strings. Should be extracted to a shared constant.

**Severity:** Low (maintenance risk, not a runtime bug).

---

## BUG 11 (Low): `generateOrchestration` only considers immediate predecessor for input source

The orchestration generator (line 2983) only looks at `graph.flow[i-1]` for the input source of step `i`. This is correct for v1 where flow is strictly sequential. But if a node reads from a non-predecessor (e.g., node C reads from node A's output, skipping B), the orchestration markdown will show the wrong input path. The analyzer's scope checker should catch invalid reads, so this is acceptable for v1 but worth noting.

---

## Summary of Required Fixes Before Implementation

| # | Severity | Fix |
|---|----------|-----|
| 1 | Critical | Change all `../analyzer/tokens.js` imports to `../analyzer/estimator.js` |
| 2 | Critical | Change `new Parser(tokens, source)` to `new Parser(tokens)` everywhere |
| 7 | Medium | Address Windows `.sh` script execution (at minimum document the requirement) |
| 8 | Low | Use `toLocaleString('en-US')` for deterministic number formatting |
| 10 | Low | Extract MODEL_MAP to shared location |

Bugs 1 and 2 are build-breaking and will prevent any tests from passing. These must be fixed before implementation begins.
