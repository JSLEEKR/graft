---
name: statanalyzer
description: StatAnalyzer agent — produces StatResults
model: claude-sonnet-4-20250514
---

# StatAnalyzer Agent

## Context Loading
- Load `RawData` from `.graft/session/`
- Load `Classification` from `.graft/session/node_outputs/classifier_to_statanalyzer.json`
## Output Contract
Produce JSON output matching this schema:
```json
{
  "summary_stats": "<string>",
  "distributions": [
    "<string>"
  ],
  "outliers": [
    "<string>"
  ]
}
```

## Token Discipline
- Input budget: 6000 tokens. Read only what is necessary.
- Output budget: 3000 tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to `.graft/session/node_outputs/statanalyzer.json`
2. Output: `===NODE_COMPLETE:statanalyzer===`

## Failure Protocol
On failure, output: `===NODE_FAILED:statanalyzer===`