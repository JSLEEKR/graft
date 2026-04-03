# M1: "You can install it and run it" — COMPLETE

> Completed 2026-04-03. Published as `@jsleekr/graft@5.7.2`.

## Checklist

- [x] **M1-2: Claude Code output verification** (P0, FIRST)
  - [x] Deploy `graft compile examples/hello.gft` output to a real Claude Code project
  - [x] Verify Claude Code recognizes `.claude/agents/*.md` frontmatter
  - [x] Verify `.claude/settings.json` matches Claude Code settings format
  - [x] Verify `.js` hook files execute correctly (Node.js, cross-platform)
  - [x] Verify Claude Code follows `CLAUDE.md` orchestration instructions
  - [x] Fix mismatches (v5.1: hook format, v5.2: parallel edge transforms)
  - [x] 2-node pipeline (hello.gft) e2e success
  - [x] 4-node parallel pipeline (code-review.gft) codegen verification (v5.3)
  - [x] Memory pipeline (chatbot.gft) codegen verification (v5.3)

- [x] **M1-4: e2e demo**
  - [x] hello.gft compile → Claude Code execution → output recorded
  - [x] `graft init demo` → compile → Claude Code e2e success (v5.7)

- [x] **M1-1: npm publish**
  - [x] Published under `@jsleekr/graft` scope (npm org `graft-lang` pending, moved to M2)
  - [x] `npm publish --access public` success (v5.7.1, v5.7.2)
  - [x] `npm install -g @jsleekr/graft && graft --version` verified

- [x] **M1-3: README rewrite**
  - [x] Restructured around "10-minute Getting Started"
  - [x] Includes actual execution output
  - [x] Scenario-based instead of feature-listing

- [x] **M1-6: `graft init`**
  - [x] `graft init <name>` → scaffold generation (v5.1)
  - [x] Generated project immediately compilable with `graft compile`

- Moved to M2: **M1-5: VS Code extension marketplace**

## e2e Verification Results

### graft init demo (2-node sequential, v5.7)
- `graft init demo && cd demo && graft compile pipeline.gft` PASS
- Claude Code reads CLAUDE.md and executes pipeline PASS
- Analyst(Sonnet) → edge transform(select+compact) → Reviewer(Haiku) PASS
- Full pipeline auto-execution, no manual intervention PASS

### code-review.gft (4-node parallel, v5.3)
- Codegen-level verification PASS

### chatbot.gft (memory + imports, v5.3)
- Codegen-level verification PASS
