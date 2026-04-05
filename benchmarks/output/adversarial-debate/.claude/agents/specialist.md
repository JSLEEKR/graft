---
name: specialist
description: Specialist agent — produces SpecialistProposal
model: claude-sonnet-4-20250514
---

# Specialist Agent

## Context Loading
- Load `Task` from `.graft/session/`
- Load `DebateHistory` from `.graft/memory/debatehistory.json`
## Output Contract
Produce JSON output matching this schema:
```json
{
  "approach": "<string>",
  "code": "<string>",
  "domain_insights": [
    "<string>"
  ],
  "convergence_score": 0
}
```

## Token Discipline
- Input budget: 8000 tokens. Read only what is necessary.
- Output budget: 4000 tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to `.graft/session/node_outputs/specialist.json`
2. Output: `===NODE_COMPLETE:specialist===`

## Failure Protocol
On failure, output: `===NODE_FAILED:specialist===`