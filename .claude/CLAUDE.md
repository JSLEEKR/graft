# Graft Compiler — Adversarial Debate Implementation Harness

> This project is implemented via a multi-agent adversarial debate harness.
> For each task, 4 subagents perform independent analysis → cross-critique → convergence before implementation.

## Project Info

- **Goal**: Graft compiler v1 — compile `.gft` → `.claude/` harness structure
- **Language**: TypeScript (hand-written recursive descent parser)
- **Spec**: `docs/superpowers/specs/2026-03-31-graft-compiler-v1-design.md`
- **Implementation Plan**: `docs/superpowers/plans/2026-03-31-graft-compiler-v1.md`

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
