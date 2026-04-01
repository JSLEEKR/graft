# Graft Compiler — Adversarial Debate Implementation Harness

> This project is implemented via a multi-agent adversarial debate harness.
> For each task, 4 subagents perform independent analysis → cross-critique → convergence before implementation.

## Project Info

- **Goal**: Graft compiler — compile `.gft` → `.claude/` harness structure + runtime execution
- **Language**: TypeScript (hand-written recursive descent parser)
- **Current Version**: v2.0.0 (import system + persistent memory)
- **Spec**: `docs/superpowers/specs/` (per-version spec files)
- **Implementation Plan**: `docs/superpowers/plans/` (per-version plan files)
- **Dev Notes**: `C:\Users\user\OneDrive\Documents\GraftDevNotes\graft-v1-development-notes.md`
- **Blog**: `JSLEEKR/jslee-homepage` → `content/blog/` (one post per version)

## Orchestration Process

**Every task follows these 7 steps:**

```
Step 0: Research (2 agents parallel)
  ↓
Step 1: Independent Analysis (4 agents parallel) — each proposes implementation
  ↓
Step 2: Cross-Critique (4 agents parallel) — 1 forced dissenter dynamically assigned
  ↓
Step 3: Convergence (1 agent) — determine optimal implementation
  ↓
Step 4: Implementation (1 agent) — TDD based on converged design
  ↓
Step 5: Code Review (1 agent) — verify implementation + feedback
  ↓
Step 6: Memory Update (1 agent) — verify common_memory integrity
```

### Agent Isolation Principle

```
Orchestrator (main session)
  │
  ├─ Spawn subagent → pass input → receive result → terminate
  ├─ Direct communication between subagents: ❌
  ├─ Shared memory between subagents: ❌
  ├─ Subagent lifetime: terminate immediately on task completion
  │
  └─ Only shared paths:
       1. harness/common_memory.md — read-only
       2. Previous step artifacts — read-only
       3. Own output — write
```

## Task List (from implementation plan)

| Task | Description | Outputs |
|------|-------------|---------|
| T1 | Project scaffolding | package.json, tsconfig.json, vitest.config.ts |
| T2 | Token types & lexer | src/lexer/, tests/lexer.test.ts |
| T3 | AST type definitions | src/parser/ast.ts |
| T4 | Recursive descent parser | src/parser/parser.ts, tests/parser.test.ts |
| T5 | Analyzer (Scope, Type, Token) | src/analyzer/, tests/analyzer.test.ts |
| T6 | Code generator | src/codegen/, tests/codegen.test.ts |
| T7 | Compiler pipeline & CLI | src/compiler.ts, src/index.ts, tests/integration.test.ts |
| T8 | Final verification & cleanup | Build, E2E tests |

## Per-Task Execution Procedure (orchestrator must follow)

### Step 0: Research (2 agents parallel)

```
Subagent R-Architecture:
  Input: current task description + spec doc + implementation plan
  Role: research architecture patterns from similar compilers/parsers
  Output: harness/tasks/T{N}/step0/research_arch.md

Subagent R-Implementation:
  Input: current task description + spec doc + existing code
  Role: research TypeScript ecosystem patterns, libraries, best practices
  Output: harness/tasks/T{N}/step0/research_impl.md
```

### Step 1: Independent Analysis (4 agents parallel)

```
4 agents independently propose implementation approaches:

A1-Architect:   extensibility, patterns, interface design perspective
A2-Pragmatist:  YAGNI, minimal code, immediately-working perspective
A3-Skeptic:     edge cases, failure modes, security perspective
A4-Specialist:  compiler/parser domain expertise perspective

Each agent input:
  - Task description + code from the implementation plan for this task
  - Step 0 research results (2 files)
  - harness/common_memory.md
  - Existing implementation code (from previous tasks)

Each agent output: harness/tasks/T{N}/step1/agent_{1-4}.md
  Contents:
    - Proposed implementation (with code)
    - Trade-off analysis
    - Potential issues
    - Self-assessed convergence score (1-10)
```

### Step 2: Cross-Critique (4 agents parallel)

```
Forced dissent assignment:
  The agent with the HIGHEST self-assessed convergence score from Step 1
  becomes the Forced Dissenter in Step 2.
  The most agreeable person takes the opposition role to expose
  blind spots in their own confidence.

Each agent input:
  - All Step 1 agent outputs (4 files)
  - Their own Step 1 output
  - Whether they are the forced dissenter

Each agent output: harness/tasks/T{N}/step2/agent_{1-4}.md
  Contents:
    - Critique of each other agent's approach
    - Revised approach (incorporating critiques)
    - Forced dissenter: must include self-rebuttal of their own approach
```

### Step 3: Convergence (1 agent)

```
Subagent Convergence:
  Input: Step 1 + Step 2 outputs + common_memory
  Role: determine optimal implementation
  Output: harness/tasks/T{N}/step3/convergence.md
    Contents:
      - Adopted approach (with code)
      - Accept/reject ruling for each forced dissent argument
      - Implementation spec (concrete code, file paths, tests)
      - Ratchet-locked items (confirmed design decisions)
```

### Step 4: Implementation (1 agent)

```
Subagent Implementer:
  Input: Step 3 convergence result + implementation plan + existing code
  Role: implement converged design via TDD
  Output: actual source code files + test files
  Rules:
    - No ad-hoc additions beyond convergence result
    - Write tests first, verify failure, implement, verify pass
    - Commit
```

### Step 5: Code Review (1 agent)

```
Subagent Reviewer:
  Input: Step 3 convergence result + Step 4 implementation + test results
  Role: verify implementation faithfully reflects convergence result
  Output: harness/tasks/T{N}/step5/review.md
    Contents:
      - PASS / NEEDS_CHANGES verdict
      - Deviations from convergence result
      - Bugs / edge cases found
      - If NEEDS_CHANGES: specific fix instructions

  NEEDS_CHANGES → re-run Step 4 with fix instructions (max 2 retries)
  PASS → memory update → next task
```

### Step 6: Memory Update

```
Orchestrator performs directly:
  1. Extract ratchet items from convergence report + review result
  2. Draft common_memory.md update

Subagent Memory Verifier:
  Input: common_memory draft + source artifacts
  Role: prevent corruption (fabricated claims, distorted feedback)
  Output: verified common_memory.md
```

## Process Modes: CREATE vs DEBUG/FIX

Every step operates in one of two modes with distinct rules.
The orchestrator determines the mode based on context.

### Mode Detection

```
CREATE mode: default for first attempt at any task
DEBUG mode:  triggered when:
  - Step 5 returns NEEDS_CHANGES
  - Tests fail during Step 4
  - A previous debate cycle failed on this task
  - Runtime error encountered during implementation
```

### CREATE Mode Rules (building something new)

```
Step 0 (Research):
  - Broad exploration: look for patterns, alternatives, prior art
  - Output: possibilities and recommendations

Step 1 (Independent Analysis):
  - Each agent proposes a COMPLETE implementation from scratch
  - Must include full code, not patches
  - Freedom to deviate from implementation plan if justified
  - Self-assessed convergence score reflects confidence in the approach

Step 2 (Cross-Critique):
  - Critique focuses on DESIGN CHOICES: "is this the right approach?"
  - Forced dissenter challenges the fundamental premise, not details
  - Goal: find the best design before any code is written

Step 3 (Convergence):
  - Produces a complete implementation spec with full code
  - Ratchet items are NEW locked decisions

Step 4 (Implementation):
  - TDD: write test → verify fail → implement → verify pass
  - Follow convergence spec exactly
  - Commit after each passing test group

Step 5 (Code Review):
  - Review scope: does it match convergence spec?
  - Check: correctness, completeness, test coverage
  - PASS threshold: all convergence requirements met, all tests pass
```

### DEBUG/FIX Mode Rules (repairing something broken)

```
TRIGGER: Step 5 NEEDS_CHANGES or test failure

Step 0 (Research) — SKIPPED in debug mode
  - The problem is in known code, not in missing knowledge

Step 1 (Root Cause Analysis — replaces Independent Analysis):
  - Each agent receives: failing tests, error messages, review feedback
  - Task is NOT "propose a new implementation"
  - Task IS "diagnose WHY it failed"
  - Each agent must:
    1. State the root cause (not symptoms)
    2. Explain the causal chain: input → bug → failure
    3. Propose a MINIMAL fix (smallest change that resolves the root cause)
    4. Explain why this fix doesn't introduce new issues
  - Output format changes: "Root Cause Analysis" instead of "Proposed Implementation"

Step 2 (Fix Critique — replaces Cross-Critique):
  - Critique focuses on DIAGNOSIS ACCURACY: "is this the real root cause?"
  - Each agent reviews others' diagnoses:
    - Does the root cause explain ALL failing tests, not just some?
    - Is the fix truly minimal, or does it over-correct?
    - Does the fix break any existing passing tests?
  - Forced dissenter: must argue the root cause is WRONG and propose alternative
  - Goal: ensure the fix is correct, not just that it silences the error

Step 3 (Fix Convergence — replaces Convergence):
  - Produces a PATCH, not a full rewrite
  - Must include:
    - Confirmed root cause
    - Exact lines to change (file:line format)
    - Before/after for each change
    - Regression test: a test that would have caught this bug
  - MUST NOT: rewrite unrelated code, add features, refactor

Step 4 (Fix Implementation):
  - Apply ONLY the patch from fix convergence
  - Add regression test first, verify it reproduces the bug
  - Apply fix, verify regression test passes
  - Run ALL existing tests, verify no regressions
  - Changes must be atomic — one commit for the fix

Step 5 (Fix Review):
  - Stricter than CREATE review:
    - Is the fix MINIMAL? (reject if unrelated changes included)
    - Does the fix address the ROOT CAUSE, not just symptoms?
    - Are there any tests that pass "by accident" (wrong assertion)?
    - Regression test added? Does it actually test the failure mode?
  - PASS threshold: root cause resolved, no regressions, fix is minimal
```

### Debug Escalation Path

```
Attempt 1: DEBUG mode (Steps 1-5 with fix rules)
  ↓ NEEDS_CHANGES
Attempt 2: DEBUG mode (fresh diagnosis, previous failure in common_memory)
  ↓ NEEDS_CHANGES
Attempt 3: RE-DEBATE — full CREATE mode restart
  - Previous failure causes added to common_memory as "failed approaches"
  - All agents receive the failure history
  - This is a fresh design, not a patch
  ↓ NEEDS_CHANGES (after CREATE Step 5)
Attempt 4: ORCHESTRATOR INTERVENTION
  - Orchestrator resolves directly without subagents
  - Records resolution in common_memory
```

### Mode-Specific Agent Prompt Prefixes

When dispatching agents, the orchestrator MUST prefix the prompt with the mode:

```
CREATE mode prefix:
  "[MODE: CREATE] You are building T{N} from scratch.
   Follow the CREATE rules in CLAUDE.md."

DEBUG mode prefix:
  "[MODE: DEBUG] T{N} implementation failed.
   Failure info: {error messages / review feedback}.
   Follow the DEBUG rules in CLAUDE.md.
   Your task is ROOT CAUSE ANALYSIS, not reimplementation."
```

### Output Path Differentiation

```
CREATE outputs:
  harness/tasks/T{N}/step1/agent_{1-4}.md
  harness/tasks/T{N}/step3/convergence.md

DEBUG outputs (attempt M):
  harness/tasks/T{N}/debug_M/step1/agent_{1-4}.md     ← root cause analyses
  harness/tasks/T{N}/debug_M/step3/fix_convergence.md  ← patch spec
  harness/tasks/T{N}/debug_M/step5/fix_review.md       ← fix review

RE-DEBATE outputs:
  harness/tasks/T{N}/redebate/step1/agent_{1-4}.md     ← fresh proposals
  harness/tasks/T{N}/redebate/step3/convergence.md
```

---

## Version Transition Layer

After each version is released, this layer bridges the gap between versions.
It replaces ad-hoc "what's next?" decisions with a structured debate.

### Full Version Lifecycle

```
┌─────────────────────────────────────────────────┐
│  Version N Development (Per-Task Loop above)    │
│  R1 → R2 → ... → RN (debate rounds)            │
└──────────────────┬──────────────────────────────┘
                   ↓
         Version N Release
         (commit, tag, CHANGELOG, GitHub release)
                   ↓
┌──────────────────────────────────────────────────┐
│  TRANSITION LAYER                                │
│                                                  │
│  Phase 1: Retrospective (2-3 agents parallel)    │
│    ↓                                             │
│  Phase 2: Next Version Harness (1 agent)         │
│    ↓                                             │
│  Phase 3: Dev Notes + Blog (1 agent)             │
└──────────────────┬───────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────┐
│  Version N+1 Development                        │
│  (using harness produced by Phase 2)             │
└──────────────────────────────────────────────────┘
```

### Phase 1: Retrospective (2-3 agents parallel)

```
Triggered: after version release (tag pushed, GitHub release created)

Subagent Retro-Process:
  Input: common_memory.md, all step artifacts from this version,
         CHANGELOG entry, git log for this version
  Role: evaluate the DEVELOPMENT PROCESS
  Questions:
    - Which debate rounds were productive vs overhead?
    - Did the complexity-adaptive scaling (HIGH/MEDIUM/LOW) work?
    - Were forced dissenters effective? Which self-rebuttals mattered?
    - What process bottlenecks or waste existed?
    - What should change in the harness for next version?
  Output: harness/transitions/v{N}→v{N+1}/retro_process.md

Subagent Retro-Technical:
  Input: full source code, test suite, common_memory.md,
         all convergence reports from this version
  Role: evaluate the CODEBASE for next-version improvements
  Questions:
    - What tech debt was introduced or deferred?
    - What patterns emerged that should be formalized?
    - What ratchet decisions should be revisited?
    - What edge cases or failure modes remain unaddressed?
    - What performance/quality issues exist?
  Output: harness/transitions/v{N}→v{N+1}/retro_technical.md

Subagent Retro-Design (optional — spawn when version was architecturally complex):
  Input: spec doc, convergence reports, source code
  Role: evaluate DESIGN DECISIONS and their downstream effects
  Questions:
    - Did any design choice cause unexpected friction in later rounds?
    - Are there abstraction boundaries that should shift?
    - What extension points are needed for the roadmap?
  Output: harness/transitions/v{N}→v{N+1}/retro_design.md
```

### Phase 2: Next Version Harness Creation (1 agent)

```
Subagent Harness-Builder:
  Input:
    - All Phase 1 retrospective outputs
    - Roadmap (from session_state.md or common_memory.md)
    - Current spec + plan docs
    - common_memory.md (ratchet decisions, recurring patterns)
  Role: synthesize retrospective findings + roadmap into a concrete
        development plan for the next version
  Output: 2 files
    1. docs/superpowers/specs/{date}-graft-v{N+1}-design.md
       - Feature spec for next version
       - Incorporates retro findings as constraints/requirements
       - Lists which deferred items from previous versions to address
       - Defines scope boundaries (what's IN vs OUT)

    2. docs/superpowers/plans/{date}-graft-v{N+1}-plan.md
       - Task breakdown with round assignments (R1, R2, ...)
       - Complexity rating per round (HIGH/MEDIUM/LOW)
       - Agent count per round (4-agent debate vs 2-agent vs 1-agent)
       - Explicit list of retro-identified issues to address per round
       - Test targets per round
       - Estimated agent calls

  Rules:
    - MUST reference specific retro findings by ID when incorporating them
    - MUST assign complexity ratings based on how many pipeline stages are touched
    - MUST carry forward unresolved deferred items from common_memory.md
    - MUST NOT scope-creep beyond roadmap + retro findings
```

### Phase 3: Dev Notes + Blog Post (1 agent)

```
Blog Strategy: ONE NEW POST PER VERSION (minor and major).
  Do NOT merge into existing posts. Each version gets its own .mdx file.

Subagent DevNotes-Writer:
  Input:
    - All harness artifacts from the completed version
      (step1-step5 for each round, convergence reports, review results)
    - common_memory.md (ratchet decisions, recurring patterns, stats)
    - CHANGELOG entry for this version
    - Previous dev notes (GraftDevNotes/graft-v1-development-notes.md)
    - Existing blog posts for reference style (jslee-homepage/content/blog/)
  Role: generate dev notes section + a NEW standalone blog post
  Output: harness/transitions/v{N}→v{N+1}/dev_notes_draft.md
    Contents:
      1. New section to APPEND to GraftDevNotes/graft-v1-development-notes.md
         Format: ## v{X.Y}: {Subtitle} ({Month Year})
                 ### What Changed
                 ### Architecture / Key Decisions (or ### The Bugs That Mattered)
                 ### Forced Dissenter Highlights
                 ### Process Evolution (if any)
                 ### Stats table

      2. NEW standalone blog post: graft-v{X}-{Y}-{slug}.mdx
         Format:
           ---
           title: "Graft v{X.Y}: {Descriptive Title}"
           date: "{YYYY-MM-DD}"
           description: "{1-2 sentence summary with key stats}"
           tags: ["graft", "compiler", ...]
           ---
           Self-contained post (~80-150 lines). Should be readable
           WITHOUT having read previous posts. Include:
           - Brief recap of what Graft is (2-3 sentences)
           - What this version adds (with code examples)
           - Most interesting debate outcomes / bugs caught
           - Forced dissenter highlights with self-rebuttal reasoning
           - Stats table
           - "Try it" section with install/run commands

  Naming convention for blog files:
    v1.0 → graft-v1-0-compiler-release.mdx
    v1.1 → graft-v1-1-parallel-foreach.mdx
    v1.2 → graft-v1-2-execution-engine.mdx
    v2.0 → graft-v2-0-imports-memory.mdx
    v2.1 → graft-v2-1-token-tracking.mdx

  Rules:
    - Stats MUST be verified against actual test count (npx vitest run)
      and actual ratchet count (grep common_memory.md)
    - Bug descriptions MUST reference which agent caught them
    - Forced dissenter highlights MUST include the self-rebuttal reasoning
    - Each post MUST be self-contained (no "see previous post" dependencies)
    - Blog files are in jslee-homepage repo (clone/pull before writing)

  After agent completes:
    Orchestrator applies the draft:
    1. Append section to GraftDevNotes/graft-v1-development-notes.md
    2. Create NEW .mdx file in jslee-homepage/content/blog/
    3. Update README.md in graft repo to reflect current version
    4. Commit + push both repos
    5. Do NOT modify existing blog posts

  README Update Rules:
    - Update version number and feature list to match current release
    - Update code examples if new syntax was added (e.g., import, memory, writes)
    - Update "Usage" section with new CLI commands (e.g., graft run)
    - Update "Compiler Architecture" diagram if pipeline changed
    - Update "Project Structure" tree if new directories/files added
    - Update test count in "Development" section
    - Update "Scope" section: move delivered features from Future to Included
    - Keep README concise — link to blog posts for detailed dev notes
```

### Transition Output Structure

```
harness/
├── transitions/
│   ├── v1.2→v2.0/
│   │   ├── retro_process.md
│   │   ├── retro_technical.md
│   │   ├── retro_design.md          ← optional
│   │   └── dev_notes_draft.md
│   ├── v2.0→v2.1/
│   │   ├── retro_process.md
│   │   ├── retro_technical.md
│   │   └── dev_notes_draft.md
│   └── ...
```

### Estimated Agent Calls (Transition Layer)

| Phase | Agents | Note |
|-------|--------|------|
| Phase 1 | 2-3 | parallel, complexity-dependent |
| Phase 2 | 1 | harness builder |
| Phase 3 | 1 | dev notes writer |
| **Total** | **4-5** | per version transition |

### When to Skip Phases

```
Skip Phase 1 (Retro): NEVER — always run retrospective
Skip Retro-Design:    when version was < 3 debate rounds
Skip Phase 2:         NEVER — always generate next version harness
Skip Phase 3:         NEVER — always update dev notes
```

---

## Ratchet Rules

Confirmed design decisions are ratchet-locked:

```
Lock: items marked "confirmed" in convergence reports
Unlock condition: only when code reviewer demands change to that ratchet item
On unlock: item open for re-discussion in next task
Max unlocks per task: 2
```

## Convergence Criteria

```
Task completion:
  - Step 5 review PASS
  - All tests passing
  - All convergence report requirements reflected

Re-debate condition:
  - Step 5 review NEEDS_CHANGES 2 consecutive times
  → Restart from Step 1 (record failure cause in common_memory)
  → Max 1 re-debate, then orchestrator resolves directly
```

## File Structure

```
harness/
├── common_memory.md              ← cumulative across tasks, verified
├── tasks/
│   ├── T1/
│   │   ├── step0/
│   │   │   ├── research_arch.md
│   │   │   └── research_impl.md
│   │   ├── step1/
│   │   │   ├── agent_1.md        ← Architect
│   │   │   ├── agent_2.md        ← Pragmatist
│   │   │   ├── agent_3.md        ← Skeptic
│   │   │   └── agent_4.md        ← Specialist
│   │   ├── step2/
│   │   │   ├── agent_1.md
│   │   │   ├── agent_2.md
│   │   │   ├── agent_3.md
│   │   │   └── agent_4.md
│   │   ├── step3/
│   │   │   └── convergence.md
│   │   └── step5/
│   │       └── review.md
│   ├── T2/ ...
│   └── T8/ ...
```

## Estimated Agent Calls

| Step | Agents | Note |
|------|--------|------|
| Step 0 | 2 | parallel |
| Step 1 | 4 | parallel |
| Step 2 | 4 | parallel |
| Step 3 | 1 | |
| Step 4 | 1 | +1 if review fails |
| Step 5 | 1 | |
| Step 6 | 1 | memory verification |
| **Per task** | **14** | when review passes |
| **8 tasks** | **~112** | total estimate |
