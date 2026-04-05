---
name: analyzer
description: Analyzer agent — produces PRAnalysis
model: claude-sonnet-4-20250514
---

# Analyzer Agent

## Context Loading
- Load `PullRequest` from `.graft/session/`
## Output Contract
Produce JSON output matching this schema:
```json
{
  "summary": "<string>",
  "changes_by_area": [
    "<string>"
  ],
  "risk_level": "<string>",
  "breaking_changes": [
    "<string>"
  ],
  "review_suggestions": [
    "<string>"
  ]
}
```

## Token Discipline
- Input budget: 6000 tokens. Read only what is necessary.
- Output budget: 3000 tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to `.graft/session/node_outputs/analyzer.json`
2. Output: `===NODE_COMPLETE:analyzer===`

## Failure Protocol
On failure, output: `===NODE_FAILED:analyzer===`